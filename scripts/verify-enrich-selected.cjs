// N3 多选补齐 Steam 资料专项：浏览器 + mock 桌面桥（enrich 走注入桩，网络层由 verify-steam-connect 的真实 Electron mock 覆盖）。
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), version = require('../package.json').version;
const output = path.join(root, 'evidence', `enrich-selected-v${version.replaceAll('.', '')}`);
const report = { passed: false, version, isolatedDataOnly: true, userLibraryAccessed: false, checks: [], screenshots: [], errors: [], notes: ['浏览器真实 LocalStorageRepository + 注入 mock desktopBridge（enrichSteamLibrary 为合成桩，不发起真实网络；IPC 真实链路由 Electron 专项 verify-steam-connect 覆盖）。不访问真实 AppData/QIYU。'] };
const work = (id, title, extra = {}) => ({ id, title, category: 'game', subcategory: 'Steam', creator: '', year: '', status: 'want', gamePlayState: 'want', platforms: ['Steam'], tags: [], gameTags: { gameplay: [], theme: [], scenario: [], other: [] }, impression: '个人印象' + id, playtimeMinutes: 77, favorite: false, artwork: 'default', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...extra });
const fixture = { schemaVersion: 1, items: [
  work('g1', '补资料一', { externalIds: [{ provider: 'steam', id: '100' }] }),
  work('g2', '补资料二', { creator: '我的开发商', externalIds: [{ provider: 'steam', id: '200' }] }),
  work('g3', '无编号游戏'),
  work('g4', '双编号游戏', { externalIds: [{ provider: 'steam', id: '300' }, { provider: 'steam', id: '301' }] }),
] };
let browser, server, base, page, stage;
const raw = () => page.evaluate(() => localStorage.getItem('qiyu.library.v1'));
const data = async () => JSON.parse(await raw());
const byId = async id => (await data()).items.find(item => item.id === id);
async function check(name, run) { stage = name; await run(); report.checks.push(stage); console.log(`PASS ${stage}`); }
async function capture(name) { await page.screenshot({ path: path.join(output, name + '.png'), caret: 'hide' }); report.screenshots.push(name + '.png'); }
function serve() { const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }; server = http.createServer((req, res) => { const name = new URL(req.url, 'http://127.0.0.1').pathname; let file; try { file = path.resolve(dist, '.' + decodeURIComponent(name === '/' ? '/index.html' : name)); } catch { res.writeHead(400); return res.end(); } if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(file).pipe(res); }); return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))); }
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
async function selectGames(titles) {
  if (await button('退出多选').count()) await button('退出多选').click();
  await button('批量编辑游戏').click();
  for (const title of titles) await button(`选择${title}`).click();
}
(async () => { try {
  fs.mkdirSync(output, { recursive: true });
  base = await serve(); browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', colorScheme: 'dark' });
  await context.addInitScript(({ initial }) => {
    localStorage.setItem('qiyu.library.v1', initial);
    localStorage.setItem('qiyu.background.v1', JSON.stringify({ enabled: false, hue: 33 }));
    window.__enrichCalls = []; window.__enrichFail = false;
    let revision = 'enrich-0', count = 0; const set = Storage.prototype.setItem;
    // mock 桌面桥：enrich 为合成桩（记录请求并返回补缺资料）；保存走真实修订链。
    window.qiyuDesktop = {
      getInfo: () => ({ version: 'test', dataDirectory: 'ISOLATED', windowVisible: true }),
      loadLibrary: () => ({ ok: true, value: { snapshot: JSON.parse(localStorage.getItem('qiyu.library.v1')), revision } }),
      saveLibrary: (snapshot, expected) => { if (expected !== revision) return { ok: false, error: '隔离修订号冲突' }; set.call(localStorage, 'qiyu.library.v1', JSON.stringify(snapshot)); revision = `enrich-${++count}`; return { ok: true, value: { revision } }; },
      enrichSteamLibrary: games => {
        window.__enrichCalls.push(games.map(game => ({ appId: game.appId, creator: game.creator, coverUrl: game.coverUrl })));
        if (window.__enrichFail) return Promise.resolve({ ok: false, error: '模拟读取失败' });
        return Promise.resolve({ ok: true, value: { games: [
          { appId: '100', title: '补资料一', creator: '来源工作室', year: '2020', coverUrl: 'data:image/jpeg;base64,bW9jaw==' },
          { appId: '200', title: '补资料二', creator: '来源工作室', year: '2021' },
        ], missingCovers: 0, missingDetails: 0, cancelled: false, detailsRateLimited: false } });
      },
      cancelSteamRequest: () => {}, onSteamProgress: () => () => {}, onWindowVisibility: () => () => {}, openDataDirectory: () => {},
    };
  }, { initial: JSON.stringify(fixture) });
  page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.errors.push({ stage, message: error.message }));
  await page.goto(base); await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();

  await check('补齐只发合格 AppID，预览列出将补字段，确认后仅补缺失', async () => {
    await selectGames(['补资料一', '补资料二', '无编号游戏', '双编号游戏']);
    await button('补齐 Steam 资料').click();
    const dlg = page.getByRole('dialog', { name: '补齐 Steam 资料', exact: true }); await dlg.waitFor();
    await dlg.getByText('无编号游戏：没有确切 Steam AppID').waitFor();
    await dlg.getByText('双编号游戏：关联多个 Steam AppID').waitFor();
    await button('开始读取', dlg).click();
    await dlg.locator('.steam-import-rows').waitFor();
    await capture('enrich-preview');
    // 请求只含 100/200，且现有值（我的开发商）已预填入请求，来源不会覆盖它。
    const calls = await page.evaluate(() => window.__enrichCalls);
    assert.deepEqual(calls[0].map(game => game.appId), ['100', '200'], '请求只含唯一确切 AppID');
    assert.equal(calls[0][1].creator, '我的开发商', '现有开发商预填入请求');
    const rows = await dlg.locator('.steam-import-row small').allTextContents();
    assert.ok(rows.some(text => text.includes('开发商') && text.includes('发行年份') && text.includes('封面')), '补资料一将补三字段');
    assert.ok(rows.some(text => text.includes('发行年份') && !text.includes('开发商')), '补资料二只补年份');
    const before = await data();
    await button('补齐选中的 2 款', dlg).click();
    await dlg.waitFor({ state: 'hidden' });
    const after = await data();
    assert.equal(after.items.length, before.items.length, '不新增作品');
    const g1 = await byId('g1'), g2 = await byId('g2');
    assert.equal(g1.creator, '来源工作室'); assert.equal(g1.year, '2020'); assert.ok(g1.coverUrl.startsWith('data:image/jpeg'));
    assert.equal(g2.creator, '我的开发商', '用户已填开发商不被覆盖'); assert.equal(g2.year, '2021');
    assert.equal(g2.playtimeMinutes, 77, '时长不变'); assert.equal(g2.impression, '个人印象g2');
    assert.equal(g1.gamePlayState, 'want', '状态不变');
  });
  await check('重复执行识别已齐全，取消与失败不写入', async () => {
    await selectGames(['补资料一']);
    await button('补齐 Steam 资料').click();
    const dlg = page.getByRole('dialog', { name: '补齐 Steam 资料', exact: true }); await dlg.waitFor();
    // 失败一次：报错回初始态，原文不变。
    await page.evaluate(() => { window.__enrichFail = true; });
    const before = await raw();
    await button('开始读取', dlg).click();
    await dlg.getByRole('alert').waitFor();
    assert.equal(await raw(), before, '读取失败不写入');
    await page.evaluate(() => { window.__enrichFail = false; });
    await button('开始读取', dlg).click();
    await dlg.locator('.steam-import-rows').waitFor();
    assert.ok(await dlg.getByText('资料已齐全').count() >= 1, '重复执行识别已齐全');
    assert.equal(await button('补齐选中的 0 款', dlg).isDisabled(), true, '无更新时应用禁用');
    // 取消不写入。
    await dlg.getByRole('button', { name: /取消不写入/ }).click();
    await dlg.waitFor({ state: 'hidden' });
    assert.equal(await raw(), before, '取消不写入');
  });
  await context.close();
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) { report.failure = { stage, message: error.message, stack: error.stack }; process.exitCode = 1; console.error(error.stack);
} finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); report.timestamp = new Date().toISOString(); fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failure: report.failure })); } })();
