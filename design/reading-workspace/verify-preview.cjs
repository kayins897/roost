// Isolated synthetic preview only. Never launches the production application.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const output = path.resolve(process.env.READING_PREVIEW_OUTPUT || 'evidence/reading-workspace-preview');
const url = process.env.READING_PREVIEW_URL || 'http://127.0.0.1:4186/';
fs.mkdirSync(output, { recursive: true });
const results = [], errors = [], remote = [];
let browser, page;
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const click = async locator => { await locator.click(); await settle(); };
const dialog = () => page.locator('dialog[open]').last();
const nav = async name => click(page.locator('.rw-dock').getByRole('button', { name, exact: true }));
const reset = async () => { await page.goto(url); await page.evaluate(() => document.fonts.ready); await settle(); };
const books = async () => nav('书籍');
const day = async date => click(page.locator(`[data-cal-day="${date}"]`));
const check = async (name, fn) => { await fn(); results.push({ name, pass: true }); console.log(`PASS ${name}`); };
const screenshot = async name => { await settle(); await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true }); };
const hasText = async (locator, text) => assert.ok((await locator.innerText()).includes(text), `Expected text: ${text}`);
const scoreDay = date => page.locator(`.bk-heat-day[data-date="${date}"]`);

(async () => {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  context.setDefaultTimeout(7000);
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!/^(http:\/\/127\.0\.0\.1:4186\/|file:|data:)/.test(request.url())) remote.push(request.url()); });
  await page.addInitScript(() => { window.__previewStorageWrites = 0; const original = Storage.prototype.setItem; Storage.prototype.setItem = function (...args) { window.__previewStorageWrites++; return original.apply(this, args); }; });
  await reset();
  await check('month calendar, daily minutes, past and future plans', async () => {
    assert.equal(await page.locator('.cal-cell').count(), 42);
    await hasText(page.locator('.cal-summary'), '50 分钟');
    assert.equal(await page.locator('.cal-day-entry').count(), 2);
    await day('2026-10-30'); await hasText(page.locator('.cal-day-panel'), '隔一段时间');
    await day('2026-10-23'); await hasText(page.locator('.cal-day-panel'), '未执行计划');
    await click(page.getByRole('button', { name: '下个月', exact: true }));
    assert.ok((await page.locator('.cal-grid').getAttribute('aria-label')).includes('11月'));
    await click(page.getByRole('button', { name: '今天', exact: true }));
    await page.locator('[data-cal-day="2026-10-27"]').press('ArrowLeft'); await settle();
    assert.equal(await page.evaluate(() => document.activeElement.dataset.calDay), '2026-10-26');
  });
  await check('future-day planning retains date after switching books; cancel is inert', async () => {
    await day('2026-10-30'); await click(page.getByRole('button', { name: '安排这一天', exact: true }));
    await dialog().getByLabel('作品', { exact: true }).selectOption('b5');
    assert.equal(await dialog().locator('input[type=date]').inputValue(), '2026-10-30');
    await dialog().getByLabel('为什么想体验').fill('下次再读一遍');
    await click(dialog().getByRole('button', { name: '返回', exact: true }));
    assert.equal(await page.locator('.cal-day-entry--plan').count(), 1);
    await click(page.getByRole('button', { name: '安排这一天', exact: true }));
    await dialog().getByLabel('作品', { exact: true }).selectOption('b5');
    await click(dialog().getByRole('button', { name: '保存计划', exact: true }));
    assert.equal(await page.locator('.cal-day-entry--plan').count(), 2);
  });
  await check('in-progress plans never appear as unexecuted', async () => {
    await click(page.getByRole('button', { name: '安排计划', exact: true }));
    await dialog().locator('input[type=date]').fill('2026-10-26');
    await click(dialog().getByRole('button', { name: '保存计划', exact: true }));
    await day('2026-10-26'); await hasText(page.locator('.cal-day-entry--plan'), '在读计划');
  });
  await reset();
  await check('book views are exclusive; in-read, queue and history coexist', async () => {
    await books(); assert.equal(await page.locator('[data-view=plan]').count(), 1); assert.equal(await page.locator('[data-view=records]').count(), 0);
    assert.equal(await page.locator('.bk-reading-card').count(), 2); assert.equal(await page.locator('.bk-queue-card').count(), 2);
    await page.getByRole('radio', { name: '阅读记录', exact: true }).check(); await settle();
    assert.equal(await page.locator('[data-view=plan]').count(), 0); assert.equal(await page.locator('.bk-history-card').count(), 2);
    await hasText(page.locator('.bk-history-card').filter({ hasText: '悉达多' }), '已安排重读');
    await page.getByRole('radio', { name: '阅读计划', exact: true }).check(); await settle();
  });
  await check('queue ordering and search protect hidden ordering', async () => {
    await click(page.getByRole('button', { name: '下移《悉达多》', exact: true }));
    await hasText(page.locator('.bk-queue-card').first(), '银河边缘来信');
    await page.getByRole('textbox', { name: '搜索当前页面' }).fill('悉达多'); await settle();
    assert.equal(await page.locator('.bk-queue-card').count(), 1);
    assert.equal(await page.getByRole('button', { name: '上移《悉达多》', exact: true }).isDisabled(), true);
    await click(page.getByRole('button', { name: '清空搜索', exact: true }));
  });
  await check('heatmap: 365 days, unknown versus zero, one keyboard entry and calendar jump', async () => {
    assert.equal(await page.locator('.bk-heat-day').count(), 365);
    assert.equal(await scoreDay('2026-10-18').getAttribute('data-known'), 'false');
    assert.equal(await scoreDay('2026-10-18').getAttribute('data-unknown'), 'true');
    assert.equal(await scoreDay('2026-10-21').getAttribute('data-known'), 'true');
    assert.ok((await scoreDay('2026-10-21').getAttribute('aria-label')).includes('0 分钟'));
    assert.equal(await scoreDay('2026-10-30').isDisabled(), true);
    assert.equal(await page.locator('.bk-heat-day[tabindex="0"]').count(), 1);
    await scoreDay('2026-10-27').focus(); await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.date), '2026-10-26');
    await page.keyboard.press('Enter'); await settle(); await hasText(page.locator('.cal-day-panel'), '20 分钟');
  });
  await check('failure keeps reading draft; cancel leaves minutes unchanged', async () => {
    await books(); await click(page.getByRole('button', { name: '登记阅读', exact: true }));
    await dialog().getByLabel('本次分钟数').fill('30'); await dialog().getByLabel('留下一点感受').fill('失败草稿');
    await click(dialog().locator('summary')); await dialog().getByRole('checkbox', { name: '模拟保存失败', exact: true }).check();
    await click(dialog().getByRole('button', { name: '保存记录', exact: true }));
    await hasText(dialog().getByRole('alert'), '输入已保留'); assert.equal(await dialog().getByLabel('本次分钟数').inputValue(), '30');
    await click(dialog().getByRole('button', { name: '取消', exact: true }));
    assert.ok((await scoreDay('2026-10-27').getAttribute('aria-label')).includes('50 分钟'));
  });
  await check('save, edit and remove minutes update calendar and heatmap together', async () => {
    await click(page.getByRole('button', { name: '登记阅读', exact: true }));
    await dialog().getByLabel('本次分钟数').fill('30'); await dialog().getByLabel('留下一点感受').fill('联动验证');
    await click(dialog().getByRole('button', { name: '保存记录', exact: true }));
    assert.ok((await scoreDay('2026-10-27').getAttribute('aria-label')).includes('80 分钟'));
    await nav('日历首页'); await day('2026-10-27'); await hasText(page.locator('.cal-summary'), '80 分钟');
    await click(page.locator('.cal-day-entry').filter({ hasText: '联动验证' }).getByRole('button', { name: '修改看不见的城市的记录' }));
    await dialog().getByLabel('本次分钟数').fill('12'); await click(dialog().getByRole('button', { name: '保存记录' }));
    await hasText(page.locator('.cal-summary'), '62 分钟');
    await click(page.locator('.cal-day-entry').filter({ hasText: '联动验证' }).getByRole('button', { name: '修改看不见的城市的记录' }));
    await click(dialog().getByRole('button', { name: '删除记录' })); await hasText(page.locator('.cal-summary'), '50 分钟');
  });
  await check('all unknown today never becomes zero; explicit zero remains known', async () => {
    for (const note of ['晚饭后的几座城市。', '睡前又读了一会。']) {
      await click(page.locator('.cal-day-entry').filter({ hasText: note }).getByRole('button', { name: '修改看不见的城市的记录' }));
      await dialog().getByLabel('本次分钟数').fill(''); await click(dialog().getByRole('button', { name: '保存记录' }));
    }
    await hasText(page.locator('.cal-summary'), '时长未记录'); assert.ok(!(await page.locator('.cal-summary').innerText()).includes('0 分钟'));
    await books(); assert.equal(await scoreDay('2026-10-27').getAttribute('data-known'), 'false');
    await click(page.getByRole('button', { name: '登记阅读', exact: true })); await dialog().getByLabel('本次分钟数').fill('0');
    await click(dialog().getByRole('button', { name: '保存记录' })); assert.equal(await scoreDay('2026-10-27').getAttribute('data-known'), 'true');
  });
  await reset();
  await check('reading history edit/failure/reread preserve both old feelings and future plan', async () => {
    await books(); await click(page.getByRole('button', { name: '查看《悉达多》详情', exact: true }));
    await click(dialog().getByRole('button', { name: '编辑《悉达多》2026 年 9 月 20 日的阅读记录' }));
    await dialog().getByLabel('一句话印象', { exact: false }).fill('修改后的旧感想'); await dialog().getByRole('checkbox', { name: /模拟保存失败/ }).check();
    await click(dialog().getByRole('button', { name: '保存阅读记录', exact: true })); await hasText(dialog().getByRole('alert'), '草稿已保留');
    await dialog().getByRole('checkbox', { name: /模拟保存失败/ }).uncheck(); await click(dialog().getByRole('button', { name: '保存阅读记录', exact: true }));
    await hasText(dialog(), '重读计划'); await click(dialog().getByRole('button', { name: '补录已读', exact: true }));
    await dialog().getByRole('combobox', { name: '完成日期精度' }).selectOption('day'); await dialog().getByLabel('完成日期', { exact: true }).fill('2026-10-27');
    await dialog().getByLabel('一句话印象', { exact: false }).fill('第二次又有新的收获'); await click(dialog().getByRole('button', { name: '保存阅读记录', exact: true }));
    assert.equal(await dialog().locator('.bk-round-card').count(), 2); await hasText(dialog(), '修改后的旧感想'); await hasText(dialog(), '重读计划');
    await page.keyboard.press('Escape'); await settle(); assert.ok((await scoreDay('2026-10-27').getAttribute('aria-label')).includes('50 分钟'));
    await nav('日历首页'); await day('2026-10-27'); await hasText(page.locator('.cal-day-panel'), '第二次又有新的收获'); await hasText(page.locator('.cal-day-panel'), '读完');
  });
  await check('finishing a reading plan is explicit and unknown dates are preserved', async () => {
    await books(); await click(page.getByRole('button', { name: '查看《看不见的城市》详情', exact: true }));
    await click(dialog().getByRole('button', { name: '完成本次阅读', exact: true }).first());
    assert.equal(await dialog().getByRole('combobox', { name: '完成日期精度' }).inputValue(), 'unknown');
    await click(dialog().getByRole('button', { name: '保存并完成阅读', exact: true }));
    await hasText(dialog(), '完成日期未知'); assert.equal(await dialog().getByRole('button', { name: '加入重读计划', exact: true }).count(), 1);
    await click(dialog().getByRole('button', { name: '加入重读计划', exact: true }));
    await dialog().getByLabel('为什么想读', { exact: false }).fill('以后再读'); await click(dialog().getByRole('button', { name: '保存计划', exact: true }));
    await hasText(dialog(), '重读计划'); await hasText(dialog(), '完成日期未知'); await page.keyboard.press('Escape'); await settle();
  });
  await reset();
  await check('year/month/week switching, last week totals, next week planning and year leap cells', async () => {
    await click(page.getByRole('button', { name: '每周', exact: true }));
    await hasText(page.locator('.cal-period-label'), '2026.10.26');
    await hasText(page.getByRole('article', { name: '书籍时长汇总' }), '70');
    await click(page.getByRole('button', { name: '上一周', exact: true }));
    await hasText(page.getByRole('article', { name: '影视时长汇总' }), '102'); await hasText(page.getByRole('article', { name: '游戏时长汇总' }), '时长未记录');
    await click(page.getByRole('button', { name: '下一周', exact: true })); await click(page.getByRole('button', { name: '下一周', exact: true }));
    await hasText(page.locator('.cal-period-label'), '2026.11.02'); await hasText(page.locator('.cal-period-plans'), '暂未安排');
    await click(page.getByRole('button', { name: '今天', exact: true })); await click(page.getByRole('button', { name: '年度', exact: true }));
    assert.equal(await page.locator('.cal-year-month').count(), 12);
    await click(page.locator('.cal-filters').getByRole('button', { name: '游戏', exact: true }));
    await hasText(page.locator('.cal-year-month').nth(8), '1 条月份记录');
    assert.equal(await page.locator('.cal-period-mini-days [tabindex="0"]').count(), 1);
    await click(page.locator('.cal-filters').getByRole('button', { name: '全部', exact: true }));
    await click(page.getByRole('button', { name: '下一年', exact: true })); await click(page.getByRole('button', { name: '下一年', exact: true }));
    assert.equal(await page.locator('[data-year-day="2028-02-29"]').count(), 1);
    await click(page.getByRole('button', { name: '月度', exact: true })); assert.equal(await page.locator('.cal-cell').count(), 42);
  });
  await reset();
  await check('desktop and narrow layouts, visible current heatmap, modal bounds and focus return', async () => {
    await screenshot('calendar-desktop'); await click(page.getByRole('button', { name: '每周', exact: true })); await screenshot('calendar-week-desktop');
    await click(page.getByRole('button', { name: '年度', exact: true })); await screenshot('calendar-year-desktop');
    await books(); await screenshot('books-plan-desktop'); await page.getByRole('radio', { name: '阅读记录', exact: true }).check(); await settle(); await screenshot('books-records-desktop');
    const trigger = page.getByRole('button', { name: '查看《悉达多》阅读记录', exact: true }); await click(trigger); await screenshot('book-detail-desktop'); await page.keyboard.press('Escape'); await settle(); assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
    for (const width of [960, 390]) {
      await page.setViewportSize({ width, height: 844 }); await books();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.getByRole('radio', { name: '阅读计划', exact: true }).check(); await settle();
      if (width === 390) { await reset(); await books(); await screenshot('books-plan-narrow'); assert.ok(await page.locator('.bk-heat-scroll').evaluate(el => el.scrollLeft > 0)); }
      await click(page.getByRole('button', { name: '查看《看不见的城市》详情', exact: true }));
      const bounds = await dialog().boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y >= 0 && bounds.y + bounds.height <= 845);
      if (width === 390) await screenshot('book-detail-narrow'); await page.keyboard.press('Escape');
      await nav('日历首页'); await screenshot(`calendar-${width}`); await click(page.getByRole('button', { name: '每周', exact: true }));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width === 390) { await screenshot('calendar-week-narrow'); await click(page.getByRole('button', { name: '年度', exact: true })); await screenshot('calendar-year-narrow'); }
    }
  });
  await check('no storage writes, external requests or browser errors; standalone file entry works', async () => {
    assert.equal(await page.evaluate(() => window.__previewStorageWrites), 0); assert.deepEqual(errors, []); assert.deepEqual(remote, []);
    const standalone = await context.newPage(); const fileErrors = []; standalone.on('pageerror', e => fileErrors.push(e.message));
    await standalone.goto(pathToFileURL(path.join(output, 'index.html')).href);
    await standalone.locator('.cal-cell').first().waitFor(); await standalone.locator('.rw-dock').getByRole('button', { name: '书籍', exact: true }).click();
    await standalone.locator('.bk-reading-card').first().waitFor(); assert.deepEqual(fileErrors, []); await standalone.close();
    await page.reload(); await settle(); await books(); assert.ok((await scoreDay('2026-10-27').getAttribute('aria-label')).includes('50 分钟'));
  });
})().catch(error => { results.push({ name: 'failure', pass: false, message: error.stack }); console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ at: new Date().toISOString(), url, results, errors, remote, passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length }, null, 2));
});
