const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');

const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const executablePath = process.argv[2] || path.join(root, 'node_modules/electron/dist/electron.exe');
const packaged = Boolean(process.argv[2]);
const prefix = process.argv[3] ? process.argv[3].replace(/[^a-z0-9-]/gi, '') + '-' : '';
const evidence = path.join(root, 'evidence', `steam-connect-v${version.replaceAll('.', '')}`);
const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-steam-connect-'));
const dataFile = path.join(dataDirectory, 'library.json');
const previousFile = path.join(dataDirectory, 'library.previous.json');
const connectionFile = path.join(dataDirectory, 'steam-connection.json');
const env = { ...process.env, QIYU_E2E: '1', QIYU_TEST_DATA_DIR: dataDirectory };
delete env.ELECTRON_RUN_AS_NODE;
// Deliberately fake fixture credentials; never use a real account or real API key.
// fakeProfile 为专用合成测试SteamID（7656119 + 固定占位段），不属于任何真实账号；外部请求全部在下方拦截并mock。
const fakeKey = 'a1'.repeat(16);
const fakeProfile = '76561198000000001';
const item = (id, title, extra = {}) => ({ id, title, category: 'game', subcategory: 'Steam', platforms: ['Steam'], creator: '', year: '', status: 'paused', gamePlayState: 'paused', playtimeMinutes: 500,
  tags: ['私人标签'], gameTags: { gameplay: ['私人标签'], theme: [], scenario: [], other: [] }, impression: '私人印象保持不变', favorite: true, artwork: 'default',
  experienceEntries: [{ id: `entry-${id}`, date: '2026-01', kind: 'note', note: '私人体验记录', minutes: 9 }], futureItem: { preserve: id }, createdAt: '2020-01-01', updatedAt: '2020-01-01', ...extra });
const completeCover = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const fixture = { schemaVersion: 1, futureRoot: { preserve: true }, items: [
  item('existing-update', '已有游戏', { externalIds: [{ provider: 'steam', id: '1000' }] }),
  item('existing-current', '已齐全的游戏', { externalIds: [{ provider: 'steam', id: '1001' }], sourceUrl: 'https://store.steampowered.com/app/1001/', creator: '本地开发商', year: '2021', coverUrl: completeCover, playtimeMinutes: 17 }),
  item('ambiguous', '同名待确认', { subcategory: 'Switch', platforms: ['Switch'] }),
] };
const baseline = JSON.stringify(fixture, null, 2);
fs.mkdirSync(evidence, { recursive: true });
fs.writeFileSync(dataFile, baseline);
const checks = [], errors = [], rendererRequests = [], screenshots = [], allNetwork = [];
let app, page, failure, stage = '初始化';
const modal = () => page.getByRole('dialog', { name: '连接 Steam', exact: true });
const readSnapshot = () => JSON.parse(fs.readFileSync(dataFile, 'utf8'));
async function check(name, run) { stage = name; await run(); checks.push(name); console.log(`PASS ${name}`); }
async function network() { return app.evaluate(() => globalThis.__qiyuSteamConnectFixture.requests); }
async function setupNetwork() {
  await app.evaluate(({ net, nativeImage }) => {
    const original = net.fetch.bind(net);
    const png = nativeImage.createFromBitmap(Buffer.from([90, 145, 170, 255]), { width: 1, height: 1 }).toPNG();
    const state = { requests: [], extraGame: false };
    globalThis.__qiyuSteamConnectFixture = state;
    net.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url ?? input.toString());
      if (url.protocol === 'file:' || url.protocol === 'qiyu:') return original(input, init);
      // Log only endpoint and AppID. Key-bearing URL/query strings never enter evidence.
      const request = { host: url.hostname, path: url.pathname, credentials: init?.credentials, redirect: init?.redirect };
      if (url.hostname === 'api.steampowered.com' && url.pathname === '/IPlayerService/GetOwnedGames/v1/') {
        request.kind = 'owned'; state.requests.push(request);
        const parameters = JSON.parse(url.searchParams.get('input_json') || '{}');
        // 注意：本回调经 app.evaluate 序列化后在主进程执行，闭包变量不可用，必须用字面量。
        if (url.searchParams.get('key') !== 'a1'.repeat(16) || parameters.steamid !== '76561198000000001') throw new Error('Invalid fixture credential or profile');
        const games = Array.from({ length: state.extraGame ? 482 : 481 }, (_, index) => ({ appid: 1000 + index,
          name: index === 0 ? '已有游戏' : index === 1 ? '已齐全的游戏' : index === 2 ? '同名待确认' : `Steam 测试游戏 ${1000 + index}`,
          playtime_forever: index === 0 ? 100 : index * 17 }));
        return new Response(JSON.stringify({ response: { game_count: games.length, games } }), { headers: { 'content-type': 'application/json' } });
      }
      if (url.hostname === 'store.steampowered.com' && url.pathname === '/api/appdetails') {
        request.kind = 'details'; request.appId = url.searchParams.get('appids'); state.requests.push(request);
        return new Response(JSON.stringify({ [request.appId]: { success: true, data: { type: 'game', name: request.appId === '1000' ? '已有游戏' : request.appId === '1002' ? '同名待确认' : `Steam 测试游戏 ${request.appId}`,
          developers: ['Fixture Developer'], release_date: { date: '1 Jan, 2024' }, header_image: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${request.appId}/header.jpg` } } }), { headers: { 'content-type': 'application/json' } });
      }
      if (url.hostname === 'shared.fastly.steamstatic.com' && /^\/store_item_assets\/steam\/apps\/\d+\/library_600x900\.jpg$/.test(url.pathname)) {
        request.kind = 'cover'; request.appId = url.pathname.split('/')[4]; state.requests.push(request);
        return new Response(png, { headers: { 'content-type': 'image/png' } });
      }
      request.kind = 'unhandled'; state.requests.push(request);
      throw new Error('E2E rejected an unexpected network endpoint');
    };
  });
}
async function launch() {
  app = await electron.launch({ executablePath, args: packaged ? [] : [root], env, timeout: 45000 });
  page = await app.firstWindow(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/i.test(request.url())) rendererRequests.push(new URL(request.url()).origin); });
  await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
  assert.deepEqual(await page.getByRole('navigation', { name: '作品分类' }).getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))), ['游戏', '书籍', '影视', '音乐']);
  assert.equal(await page.evaluate(() => window.qiyuDesktop.getInfo().dataDirectory), dataDirectory);
  await setupNetwork();
}
async function openConnection() {
  await page.locator('.collection-title').getByRole('button', { name: '连接 Steam', exact: true }).click();
  await modal().getByRole('textbox', { name: 'Steam 主页链接或 SteamID64', exact: true }).waitFor();
  await modal().getByRole('textbox', { name: 'Steam 主页链接或 SteamID64', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('[aria-label="Steam 主页链接或 SteamID64"]').disabled);
}
async function fillAndRead({ key = false } = {}) {
  if (key) { await modal().getByLabel('Steam 主页链接或 SteamID64', { exact: true }).fill(fakeProfile); await modal().getByLabel('Steam Web API 密钥', { exact: true }).fill(fakeKey); }
  await modal().getByRole('button', { name: /^(读取游戏库|重新读取游戏库)$/ }).click();
  await modal().getByRole('heading', { name: '游戏库预览', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.steam-connect-source-actions button[type="submit"]').disabled);
}
async function enrich() {
  await modal().getByRole('button', { name: '补全封面与资料', exact: true }).click();
  await modal().getByRole('status').filter({ hasText: '资料补全结束' }).waitFor();
}
async function capture(name, theme = 'dark', narrow = false) {
  await page.evaluate(value => { document.documentElement.dataset.theme = value; document.documentElement.style.colorScheme = value; }, theme);
  await app.evaluate(({ BrowserWindow }, compact) => { const window = BrowserWindow.getAllWindows()[0]; window.setMinimumSize(compact ? 360 : 880, 480); window.setSize(compact ? 420 : 1440, compact ? 840 : 960); }, narrow);
  await modal().locator('.steam-connect-result-heading').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const png = await app.evaluate(async ({ BrowserWindow }) => {
    const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    if (image.isEmpty()) throw new Error('Empty Steam connection screenshot');
    return image.toPNG().toString('base64');
  });
  const filename = `${prefix}${name}.png`;
  fs.writeFileSync(path.join(evidence, filename), Buffer.from(png, 'base64')); screenshots.push(filename);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, '页面不应横向溢出');
  assert.equal(await modal().evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, '弹窗不应横向溢出');
}
async function exportSnapshot() {
  const file = path.join(dataDirectory, 'steam-export.json');
  await app.evaluate(({ BrowserWindow }, destination) => { BrowserWindow.getAllWindows()[0].webContents.session.once('will-download', (_event, download) => download.setSavePath(destination)); }, file);
  await page.getByRole('button', { name: '导出备份', exact: true }).click();
  for (let index = 0; index < 150; index++) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { await new Promise(resolve => setTimeout(resolve, 100)); } }
  throw new Error('Steam sync export did not finish');
}
(async () => {
  try {
    await launch();
    await check('默认不请求网络，缺少密钥拒绝读取且不改收藏', async () => {
      assert.deepEqual(await network(), []);
      const response = await page.evaluate(profile => window.qiyuDesktop.readSteamLibrary({ profile, rememberKey: false, includePlayedFreeGames: false }), fakeProfile);
      assert.equal(response.ok, false); assert.match(response.error, /32位/); assert.deepEqual(await network(), []);
      await openConnection();
      assert.equal(await modal().getByLabel('Steam Web API 密钥', { exact: true }).getAttribute('type'), 'password');
      await modal().getByLabel('Steam 主页链接或 SteamID64', { exact: true }).fill(fakeProfile);
      assert.equal(await modal().getByRole('button', { name: '读取游戏库', exact: true }).isDisabled(), true);
      assert.equal(fs.readFileSync(dataFile, 'utf8'), baseline);
    });
    await check('一次读取481款，密钥加密保存且不回显，预览不写收藏', async () => {
      await fillAndRead({ key: true });
      assert.equal(await modal().locator('.steam-connect-row').count(), 481);
      const counts = await modal().locator('.steam-connect-counts').innerText();
      assert.match(counts, /478\s*新增/); assert.match(counts, /1\s*可更新/); assert.match(counts, /1\s*已是最新/); assert.match(counts, /1\s*待确认/);
      assert.equal((await network()).filter(request => request.kind === 'owned').length, 1);
      assert.equal((await network()).length, 1, '读取库存不应逐条请求资料');
      assert.equal(await modal().getByLabel('Steam Web API 密钥', { exact: true }).inputValue(), '');
      const state = await page.evaluate(() => window.qiyuDesktop.getSteamConnection());
      assert.equal(state.value.hasApiKey, true); assert.equal(state.value.remembered, true);
      assert.equal(JSON.stringify(state).includes(fakeKey), false);
      assert.equal(fs.readFileSync(connectionFile, 'utf8').includes(fakeKey), false);
      assert.equal(fs.readFileSync(dataFile, 'utf8'), baseline); assert.equal(fs.existsSync(previousFile), false);
    });
    await check('独立补全资料保留个人记录，深浅模式与窄窗无横向溢出', async () => {
      await enrich();
      assert.equal(fs.readFileSync(dataFile, 'utf8'), baseline); assert.equal(fs.existsSync(previousFile), false);
      const requests = await network();
      assert.equal(requests.filter(request => request.kind === 'details').length, 481, 'v0.4.24（N3-C）：恰一件原名缺失也读详情，其余完整本地资料复用');
      assert.equal(requests.filter(request => request.kind === 'cover').length, 480);
      assert.equal(await modal().locator('.steam-connect-cover img').count(), 481);
      await capture('steam-connect-dark'); await capture('steam-connect-light', 'light'); await capture('steam-connect-narrow', 'dark', true);
      await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setMinimumSize(880, 640); window.setSize(1440, 960); });
    });
    await check('新增与补资料一次提交，完整备份并保留个人字段及更高本地分钟', async () => {
      await modal().getByRole("button", { name: "保存选中的 480 款", exact: true }).click();
      await modal().waitFor({ state: 'detached' });
      const saved = readSnapshot(); assert.equal(saved.items.length, 481); assert.deepEqual(saved.futureRoot, fixture.futureRoot);
      const old = saved.items.find(entry => entry.id === 'existing-update');
      const expectedPersonal = ['title', 'status', 'gamePlayState', 'playtimeMinutes', 'tags', 'gameTags', 'impression', 'favorite', 'experienceEntries', 'futureItem', 'createdAt'];
      for (const field of expectedPersonal) assert.deepEqual(old[field], fixture.items[0][field]);
      assert.equal(old.creator, 'Fixture Developer'); assert.equal(old.year, '2024'); assert.match(old.coverUrl, /^data:image\/jpeg;base64,/);
      // v0.4.24（N3-C）：enrich 会为缺失原名的既有作品补上来源原名，比较时剔除该补充字段。
      const currentSaved = saved.items.find(entry => entry.id === 'existing-current');
      assert.deepEqual(currentSaved && { ...currentSaved, originalTitle: undefined, updatedAt: undefined }, { ...fixture.items[1], originalTitle: undefined, updatedAt: undefined });
      assert.deepEqual(saved.items.find(entry => entry.id === 'ambiguous'), fixture.items[2]);
      const added = saved.items.find(entry => entry.externalIds?.some(ref => ref.provider === 'steam' && ref.id === '1003'));
      assert.equal(added.playtimeMinutes, 51); assert.equal(added.status, 'want'); assert.equal(added.favorite, false); assert.equal(added.impression, ''); assert.equal(added.experienceEntries, undefined);
      assert.equal(fs.readFileSync(previousFile, 'utf8'), baseline);
      const dailyFiles = fs.readdirSync(path.join(dataDirectory, 'backups')).filter(name => /^daily-\d{4}-\d{2}-\d{2}\.json$/.test(name));
      assert.equal(dailyFiles.length, 1); assert.equal(fs.readFileSync(path.join(dataDirectory, 'backups', dailyFiles[0]), 'utf8'), baseline);
      const exported = await exportSnapshot(); assert.deepEqual(exported.items, saved.items); assert.equal(JSON.stringify(exported).includes(fakeKey), false); assert.equal(fs.readFileSync(dataFile, 'utf8').includes(fakeKey), false);
    });
    await check('再次读取零新增零更新，已存封面和资料复用，断开连接不删作品', async () => {
      const before = fs.readFileSync(dataFile, 'utf8');
      await openConnection(); await fillAndRead();
      const counts = await modal().locator('.steam-connect-counts').innerText(); assert.match(counts, /0\s*新增/); assert.match(counts, /0\s*可更新/); assert.match(counts, /480\s*已是最新/);
      const beforePublic = (await network()).filter(request => request.kind !== 'owned').length;
      await enrich();
      const newPublic = (await network()).filter(request => request.kind !== 'owned').slice(beforePublic);
      const idSet = new Set(newPublic.map(request => request.appId)); console.log('DEBUG newPublic:', newPublic.length, 'unique:', idSet.size, 'sample:', [...idSet].slice(0, 5).join(','), 'has1002:', idSet.has('1002'));
      console.log('DEBUG lib1003:', JSON.stringify(readSnapshot().items.find(item => item.externalIds?.some(ref => ref.id === '1003'))?.originalTitle));
      assert.equal(newPublic.length, 2, '仅同名待确认项不能复用本地身份，480项已匹配资料均应复用');
      assert.ok(newPublic.every(request => request.appId === '1002'));
      assert.equal(await modal().getByRole('button', { name: '保存选中的 0 款', exact: true }).isDisabled(), true);
      await modal().getByRole('button', { name: '断开连接', exact: true }).click();
      await modal().getByRole('button', { name: '确认断开连接', exact: true }).click();
      await modal().getByRole('status').filter({ hasText: 'Steam 连接已清除' }).waitFor();
      assert.equal(fs.existsSync(connectionFile), false); assert.equal(fs.readFileSync(dataFile, 'utf8'), before);
      const state = await page.evaluate(() => window.qiyuDesktop.getSteamConnection()); assert.equal(state.value.hasApiKey, false);
      await modal().getByRole('button', { name: '关闭', exact: true }).click();
      await modal().getByRole('button', { name: '关闭并放弃预览', exact: true }).click();
      await modal().waitFor({ state: 'detached' });
    });
    await check('外部文件冲突阻止覆盖，预览与选择完整保留', async () => {
      await app.evaluate(() => { globalThis.__qiyuSteamConnectFixture.extraGame = true; });
      await openConnection(); await fillAndRead({ key: true });
      assert.equal(await modal().getByRole('checkbox', { name: '同步 Steam 测试游戏 1481', exact: true }).isChecked(), true);
      const external = readSnapshot(); external.items.push(item('external', '外部新增作品', { category: 'book', subcategory: '专业书籍' }));
      const rawExternal = JSON.stringify(external, null, 2); fs.writeFileSync(dataFile, rawExternal);
      await modal().getByRole('button', { name: '保存选中的 1 款', exact: true }).click();
      await modal().getByRole('alert').filter({ hasText: '保存未完成' }).waitFor();
      assert.equal(fs.readFileSync(dataFile, 'utf8'), rawExternal); assert.equal(fs.readFileSync(previousFile, 'utf8'), baseline);
      assert.equal(await modal().getByRole('checkbox', { name: '同步 Steam 测试游戏 1481', exact: true }).isChecked(), true);
      assert.equal(await modal().locator('.steam-connect-row').count(), 482);
      await page.keyboard.press('Escape');
      await modal().getByRole('button', { name: '继续查看', exact: true }).waitFor();
      assert.equal(await modal().getByRole('button', { name: '继续查看', exact: true }).evaluate(element => element === document.activeElement), true);
      await page.keyboard.press('Escape'); assert.equal(await modal().getByRole('button', { name: '继续查看', exact: true }).count(), 0);
    });
    await check('仅隔离模拟网络，无渲染器远程请求、页面错误或明文密钥泄漏', async () => {
      const requests = await network(); allNetwork.push(...requests);
      assert.ok(requests.every(request => ['owned', 'details', 'cover'].includes(request.kind)));
      assert.ok(requests.every(request => request.credentials === 'omit' && request.redirect === 'manual'));
      assert.deepEqual(rendererRequests, []); assert.deepEqual(errors, []);
      assert.equal(JSON.stringify(requests).includes(fakeKey), false);
      assert.equal(fs.readFileSync(connectionFile, 'utf8').includes(fakeKey), false);
    });
  } catch (error) { failure = error; console.error(error); }
  finally {
    if (app) {
      if (!allNetwork.length) try { allNetwork.push(...await network()); } catch { /* Application may have exited. */ }
      await app.close().catch(() => undefined);
    }
    fs.writeFileSync(path.join(evidence, `${prefix}validation.json`), JSON.stringify({ passed: !failure, version, executablePath, packaged, dataDirectory, fixtureGames: 481, checks, screenshots,
      errors, rendererRequests, requestCounts: { owned: allNetwork.filter(request => request.kind === 'owned').length, details: allNetwork.filter(request => request.kind === 'details').length, covers: allNetwork.filter(request => request.kind === 'cover').length, unhandled: allNetwork.filter(request => request.kind === 'unhandled').length },
      notes: ['真实账号、真实API密钥与用户APPDATA均未用于本测试。', 'QIYU_E2E与mkdtemp目录隔离；主进程Steam网络完整替换为固定481款与1x1PNG资料。', '请求证据只记录主机、路径和AppID，不记录带密钥查询串。', '成品与开发模式均可运行：node scripts/verify-steam-connect.cjs [exe] [prefix]'], stage, failure: failure?.stack }, null, 2));
    if (failure) process.exitCode = 1;
  }
})();
