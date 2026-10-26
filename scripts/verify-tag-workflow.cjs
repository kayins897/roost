// Focused tag workflow acceptance. Only synthetic data and isolated browser contexts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const dist = path.resolve(process.env.QIYU_TAG_DIST || path.join(root, 'dist'));
const output = path.join(root, 'evidence', 'tag-workflow');
const version = process.env.QIYU_TAG_VERSION || require('../package.json').version;
const sha = value => createHash('sha256').update(value).digest('hex');
const report = {
  passed: false, version, isolatedDataOnly: true, userLibraryAccessed: false,
  checks: [], screenshots: [], integrity: [], layouts: [], errors: [], blockedRequests: [],
  notes: ['browser 使用真实 LocalStorageRepository；bridge 使用真实 DesktopRepository 加合成内存桥。',
    '仅加载本地生产构建、现场生成的合成封面；不读取真实 AppData、账号或游戏库存。',
    '本专项验证界面与仓储契约，不代替原生文件系统、真实网络或发行包验收。'],
};
const work = (id, title, groups, extra = {}) => ({
  id, title, category: 'game', subcategory: 'Steam', platforms: ['Steam'], creator: '合成作者', year: '2025',
  status: 'want', gamePlayState: 'want', experienceStatus: 'unplayed', playtimeMinutes: 73,
  playPriority: 'A', personalGrade: 'S', completion: 'cleared', completionCount: 2,
  tags: [...new Set(Object.values(groups).filter(Array.isArray).flat())], gameTags: groups,
  impression: `合成印象${id}`, review: '长文必须完整保留\n尾部空格  ', favorite: false, artwork: 'outer',
  experienceEntries: [{ id: `entry-${id}`, kind: 'note', date: '2025-12', note: '普通日志不能当通关' }],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', futureItem: { keep: id }, ...extra,
});
const fixture = { schemaVersion: 1, futureRoot: { keep: ['原文', 0] }, items: [
  work('a', '标签 Alpha', { gameplay: ['动作', '共享'], theme: ['共享'], scenario: [], other: [], futureGroup: { keep: ['扩展'] } }),
  work('b', '标签 Beta', { gameplay: ['Roguelike', '动作'], theme: ['科幻'], scenario: ['联机'], other: ['短流程'] }),
  work('c', '无关 Gamma', { gameplay: ['解谜'], theme: [], scenario: [], other: [] }),
  work('hidden', '历史隐藏 Delta', { gameplay: ['隐藏专属'], theme: [], scenario: [], other: [] }, { hiddenAt: '2026-01-02T00:00:00Z' }),
  work('trash', '回收 Epsilon', { gameplay: ['回收专属'], theme: [], scenario: [], other: [] }, { removedAt: '2026-01-02T00:00:00Z' }),
  work('book', '书籍 Zeta', { gameplay: [], theme: [], scenario: [], other: [] }, { category: 'book', tags: ['书籍专属'], gameTags: undefined }),
] };
let browser, server, base, context, page, mode, stage;
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const storeKey = () => mode === 'bridge' ? 'qiyu.test.tag-workflow' : 'qiyu.library.v1';
const raw = () => page.evaluate(key => localStorage.getItem(key), storeKey());
const data = async () => JSON.parse(await raw());
const item = async id => (await data()).items.find(value => value.id === id);
const attempts = () => page.evaluate(() => window.__tagWorkflowAttempts);
const fail = value => page.evaluate(value => { window.__tagWorkflowFail = value; }, value);
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const card = id => {
  const title = escapeRegex(fixture.items.find(value => value.id === id).title);
  return page.getByRole('button', { name: new RegExp(`^(?:查看${title}详情|(?:取消)?选择${title})$`) });
};
async function check(name, run) { stage = `${mode}: ${name}`; await run(); report.checks.push(stage); console.log(`PASS ${stage}`); }
async function capture(name) {
  await page.evaluate(() => document.fonts.ready);
  const file = `${mode}-${name}.png`;
  await page.screenshot({ path: path.join(output, file), animations: 'disabled', caret: 'hide' }); report.screenshots.push(file);
}
async function unchanged(name, before, count) {
  const after = await raw(); assert.equal(after, before, name);
  if (count !== undefined) assert.equal(await attempts(), count, `${name} 不得尝试保存`);
  report.integrity.push({ mode, name, sha256: sha(after), unchanged: true });
}
function preserve(before, after, allowedIds, allowedKeys) {
  assert.deepEqual(after.futureRoot, before.futureRoot);
  assert.deepEqual(after.items.map(value => value.id), before.items.map(value => value.id));
  for (const original of before.items) {
    const updated = after.items.find(value => value.id === original.id);
    for (const key of new Set([...Object.keys(original), ...Object.keys(updated)])) {
      if (!allowedIds.includes(original.id) || !allowedKeys.includes(key)) assert.deepEqual(updated[key], original[key], `${original.id}.${key}`);
    }
    if (original.gameTags?.futureGroup) assert.deepEqual(updated.gameTags.futureGroup, original.gameTags.futureGroup, '未知标签扩展必须保留');
  }
}
function serve() {
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
  server = http.createServer((req, res) => {
    let file; try { const name = new URL(req.url, 'http://127.0.0.1').pathname; file = path.resolve(dist, '.' + decodeURIComponent(name === '/' ? '/index.html' : name)); } catch { res.writeHead(400); return res.end(); }
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}
async function prepare(currentMode) {
  mode = currentMode;
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.addInitScript(({ fixture, mode, version }) => {
    const key = mode === 'bridge' ? 'qiyu.test.tag-workflow' : 'qiyu.library.v1', set = Storage.prototype.setItem;
    if (!localStorage.getItem(key)) {
      for (const work of fixture.items) {
        const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 240;
        const paint = canvas.getContext('2d'), gradient = paint.createLinearGradient(0, 0, 160, 240);
        gradient.addColorStop(0, '#37576b'); gradient.addColorStop(1, '#15202c'); paint.fillStyle = gradient; paint.fillRect(0, 0, 160, 240);
        paint.fillStyle = '#e4cb9b'; paint.beginPath(); paint.arc(112, 62, 24, 0, Math.PI * 2); paint.fill();
        paint.fillStyle = '#e9e4d8'; paint.font = '18px sans-serif'; paint.fillText('ROOST', 18, 190); paint.font = '10px sans-serif'; paint.fillText('SYNTHETIC ' + work.id.toUpperCase(), 18, 212);
        work.coverUrl = canvas.toDataURL('image/png');
      }
      set.call(localStorage, key, JSON.stringify(fixture));
    }
    set.call(localStorage, 'qiyu.background.v1', JSON.stringify({ enabled: false, fluidEnabled: false, starsEnabled: false }));
    set.call(localStorage, 'qiyu.appearance.v1', JSON.stringify({ mode: 'dark' }));
    window.__tagWorkflowFail = false; window.__tagWorkflowAttempts = 0;
    if (mode === 'bridge') {
      let revision = 'tag-workflow-0', number = 0;
      window.qiyuDesktop = {
        getInfo: () => ({ version, dataDirectory: 'ISOLATED_MEMORY_ONLY', windowVisible: true }),
        loadLibrary: () => ({ ok: true, value: { snapshot: JSON.parse(localStorage.getItem(key)), revision } }),
        saveLibrary: (snapshot, expected) => {
          window.__tagWorkflowAttempts++;
          if (window.__tagWorkflowFail) return { ok: false, error: '合成标签保存失败' };
          if (expected !== revision) return { ok: false, error: '隔离修订冲突' };
          set.call(localStorage, key, JSON.stringify(snapshot)); revision = `tag-workflow-${++number}`;
          return { ok: true, value: { revision } };
        }, onWindowVisibility: () => () => {},
      };
    } else Storage.prototype.setItem = function(name, value) {
      if (name === key) { window.__tagWorkflowAttempts++; if (window.__tagWorkflowFail) throw new DOMException('合成标签保存失败', 'QuotaExceededError'); }
      return set.call(this, name, value);
    };
  }, { fixture, mode, version });
  page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.errors.push({ stage, message: error.message }));
  page.on('dialog', dialog => dialog.accept());
  await page.route('**/*', route => {
    const url = route.request().url();
    if (new URL(url).origin === base || url.startsWith('data:')) return route.continue();
    report.blockedRequests.push(url); return route.abort();
  });
  await page.goto(base); await page.getByRole('heading', { name: '游戏', exact: true }).waitFor(); await showAll();
}
async function showAll() {
  const filters = page.getByRole('group', { name: '按体验分类筛选', exact: true });
  for (const name of ['新作开荒', '已体验']) { const target = button(name, filters); if (await target.getAttribute('aria-pressed') !== 'true') await target.click(); }
  await page.getByRole('textbox', { name: '搜索收藏', exact: true }).fill('');
}
async function editTags(id = 'a') {
  await card(id).click({ button: 'right' });
  const menu = page.getByRole('menu', { name: `${fixture.items.find(value => value.id === id).title}快捷编辑`, exact: true });
  assert.equal(await menu.getByRole('menuitem', { name: '隐藏作品', exact: true }).count(), 0, '普通右键无新增隐藏入口');
  await menu.getByRole('menuitem', { name: '编辑标签', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '编辑标签', exact: true }); await dialog.waitFor(); return dialog;
}
const choices = (dialog, group) => dialog.getByRole('group', { name: `${group}可选标签`, exact: true });
const assignment = () => page.getByRole('region', { name: '分配标签', exact: true });
async function newAssignment(name = '周末联机') {
  await button('新增标签', page.locator('.tag-panel')).click();
  const dialog = page.getByRole('dialog', { name: '新增标签', exact: true }); await dialog.waitFor();
  await dialog.getByRole('combobox', { name: '分组', exact: true }).selectOption('scenario');
  await dialog.getByRole('textbox', { name: '新标签', exact: true }).fill(name);
  await button('选择要添加的作品', dialog).click(); await assignment().waitFor(); return assignment();
}
async function existingAssignment(name) {
  await button('收录作品').first().click(); await button('整理标签').click();
  const manager = page.getByRole('dialog', { name: '管理标签', exact: true }); await manager.waitFor();
  const row = manager.locator('.manage-tag-row').filter({ has: page.getByText(name, { exact: true }) });
  await button('分配作品', row).click(); await assignment().waitFor(); return assignment();
}
async function layout(target, name) {
  const geometry = await target.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { viewport: [innerWidth, innerHeight], pageWidth: document.documentElement.scrollWidth, rect: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom }, width: element.clientWidth, scrollWidth: element.scrollWidth };
  });
  report.layouts.push({ mode, name, ...geometry });
  assert.ok(geometry.pageWidth <= geometry.viewport[0] + 1, `${name} 页面不得横向溢出`);
  assert.ok(geometry.rect.x >= -1 && geometry.rect.right <= geometry.viewport[0] + 1 && geometry.rect.y >= -1 && geometry.rect.bottom <= geometry.viewport[1] + 1, `${name} 必须在可视区内`);
  assert.ok(geometry.scrollWidth <= geometry.width + 1, `${name} 不得内部横向溢出`);
}
async function actionVisible(bar, name) {
  const action = bar.locator('.button--primary');
  const hit = await action.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const foreground = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { rect: { x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom }, unobscured: foreground === element || element.contains(foreground) };
  });
  assert.equal(hit.unobscured, true, `${name} 应用按钮不能被浮层遮挡`);
  report.layouts.push({ mode, name, ...hit });
}
async function suite(currentMode) {
  await prepare(currentMode);
  await check('右键选已有标签、跨组独立、排除隐藏回收供给，取消零写入', async () => {
    const before = await raw(), count = await attempts(), dialog = await editTags();
    assert.equal(await button('动作', choices(dialog, '玩法')).getAttribute('aria-pressed'), 'true');
    assert.equal(await button('Roguelike', choices(dialog, '玩法')).getAttribute('aria-pressed'), 'false');
    assert.equal(await button('隐藏专属', dialog).count(), 0); assert.equal(await button('回收专属', dialog).count(), 0); assert.equal(await button('书籍专属', dialog).count(), 0);
    await button('Roguelike', choices(dialog, '玩法')).click();
    await button('共享', choices(dialog, '题材')).click();
    assert.equal(await button('共享', choices(dialog, '玩法')).getAttribute('aria-pressed'), 'true');
    assert.equal(await button('共享', choices(dialog, '题材')).getAttribute('aria-pressed'), 'false');
    await unchanged('标签选择只改草稿', before, count); await layout(dialog, 'picker-wide'); await capture('picker-wide');
    await button('取消', dialog).click(); await dialog.waitFor({ state: 'hidden' }); await unchanged('取消编辑', before, count);
  });
  await check('标签输入去重、保存失败原位重试、未知字段保留并重载读回', async () => {
    const before = await data(), original = await raw(), dialog = await editTags();
    await dialog.getByRole('textbox', { name: '玩法', exact: true }).fill('动作、共享、肉鸽、 roguelike，ROGUELIKE');
    await button('共享', choices(dialog, '题材')).click();
    assert.equal(await button('Roguelike', choices(dialog, '玩法')).getAttribute('aria-pressed'), 'true', '大小写一致识别已选择');
    await fail(true); await button('保存', dialog).click(); assert.equal(await dialog.isVisible(), true); await unchanged('标签保存失败', original);
    await fail(false); await button('保存', dialog).click(); await dialog.waitFor({ state: 'hidden' });
    const after = await data(); preserve(before, after, ['a'], ['gameTags', 'tags', 'updatedAt']);
    assert.deepEqual((await item('a')).gameTags.gameplay, ['动作', '共享', '肉鸽', 'roguelike']); assert.deepEqual((await item('a')).gameTags.theme, []);
    const saved = await raw(); await page.reload(); await showAll(); await unchanged('标签重载读回', saved, 0);
  });
  await check('创建标签进入专用分配栏、普通多选无隐藏，取消不生成空标签', async () => {
    const before = await raw(), count = await attempts(); const bar = await newAssignment();
    assert.equal(await bar.getByRole('combobox').count(), 0, '分配标签不混入状态或等级下拉');
    for (const name of ['隐藏', '移到回收站', '应用等级', '退出多选']) assert.equal(await button(name, bar).count(), 0);
    assert.equal(await button('添加到 0 款', bar).isDisabled(), true);
    await card('a').click(); await layout(bar, 'assignment-wide'); await actionVisible(bar, 'assignment-action-wide'); await capture('assignment-wide');
    await button('取消分配', bar).click(); await bar.waitFor({ state: 'hidden' }); await unchanged('取消分配不创建空标签', before, count);
    await button('批量编辑游戏').click(); const generic = page.locator('.selection-actionbar');
    assert.equal(await button('隐藏', generic).count(), 0); assert.equal(await button('添加标签', generic).count(), 1); assert.equal(await button('移除标签', generic).count(), 1);
    await button('退出多选', generic).click(); await unchanged('浏览普通多选', before, count);
  });
  await check('跨筛选分配清楚显示范围，保存失败保留选择并仅修改指定作品', async () => {
    const before = await data(), original = await raw(), bar = await newAssignment();
    await card('a').click(); await page.getByRole('textbox', { name: '搜索收藏', exact: true }).fill('Beta'); await card('b').click();
    assert.match(await bar.innerText(), /已选择 2 件/); assert.match(await bar.innerText(), /1 件不在当前结果中/);
    await fail(true); await button('添加到 2 款', bar).click(); await bar.getByRole('alert').waitFor();
    assert.equal(await bar.isVisible(), true); assert.match(await bar.innerText(), /已选择 2 件/); await unchanged('分配保存失败', original);
    await fail(false); await button('添加到 2 款', bar).click(); await bar.waitFor({ state: 'hidden' });
    preserve(before, await data(), ['a', 'b'], ['gameTags', 'tags', 'updatedAt']);
    assert.deepEqual((await item('a')).gameTags.scenario, ['周末联机']); assert.deepEqual((await item('b')).gameTags.scenario, ['联机', '周末联机']);
    const saved = await raw(); await page.reload(); await showAll(); await unchanged('分配重载读回', saved, 0);
  });
  await check('已有标签同值禁用，切换移除方式只移除指定分组且取消无写入', async () => {
    const before = await data(), original = await raw(), count = await attempts(); let bar = await existingAssignment('周末联机');
    await card('a').click(); await card('b').click(); assert.equal(await button('添加到 0 款', bar).isDisabled(), true);
    await button('移除标签', bar.getByRole('group', { name: '分配方式', exact: true })).click();
    assert.equal(await button('从 2 款移除', bar).isEnabled(), true); await unchanged('分配方式切换不写库', original, count);
    await button('取消分配', bar).click(); await unchanged('取消移除保持标签', original, count);
    bar = await existingAssignment('周末联机'); await card('a').click();
    await button('移除标签', bar.getByRole('group', { name: '分配方式', exact: true })).click(); await button('从 1 款移除', bar).click(); await bar.waitFor({ state: 'hidden' });
    preserve(before, await data(), ['a'], ['gameTags', 'tags', 'updatedAt']); assert.deepEqual((await item('a')).gameTags.scenario, []); assert.deepEqual((await item('b')).gameTags.scenario, ['联机', '周末联机']);
  });
  await check('窄窗已有标签与专用分配栏可见、可操作且取消零写', async () => {
    const before = await raw(), count = await attempts(); await page.setViewportSize({ width: 390, height: 844 });
    const dialog = await editTags(); await layout(dialog, 'picker-narrow'); await capture('picker-narrow'); await button('取消', dialog).click(); await dialog.waitFor({ state: 'hidden' });
    const bar = await newAssignment('适合周末与朋友共同探索的长标签'); await card('a').click(); await layout(bar, 'assignment-narrow'); await actionVisible(bar, 'assignment-action-narrow'); await capture('assignment-narrow');
    await button('取消分配', bar).click(); await unchanged('窄窗取消分配', before, count); await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check('历史隐藏数据仍能从设置恢复，不重新开放隐藏入口', async () => {
    const before = await data(), original = await raw(), count = await attempts();
    await card('a').click(); const detail = page.getByRole('dialog', { name: '标签 Alpha详情', exact: true });
    await button('展开作品资料', detail).click(); assert.equal(await button('隐藏作品', detail).count(), 0); await button('关闭详情', detail).click();
    await button('数据与设置').click(); const settings = page.getByRole('dialog', { name: '数据与设置', exact: true });
    await button('数据与备份', settings).click(); await button('查看', settings).click(); await card('hidden').waitFor(); await unchanged('查看历史隐藏只读', original, count);
    await card('hidden').click({ button: 'right' }); const menu = page.getByRole('menu', { name: '历史隐藏 Delta快捷编辑', exact: true });
    await menu.getByRole('menuitem', { name: '取消隐藏', exact: true }).click();
    preserve(before, await data(), ['hidden'], ['hiddenAt', 'updatedAt']); assert.equal((await item('hidden')).hiddenAt, undefined);
  });
  await context.close(); context = null;
}
(async () => {
  try {
    fs.mkdirSync(output, { recursive: true });
    assert.ok(fs.existsSync(path.join(dist, 'index.html')), '先生成生产 dist，或设置 QIYU_TAG_DIST');
    base = await serve(); browser = await chromium.launch({ channel: 'msedge', headless: true });
    await suite('browser'); await suite('bridge'); assert.deepEqual(report.errors, []); report.passed = true;
  } catch (error) { report.failure = { stage, message: error.message, stack: error.stack }; process.exitCode = 1; console.error(error.stack);
    if (page && !page.isClosed()) await capture('failure').catch(() => {});
  } finally {
    if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve));
    report.timestamp = new Date().toISOString(); report.distAssets = fs.existsSync(path.join(dist, 'assets')) ? fs.readdirSync(path.join(dist, 'assets')).filter(name => /\.(css|js)$/.test(name)).map(name => ({ file: name, sha256: sha(fs.readFileSync(path.join(dist, 'assets', name))) })) : [];
    fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, screenshots: report.screenshots.length, failure: report.failure }));
  }
})();
