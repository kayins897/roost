// Synthetic, in-memory preview only. Never starts Electron or reads the real library.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const output = path.resolve(process.env.READING_PREVIEW_OUTPUT || 'evidence/reading-workspace-preview');
const url = process.env.READING_PREVIEW_URL || 'http://127.0.0.1:4187/';
const origin = new URL(url).origin;
fs.mkdirSync(output, { recursive: true });
const results = [], errors = [], remote = [];
let browser, page;
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const click = async locator => { await locator.click(); await settle(); };
const button = name => page.getByRole('button', { name, exact: true });
const dialog = () => page.locator('dialog[open]').last();
const nav = name => click(page.locator('.rw-dock').getByRole('button', { name, exact: true }));
const reset = async () => { await page.goto(url); await page.evaluate(() => document.fonts.ready); await settle(); };
const check = async (name, fn) => { await fn(); results.push({ name, pass: true }); console.log(`PASS ${name}`); };
const hasText = async (locator, text) => assert.ok((await locator.innerText()).includes(text), `Expected text: ${text}`);
const screenshot = async name => { await settle(); await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true }); };
const heatDay = date => page.locator(`.bk-heat-day[data-date="${date}"]`);
const planMode = async () => click(button('规划'));
const reviewMode = async () => click(button('回顾'));
const candidate = id => page.locator(`[data-plan-id="${id}"]`);
const beginCandidate = async workId => { await click(button('添加候选')); await dialog().getByLabel('候选作品').selectOption(workId); };
const expandReading = async () => {
  const entry = page.locator('[data-timeline-work="b1"][data-timeline-date="2026-10-27"]');
  if (!(await entry.locator('details').evaluate(el => el.open))) await click(entry.locator('summary'));
  return entry;
};

(async () => {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  context.setDefaultTimeout(7000); page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(origin + '/') && !/^(file:|data:)/.test(request.url())) remote.push(request.url()); });
  await page.addInitScript(() => { window.__previewStorageWrites = 0; const original = Storage.prototype.setItem; Storage.prototype.setItem = function (...args) { window.__previewStorageWrites++; return original.apply(this, args); }; });
  await reset();
  await check('retrospective timeline, aggregated daily sessions, actual totals and no music', async () => {
    assert.equal(await button('回顾').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-timeline-work="b1"][data-timeline-date="2026-10-27"]').count(), 1);
    await hasText(page.locator('[data-timeline-work="b1"][data-timeline-date="2026-10-27"]'), '50 分钟');
    await hasText(page.getByRole('article', { name: '游戏时长汇总' }), '245');
    await hasText(page.getByRole('article', { name: '书籍时长汇总' }), '70');
    assert.equal(await page.getByRole('button', { name: /音乐/ }).count(), 0);
    assert.equal(await page.locator('.pb-board').count(), 0);
  });
  await check('word cloud counts distinct played games; tag details; unplayed inventory excluded', async () => {
    await hasText(page.locator('.tc-controls'), '4 款实际体验');
    const action = page.locator('[data-tag-id="动作"]'); await hasText(action, '2'); await click(action);
    assert.equal(await page.locator('.tc-selection li').count(), 2); await hasText(page.locator('.tc-selection'), '空洞骑士');
    assert.equal(await page.locator('[data-tag-id="库存专属标签"]').count(), 0);
    await click(button('收起标签作品'));
  });
  await check('word cloud known minutes, missing values, four groups and media filtering', async () => {
    await click(page.locator('.tc-mode').getByRole('button', { name: '游玩时长', exact: true }));
    await hasText(page.locator('[data-tag-id="动作"]'), '220 分');
    await click(page.locator('.tc-groups').getByRole('button', { name: '题材', exact: true }));
    await hasText(page.locator('[data-tag-id="科幻"]'), '未记录');
    await click(page.locator('.cal-filters').getByRole('button', { name: '书籍', exact: true }));
    assert.equal(await page.locator('.tc-panel').count(), 0);
    await click(page.locator('.cal-filters').getByRole('button', { name: '全部', exact: true }));
  });
  await check('period switching drives timeline, summaries and word cloud without cumulative guesses', async () => {
    await click(button('每周')); await hasText(page.locator('.cl-period-control'), '2026.10.26');
    await hasText(page.locator('.tc-controls'), '1 款实际体验');
    await click(button('上一周')); await hasText(page.getByRole('article', { name: '游戏时长汇总' }), '220');
    await hasText(page.getByRole('article', { name: '书籍时长汇总' }), '0');
    await hasText(page.getByRole('article', { name: '影视时长汇总' }), '102');
    await click(button('下一周')); await click(button('下一周'));
    await hasText(page.locator('.tc-empty'), '还没有游戏体验记录');
    await click(button('今天')); await click(button('月度'));
  });
  await check('coarse month dates stay coarse; navigator keeps keyboard and leap-day access', async () => {
    await click(button('上个月')); await hasText(page.locator('[data-timeline-work="g2"]'), '日期未详');
    assert.equal(await page.locator('[data-timeline-work="g2"]').getAttribute('data-timeline-date'), '2026-09');
    await click(button('今天')); await click(button('选择日期')); assert.equal(await page.locator('.cal-cell').count(), 42);
    await page.locator('[data-cal-day="2026-10-27"]').press('ArrowLeft'); await settle();
    assert.equal(await page.evaluate(() => document.activeElement.dataset.calDay), '2026-10-26');
    await click(button('年度')); await click(button('选择日期')); assert.equal(await page.locator('.cal-year-month').count(), 12);
    await click(button('下一年')); await click(button('下一年')); assert.equal(await page.locator('[data-year-day="2028-02-29"]').count(), 1);
  });
  await reset();
  await check('monthly planning has three stages, broad candidates and undated pool, no checklist', async () => {
    await planMode(); assert.equal(await page.locator('.pb-slot').count(), 3);
    assert.equal(await candidate('p3').count(), 1); await hasText(candidate('p3'), '悉达多');
    await hasText(page.locator('.pb-context'), '星际拓荒');
    assert.equal(await page.locator('.pb-board input[type=checkbox]').count(), 0);
    assert.equal(await page.locator('.cl-stat-ribbon').count(), 0);
  });
  await check('candidate cancellation and simulated failure preserve draft and existing reason', async () => {
    await click(button('添加候选')); assert.equal(await dialog().getByLabel('候选说明').inputValue(), '每天留一点想象的空间。');
    await dialog().getByLabel('候选作品').selectOption('g4'); await dialog().getByLabel('候选说明').fill('候选失败草稿');
    await click(dialog().locator('.rw-preview-options summary')); await dialog().getByRole('checkbox', { name: '模拟保存失败' }).check();
    await click(dialog().getByRole('button', { name: '保存安排' })); await hasText(dialog().getByRole('alert'), '选择已保留');
    assert.equal(await dialog().getByLabel('候选说明').inputValue(), '候选失败草稿');
    await click(dialog().getByRole('button', { name: '返回' })); await hasText(candidate('p7'), '想留一段完整的时间');
  });
  await check('refining same work to a weekly candidate keeps one plan and actual records unchanged', async () => {
    await click(button('每周')); await beginCandidate('g4');
    await dialog().getByLabel('候选说明').fill('留到这周慢慢探索'); await click(dialog().getByRole('button', { name: '保存安排' }));
    assert.equal(await candidate('p7').count(), 1); assert.equal(await page.locator('.pb-context').count(), 0);
    await reviewMode(); await hasText(page.getByRole('article', { name: '游戏时长汇总' }), '25');
    assert.equal(await page.locator('[data-timeline-work="g4"]').count(), 0);
    await planMode(); await click(button('下一周')); assert.equal(await candidate('p7').count(), 0);
    await click(button('上一周')); assert.equal(await candidate('p7').count(), 1);
  });
  await check('annual seasons/months and natural weeks never silently refine broad candidates', async () => {
    await reset(); await planMode(); await click(button('年度')); assert.equal(await page.locator('.pb-slot').count(), 4);
    await click(button('月份')); assert.equal(await page.locator('.pb-slot').count(), 12); await hasText(page.locator('.pb-context'), '星际拓荒');
    await click(button('四季')); await beginCandidate('b5'); await dialog().getByRole('button', { name: /秋季/ }).click();
    await click(dialog().getByRole('button', { name: '保存安排' }));
    await click(button('月度')); await hasText(page.locator('.pb-context'), '也许你该找个人聊聊');
    await click(button('自然周')); assert.equal(await page.locator('.pb-slot').count(), 5);
    await click(button('下个月')); assert.equal(await page.locator('.pb-slot').count(), 6);
    await click(button('今天'));
  });
  await check('clear placement and remove candidate leave the work and actual history intact', async () => {
    await click(button('月初中末')); await click(page.getByRole('button', { name: '调整星际拓荒的候选安排' }));
    await click(dialog().locator('.pb-manage summary')); await click(dialog().getByRole('button', { name: '移回未定时间' }));
    assert.equal(await page.locator('.pb-loose [data-plan-id="p7"]').count(), 1);
    await click(page.getByRole('button', { name: '调整星际拓荒的候选安排' })); await click(dialog().locator('.pb-manage summary'));
    await click(dialog().getByRole('button', { name: '移出候选' })); assert.equal(await candidate('p7').count(), 0);
    await reviewMode(); assert.equal(await page.locator('[data-timeline-work="g4"]').count(), 1);
  });
  await reset();
  await check('book faces, in-read pinning, reread history and search-safe ordering regressions', async () => {
    await nav('书籍'); assert.equal(await page.locator('.bk-reading-card').count(), 2); assert.equal(await page.locator('.bk-queue-card').count(), 2);
    await click(page.getByRole('button', { name: '下移《悉达多》' })); await hasText(page.locator('.bk-queue-card').first(), '银河边缘来信');
    await page.getByRole('textbox', { name: '搜索当前页面' }).fill('悉达多');
    assert.equal(await page.getByRole('button', { name: '上移《悉达多》' }).isDisabled(), true); await click(button('清空搜索'));
    await page.getByRole('radio', { name: '阅读记录', exact: true }).check(); await hasText(page.locator('.bk-history-card').filter({ hasText: '悉达多' }), '已安排重读');
    await page.getByRole('radio', { name: '阅读计划', exact: true }).check();
  });
  await check('heatmap known zero/unknown, keyboard and calendar jump', async () => {
    assert.equal(await page.locator('.bk-heat-day').count(), 365);
    assert.equal(await heatDay('2026-10-18').getAttribute('data-known'), 'false'); assert.equal(await heatDay('2026-10-21').getAttribute('data-known'), 'true');
    await heatDay('2026-10-27').focus(); await page.keyboard.press('ArrowUp'); assert.equal(await page.evaluate(() => document.activeElement.dataset.date), '2026-10-26');
    await page.keyboard.press('Enter'); await settle(); await hasText(page.locator('[data-timeline-work="b3"][data-timeline-date="2026-10-26"]'), '20 分钟');
  });
  await check('reading failure/cancel/retry, editing and deleting minutes sync both views', async () => {
    await nav('书籍'); await click(button('登记阅读')); await dialog().getByLabel('本次分钟数').fill('30');
    await dialog().getByLabel('留下一点感受').fill('联动验证'); await click(dialog().locator('.rw-preview-options summary'));
    await dialog().getByRole('checkbox', { name: '模拟保存失败' }).check(); await click(dialog().getByRole('button', { name: '保存记录' }));
    await hasText(dialog().getByRole('alert'), '输入已保留'); await click(dialog().getByRole('button', { name: '取消' }));
    assert.ok((await heatDay('2026-10-27').getAttribute('aria-label')).includes('50 分钟'));
    await click(button('登记阅读')); await dialog().getByLabel('本次分钟数').fill('30'); await dialog().getByLabel('留下一点感受').fill('联动验证');
    await click(dialog().getByRole('button', { name: '保存记录' })); assert.ok((await heatDay('2026-10-27').getAttribute('aria-label')).includes('80 分钟'));
    await nav('日历首页'); await hasText(page.locator('.cl-today'), '80 分钟');
    let entry = await expandReading(); await click(entry.locator('li').filter({ hasText: '联动验证' }).getByRole('button'));
    await dialog().getByLabel('本次分钟数').fill('12'); await click(dialog().getByRole('button', { name: '保存记录' })); await hasText(page.locator('.cl-today'), '62 分钟');
    entry = await expandReading(); await click(entry.locator('li').filter({ hasText: '联动验证' }).getByRole('button'));
    await click(dialog().getByRole('button', { name: '删除记录' })); await hasText(page.locator('.cl-today'), '50 分钟');
  });
  await check('reread history and future plan survive old-reflection edits; completion is explicit', async () => {
    await nav('书籍'); await click(page.getByRole('button', { name: '查看《悉达多》详情', exact: true }));
    await click(dialog().getByRole('button', { name: '编辑《悉达多》2026 年 9 月 20 日的阅读记录' }));
    await dialog().getByLabel('一句话印象', { exact: false }).fill('修订旧感想'); await click(dialog().getByRole('button', { name: '保存阅读记录' }));
    await hasText(dialog(), '修订旧感想'); await hasText(dialog(), '重读计划'); await page.keyboard.press('Escape');
    await click(page.getByRole('button', { name: '查看《看不见的城市》详情', exact: true })); await click(dialog().getByRole('button', { name: '完成本次阅读', exact: true }).first());
    await click(dialog().getByRole('button', { name: '保存并完成阅读', exact: true })); await hasText(dialog(), '完成日期未知');
    assert.equal(await dialog().getByRole('button', { name: '加入重读计划', exact: true }).count(), 1); await page.keyboard.press('Escape');
  });
  await reset();
  await check('desktop and responsive screenshots, modal bounds and focus restoration', async () => {
    await screenshot('timeline-month-desktop'); await click(button('每周')); await screenshot('timeline-week-desktop');
    await click(button('年度')); await screenshot('timeline-year-desktop'); await click(button('月度')); await planMode(); await screenshot('planning-month-desktop');
    await click(button('年度')); await screenshot('planning-year-desktop'); await click(button('每周')); await screenshot('planning-week-desktop');
    for (const width of [960, 390]) {
      await page.setViewportSize({ width, height: 844 }); await reviewMode(); await screenshot(`timeline-${width}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width <= 700) assert.equal(await page.evaluate(() => {
        const shell = document.querySelector('.rw-shell'), dock = document.querySelector('.rw-dock');
        return shell.getBoundingClientRect().bottom <= dock.getBoundingClientRect().top && getComputedStyle(shell).overflowY === 'auto';
      }), true, 'Narrow content scrolls above the dock without being obscured');
      await planMode(); await screenshot(`planning-${width}`); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const trigger = button('添加候选'); await click(trigger);
      const bounds = await dialog().boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
      await page.keyboard.press('Escape'); await settle(); assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
      await nav('书籍'); await screenshot(`books-${width}`); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await nav('日历首页');
    }
  });
  await check('no storage or external writes, standalone file entry and refresh resets synthetic data', async () => {
    assert.equal(await page.evaluate(() => window.__previewStorageWrites), 0); assert.deepEqual(errors, []); assert.deepEqual(remote, []);
    const standalone = await context.newPage(), fileErrors = []; standalone.on('pageerror', e => fileErrors.push(e.message));
    await standalone.goto(pathToFileURL(path.join(output, 'index.html')).href); await standalone.locator('.rt-timeline').waitFor();
    await standalone.getByRole('button', { name: '规划', exact: true }).click(); await standalone.locator('.pb-slot').first().waitFor(); assert.deepEqual(fileErrors, []); await standalone.close();
    await page.reload(); await settle(); await hasText(page.locator('.cl-today'), '50 分钟');
  });
})().catch(async error => { results.push({ name: 'failure', pass: false, message: error.stack }); console.error(error); if (page) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {}); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ at: new Date().toISOString(), url, synthetic: true, results, errors, remote, passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length }, null, 2));
});
