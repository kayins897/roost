// Real Electron, isolated files; source responses are intercepted in the test process only.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '..'), executable = process.argv[2], packaged = Boolean(executable);
const version = require('../package.json').version;
const output = path.join(root, 'evidence', 'batch-intake-v0436', packaged ? 'packaged' : 'source');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-batch-intake-')), file = path.join(data, 'library.json');
fs.mkdirSync(output, { recursive: true });
const make = (id, title, extra = {}) => ({ id, title, category: 'book', subcategory: '文学', creator: '我的作者', year: '2026', status: 'want', tags: ['我的标签'], impression: '我的感想', review: '我的长文', favorite: true, artwork: 'default', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '', ...extra });
const fixture = { schemaVersion: 1, futureRoot: { keep: true }, items: [make('b1', '原有书', { bookDetails: { isbn: '9787302423287', publisher: '原有出版社', doubanScore: 0, future: 'keep' }, personalScore: 0, externalIds: [{ provider: 'douban', id: '123' }] }), make('f1', '原有电影', { category: 'screen', subcategory: '电影', screenDetails: { durationMinutes: 0 }, personalScore: 0 }), make('g1', '原有游戏', { category: 'game', subcategory: 'Steam', playtimeMinutes: 0 })] };
let app, page; const checks = [], errors = [], layouts = [];
const raw = () => fs.readFileSync(file, 'utf8'), saved = () => JSON.parse(raw());
const check = name => { checks.push(name); console.log('PASS ' + name); };
const modal = () => page.getByRole('dialog', { name: '批量导入作品', exact: true });
const entry = title => modal().locator('.intake-preview-entry').filter({ has: page.getByRole('checkbox', { name: '导入 ' + title, exact: true }) });
async function size(width) { await app.evaluate(({ BrowserWindow }, width) => { const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(360, 500); win.setBounds({ width, height: 1000 }); win.show(); win.webContents.setBackgroundThrottling(false); }, width); await page.waitForTimeout(160); }
async function launch() {
  const env = { ...process.env, QIYU_E2E: '1', QIYU_TEST_DATA_DIR: data }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: executable || path.join(root, 'node_modules/electron/dist/electron.exe'), args: packaged ? [] : [root], env, timeout: 45000 });
  page = await app.firstWindow(); page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
  await page.locator('.sidebar-nav').waitFor({ state: 'attached' });
  assert.equal(await page.evaluate(() => window.qiyuDesktop.getInfo().dataDirectory), data); await size(1440);
  await app.evaluate(({ ipcMain }) => {
    globalThis.intakeQueries = []; globalThis.intakeMode = 'fail';
    ipcMain.removeHandler('qiyu:metadata');
    ipcMain.handle('qiyu:metadata', async (_event, query) => {
      globalThis.intakeQueries.push(query);
      const id = query.split('/')[4], book = query.includes('book.douban.com');
      if (id === '12345') await new Promise(resolve => setTimeout(resolve, 700));
      if (id === '789' && globalThis.intakeMode === 'fail') return { ok: false, error: '来源暂时限流，请稍后重试' };
      if (id === '888') return { ok: true, value: [{ provider: 'douban', category: 'screen', externalId: '9999', title: '错误返回', sourceUrl: 'https://movie.douban.com/subject/9999/' }] };
      return { ok: true, value: [{ provider: 'douban', externalId: id, category: book ? 'book' : 'screen', title: '来源名称 ' + id, sourceUrl: query, creator: '来源作者', year: '2025',
        ...(book ? { bookDetails: { publisher: '来源出版社', translator: '来源译者', isbn: id === '456' ? '9787111128069' : '', description: '来源简介', doubanScore: 8.6, metadataSource: '豆瓣' } }
          : { subcategory: '番剧', screenDetails: { actors: ['来源演员'], durationMinutes: 24, episodeCount: 12, doubanScore: 8.1, metadataSource: '豆瓣' } }),
      }] };
    });
  });
}
async function dock() { if (await page.locator('.mobile-menu').isVisible() && !await page.locator('.sidebar').evaluate(node => node.classList.contains('sidebar--open'))) await page.locator('.mobile-menu').click(); }
async function navigate(label) { await dock(); await page.getByRole('button', { name: label, exact: true }).click(); }
async function open() { await dock(); await page.getByRole('button', { name: '收录作品', exact: true }).click(); await page.locator('.collection-hub-actions').getByRole('button', { name: /批量收录/ }).click(); await modal().waitFor(); }
async function parse(text) { await modal().getByRole('textbox', { name: '作品清单', exact: true }).fill(text); await modal().getByRole('button', { name: '生成预览', exact: true }).click(); }
async function discard() { await modal().getByRole('button', { name: '取消', exact: true }).click(); await modal().getByRole('button', { name: '放弃本次清单', exact: true }).click(); await modal().waitFor({ state: 'detached' }); }
async function correct(title) { await entry(title).getByRole('button', { name: '修正 ' + title, exact: true }).click(); return modal().getByRole('form', { name: '修正导入资料' }); }
async function shot(name) { await page.mouse.move(1000, 60); await page.screenshot({ path: path.join(output, name + '.png') }); }
async function layout(name) {
  const result = await modal().evaluate(node => { const r = node.getBoundingClientRect(); return { width: innerWidth, left: r.left, right: r.right, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }; });
  layouts.push({ name, ...result }); assert.ok(result.left >= 0 && result.right <= result.width + 1 && result.scrollWidth <= result.clientWidth + 1, JSON.stringify(result)); await shot(name);
}
(async () => {
  fs.writeFileSync(file, JSON.stringify(fixture, null, 2)); await launch(); await navigate('书籍'); const original = raw();
  await open(); await parse('书名,作者,ISBN,豆瓣链接,我的评分,豆瓣评分,出版社\nISBN别名,,978-7-302-42328-7,,,,\n录错书名,我的指定作者,,https://book.douban.com/subject/456/,0,0,\n待重试书,,,https://book.douban.com/subject/789/,,,\n后续书,,,https://book.douban.com/subject/999/,,,');
  assert.equal(await entry('ISBN别名').getByRole('checkbox').isDisabled(), true); assert.equal(raw(), original);
  check('Valid formatted ISBN detects an existing renamed book; generating preview is zero-write');
  let form = await correct('录错书名'); await form.getByLabel('书名', { exact: true }).fill('原有书'); await form.getByRole('button', { name: '应用到预览', exact: true }).click();
  assert.equal(await entry('原有书').getByRole('checkbox').isDisabled(), true); assert.equal(raw(), original);
  form = await correct('原有书'); await form.getByLabel('书名', { exact: true }).fill('修正后的书'); await form.getByLabel('我的评分', { exact: true }).fill('11'); await form.getByRole('button', { name: '应用到预览', exact: true }).click(); await form.getByRole('alert').waitFor();
  await form.getByLabel('我的评分', { exact: true }).fill('0'); await form.getByRole('button', { name: '应用到预览', exact: true }).click();
  assert.equal(await entry('修正后的书').getByRole('checkbox').isDisabled(), false);
  form = await correct('修正后的书'); await form.getByLabel('书名', { exact: true }).fill('取消的改名'); await form.getByRole('button', { name: '取消修正', exact: true }).click(); await entry('修正后的书').waitFor();
  check('Inline correction rechecks duplicates, rejects invalid scores and cancels without a save');
  await modal().getByRole('button', { name: '读取所选 3 件', exact: true }).click();
  await entry('待重试书').getByText('来源暂时限流，请稍后重试', { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.steam-import-source textarea').disabled);
  const queries = await app.evaluate(() => globalThis.intakeQueries); assert.equal(queries.length, 2); assert.ok(!queries.some(query => query.includes('/999/'))); assert.equal(raw(), original);
  form = await correct('修正后的书'); assert.equal(await form.getByLabel('作者', { exact: true }).inputValue(), '我的指定作者'); assert.equal(await form.getByLabel('出版社', { exact: true }).inputValue(), '来源出版社'); assert.equal(await form.getByLabel('我的评分', { exact: true }).inputValue(), '0'); assert.equal(await form.getByLabel('豆瓣评分', { exact: true }).inputValue(), '0'); await form.getByRole('button', { name: '取消修正' }).click();
  await shot('books-enriched-preview'); check('Exact-link queue fills gaps, preserves user values and zero scores, pauses on failure without saving');
  await app.evaluate(() => { globalThis.intakeMode = 'ok'; });
  await entry('待重试书').getByRole('button', { name: '读取 待重试书 的豆瓣资料', exact: true }).click(); await entry('待重试书').getByText('资料已补入预览，尚未导入', { exact: true }).waitFor();
  const before = raw(); fs.writeFileSync(file, before + '\n'); await modal().getByRole('button', { name: '导入选中的 3 件', exact: true }).click(); await modal().getByText('保存未完成，预览和选择已保留。请处理收藏库保存提示后重试', { exact: true }).waitFor(); assert.equal(raw(), before + '\n');
  fs.writeFileSync(file, before); await modal().getByRole('button', { name: '导入选中的 3 件', exact: true }).click(); await modal().waitFor({ state: 'detached' });
  const addedBook = saved().items.find(item => item.title === '修正后的书'); assert.equal(addedBook.bookDetails.publisher, '来源出版社'); assert.equal(addedBook.bookDetails.doubanScore, 0); assert.equal(addedBook.personalScore, 0); assert.equal(addedBook.bookReading.arrangement, 'want'); assert.equal(addedBook.experienceEntries, undefined);
  for (const item of fixture.items) assert.deepEqual(saved().items.find(value => value.id === item.id), item);
  assert.deepEqual(saved().futureRoot, fixture.futureRoot); check('Source retry and real revision-conflict retry keep the preview; append preserves all existing personal fields');

  await open(); await parse('待停止书'); form = await correct('待停止书'); await form.getByLabel('来源链接', { exact: true }).fill('https://book.douban.com/subject/12345/'); await form.getByRole('button', { name: '应用到预览' }).click();
  const beforeCancel = raw(); await entry('待停止书').getByRole('button', { name: '读取 待停止书 的豆瓣资料', exact: true }).click(); await modal().getByRole('button', { name: '停止读取', exact: true }).click();
  await modal().getByText('已停止，保留原有清单资料', { exact: true }).waitFor(); assert.equal(raw(), beforeCancel);
  form = await correct('待停止书'); assert.equal(await form.getByLabel('作者', { exact: true }).inputValue(), ''); await form.getByRole('button', { name: '取消修正' }).click(); await discard();
  check('Stopping during an in-flight request discards its late response and does not write the collection');
  await open(); await parse('关闭时读取'); form = await correct('关闭时读取'); await form.getByLabel('来源链接', { exact: true }).fill('https://book.douban.com/subject/12345/'); await form.getByRole('button', { name: '应用到预览' }).click();
  await entry('关闭时读取').getByRole('button', { name: '读取 关闭时读取 的豆瓣资料', exact: true }).click(); await discard(); await open(); await parse('新的清单'); await page.waitForTimeout(850);
  assert.equal(await modal().locator('.intake-row-message').count(), 0); assert.equal(raw(), beforeCancel); await discard();
  check('Closing a pending queue never contaminates a subsequently opened import');

  await navigate('影视'); await open();
  await parse('片名,导演,年份,影视类型,豆瓣链接,片长,总集数,我的评分\n手工电影,我的导演,2026,电影,,0,,0\n手工番剧,,2025,番剧,,24,12,\n由来源判定,,, ,https://movie.douban.com/subject/777/,,,\n编号错误,,,,https://movie.douban.com/subject/888/,,,');
  await entry('由来源判定').getByRole('button', { name: '读取 由来源判定 的豆瓣资料', exact: true }).click(); await entry('由来源判定').getByText('资料已补入预览，尚未导入', { exact: true }).waitFor();
  assert.ok((await entry('由来源判定').innerText()).includes('番剧'));
  await entry('编号错误').getByRole('button', { name: '读取 编号错误 的豆瓣资料', exact: true }).click(); await entry('编号错误').getByText('来源返回的作品与清单链接不一致，未应用资料', { exact: true }).waitFor();
  await shot('films-types-and-source');
  form = await correct('手工电影'); await layout('correction-wide'); await size(390);
  assert.equal(await modal().locator('.steam-import-rows').evaluate(node => getComputedStyle(node).maxHeight), 'none', 'correction must use the outer dialog scroll rather than a 300px inner scroll');
  await form.evaluate(node => node.scrollIntoView({ block: 'start' })); await layout('correction-narrow'); await form.getByRole('button', { name: '取消修正' }).click(); await size(1440);
  await modal().getByRole('button', { name: '导入选中的 4 件', exact: true }).click(); await modal().waitFor({ state: 'detached' });
  const movie = saved().items.find(item => item.title === '手工电影'); assert.equal(movie.screenDetails.durationMinutes, 0); assert.equal(movie.personalScore, 0); assert.equal(movie.experienceEntries, undefined); assert.equal(movie.screenViewing, undefined);
  assert.equal(saved().items.find(item => item.title === '手工番剧').subcategory, '番剧'); assert.equal(saved().items.find(item => item.title === '由来源判定').subcategory, '番剧');
  assert.equal(saved().items.find(item => item.title === '编号错误').creator, ''); check('Film table keeps per-row types, source fills an unspecified anime type, mismatched source IDs are rejected; wide/narrow layouts fit');
  await open(); await modal().getByLabel('文本清单的影视类型', { exact: true }).selectOption('series'); await parse('文本连续剧'); await modal().getByRole('button', { name: '导入选中的 1 件', exact: true }).click(); await modal().waitFor({ state: 'detached' });
  assert.equal(saved().items.find(item => item.title === '文本连续剧').subcategory, '连续剧'); check('Single-column film/series text respects the selected default type only at final import');
  await open(); await parse('手工电影\n手工番剧\n由来源判定'); assert.equal(await modal().getByRole('button', { name: '导入选中的 0 件', exact: true }).isDisabled(), true); await discard(); check('Importing the same media list again is zero-increment');
  await open(); await page.evaluate(() => { localStorage.setItem('qiyu.interface.locale.v1', 'en'); window.dispatchEvent(new StorageEvent('storage', { key: 'qiyu.interface.locale.v1', newValue: 'en', storageArea: localStorage })); });
  await page.getByRole('dialog', { name: 'Batch import', exact: true }).waitFor(); await size(390); await shot('english-narrow');
  await page.getByRole('dialog', { name: 'Batch import', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click(); await size(1440);
  const persisted = raw(); await app.close(); app = null; await launch(); assert.equal(raw(), persisted); check('English import opens at narrow width; process restart reads back imported data unchanged');
  assert.deepEqual(errors, []); check('No renderer exceptions');
})().catch(async error => { console.error(error); process.exitCode = 1; if (page && !page.isClosed()) await shot('failure').catch(() => {}); }).finally(async () => {
  fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({ passed: !process.exitCode, version, packaged, checks, errors, layouts, data, network: 'mock source responses over real IPC; no live source requests' }, null, 2));
  if (app) await app.close(); console.log(JSON.stringify({ passed: !process.exitCode, checks: checks.length, output }));
});
