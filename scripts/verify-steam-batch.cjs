const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const dist = path.resolve(process.env.QIYU_DETAIL_DIST || path.join(root, 'dist'));
const evidence = path.join(root, 'evidence', `steam-batch-v${version.replaceAll('.', '')}`);
const key = 'qiyu.library.v1';
const checks = [], pageErrors = [], remoteRequests = [];
let server, browser, context, page, base, failure;
fs.mkdirSync(evidence, { recursive: true });
const fixture = {
  schemaVersion: 1, futureRoot: { preserve: '根扩展' },
  items: [{
    id: 'existing-steam-123', title: '已有收藏', originalTitle: 'Existing Game', category: 'game', subcategory: 'Switch', platforms: ['Switch', 'PS5'],
    creator: '我的开发商', year: '2020', status: 'paused', gamePlayState: 'paused', playtimeMinutes: 360,
    experienceStatus: 'experienced', experienceCategory: 'replayable', playEngagement: 'playing', completion: 'cleared', completionCount: 2,
    tags: ['私人标签'], gameTags: { gameplay: [], theme: [], scenario: [], other: ['私人标签'] },
    impression: '我的印象必须保留', favorite: true, artwork: 'default', createdAt: '2020-01-01', updatedAt: '2020-01-01',
    externalIds: [{ provider: 'steam', id: '123' }], experienceEntries: [{ id: 'e1', date: '2024-08', kind: 'note', note: '实际经历' }], futureItem: { preserve: 9 },
  }, {
    id: 'existing-interstellar', title: '星际穿越', originalTitle: 'Interstellar', category: 'screen', subcategory: '电影', creator: '我的导演', year: '2014', status: 'active',
    tags: ['自己的标签'], impression: '保留我的电影印象', favorite: true, artwork: 'default', createdAt: '2024-01-01', updatedAt: '2024-01-01',
    externalIds: [{ provider: 'douban', id: '1889243', url: 'https://movie.douban.com/subject/1889243/' }], futureMovie: { preserve: '不覆盖' },
  }],
};
const baseline = JSON.stringify(fixture);
async function check(name, run) { await run(); checks.push(name); console.log(`PASS ${name}`); }
async function startServer() {
  assert.ok(fs.existsSync(path.join(dist, 'index.html')), '请先 npm run build');
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname === '/__fixture-init') { response.writeHead(200, { 'content-type': mime['.html'] }); response.end('<!doctype html><html><title>独立批量导入测试</title></html>'); return; }
    if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    let target;
    try { target = path.resolve(dist, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname)); } catch { response.writeHead(400); response.end(); return; }
    if (!target.startsWith(dist + path.sep)) { response.writeHead(403); response.end(); return; }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': mime[path.extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(target).pipe(response);
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)); });
}
const stored = () => page.evaluate(key => localStorage.getItem(key), key);
const modal = () => page.getByRole('dialog', { name: '批量导入作品', exact: true });
async function openImport() {
  const direct = page.getByRole('button', { name: '批量导入作品', exact: true });
  if (!await direct.count()) {
    const source = page.getByRole('button', { name: '检索与导入', exact: true });
    if (await source.count()) await source.click();
  }
  await page.getByRole('button', { name: '批量导入作品', exact: true }).click();
  await modal().waitFor();
}
async function closeDiscard() {
  await modal().getByRole('button', { name: '取消', exact: true }).click();
  await modal().getByRole('button', { name: '放弃本次清单', exact: true }).click();
  await modal().waitFor({ state: 'detached' });
}
async function source(value) {
  await modal().getByRole('textbox', { name: '作品清单', exact: true }).fill(value);
  await modal().getByRole('button', { name: '生成预览', exact: true }).click();
}
async function screenshot(name) {
  await page.screenshot({ path: path.join(evidence, name), fullPage: false });
}

(async () => {
  try {
    const { isValidSnapshot } = await import(pathToFileURL(path.join(root, 'src/domain/library.ts')).href);
    const { experienceStatusFor, experienceCategoryFor } = await import(pathToFileURL(path.join(root, 'src/domain/gameExperience.ts')).href);
    assert.ok(isValidSnapshot(fixture));
    base = await startServer();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
    context.on('request', request => { if (!request.url().startsWith(base) && !request.url().startsWith('data:')) remoteRequests.push(request.url()); });
    page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(`${base}/__fixture-init`);
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw: baseline });
    await page.goto(base);
    await page.getByRole('navigation', { name: '作品分类' }).waitFor();

    await check('纯名称清单、错误行提示与取消确认保持原库字节不变', async () => {
      await openImport();
      await source('纯名称新游戏\n链接缺少名称 | https://evil.example/game/1');
      assert.match(await modal().locator('.steam-import-summary').innerText(), /1\s*件可新增/);
      assert.match(await modal().locator('.steam-import-summary').innerText(), /1\s*行未识别/);
      await modal().getByRole('button', { name: '取消', exact: true }).click();
      await modal().getByRole('button', { name: '继续整理', exact: true }).click();
      assert.equal(await modal().getByRole('textbox', { name: '作品清单', exact: true }).inputValue(), '纯名称新游戏\n链接缺少名称 | https://evil.example/game/1');
      await closeDiscard();
      assert.equal(await stored(), baseline);
    });
    await check('文件大小和损坏JSON不会写入收藏', async () => {
      await openImport();
      await modal().getByLabel('选择清单文件', { exact: true }).setInputFiles({ name: 'oversize.json', mimeType: 'application/json', buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 32) });
      await modal().getByRole('alert').filter({ hasText: '2 MB' }).waitFor();
      await source('{broken json');
      await modal().getByRole('alert').filter({ hasText: 'JSON 格式不完整' }).waitFor();
      assert.equal(await stored(), baseline);
      await closeDiscard();
    });
    await check('GetOwnedGames文件预览按appid/名称去重，支持查找与勾选', async () => {
      await openImport();
      const input = { response: { games: [
        { appid: 123, name: '已有作品的另一个名称', playtime_forever: 9999 },
        { appid: 456, name: '新游戏甲', playtime_forever: 90 },
        { appid: 456, name: '同编号重复', playtime_forever: 90 },
        { name: '已有收藏' },
        { appid: 789, name: '新游戏乙', playtime_forever: 0 },
        { name: '', appid: 999 },
      ] } };
      await modal().getByLabel('选择清单文件', { exact: true }).setInputFiles({ name: 'owned-games.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
      await modal().locator('.steam-import-summary').waitFor();
      const summary = await modal().locator('.steam-import-summary').innerText();
      assert.match(summary, /2\s*件可新增/); assert.match(summary, /3\s*件重复/); assert.match(summary, /1\s*行未识别/);
      assert.equal(await modal().getByRole('checkbox', { name: '导入 已有作品的另一个名称', exact: true }).isDisabled(), true);
      assert.equal(await modal().getByRole('checkbox', { name: '导入 已有收藏', exact: true }).isDisabled(), true);
      await modal().getByRole('textbox', { name: '查找清单中的作品', exact: true }).fill('新游戏乙');
      assert.equal(await modal().locator('.steam-import-row').count(), 1);
      await modal().getByRole('checkbox', { name: '导入 新游戏乙', exact: true }).uncheck();
      await modal().getByRole('textbox', { name: '查找清单中的作品', exact: true }).fill('');
      await modal().getByRole('button', { name: '导入选中的 1 件', exact: true }).waitFor();
      assert.equal(await stored(), baseline);
      await screenshot('steam-import-preview.png');
    });
    await check('保存失败保留预览与选择，重试成功只追加所选作品且原字段完整保留', async () => {
      await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        window.__qiyuBatchFailWrite = true;
        Storage.prototype.setItem = function (key, value) {
          if (key === 'qiyu.library.v1' && window.__qiyuBatchFailWrite) throw new DOMException('模拟测试：空间不足', 'QuotaExceededError');
          return original.call(this, key, value);
        };
      });
      await modal().getByRole('button', { name: '导入选中的 1 件', exact: true }).click();
      await modal().getByRole('alert').filter({ hasText: '保存未完成' }).waitFor();
      assert.equal(await stored(), baseline);
      assert.equal(await modal().getByRole('checkbox', { name: '导入 新游戏甲', exact: true }).isChecked(), true);
      assert.equal(await modal().getByRole('checkbox', { name: '导入 新游戏乙', exact: true }).isChecked(), false);
      await page.evaluate(() => { window.__qiyuBatchFailWrite = false; });
      await modal().getByRole('button', { name: '导入选中的 1 件', exact: true }).click();
      await modal().waitFor({ state: 'detached' });
      const updated = JSON.parse(await stored());
      assert.equal(updated.items.length, fixture.items.length + 1);
      assert.deepEqual(updated.futureRoot, fixture.futureRoot);
      assert.deepEqual(updated.items.find(item => item.id === fixture.items[0].id), fixture.items[0]);
      assert.deepEqual(updated.items.find(item => item.id === fixture.items[1].id), fixture.items[1]);
      const added = updated.items.find(item => !fixture.items.some(previous => previous.id === item.id));
      assert.equal(added.title, '新游戏甲'); assert.equal(added.playtimeMinutes, 90); assert.equal(added.status, 'want'); assert.equal(added.gamePlayState, 'want');
      assert.equal(added.experienceStatus, undefined); assert.equal(added.experienceCategory, undefined);
      assert.equal(experienceStatusFor(added), 'experienced'); assert.equal(experienceCategoryFor(added), undefined);
      assert.equal(added.completion, 'unknown'); assert.equal(added.completionCount, undefined); assert.equal(added.completionEvents, undefined);
      assert.equal(added.impression, ''); assert.equal(added.experienceEntries, undefined); assert.equal(added.externalIds[0].id, '456');
      assert.ok(isValidSnapshot(updated));
      assert.equal(await page.evaluate(() => localStorage.getItem('qiyu.library.before-import')), baseline);
    });
    await check('重开相同清单去重即时更新，不会重复追加', async () => {
      await openImport();
      await source('新游戏甲 | https://store.steampowered.com/app/456/ | 1000');
      assert.match(await modal().locator('.steam-import-summary').innerText(), /0\s*件可新增/);
      assert.equal(await modal().getByRole('button', { name: '导入选中的 0 件', exact: true }).isDisabled(), true);
      await closeDiscard();
      assert.equal(JSON.parse(await stored()).items.length, fixture.items.length + 1);
    });
    await check('书籍影视音乐文本模式与完整备份防误导入', async () => {
      const before = await stored();
      for (const category of ['screen', 'book', 'music']) {
        await openImport();
        await modal().getByRole('combobox', { name: '文本清单的板块', exact: true }).selectOption(category);
        await source(`未入库的${category}作品`);
        assert.match(await modal().locator('.steam-import-summary').innerText(), /1\s*件可新增/);
        assert.equal(await modal().getByRole('combobox', { name: '新增作品的初始状态', exact: true }).inputValue(), 'want');
        await closeDiscard();
      }
      await openImport();
      await source(baseline);
      await modal().getByRole('alert').filter({ hasText: '完整收藏备份' }).waitFor();
      assert.equal(await modal().getByRole('button', { name: '导入选中的 0 件', exact: true }).isDisabled(), true);
      await closeDiscard();
      assert.equal(await stored(), before);
    });
    await check('通用清单保留电影资料与游戏明确分钟，状态和个人经历不猜测', async () => {
      // 合成电影清单夹具：与任何私人清单无关；其中“星际穿越”与夹具库已有条目使用同一来源编号，用于验证重复识别与不覆盖。
      const manifest = { format: 'qiyu.batch.v1', items: [
        { title: '星际穿越', originalTitle: 'Interstellar', category: 'screen', subcategory: '电影', creator: '夹具导演', year: '2014', externalIds: [{ provider: 'douban', id: '1889243', url: 'https://movie.douban.com/subject/1889243/' }] },
        ...Array.from({ length: 12 }, (_, index) => ({ title: `合成电影${index + 1}`, category: 'screen', subcategory: '电影', creator: '夹具导演', year: String(2001 + index), externalIds: [{ provider: 'douban', id: String(9000001 + index) }] })),
      ] };
      const manifestFile = path.join(evidence, 'synthetic-movies-manifest.json');
      fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
      const before = JSON.parse(await stored());
      await openImport();
      await modal().getByLabel('选择清单文件', { exact: true }).setInputFiles(manifestFile);
      await modal().locator('.steam-import-summary').waitFor();
      const summary = await modal().locator('.steam-import-summary').innerText();
      assert.match(summary, /12\s*件可新增/); assert.match(summary, /1\s*件重复/); assert.match(summary, /0\s*行未识别/);
      assert.equal(await modal().getByRole('combobox', { name: '文本清单的板块', exact: true }).inputValue(), 'screen');
      assert.equal(await modal().getByRole('checkbox', { name: '导入 星际穿越', exact: true }).isDisabled(), true);
      assert.equal(await modal().getByRole('combobox', { name: '新增作品的初始状态', exact: true }).inputValue(), 'want');
      await modal().getByRole('combobox', { name: '新增作品的初始状态', exact: true }).selectOption('finished');
      await screenshot('movies-synthetic-preview.png');
      await modal().getByRole('button', { name: '导入选中的 12 件', exact: true }).click();
      await modal().waitFor({ state: 'detached' });
      const updated = JSON.parse(await stored());
      assert.equal(updated.items.length, before.items.length + 12);
      for (const original of before.items) assert.deepEqual(updated.items.find(item => item.id === original.id), original);
      assert.deepEqual(updated.futureRoot, fixture.futureRoot);
      const added = updated.items.filter(item => !before.items.some(previous => previous.id === item.id));
      assert.equal(added.length, 12);
      for (const movie of added) {
        assert.equal(movie.category, 'screen'); assert.equal(movie.subcategory, '电影'); assert.equal(movie.status, 'finished');
        assert.equal(movie.experienceEntries, undefined); assert.equal(movie.impression, ''); assert.equal(movie.favorite, false);
        const expected = manifest.items.find(item => item.title === movie.title);
        assert.ok(expected); assert.equal(movie.year, expected.year); assert.equal(movie.creator, expected.creator);
        assert.deepEqual(movie.externalIds, expected.externalIds); assert.equal(movie.coverUrl, expected.coverUrl);
      }
      assert.ok(isValidSnapshot(updated));
      assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('qiyu.library.before-import'))), before);
      await page.getByRole('navigation', { name: '作品分类' }).getByRole('button', { name: '影视', exact: true }).click();
      await page.waitForFunction(() => [...document.images].every(image => image.complete));
      await screenshot('movies-library-imported.png');
      await page.reload();
      assert.equal(JSON.parse(await stored()).items.length, updated.items.length);
      const beforeGames = await stored();
      const gameManifest = { format: 'qiyu.batch.v1', items: [
        { title: '清单零分钟游戏', category: 'game', platforms: ['Steam', 'Switch'], playtimeMinutes: 0,
          externalIds: [{ provider: 'steam', id: '2345678' }] },
        { title: '清单整数分钟游戏', category: 'game', platforms: ['Steam', 'PS5'], playtimeMinutes: 2468,
          externalIds: [{ provider: 'steam', id: '2345679' }], status: 'finished', gamePlayState: 'cleared',
          experienceStatus: 'unplayed', experienceCategory: 'completed', playEngagement: 'abandoned', completion: 'cleared', completionCount: 9, personalGrade: 'SSS',
          favorite: true, impression: '清单个人字段不带入', experienceEntries: [{ id: 'outside', date: '2020-01-01', kind: 'completed', note: '不生成记录' }] },
      ] };
      await openImport();
      await source(JSON.stringify(gameManifest));
      const gamesSummary = await modal().locator('.steam-import-summary').innerText();
      assert.match(gamesSummary, /2\s*件可新增/); assert.match(gamesSummary, /0\s*件重复/); assert.match(gamesSummary, /0\s*行未识别/);
      assert.equal(await modal().getByRole('combobox', { name: '新增游戏的体验分类', exact: true }).inputValue(), 'auto');
      assert.equal(await modal().getByRole('combobox', { name: '新增游戏的通关进度', exact: true }).inputValue(), 'unknown');
      assert.equal(await stored(), beforeGames, '游戏清单预览不写入收藏');
      await modal().getByRole('button', { name: '导入选中的 2 件', exact: true }).click();
      await modal().waitFor({ state: 'detached' });
      const withGames = JSON.parse(await stored());
      assert.equal(withGames.items.length, updated.items.length + 2);
      assert.deepEqual(withGames.futureRoot, updated.futureRoot);
      for (const original of updated.items) assert.deepEqual(withGames.items.find(item => item.id === original.id), original);
      for (const expected of gameManifest.items) {
        const game = withGames.items.find(item => item.title === expected.title);
        assert.ok(game); assert.equal(game.category, 'game');
        assert.equal(game.playtimeMinutes, expected.playtimeMinutes); assert.deepEqual(game.platforms, expected.platforms);
        assert.deepEqual(game.externalIds, expected.externalIds);
        assert.equal(game.status, 'want'); assert.equal(game.gamePlayState, 'want');
        assert.equal(game.playEngagement, 'planned'); assert.equal(game.completion, 'unknown');
        assert.equal(game.experienceStatus, undefined); assert.equal(game.experienceCategory, undefined);
        assert.equal(experienceStatusFor(game), expected.playtimeMinutes > 0 ? 'experienced' : 'unplayed'); assert.equal(experienceCategoryFor(game), undefined);
        assert.equal(game.completionCount, undefined); assert.equal(game.completionEvents, undefined); assert.equal(game.personalGrade, undefined);
        assert.equal(game.impression, ''); assert.equal(game.favorite, false); assert.equal(game.experienceEntries, undefined);
      }
      assert.ok(isValidSnapshot(withGames));
      assert.equal(await page.evaluate(() => localStorage.getItem('qiyu.library.before-import')), beforeGames);
      await page.reload();
      assert.deepEqual(JSON.parse(await stored()), withGames, '重开后明确分钟与所有原资料完整保留');
    });
    await check('新增游戏明确主类与二级分类落盘，不代填客观通关或次数日志', async () => {
      for (const classification of ['unplayed', 'completed']) {
        const beforeRaw = await stored(), before = JSON.parse(beforeRaw);
        const title = classification === 'unplayed' ? '明确待体验但有时长' : '明确分类已通关但未记通关事实';
        await openImport();
        await source(JSON.stringify({ format: 'qiyu.batch.v1', items: [{ title, category: 'game', playtimeMinutes: classification === 'unplayed' ? 90 : 0 }] }));
        assert.equal(await modal().getByRole('combobox', { name: '新增游戏的体验分类', exact: true }).inputValue(), 'auto');
        await modal().getByRole('combobox', { name: '新增游戏的体验分类', exact: true }).selectOption(classification);
        assert.equal(await modal().getByRole('combobox', { name: '新增游戏的通关进度', exact: true }).inputValue(), 'unknown');
        assert.equal(await stored(), beforeRaw, '分类预览仍不写库');
        await modal().getByRole('button', { name: '导入选中的 1 件', exact: true }).click();
        await modal().waitFor({ state: 'detached' });
        const after = JSON.parse(await stored()), added = after.items.find(item => item.title === title);
        assert.equal(after.items.length, before.items.length + 1); assert.deepEqual(after.futureRoot, before.futureRoot);
        for (const old of before.items) assert.deepEqual(after.items.find(item => item.id === old.id), old);
        assert.ok(added); assert.equal(added.experienceStatus, classification === 'unplayed' ? 'unplayed' : 'experienced');
        assert.equal(added.experienceCategory, classification === 'unplayed' ? undefined : 'completed');
        assert.equal(experienceStatusFor(added), added.experienceStatus); assert.equal(experienceCategoryFor(added), added.experienceCategory);
        assert.equal(added.playtimeMinutes, classification === 'unplayed' ? 90 : 0);
        assert.equal(added.status, 'want'); assert.equal(added.gamePlayState, 'want'); assert.equal(added.playEngagement, 'planned');
        assert.equal(added.completion, 'unknown'); assert.equal(added.completionCount, undefined); assert.equal(added.completionEvents, undefined);
        assert.equal(added.experienceEntries, undefined); assert.equal(added.personalGrade, undefined); assert.equal(added.impression, '');
        assert.ok(isValidSnapshot(after)); assert.equal(await page.evaluate(() => localStorage.getItem('qiyu.library.before-import')), beforeRaw);
        await page.reload(); assert.deepEqual(JSON.parse(await stored()), after, '手动分类与客观字段重开保持');
      }
    });
    await check('无页面异常且本地清单导入不发起任何远程请求', async () => {
      assert.deepEqual(pageErrors, []); assert.deepEqual(remoteRequests, []);
    });
  } catch (error) {
    failure = error;
    console.error(error);
    if (page) await screenshot('failure.png').catch(() => undefined);
  } finally {
    fs.writeFileSync(path.join(evidence, 'validation.json'), JSON.stringify({ passed: !failure, checks, pageErrors, remoteRequests, notes: ['全部使用本脚本新建的Edge独立上下文和合成收藏，不访问用户真实数据目录。', '网络仅本地静态服务；不请求用户Steam账号或Steam API。', '保存失败测试在独立上下文临时拦截当前Storage.setItem，重试验证一次性追加。'], failure: failure?.stack }, null, 2));
    if (context) await context.close();
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    if (failure) process.exitCode = 1;
  }
})();
