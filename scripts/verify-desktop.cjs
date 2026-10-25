const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { _electron: electron } = require('playwright');

const root = path.resolve(__dirname, '..');
const executablePath = process.argv[2] || path.join(root, 'node_modules/electron/dist/electron.exe');
const packaged = Boolean(process.argv[2]);
const evidencePrefix = process.argv[3] ? process.argv[3].replace(/[^a-z0-9-]/gi, '') + '-' : '';
const evidence = path.join(root, 'evidence');
const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-e2e-'));
const env = { ...process.env, QIYU_E2E: '1', QIYU_TEST_DATA_DIR: dataDirectory };
delete env.ELECTRON_RUN_AS_NODE;
const errors = [];
const checks = [];
let app;
let page;
let failure;
const dataFile = path.join(dataDirectory, 'library.json');
const snapshot = () => JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const fixtureItem = (id, category, title, more = {}) => ({ id, category, title, subcategory: category === 'game' ? 'Steam' : '', creator: '测试作者', year: '2025', status: 'finished', tags: ['回归标签'], impression: '测试环境的体验记录', favorite: false, artwork: 'default', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...more });
const gamePlanningFields = { playPriority: 'SS', priorityOrder: 7, personalGrade: 'A', ratingOrder: 3, review: '备份中的独立长文\n保留完整原文。' };
const fixtures = { schemaVersion: 1, items: [fixtureItem('legacy-game', 'game', '导入的游戏', { originalTitle: 'Original From Backup', playtimeMinutes: 75, gamePlayState: 'cleared', ...gamePlanningFields }), fixtureItem('legacy-book', 'book', '导入的书籍'), fixtureItem('legacy-screen', 'screen', '导入的电影')] };
function assertGamePlanningFields(item) {
 for (const [field, value] of Object.entries(gamePlanningFields)) assert.equal(item[field], value, `原生往返应保留${field}`);
}
async function showAll() {
  const group = page.getByRole('group', { name: '按体验分类筛选', exact: true });
  for (const name of ['待体验','已体验']) { const button = group.getByRole('button', { name, exact: true }); if (await button.getAttribute('aria-pressed') !== 'true') await button.click(); }
}
async function launch() {
  app = await electron.launch({ executablePath, args: packaged ? [] : [root], env, timeout: 45000 });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { void dialog.accept().catch(error => {
    // A closing renderer can dismiss its beforeunload dialog before CDP accepts it.
    if (!error.message.includes('No dialog is showing')) errors.push(error.message);
  }); });
  await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
  const navigation = page.getByRole('navigation', { name: '作品分类' });
  assert.deepEqual(await navigation.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))), ['游戏', '书籍', '影视', '音乐']);
  assert.equal(await navigation.getByRole('button', { name: '游戏', exact: true }).getAttribute('aria-current'), 'page');
  await page.waitForFunction(() => Boolean(window.qiyuDesktop));
  await showAll();
}
async function closeDetail() { await page.getByRole('button', { name: '关闭详情', exact: true }).click(); }
async function importSnapshot(value) {
 await page.locator('input[type=file][accept*="json"]').setInputFiles({ name: '备份.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
 await page.locator('.toast').filter({ hasText: '备份导入成功' }).waitFor();
}
async function exportSnapshot(name) {
 const file = path.join(dataDirectory, name);
 await app.evaluate(({ BrowserWindow }, savePath) => {
  BrowserWindow.getAllWindows()[0].webContents.session.once('will-download', (_event, item) => item.setSavePath(savePath));
 }, file);
 await page.getByRole('button', { name: '导出备份', exact: true }).click();
 await page.waitForFunction(() => true);
 for (let index = 0; index < 150 && !fs.existsSync(file); index++) await new Promise(resolve => setTimeout(resolve, 100));
 assert.ok(fs.existsSync(file), '原生备份下载应写出文件');
 for (let index = 0; index < 50; index++) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
 }
 throw new Error('备份文件未完成');
}
(async () => {
 fs.mkdirSync(evidence, { recursive: true });
 try {
  await launch();
  assert.equal(await page.locator('.demo-banner').count(), 0, '桌面首次打开不写入演示收藏');
  assert.equal(await page.locator('.feature-card').count(), 0, '首页没有默认当前作品');
  assert.equal((await page.evaluate(() => window.qiyuDesktop.getInfo())).version, require('../package.json').version);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().sandbox), true);
  checks.push('首次空库、默认游戏与四板块导航、隔离与沙箱');

  await page.getByRole('button', { name: '收录作品', exact: true }).first().click();
  await page.getByLabel(/作品名称/).fill('桌面新收藏');
  await page.getByLabel(/作品原名/).fill('Desktop Collection');
  await page.getByLabel(/累计游玩时长/).fill('1.25');
  await page.getByRole('dialog', { name: '收录新作品', exact: true }).getByLabel('体验分类', { exact: true }).selectOption('unplayed');
  await page.getByRole('dialog', { name: '收录新作品', exact: true }).getByLabel('通关进度').selectOption('cleared');
  await page.getByRole('textbox', { name: '一句话印象', exact: true }).fill('添加后关闭应用，仍应保留。');
  await page.getByRole('textbox', { name: '长文测评', exact: true }).fill('原生长文测评\n保存后退出重开，导出必须保留全部文字。');
  await page.locator('input[type=file][accept="image/*"]').setInputFiles(path.join(root, 'build/icon.png'));
  await page.getByRole('button', { name: '加入收藏', exact: true }).click();
  await page.getByRole('heading', { name: '桌面新收藏', exact: true }).waitFor();
  await page.getByRole('combobox', { name: '我的评级', exact: true }).selectOption('SSS');
  assert.equal(snapshot().items[0].personalGrade, 'SSS');
  assert.equal(snapshot().items[0].playtimeMinutes, 75);
  assert.ok(snapshot().items[0].coverUrl.startsWith('data:image/jpeg;base64,'));
  await page.screenshot({ path: path.join(evidence, 'native-classification-detail.png') });
  await closeDetail();
  assert.equal(snapshot().items[0].experienceStatus, 'unplayed', '明确待体验优先于正时长与通关记录');
  await app.close(); app = null;
  await launch();
  await page.getByRole('button', { name: '查看桌面新收藏详情', exact: true }).waitFor();
  assert.equal(snapshot().items[0].personalGrade, 'SSS');
  assert.equal(await page.getByRole('button', { name: '查看桌面新收藏详情', exact: true }).locator('.card-cover').getAttribute('data-finish'), 'prismatic');
  assert.equal(snapshot().items[0].review, '原生长文测评\n保存后退出重开，导出必须保留全部文字。');
  assert.equal(snapshot().items[0].experienceStatus, 'unplayed');
  checks.push('新增、手动主类优先、分钟精度、上传封面、SSS评级、独立测评及退出重开保留');

  await importSnapshot(fixtures);
  assertGamePlanningFields(snapshot().items.find(item => item.id === 'legacy-game'));
  await page.getByRole('button', { name: '查看导入的游戏详情', exact: true }).click();
  await page.getByRole('button', { name: '展开作品资料', exact: true }).click();
  await page.locator('.detail-facts-heading').getByRole('button', { name: '编辑', exact: true }).click();
  assert.equal(await page.getByLabel(/累计游玩时长/).inputValue(), '1.25');
  assert.equal(await page.getByLabel(/作品原名/).inputValue(), 'Original From Backup');
  await page.getByLabel(/作品名称/).fill('分钟记录游戏');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.getByRole('heading', { name: '分钟记录游戏', exact: true }).waitFor();
  assert.equal(snapshot().items.find(item => item.id === 'legacy-game').originalTitle, 'Original From Backup');
  await page.getByRole('button', { name: '更改体验分类', exact: true }).click();
  await page.locator('.game-state-options').getByRole('button', { name: '长线游玩', exact: true }).click();
  assert.equal(snapshot().items.find(item => item.id === 'legacy-game').experienceCategory, 'long-term');
  assert.equal(snapshot().items.find(item => item.id === 'legacy-game').gamePlayState, 'cleared');
  assert.equal(snapshot().items.find(item => item.id === 'legacy-game').personalGrade, 'A');
  checks.push('原生详情即时分类与通关事实/旧轴并存');

  assertGamePlanningFields(snapshot().items.find(item => item.id === 'legacy-game'));
  await closeDetail();
  const exported = await exportSnapshot('exported.json');
  assert.equal(exported.items.length, 3);
  assert.equal(exported.items.find(item => item.id === 'legacy-game').playtimeMinutes, 75);
  assert.equal(exported.items.find(item => item.id === 'legacy-game').originalTitle, 'Original From Backup');
  assertGamePlanningFields(exported.items.find(item => item.id === 'legacy-game'));
  checks.push('旧版备份导入→分钟记录编辑→原名、独立优先级/评级/顺序/长文保留→原生导出');

  await page.getByRole('navigation', { name: '作品分类' }).getByRole('button', { name: /游戏/ }).click();
  await showAll();
  if (await page.getByRole('button', { name: '筛选', exact: true }).getAttribute('aria-expanded') !== 'true') await page.getByRole('button', { name: '筛选', exact: true }).click();
  await page.locator('.completion-row').getByRole('button', { name: '已通关', exact: true }).click();
  assert.equal(await page.locator('.media-gallery .media-card').count(), 1);
  await page.getByRole('textbox', { name: '搜索收藏', exact: true }).fill('Original From Backup');
  assert.equal(await page.locator('.media-gallery .media-card').count(), 1);
  await page.getByRole('button', { name: '列表视图', exact: true }).click();
  assert.equal(await page.locator('.media-gallery--list').count(), 1);
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await page.locator('.tag-filter').filter({ hasText: '回归标签' }).click();
  assert.equal(await page.locator('.media-gallery .media-card').count(), 1);
  await page.getByRole('button', { name: '标签管理' }).click();
  await page.getByRole('button', { name: '重命名回归标签', exact: true }).click();
  await page.locator('.tag-rename input').fill('合并后的标签');
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  assert.ok(snapshot().items.filter(item => item.category === 'game').every(item => item.tags.includes('合并后的标签')));
  assert.ok(snapshot().items.filter(item => item.category !== 'game').every(item => item.tags.includes('回归标签')));
  await page.getByRole('navigation', { name: '作品分类' }).getByRole('button', { name: '书籍', exact: true }).click();
  await page.getByRole('button', { name: '查看导入的书籍详情', exact: true }).waitFor();
  assert.equal(await page.locator('.media-gallery .media-card').count(), 1);
  await page.getByRole('navigation', { name: '作品分类' }).getByRole('button', { name: '影视', exact: true }).click();
  await page.getByRole('button', { name: '查看导入的电影详情', exact: true }).waitFor();
  assert.equal(await page.locator('.media-gallery .media-card').count(), 1);
  await page.getByRole('navigation', { name: '作品分类' }).getByRole('button', { name: '游戏', exact: true }).click();
  await page.screenshot({ path: path.join(evidence, evidencePrefix + (packaged ? 'desktop-packaged.png' : 'desktop-source.png')) });
  checks.push('状态/原名/标签筛选、列表切换、标签限定板块重命名与跨品类导航');

  const child = spawn(executablePath, packaged ? [] : [root], { env, windowsHide: true, stdio: 'ignore' });
  const secondExit = await new Promise((resolve, reject) => {
   const timeout = setTimeout(() => { child.kill(); reject(new Error('第二实例未退出')); }, 15000);
   child.once('exit', code => { clearTimeout(timeout); resolve(code); });
   child.once('error', reject);
  });
  assert.equal(secondExit, 0);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  checks.push('重复启动保留单窗口');

  const large = { schemaVersion: 1, items: [fixtureItem('large-backup', 'book', '大体积备份', { impression: 'x'.repeat(26 * 1024 * 1024) })] };
  await importSnapshot(large);
  const largeExport = await exportSnapshot('large-export.json');
  assert.equal(largeExport.items[0].impression.length, 26 * 1024 * 1024);
  checks.push('超过25MB备份原生导入导出往返');
  await app.close(); app = null;

  const damagedRaw = '{broken library: keep original bytes';
  fs.writeFileSync(dataFile, damagedRaw);
  await launch();
  await page.locator('.error-banner').waitFor();
  assert.equal(await page.getByRole('button', { name: '收录作品', exact: true }).first().isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '导出备份', exact: true }).isDisabled(), true);
  assert.equal(fs.readFileSync(dataFile, 'utf8'), damagedRaw);
  await importSnapshot(fixtures);
  assert.equal(await page.locator('.error-banner').count(), 0);
  assert.equal(snapshot().items.length, 3);
  const beforeImport = fs.readdirSync(path.join(dataDirectory, 'backups')).filter(name => name.startsWith('before-import-'));
  assert.ok(beforeImport.some(name => fs.readFileSync(path.join(dataDirectory, 'backups', name), 'utf8') === damagedRaw));
  checks.push('损坏只读保护、显式恢复、原始坏文件保留');
  assert.deepEqual(errors, []);
  const report = { passed: true, packaged, executablePath, checks, pageErrors: errors, dataDirectory, timestamp: new Date().toISOString() };
  fs.writeFileSync(path.join(evidence, evidencePrefix + (packaged ? 'packaged-validation.json' : 'source-validation.json')), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
 } catch (error) {
  failure = error;
  fs.writeFileSync(path.join(evidence, evidencePrefix + (packaged ? 'packaged-validation.json' : 'source-validation.json')), JSON.stringify({ passed: false, packaged, executablePath, checks, pageErrors: errors, dataDirectory, failure: error.stack, timestamp: new Date().toISOString() }, null, 2));
  throw error;
 } finally {
  if (app) {
   if (failure) try { await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }); } catch { /* Only this isolated test instance may have exited. */ }
   await app.close().catch(() => undefined);
  }
  // Keep isolated fixtures alongside the report for review; never use the user's application data.
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
