const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '..');
const packaged = Boolean(process.argv[2]);
const output = path.join(root, 'evidence', 'books-v0431', packaged ? 'packaged' : 'source');
fs.mkdirSync(output, { recursive: true });
let data = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-books-production-'));
let app, page; const checks = [], errors = [];
const file = () => path.join(data, 'library.json');
const raw = () => fs.readFileSync(file(), 'utf8');
const snapshot = () => JSON.parse(raw());
const book = (id, title, extra = {}) => ({ id, title, category: 'book', creator: '合成作者', year: '2026', status: 'want', subcategory: '文学', tags: ['文学'], impression: '', favorite: false, artwork: 'default', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '', ...extra });
const initial = { schemaVersion: 1, futureRoot: { keep: true }, bookTagCatalog: ['文学', '空标签'], bookCollections: [{ id: 'c1', title: '慢读计划', description: '留给周末', bookIds: ['b1', 'missing'], extension: { keep: true } }], items: [
  book('b1', '山海之间', { bookReading: { arrangement: 'reading', extension: true }, bookDetails: { publisher: '合成出版社', translator: '合成译者', doubanScore: 8.6, readingSources: ['汉王'], metadataSource: '豆瓣' }, experienceEntries: [{ id: 'e1', date: '2026-10-28', kind: 'progress', note: '第一章', minutes: 0 }] }),
  book('b2', '城市的回声', { status: 'finished', impression: '走过一座城，也读过一段人生。', personalScore: 0 }),
  book('b3', '下一次远行', { status: 'paused', experienceEntries: [{ id: 'month', date: '2026-09', kind: 'progress', note: '旧月记录', minutes: 3000 }] }),
  book('b4', '未竟的诗', { bookReading: { arrangement: 'abandoned' } }),
  book('b5', '时间的书页'),
  book('b6', '隐去的旧书', { hiddenAt: '2026-01-01T00:00:00.000Z', tags: ['文学'] }),
  { ...book('g1', '合成游戏'), category: 'game', experienceStatus: 'experienced', experienceCategory: 'completed', personalScore: 8.5 },
] };
function check(name) { checks.push(name); console.log('PASS ' + name); }
async function launch() {
  const env = { ...process.env, QIYU_E2E: '1', QIYU_TEST_DATA_DIR: data }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: process.argv[2] || path.join(root, 'node_modules/electron/dist/electron.exe'), args: packaged ? ['--disable-backgrounding-occluded-windows'] : [root, '--disable-backgrounding-occluded-windows'], env, timeout: 45000 });
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept().catch(() => {}));
  await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.qiyuDesktop.getInfo().dataDirectory), data);
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.webContents.setBackgroundThrottling(false); win.setMinimumSize(360, 500); win.setBounds({ width: 1440, height: 1020 }); });
  await page.getByRole('button', { name: '书籍', exact: true }).click();
}
const dialog = name => page.getByRole('dialog', { name, exact: true });
const views = () => page.getByRole('group', { name: '阅读书架', exact: true });
async function view(name) { await views().getByRole('button', { name: new RegExp('^' + name) }).click(); }
async function open(name) { await page.getByRole('button', { name: `查看${name}详情`, exact: true }).click(); await dialog(name).waitFor(); }
async function shot(name) {
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.show(); win.focus(); win.webContents.invalidate(); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(output, name + '.png'), timeout: 15000 });
}
async function close(name) { await dialog(name).getByRole('button', { name: '关闭', exact: true }).first().click(); }
(async () => {
  // All assets and data in this script are synthetic and isolated.
  const colors = ['#236175', '#9b644a', '#665b84', '#71805a', '#446889'];
  initial.items.filter(item => item.category === 'book').forEach(item => { item.coverUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1N0AAAAASUVORK5CYII='; });
  fs.writeFileSync(file(), JSON.stringify(initial, null, 2));
  await launch(); assert.equal(await page.locator('.error-banner').count(), 0, 'fixture must pass production validation');
  const covers = await page.evaluate(({ titles, colors }) => titles.map((title, i) => {
    const c = document.createElement('canvas'); c.width = 360; c.height = 520; const x = c.getContext('2d');
    x.fillStyle = colors[i % colors.length]; x.fillRect(0, 0, 360, 520); x.fillStyle = '#e7d8b0'; x.beginPath(); x.arc(230, 355, 140, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#193b3b'; x.beginPath(); x.moveTo(0, 430); x.lineTo(170, 220); x.lineTo(360, 520); x.lineTo(0, 520); x.fill();
    x.fillStyle = '#fff2d0'; x.font = '28px sans-serif'; x.fillText(title, 28, 78); x.font = '13px sans-serif'; x.fillText('QIYU  /  SYNTHETIC DEMO', 30, 123); return c.toDataURL('image/png');
  }), { titles: initial.items.filter(item => item.category === 'book').map(item => item.title), colors });
  initial.items.filter(item => item.category === 'book').forEach((item, index) => { item.coverUrl = covers[index]; });
  fs.writeFileSync(file(), JSON.stringify(initial, null, 2)); await page.reload(); await page.getByRole('button', { name: '书籍', exact: true }).click();
  const untouched = raw();
  for (const name of ['全部', '想读', '在读', '已读', '闲置', '弃读']) await view(name);
  await page.getByRole('button', { name: '阅读足迹', exact: true }).click();
  assert.equal(await page.locator('#books-heatmap-content').count(), 0);
  await view('全部'); assert.equal(await page.locator('#books-heatmap-content').count(), 0);
  await page.getByRole('button', { name: '阅读足迹', exact: true }).click();
  await page.getByRole('button', { name: '列表视图', exact: true }).click();
  await page.getByRole('button', { name: '封面视图', exact: true }).click();
  assert.equal(raw(), untouched); check('启动、六视图、切换封面列表、折叠热力表全部零写入');
  await page.locator('.books-heatmap-day[aria-label*="2026-10-28，0 分钟"]').waitFor();
  await shot('books-library');
  await page.locator('.books-toolbar-tools').getByRole('button', { name: /^筛选/ }).click();
  for (const name of ['作者', '出版社', '我的评分', '豆瓣评分', '书籍类型', '阅读来源', '资料来源']) assert.ok((await page.getByRole('region', { name: '书籍筛选' }).textContent()).includes(name));
  await page.getByRole('region', { name: '书籍筛选' }).getByRole('button', { name: /^合成出版社/ }).click();
  assert.equal(await page.locator('.books-book').count(), 1);
  await page.getByRole('button', { name: '清空筛选', exact: true }).click(); check('七个筛选维度可用，出版社筛选只显示匹配书籍');
  await page.locator('.books-toolbar-tools').getByRole('button', { name: /^筛选/ }).click();
  await open('山海之间');
  await shot('book-detail');
  await dialog('山海之间').getByRole('textbox', { name: '一句话感想', exact: true }).fill('想把山海留在自己的记忆中。');
  await dialog('山海之间').getByRole('heading', { name: '我的阅读', exact: true }).click();
  assert.equal(snapshot().items[0].impression, '想把山海留在自己的记忆中。');
  await dialog('山海之间').getByRole('button', { name: '闲置', exact: true }).click();
  await page.getByRole('button', { name: '编辑阅读计划', exact: true }).click();
  await dialog('阅读计划').getByRole('textbox', { name: '为什么想读', exact: true }).fill('等待一个安静的周末。');
  await dialog('阅读计划').getByRole('button', { name: '保存记录', exact: true }).click();
  assert.equal(snapshot().items[0].bookReading.arrangement, 'idle'); check('填写计划保留闲置安排与原有读后感');
  await page.getByRole('button', { name: '添加阅读记录', exact: true }).click();
  await dialog('记录阅读').getByRole('spinbutton', { name: /^阅读时长/ }).fill('35');
  await dialog('记录阅读').getByRole('button', { name: '保存记录', exact: true }).click();
  assert.equal(snapshot().items[0].experienceEntries.at(-1).minutes, 35);
  assert.equal(snapshot().items[0].bookReading.rounds, undefined); check('真实阅读分钟保存，普通日志不增加读完次数');
  await dialog('山海之间').getByRole('button', { name: '补录已读', exact: true }).click();
  await dialog('补录已读').getByRole('textbox', { name: '读完日期', exact: true }).fill('2026-99');
  const beforeInvalid = raw(); await dialog('补录已读').getByRole('button', { name: '保存记录', exact: true }).click();
  assert.equal(raw(), beforeInvalid); assert.ok(await dialog('补录已读').isVisible());
  await dialog('补录已读').getByRole('textbox', { name: '读完日期', exact: true }).fill('2026-10');
  await dialog('补录已读').getByRole('textbox', { name: '读完的感想', exact: true }).fill('第一遍读完，记住群山的回声。');
  await dialog('补录已读').getByRole('button', { name: '保存记录', exact: true }).click();
  assert.equal(snapshot().items[0].bookReading.rounds.length, 1);
  assert.equal(snapshot().items[0].status, 'want'); check('合法读完轮次独立保存，不猜测具体日期或改写旧状态');
  await page.getByRole('button', { name: '编辑书籍资料', exact: true }).click();
  await dialog('书籍资料').getByRole('textbox', { name: '出版社', exact: true }).fill('新的合成出版社');
  const beforeConflict = raw(); fs.writeFileSync(file(), beforeConflict + '\n');
  await dialog('书籍资料').getByRole('button', { name: '保存资料', exact: true }).click();
  assert.equal(raw(), beforeConflict + '\n'); assert.equal(await dialog('书籍资料').getByRole('textbox', { name: '出版社', exact: true }).inputValue(), '新的合成出版社');
  await shot('save-conflict'); fs.writeFileSync(file(), beforeConflict);
  await dialog('书籍资料').getByRole('button', { name: '保存资料', exact: true }).click(); check('真实仓储修订冲突零覆盖，资料草稿可原位重试');
  await dialog('书籍资料').waitFor({ state: 'detached' }); await close('山海之间');
  await page.getByRole('button', { name: '编辑书单慢读计划', exact: true }).click();
  await dialog('编辑主题书单').getByRole('textbox', { name: '书单名称', exact: true }).fill('山海慢读');
  await dialog('编辑主题书单').getByLabel('山海之间').check();
  await dialog('编辑主题书单').getByRole('button', { name: '保存书单', exact: true }).click();
  assert.equal(snapshot().bookCollections[0].extension.keep, true); assert.ok(snapshot().bookCollections[0].bookIds.includes('missing')); check('主题书单成员和扩展字段保存，保留不可见成员引用');
  await page.getByRole('button', { name: '管理书籍标签', exact: true }).click();
  await dialog('管理书籍标签').getByRole('textbox', { name: '标签名称', exact: true }).fill('周末');
  await dialog('管理书籍标签').getByLabel('山海之间').check();
  await dialog('管理书籍标签').getByRole('button', { name: '保存标签', exact: true }).click();
  await dialog('管理书籍标签').getByRole('button', { name: '完成', exact: true }).click();
  assert.ok(snapshot().bookTagCatalog.includes('周末')); assert.ok(snapshot().items[0].tags.includes('周末')); assert.deepEqual(snapshot().items.find(item => item.id === 'b6'), initial.items.find(item => item.id === 'b6')); check('书籍标签建立与分配，不改隐藏旧书');
  await open('山海之间'); await dialog('山海之间').getByRole('button', { name: '编辑书籍标签', exact: true }).click();
  await dialog('编辑标签').getByRole('button', { name: '空标签', exact: true }).click();
  await dialog('编辑标签').getByRole('button', { name: '保存', exact: true }).click();
  assert.ok(snapshot().items.find(item => item.id === 'b1').tags.includes('空标签')); await close('山海之间'); check('单本书直接选择目录中尚未关联书籍的已有标签');
  assert.deepEqual(snapshot().items.find(item => item.id === 'g1'), initial.items.find(item => item.id === 'g1'));
  assert.deepEqual(snapshot().futureRoot, initial.futureRoot); check('书籍写入保留游戏原文与未知根字段');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 390, height: 844 }));
  await page.waitForTimeout(300); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await shot('books-mobile');
  await open('山海之间'); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await shot('detail-mobile'); await close('山海之间');
  check('390px书架与详情无页面横向溢出');
  await view('全部'); await open('下一次远行');
  await dialog('下一次远行').getByRole('button', { name: '编辑这条阅读记录', exact: true }).click();
  await dialog('记录阅读').getByRole('textbox', { name: '这次读了什么', exact: true }).fill('保留旧月累计时长');
  await dialog('记录阅读').getByRole('button', { name: '保存记录', exact: true }).click();
  assert.equal(snapshot().items.find(item => item.id === 'b3').experienceEntries[0].minutes, 3000); await close('下一次远行'); check('旧月精度3000分钟记录能修改备注而不截断时长');
  await page.getByRole('button', { name: '收录书籍', exact: true }).first().click();
  await dialog('收录新作品').getByRole('textbox', { name: /^作品名称/ }).fill('新录入的合成书');
  await dialog('收录新作品').getByLabel('阅读安排', { exact: true }).selectOption('records');
  await dialog('收录新作品').getByRole('textbox', { name: '一句话印象', exact: true }).fill('新收录时保留的感想。');
  await dialog('收录新作品').getByRole('button', { name: '加入收藏', exact: true }).click();
  await dialog('新录入的合成书').waitFor();
  let created = snapshot().items.find(item => item.title === '新录入的合成书'); assert.equal(created.bookReading.rounds.length, 1); assert.equal(created.bookReading.rounds[0].finishedOn, undefined);
  await dialog('新录入的合成书').getByRole('button', { name: '在读', exact: true }).click();
  assert.equal(snapshot().items.find(item => item.id === created.id).bookReading.rounds.length, 1);
  await dialog('新录入的合成书').getByRole('button', { name: '补录已读', exact: true }).click();
  await dialog('补录已读').getByRole('textbox', { name: '读完的感想', exact: true }).fill('第二次读完的新收获');
  await dialog('补录已读').getByRole('button', { name: '保存记录', exact: true }).click();
  assert.equal(snapshot().items.find(item => item.id === created.id).bookReading.rounds.length, 2); await close('新录入的合成书'); check('新收录已读日期可未知，重读不覆盖第一轮感想');
  const persisted = snapshot(); await app.close(); app = null; await launch(); await view('全部');
  assert.deepEqual(snapshot(), persisted); await open('山海之间'); assert.equal(await dialog('山海之间').getByRole('textbox', { name: '一句话感想', exact: true }).inputValue(), persisted.items.find(item => item.id === 'b1').impression); await close('山海之间'); check('完整进程重启后读后感、轮次、日志、计划、标签和书单原样读回');
  assert.deepEqual(errors, []); check('无渲染进程异常');
})().then(() => console.log(JSON.stringify({ passed: checks.length, data, output }))).catch(async error => { console.error(error); if (page && !page.isClosed()) { console.log(await page.locator('.books-heatmap-year, .toast, .error-banner').allTextContents()); await shot('failure').catch(() => {}); } process.exitCode = 1; }).finally(async () => { fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({ passed: !process.exitCode, checks, errors, data }, null, 2)); if (app) await app.close(); });
