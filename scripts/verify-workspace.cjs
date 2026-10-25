const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const output = path.join(root, 'evidence', `workspace-v${version.replaceAll('.', '')}`);
const report = { passed: false, version, isolatedDataOnly: true, checks: [], integrity: [], screenshots: [], layouts: [], materials: [], confirmations: [], pageErrors: [], resourceErrors: [], notes: [
  '独立无持久化 Edge 上下文，只加载本地 dist 与合成收藏；不读取真实目录、用户配置或控制用户窗口。',
  'browser 使用真实 LocalStorageRepository；bridge 使用真实 DesktopRepository 加隔离内存桥接，不替代原生文件写入测试。',
  '删除确认明确验证取消与接受；保存失败仅注入本测试上下文，所有外部网络均拦截。',
] };
const work = (id, title, extra = {}) => ({ id, title, category: 'game', subcategory: 'Steam', creator: '隔离测试开发者', year: '2024', status: 'want', gamePlayState: 'want', playtimeMinutes: 73,
  tags: ['动作'], gameTags: { gameplay: ['动作'], theme: [], scenario: [], other: [], futureGroup: ['保留分组'] }, impression: `保留 ${title} 的感受`, favorite: false, artwork: 'hollow',
  createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', futureItem: { keep: title }, ...extra });
const fixture = { schemaVersion: 1, futureRoot: { keep: '未知根字段' }, items: [
  work('a', '旅程 A', { externalIds: [{ provider: 'steam', id: '123' }], experienceEntries: [{ id: 'e', date: '2026-01', kind: 'note', note: '亲手记录' }] }),
  work('b', '同乐 B', { artwork: 'hades', status: 'active', gamePlayState: 'playing', playtimeMinutes: 1337 }),
  work('c', '深空 C', { artwork: 'outer', status: 'finished', gamePlayState: 'cleared', playtimeMinutes: 720 }),
  work('d', '稍后 D', { artwork: 'dave', status: 'paused', gamePlayState: 'paused', playtimeMinutes: 99 }),
  work('book', '阅读样例', { category: 'book', subcategory: '文学', gamePlayState: undefined, gameTags: undefined, playtimeMinutes: undefined }),
] };
const baseline = JSON.stringify(fixture), sha = value => createHash('sha256').update(value).digest('hex');
report.distAssets = [...fs.readFileSync(path.join(dist, 'index.html'), 'utf8').matchAll(/(?:src|href)="((?:\.\/|\/)?assets\/[^"]+\.(?:js|css))"/g)].map(m => ({ path: m[1], sha256: sha(fs.readFileSync(path.join(dist, m[1]))) }));
let browser, server, base, context, page, mode, stage, acceptNext = true;
fs.mkdirSync(output, { recursive: true });
async function serve() {
  assert.ok(fs.existsSync(path.join(dist, 'index.html')), '请先构建 dist');
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
  server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://127.0.0.1').pathname;
    if (name === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    let file; try { file = path.resolve(dist, '.' + decodeURIComponent(name === '/' ? '/index.html' : name)); } catch { res.writeHead(400); res.end(); return; }
    if (!file.startsWith(dist + path.sep)) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)); });
}
async function check(name, fn) { stage = `${mode}: ${name}`; await fn(); report.checks.push(stage); console.log(`PASS ${stage}`); }
const raw = () => page.evaluate(key => localStorage.getItem(key), mode === 'bridge' ? 'qiyu.test.workspace.library' : 'qiyu.library.v1');
const data = async () => JSON.parse(await raw());
const byId = (value, id) => value.items.find(item => item.id === id);
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const detail = () => page.getByRole('dialog', { name: '旅程 A详情', exact: true });
const search = () => page.getByRole('textbox', { name: '搜索收藏', exact: true });
const bar = () => page.locator('.selection-actionbar');
async function all() { await button('全部游戏', page.locator('.library-views')).click(); await search().fill(''); }
async function menu(title) {
  await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(60); await button(`查看${title}详情`).click({ button: 'right' }); return page.getByRole('menu', { name: `${title}快捷编辑`, exact: true }); }
async function unchanged(name, before) { const after = await raw(); report.integrity.push({ mode, name, same: before === after, beforeSha256: sha(before), afterSha256: sha(after), beforeBytes: Buffer.byteLength(before), afterBytes: Buffer.byteLength(after) }); assert.equal(after, before, name); }
async function capture(name) { await page.evaluate(() => document.fonts.ready); const file = `${mode}-${name}.png`; await page.screenshot({ path: path.join(output, file), animations: 'disabled', caret: 'hide' }); report.screenshots.push(file); }
async function layout(name) {
  const measured = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, containers: [...document.querySelectorAll('.modal,.detail-dialog,.selection-actionbar,.main-scroll')].filter(el => el.clientWidth).map(el => ({ name: el.className, width: el.clientWidth, scroll: el.scrollWidth })) }));
  report.layouts.push({ mode, name, ...measured }); assert.ok(measured.scroll <= measured.width + 1, `${name} 页面横向溢出`);
  for (const value of measured.containers) assert.ok(value.scroll <= value.width + 1, `${name} ${value.name} 横向溢出：${JSON.stringify(value)}`);
}
function preserve(before, after, changed, mutable) {
  assert.deepEqual(after.futureRoot, before.futureRoot);
  for (const original of before.items) {
    const updated = byId(after, original.id); assert.ok(updated);
    for (const key of Object.keys(original)) if (!changed.includes(original.id) || !mutable.includes(key)) assert.deepEqual(updated[key], original[key], `${original.id}.${key} 必须保留`);
  }
}
async function exitSelection() { const exit = button('退出多选'); if (await exit.count()) await exit.click(); }
async function beginSelection() { await exitSelection(); await button('批量编辑游戏').click(); }
async function choose(title) { await button(`选择${title}`).click(); }
async function apply(count, scope) { await button(`应用到 ${count} 款`, scope).click(); }
async function prepare(currentMode, theme = 'dark', width = 1440) {
  mode = currentMode;
  context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme, reducedMotion: 'reduce' });
  await context.addInitScript(({ initial, mode: currentMode, theme, version }) => {
    const key = currentMode === 'bridge' ? 'qiyu.test.workspace.library' : 'qiyu.library.v1';
    if (!localStorage.getItem(key)) localStorage.setItem(key, initial);
    localStorage.setItem('qiyu.appearance.v1', JSON.stringify({ mode: theme }));
    window.__workspaceFail = false; window.__workspaceSaves = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) { if (name === 'qiyu.library.v1') { window.__workspaceSaves++; if (window.__workspaceFail) throw new DOMException('隔离模拟保存失败', 'QuotaExceededError'); } return original.call(this, name, value); };
    if (currentMode === 'bridge') {
      let revision = 'isolated-0', saves = 0;
      window.qiyuDesktop = { getInfo: () => ({ version, dataDirectory: 'ISOLATED_NO_REAL_FILES', windowVisible: true }), loadLibrary: () => ({ ok: true, value: { snapshot: JSON.parse(localStorage.getItem(key)), revision } }),
        saveLibrary: (snapshot, expected) => { window.__workspaceSaves++; if (window.__workspaceFail) return { ok: false, error: '隔离模拟保存失败' }; if (expected !== revision) return { ok: false, error: '隔离修订冲突' }; original.call(localStorage, key, JSON.stringify(snapshot)); revision = `isolated-${++saves}`; return { ok: true, value: { revision } }; }, onWindowVisibility: () => () => {}, openDataDirectory: () => {} };
    }
  }, { initial: baseline, mode, theme, version });
  page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.pageErrors.push({ mode: currentMode, message: error.message }));
  page.on('response', response => { if (response.status() >= 400) report.resourceErrors.push({ mode: currentMode, url: response.url(), status: response.status() }); });
  page.on('dialog', async dialog => { const accept = acceptNext; acceptNext = true; report.confirmations.push({ mode, message: dialog.message(), accepted: accept }); await (accept ? dialog.accept() : dialog.dismiss()); });
  await page.route('**/*', route => route.request().url().startsWith(base) || route.request().url().startsWith('data:') ? route.continue() : route.abort('blockedbyclient'));
  await page.goto(base, { waitUntil: 'networkidle' }); await page.getByRole('heading', { name: '游戏', exact: true }).waitFor(); assert.equal(await raw(), baseline);
}
async function suite(currentMode) {
  await prepare(currentMode);
  await check('默认待体验计划优先展示未开始作品，搁置列于末尾，旧库浏览零写入', async () => {
    assert.deepEqual(await page.locator('.media-card .card-name').allTextContents(), ['旅程 A', '稍后 D']);
    assert.ok((await page.locator('.plan-divider').innerText()).includes('以后再说 · 暂时搁置'));
    await button('已隐藏').click(); assert.equal(await page.locator('.media-card').count(), 0);
    await button('回收站').click(); assert.equal(await page.locator('.media-card').count(), 0);
    await all(); assert.equal(await page.locator('.media-card').count(), 4);
    assert.equal(await page.evaluate(() => window.__workspaceSaves), 0); await unchanged('浏览范围与规划无收藏写入', baseline); await capture('library');
  });
  await check('左键打开居中详情，个人体验和作品资料分栏，发行年份与收录日期分别显示', async () => {
    await button('查看旅程 A详情').click(); await detail().waitFor();
    assert.equal(await detail().locator('[aria-label="个人体验"]').count(), 1); assert.equal(await detail().locator('[aria-label="作品资料"]').count(), 1);
    assert.equal(await detail().locator('.detail-facts').isVisible(), false); await capture('detail-personal-collapsed'); await button('展开作品资料', detail()).click();
    const geometry = await detail().boundingBox(); assert.ok(Math.abs(geometry.x + geometry.width / 2 - 720) < 8, '详情应居中');
    const personal = await detail().locator('.detail-personal').boundingBox(), facts = await detail().locator('.detail-facts').boundingBox(); assert.ok(facts.y >= personal.y + personal.height - 1 && Math.abs(personal.x - facts.x) < 1 && Math.abs(personal.width - facts.width) < 1, '游戏资料展开后位于 Bento 下方，保持同宽');
    assert.equal(await detail().getByText('发行年份', { exact: true }).count(), 1); assert.equal(await detail().getByText('收录日期', { exact: true }).count(), 1);
    await layout('desktop-detail'); await capture('central-detail'); await unchanged('打开双栏详情不写库', baseline);
  });
  await check('嵌套编辑按 Escape 只关闭最上层，印象在关闭详情时保存', async () => {
    await button('修改时长', detail()).click(); const quick = page.getByRole('dialog', { name: '修改累计游玩时长', exact: true }); await quick.waitFor();
    await page.keyboard.press('Escape'); await quick.waitFor({ state: 'hidden' }); assert.equal(await detail().isVisible(), true); await unchanged('嵌套 Escape 不写库', baseline);
    const before = await data(); await detail().getByRole('textbox', { name: '一句话印象', exact: true }).fill('我准备在周末开始，喜欢它的氛围。'); await button('关闭详情', detail()).click(); await detail().waitFor({ state: 'hidden' });
    const after = await data(); preserve(before, after, ['a'], ['impression', 'updatedAt']); assert.equal(byId(after, 'a').impression, '我准备在周末开始，喜欢它的氛围。');
  });
  await check('印象关闭保存失败保留详情和草稿，重试成功才关闭', async () => {
    await button('查看旅程 A详情').click(); await detail().getByRole('textbox', { name: '一句话印象', exact: true }).fill('保存失败也必须留下这份草稿'); const before = await raw();
    await page.evaluate(() => { window.__workspaceFail = true; }); await button('关闭详情', detail()).click();
    assert.equal(await detail().isVisible(), true); assert.equal(await detail().getByRole('textbox', { name: '一句话印象', exact: true }).inputValue(), '保存失败也必须留下这份草稿'); await unchanged('详情保存失败字节不变', before); await capture('detail-save-failure');
    await page.evaluate(() => { window.__workspaceFail = false; }); await button('关闭详情', detail()).click(); await detail().waitFor({ state: 'hidden' }); assert.equal(byId(await data(), 'a').impression, '保存失败也必须留下这份草稿');
  });
  await check('详情与右键资料编辑可实际交互，保存返回详情，取消保留原文', async () => {
    await button('查看旅程 A详情').click(); await button('展开作品资料', detail()).click(); await button('编辑', detail().locator('.detail-facts')).click(); let editor = page.getByRole('dialog', { name: '编辑作品', exact: true }); await editor.waitFor(); const before = await data();
    await editor.getByRole('textbox', { name: '发行年份', exact: true }).fill('2025'); await button('保存修改', editor).click(); await editor.waitFor({ state: 'hidden' }); assert.equal(await detail().isVisible(), true); preserve(before, await data(), ['a'], ['year', 'updatedAt']); assert.equal(byId(await data(), 'a').year, '2025');
    await button('编辑', detail().locator('.detail-facts')).click(); editor = page.getByRole('dialog', { name: '编辑作品', exact: true }); await editor.getByRole('textbox', { name: '发行年份', exact: true }).fill('1999'); const rawBefore = await raw(); await button('取消', editor).click(); await editor.waitFor({ state: 'hidden' }); assert.equal(await detail().isVisible(), true); await unchanged('取消资料编辑不写库', rawBefore); await button('关闭详情', detail()).click();
    await (await menu('旅程 A')).getByRole('menuitem', { name: '编辑作品资料', exact: true }).click(); editor = page.getByRole('dialog', { name: '编辑作品', exact: true }); await editor.getByRole('textbox', { name: '发行年份', exact: true }).fill('2026'); await capture('facts-editor-interactive'); await button('保存修改', editor).click(); await editor.waitFor({ state: 'hidden' }); assert.equal(await detail().isVisible(), true); assert.equal(byId(await data(), 'a').year, '2026'); await button('关闭详情', detail()).click();
  });
  await check('右键改当前关系，时长、个人记录、旧轴与未知字段保持 (v0.4.24)', async () => {
    const before = await data(), m = await menu('旅程 A'); await m.getByRole('menuitemradio', { name: '游玩中', exact: true }).click(); const after = await data();
    preserve(before, after, ['a'], ['playEngagement', 'updatedAt']); assert.equal(byId(after, 'a').playEngagement, 'playing'); assert.equal(byId(after, 'a').gamePlayState, byId(before, 'a').gamePlayState, '旧轴冻结'); assert.equal(byId(after, 'a').playtimeMinutes, 73);
  });
  await check('隐藏与取消隐藏只影响可见性，不改游玩状态，也不建立导入排除', async () => {
    const before = await data(); await (await menu('同乐 B')).getByRole('menuitem', { name: '隐藏作品', exact: true }).click();
    assert.equal(await button('查看同乐 B详情').count(), 0); await button('已隐藏').click(); assert.equal(await button('查看同乐 B详情').count(), 1);
    const hidden = await data(); preserve(before, hidden, ['b'], ['hiddenAt', 'updatedAt']); assert.ok(byId(hidden, 'b').hiddenAt); assert.equal(hidden.importExclusions, undefined);
    await (await menu('同乐 B')).getByRole('menuitem', { name: '取消隐藏', exact: true }).click(); await all(); assert.equal(await button('查看同乐 B详情').count(), 1); assert.equal(byId(await data(), 'b').hiddenAt, undefined);
  });
  await check('回收可恢复，永久删除明确确认；取消不写，接受后保留排除', async () => {
    await (await menu('旅程 A')).getByRole('menuitem', { name: '移到回收站', exact: true }).click(); assert.equal(await button('查看旅程 A详情').count(), 0);
    await button('回收站').click(); assert.equal(await button('查看旅程 A详情').count(), 1); const trashed = await data(); assert.ok(byId(trashed, 'a').removedAt); assert.equal(trashed.importExclusions[0].id, '123');
    await button('查看旅程 A详情').click(); assert.equal(await detail().getByRole('textbox', { name: '一句话印象', exact: true }).getAttribute('readonly'), ''); await button('展开作品资料', detail()).click(); await button('恢复作品', detail()).click(); await detail().waitFor({ state: 'hidden' }); await all(); assert.equal(byId(await data(), 'a').removedAt, undefined); assert.deepEqual((await data()).importExclusions, []);
    await (await menu('旅程 A')).getByRole('menuitem', { name: '移到回收站', exact: true }).click(); await button('回收站').click();
    const before = await raw(), confirmations = report.confirmations.length; acceptNext = false; await (await menu('旅程 A')).getByRole('menuitem', { name: '永久删除', exact: true }).click();
    assert.ok(report.confirmations.length > confirmations, '永久删除必须触发确认'); await unchanged('取消永久删除保留原文', before); assert.equal(await button('查看旅程 A详情').count(), 1);
    await (await menu('旅程 A')).getByRole('menuitem', { name: '永久删除', exact: true }).click(); const deleted = await data(); assert.equal(byId(deleted, 'a'), undefined); assert.equal(deleted.importExclusions[0].id, '123'); assert.deepEqual(deleted.futureRoot, fixture.futureRoot); await capture('trash-after-delete');
  });
  await check('重新加载后排除清单持久化，改名的同 Steam 编号离线重导被阻止', async () => {
    const before = await raw(); await page.reload({ waitUntil: 'networkidle' }); await unchanged('重新加载不写库', before);
    await button('批量导入作品').click(); const dialog = page.getByRole('dialog', { name: '批量导入作品', exact: true });
    await dialog.getByRole('textbox', { name: '作品清单', exact: true }).fill(JSON.stringify({ games: [{ appid: 123, name: '改名以后重新出现' }] })); await button('生成预览', dialog).click();
    assert.equal(await dialog.getByRole('checkbox', { name: '导入 改名以后重新出现', exact: true }).isDisabled(), true); assert.match(await dialog.locator('.steam-import-row-state').innerText(), /移除|排除/);
    assert.equal(await button('导入选中的 0 件', dialog).isDisabled(), true); await unchanged('排除重导预览不写库', before); await capture('excluded-reimport');
    await button('关闭批量导入', dialog).click(); await button('放弃本次清单', dialog).click(); await all();
  });
  await check('跨搜索多选直接修改状态，无整张编辑表单与第二步预览', async () => {
    await beginSelection(); await choose('同乐 B'); await search().fill('稍后 D'); await choose('稍后 D'); assert.match(await bar().innerText(), /已选择 2 件/); await search().fill('');
    // v0.4.24：批量改通关进度（新维度对话框），旧轴与通用 status 冻结。
    const before = await data(); await button('改通关进度', bar()).click(); const dialog = page.getByRole('dialog', { name: '更改通关进度', exact: true });
    assert.equal(await button('预览修改', dialog).count(), 0); assert.equal(await dialog.getByRole('combobox').count(), 0); await button('已通关', dialog).click(); await apply(2, dialog); await dialog.waitFor({ state: 'hidden' });
    const after = await data(); console.log('DEBUG before:', before.items.map(i => i.id).join(','), '| after:', after.items.map(i => i.id).join(',')); for (const id of ['b', 'd']) { const beforeItem = before.items.find(i => i.id === id); const afterItem = after.items.find(i => i.id === id); if (!afterItem) { console.log('DEBUG missing:', id); continue; } for (const key of new Set([...Object.keys(beforeItem), ...Object.keys(afterItem)])) if (!['completion','updatedAt'].includes(key) && JSON.stringify(beforeItem[key]) !== JSON.stringify(afterItem[key])) console.log('DEBUG diff', id, key, JSON.stringify(beforeItem[key]), '->', JSON.stringify(afterItem[key])); }
    preserve(before, after, ['b', 'd'], ['completion', 'updatedAt']); for (const id of ['b', 'd']) assert.equal(byId(after, id).completion, 'cleared'); await capture('batch-state-applied');
  });
  await check('批量添加与移除指定分组标签，仅选择项改变，保留时长和未知分组', async () => {
    await beginSelection(); await choose('同乐 B'); await choose('稍后 D'); let before = await data(); await button('添加标签', bar()).click(); let dialog = page.getByRole('dialog', { name: '添加标签', exact: true });
    await dialog.getByRole('combobox', { name: '标签分组', exact: true }).selectOption('scenario'); await dialog.getByRole('textbox', { name: '批量标签名称', exact: true }).fill('周末、联机'); await apply(2, dialog); await dialog.waitFor({ state: 'hidden' });
    let after = await data(); preserve(before, after, ['b', 'd'], ['tags', 'gameTags', 'updatedAt']); for (const id of ['b', 'd']) { assert.deepEqual(byId(after, id).gameTags.scenario, ['周末', '联机']); assert.deepEqual(byId(after, id).gameTags.futureGroup, ['保留分组']); }
    await beginSelection(); await choose('同乐 B'); before = await data(); await button('移除标签', bar()).click(); dialog = page.getByRole('dialog', { name: '移除标签', exact: true }); await dialog.getByRole('combobox', { name: '标签分组', exact: true }).selectOption('scenario'); await dialog.getByRole('textbox', { name: '批量标签名称', exact: true }).fill('联机'); await apply(1, dialog); await dialog.waitFor({ state: 'hidden' });
    after = await data(); preserve(before, after, ['b'], ['tags', 'gameTags', 'updatedAt']); assert.deepEqual(byId(after, 'b').gameTags.scenario, ['周末']); assert.deepEqual(byId(after, 'd').gameTags.scenario, ['周末', '联机']);
  });
  await check('批量保存失败保留操作内容和选择，重试只修改明确所选项', async () => {
    // v0.4.24：批量改当前关系（新维度），失败保留选择与操作、重试只改所选项。
    await beginSelection(); await choose('同乐 B'); await choose('深空 C'); const before = await data(), beforeRaw = await raw(); await button('改当前关系', bar()).click(); const dialog = page.getByRole('dialog', { name: '更改当前关系', exact: true }); await button('暂时搁置', dialog).click();
    await page.evaluate(() => { window.__workspaceFail = true; }); await apply(2, dialog); await dialog.getByRole('alert').waitFor(); assert.equal(await button('暂时搁置', dialog).getAttribute('aria-pressed'), 'true'); assert.match(await bar().innerText(), /已选择 2 件/); await unchanged('批量失败原文不变', beforeRaw); await capture('batch-save-failure');
    await page.evaluate(() => { window.__workspaceFail = false; }); await apply(2, dialog); await dialog.waitFor({ state: 'hidden' }); const after = await data(); preserve(before, after, ['b', 'c'], ['playEngagement', 'updatedAt']); for (const id of ['b', 'c']) assert.equal(byId(after, id).playEngagement, 'paused'); await exitSelection();
  });
  await check('普通标签管理计数及重命名仅作用普通库，隐藏与回收站记录逐字段保留', async () => {
    await (await menu('同乐 B')).getByRole('menuitem', { name: '隐藏作品', exact: true }).click(); await (await menu('稍后 D')).getByRole('menuitem', { name: '移到回收站', exact: true }).click(); const before = await data();
    await button('标签管理').click(); const dialog = page.getByRole('dialog', { name: '管理标签', exact: true }); const row = dialog.locator('.manager-tag-group.tag-type--gameplay .manage-tag-row').filter({ hasText: '动作' }); assert.equal(await row.locator('.tag-info small').innerText(), '1 件作品'); await button('重命名动作', row).click(); await dialog.getByRole('textbox', { name: '标签新名称', exact: true }).fill('探索'); await button('确认', dialog).click(); await button('完成', dialog).click();
    const after = await data(); preserve(before, after, ['c'], ['tags', 'gameTags', 'updatedAt']); assert.deepEqual(byId(after, 'b'), byId(before, 'b')); assert.deepEqual(byId(after, 'd'), byId(before, 'd')); assert.deepEqual(byId(after, 'c').gameTags.gameplay, ['探索']);
  });
  await check('从隐藏页与回收站批量收录成功均返回普通收藏并显示新增作品', async () => {
    for (const [view, title] of [['已隐藏', '隐藏页新增'], ['回收站', '回收页新增']]) {
      await button(view).click(); const before = await data(); await button('批量导入作品').click(); const dialog = page.getByRole('dialog', { name: '批量导入作品', exact: true }); await dialog.getByRole('textbox', { name: '作品清单', exact: true }).fill(title); await button('生成预览', dialog).click(); await button('导入选中的 1 件', dialog).click(); await dialog.waitFor({ state: 'hidden' });
      assert.match(await button('全部游戏', page.locator('.library-views')).getAttribute('class'), /is-active/); assert.equal(await button(`查看${title}详情`).count(), 1); const after = await data(); assert.equal(after.items.length, before.items.length + 1); preserve(before, after, [], []); const added = after.items.find(item => item.title === title); assert.ok(added && !added.hiddenAt && !added.removedAt); await capture(view === '已隐藏' ? 'import-from-hidden' : 'import-from-trash');
    }
  });
  await context.close(); context = null;
}
async function visual(theme, width) {
  await prepare('browser', theme, width); mode = `${theme}-${width}`;
  await check('普通按钮毛玻璃无跟随反光，Dock和搜索保留独立液态玻璃', async () => {
    const inspect = await page.evaluate(() => {
      const style = selector => { const element = document.querySelector(selector), css = getComputedStyle(element); return { image: css.backgroundImage, color: css.backgroundColor, backdrop: css.backdropFilter, pointer: element.hasAttribute('data-glass-active') }; };
      return { primary: style('.add-top'), ordinary: style('.batch-edit-open'), dock: style('.sidebar-dock > .glass-material__effect'), search: style('.global-search > .glass-material__effect') };
    });
    report.materials.push({ theme, width, ...inspect }); assert.equal(inspect.primary.image, 'none'); assert.ok(inspect.primary.backdrop.includes('blur(')); assert.ok(inspect.ordinary.backdrop.includes('blur('));
    assert.notEqual(inspect.dock.backdrop, 'none'); assert.notEqual(inspect.search.backdrop, 'none'); if (theme === 'light') assert.equal(inspect.primary.color, 'rgb(105, 102, 182)');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('.global-search').hover(); await page.waitForFunction(() => Number(document.querySelector('.global-search > .glass-material__highlight')?.style.getPropertyValue('--ngs-spec-o')) > .5);
    const target = page.locator('.batch-edit-open'); await target.hover(); assert.equal(await target.getAttribute('data-glass-active'), null); assert.equal(await target.evaluate(element => element.style.getPropertyValue('--glass-x')), '');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await layout(`${theme}-${width}-library`); await capture('library'); await button('查看旅程 A详情').click(); await detail().waitFor(); await layout(`${theme}-${width}-detail`); await capture('detail');
    if (width === 390) { await button('展开作品资料', detail()).click(); const p = await detail().locator('.detail-personal').boundingBox(), f = await detail().locator('.detail-facts').boundingBox(); assert.ok(f.y > p.y + 50, '窄屏资料纵向排列'); }
    await page.keyboard.press('Escape'); await detail().waitFor({ state: 'hidden' }); mode = 'browser'; await unchanged(`${theme}-${width} 视觉浏览原文保持`, baseline); mode = `${theme}-${width}`;
  });
  await check('底部多选栏位于可见窗口，宽窄窗口均可操作状态与标签并取消', async () => {
    await beginSelection(); await choose('旅程 A'); await choose('稍后 D');
    assert.equal(await page.locator('.selection-toolbar').count(), 0, '不应残留第二条多选栏'); assert.equal(await bar().count(), 1); for (const name of ['全选当前结果','清空选择','退出多选','改当前关系','改通关进度','添加标签']) assert.equal(await button(name, bar()).count(), 1);
    const geometry = await bar().boundingBox(); assert.ok(geometry.x >= -1 && geometry.y >= 0 && geometry.x + geometry.width <= width + 1 && geometry.y + geometry.height <= 1001, '底部操作栏必须完整位于可视区');
    assert.equal(await bar().evaluate(element => getComputedStyle(element).position), 'fixed'); await layout(`${theme}-${width}-selection`); await capture('selection-actions');
    await button('改通关进度', bar()).click(); let dialog = page.getByRole('dialog', { name: '更改通关进度', exact: true }); await button('已通关', dialog).click(); assert.equal(await button('应用到 2 款', dialog).isEnabled(), true); await layout(`${theme}-${width}-batch-state`); await button('取消', dialog).click();
    assert.match(await bar().innerText(), /已选择 2 件/); await button('添加标签', bar()).click(); dialog = page.getByRole('dialog', { name: '添加标签', exact: true }); await dialog.getByRole('combobox', { name: '标签分组', exact: true }).selectOption('scenario'); await dialog.getByRole('textbox', { name: '批量标签名称', exact: true }).fill('周末计划'); assert.equal(await button('应用到 2 款', dialog).isEnabled(), true); await layout(`${theme}-${width}-batch-tags`); await capture('batch-tags-controls'); await button('取消', dialog).click(); await button('清空选择', bar()).click(); assert.match(await bar().innerText(), /已选择 0 件/); assert.equal(await button('改当前关系', bar()).isDisabled(), true); const visibleCount = await page.locator('.media-gallery .media-card').count(); await button('全选当前结果', bar()).click(); assert.ok((await bar().innerText()).includes(`已选择 ${visibleCount} 件`), '全选应与当前筛选结果一致'); await capture('selection-merged-select-all'); await exitSelection(); assert.equal(await bar().count(), 0);
    mode = 'browser'; await unchanged(`${theme}-${width} 多选取消不写库`, baseline); mode = `${theme}-${width}`;
  });
  await context.close(); context = null;
}

async function writingSuite(currentMode) {
  await prepare(currentMode); await all();
  const short = () => detail().getByRole('textbox', { name: '一句话印象', exact: true });
  const review = () => detail().getByRole('textbox', { name: '长文测评', exact: true });
  await check('独立印象和长文保存，状态编辑不清掉草稿，测评参与搜索', async () => {
    await button('查看旅程 A详情').click();
    assert.equal(await detail().locator('.detail-facts').isVisible(), false);
    const buttons = await detail().locator('.detail-statuses button').evaluateAll(els => els.map(el => ({ width: el.clientWidth, height: el.clientHeight })));
    assert.ok(buttons.every(value => value.width < 150 && value.height <= 34));
    await button('展开长文测评', detail()).click();
    await short().fill('短句保留尾空白  '); await review().fill('第一段长文\n星河独有词\n尾空白  ');
    await button('更改当前游玩关系', detail()).click();
    await button('游玩中', detail()).click(); assert.equal(await review().inputValue(), '第一段长文\n星河独有词\n尾空白  ');
    await button('保存感受', detail()).click(); assert.equal(byId(await data(),'a').review, '第一段长文\n星河独有词\n尾空白  ');
    assert.equal(byId(await data(),'a').impression,'短句保留尾空白  '); await capture('writing-split'); await button('关闭详情', detail()).click();
    await page.reload(); await all(); await search().fill('星河独有词'); assert.equal(await page.locator('.media-card').count(),1); await search().fill('');
  });
  await check('80个emoji有效，81字阻止关闭且原文不变，长测评不被短印象上限限制', async () => {
    await button('查看旅程 A详情').click(); const before=await raw(); await short().fill('😀'.repeat(81)); await button('关闭详情',detail()).click();
    assert.equal(await detail().isVisible(),true); assert.equal(await short().getAttribute('aria-invalid'),'true'); assert.equal(await short().inputValue(),'😀'.repeat(81)); await unchanged('超限不截断不写库',before);
    await button('展开长文测评', detail()).click();
    await short().fill('😀'.repeat(80)); await review().fill('长测评\n'.repeat(2500)); await button('关闭详情',detail()).click();
    assert.equal(byId(await data(),'a').impression,'😀'.repeat(80)); assert.equal(byId(await data(),'a').review,'长测评\n'.repeat(2500));
  });
  await check('两份感受保存失败同时留存并阻止关闭，重试仅改目标记录', async () => {
    await button('查看旅程 A详情').click(); await button('展开长文测评', detail()).click(); await short().fill('失败后的短印象'); await review().fill('失败后的测评\r\n全文'); const before=await raw();
    await page.evaluate(()=>window.__workspaceFail=true); await button('关闭详情',detail()).click(); assert.equal(await detail().isVisible(),true);
    assert.equal(await short().inputValue(),'失败后的短印象'); assert.equal(await review().inputValue(),'失败后的测评\n全文'); await unchanged('感受失败保持收藏原文',before); await capture('writing-save-failed');
    await page.evaluate(()=>window.__workspaceFail=false); await button('关闭详情',detail()).click(); assert.equal(byId(await data(),'a').review,'失败后的测评\n全文');
  });
  await context.close(); context=null;
  await prepare(currentMode); await all();
  const legacy='旧版完整文字\r\n'+ '很长的感受'.repeat(40)+'  ', existing='已有独立测评  ';
  await page.evaluate(({key,legacy,existing})=>{const value=JSON.parse(localStorage.getItem(key));value.items.find(item=>item.id==='a').impression=legacy;value.items.find(item=>item.id==='a').review=existing;localStorage.setItem(key,JSON.stringify(value));}, {key:currentMode==='bridge'?'qiyu.test.workspace.library':'qiyu.library.v1',legacy,existing});
  await page.reload(); await all();
  await check('旧长文和已有测评完整展示，资料折叠及未编辑关闭零写入', async()=>{
    const before=await raw(); await button('查看旅程 A详情').click(); await button('展开长文测评', detail()).click(); assert.equal(await short().inputValue(),''); assert.equal(await review().inputValue(),(legacy+'\n\n'+existing).replaceAll('\r\n','\n'));
    await button('展开作品资料',detail()).click(); await layout('legacy-facts-open'); await capture('legacy-facts-open'); await button('收起作品资料',detail()).click();
    assert.equal(await detail().locator('.detail-facts').isVisible(),false); await button('关闭详情',detail()).click(); await unchanged('旧长文浏览不拆分',before);
  });
  await check('只编辑客观资料仍逐字保留旧长文及已有测评',async()=>{
    await button('查看旅程 A详情').click(); await button('展开作品资料',detail()).click(); await button('编辑',detail().locator('.detail-facts')).click();
    const editor=page.getByRole('dialog',{name:'编辑作品',exact:true}); await editor.getByRole('textbox',{name:'发行年份',exact:true}).fill('2025'); await button('保存修改',editor).click();
    assert.equal(byId(await data(),'a').impression,legacy); assert.equal(byId(await data(),'a').review,existing); await button('关闭详情',detail()).click();
  });
  await check('明确编辑感受才拆分旧文字，合成两段原文完整保留',async()=>{
    await button('查看旅程 A详情').click(); await short().fill('新的短印象'); await button('保存感受',detail()).click();
    const item=byId(await data(),'a'); assert.equal(item.impression,'新的短印象'); assert.equal(item.review,legacy+'\n\n'+existing); assert.deepEqual(item.futureItem,fixture.items[0].futureItem);
    await button('关闭详情',detail()).click();
  });
  await context.close(); context=null;
}
async function settingsDockSuite(width) {
  await prepare('browser','dark',width); mode=`dock-${width}`;
  await check('设置独立悬浮Dock，悬停与键盘展开不挤动内容，鼠标离开收起',async()=>{
    if (!await button('数据与设置').isVisible()) await button('打开菜单').click();
    await button('数据与设置').click(); const dialog=page.getByRole('dialog',{name:'数据与设置',exact:true}), nav=dialog.getByRole('navigation',{name:'设置分类'});
    await page.mouse.move(width-8,10); const before=await nav.boundingBox(), content=await dialog.locator('.settings-content').boundingBox(); assert.ok(before.width<=60 && before.x>=0);
    assert.equal(await nav.evaluate(el=>getComputedStyle(el).position),'absolute'); await capture('settings-dock-collapsed'); await nav.hover();
    await page.waitForFunction(()=>document.querySelector('.settings-nav').getBoundingClientRect().width>175); const expanded=await nav.boundingBox(); assert.ok(expanded.width>175);
    assert.equal((await dialog.locator('.settings-content').boundingBox()).x,content.x); await capture('settings-dock-expanded');
    await button('导航玻璃',nav).click(); await page.mouse.move(width-8,10); await page.waitForFunction(()=>document.querySelector('.settings-nav').getBoundingClientRect().width<=60);
    assert.equal(await button('导航玻璃',nav).getAttribute('aria-current'),'page');
    await page.keyboard.press('Tab'); await button('背景与配色',nav).focus(); await page.waitForFunction(()=>document.querySelector('.settings-nav').getBoundingClientRect().width>175);
    await page.keyboard.press('Enter'); assert.equal(await button('背景与配色',nav).getAttribute('aria-current'),'page'); await layout('settings-dock');
    await button('关闭',dialog).click(); mode='browser'; await unchanged('设置导航零收藏写入',baseline); mode=`dock-${width}`;
  });
  await context.close();context=null;
}
(async () => {
  try {
    base = await serve(); browser = await chromium.launch({ channel: 'msedge', headless: true });
    for (const currentMode of ['browser', 'bridge']) { await suite(currentMode); await writingSuite(currentMode); }
    for (const width of [1440,390]) await settingsDockSuite(width);
    for (const theme of ['dark']) for (const width of [1440, 390]) await visual(theme, width);
    assert.equal(report.pageErrors.length, 0); assert.equal(report.resourceErrors.length, 0); report.passed = true;
  } catch (error) { report.failure = `${stage}\n${error.stack}`; process.exitCode = 1; if (page && !page.isClosed()) { try { await capture('failure'); } catch {} } }
  finally {
    if (context) await context.close(); if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve));
    report.timestamp = new Date().toISOString(); fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, version, checks: report.checks.length, integrity: report.integrity.length, screenshots: report.screenshots.length, failure: report.failure, pageErrors: report.pageErrors, resourceErrors: report.resourceErrors }));
  }
})();
