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
const check = async (name, fn) => { await fn(); results.push({ name, pass: true }); console.log('PASS ' + name); };
const shot = async name => { await settle(); await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true }); };
const reset = async () => { await page.goto(url); await page.evaluate(() => document.fonts.ready); await settle(); };
const noOverflow = async () => {
  const dimensions = await page.evaluate(() => {
    const shell = document.querySelector('.rd-shell');
    return { body: document.documentElement.scrollWidth, viewport: innerWidth, shell: shell.clientWidth, content: shell.scrollWidth };
  });
  assert.ok(dimensions.body <= dimensions.viewport + 1 && dimensions.content <= dimensions.shell + 1, JSON.stringify(dimensions));
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
  await check('plan opens with current books first; removed reader buttons stay absent', async () => {
    assert.equal(await page.locator('.rd-current').count(), 2);
    assert.equal(await page.locator('.rd-queue .rd-book').count(), 3);
    assert.equal(await page.locator('[data-face="records"]').count(), 0);
    assert.equal(await page.getByRole('button', { name: /开始阅读|标为在读|音乐/ }).count(), 0);
    await noOverflow(); await shot('reading-plan-grid');
  });
  await check('plan and record layouts switch independently and retain their choices', async () => {
    await click(button('接下来读横向列表'));
    assert.equal(await page.locator('.rd-queue [data-layout]').getAttribute('data-layout'), 'list');
    await shot('reading-plan-list');
    await click(button('阅读记录'));
    assert.equal(await page.locator('.rd-history').getAttribute('data-layout'), 'grid');
    assert.equal(await page.locator('.rd-history .rd-book').count(), 5);
    assert.equal(await page.locator('.rd-history blockquote').count(), 5);
    assert.equal(await page.locator('[data-face="plan"]').count(), 0);
    await shot('reading-records-grid');
    await click(button('阅读记录横向列表')); await shot('reading-records-list');
    await click(button('阅读计划'));
    assert.equal(await page.locator('.rd-queue [data-layout]').getAttribute('data-layout'), 'list');
    await click(button('阅读记录'));
    assert.equal(await page.locator('.rd-history').getAttribute('data-layout'), 'list');
  });
  await check('tag word cloud counts distinct read books and toggles filtering without losing view', async () => {
    const literature = page.getByRole('button', { name: '文学，3 本书', exact: true });
    await click(literature);
    assert.equal(await page.locator('.rd-history .rd-book').count(), 3);
    assert.equal(await literature.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.rd-history').getAttribute('data-layout'), 'list');
    await click(button('清除标签筛选：文学'));
    assert.equal(await page.locator('.rd-history .rd-book').count(), 5);
    const sizes = await page.locator('.rd-tag-cloud button').evaluateAll(nodes => new Set(nodes.map(node => getComputedStyle(node).fontSize)).size);
    assert.ok(sizes > 1);
  });
  await check('search covers title, author, tags and personal impressions with a recoverable empty state', async () => {
    const search = page.getByRole('textbox', { name: '搜索书名、作者、标签或感想' });
    await search.fill('日常'); await settle();
    assert.equal(await page.locator('.rd-history .rd-book').count(), 1);
    assert.ok((await page.locator('.rd-history').innerText()).includes('设计中的设计'));
    await search.fill('并不存在的书名'); await settle();
    assert.equal(await page.locator('.rd-history .rd-book').count(), 0);
    await click(button('清空搜索')); assert.equal(await page.locator('.rd-history .rd-book').count(), 5);
    await click(button('阅读计划')); await search.fill('沿河走'); await settle();
    assert.equal(await page.locator('.rd-queue .rd-book').count(), 1);
    await click(button('清空搜索'));
  });
  await check('theme collection opens books; Escape returns focus to the initial trigger', async () => {
    const trigger = page.locator('.rd-collection').first(); await click(trigger);
    assert.ok((await dialog().innerText()).includes('城市与远方'));
    assert.equal(await dialog().locator('.rd-collection-book').count(), 3);
    await shot('reading-collection');
    await click(dialog().locator('.rd-collection-book').first());
    assert.ok((await dialog().innerText()).includes('我的阅读与感想'));
    assert.equal(await page.getByRole('button', { name: /开始阅读|标为在读/ }).count(), 0);
    await shot('reading-detail'); await page.keyboard.press('Escape'); await settle();
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.equal(await trigger.evaluate(node => document.activeElement === node), true);
  });
  await check('reading minutes validate, preserve drafts on failure, and update the heatmap without completing a book', async () => {
    await click(page.locator('.rd-current').first().getByRole('button', { name: '记一次阅读' }));
    await dialog().getByLabel('本次分钟数').fill('-2'); await click(dialog().getByRole('button', { name: '保存记录', exact: true }));
    assert.ok((await dialog().getByRole('alert').innerText()).includes('0–1440'));
    await dialog().getByLabel('本次分钟数').fill('30');
    await dialog().locator('summary').click(); await dialog().getByLabel('模拟保存失败').check();
    await click(dialog().getByRole('button', { name: '保存记录', exact: true }));
    assert.equal(await dialog().getByLabel('本次分钟数').inputValue(), '30');
    await dialog().getByLabel('模拟保存失败').uncheck(); await click(dialog().getByRole('button', { name: '保存记录', exact: true }));
    assert.equal(await page.locator('.rd-current').count(), 2);
    await click(button('阅读记录')); await click(button('展开阅读足迹'));
    const today = dialog().locator('[data-date="2026-10-27"]');
    assert.ok((await today.getAttribute('aria-label')).includes('80 分钟'));
    assert.equal(await dialog().locator('[data-date="2026-10-21"]').getAttribute('data-known'), 'true');
    assert.ok((await dialog().locator('[data-date="2026-10-21"]').getAttribute('aria-label')).includes('0 分钟'));
    assert.equal(await dialog().locator('[data-date="2026-10-18"]').getAttribute('data-known'), 'false');
    await today.focus(); await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.date), '2026-10-26');
    await page.keyboard.press('Enter'); await settle();
    assert.ok((await dialog().innerText()).includes('2026.10.26'));
    await page.keyboard.press('Escape'); await settle();
  });
  await check('editing an old impression preserves other reading rounds and future rereading plans', async () => {
    await click(page.locator('.rd-history [data-work-id="b2"] .rd-cover-link'));
    assert.equal(await dialog().locator('.rd-round').count(), 2);
    await click(dialog().locator('.rd-round').first().getByRole('button'));
    await dialog().getByLabel('一句话印象', { exact: false }).fill('慢下来，听河流，也听自己。');
    await click(dialog().getByRole('button', { name: '保存阅读记录', exact: true }));
    await click(page.locator('.rd-history [data-work-id="b2"] .rd-cover-link'));
    assert.equal(await dialog().locator('.rd-round').count(), 2);
    assert.ok((await dialog().innerText()).includes('慢下来，听河流，也听自己。'));
    await page.keyboard.press('Escape'); await settle(); await click(button('阅读计划'));
    assert.equal(await page.locator('.rd-queue [data-work-id="b2"]').count(), 1);
  });
  await check('adding and cancelling preview plans changes only the intended shelf', async () => {
    await click(button('加入计划')); await dialog().getByRole('combobox', { name: '书籍', exact: true }).selectOption('b7');
    await click(dialog().getByRole('button', { name: '取消', exact: true }));
    assert.equal(await page.locator('.rd-queue .rd-book').count(), 3);
    await click(button('加入计划')); await dialog().getByRole('combobox', { name: '书籍', exact: true }).selectOption('b7');
    await click(dialog().getByRole('button', { name: '保存计划', exact: true }));
    assert.equal(await page.locator('.rd-queue .rd-book').count(), 4);
    await page.reload(); await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('.rd-queue .rd-book').count(), 3);
  });
  await check('responsive grid/list, dialogs and floating dock stay within 1440/1000/768/390/360 viewports', async () => {
    for (const [width, height] of [[1440, 1050], [1000, 900], [768, 900], [390, 844], [360, 740]]) {
      await page.setViewportSize({ width, height }); await reset(); await noOverflow();
      if (width !== 1440) await shot('reading-plan-' + width);
      await click(button('阅读记录')); await noOverflow();
      if (width !== 1440) await shot('reading-records-' + width);
      await click(button('阅读记录横向列表')); await noOverflow();
      await click(page.locator('.rd-history .rd-cover-link').first());
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
      const ends = await page.evaluate(() => ({
        book: document.querySelector('.rd-history .rd-book:last-child').getBoundingClientRect().bottom,
        panel: document.querySelector('.rd-tag-panel').getBoundingClientRect().bottom,
        shell: document.querySelector('.rd-shell').getBoundingClientRect().bottom,
      }));
      assert.ok(Math.max(ends.book, ends.panel) <= ends.shell - 18, JSON.stringify(ends));
      if (width === 390) await shot('reading-records-390-bottom');
    }
  });
  await check('offline file entry works and storage/network remain untouched', async () => {
    await page.goto(pathToFileURL(path.join(out, 'index.html')).href); await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('.rd-current').count(), 2); await click(button('阅读记录'));
    assert.equal(await page.locator('.rd-history .rd-book').count(), 5);
    assert.equal(await page.evaluate(() => window.__deskWrites), 0);
    assert.equal(storageWrites, 0);
    assert.deepEqual(errors, []); assert.deepEqual(remote, []);
  });
  fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({ testedAt: new Date().toISOString(), type: 'isolated synthetic reading-desk preview', results, errors, remoteRequests: remote, storageWrites, realLibraryTouched: false }, null, 2));
  console.log(`Reading desk: ${results.length}/${results.length} checks passed.`);
})().catch(async error => {
  console.error(error); process.exitCode = 1;
  if (page) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
  fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({ results, errors, remoteRequests: remote, failure: String(error) }, null, 2));
}).finally(async () => { await browser?.close(); });
