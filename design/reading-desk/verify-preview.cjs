// Isolated synthetic UI checks. Never launches the installed app or reads user data.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const out = path.resolve(process.env.READING_DESK_OUTPUT || 'evidence/reading-desk-preview');
const url = process.env.READING_DESK_URL || 'http://127.0.0.1:4190/';
const origin = new URL(url).origin;
const results = [], errors = [], remote = [];
let browser, page, storageWrites = 0;
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const button = name => page.getByRole('button', { name, exact: true });
const click = async locator => { await locator.click(); await settle(); };
const dialog = () => page.locator('dialog[open]').last();
const books = () => page.locator('.rd-library-shelf .rd-book');
const ids = () => books().evaluateAll(nodes => nodes.map(node => node.dataset.workId));
const check = async (name, fn) => { await fn(); results.push({ name, pass: true }); console.log('PASS ' + name); };
const shot = async name => { await settle(); await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true }); };
const reset = async () => { await page.goto(url); await page.evaluate(() => document.fonts.ready); await settle(); };
const noOverflow = async () => {
  const d = await page.evaluate(() => {
    const shell = document.querySelector('.rd-shell');
    return { body: document.documentElement.scrollWidth, viewport: innerWidth, shell: shell.clientWidth, content: shell.scrollWidth };
  });
  assert.ok(d.body <= d.viewport + 1 && d.content <= d.shell + 1, JSON.stringify(d));
};

(async () => {
  fs.mkdirSync(out, { recursive: true });
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  context.setDefaultTimeout(7000);
  await context.exposeBinding('__recordDeskWrite', () => storageWrites++);
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(origin + '/') && !/^(file:|data:)/.test(request.url())) remote.push(request.url()); });
  await page.addInitScript(() => {
    window.__deskWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...args) { window.__deskWrites++; window.__recordDeskWrite(); return original.apply(this, args); };
  });
  await reset();
  await check('unified shelf opens with in-progress books pinned and no reading hero', async () => {
    assert.equal(await books().count(), 8);
    assert.deepEqual((await ids()).slice(0, 2), ['b1', 'b3']);
    assert.equal(await page.locator('.rd-current, .rd-reading-grid, .rd-tag-cloud').count(), 0);
    assert.equal(await button('全部').getAttribute('aria-pressed'), 'true');
    assert.equal(await button('已读').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.getByRole('button', { name: /开始阅读|标为在读|音乐/ }).count(), 0);
    await noOverflow(); await shot('reading-plan-grid');
  });
  await check('single-face views and in-progress filter preserve rereading history and plans', async () => {
    await click(button('在读')); assert.deepEqual(await ids(), ['b1', 'b3']);
    await click(button('全部')); assert.equal(await books().count(), 8);
    await click(button('已读')); assert.equal(await books().count(), 5);
    assert.equal(await page.locator('[data-face="plan"]').count(), 0);
    await click(button('在读')); assert.deepEqual(new Set(await ids()), new Set(['b1', 'b3']));
    await click(button('想读')); assert.equal(await books().count(), 3);
    assert.equal(await button('在读').getAttribute('aria-pressed'), 'false');
    await click(button('想读')); assert.equal(await button('想读').getAttribute('aria-pressed'), 'true');
  });
  await check('plan and record grid/list choices are retained independently', async () => {
    await click(button('书架横向列表')); await shot('reading-plan-list');
    await click(button('已读'));
    assert.equal(await page.locator('[data-layout]').getAttribute('data-layout'), 'grid');
    assert.equal(await page.locator('.rd-history blockquote').count(), 5); await shot('reading-records-grid');
    await click(button('书架横向列表')); await shot('reading-records-list');
    await click(button('想读')); assert.equal(await page.locator('[data-layout]').getAttribute('data-layout'), 'list');
    await click(button('已读')); assert.equal(await page.locator('[data-layout]').getAttribute('data-layout'), 'list');
  });
  await check('large yearly heatmap precedes filters and is unaffected by library filters', async () => {
    const d = await page.evaluate(() => ({ heat: document.querySelector('.rd-reading-overview').getBoundingClientRect(), filters: document.querySelector('.rd-library-toolbar').getBoundingClientRect(), cell: document.querySelector('.bk-heat-day').getBoundingClientRect() }));
    assert.ok(d.heat.bottom < d.filters.top && d.heat.width > 1000 && d.cell.height >= 16);
    const before = await page.locator('[data-date="2026-10-27"]').getAttribute('aria-label');
    await click(button('文学，3 本书')); assert.equal(await books().count(), 3);
    await click(button('哲学，3 本书')); assert.equal(await books().count(), 3);
    assert.equal(await page.locator('[data-date="2026-10-27"]').getAttribute('aria-label'), before);
    assert.equal(await page.locator('.rd-tag-match').innerText(), '同时包含：文学、哲学');
    await click(page.locator('.rd-tag-filter').getByRole('button', { name: /清除标签/ })); assert.equal(await books().count(), 5);
  });
  await check('tags support empty creation, assignment, cancellation and unassignment without deleting books', async () => {
    await click(button('管理书籍标签'));
    await dialog().getByLabel('新标签名称').fill('夏日重读'); await click(dialog().getByRole('button', { name: '创建标签', exact: true }));
    assert.equal(await dialog().getByRole('button', { name: '应用分配', exact: true }).isEnabled(), false);
    await dialog().getByRole('checkbox', { name: '将夏日重读分配给《悉达多》' }).check();
    assert.ok((await dialog().innerText()).includes('将更新 1 本书'));
    await click(dialog().getByRole('button', { name: '应用分配', exact: true })); await shot('reading-tag-manager');
    await click(dialog().getByRole('button', { name: '完成', exact: true }));
    await click(button('展开全部标签'));
    await click(button('夏日重读，1 本书')); assert.deepEqual(await ids(), ['b2']);
    await click(button('想读')); assert.deepEqual(await ids(), ['b2']);
    await click(button('管理书籍标签'));
    await click(dialog().locator('.rd-tag-catalog').getByRole('button', { name: /夏日重读/ }));
    await dialog().getByRole('checkbox', { name: '将夏日重读分配给《悉达多》' }).uncheck();
    page.once('dialog', prompt => prompt.dismiss()); await page.keyboard.press('Escape'); await settle();
    assert.equal(await dialog().getByRole('checkbox', { name: '将夏日重读分配给《悉达多》' }).isChecked(), false);
    page.once('dialog', prompt => prompt.accept()); await page.keyboard.press('Escape'); await settle();
    assert.equal(await button('夏日重读，1 本书').count(), 1);
    await click(button('管理书籍标签'));
    await click(dialog().locator('.rd-tag-catalog').getByRole('button', { name: /夏日重读/ }));
    await dialog().getByRole('checkbox', { name: '将夏日重读分配给《悉达多》' }).uncheck();
    await click(dialog().getByRole('button', { name: '应用分配', exact: true }));
    await click(dialog().getByRole('button', { name: '完成', exact: true }));
    assert.equal(await books().count(), 0); assert.equal(await button('夏日重读，0 本书').count(), 1);
    await click(page.locator('.rd-tag-filter').getByRole('button', { name: /清除标签/ })); assert.equal(await books().count(), 3);
  });
  await check('book context tags choose existing tags, cancel drafts and feed search/detail immediately', async () => {
    const target = page.locator('.rd-book[data-work-id="b4"]');
    await target.click({ button: 'right' }); await settle();
    await click(dialog().getByRole('button', { name: '科学', exact: true }));
    await dialog().getByLabel('新标签名称').fill('不应保存的标签'); await click(dialog().getByRole('button', { name: '添加新标签', exact: true }));
    await click(dialog().getByRole('button', { name: '取消', exact: true }));
    assert.equal(await page.locator('.rd-tag-chip').filter({ hasText: '不应保存的标签' }).count(), 0);
    await target.click({ button: 'right' }); await settle();
    assert.equal(await dialog().getByRole('button', { name: '科学', exact: true }).getAttribute('aria-pressed'), 'false');
    await click(dialog().getByRole('button', { name: '科学', exact: true }));
    await dialog().getByLabel('新标签名称').fill('太空之旅'); await click(dialog().getByRole('button', { name: '添加新标签', exact: true }));
    await click(dialog().getByRole('button', { name: '保存标签', exact: true }));
    const search = page.getByRole('textbox', { name: '搜索书名、作者、标签或感想' });
    await search.fill('太空之旅'); await settle(); assert.deepEqual(await ids(), ['b4']);
    await click(page.locator('.rd-book[data-work-id="b4"] .rd-cover-link'));
    assert.ok((await dialog().locator('.rd-detail-tags').innerText()).includes('科学'));
    assert.ok((await dialog().locator('.rd-detail-tags').innerText()).includes('太空之旅'));
    await page.keyboard.press('Escape'); await settle(); await click(button('清空搜索'));
  });
  await check('deleting a selected tag confirms scope, supports cancel and releases its filter', async () => {
    await click(button('太空之旅，1 本书')); assert.equal(await books().count(), 1);
    await click(button('管理书籍标签'));
    await click(dialog().locator('.rd-tag-catalog').getByRole('button', { name: /太空之旅/ }));
    page.once('dialog', prompt => { assert.ok(prompt.message().includes('1 本书')); return prompt.dismiss(); });
    await click(dialog().getByRole('button', { name: '删除标签：太空之旅', exact: true }));
    assert.equal(await dialog().getByRole('button', { name: '删除标签：太空之旅', exact: true }).count(), 1);
    page.once('dialog', prompt => prompt.accept());
    await click(dialog().getByRole('button', { name: '删除标签：太空之旅', exact: true }));
    await click(dialog().getByRole('button', { name: '完成', exact: true }));
    assert.equal(await books().count(), 3); assert.equal(await page.locator('.rd-tag-chip').filter({ hasText: '太空之旅' }).count(), 0);
    await click(button('已读')); assert.equal(await books().count(), 5);
  });
  await check('search covers impressions and plan reasons with recoverable empty results', async () => {
    const search = page.getByRole('textbox', { name: '搜索书名、作者、标签或感想' });
    await search.fill('习以为常'); await settle(); assert.deepEqual(await ids(), ['b3']);
    await search.fill('并不存在的书名'); await settle(); assert.equal(await books().count(), 0);
    await click(button('清空搜索')); assert.equal(await books().count(), 5);
    await click(button('想读')); await search.fill('沿河走'); await settle(); assert.deepEqual(await ids(), ['b2']);
    await click(button('清空搜索'));
  });
  await check('theme collections and nested dialogs restore the original dock focus', async () => {
    const trigger = button('主题书单'); await click(trigger);
    assert.equal(await dialog().locator('.rd-collection-book').count(), 7); await shot('reading-collection');
    await click(dialog().locator('.rd-collection-book').first());
    assert.ok((await dialog().innerText()).includes('我的阅读与感想')); await shot('reading-detail');
    await page.keyboard.press('Escape'); await settle();
    assert.equal(await trigger.evaluate(node => document.activeElement === node), true);
  });
  await check('minute editing validates and preserves failure drafts without completing books', async () => {
    await click(button('全部'));
    await click(button('为《看不见的城市》记一次阅读'));
    await dialog().getByLabel('本次分钟数').fill('-2'); await click(dialog().getByRole('button', { name: '保存记录', exact: true }));
    assert.ok((await dialog().getByRole('alert').innerText()).includes('0–1440'));
    await dialog().getByLabel('本次分钟数').fill('30');
    await dialog().locator('summary').click(); await dialog().getByLabel('模拟保存失败').check();
    await click(dialog().getByRole('button', { name: '保存记录', exact: true }));
    assert.equal(await dialog().getByLabel('本次分钟数').inputValue(), '30');
    await dialog().getByLabel('模拟保存失败').uncheck(); await click(dialog().getByRole('button', { name: '保存记录', exact: true }));
    assert.equal(await books().count(), 8); await click(button('已读')); assert.equal(await books().count(), 5);
    const today = page.locator('[data-date="2026-10-27"]');
    assert.ok((await today.getAttribute('aria-label')).includes('80 分钟'));
    assert.ok((await page.locator('[data-date="2026-10-21"]').getAttribute('aria-label')).includes('0 分钟'));
    assert.equal(await page.locator('[data-date="2026-10-18"]').getAttribute('data-known'), 'false');
    await today.focus(); await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.date), '2026-10-26');
    await page.keyboard.press('Enter'); await settle(); assert.ok((await dialog().innerText()).includes('2026.10.26'));
    await page.keyboard.press('Escape'); await settle();
  });
  await check('editing impressions preserves other rounds and future rereading plans', async () => {
    await click(page.locator('.rd-book[data-work-id="b2"] .rd-cover-link'));
    assert.equal(await dialog().locator('.rd-round').count(), 2);
    await click(dialog().locator('.rd-round').first().getByRole('button'));
    await dialog().getByLabel('一句话印象', { exact: false }).fill('慢下来，听河流，也听自己。');
    await click(dialog().getByRole('button', { name: '保存阅读记录', exact: true }));
    await click(page.locator('.rd-book[data-work-id="b2"] .rd-cover-link'));
    assert.equal(await dialog().locator('.rd-round').count(), 2);
    assert.ok((await dialog().innerText()).includes('慢下来，听河流，也听自己。'));
    await page.keyboard.press('Escape'); await settle(); await click(button('想读'));
    assert.equal(await page.locator('.rd-book[data-work-id="b2"]').count(), 1);
  });
  await check('sorting retains reading pinning; plan cancellation and refresh restore correctly', async () => {
    await click(button('全部'));
    await page.getByLabel('排序方式', { exact: true }).click(); await click(button('名称'));
    assert.deepEqual(new Set((await ids()).slice(0, 2)), new Set(['b1', 'b3']));
    await click(button('切换排序方向')); assert.deepEqual(new Set((await ids()).slice(0, 2)), new Set(['b1', 'b3']));
    await click(button('加入计划')); await dialog().getByRole('combobox', { name: '书籍', exact: true }).selectOption('b7');
    await click(dialog().getByRole('button', { name: '取消', exact: true })); assert.equal(await books().count(), 8);
    await click(button('加入计划')); await dialog().getByRole('combobox', { name: '书籍', exact: true }).selectOption('b7');
    await click(dialog().getByRole('button', { name: '保存计划', exact: true })); assert.equal(await books().count(), 8);
    await click(button('想读')); assert.equal(await books().count(), 4);
    await reset(); assert.equal(await books().count(), 8); assert.equal(await button('夏日重读，0 本书').count(), 0);
  });
  await check('shelves, heatmap and tag dialog fit five desktop/tablet/phone viewports', async () => {
    for (const [width, height] of [[1440, 1050], [1000, 900], [768, 900], [390, 844], [360, 740]]) {
      await page.setViewportSize({ width, height }); await reset(); await noOverflow();
      if (width !== 1440) await shot('reading-plan-' + width);
      await click(button('已读')); await noOverflow();
      if (width < 700) {
        assert.equal(await page.locator('.rd-heat-navigation').isVisible(), true);
        await click(button('回到年初'));
        assert.ok(await page.locator('.bk-heat-scroll').evaluate(node => node.scrollLeft < 2));
      }
      if (width !== 1440) await shot('reading-records-' + width);
      await click(button('书架横向列表')); await noOverflow();
      await click(button('管理书籍标签'));
      const bounds = await dialog().boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1);
      assert.ok(await dialog().evaluate(node => node.scrollWidth <= node.clientWidth + 1));
      await page.keyboard.press('Escape'); await settle();
      if (width < 700) {
        const bottom = await page.locator('.rd-shell').evaluate(node => node.getBoundingClientRect().bottom);
        const dockTop = await page.locator('.rd-dock').evaluate(node => node.getBoundingClientRect().top);
        assert.ok(bottom <= dockTop, `content ${bottom}, dock ${dockTop}`);
      }
      await page.locator('.rd-shell').evaluate(node => { node.scrollTop = node.scrollHeight; }); await settle();
      const ends = await page.evaluate(() => ({ book: document.querySelector('.rd-book:last-child').getBoundingClientRect().bottom, shell: document.querySelector('.rd-shell').getBoundingClientRect().bottom }));
      assert.ok(ends.book <= ends.shell - 18, JSON.stringify(ends));
      if (width === 390) await shot('reading-records-390-bottom');
    }
  });
  await check('offline entry has zero external requests, storage writes and page errors', async () => {
    await page.goto(pathToFileURL(path.join(out, 'index.html')).href); await page.evaluate(() => document.fonts.ready);
    assert.equal(await books().count(), 8); await click(button('已读')); assert.equal(await books().count(), 5);
    assert.equal(await page.evaluate(() => window.__deskWrites), 0); assert.equal(storageWrites, 0);
    assert.deepEqual(errors, []); assert.deepEqual(remote, []);
  });
  fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({ testedAt: new Date().toISOString(), type: 'isolated synthetic reading-library preview', results, errors, remoteRequests: remote, storageWrites, realLibraryTouched: false }, null, 2));
  console.log(`Reading library: ${results.length}/${results.length} groups passed.`);
})().catch(async error => {
  console.error(error); process.exitCode = 1;
  if (page) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
  fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({ results, errors, remoteRequests: remote, failure: String(error) }, null, 2));
}).finally(async () => { await browser?.close(); });
