const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const packaged = Boolean(process.argv[2]);
const output = path.join(root, 'evidence', 'books-controls-v' + version.replaceAll('.', ''), packaged ? 'packaged' : 'source');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-books-controls-'));
fs.mkdirSync(output, { recursive: true });
const file = path.join(data, 'library.json');
const raw = () => fs.readFileSync(file, 'utf8');
const saved = () => JSON.parse(raw());
const book = (id, title, extra = {}) => ({ id, title, category: 'book', creator: '合成作者', year: '2026', subcategory: '文学', status: 'want', tags: ['文学'], impression: '', favorite: false, artwork: 'default', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '', ...extra });
const fixture = { schemaVersion: 1, futureRoot: { keep: true }, items: [
  book('b1', '山海之间', { bookReading: { arrangement: 'reading' }, bookDetails: { publisher: '合成出版社', doubanScore: 8.6, readingSources: ['汉王'], metadataSource: '豆瓣' }, externalIds: [{ provider: 'douban', id: '123' }], impression: '原有感想不能覆盖', personalScore: 0 }),
  book('b2', '城市的回声', { status: 'finished', creator: '另一作者' }),
  book('b3', '下一次远行'),
  { ...book('g1', '合成游戏'), category: 'game', experienceStatus: 'experienced', experienceCategory: 'completed', personalScore: 8.5 },
] };
let app, page; const checks = [], errors = [];
const check = name => { checks.push(name); console.log('PASS ' + name); };
const modal = () => page.getByRole('dialog', { name: '批量导入作品', exact: true });
const panel = () => page.getByRole('region', { name: '书籍筛选', exact: true });
const filter = () => page.locator('.books-toolbar-tools').getByRole('button', { name: /^筛选/ });
async function launch() {
  const env = { ...process.env, QIYU_E2E: '1', QIYU_TEST_DATA_DIR: data }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: process.argv[2] || path.join(root, 'node_modules/electron/dist/electron.exe'), args: packaged ? [] : [root], env, timeout: 45000 });
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.qiyuDesktop.getInfo().dataDirectory), data);
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(360, 500); win.setBounds({ width: 1440, height: 1000 }); win.webContents.setBackgroundThrottling(false); });
  await page.getByRole('button', { name: '书籍', exact: true }).click();
}
async function shot(name) {
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.show(); win.focus(); win.webContents.invalidate(); });
  await page.waitForTimeout(180); await page.screenshot({ path: path.join(output, name + '.png'), timeout: 15000 });
}
async function discard() { await modal().getByRole('button', { name: '取消', exact: true }).click(); await modal().getByRole('button', { name: '放弃本次清单', exact: true }).click(); }
(async () => {
  fs.writeFileSync(file, JSON.stringify(fixture, null, 2)); await launch();
  const covers = await page.evaluate(() => ['#285965', '#7d5b50', '#615b84'].map((color, i) => {
    const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 520; const ctx = canvas.getContext('2d');
    ctx.fillStyle = color; ctx.fillRect(0, 0, 360, 520); ctx.fillStyle = '#e7d8b0'; ctx.beginPath(); ctx.arc(270, 380, 150, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#153b3b'; ctx.beginPath(); ctx.moveTo(0, 480); ctx.lineTo(190, 230); ctx.lineTo(360, 520); ctx.lineTo(0, 520); ctx.fill();
    ctx.fillStyle = '#fff2d0'; ctx.font = '30px sans-serif'; ctx.fillText(['山海之间', '城市的回声', '下一次远行'][i], 28, 80); ctx.font = '13px sans-serif'; ctx.fillText('QIYU / SYNTHETIC DEMO', 28, 118); return canvas.toDataURL();
  }));
  fixture.items.slice(0, 3).forEach((item, i) => { item.coverUrl = covers[i]; });
  fs.writeFileSync(file, JSON.stringify(fixture, null, 2)); await page.reload(); await page.getByRole('button', { name: '书籍', exact: true }).click();
  await page.getByRole('group', { name: '阅读书架' }).getByRole('button', { name: /^全部/ }).click();
  const beforeBrowsing = raw();
  const group = await page.locator('.books-views').boundingBox(); const toolbar = await page.locator('.books-toolbar').boundingBox();
  assert.ok(group.width < toolbar.width * .65, 'status capsule must hug its six buttons');
  const radius = await page.locator('.books-sort-field').evaluate(el => parseFloat(getComputedStyle(el).borderTopLeftRadius)); assert.ok(radius >= 17);
  await page.getByLabel('书籍排序', { exact: true }).selectOption('year'); await page.getByLabel('书籍排序', { exact: true }).selectOption('recent');
  check('六状态胶囊贴合按钮、收录时间与邻近控件同为圆胶囊');
  await shot('compact-library');
  await filter().scrollIntoViewIfNeeded(); const beforeY = (await page.locator('.books-book').first().boundingBox()).y;
  await filter().click(); await panel().waitFor();
  const afterY = (await page.locator('.books-book').first().boundingBox()).y; assert.ok(Math.abs(beforeY - afterY) < 2);
  for (const name of ['作者', '出版社', '我的评分', '豆瓣评分', '书籍类型', '阅读来源', '资料来源']) assert.ok(await panel().getByRole('navigation', { name: '筛选维度' }).getByRole('button', { name, exact: true }).isVisible());
  await panel().getByRole('button', { name: '出版社', exact: true }).click();
  await panel().getByRole('textbox', { name: '搜索出版社候选' }).fill('合成');
  await panel().getByRole('button', { name: /^合成出版社/ }).click(); assert.equal(await page.locator('.books-book').count(), 1);
  await shot('compact-filters');
  await panel().getByRole('button', { name: '清空筛选', exact: true }).click(); assert.equal(await page.locator('.books-book').count(), 3);
  await page.keyboard.press('Escape'); await panel().waitFor({ state: 'detached' }); assert.equal(await filter().evaluate(el => document.activeElement === el), true);
  await filter().click(); await page.getByRole('heading', { name: '书籍', exact: true }).click(); await panel().waitFor({ state: 'detached' });
  assert.equal(raw(), beforeBrowsing); check('七维紧凑磨砂浮层不挤压书架、候选搜索即筛选、清空及外点/Escape均零写入');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 390, height: 700 }));
  await filter().click(); const bounds = await panel().boundingBox(); const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height + 1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await shot('filters-390px'); await page.keyboard.press('Escape');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 1440, height: 1000 }));
  check('390px窄窗筛选浮层完整可见，无页面横向溢出');
  await page.getByRole('button', { name: '批量收录', exact: true }).click();
  assert.equal(await modal().getByLabel('文本清单的板块', { exact: true }).inputValue(), 'book');
  await modal().getByRole('textbox', { name: '作品清单', exact: true }).fill('山海之间\n待导入合成书\n待导入合成书');
  await modal().getByRole('button', { name: '生成预览', exact: true }).click();
  assert.equal(await modal().getByRole('checkbox', { name: '导入 待导入合成书', exact: true }).count(), 2);
  assert.equal(await modal().locator('.steam-import-row--duplicate').count(), 2); assert.ok((await modal().getByLabel('作品导入预览').textContent()).includes('书籍'));
  assert.equal(raw(), beforeBrowsing); await discard(); assert.equal(raw(), beforeBrowsing); check('书籍批量入口默认书籍、库中与清单内去重、取消零写入');
  await page.getByRole('button', { name: '批量收录', exact: true }).click();
  const csv = '书名,作者,出版社,出版年份,标签,我的评分,豆瓣评分,豆瓣链接,阅读来源\r\n山海之间,不应覆盖作者,,,,,,\r\n表格新书甲,表格作者,表格出版社,2025,旅行；文学,0,8.6,https://book.douban.com/subject/456/,纸质书\r\n表格新书乙,第二作者,另一出版社,2026,设计,9,,,';
  await modal().getByLabel('选择清单文件', { exact: true }).setInputFiles({ name: '合成书单.csv', mimeType: 'text/csv', buffer: Buffer.from('\ufeff' + csv) });
  await modal().getByRole('checkbox', { name: '导入 表格新书甲', exact: true }).waitFor();
  assert.ok((await modal().getByLabel('作品导入预览').textContent()).includes('表格出版社'));
  await shot('batch-book-preview');
  const beforeImport = raw(); fs.writeFileSync(file, beforeImport + '\n');
  await modal().getByRole('button', { name: '导入选中的 2 件', exact: true }).click();
  assert.equal(raw(), beforeImport + '\n'); await modal().getByText('保存未完成，预览和选择已保留。请处理收藏库保存提示后重试', { exact: true }).waitFor();
  assert.equal(await modal().getByRole('checkbox', { name: '导入 表格新书甲', exact: true }).isChecked(), true);
  fs.writeFileSync(file, beforeImport); await modal().getByRole('button', { name: '导入选中的 2 件', exact: true }).click(); await modal().waitFor({ state: 'detached' });
  const imported = saved(), a = imported.items.find(item => item.title === '表格新书甲');
  assert.equal(imported.items.length, fixture.items.length + 2); assert.equal(a.category, 'book'); assert.equal(a.personalScore, 0); assert.equal(a.creator, '表格作者');
  assert.equal(a.bookDetails.publisher, '表格出版社'); assert.equal(a.bookDetails.doubanScore, 8.6); assert.equal(a.externalIds[0].id, '456');
  assert.deepEqual(a.tags, ['旅行', '文学']); assert.equal(a.experienceEntries, undefined); assert.equal(a.bookReading.arrangement, 'want');
  for (const item of fixture.items) assert.deepEqual(imported.items.find(value => value.id === item.id), item);
  assert.deepEqual(imported.futureRoot, fixture.futureRoot);
  check('CSV文件预览资料、真实修订冲突保留选择可重试；追加保存不覆盖旧书/游戏/未知字段');
  await page.getByRole('button', { name: '批量收录', exact: true }).click();
  await modal().getByRole('textbox', { name: '作品清单', exact: true }).fill('表格新书甲\n表格新书乙'); await modal().getByRole('button', { name: '生成预览', exact: true }).click();
  assert.equal(await modal().locator('.steam-import-row--duplicate').count(), 2); assert.equal(await modal().getByRole('button', { name: '导入选中的 0 件', exact: true }).isDisabled(), true); await discard();
  check('同一书单再次导入全部识别已有，零增量');
  await page.getByRole('button', { name: '批量收录', exact: true }).click();
  await modal().getByLabel('新增书籍的阅读状态', { exact: true }).selectOption('abandoned');
  await modal().getByRole('textbox', { name: '作品清单', exact: true }).fill('明确弃读的新书'); await modal().getByRole('button', { name: '生成预览', exact: true }).click();
  await modal().getByRole('button', { name: '导入选中的 1 件', exact: true }).click(); await modal().waitFor({ state: 'detached' });
  assert.equal(saved().items.find(item => item.title === '明确弃读的新书').bookReading.arrangement, 'abandoned');
  check('新增书籍可直接统一设置弃读，不伪造阅读日志');
  const persisted = saved(); await app.close(); app = null; await launch(); assert.deepEqual(saved(), persisted);
  check('完整进程重启后书籍资料、双评分、来源与阅读状态原样读回');
  await page.getByRole('button', { name: '游戏', exact: true }).click(); await page.getByRole('button', { name: '收录作品', exact: true }).click();
  await page.getByRole('dialog', { name: '收录作品', exact: true }).getByRole('button', { name: /批量收录/ }).click();
  assert.equal(await modal().getByLabel('文本清单的板块', { exact: true }).inputValue(), 'game'); await modal().getByRole('button', { name: '取消', exact: true }).click();
  check('游戏收录仍默认Steam游戏，不受书籍入口影响');
  assert.deepEqual(errors, []); check('无渲染进程异常');
})().catch(async error => { console.error(error); process.exitCode = 1; if (page && !page.isClosed()) await shot('failure').catch(() => {}); }).finally(async () => {
  fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({ passed: !process.exitCode, version, packaged, checks, errors, data }, null, 2));
  if (app) await app.close(); console.log(JSON.stringify({ passed: !process.exitCode, checks: checks.length, output }));
});
