const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), version = require('../package.json').version;
const output = path.join(root, 'evidence', `rank-controls-v${version.replaceAll('.', '')}`), sha = value => createHash('sha256').update(value).digest('hex');
const report = { passed: false, version, isolatedDataOnly: true, userLibraryAccessed: false, checks: [], screenshots: [], integrity: [], errors: [], notes: ['浏览器使用真实LocalStorageRepository，bridge使用真实DesktopRepository与临时内存桥；不替代Windows实际进程/文件验收。', '仅检查实际等级输入入口。失败注入只作用独立合成收藏，不访问真实AppData/QIYU。'] };
const work = (id, title, extra = {}) => ({ id, title, category: 'game', subcategory: 'Steam', creator: '隔离测试', year: '2025', status: 'want', gamePlayState: 'want', platforms: ['Steam'], tags: ['原标签'], gameTags: { gameplay: ['动作'], theme: [], scenario: [], other: [], futureGroup: ['原样'] }, impression: '个人印象不可误改', review: '个人长文不可误改', playtimeMinutes: 110, favorite: false, artwork: 'outer', createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', futureItem: { untouched: id }, ...extra });
const fixture = { schemaVersion: 1, futureRoot: { untouched: ['原文'] }, items: [
  work('a', '可见 Alpha', { playPriority: 'A', priorityOrder: 0, personalGrade: 'B', ratingOrder: 32 }), work('b', '后台 Beta', { playPriority: 'A', priorityOrder: 1 }), work('x', '后台 Delta', { playPriority: 'A', priorityOrder: 2 }), work('c', '可见 Gamma', { playPriority: 'A', priorityOrder: 3 }),
  work('top', '最高优先级', { playPriority: 'SSS' }), work('low', '低优先级', { playPriority: 'C' }), work('paused', '暂停作品', { gamePlayState: 'paused', status: 'paused', playPriority: 'SSS', priorityOrder: 9 }),
  work('r1', '通关 Alpha', { gamePlayState: 'cleared', status: 'finished', personalGrade: 'S', ratingOrder: 0, playPriority: 'C', priorityOrder: 88 }), work('r2', '通关 Beta', { gamePlayState: 'cleared', status: 'finished', personalGrade: 'S', ratingOrder: 1 }), work('r3', '通关 Gamma', { gamePlayState: 'cleared', status: 'finished', personalGrade: 'S', ratingOrder: 2 }), work('r-top', '最高个人评级', { gamePlayState: 'cleared', status: 'finished', personalGrade: 'SSS' }),
  work('hidden', '隐藏作品', { playPriority: 'A', priorityOrder: 7, hiddenAt: '2026-01-03T00:00:00Z' }), work('trash', '回收作品', { playPriority: 'A', priorityOrder: 6, removedAt: '2026-01-03T00:00:00Z' }), work('book', '书籍样例', { category: 'book', subcategory: '文学', gamePlayState: undefined }),
] };
let baseline = JSON.stringify(fixture);
report.distAssets = [...fs.readFileSync(path.join(dist, 'index.html'), 'utf8').matchAll(/(?:src|href)="((?:\.\/|\/)?assets\/[^\"]+\.(?:js|css))"/g)].map(m => ({ path: m[1], sha256: sha(fs.readFileSync(path.join(dist, m[1]))) }));
fs.mkdirSync(output, { recursive: true });
let browser, server, base, context, page, mode, stage;
const raw = () => page.evaluate(key => localStorage.getItem(key), mode === 'bridge' ? 'qiyu.test.ranks.library' : 'qiyu.library.v1');
const data = async () => JSON.parse(await raw());
const saves = () => page.evaluate(() => window.__rankSaveAttempts);
const group = label => page.locator('.ranked-gallery__group').filter({ has: page.locator('summary strong').getByText(label, { exact: true }) });
const rankIds = scope => scope.locator('[data-rank-item]').evaluateAll(elements => elements.map(element => element.dataset.rankItem));
const tile = id => page.locator(`[data-rank-item="${id}"]`);
const sort = () => page.getByRole('combobox', { name: '排序方式', exact: true });
async function check(name, run) { stage = `${mode}: ${name}`; await run(); report.checks.push(stage); console.log(`PASS ${stage}`); }
async function capture(name) { await page.screenshot({ path: path.join(output, mode + '-' + name + '.png'), caret: 'hide' }); report.screenshots.push(mode + '-' + name + '.png'); }
async function unchanged(name, before, attempts) { const after = await raw(); assert.equal(after, before); if (attempts !== undefined) assert.equal(await saves(), attempts); report.integrity.push({ mode, name, beforeSha256: sha(before), afterSha256: sha(after), same: true }); }
function preserve(before, after, allowedIds, allowedKeys) { assert.deepEqual(after.futureRoot, before.futureRoot); assert.deepEqual(after.items.map(item => item.id), before.items.map(item => item.id)); for (const original of before.items) { const updated = after.items.find(item => item.id === original.id); for (const key of new Set([...Object.keys(original), ...Object.keys(updated)])) if (!allowedIds.includes(original.id) || !allowedKeys.includes(key)) assert.deepEqual(updated[key], original[key], original.id + '.' + key); } }
function serve() { const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2' }; server = http.createServer((req, res) => { const name = new URL(req.url, 'http://127.0.0.1').pathname; if (name === '/favicon.ico') { res.writeHead(204); return res.end(); } let file; try { file = path.resolve(dist, '.' + decodeURIComponent(name === '/' ? '/index.html' : name)); } catch { res.writeHead(400); return res.end(); } if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type':mime[path.extname(file)] || 'application/octet-stream', 'cache-control':'no-store' }); fs.createReadStream(file).pipe(res); }); return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))); }
async function attachPage() { page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => report.errors.push({ stage, message:e.message })); page.on('console', m => { if (m.type() === 'error') report.errors.push({ stage, message:m.text() }); }); await page.route('**/*', route => route.request().url().startsWith(base) || route.request().url().startsWith('data:') ? route.continue() : route.abort()); await page.goto(base); await page.getByRole('heading', { name:'游戏', exact:true }).waitFor(); }
async function prepare(currentMode, width = 1440) {
  mode = currentMode; context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', colorScheme: 'dark' });
  await context.addInitScript(({ initial, mode, version }) => {
    const key = mode === 'bridge' ? 'qiyu.test.ranks.library' : 'qiyu.library.v1', set = Storage.prototype.setItem;
    if (!localStorage.getItem(key)) set.call(localStorage, key, initial);
    set.call(localStorage, 'qiyu.background.v1', JSON.stringify({ enabled: false, hue: 33 })); window.__rankFail = false; window.__rankSaveAttempts = 0;
    Storage.prototype.setItem = function(name, value) { if (name === 'qiyu.library.v1') { window.__rankSaveAttempts++; if (window.__rankFail) throw new DOMException('本测试模拟保存失败', 'QuotaExceededError'); } return set.call(this, name, value); };
    if (mode === 'bridge') { let revision = 'rank-isolated-0', count = 0; window.qiyuDesktop = { getInfo: () => ({ version, dataDirectory: 'ISOLATED_NO_FILES', windowVisible: true }), loadLibrary: () => ({ ok: true, value: { snapshot: JSON.parse(localStorage.getItem(key)), revision } }), saveLibrary: (snapshot, expected) => { window.__rankSaveAttempts++; if (window.__rankFail) return { ok: false, error: '本测试模拟保存失败' }; if (expected !== revision) return { ok: false, error: '隔离修订号冲突' }; set.call(localStorage, key, JSON.stringify(snapshot)); revision = `rank-isolated-${++count}`; return { ok: true, value: { revision } }; }, onWindowVisibility: () => () => {}, openDataDirectory: () => {} }; }
  }, { initial: baseline, mode, version });
  await attachPage(); assert.equal(await raw(), baseline);
}

const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const dialog = name => page.getByRole('dialog', { name, exact: true });
const item = async id => (await data()).items.find(value => value.id === id);
const menu = async title => { await button(`查看${title}详情`).click({ button:'right' }); return page.getByRole('menu', { name:`${title}快捷编辑`, exact:true }); };
async function suite(currentMode) {
 await prepare(currentMode); await button('全部游戏', page.locator('.library-views')).click();
 await check('详情游玩与进度面板改双维度并设评级，进度更新保留未保存感受 (v0.4.24)', async () => {
  await button('查看可见 Alpha详情').click(); const detail = dialog('可见 Alpha详情');
  const writing = detail.getByRole('textbox', { name:'一句话印象', exact:true }); await writing.fill('状态更新仍保留我的草稿');
  // a 为 want（计划游玩）：优先级入口经右键（本检查稍后），先在详情把通关进度改为已通关。
  await button('更改通关进度', detail).click();
  await detail.locator('.completion-options').getByRole('button', { name:'已通关', exact:true }).click();
  assert.equal((await item('a')).completion, 'cleared'); assert.equal(await writing.inputValue(), '状态更新仍保留我的草稿');
  await detail.getByRole('combobox', { name:'我的评级', exact:true }).selectOption('SS');
  assert.equal((await item('a')).personalGrade, 'SS'); assert.equal((await item('a')).playPriority, 'A');
  await capture('detail-grade-inputs'); await button('关闭详情', detail).click();
  assert.equal((await item('a')).impression, '状态更新仍保留我的草稿');
 });
 await check('右键菜单内直接设置等级，浏览与Escape不写入，失败留在原位可重试', async () => {
  // 浏览与 Escape 关闭不产生写入（承接上一检查：已通关、优先级 SSS、评级 SS）。
  const quiet = await raw(), quietAttempts = await saves();
  let m = await menu('可见 Alpha'); await page.keyboard.press('Escape'); await m.waitFor({ state:'hidden' });
  await unchanged('右键浏览与Escape不写入', quiet, quietAttempts);
  // 同值幂等：再次点击当前通关进度（已通关）不重复写库（menuitemradio，通关进度组）。
  const idle = await raw(), idleAttempts = await saves();
  m = await menu('可见 Alpha');
  await m.getByRole('group', { name:'通关进度', exact:true }).getByRole('menuitemradio', { name:'已通关', exact:true }).click();
  await page.waitForTimeout(120);
  assert.equal(await m.getByRole('group', { name:'通关评级', exact:true }).count(), 1);
  await unchanged('同状态重复点击幂等不写入', idle, idleAttempts);
  await page.keyboard.press('Escape'); await m.waitFor({ state:'hidden' });
  // 已通关（进度）作品右键直接出现通关评级行，当前选择高亮；评级只动评级维度，优先级与旧轴保留。
  m = await menu('可见 Alpha');
  assert.equal(await m.getByRole('group', { name:'通关评级', exact:true }).count(), 1);
  assert.equal(await m.getByRole('group', { name:'通关评级', exact:true }).getByRole('menuitemradio', { name:'SS', exact:true }).getAttribute('aria-checked'), 'true');
  await m.getByRole('group', { name:'通关评级', exact:true }).getByRole('menuitemradio', { name:'S', exact:true }).click(); await m.waitFor({ state:'hidden' });
  assert.equal((await item('a')).personalGrade, 'S'); assert.equal((await item('a')).ratingOrder, undefined); assert.equal((await item('a')).playPriority, 'A', '评级不动优先级');
  // 关系改计划游玩（菜单保持打开）：优先级行出现，评级与进度不受影响；通关进度组仍可独立改。
  m = await menu('可见 Alpha');
  await m.getByRole('group', { name:'当前游玩关系', exact:true }).getByRole('menuitemradio', { name:'计划游玩', exact:true }).click();
  assert.equal((await item('a')).playEngagement, undefined, '推导已为计划：同值幂等不写库');
  assert.equal((await item('a')).gamePlayState, 'want', '旧轴冻结');
  assert.equal(await m.getByRole('group', { name:'待体验优先级', exact:true }).count(), 1);
  assert.equal(await m.getByRole('group', { name:'通关评级', exact:true }).count(), 1, '已通关+计划重玩可同时有两种等级行');
  assert.equal((await item('a')).personalGrade, 'S');
  // 未设置只清优先级；再设 S 清同维度手动顺序；旧轴冻结。
  await m.getByRole('group', { name:'待体验优先级', exact:true }).getByRole('menuitemradio', { name:'未设置', exact:true }).click(); await m.waitFor({ state:'hidden' });
  assert.equal((await item('a')).playPriority, undefined); assert.equal((await item('a')).personalGrade, 'S');
  m = await menu('可见 Alpha');
  await m.getByRole('group', { name:'待体验优先级', exact:true }).getByRole('menuitemradio', { name:'S', exact:true }).click(); await m.waitFor({ state:'hidden' });
  assert.equal((await item('a')).playPriority, 'S'); assert.equal((await item('a')).priorityOrder, undefined);
  // 等级保存失败：菜单留在原位、数据不变；重试成功后关闭。
  const before = await raw(); await page.evaluate(() => { window.__rankFail = true; });
  m = await menu('可见 Alpha');
  await m.getByRole('group', { name:'待体验优先级', exact:true }).getByRole('menuitemradio', { name:'SS', exact:true }).click();
  assert.equal(await m.isVisible(), true); await unchanged('右键等级保存失败留在原位', before);
  await page.evaluate(() => { window.__rankFail = false; });
  await m.getByRole('group', { name:'待体验优先级', exact:true }).getByRole('menuitemradio', { name:'SS', exact:true }).click(); await m.waitFor({ state:'hidden' });
  assert.equal((await item('a')).playPriority, 'SS'); assert.equal((await item('a')).personalGrade, 'S');
  // 页面重新打开后菜单读回与已保存内容一致（reload 默认回到规划视图，先切回全部游戏）。
  await page.reload(); await button('全部游戏', page.locator('.library-views')).click();
  m = await menu('可见 Alpha');
  assert.equal(await m.getByRole('group', { name:'待体验优先级', exact:true }).getByRole('menuitemradio', { name:'SS', exact:true }).getAttribute('aria-checked'), 'true');
  await capture('context-inline-grades'); await page.keyboard.press('Escape');
 });
 await check('资料表单双维度与等级资格，保存保留另一评级和感受 (v0.4.24)', async () => {
  await (await menu('可见 Alpha')).getByRole('menuitem', { name:'编辑作品资料', exact:true }).click(); const editor = dialog('编辑作品');
  // v0.4.24：编辑器提供当前游玩关系与通关进度两个下拉；计划游玩资格展示优先级。
  await editor.getByRole('combobox', { name:'当前游玩关系', exact:true }).selectOption('planned');
  await editor.getByRole('combobox', { name:'通关进度', exact:true }).selectOption('cleared');
  await editor.getByRole('combobox', { name:'待体验优先级', exact:true }).selectOption('A');
  await button('保存修改', editor).click(); await editor.waitFor({state:'hidden'});
  assert.equal((await item('a')).playEngagement, 'planned'); assert.equal((await item('a')).completion, 'cleared');
  assert.equal((await item('a')).playPriority, 'A'); assert.equal((await item('a')).personalGrade, 'S');
  assert.equal((await item('a')).gamePlayState, 'want', '旧轴冻结'); 
  assert.equal((await item('a')).review, '个人长文不可误改'); assert.equal((await item('a')).impression, '状态更新仍保留我的草稿');
  await button('展开作品资料', dialog('可见 Alpha详情')).click(); await button('编辑', dialog('可见 Alpha详情').locator('.detail-facts')).click();
  const again = dialog('编辑作品'); await again.getByRole('textbox', { name:'发行年份', exact:true }).fill('2024');
  await button('保存修改', again).click(); await again.waitFor({state:'hidden'});
  assert.equal((await item('a')).playPriority, 'A'); assert.equal((await item('a')).personalGrade, 'S'); assert.equal((await item('a')).playEngagement, 'planned', '未触碰维度保留'); await button('关闭详情', dialog('可见 Alpha详情')).click();
 });
 await check('批量改双维度只改所选游戏，未选与等级字段保留，失败可重试 (v0.4.24)', async () => {
  await button('批量编辑游戏').click(); await button('选择可见 Alpha').click(); await button('选择后台 Beta').click();
  const bar = page.locator('.selection-actionbar');
  const before = await data();
  // 改通关进度=已通关：只写 completion，等级/时长/旧轴不动。
  await button('改通关进度', bar).click(); let edit = page.getByRole('dialog', { name: '更改通关进度', exact: true });
  await button('已通关', edit).click(); await button('应用到 1 款', edit).click(); await edit.waitFor({ state: 'hidden' });  // a 已是已通关：同值跳过
  preserve(before, await data(), ['b'], ['completion','updatedAt']);
  // 批量应用成功会退出多选（既有语义）：每段重新选择。
  const mid = await data();
  await button('批量编辑游戏').click(); await button('选择可见 Alpha').click(); await button('选择后台 Beta').click();
  await button('改当前关系', bar).click(); edit = page.getByRole('dialog', { name: '更改当前关系', exact: true });
  await button('暂时搁置', edit).click(); await button('应用到 2 款', edit).click(); await edit.waitFor({ state: 'hidden' });
  preserve(mid, await data(), ['a','b'], ['playEngagement','updatedAt']);
  // 失败重试：原文不变、对话框保留。
  await button('批量编辑游戏').click(); await button('选择可见 Alpha').click(); await button('选择后台 Beta').click();
  await button('改当前关系', bar).click(); edit = page.getByRole('dialog', { name: '更改当前关系', exact: true });
  await button('计划游玩', edit).click();
  const original = await raw(); await page.evaluate(() => { window.__rankFail = true; });
  await button('应用到 2 款', edit).click(); await edit.getByRole('alert').waitFor(); await unchanged('批量关系失败', original);
  await page.evaluate(() => { window.__rankFail = false; }); await button('应用到 2 款', edit).click(); await edit.waitFor({ state: 'hidden' });
  for (const id of ['a','b']) assert.equal((await item(id)).playEngagement, 'planned');
  for (const old of before.items) if (!['a','b'].includes(old.id)) assert.deepEqual(await item(old.id), old, '未选作品原样');
  await capture('batch-dual-dimension');
 });
 await check('多选工具栏快捷定级：预览计数、结果外提示、失败重试、混合禁用与清除', async () => {
  const before = await data();
  await page.locator('.library-views').getByRole('button', { name: '全部游戏', exact: true }).click();
  // a/b 均计划游玩（eligible 优先级资格）。
  await button('批量编辑游戏').click(); await button('选择可见 Alpha').click(); await button('选择后台 Beta').click();
  const bar = page.locator('.selection-actionbar');
  const selector = bar.getByRole('combobox', { name: '统一待体验优先级', exact: true });
  await selector.selectOption('SS');
  await bar.getByText(/将更新 2 款/).waitFor();
  await capture('bulk-grade-bar');
  // 结果外提示：搜索遮住 Beta。
  await page.getByRole('textbox', { name: '搜索收藏', exact: true }).fill('Alpha');
  await bar.getByText(/1 款在当前结果之外/).waitFor();
  await page.getByRole('textbox', { name: '搜索收藏', exact: true }).fill('');
  const failing = await raw(); await page.evaluate(() => { window.__rankFail = true; });
  await bar.getByRole('button', { name: '应用等级', exact: true }).click();
  await page.getByRole('status').getByText(/保存失败/).waitFor(); await unchanged('快捷定级失败', failing);
  await page.evaluate(() => { window.__rankFail = false; });
  await bar.getByRole('button', { name: '应用等级', exact: true }).click();
  await page.getByRole('status').getByText(/已更新 2 款/).waitFor();
  for (const id of ['a','b']) assert.equal((await item(id)).playPriority, 'SS');
  // 同值禁用；混合状态（加入已通关进度且无历史评级的 r3？——用 x/c 计划+ r1 已通关评级资格）阻断。
  await selector.selectOption('SS');
  await bar.getByText(/已是该等级/).waitFor();
  assert.equal(await bar.getByRole('button', { name: '应用', exact: true }).isDisabled(), true);
  if (await button('退出多选').count()) await button('退出多选').click();
  // 混合：后台 Delta（x：计划+优先级 A、无评级）+ 通关 Beta（r2：已通关+评级 S、无优先级）
  // → 优先级资格与评级资格都不是全集 → 提示且无等级入口。
  await button('批量编辑游戏').click(); await button('选择后台 Delta').click(); await button('选择通关 Beta').click();
  await bar.getByText(/等级资格不一致/).waitFor();
  assert.equal(await bar.getByRole('combobox', { name: '统一待体验优先级', exact: true }).count(), 0);
  await button('退出多选', bar).click();
  preserve(before, await data(), ['a','b'], ['playPriority','priorityOrder','updatedAt']);
 });
 await check('多选快捷评级与清除：通关进度集合同值禁用', async () => {
  await button('批量编辑游戏').click(); await button('选择通关 Alpha').click(); await button('选择通关 Beta').click();
  const bar = page.locator('.selection-actionbar');
  const ratingSelector = bar.getByRole('combobox', { name: '统一通关评级', exact: true });
  await ratingSelector.selectOption('SS');  // r1/r2 均 S → SS 更新 2 款
  await bar.getByText(/将更新 2 款/).waitFor();
  await bar.getByRole('button', { name: '应用等级', exact: true }).click();
  await page.getByRole('status').getByText(/已更新 2 款/).waitFor();
  for (const id of ['r1','r2']) assert.equal((await item(id)).personalGrade, 'SS');
  await ratingSelector.selectOption('clear');
  await bar.getByText(/将更新 2 款/).waitFor();
  await bar.getByRole('button', { name: '应用等级', exact: true }).click();
  await page.getByRole('status').getByText(/已更新 2 款/).waitFor();
  for (const id of ['r1','r2']) assert.equal((await item(id)).personalGrade, undefined);
  await button('退出多选', bar).click();
 });
 await context.close();
}
// N0 回归：默认待体验计划视图（不切全部游戏）。61 件同级 want 合成作品，滚到底把末件改已通关：
// 作品移出列表使内容缩短、scrollTop 被钳制触发 scroll——菜单必须保持并就地出现通关评级行；
// 失败的非 want/cleared 状态保存同样留在原位，成功后关闭。
async function planSuite(currentMode) {
 const items = Array.from({ length: 61 }, (_, index) => work('p' + String(index).padStart(2, '0'), '计划作品 ' + String(index).padStart(2, '0'), { playPriority: 'A' }));
 baseline = JSON.stringify({ schemaVersion: 1, futureRoot: { untouched: ['原文'] }, items });
 await prepare(currentMode);
 await check('规划视图保存致列表缩短不关菜单，末件改通关后仍可就地评级', async () => {
  await page.evaluate(() => { document.querySelector('.main-scroll')?.scrollTo(0, 1e6); });
  await page.waitForTimeout(120);
  const label = await page.locator('.media-card').last().getAttribute('aria-label') ?? '';
  const id = 'p' + label.replace(/^查看计划作品 /, '').replace(/详情$/, '');
  await page.getByRole('button', { name: label, exact: true }).click({ button: 'right' });
  const m = page.getByRole('menu', { name: `计划作品 ${id.slice(1)}快捷编辑`, exact: true });
  await m.waitFor();
  await m.getByRole('group', { name: '通关进度', exact: true }).getByRole('menuitemradio', { name: '已通关', exact: true }).click();
  await page.waitForTimeout(200);
  assert.equal(await m.isVisible(), true, '保存导致列表缩短后菜单不应关闭');
  assert.equal((await item(id)).completion, 'cleared');
  assert.equal((await item(id)).gamePlayState, 'want', '旧轴冻结');
  assert.equal(await m.getByRole('group', { name: '通关评级', exact: true }).count(), 1);
  await capture('plan-inline-grade');
  await m.getByRole('group', { name: '通关评级', exact: true }).getByRole('menuitemradio', { name: 'S', exact: true }).click();
  await m.waitFor({ state: 'hidden' });
  assert.equal((await item(id)).personalGrade, 'S'); assert.equal((await item(id)).playPriority, 'A');
 });
 await check('规划视图失败状态保存留原位可重试，成功后关闭', async () => {
  const before = await raw(); await page.evaluate(() => { window.__rankFail = true; });
  const label = await page.locator('.media-card').last().getAttribute('aria-label') ?? '';
  const id = 'p' + label.replace(/^查看计划作品 /, '').replace(/详情$/, '');
  await page.getByRole('button', { name: label, exact: true }).click({ button: 'right' });
  const m = page.getByRole('menu', { name: `计划作品 ${id.slice(1)}快捷编辑`, exact: true });
  await m.waitFor();
  await m.getByRole('group', { name: '当前游玩关系', exact: true }).getByRole('menuitemradio', { name: '游玩中', exact: true }).click();
  await page.waitForTimeout(120);
  assert.equal(await m.isVisible(), true, '状态保存失败菜单应留在原位');
  await unchanged('规划视图失败状态保存原文不变', before);
  await page.evaluate(() => { window.__rankFail = false; });
  await m.getByRole('group', { name: '当前游玩关系', exact: true }).getByRole('menuitemradio', { name: '游玩中', exact: true }).click();
  await page.waitForTimeout(200);
  assert.equal((await item(id)).playEngagement, 'playing');
  assert.equal(await m.isVisible(), true, 'v0.4.24：关系保存成功后菜单保持打开供继续调整');
  await page.keyboard.press('Escape'); await m.waitFor({ state: 'hidden' });
 });
 await context.close();
}
(async () => { try {
 base = await serve(); browser = await chromium.launch({channel:'msedge',headless:true}); await suite('browser'); await suite('bridge'); await planSuite('browser'); await planSuite('bridge'); assert.deepEqual(report.errors, []); report.passed=true;
} catch(error) { report.failure={stage,message:error.message,stack:error.stack}; process.exitCode=1; console.error(error.stack);
} finally { if(browser) await browser.close(); if(server) await new Promise(resolve=>server.close(resolve)); report.timestamp=new Date().toISOString(); fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,failure:report.failure})); } })();
