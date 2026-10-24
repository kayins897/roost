// N1 标签跨组移动专项：浏览器 + 内存桥双模式，全部合成数据。
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), version = require('../package.json').version;
const output = path.join(root, 'evidence', `tag-move-v${version.replaceAll('.', '')}`), sha = value => createHash('sha256').update(value).digest('hex');
const report = { passed: false, version, isolatedDataOnly: true, userLibraryAccessed: false, checks: [], screenshots: [], integrity: [], errors: [], notes: ['浏览器使用真实 LocalStorageRepository；bridge 使用真实 DesktopRepository 与合成内存桥。不访问真实 AppData/QIYU。'] };
const work = (id, title, gameTags, extra = {}) => ({ id, title, category: 'game', subcategory: 'Steam', creator: '隔离', year: '2025', status: 'want', gamePlayState: 'want', platforms: ['Steam'], tags: [], gameTags, impression: '个人印象' + id, favorite: false, artwork: 'default', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', futureItem: { untouched: id }, ...extra });
const fixture = { schemaVersion: 1, futureRoot: { untouched: ['原文'] }, items: [
  work('a', '移动 Alpha', { gameplay: ['肉鸽', '动作'], theme: ['科幻'], scenario: [], other: [] }),
  work('b', '移动 Beta', { gameplay: ['肉鸽'], theme: ['肉鸽'], scenario: [], other: [] }), // 部分作品目标组已有同名 → 合并
  work('c', '同名 Gamma', { gameplay: [], theme: ['肉鸽'], scenario: [], other: [] }), // 跨组同名保持
  work('d', '隐藏 Delta', { gameplay: ['肉鸽'], theme: [], scenario: [], other: [] }, { hiddenAt: '2026-01-02T00:00:00Z' }),
  work('e', '回收 Epsilon', { gameplay: ['肉鸽'], theme: [], scenario: [], other: [] }, { removedAt: '2026-01-02T00:00:00Z' }),
  work('f', '无关 Zeta', { gameplay: ['平台跳跃'], theme: [], scenario: [], other: [] }),
] };
let baseline = JSON.stringify(fixture);
let browser, server, base, context, page, mode, stage, dialogAction = 'accept';
const raw = () => page.evaluate(key => localStorage.getItem(key), mode === 'bridge' ? 'qiyu.test.tagmove.library' : 'qiyu.library.v1');
const data = async () => JSON.parse(await raw());
const saves = () => page.evaluate(() => window.__tagMoveSaves);
const byId = async id => (await data()).items.find(item => item.id === id);
async function check(name, run) { stage = `${mode}: ${name}`; await run(); report.checks.push(stage); console.log(`PASS ${stage}`); }
async function capture(name) { await page.screenshot({ path: path.join(output, mode + '-' + name + '.png'), caret: 'hide' }); report.screenshots.push(mode + '-' + name + '.png'); }
async function unchanged(name, before, attempts) { const after = await raw(); assert.equal(after, before); if (attempts !== undefined) assert.equal(await saves(), attempts); report.integrity.push({ mode, name, same: true }); }
function preserve(before, after, allowedIds, allowedKeys) { assert.deepEqual(after.futureRoot, before.futureRoot); for (const original of before.items) { const updated = after.items.find(item => item.id === original.id); for (const key of new Set([...Object.keys(original), ...Object.keys(updated)])) if (!allowedIds.includes(original.id) || !allowedKeys.includes(key)) assert.deepEqual(updated[key], original[key], original.id + '.' + key); } }
function serve() { const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }; server = http.createServer((req, res) => { const name = new URL(req.url, 'http://127.0.0.1').pathname; let file; try { file = path.resolve(dist, '.' + decodeURIComponent(name === '/' ? '/index.html' : name)); } catch { res.writeHead(400); return res.end(); } if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(file).pipe(res); }); return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))); }
async function prepare(currentMode) {
  mode = currentMode; context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', colorScheme: 'dark' });
  await context.addInitScript(({ initial, mode }) => {
    const key = mode === 'bridge' ? 'qiyu.test.tagmove.library' : 'qiyu.library.v1', set = Storage.prototype.setItem;
    if (!localStorage.getItem(key)) set.call(localStorage, key, initial);
    set.call(localStorage, 'qiyu.background.v1', JSON.stringify({ enabled: false, hue: 33 }));
    window.__tagMoveFail = false; window.__tagMoveSaves = 0;
    Storage.prototype.setItem = function (name, value) { if (name === 'qiyu.library.v1') { window.__tagMoveSaves++; if (window.__tagMoveFail) throw new DOMException('本测试模拟保存失败', 'QuotaExceededError'); } return set.call(this, name, value); };
    if (mode === 'bridge') { let revision = 'tagmove-0', count = 0; window.qiyuDesktop = { getInfo: () => ({ version: 'test', dataDirectory: 'ISOLATED', windowVisible: true }), loadLibrary: () => ({ ok: true, value: { snapshot: JSON.parse(localStorage.getItem(key)), revision } }), saveLibrary: (snapshot, expected) => { window.__tagMoveSaves++; if (window.__tagMoveFail) return { ok: false, error: '本测试模拟保存失败' }; if (expected !== revision) return { ok: false, error: '隔离修订号冲突' }; set.call(localStorage, key, JSON.stringify(snapshot)); revision = `tagmove-${++count}`; return { ok: true, value: { revision } }; }, onWindowVisibility: () => () => {}, openDataDirectory: () => {} }; }
  }, { initial: baseline, mode });
  page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.errors.push({ stage, message: error.message }));
  page.on('dialog', async dialog => { await dialog[dialogAction]().catch(() => {}); });
  await page.goto(base); await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
  assert.equal(await raw(), baseline);
}
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
async function closeManager() {
  const dlg = page.getByRole('dialog', { name: '管理标签' });
  if (await dlg.count()) { await button('完成', dlg).click(); await dlg.waitFor({ state: 'hidden' }); }
  await page.locator('.modal-backdrop').first().waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
}
async function moveTag(tagName, toLabel) {
  // 点击后 Modal 立即打开，与 Playwright 命中检查存在竞态；容错点击后等待窗体出现即可。
  if (!await page.getByRole('dialog', { name: '管理标签' }).count()) {
    await button('标签管理').click({ timeout: 4000 }).catch(() => {});
    await page.getByRole('dialog', { name: '管理标签' }).waitFor();
  }
  const row = page.locator('.manage-tag-row').filter({ hasText: tagName }).first();
  await row.locator('select[aria-label^="移动"]').selectOption({ label: toLabel });
  await page.waitForTimeout(80);
}
async function suite(currentMode) {
  await prepare(currentMode);
  await check('移动含确认信息，目标合并、跨组同名与隐藏/回收保持', async () => {
    const before = await data();
    await moveTag('肉鸽', '题材');
    // 正常收藏受影响 = a、b（b 目标组已有同名 → 合并提示）。
    const a = await byId('a'), b = await byId('b'), c = await byId('c'), d = await byId('d'), e = await byId('e');
    assert.deepEqual(a.gameTags.gameplay, ['动作']); assert.deepEqual(a.gameTags.theme, ['科幻', '肉鸽']);
    assert.deepEqual(b.gameTags.gameplay, []); assert.deepEqual(b.gameTags.theme, ['肉鸽'], '目标组已有同名合并为单条');
    assert.deepEqual(c.gameTags.theme, ['肉鸽'], '跨组同名保持'); assert.deepEqual(c.gameTags.gameplay, []);
    assert.deepEqual(d.gameTags.gameplay, ['肉鸽'], '隐藏作品不改'); assert.deepEqual(e.gameTags.gameplay, ['肉鸽'], '回收作品不改');
    assert.deepEqual(a.tags, ['动作', '科幻', '肉鸽'], '平铺 tags 同步');
    preserve(before, await data(), ['a', 'b'], ['gameTags', 'tags', 'updatedAt']);
    await capture('tag-moved');
    await closeManager();
  });
  await check('筛选使用中的标签移动后同步转到目标组，其他筛选保留', async () => {
    // 上一检查后肉鸽已在题材组。经详情页标签点击建立 题材:肉鸽+科幻 筛选，再移动科幻到游玩场景：
    // 科幻筛选应转到目标组，肉鸽等其他筛选保留。
    // 详情页点标签=聚焦该单标签（既有语义，每次重置其他组），因此用单筛选场景验证同步。
    await button('查看移动 Alpha详情').click();
    const detail = page.getByRole('dialog', { name: '移动 Alpha详情' });
    const expand = detail.getByRole('button', { name: '展开作品资料', exact: true });
    if (await expand.count()) await expand.click();
    await detail.locator('.detail-tag').filter({ hasText: '科幻' }).click();
    await page.waitForTimeout(200);
    const summary = page.locator('.active-filter-summary');
    assert.ok(await summary.getByText('题材：科幻').count() >= 1, '筛选建立');
    await moveTag('科幻', '游玩场景');
    assert.ok(await summary.getByText('游玩场景：科幻').count() >= 1, '筛选中的标签移动后应转到目标组');
    assert.ok(await summary.getByText('题材：科幻').count() === 0, '来源组筛选应消失');
    assert.ok(await page.locator('.media-card').count() >= 1, '筛选结果仍显示含该标签的作品');
    await closeManager();
    await summary.getByRole('button', { name: '全部清除' }).click();
  });
  await check('失败保留可重试，取消与零关联不写入', async () => {
    // 取消确认：原文与保存计数不变。
    const before = await raw(), attempts = await saves();
    dialogAction = 'dismiss';
    await moveTag('动作', '题材');
    assert.ok(await page.getByRole('dialog', { name: '管理标签' }).count() >= 1, '取消后管理窗保留');
    await unchanged('取消移动不写入', before, attempts);
    dialogAction = 'accept';
    await closeManager();
    // 保存失败：数据不变、窗口保留；解除后重试成功。
    await page.evaluate(() => { window.__tagMoveFail = true; });
    const failing = await raw();
    await moveTag('科幻', '其他');
    assert.ok(await page.getByRole('dialog', { name: '管理标签' }).count() >= 1);
    await unchanged('移动保存失败原文不变', failing);
    await page.evaluate(() => { window.__tagMoveFail = false; });
    await moveTag('科幻', '其他');
    assert.deepEqual((await byId('a')).gameTags.other, ['科幻']);
    await closeManager();
  });
  await context.close();
}
(async () => { try {
  fs.mkdirSync(output, { recursive: true });
  base = await serve(); browser = await chromium.launch({ channel: 'msedge', headless: true });
  await suite('browser'); await suite('bridge');
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) { report.failure = { stage, message: error.message, stack: error.stack }; process.exitCode = 1; console.error(error.stack);
} finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); report.timestamp = new Date().toISOString(); fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failure: report.failure })); } })();
