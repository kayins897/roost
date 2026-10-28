// Independent synthetic browser checks: no installed app, account or user library.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const out = path.resolve(process.env.READING_DESK_OUTPUT || 'evidence/reading-desk-preview');
const url = process.env.READING_DESK_URL || 'http://127.0.0.1:4190/';
const results = [], errors = [], external = [];
let browser, page, storageWrites = 0;
const button = name => page.getByRole('button', { name, exact: true });
const dialog = () => page.locator('dialog[open]').last();
const books = () => page.locator('.rd-library-shelf .rd-book');
const ids = async () => new Set(await books().evaluateAll(nodes => nodes.map(node => node.dataset.workId)));
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const click = async locator => { await locator.click(); await settle(); };
const check = async (name, run) => { await run(); results.push({ name, pass: true }); console.log('PASS ' + name); };
const reset = async () => { await page.goto(url); await page.evaluate(() => document.fonts.ready); await settle(); };
const shot = name => page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
const openBook = id => click(page.locator(`.rd-book[data-work-id="${id}"] .rd-cover-link`));
const choose = label => click(dialog().getByRole('group', { name: '修改阅读安排' }).getByRole('button', { name: label, exact: true }));
const close = async () => { await page.keyboard.press('Escape'); await settle(); };
const openFilters = async () => { if (await page.locator('.rd-facets-trigger').getAttribute('aria-expanded') !== 'true') await click(page.locator('.rd-facets-trigger')); };
const tab = label => click(page.getByRole('tab', { name: label, exact: true }));
const option = label => click(page.locator('.rd-facets-choices').getByRole('button', { name: label }));
const clear = () => click(button('清除所有资料筛选条件'));
const noOverflow = async () => {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1
    && document.querySelector('.rd-shell').scrollWidth <= document.querySelector('.rd-shell').clientWidth + 1));
};

(async () => {
  fs.mkdirSync(out, { recursive: true });
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  context.setDefaultTimeout(7000);
  await context.exposeBinding('__recordFacetWrite', () => storageWrites++);
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(new URL(url).origin + '/') && !/^(file:|data:)/.test(request.url())) external.push(request.url()); });
  await page.addInitScript(() => {
    window.__facetWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...args) { window.__facetWrites++; window.__recordFacetWrite(); return original.apply(this, args); };
  });
  await reset();
  await check('six single-selection shelves include every book, with readable current state and history', async () => {
    assert.equal(await books().count(), 8); assert.equal((await ids()).size, 8);
    await shot('books-all-grid');
    for (const [name, expected] of [['想读', 3], ['在读', 2], ['已读', 5], ['闲置', 1], ['弃读', 1], ['全部', 8]]) {
      await click(button(name)); assert.equal(await books().count(), expected);
      assert.equal(await page.locator('.rd-face-switch [aria-pressed="true"]').count(), 1);
    }
    await click(button('弃读')); assert.deepEqual(await ids(), new Set(['b5']));
    await click(button('已读')); assert.ok((await ids()).has('b5'));
  });
  await check('idle and abandonment retain history, planned reason and minutes; editing reason does not resume', async () => {
    await click(button('全部')); await openBook('b1');
    const original = await dialog().locator('.rd-detail-plan p').innerText();
    await choose('闲置'); assert.equal(await dialog().locator('.rd-round').count(), 1);
    await click(dialog().getByRole('button', { name: '调整计划', exact: true }));
    await dialog().getByLabel('为什么想读', { exact: false }).fill('稍后再读，保留这份期待。');
    await click(dialog().getByRole('button', { name: '保存计划', exact: true }));
    await openBook('b1'); assert.equal(await dialog().locator('.rd-arrangement strong').innerText(), '闲置');
    assert.notEqual(await dialog().locator('.rd-detail-plan p').innerText(), original);
    await choose('弃读'); await close(); await click(button('弃读')); assert.ok((await ids()).has('b1'));
    await click(button('已读')); assert.ok((await ids()).has('b1'));
    assert.ok((await page.locator('[data-date="2026-10-27"]').getAttribute('aria-label')).includes('50 分钟'));
    await openBook('b1'); await click(dialog().getByRole('button', { name: '记一次阅读', exact: true }));
    await dialog().getByLabel('本次分钟数').fill('1');
    await click(dialog().getByRole('button', { name: '保存记录', exact: true }));
    await openBook('b1'); assert.equal(await dialog().locator('.rd-arrangement strong').innerText(), '弃读');
    assert.equal(await dialog().locator('.rd-round').count(), 1);
    await choose('在读'); await close(); await click(button('在读')); assert.equal(await books().count(), 2);
    await openBook('b1'); assert.equal(await dialog().locator('.rd-detail-plan p').innerText(), '稍后再读，保留这份期待。');
    await shot('books-classification-detail'); await close();
  });
  await check('first read classification requires a saved round, permits unknown date and never generates minutes', async () => {
    await reset(); await openBook('b7'); await choose('已读');
    assert.equal(await dialog().getByLabel('完成日期精度').inputValue(), 'unknown');
    await click(dialog().getByRole('button', { name: '取消', exact: true }));
    await openBook('b7'); assert.equal(await dialog().locator('.rd-arrangement strong').innerText(), '闲置');
    await choose('已读'); await dialog().getByLabel('一句话印象', { exact: false }).fill('仰望时间与宇宙。');
    await click(dialog().getByRole('button', { name: '保存并完成阅读', exact: true }));
    await click(button('已读')); assert.equal(await books().count(), 6);
    await openBook('b7'); assert.equal(await dialog().locator('.rd-round').count(), 1);
    assert.ok((await dialog().locator('.rd-round').innerText()).includes('日期未知'));
    await choose('已读'); assert.equal(await dialog().locator('.rd-round').count(), 1);
    await close(); assert.ok((await page.locator('[data-date="2026-10-27"]').getAttribute('aria-label')).includes('50 分钟'));
  });
  await check('personal and Douban scores are independent; zero results retain selected filters and recover', async () => {
    await reset(); await openFilters(); await tab('我的评分'); await option('我的评分：9–10 分');
    assert.deepEqual(await ids(), new Set(['b1', 'b2']));
    await tab('豆瓣评分'); await option('豆瓣评分：8–8.9 分'); assert.deepEqual(await ids(), new Set(['b2']));
    await tab('阅读来源'); await option('阅读来源：汉王电纸书'); assert.equal(await books().count(), 0);
    assert.equal(await page.locator('.rd-facet-condition').count(), 3);
    assert.ok((await page.locator('.rd-facets-choices [aria-pressed="true"]').innerText()).includes('0'));
    await click(page.locator('.rd-facets-trigger')); assert.equal(await page.locator('.rd-facets-panel').isVisible(), false);
    assert.equal(await page.locator('.rd-facet-condition').count(), 3);
    await click(button('清除搜索与筛选')); assert.equal(await books().count(), 8);
    await openFilters(); await tab('我的评分'); await option('我的评分：0–0.9 分'); assert.deepEqual(await ids(), new Set(['b4']));
    await clear(); await option('我的评分：未评分'); assert.deepEqual(await ids(), new Set(['b6', 'b7']));
    await tab('豆瓣评分'); await option('豆瓣评分：未记录'); assert.deepEqual(await ids(), new Set(['b7']));
    await clear();
  });
  await check('authors OR together; publisher, book type, tags and the two sources AND independently', async () => {
    await tab('作者'); await option('作者：伊塔洛·卡尔维诺'); await option('作者：赫尔曼·黑塞');
    assert.deepEqual(await ids(), new Set(['b1', 'b2']));
    await tab('出版社'); await option('出版社：示例出版社·远方'); assert.equal(await books().count(), 2);
    await tab('书籍类型'); await option('书籍类型：文学'); assert.equal(await books().count(), 2);
    await click(button('文学，2 本书')); assert.equal(await books().count(), 2);
    await click(button('哲学，2 本书')); assert.equal(await books().count(), 2);
    await shot('books-facets-combined');
    await click(page.locator('.rd-tag-filter').getByRole('button', { name: /清除标签/ })); await clear();
    await tab('阅读来源'); await option('阅读来源：微信读书'); assert.deepEqual(await ids(), new Set(['b4', 'b5']));
    await tab('资料来源'); await option('资料来源：豆瓣'); assert.equal(await books().count(), 0);
    await clear(); await tab('出版社'); await option('出版社：未记录'); assert.deepEqual(await ids(), new Set(['b4', 'b7']));
    await clear(); await tab('作者');
    const first = page.getByRole('tab', { name: '作者', exact: true }); await first.focus();
    await page.keyboard.press('End'); assert.equal(await page.evaluate(() => document.activeElement.textContent), '资料来源');
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.rd-facets-panel').isVisible(), false);
    assert.equal(await page.locator('.rd-facets-trigger').evaluate(node => document.activeElement === node), true);
  });
  await check('expanded filters, shelf counts and list/grid layouts fit desktop and narrow windows', async () => {
    for (const [width, height] of [[1440, 1050], [1000, 900], [768, 900], [390, 844], [360, 740]]) {
      await page.setViewportSize({ width, height }); await reset(); await openFilters();
      await tab('出版社'); await noOverflow();
      await shot('books-facets-' + width);
      await click(button('书架横向列表')); await noOverflow();
      if (width === 1440 || width === 390) await shot('books-all-list-' + width);
      await click(button('已读')); await noOverflow();
      if (width === 1440 || width === 390) await shot('books-records-facets-' + width);
    }
  });
  await check('offline entry supports score filters with zero external requests and storage writes', async () => {
    await page.goto(pathToFileURL(path.join(out, 'index.html')).href); await page.evaluate(() => document.fonts.ready);
    await openFilters(); await tab('我的评分'); await option('我的评分：9–10 分');
    assert.deepEqual(await ids(), new Set(['b1', 'b2']));
    assert.equal(await page.evaluate(() => window.__facetWrites), 0);
    assert.equal(storageWrites, 0);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
  });
  fs.writeFileSync(path.join(out, 'facets-verification.json'), JSON.stringify({ testedAt: new Date().toISOString(), results, errors, external, storageWrites, realLibraryTouched: false }, null, 2));
  console.log(`Book facets: ${results.length}/${results.length} groups passed.`);
})().catch(async error => {
  console.error(error); process.exitCode = 1;
  if (page) await shot('facets-failure').catch(() => {});
  fs.writeFileSync(path.join(out, 'facets-verification.json'), JSON.stringify({ results, errors, external, failure: String(error) }, null, 2));
}).finally(async () => { await browser?.close(); });
