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
const evidence = path.join(root, 'evidence', `steam-batch-v${version.replaceAll('.', '')}`);
const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-batch-desktop-'));
const dataFile = path.join(dataDirectory, 'library.json');
const previousFile = path.join(dataDirectory, 'library.previous.json');
const env = { ...process.env, QIYU_E2E: '1', QIYU_TEST_DATA_DIR: dataDirectory };
delete env.ELECTRON_RUN_AS_NODE;
const checks = [], errors = [], remoteRequests = [];
let app, page, failure;
const fixtureItem = (id, title, extra = {}) => ({
  id, title, category: 'game', subcategory: 'Switch', platforms: ['Switch'], creator: '原作者', year: '2020', status: 'paused',
  gamePlayState: 'paused', playtimeMinutes: 333, tags: ['私人标签'], impression: '原有印象', favorite: true, artwork: 'default', createdAt: '2020-01-01', updatedAt: '2020-01-01',
  experienceStatus: 'experienced', experienceCategory: 'long-term', playEngagement: 'paused', completion: 'not-cleared', completionCount: 0,
  futureData: { preserve: id }, ...extra,
});
const fixture = { schemaVersion: 1, futureRoot: { preserve: true }, items: [fixtureItem('existing', '已有收藏', { externalIds: [{ provider: 'steam', id: '123' }] })] };
const baseline = JSON.stringify(fixture, null, 2);
const manifest = { format: 'qiyu.batch.v1', items: [
  { title: '已有收藏的新译名', category: 'game', externalIds: [{ provider: 'steam', id: '123' }] },
  { title: '新增Switch作品', category: 'game', subcategory: 'Switch', platforms: ['Switch', 'PS5'], gameTags: { gameplay: ['动作'], theme: ['奇幻'], scenario: ['需要沉浸'], other: [] } },
  { title: '新增电影', category: 'screen', subcategory: '电影', creator: '新导演', year: '2025', externalIds: [{ provider: 'douban', id: '456', url: 'https://movie.douban.com/subject/456/' }] },
] };
fs.mkdirSync(evidence, { recursive: true });
fs.writeFileSync(dataFile, baseline);
async function check(name, run) { await run(); checks.push(name); console.log(`PASS ${name}`); }
async function launch() {
  app = await electron.launch({ executablePath, args: packaged ? [] : [root], env, timeout: 45000 });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/i.test(request.url())) remoteRequests.push(request.url()); });
  await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
  assert.deepEqual(await page.getByRole('navigation', { name: '作品分类' }).getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))), ['游戏', '书籍', '影视', '音乐']);
  assert.equal(await page.evaluate(() => window.qiyuDesktop.getInfo().dataDirectory), dataDirectory, '必须连接独立测试目录');
}
const modal = () => page.getByRole('dialog', { name: '批量导入作品', exact: true });
async function openPreview() {
  await page.getByRole('button', { name: '批量导入作品', exact: true }).click();
  assert.equal(await modal().getByRole('combobox', { name: '新增游戏的体验分类', exact: true }).inputValue(), 'auto');
  assert.equal(await modal().getByRole('combobox', { name: '新增游戏的通关进度', exact: true }).inputValue(), 'unknown');
  await modal().getByRole('textbox', { name: '作品清单', exact: true }).fill(JSON.stringify(manifest));
  await modal().getByRole('button', { name: '生成预览', exact: true }).click();
  assert.match(await modal().locator('.steam-import-summary').innerText(), /2\s*件可新增/);
  assert.match(await modal().locator('.steam-import-summary').innerText(), /1\s*件重复/);
}
(async () => {
  try {
    await launch();
    let external, externalRaw;
    await check('批量预览与重复检查不写原文件', async () => {
      await openPreview();
      assert.equal(fs.readFileSync(dataFile, 'utf8'), baseline);
      assert.equal(fs.existsSync(previousFile), false);
    });
    await check('预览后外部变更阻止整批覆盖，保留外部文件和待导入清单', async () => {
      external = { ...fixture, items: [...fixture.items, fixtureItem('external', '外部新增作品')] };
      externalRaw = JSON.stringify(external, null, 2);
      fs.writeFileSync(dataFile, externalRaw);
      await modal().getByRole('button', { name: '导入选中的 2 件', exact: true }).click();
      await modal().getByRole('alert').filter({ hasText: '保存未完成' }).waitFor();
      assert.equal(fs.readFileSync(dataFile, 'utf8'), externalRaw);
      assert.equal(fs.existsSync(previousFile), false);
      assert.equal(await modal().getByRole('checkbox', { name: '导入 新增Switch作品', exact: true }).isChecked(), true);
      await app.close(); app = null;
    });
    await check('重开独立应用后一次追加全部所选项，previous与daily备份精确保留追加前文件', async () => {
      await launch();
      await openPreview();
      await modal().getByRole('button', { name: '导入选中的 2 件', exact: true }).click();
      await modal().waitFor({ state: 'detached' });
      const updated = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      assert.equal(updated.items.length, external.items.length + 2);
      assert.deepEqual(updated.futureRoot, fixture.futureRoot);
      for (const old of external.items) assert.deepEqual(updated.items.find(item => item.id === old.id), old);
      const game = updated.items.find(item => item.title === '新增Switch作品');
      assert.deepEqual(game.platforms, ['Switch', 'PS5']); assert.equal(game.subcategory, 'Switch');
      assert.deepEqual(game.gameTags, manifest.items[1].gameTags); assert.equal(game.status, 'want');
      assert.equal(game.gamePlayState, 'want'); assert.equal(game.playEngagement, 'planned');
      assert.equal(game.experienceStatus, undefined); assert.equal(game.experienceCategory, undefined); assert.equal(game.playtimeMinutes, undefined);
      assert.equal(game.completion, 'unknown'); assert.equal(game.completionCount, undefined); assert.equal(game.completionEvents, undefined); assert.equal(game.experienceEntries, undefined);
      const movie = updated.items.find(item => item.title === '新增电影'); assert.equal(movie.category, 'screen'); assert.equal(movie.status, 'want'); assert.equal(movie.experienceEntries, undefined);
      assert.equal(movie.experienceStatus, undefined); assert.equal(movie.experienceCategory, undefined); assert.equal(movie.playEngagement, undefined); assert.equal(movie.completion, undefined);
      await page.getByRole('button', { name: '查看新增Switch作品详情', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: '查看新增电影详情', exact: true }).count(), 0, '电影不能混入游戏板块');
      assert.equal(await page.locator('.media-gallery .media-card').count(), 3);
      await page.getByRole('navigation', { name: '作品分类' }).getByRole('button', { name: '影视', exact: true }).click();
      await page.getByRole('button', { name: '查看新增电影详情', exact: true }).waitFor();
      assert.equal(await page.locator('.media-gallery .media-card').count(), 1);
      assert.equal(await page.getByRole('button', { name: '查看新增Switch作品详情', exact: true }).count(), 0, '游戏不能混入影视板块');
      assert.equal(fs.readFileSync(previousFile, 'utf8'), externalRaw);
      const dailyFiles = fs.readdirSync(path.join(dataDirectory, 'backups')).filter(name => /^daily-\d{4}-\d{2}-\d{2}\.json$/.test(name));
      assert.equal(dailyFiles.length, 1); assert.equal(fs.readFileSync(path.join(dataDirectory, 'backups', dailyFiles[0]), 'utf8'), externalRaw);
      assert.equal(fs.readdirSync(dataDirectory).some(name => /^\.qiyu-.*\.tmp$/.test(name)), false);
    });
    await check('跨品类分别可见，实际桌面操作无页面错误且不会请求远程账号或来源', async () => { assert.deepEqual(errors, []); assert.deepEqual(remoteRequests, []); });
  } catch (error) { failure = error; console.error(error); }
  finally {
    if (app) await app.close().catch(() => undefined);
    fs.writeFileSync(path.join(evidence, `${prefix}desktop-validation.json`), JSON.stringify({ passed: !failure, executablePath, packaged, dataDirectory, checks, errors, remoteRequests, notes: ['仅对mkdtemp独立目录读写；通过QIYU_E2E与QIYU_TEST_DATA_DIR确保不使用真实APPDATA。', '模拟文件冲突仅修改独立测试目录library.json；不终止用户正在运行的应用。'], failure: failure?.stack }, null, 2));
    if (failure) process.exitCode = 1;
  }
})();
