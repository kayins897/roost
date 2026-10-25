const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const evidence = path.join(root, 'evidence', `batch-edit-v${version.replaceAll('.', '')}`);
const report = { passed: false, version, isolatedDataOnly: true, checks: [], screenshots: [], pageErrors: [], resourceErrors: [], integrity: [], layout: [], modes: [], notes: [
  '使用独立无持久化 Edge 浏览器上下文及本地静态 dist；不读取用户浏览器配置或真实收藏。',
  '分别走真实 LocalStorageRepository 和真实 DesktopRepository；桌面文件系统桥接被隔离内存/浏览器存储模拟，不启动或控制用户 Electron 窗口。',
  '失败注入只作用于该测试上下文的 library 写入；预览/选择/浏览的文件字节不变使用严格字符串相等及 SHA-256 核对。',
] };
const fixtureItem = (id, title, extra = {}) => ({
  id, title, category: 'game', subcategory: 'Steam', creator: '界面测试开发者', year: '2026',
  status: 'want', gamePlayState: 'want', tags: [], impression: `保留 ${title} 的个人感受`, favorite: false,
  artwork: 'hollow', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});
const fixture = { schemaVersion: 1, futureRoot: { keep: '未知根字段' }, items: [
  fixtureItem('a', '旅程 A', { playtimeMinutes: 73, favorite: true, tags: ['动作', '太空', '需要沉浸', '旧标签'],
    gameTags: { gameplay: ['动作'], theme: ['太空'], scenario: ['需要沉浸'], other: ['旧标签'], futureGroup: ['未知分组'] },
    externalIds: [{ provider: 'steam', id: '123' }], futureItem: { keep: '未知作品字段' },
    experienceEntries: [{ id: 'note-a', date: '2026-10', kind: 'note', note: '不能覆盖的体验记录' }],
  }),
  fixtureItem('b', '同乐 B', { artwork: 'hades', playtimeMinutes: 1337, status: 'active', gamePlayState: 'playing', tags: ['RPG', '太空'], gameTags: { gameplay: ['RPG'], theme: ['太空'], scenario: [], other: [] } }),
  fixtureItem('c', '深空 C', { artwork: 'outer', playtimeMinutes: 720, status: 'finished', gamePlayState: 'cleared', tags: ['城市'], gameTags: { gameplay: [], theme: ['城市'], scenario: [], other: [] } }),
  fixtureItem('d', '未选 D', { artwork: 'dave', playtimeMinutes: 99, status: 'paused', gamePlayState: 'paused', tags: ['动作'], gameTags: { gameplay: ['动作'], theme: [], scenario: [], other: [] } }),
  fixtureItem('book', '阅读样例', { category: 'book', subcategory: '文学', status: 'want', gamePlayState: undefined, tags: ['动作'], futureItem: { keep: '书籍不参与批量游戏编辑' } }),
] };
const baseline = JSON.stringify(fixture);
const digest = value => createHash('sha256').update(value).digest('hex');
let browser, server, base, context, page, mode, stage;
fs.mkdirSync(evidence, { recursive: true });

function startServer() {
  assert.ok(fs.existsSync(path.join(dist, 'index.html')), '请先 npm run build');
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    let target;
    try { target = path.resolve(dist, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname)); }
    catch { response.writeHead(400); response.end(); return; }
    if (!target.startsWith(dist + path.sep)) { response.writeHead(403); response.end(); return; }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'content-type': mime[path.extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(target).pipe(response);
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)); });
}
async function check(name, work) { stage = `${mode}: ${name}`; await work(); report.checks.push(stage); console.log(`PASS ${stage}`); }
async function raw() { return page.evaluate(currentMode => localStorage.getItem(currentMode === 'bridge' ? 'qiyu.test.batch.library' : 'qiyu.library.v1'), mode); }
async function snapshot() { return JSON.parse(await raw()); }
async function unchanged(name, before) {
  const after = await raw(); const same = before === after;
  report.integrity.push({ mode, name, beforeSha256: digest(before), afterSha256: digest(after), same, beforeBytes: Buffer.byteLength(before), afterBytes: Buffer.byteLength(after) });
  assert.equal(after, before, name);
}
async function capture(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(220);
  const file = `${mode}-${name}.png`;
  await page.screenshot({ path: path.join(evidence, file), animations: 'disabled', caret: 'hide' });
  report.screenshots.push(file);
}
async function choose(title) { await page.getByRole('button', { name: `选择${title}`, exact: true }).click(); }
const toolbar = () => page.getByRole('region', { name: '批量选择游戏', exact: true });
const dialog = () => page.getByRole('dialog', { name: '批量编辑游戏', exact: true });
const search = () => page.getByRole('textbox', { name: '搜索收藏', exact: true });
async function expectSelected(count) { assert.equal(await toolbar().locator('strong').innerText(), `已选 ${count} 款`); }
async function start() { await page.getByRole('button', { name: '批量编辑游戏', exact: true }).click(); }
async function edit() { await toolbar().getByRole('button', { name: '编辑所选', exact: true }).click(); await dialog().waitFor(); }
async function preview() { await dialog().getByRole('button', { name: '预览修改', exact: true }).click(); }
async function confirm(count) { await dialog().getByRole('button', { name: `确认更新 ${count} 款`, exact: true }).click(); }
async function closeEditor() { await dialog().getByRole('button', { name: '关闭', exact: true }).click(); }
async function setState(value) { await dialog().getByRole('combobox', { name: '批量游玩状态', exact: true }).selectOption(value); }
async function setTags(group, value) { await dialog().getByRole('textbox', { name: `批量${group}标签`, exact: true }).fill(value); }
async function pair() { await start(); await choose('旅程 A'); await choose('同乐 B'); await edit(); }
function byId(value, id) { return value.items.find(item => item.id === id); }
function preserve(before, after, changedIds) {
  assert.equal(after.items.length, before.items.length);
  assert.deepEqual(after.futureRoot, before.futureRoot);
  assert.deepEqual(after.items.map(item => item.id), before.items.map(item => item.id));
  for (const original of before.items) {
    const changed = byId(after, original.id);
    if (!changedIds.includes(original.id)) assert.deepEqual(changed, original, `未选择 ${original.id} 必须逐字段保留`);
    for (const field of ['playtimeMinutes', 'impression', 'favorite', 'createdAt', 'externalIds', 'experienceEntries', 'futureItem']) assert.deepEqual(changed[field], original[field], `${original.id}.${field} 不能被批量编辑覆盖`);
    assert.deepEqual(changed.gameTags?.futureGroup, original.gameTags?.futureGroup);
  }
  const timestamps = changedIds.map(id => byId(after, id).updatedAt);
  if (timestamps.length) { assert.equal(new Set(timestamps).size, 1, '同次确认共用提交时间'); assert.notEqual(timestamps[0], '2026-01-01T00:00:00.000Z'); }
}
async function navigate(name) {
  const menu = page.getByRole('button', { name: '打开菜单', exact: true });
  if (await menu.isVisible() && !(await page.locator('.sidebar--open').count())) await menu.click();
  await page.getByRole('navigation', { name: '作品分类', exact: true }).getByRole('button', { name, exact: true }).click();
}
async function checkLayout(name) {
  const value = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, documentWidth: document.documentElement.scrollWidth, containers: [...document.querySelectorAll('.modal,.batch-edit,.selection-toolbar,.main-scroll')].filter(element => element.clientWidth > 0).map(element => ({ name: element.className, width: element.clientWidth, scrollWidth: element.scrollWidth })) }));
  report.layout.push({ mode, name, ...value });
  assert.ok(value.documentWidth <= value.viewport + 1, `${name} 页面不能横向溢出：${JSON.stringify(value)}`);
  for (const container of value.containers) assert.ok(container.scrollWidth <= container.width + 1, `${name} ${container.name} 横向溢出`);
}
async function prepare(currentMode) {
  mode = currentMode;
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  await context.addInitScript(({ initial, currentMode, appVersion }) => {
    const dataKey = currentMode === 'bridge' ? 'qiyu.test.batch.library' : 'qiyu.library.v1';
    if (localStorage.getItem(dataKey) === null) localStorage.setItem(dataKey, initial);
    localStorage.setItem('qiyu.appearance.v1', JSON.stringify({ mode: 'dark' }));
    window.__qiyuBatchFailSave = false;
    window.__qiyuBatchSaveAttempts = 0;
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'qiyu.library.v1') { window.__qiyuBatchSaveAttempts += 1; if (window.__qiyuBatchFailSave) throw new DOMException('隔离模拟保存失败', 'QuotaExceededError'); }
      return originalSet.call(this, key, value);
    };
    if (currentMode === 'bridge') {
      let revision = 'isolated-0'; let saves = 0;
      window.qiyuDesktop = {
        getInfo: () => ({ version: appVersion, dataDirectory: 'ISOLATED_BROWSER_FIXTURE_NO_REAL_FILES', windowVisible: true }),
        loadLibrary: () => ({ ok: true, value: { snapshot: JSON.parse(localStorage.getItem(dataKey)), revision } }),
        saveLibrary: (value, expectedRevision) => {
          window.__qiyuBatchSaveAttempts += 1;
          if (window.__qiyuBatchFailSave) return { ok: false, error: '隔离模拟保存失败' };
          if (expectedRevision !== revision) return { ok: false, error: '隔离模拟修订冲突' };
          originalSet.call(localStorage, dataKey, JSON.stringify(value)); revision = `isolated-${++saves}`;
          return { ok: true, value: { revision } };
        },
        onWindowVisibility: () => () => {},
        openDataDirectory: () => {},
      };
    }
  }, { initial: baseline, currentMode, appVersion: version });
  page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.pageErrors.push({ mode: currentMode, message: error.message }));
  page.on('response', response => { if (response.status() >= 400) report.resourceErrors.push({ mode: currentMode, url: response.url(), status: response.status() }); });
  page.on('dialog', async browserDialog => { await browserDialog.accept(); });
  await page.route('**/*', route => { const url = route.request().url(); return url.startsWith(base) || url.startsWith('data:') ? route.continue() : route.abort('blockedbyclient'); });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
  assert.equal(await raw(), baseline);
}

async function suite(currentMode) {
  await prepare(currentMode);
  await check('默认游戏及四媒体导航，收藏总览已移除', async () => {
    const nav = page.getByRole('navigation', { name: '作品分类', exact: true });
    assert.deepEqual(await nav.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))), ['游戏', '书籍', '影视', '音乐']);
    assert.equal(await page.getByRole('button', { name: '收藏总览', exact: true }).count(), 0);
    // v0.4.24 默认待体验计划视图：仅计划游玩+搁置（旅程 A、未选 D）；切全部后四件游戏齐。
    assert.equal(await page.locator('.media-gallery .media-card').count(), 2);
    await page.locator('.library-views').getByRole('button', { name: '全部游戏', exact: true }).click();
    assert.equal(await page.locator('.media-gallery .media-card').count(), 4);
    assert.equal(await toolbar().count(), 0);
    await unchanged('默认浏览不修改收藏字节', baseline);
  });
  await check('空选择禁用，搜索隐藏作品仍保留选择，全选仅显式当前结果', async () => {
    await start(); await expectSelected(0);
    assert.equal(await toolbar().getByRole('button', { name: '编辑所选', exact: true }).isDisabled(), true);
    assert.equal(await toolbar().getByRole('button', { name: '清空选择', exact: true }).isDisabled(), true);
    await choose('旅程 A'); await choose('同乐 B'); await expectSelected(2);
    await search().fill('深空 C'); assert.equal(await page.locator('.media-gallery .media-card').count(), 1); await expectSelected(2);
    await toolbar().getByRole('button', { name: '全选当前结果', exact: true }).click(); await expectSelected(3);
    assert.equal(await page.getByRole('button', { name: '取消选择深空 C', exact: true }).getAttribute('aria-pressed'), 'true');
    await search().fill(''); assert.equal(await page.locator('.media-card[aria-pressed="true"]').count(), 3);
    assert.equal(await page.getByRole('button', { name: '选择未选 D', exact: true }).getAttribute('aria-pressed'), 'false');
    await capture('selection-search-preserved');
    await toolbar().getByRole('button', { name: '清空选择', exact: true }).click(); await expectSelected(0);
    await toolbar().getByRole('button', { name: '退出批量选择', exact: true }).click();
    await unchanged('选择、搜索、显式全选及清空不修改收藏字节', baseline);
  });
  await check('追加已有与新建标签，清空输入及预览返回，不更改各作品状态', async () => {
    const before = await snapshot(); const beforeRaw = await raw();
    await pair(); assert.equal(await dialog().getByRole('combobox', { name: '批量游玩状态', exact: true }).inputValue(), '');
    await setTags('玩法', '动作、新建标签');
    await dialog().getByRole('button', { name: /^RPG/ }).click();
    await setTags('游玩场景', '联机');
    await capture('edit-existing-and-new-tags');
    await preview(); assert.equal(await dialog().locator('.batch-preview-item').count(), 2);
    await unchanged('追加标签预览不会写入库', beforeRaw);
    await capture('tag-preview');
    await dialog().getByRole('button', { name: '返回调整', exact: true }).click();
    await setTags('玩法', ''); await setTags('游玩场景', '');
    assert.equal(await dialog().getByRole('button', { name: '预览修改', exact: true }).isDisabled(), true);
    await setTags('玩法', '动作、新建标签、RPG、rpg'); await setTags('游玩场景', '联机');
    await preview(); await confirm(2); await dialog().waitFor({ state: 'hidden' });
    assert.equal(await toolbar().count(), 0, '保存成功退出选择模式');
    const after = await snapshot(); preserve(before, after, ['a', 'b']);
    assert.deepEqual(byId(after, 'a').gameTags.gameplay, ['动作', '新建标签', 'RPG']);
    assert.deepEqual(byId(after, 'b').gameTags.gameplay, ['RPG', '动作', '新建标签']);
    for (const id of ['a', 'b']) { assert.deepEqual(byId(after, id).gameTags.scenario, id === 'a' ? ['需要沉浸', '联机'] : ['联机']); assert.equal(byId(after, id).gamePlayState, byId(before, id).gamePlayState); assert.equal(byId(after, id).status, byId(before, id).status); }
    await capture('tags-added-time-preserved');
  });
  await check('限定分组移除标签并批量通关，仅选中作品改变且同一时间提交', async () => {
    const before = await snapshot(); const beforeRaw = await raw();
    await pair(); await dialog().getByRole('button', { name: '移除', exact: true }).click();
    await setTags('玩法', ' 新建标签 '); await setTags('题材', '太空'); await setState('cleared');
    await preview(); await unchanged('移除与通关预览不会写入库', beforeRaw); await confirm(2); await dialog().waitFor({ state: 'hidden' });
    const after = await snapshot(); preserve(before, after, ['a', 'b']);
    for (const id of ['a', 'b']) { assert.equal(byId(after, id).gamePlayState, 'cleared'); assert.equal(byId(after, id).status, 'finished'); assert.ok(!byId(after, id).gameTags.gameplay.includes('新建标签')); assert.deepEqual(byId(after, id).gameTags.theme, []); }
    assert.deepEqual(byId(after, 'a').gameTags.other, ['旧标签']);
  });
  await check('筛选后单件搁置，累计游玩分钟与其他作品保持不变', async () => {
    const before = await snapshot(); const beforeRaw = await raw();
    await search().fill('同乐 B'); await start(); await choose('同乐 B'); await edit(); await setState('paused');
    await preview(); await unchanged('单件搁置预览不会写入库', beforeRaw); await confirm(1); await dialog().waitFor({ state: 'hidden' });
    const after = await snapshot(); preserve(before, after, ['b']);
    assert.equal(byId(after, 'b').gamePlayState, 'paused'); assert.equal(byId(after, 'b').status, 'paused');
    assert.equal(await search().inputValue(), '同乐 B'); await search().fill('');
  });
  await check('零变化预览禁止确认，取消保留选择且不改 updatedAt', async () => {
    const beforeRaw = await raw(); await start(); await choose('同乐 B'); await edit(); await setState('paused'); await preview();
    assert.equal(await dialog().getByRole('heading', { name: '没有需要更改的作品', exact: true }).isVisible(), true);
    assert.equal(await dialog().getByRole('button', { name: '确认更新 0 款', exact: true }).isDisabled(), true);
    await dialog().getByRole('button', { name: '返回调整', exact: true }).click(); await setState('');
    await dialog().getByRole('button', { name: '移除', exact: true }).click(); await setTags('玩法', '不存在的标签'); await preview();
    assert.equal(await dialog().getByRole('button', { name: '确认更新 0 款', exact: true }).isDisabled(), true);
    await closeEditor(); await expectSelected(1); assert.equal(await page.getByRole('button', { name: '取消选择同乐 B', exact: true }).getAttribute('aria-pressed'), 'true');
    await toolbar().getByRole('button', { name: '退出批量选择', exact: true }).click(); await unchanged('零变化预览与取消保持原始字节和 updatedAt', beforeRaw);
  });
  await check('保存失败保留预览与选择，重试只应用明确修改', async () => {
    const before = await snapshot(); const beforeRaw = await raw();
    await start(); await choose('旅程 A'); await choose('深空 C'); await edit(); await setState('ongoing'); await setTags('题材', '新题材'); await preview();
    await page.evaluate(() => { window.__qiyuBatchFailSave = true; });
    await confirm(2); await dialog().getByRole('alert').waitFor();
    assert.equal(await dialog().locator('.batch-preview-item').count(), 2); await expectSelected(2);
    await unchanged('保存失败时库字节严格不变', beforeRaw); await capture('save-failure-preserved');
    await dialog().getByRole('button', { name: '返回调整', exact: true }).click();
    assert.equal(await dialog().getByRole('combobox', { name: '批量游玩状态', exact: true }).inputValue(), 'ongoing');
    assert.equal(await dialog().getByRole('textbox', { name: '批量题材标签', exact: true }).inputValue(), '新题材');
    await preview(); await page.evaluate(() => { window.__qiyuBatchFailSave = false; }); await confirm(2); await dialog().waitFor({ state: 'hidden' });
    const after = await snapshot(); preserve(before, after, ['a', 'c']);
    for (const id of ['a', 'c']) { assert.equal(byId(after, id).gamePlayState, 'ongoing'); assert.equal(byId(after, id).status, 'active'); assert.ok(byId(after, id).gameTags.theme.includes('新题材')); }
    assert.equal(await toolbar().count(), 0);
  });
  await check('标签交集筛选与清除保持显式选择，取消一件立即更新数量', async () => {
    const beforeRaw = await raw();
    await page.locator('.game-filter-group.tag-type--gameplay .tag-filter').filter({ hasText: '动作' }).click();
    assert.equal(await page.locator('.media-gallery .media-card').count(), 3);
    await start(); await toolbar().getByRole('button', { name: '全选当前结果', exact: true }).click(); await expectSelected(3);
    await page.locator('.game-filter-group.tag-type--scenario .tag-filter').filter({ hasText: '联机' }).click();
    assert.equal(await page.locator('.media-gallery .media-card').count(), 2); await expectSelected(3);
    await page.locator('.active-filter-summary').getByRole('button', { name: '全部清除', exact: true }).click();
    // v0.4.24 默认待体验计划视图：仅计划游玩+搁置（旅程 A、未选 D）；切全部后四件游戏齐。
    assert.equal(await page.locator('.media-gallery .media-card').count(), 2);
    await page.locator('.library-views').getByRole('button', { name: '全部游戏', exact: true }).click();
    assert.equal(await page.locator('.media-gallery .media-card').count(), 4); await expectSelected(3);
    await page.getByRole('button', { name: '取消选择未选 D', exact: true }).click(); await expectSelected(2);
    await toolbar().getByRole('button', { name: '退出批量选择', exact: true }).click(); await unchanged('标签筛选及清除、取消选择均不写入收藏', beforeRaw);
  });
  await check('390px 窄屏可选择、编辑、预览和取消，容器无横向溢出', async () => {
    const beforeRaw = await raw();
    const toastClose = page.locator('.toast').getByRole('button', { name: '关闭提示', exact: true });
    if (await toastClose.count()) await toastClose.click();
    await page.setViewportSize({ width: 390, height: 844 });
    await start(); await choose('旅程 A'); await choose('深空 C'); await expectSelected(2); await checkLayout('narrow-selection'); await edit();
    await setTags('玩法', '窄屏标签'); await setState('playing'); await checkLayout('narrow-edit'); await capture('narrow-editor');
    await dialog().getByRole('button', { name: '预览修改', exact: true }).scrollIntoViewIfNeeded();
    const footer = await dialog().getByRole('button', { name: '预览修改', exact: true }).boundingBox();
    assert.ok(footer && footer.y >= 0 && footer.y + footer.height <= 844, '窄屏滚动后提交入口应完整可见');
    await capture('narrow-editor-footer');
    await preview(); assert.equal(await dialog().locator('.batch-preview-item').count(), 2); await checkLayout('narrow-preview'); await capture('narrow-preview');
    await closeEditor(); await expectSelected(2); await toolbar().getByRole('button', { name: '退出批量选择', exact: true }).click();
    await unchanged('窄屏编辑取消不写入收藏', beforeRaw); await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check('其他媒体不出现游戏批量编辑，刷新后批量结果保留且选择不复活', async () => {
    const beforeRaw = await raw(); await navigate('书籍');
    assert.equal(await page.getByRole('heading', { name: '书籍', exact: true }).isVisible(), true);
    assert.equal(await page.getByRole('button', { name: '批量编辑游戏', exact: true }).count(), 0);
    assert.equal(await toolbar().count(), 0); await unchanged('跨媒体浏览不修改库', beforeRaw);
    await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
    assert.equal(await toolbar().count(), 0); await unchanged('重载后库结果保留，不恢复临时选择', beforeRaw);
    report.modes.push({ mode, initialSha256: digest(baseline), finalSha256: digest(beforeRaw), items: (await snapshot()).items.length, closed: true });
  });
  await context.close(); context = undefined;
}

(async () => {
  try {
    const { isValidSnapshot } = await import(pathToFileURL(path.join(root, 'src/domain/library.ts')).href);
    assert.equal(isValidSnapshot(JSON.parse(baseline)), true, '隔离 fixture 必须通过真实领域校验');
    base = await startServer(); browser = await chromium.launch({ channel: 'msedge', headless: true });
    await suite('browser'); await suite('bridge');
    assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.resourceErrors, []);
    report.passed = true;
  } catch (error) {
    report.failure = { stage, message: error.message, stack: error.stack };
    console.error(error);
    if (page && !page.isClosed()) {
      try { await capture('failure'); fs.writeFileSync(path.join(evidence, `${mode}-failure.html`), await page.content()); } catch { /* Keep the original failing assertion. */ }
    }
    process.exitCode = 1;
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise(resolve => server.close(resolve));
    report.timestamp = new Date().toISOString();
    fs.writeFileSync(path.join(evidence, 'validation.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, screenshots: report.screenshots.length, integrity: report.integrity.length, failure: report.failure, evidence }));
  }
})();
