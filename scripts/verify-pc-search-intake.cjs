// Real Electron renderer and storage, with synthetic source responses over IPC.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');

const root = path.resolve(__dirname, '..');
const executable = process.argv[2];
const output = path.join(root, 'evidence', 'pc-search-intake', executable ? 'packaged' : 'source');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-search-intake-'));
const file = path.join(data, 'library.json');
const game = {
  id: 'game-original', title: '原有游戏', category: 'game', subcategory: 'Steam', creator: '',
  year: '2026', status: 'active', tags: ['个人标签'], impression: '个人记录',
  favorite: true, artwork: 'default', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '',
  playtimeMinutes: 0, personalScore: 0, futureItem: { keep: true },
};
const fixture = { schemaVersion: 1, items: [game], futureRoot: { keep: true } };
const checks = [], errors = [];
const read = () => fs.readFileSync(file, 'utf8');
const saved = () => JSON.parse(read());
let app, page;
const pass = name => { checks.push(name); console.log('PASS', name); };
const modal = () => page.getByRole('dialog', { name: '从来源收录', exact: true });
const result = title => modal().locator('.metadata-candidate').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
async function search(label, value) {
  await modal().getByRole('textbox', { name: label, exact: true }).fill(value);
  await modal().getByRole('button', { name: '读取资料', exact: true }).click();
}
async function open(label) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('button', { name: '搜索收录', exact: true }).click();
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(fixture, null, 2));
  const original = read();
  const env = { ...process.env, QIYU_E2E: '1', QIYU_TEST_DATA_DIR: data };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: executable || path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: executable ? [] : [root],
    env, timeout: 45000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('.sidebar-nav').waitFor({ state: 'attached' });
  assert.equal(await page.evaluate(() => window.qiyuDesktop.getInfo().dataDirectory), data);
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(1440, 980);
    const book = { provider: 'douban', externalId: '125', category: 'book', title: '合成图书', creator: '合成作者', year: '2024', sourceUrl: 'https://book.douban.com/subject/125/' };
    const second = { ...book, externalId: '126', title: '另一本合成图书', sourceUrl: 'https://book.douban.com/subject/126/' };
    const movie = { provider: 'douban', externalId: '225', category: 'screen', title: '合成电影', originalTitle: 'Synthetic Film', year: '2014', sourceUrl: 'https://movie.douban.com/subject/225/' };
    globalThis.searchIntakeCalls = [];
    ipcMain.removeHandler('qiyu:metadata');
    ipcMain.handle('qiyu:metadata', async (_event, query, scope) => {
      globalThis.searchIntakeCalls.push([query, scope]);
      if (query === '图书' && scope === 'book') return { ok: true, value: [book, second] };
      if (query === '电影' && scope === 'screen') return { ok: true, value: [movie] };
      if (query === movie.sourceUrl) return { ok: false, error: '来源网站暂时限制了访问' };
      if (query === second.sourceUrl) {
        await new Promise(resolve => setTimeout(resolve, 750));
        return { ok: true, value: [second] };
      }
      if (query === book.sourceUrl) return { ok: true, value: [{ ...book, bookDetails: { publisher: '合成出版社', doubanScore: 8.4, metadataSource: '豆瓣' } }] };
      return { ok: false, error: '测试收到非预期请求' };
    });
  });
  await open('书籍');
  await search('书名、作者、ISBN 或作品链接', '图书');
  await result('合成图书').waitFor();
  assert.equal(read(), original);
  assert.deepEqual(await app.evaluate(() => globalThis.searchIntakeCalls), [['图书', 'book']]);
  pass('书籍入口按书名搜索，只读候选，无额外详情请求或写库');
  await result('合成图书').getByRole('button', { name: '加入想读', exact: true }).click();
  await result('合成图书').getByRole('button', { name: '已收录', exact: true }).waitFor();
  assert.ok(await result('合成图书').getByRole('button', { name: '已收录', exact: true }).isDisabled());
  const addedBook = saved().items.find(item => item.title === '合成图书');
  assert.equal(addedBook.status, 'want');
  assert.equal(addedBook.bookDetails.publisher, '合成出版社');
  assert.equal(addedBook.experienceEntries, undefined);
  assert.equal(await modal().getByRole('textbox').inputValue(), '图书');
  await page.screenshot({ path: path.join(output, 'books.png') });
  pass('选中后补资料并加入想读，候选与查询保留，重复入口禁用');
  const afterBook = read();
  await result('另一本合成图书').getByRole('button', { name: '加入想读', exact: true }).click();
  await modal().getByRole('button', { name: '关闭', exact: true }).first().click();
  await page.waitForTimeout(900);
  assert.equal(read(), afterBook);
  pass('详情读取中关闭，晚到响应无写库');
  await open('影视');
  await search('片名或作品链接', '电影');
  await result('合成电影').getByRole('button', { name: '加入想看', exact: true }).click();
  const fallback = result('合成电影').getByRole('button', { name: '仅用搜索结果收录', exact: true });
  await fallback.waitFor();
  assert.equal(read(), afterBook);
  await page.screenshot({ path: path.join(output, 'movies.png') });
  await fallback.click();
  await result('合成电影').getByRole('button', { name: '已收录', exact: true }).waitFor();
  const addedMovie = saved().items.find(item => item.title === '合成电影');
  assert.equal(addedMovie.subcategory, '电影');
  assert.equal(addedMovie.status, 'want');
  assert.equal(addedMovie.year, '2014');
  assert.equal(addedMovie.sourceUrl, 'https://movie.douban.com/subject/225/');
  assert.equal(addedMovie.screenViewing, undefined);
  pass('电影详情受限时，显式收录候选并保留片名、年份、来源');
  assert.deepEqual(saved().items.find(item => item.id === game.id), game);
  assert.deepEqual(saved().futureRoot, fixture.futureRoot);
  assert.equal(saved().items.length, 3);
  assert.deepEqual(errors, []);
  pass('已有游戏、个人记录与扩展原样保留，渲染无错误');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (app) await app.close();
  fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({
    passed: !process.exitCode, packaged: Boolean(executable), checks, errors,
    network: 'synthetic source responses over IPC',
  }, null, 2));
});
