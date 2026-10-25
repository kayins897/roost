const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const output = path.join(root, 'evidence', 'game-progress');
const report = { passed: false, isolatedDataOnly: true, realUserDataAccessed: false, checks: [], errors: [] };
const work = (id, extra = {}) => ({ id, title: `进度示例 ${id}`, category: 'game', subcategory: 'Steam', creator: '合成示例', year: '2024', status: 'want', gamePlayState: 'want', platforms: ['Steam'], tags: [], gameTags: { gameplay: [], theme: [], scenario: [], other: [] }, impression: '保留原印象', favorite: false, artwork: 'outer', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', futureItem: { value: id }, ...extra });
const fixture = { schemaVersion: 1, futureRoot: { keep: true }, items: [
  work('unknown', { completion: 'not-cleared', playtimeMinutes: 3600 }),
  work('zero', { completionCount: 0 }),
  work('na', { playEngagement: 'playing', completion: 'not-applicable' }),
  work('both-a', { gamePlayState: 'cleared', status: 'finished', playEngagement: 'planned', personalGrade: 'S', playPriority: 'A', ratingOrder: 0 }),
  work('both-b', { gamePlayState: 'want', playEngagement: 'planned', completion: 'cleared', personalGrade: 'S', playPriority: 'A', ratingOrder: 1 }),
  work('playing-cleared', { gamePlayState: 'playing', status: 'active', playEngagement: 'playing', completion: 'cleared', personalGrade: 'S', ratingOrder: 2 }),
] };
let server, browser, context, page, mode, base;
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem(window.__progressKey)));
const item = async id => (await data()).items.find(value => value.id === id);
const open = async id => { await button(`查看进度示例 ${id}详情`).click(); return page.getByRole('dialog', { name: `进度示例 ${id}详情`, exact: true }); };
const close = detail => button('关闭详情', detail).click();
async function check(name, run) { await run(); report.checks.push(`${mode}: ${name}`); console.log(`PASS ${mode}: ${name}`); }
async function prepare(currentMode) {
  mode = currentMode;
  context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  await context.addInitScript(({ fixture, mode }) => {
    const key = mode === 'bridge' ? 'qiyu.test.progress' : 'qiyu.library.v1';
    const set = Storage.prototype.setItem;
    if (!localStorage.getItem(key)) set.call(localStorage, key, JSON.stringify(fixture));
    set.call(localStorage, 'qiyu.background.v1', JSON.stringify({ enabled: false }));
    window.__progressKey = key; window.__failProgress = false; window.__progressAttempts = [];
    if (mode === 'bridge') {
      let revision = 'isolated-0', count = 0;
      window.qiyuDesktop = {
        getInfo: () => ({ version: '0.4.24', dataDirectory: 'ISOLATED_MEMORY_ONLY', windowVisible: true }),
        loadLibrary: () => ({ ok: true, value: { snapshot: JSON.parse(localStorage.getItem(key)), revision } }),
        saveLibrary: (snapshot, expected) => { window.__progressAttempts.push(JSON.parse(JSON.stringify(snapshot))); if (window.__failProgress) return { ok: false, error: '隔离保存失败' }; if (expected !== revision) return { ok: false, error: '隔离修订冲突' }; set.call(localStorage, key, JSON.stringify(snapshot)); revision = `isolated-${++count}`; return { ok: true, value: { revision } }; },
        onWindowVisibility: () => () => {},
      };
    } else Storage.prototype.setItem = function(name, value) { if (name === key) { window.__progressAttempts.push(JSON.parse(value)); if (window.__failProgress) throw new DOMException('隔离保存失败', 'QuotaExceededError'); } return set.call(this, name, value); };
  }, { fixture, mode });
  page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.errors.push(`${mode}: ${error.message}`));
  await page.route('**/*', route => route.request().url().startsWith(base) || route.request().url().startsWith('data:') ? route.continue() : route.abort());
  await page.goto(base); await button('全部游戏', page.locator('.library-views')).click();
}
async function suite(currentMode) {
  await prepare(currentMode);
  await check('浏览、同值状态与等级无写入；详情双等级入口', async () => {
    const before = JSON.stringify(await data());
    const detail = await open('both-a');
    assert.equal(await detail.getByRole('combobox', { name: '待体验优先级', exact: true }).inputValue(), 'A');
    assert.equal(await detail.getByRole('combobox', { name: '我的评级', exact: true }).inputValue(), 'S');
    await detail.locator('.game-state-options').getByRole('button', { name: '计划游玩', exact: true }).click();
    await detail.locator('.completion-options').getByRole('button', { name: '已通关', exact: true }).click();
    await close(detail); assert.equal(JSON.stringify(await data()), before);
    assert.equal(await page.evaluate(() => window.__progressAttempts.length), 0);
  });
  await check('未知累计显式填5，失败保留草稿和事件ID，重试后精确撤销', async () => {
    const detail = await open('unknown'); await button('记录一次完成', detail).click();
    await detail.getByRole('textbox', { name: '实际完成日期', exact: true }).fill('2023');
    await detail.getByRole('textbox', { name: '完成备注', exact: true }).fill('二周目');
    await detail.getByRole('combobox', { name: '累计次数处理', exact: true }).selectOption('set');
    await detail.getByRole('textbox', { name: '包含本次的累计值', exact: true }).fill('5');
    await page.evaluate(() => window.__failProgress = true);
    await button('保存这条完成记录', detail).click();
    assert.equal((await item('unknown')).completionCount, undefined);
    const failedId = await page.evaluate(() => window.__progressAttempts.at(-1).items.find(value => value.id === 'unknown').completionEvents[0].id);
    assert.equal(await detail.getByRole('textbox', { name: '包含本次的累计值', exact: true }).inputValue(), '5');
    await page.evaluate(() => window.__failProgress = false); await button('保存这条完成记录', detail).click();
    const saved = await item('unknown'); assert.equal(saved.completionCount, 5); assert.equal(saved.completionEvents.length, 1); assert.equal(saved.completionEvents[0].id, failedId); assert.equal(saved.completionEvents[0].occurredAt, '2023'); assert.equal(saved.completion, 'cleared');
    await button('撤销本次', detail).click(); const undone = await item('unknown'); assert.equal(undone.completionCount, undefined); assert.equal(undone.completion, 'not-cleared'); assert.equal(undone.completionEvents.length, 0); assert.equal(undone.playtimeMinutes, 3600); await close(detail);
  });
  await check('已知0同步加1后撤销仍为0；不适用默认不强改', async () => {
    let detail = await open('zero'); await button('记录一次完成', detail).click();
    await detail.getByRole('combobox', { name: '累计次数处理', exact: true }).selectOption('increment'); await button('保存这条完成记录', detail).click();
    assert.equal((await item('zero')).completionCount, 1); await button('撤销本次', detail).click(); assert.equal((await item('zero')).completionCount, 0); assert.equal((await item('zero')).completion, undefined); await close(detail);
    detail = await open('na'); await button('记录一次完成', detail).click(); assert.equal(await detail.getByRole('checkbox').isChecked(), false); await button('保存这条完成记录', detail).click();
    assert.equal((await item('na')).completion, 'not-applicable'); assert.equal((await item('na')).completionCount, undefined); assert.equal((await item('na')).completionEvents[0].occurredAt, undefined); await close(detail);
  });
  await check('事件清空日期备注生效；删除默认保留累计，显式修正可同笔提交', async () => {
    const detail = await open('unknown'); await button('记录一次完成', detail).click();
    await detail.getByRole('textbox', { name: '实际完成日期', exact: true }).fill('2023'); await detail.getByRole('textbox', { name: '完成备注', exact: true }).fill('旧备注'); await detail.getByRole('combobox', { name: '累计次数处理', exact: true }).selectOption('set'); await detail.getByRole('textbox', { name: '包含本次的累计值', exact: true }).fill('3'); await button('保存这条完成记录', detail).click();
    await button('编辑完成记录2023', detail).click(); await detail.getByRole('textbox', { name: '完成日期', exact: true }).fill(''); await detail.getByRole('textbox', { name: '完成备注', exact: true }).fill(''); await button('保存修改', detail).click();
    assert.equal((await item('unknown')).completionEvents[0].occurredAt, undefined); assert.equal((await item('unknown')).completionEvents[0].note, undefined); assert.equal((await item('unknown')).completionCount, 3);
    await button('删除完成记录', detail).click(); await button('确认删除完成事件', detail).click(); assert.equal((await item('unknown')).completionCount, 3);
    await button('记录一次完成', detail).click(); await button('保存这条完成记录', detail).click(); await button('删除完成记录', detail).click(); await detail.getByRole('checkbox', { name: '同时把累计次数修正为', exact: true }).check(); await detail.getByRole('textbox', { name: '删除后累计次数', exact: true }).fill('2'); await button('确认删除完成事件', detail).click(); assert.equal((await item('unknown')).completionCount, 2); await close(detail);
  });
  await check('双资格多选可分别批量设置优先级和评级，保留另一维度', async () => {
    await button('批量编辑游戏').click(); await button('选择进度示例 both-a').click(); await button('选择进度示例 both-b').click();
    await page.getByRole('combobox', { name: '批量等级维度', exact: true }).selectOption('rating'); await page.getByRole('combobox', { name: '统一通关评级', exact: true }).selectOption('SS'); await button('应用等级').click(); assert.equal((await item('both-a')).personalGrade, 'SS'); assert.equal((await item('both-b')).playPriority, 'A');
    await page.getByRole('combobox', { name: '批量等级维度', exact: true }).selectOption('priority'); await page.getByRole('combobox', { name: '统一待体验优先级', exact: true }).selectOption('S'); await button('应用等级').click(); assert.equal((await item('both-a')).playPriority, 'S'); assert.equal((await item('both-a')).personalGrade, 'SS'); await button('退出多选').click();
  });
  await check('相同评级不同当前关系允许键盘移动与封面拖动', async () => {
    const detail = await open('playing-cleared'); await detail.getByRole('combobox', { name: '我的评级', exact: true }).selectOption('SS'); await close(detail);
    await page.getByRole('button', { name: '已通关', exact: true }).click();
    const moving = button('上移《进度示例 playing-cleared》'); assert.equal(await moving.isEnabled(), true); await moving.focus(); await moving.press('Enter');
    const rankGroup = page.locator('.ranked-gallery__group').filter({ has: page.getByText('个人评级 SS', { exact: true }) });
    const ids = () => rankGroup.locator('[data-rank-item]').evaluateAll(nodes => nodes.map(node => node.dataset.rankItem));
    assert.deepEqual(await ids(), ['both-a', 'playing-cleared', 'both-b']);
    await page.locator('[data-rank-item="playing-cleared"]').dragTo(page.locator('[data-rank-item="both-a"]'));
    assert.deepEqual(await ids(), ['playing-cleared', 'both-a', 'both-b']);
    await page.locator('[data-rank-item="both-a"]').hover(); await button('上移《进度示例 both-a》').click();
    assert.deepEqual(await ids(), ['both-a', 'playing-cleared', 'both-b']);
  });
  await check('新建时选择已通关可直接评级', async () => {
    await button('收录作品').click(); const editor = page.getByRole('dialog', { name: '收录新作品', exact: true });
    await editor.getByRole('combobox', { name: '通关进度', exact: true }).selectOption('cleared'); assert.equal(await editor.getByRole('combobox', { name: '通关评级', exact: true }).count(), 1);
    await editor.getByRole('combobox', { name: '通关进度', exact: true }).selectOption('not-applicable'); assert.equal(await editor.getByRole('combobox', { name: '通关评级', exact: true }).count(), 1);
    page.once('dialog', dialog => dialog.accept()); await button('取消', editor).click();
  });
  await page.screenshot({ path: path.join(output, `${mode}-progress.png`) });
  assert.equal(report.errors.length, 0); await context.close();
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  server = http.createServer((req, res) => { const pathname = new URL(req.url, 'http://localhost').pathname; const file = path.resolve(dist, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname)); if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'msedge', headless: true }); await suite('browser'); await suite('bridge'); report.passed = true;
})().catch(error => { report.error = error.stack; console.error(error); process.exitCode = 1; }).finally(async () => { fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2)); await context?.close().catch(() => {}); await browser?.close().catch(() => {}); server?.close(); });
