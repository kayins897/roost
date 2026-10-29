const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '..');
const packaged = Boolean(process.argv[2]);
const output = path.join(root, 'evidence', 'game-card-v' + require('../package.json').version.replaceAll('.', ''), packaged ? 'packaged' : 'source');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-game-card-'));
const file = path.join(data, 'library.json');
fs.mkdirSync(output, { recursive: true });
const raw = () => fs.readFileSync(file, 'utf8');
const stored = () => JSON.parse(raw());
const game = (id, score, extra = {}) => ({ id, title: id, category: 'game', creator: '合成工作室', subcategory: 'Steam', originalTitle: '', status: 'finished', experienceStatus: 'experienced', experienceCategory: 'completed', tags: [], gameTags: { gameplay: [], theme: [], scenario: [], other: [] }, impression: '自己的感想', review: '长文不能丢失', favorite: false, artwork: 'default', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '', platforms: ['Steam'], year: '2026', personalScore: score, playtimeMinutes: 120, completionCount: 0, futureExtension: { keep: true }, ...extra });
const fixture = { schemaVersion: 1, futureRoot: { keep: true }, items: [game('星海旅人', 9.8, { ratingOrder: 0 }), game('八分作品', 8.2), game('零分作品', 0, { playtimeMinutes: 0 }), game('未评分作品', undefined, { playtimeMinutes: undefined }), ...['playing', 'continue', 'replayable', 'put-aside'].map((category, i) => game('分类作品' + i, undefined, { experienceCategory: category }))] };
let app, page; const checks = [], errors = [];
const check = name => { checks.push(name); console.log('PASS ' + name); };
const card = id => page.getByRole('button', { name: `查看${id}详情`, exact: true });
const menu = () => page.getByRole('menu', { name: '星海旅人快捷编辑', exact: true });
const whole = () => menu().getByRole('spinbutton', { name: '通关评分整数', exact: true });
const decimal = () => menu().getByRole('spinbutton', { name: '通关评分小数', exact: true });
async function launch() {
  const env = { ...process.env, QIYU_E2E: '1', QIYU_TEST_DATA_DIR: data }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: process.argv[2] || path.join(root, 'node_modules/electron/dist/electron.exe'), args: packaged ? [] : [root], env, timeout: 45000 });
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.qiyuDesktop.getInfo().dataDirectory), data);
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(360, 500); win.setBounds({ width: 1440, height: 1000 }); win.show(); win.webContents.setBackgroundThrottling(false); });
}
async function completed() {
  const primary = page.getByRole('group', { name: '按体验分类筛选', exact: true });
  const experienced = primary.getByRole('button', { name: '已体验', exact: true });
  if (await experienced.getAttribute('aria-pressed') !== 'true') await experienced.click();
  const unplayed = primary.getByRole('button', { name: '新作开荒', exact: true });
  if (await unplayed.getAttribute('aria-pressed') === 'true') await unplayed.click();
  await page.getByRole('group', { name: '已体验二级筛选', exact: true }).getByRole('button', { name: '收官完结', exact: true }).click();
}
async function edit(score) {
  await whole().press('Home'); for (let i = 0; i < Math.floor(score); i++) await whole().press('ArrowUp');
  if (score !== 10) { await decimal().press('Home'); for (let i = 0; i < Math.round(score * 10) % 10; i++) await decimal().press('ArrowUp'); }
}
const band = () => card('星海旅人').evaluate(el => el.closest('details')?.querySelector('summary strong')?.textContent);
async function shot(name) { await page.screenshot({ path: path.join(output, name + '.png') }); }
(async () => {
  fs.writeFileSync(file, JSON.stringify(fixture, null, 2)); await launch();
  const covers = await page.evaluate(() => ['#416594', '#8f536a', '#63835f'].map((color, i) => {
    const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 700; const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 480, 700); gradient.addColorStop(0, color); gradient.addColorStop(1, '#111925'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 480, 700);
    ctx.fillStyle = '#f0dca8'; ctx.beginPath(); ctx.arc(240, 270, 115, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#1d3048'; ctx.beginPath(); ctx.moveTo(0, 580); ctx.lineTo(260, 260); ctx.lineTo(480, 620); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '36px sans-serif'; ctx.fillText(['星海旅人', '山川回声', '下一段旅途'][i], 40, 570); ctx.font = '15px sans-serif'; ctx.fillText('ROOST / SYNTHETIC DEMO', 42, 610); return canvas.toDataURL();
  }));
  fixture.items.forEach((item, i) => { item.coverUrl = covers[i % 3]; }); fs.writeFileSync(file, JSON.stringify(fixture, null, 2)); await page.reload(); await completed();
  const before = raw(); await card('星海旅人').click({ button: 'right' }); await menu().waitFor();
  await decimal().hover(); await page.mouse.wheel(0, -120); await page.waitForTimeout(450);
  assert.equal(await decimal().getAttribute('aria-valuenow'), '7'); assert.equal(raw(), before);
  await whole().hover(); await page.mouse.wheel(0, -120); await page.waitForTimeout(450);
  assert.equal(await whole().getAttribute('aria-valuenow'), '8'); assert.equal(await band(), '个人评分 9–10 分'); assert.equal(raw(), before);
  check('真实滚轮每次一档、两列间停顿不落盘，封面停留原评分段');
  await edit(8.6); await decimal().focus(); await whole().focus(); await page.waitForTimeout(350);
  assert.equal(raw(), before); assert.equal(await menu().isVisible(), true); await shot('score-draft');
  await page.keyboard.press('Escape'); await menu().waitFor({ state: 'detached' });
  assert.equal(stored().items[0].personalScore, 8.6); assert.equal(stored().items[0].ratingOrder, undefined); assert.equal(await band(), '个人评分 8–8.9 分');
  check('菜单内换焦点不保存，Escape最终提交一次并进入新分段');
  await card('星海旅人').dispatchEvent('contextmenu', { clientX: 1350, clientY: 300 }); await edit(9.3); const beforeConflict = raw(); fs.writeFileSync(file, beforeConflict + '\n');
  await page.keyboard.press('Escape'); await menu().getByRole('alert').waitFor();
  assert.equal(raw(), beforeConflict + '\n'); assert.equal(await menu().isVisible(), true); assert.equal(await decimal().getAttribute('aria-valuenow'), '3');
  await card('八分作品').click({ button: 'right' }); assert.equal(await menu().isVisible(), true); assert.equal(await decimal().getAttribute('aria-valuenow'), '3');
  await card('八分作品').focus(); await page.keyboard.press('Shift+F10'); assert.equal(await menu().isVisible(), true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 700, height: 1000 })); await page.waitForTimeout(150); const narrowMenu = await menu().boundingBox(); assert.ok(narrowMenu.x >= 0 && narrowMenu.x + narrowMenu.width <= await page.evaluate(() => innerWidth));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 1440, height: 1000 }));
  fs.writeFileSync(file, beforeConflict); await page.mouse.click(1200, 50); assert.equal(raw(), beforeConflict); assert.equal(await menu().isVisible(), true);
  await menu().getByRole('button', { name: '重试', exact: true }).click(); assert.equal(stored().items[0].personalScore, 9.3);
  await page.keyboard.press('Escape'); check('真实磁盘冲突保留菜单与分数草稿，外点不擅自重试，显式重试成功');
  await card('星海旅人').click({ button: 'right' }); await edit(8.4); await decimal().press('Enter'); await menu().waitFor({ state: 'detached' }); assert.equal(stored().items[0].personalScore, 8.4);
  await card('星海旅人').click({ button: 'right' }); const unchanged = raw(); await page.keyboard.press('Escape'); assert.equal(raw(), unchanged);
  await card('星海旅人').click({ button: 'right' }); await edit(9.6); await page.mouse.click(1200, 50); await menu().waitFor({ state: 'detached' }); assert.equal(stored().items[0].personalScore, 9.6);
  check('Enter或外点完成最终评分，无改动关闭零写入');
  await card('星海旅人').click({ button: 'right' }); const beforeClear = raw(); await menu().getByRole('button', { name: '清除评分', exact: true }).click(); await page.waitForTimeout(350); assert.equal(raw(), beforeClear); assert.equal(await band(), '个人评分 9–10 分');
  await page.keyboard.press('Escape'); assert.equal(stored().items[0].personalScore, undefined);
  await card('星海旅人').click({ button: 'right' }); await edit(9.6); await decimal().press('Enter'); check('清除评分也先留在草稿，关闭后才移出评分段');
  const info = card('星海旅人').locator('.card-info'); assert.equal(await info.locator('.card-meta,.card-foot,.card-grade').count(), 0);
  const text = await info.textContent(); for (const word of ['Steam', '2026', '收官完结', '镭射', '多彩', '优先级']) assert.equal(text.includes(word), false);
  const size = await info.evaluate(el => ({ score: parseFloat(getComputedStyle(el.querySelector('.card-score strong')).fontSize), time: parseFloat(getComputedStyle(el.querySelector('.card-playtime strong')).fontSize) })); assert.ok(size.score > size.time);
  assert.ok((await card('零分作品').locator('.card-info').textContent()).includes('0.0')); assert.ok((await card('未评分作品').locator('.card-info').textContent()).includes('未评分'));
  check('封面下仅名称/时长/突出评分，0分与未评分独立，移除材质文案');
  const secondary = page.getByRole('group', { name: '已体验二级筛选', exact: true }); await secondary.getByRole('button', { name: '不限分类', exact: true }).click();
  const colors = [];
  for (const [name, category] of [['游玩中', 'playing'], ['未完待续', 'continue'], ['新游戏+', 'replayable'], ['收官完结', 'completed'], ['暂时搁置', 'put-aside']]) {
    const button = secondary.getByRole('button', { name, exact: true });
    const paint = await button.evaluate(el => ({ text: getComputedStyle(el).color, dot: getComputedStyle(el, '::before').backgroundColor, token: getComputedStyle(el).getPropertyValue('--play-state-color').trim() }));
    assert.equal(paint.text, paint.dot); colors.push(paint.text);
    const cover = page.locator(`.media-card[data-game-state="${category}"] .card-cover`).first(); assert.equal(await cover.evaluate(el => getComputedStyle(el).borderTopColor), paint.text);
    await button.click(); await page.waitForTimeout(350); assert.equal(await button.evaluate(el => getComputedStyle(el).color), paint.text); await secondary.getByRole('button', { name: '不限分类', exact: true }).click(); await page.waitForTimeout(350);
  }
  assert.equal(new Set(colors).size, 5); await shot('game-library'); check('五类筛选文字及圆点与封面边框同色，选中仍保留各自语义色');
  const beforeAppearance = raw();
  const legacyPreference = JSON.stringify({ strength: .8, filter: .6, speed: .4, facets: false, futurePreference: 'keep' });
  await page.evaluate(value => { localStorage.setItem('qiyu.cover-material.v1', value); window.dispatchEvent(new Event('qiyu:cover-material')); }, legacyPreference);
  await page.getByRole('button', { name: '数据与设置', exact: true }).click(); await page.getByRole('button', { name: '卡面材质', exact: true }).click();
  const prefs = () => page.evaluate(() => localStorage.getItem('qiyu.cover-material.v1'));
  assert.equal(await prefs(), legacyPreference); assert.equal(await page.getByRole('slider', { name: '纹理强度', exact: true }).inputValue(), '80');
  await page.getByRole('checkbox', { name: '封面反光', exact: true }).uncheck(); assert.equal(await page.locator('.card-cover:not([data-finish="standard"])').count(), 0);
  await page.getByRole('checkbox', { name: '封面反光', exact: true }).check(); await page.getByRole('combobox', { name: '材质规则', exact: true }).selectOption('uniform');
  await page.getByRole('combobox', { name: '统一反光材质', exact: true }).selectOption('prismatic');
  assert.equal(await page.locator('.card-cover:not([data-finish="prismatic"])').count(), 0);
  check('反光设置旧四值零写入兼容，总开关及统一多彩即时作用所有游戏');
  await page.getByRole('combobox', { name: '材质规则', exact: true }).selectOption('ranges');
  await page.getByRole('spinbutton', { name: '区间 1 最低分', exact: true }).fill('0'); await page.getByRole('spinbutton', { name: '区间 1 最高分', exact: true }).fill('8.9');
  await page.getByRole('spinbutton', { name: '区间 2 最低分', exact: true }).fill('8.9'); const beforeInvalid = await prefs();
  await page.getByRole('button', { name: '应用区间', exact: true }).click(); await page.getByRole('alert').filter({ hasText: '区间不能重叠' }).waitFor(); assert.equal(await prefs(), beforeInvalid);
  await page.getByRole('spinbutton', { name: '区间 2 最低分', exact: true }).fill('9'); await page.getByRole('button', { name: '应用区间', exact: true }).click();
  assert.equal(await card('星海旅人').locator('.card-cover').getAttribute('data-finish'), 'holographic'); assert.equal(await card('零分作品').locator('.card-cover').getAttribute('data-finish'), 'prismatic'); assert.equal(await card('未评分作品').locator('.card-cover').getAttribute('data-finish'), 'standard');
  const savedPrefs = JSON.parse(await prefs()); assert.equal(savedPrefs.strength, .8); assert.equal(savedPrefs.filter, .6); assert.equal(savedPrefs.speed, .4); assert.equal(savedPrefs.facets, false); assert.equal(savedPrefs.futurePreference, 'keep');
  await shot('cover-settings'); await page.getByRole('button', { name: '关闭', exact: true }).click();
  await card('星海旅人').locator('.card-cover').hover({ position: { x: 30, y: 45 } }); await page.waitForTimeout(200); assert.equal(await card('星海旅人').locator('.card-cover').getAttribute('data-depth'), 'active');
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('qiyu.cover-material.v1')); p.enabled = false; localStorage.setItem('qiyu.cover-material.v1', JSON.stringify(p)); window.dispatchEvent(new Event('qiyu:cover-material')); });
  assert.equal(await page.locator('.cover-material-canvas').count(), 0); assert.equal(await card('星海旅人').locator('.card-cover').getAttribute('data-finish'), 'standard'); assert.equal(await card('星海旅人').locator('.card-cover').getAttribute('data-depth'), 'active');
  assert.equal(raw(), beforeAppearance); check('评分区间含0分、重叠拒绝、未知评分原图；关闭释放反光但保留倾斜和收藏');
  await page.reload(); assert.equal(JSON.parse(await prefs()).enabled, false); assert.equal(JSON.parse(await prefs()).mode, 'ranges'); assert.equal(raw(), beforeAppearance); check('本机反光规则重载保持，不写入作品数据');
  await page.getByRole('button', { name: '数据与设置', exact: true }).click(); await page.getByRole('button', { name: '卡面材质', exact: true }).click(); await page.getByRole('button', { name: '恢复卡面默认', exact: true }).click();
  const restoredPrefs = JSON.parse(await prefs()); assert.equal(restoredPrefs.enabled, true); assert.equal(restoredPrefs.mode, 'default'); assert.equal(restoredPrefs.strength, 1); assert.equal(restoredPrefs.futurePreference, 'keep'); await page.getByRole('button', { name: '关闭', exact: true }).click(); check('恢复默认只重置已知外观规则，未知扩展仍保留');
  const after = stored(); assert.equal(after.schemaVersion, 1); assert.deepEqual(after.futureRoot, fixture.futureRoot);
  assert.deepEqual(after.items.slice(1), JSON.parse(JSON.stringify(fixture.items.slice(1)))); for (const field of ['impression', 'review', 'completionCount', 'platforms', 'futureExtension']) assert.deepEqual(after.items[0][field], fixture.items[0][field]);
  await app.close(); app = null; await launch(); assert.equal(stored().items[0].personalScore, 9.6);
  check('分类、时长、个人感想及未知字段保护，重启进程读回最终分数');
  assert.deepEqual(errors, []); check('无页面运行错误');
})().catch(async error => { console.error(error); process.exitCode = 1; if (page) await shot('failure').catch(() => {}); }).finally(async () => { if (app) await app.close().catch(() => {}); fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({ passed: !process.exitCode, packaged, checks, errors, dataDirectory: data }, null, 2)); });
