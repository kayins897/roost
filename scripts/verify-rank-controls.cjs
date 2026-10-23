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
 await check('详情状态顺带设置独立优先级和通关评级，状态更新保留未保存感受', async () => {
  await button('查看可见 Alpha详情').click(); const detail = dialog('可见 Alpha详情');
  const writing = detail.getByRole('textbox', { name:'一句话印象', exact:true }); await writing.fill('状态更新仍保留我的草稿');
  await detail.getByRole('combobox', { name:'待体验优先级', exact:true }).selectOption('SSS');
  assert.equal((await item('a')).playPriority, 'SSS'); assert.equal((await item('a')).personalGrade, 'B');
  await button('已通关', detail).click(); assert.equal(await writing.inputValue(), '状态更新仍保留我的草稿');
  await detail.getByRole('combobox', { name:'我的评级', exact:true }).selectOption('SS');
  assert.equal((await item('a')).personalGrade, 'SS'); assert.equal((await item('a')).playPriority, 'SSS');
  await capture('detail-grade-inputs'); await button('关闭详情', detail).click();
  assert.equal((await item('a')).impression, '状态更新仍保留我的草稿');
 });
 await check('右键状态顺带等级，取消保留状态，保存失败保留选择并重试', async () => {
  await (await menu('可见 Alpha')).getByRole('menuitem', { name:'待体验', exact:true }).click(); let quick = dialog('待体验优先级');
  assert.equal((await item('a')).gamePlayState, 'want'); await button('暂不设置', quick).click(); assert.equal((await item('a')).playPriority, 'SSS');
  await (await menu('可见 Alpha')).getByRole('menuitem', { name:'已通关', exact:true }).click(); quick = dialog('通关评级');
  await quick.getByRole('combobox', { name:'通关评级', exact:true }).selectOption('S'); const before = await raw();
  await page.evaluate(() => { window.__rankFail = true; }); await button('保存', quick).click(); await quick.getByRole('alert').waitFor();
  assert.equal(await quick.getByRole('combobox', { name:'通关评级', exact:true }).inputValue(), 'S'); await unchanged('快捷等级保存失败', before);
  await page.evaluate(() => { window.__rankFail = false; }); await button('保存', quick).click(); await quick.waitFor({state:'hidden'});
  assert.equal((await item('a')).personalGrade, 'S'); assert.equal((await item('a')).playPriority, 'SSS');
 });
 await check('资料表单按状态展示等级，保存保留另一评级和感受', async () => {
  await (await menu('可见 Alpha')).getByRole('menuitem', { name:'编辑作品资料', exact:true }).click(); const editor = dialog('编辑作品');
  await editor.getByRole('combobox', { name:/^游玩状态/ }).selectOption('want');
  await editor.getByRole('combobox', { name:'待体验优先级', exact:true }).selectOption('A');
  await button('保存修改', editor).click(); await editor.waitFor({state:'hidden'});
  assert.equal((await item('a')).gamePlayState, 'want'); assert.equal((await item('a')).playPriority, 'A'); assert.equal((await item('a')).personalGrade, 'S');
  assert.equal((await item('a')).review, '个人长文不可误改'); assert.equal((await item('a')).impression, '状态更新仍保留我的草稿');
  await button('展开作品资料', dialog('可见 Alpha详情')).click(); await button('编辑', dialog('可见 Alpha详情').locator('.detail-facts')).click();
  const again = dialog('编辑作品'); await again.getByRole('textbox', { name:'发行年份', exact:true }).fill('2024');
  await button('保存修改', again).click(); await again.waitFor({state:'hidden'});
  assert.equal((await item('a')).playPriority, 'A'); assert.equal((await item('a')).personalGrade, 'S'); await button('关闭详情', dialog('可见 Alpha详情')).click();
 });
 await check('批量等级统一/保留/清除只改所选游戏，失败可重试', async () => {
  await button('批量编辑游戏').click(); await button('选择可见 Alpha').click(); await button('选择后台 Beta').click();
  const bar = page.locator('.selection-actionbar');
  async function applyRank(state, rank) {
   if (!await bar.count()) { await button('批量编辑游戏').click(); await button('选择可见 Alpha').click(); await button('选择后台 Beta').click(); }
   await button('改状态', bar).click(); const edit = dialog('更改状态'); await button(state, edit).click();
   const selector = edit.getByRole('combobox', { name:state === '待体验' ? '待体验优先级' : '通关评级', exact:true });
   await selector.selectOption(rank); return edit;
  }
  const before = await data(); let edit = await applyRank('待体验','SS');
  await button('应用到 2 款', edit).click(); await edit.waitFor({state:'hidden'});
  for (const id of ['a','b']) assert.equal((await item(id)).playPriority, 'SS');
  preserve(before, await data(), ['a','b'], ['playPriority','priorityOrder','status','gamePlayState','updatedAt']);
  edit = await applyRank('已通关','keep'); await button('应用到 2 款', edit).click(); await edit.waitFor({state:'hidden'});
  assert.equal((await item('a')).personalGrade, 'S'); assert.equal((await item('b')).personalGrade, undefined);
  edit = await applyRank('已通关','SSS'); const original = await raw(); await page.evaluate(() => { window.__rankFail = true; });
  await button('应用到 2 款', edit).click(); await edit.getByRole('alert').waitFor(); await unchanged('批量等级失败', original);
  assert.equal(await edit.getByRole('combobox', { name:'通关评级', exact:true }).inputValue(), 'SSS');
  await page.evaluate(() => { window.__rankFail = false; }); await button('应用到 2 款', edit).click(); await edit.waitFor({state:'hidden'});
  for (const id of ['a','b']) { assert.equal((await item(id)).personalGrade,'SSS'); assert.equal((await item(id)).playPriority,'SS'); }
  await capture('batch-ranked'); edit = await applyRank('已通关',''); await button('应用到 2 款', edit).click(); await edit.waitFor({state:'hidden'});
  for (const id of ['a','b']) { assert.equal((await item(id)).personalGrade,undefined); assert.equal((await item(id)).playPriority,'SS'); }
  for (const old of before.items) if (!['a','b'].includes(old.id)) assert.deepEqual(await item(old.id),old);
  if (await button('退出多选').count()) await button('退出多选').click();
 });
 await context.close();
}
(async () => { try {
 base = await serve(); browser = await chromium.launch({channel:'msedge',headless:true}); await suite('browser'); await suite('bridge'); assert.deepEqual(report.errors, []); report.passed=true;
} catch(error) { report.failure={stage,message:error.message,stack:error.stack}; process.exitCode=1; console.error(error.stack);
} finally { if(browser) await browser.close(); if(server) await new Promise(resolve=>server.close(resolve)); report.timestamp=new Date().toISOString(); fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,failure:report.failure})); } })();
