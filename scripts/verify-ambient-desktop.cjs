const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const executablePath = process.argv[2] || path.join(root, 'node_modules/electron/dist/electron.exe');
const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-ambient-desktop-'));
const output = path.join(root, 'evidence', `ui-live-v${version.replaceAll('.', '')}`);
const env = { ...process.env, QIYU_E2E: '1', QIYU_TEST_DATA_DIR: dataDirectory };
delete env.ELECTRON_RUN_AS_NODE;
const baseline = JSON.stringify({ schemaVersion: 1, items: [] });
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(dataDirectory, 'library.json'), baseline);
const report = { passed: false, version, executablePath, dataDirectory, isolatedDataOnly: true, checks: [], pageErrors: [] };
let app, page;
async function launch() {
  app = await electron.launch({ executablePath, args: process.argv[2] ? [] : [root], env, timeout: 45000 });
  page = await app.firstWindow();
  page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  report.nativePicker = await page.locator('.sort-box select').evaluate(element => ({ supported: CSS.supports('appearance', 'base-select'), appearance: getComputedStyle(element).appearance, popup: getComputedStyle(element, '::picker(select)').backgroundColor }));
  assert.equal(report.nativePicker.supported, true); assert.equal(report.nativePicker.appearance, 'base-select');
  await page.evaluate(() => {
    window.__ambientDraws = 0; const proto = WebGL2RenderingContext.prototype, original = proto.drawArrays;
    proto.drawArrays = function(...args) { window.__ambientDraws++; return original.apply(this, args); };
  });
}
async function state() { return page.locator('.ambient-scene').evaluate(element => ({ ...element.dataset, x: element.querySelector('.ambient-scene__fluid').style.transform, draws: window.__ambientDraws })); }
async function backgroundSettings() {
  await page.getByRole('button', { name: '数据与设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '数据与设置', exact: true });
  await dialog.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '背景与配色', exact: true }).click();
  const advanced = dialog.locator('details.settings-advanced');
  if (!await advanced.evaluate(e => e.open)) await advanced.locator('summary').click();
  return dialog;
}
async function waitMotion(value) { await page.waitForFunction(expected => document.querySelector('.ambient-scene')?.dataset.motion === expected, value); }
async function changing(expected) {
  const a = await state(); await page.waitForTimeout(900); const b = await state();
  assert.equal(b.draws > a.draws, expected, JSON.stringify({ a, b }));
  assert.equal(a.x !== b.x, expected, JSON.stringify({ a, b })); return { a, b };
}
(async () => {
  try {
    await launch();
    await waitMotion('paused');
    report.checks.push({ name: '原生隐藏窗口暂停', frames: await changing(false) });
    await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.show(); window.focus(); });
    await page.bringToFront(); await waitMotion('animated');
    report.checks.push({ name: '原生显示后持续运动', frames: await changing(true) });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
    await waitMotion('paused');
    report.checks.push({ name: '原生最小化停帧', frames: await changing(false) });
    await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.restore(); window.show(); window.focus(); });
    await page.bringToFront(); await waitMotion('animated');
    report.checks.push({ name: '原生恢复后持续运动', frames: await changing(true) });
    await backgroundSettings();
    await page.getByRole('button', { name: '紫罗兰', exact: true }).click();
    await page.getByRole('slider', { name: '背景明暗', exact: true }).fill('77');
    await page.getByRole('checkbox', { name: '动态背景', exact: true }).uncheck();
    await waitMotion('static');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('qiyu.background.v1'))), { fluidEnabled: true, starsEnabled: true, parallax: 100, density: 60, paletteHue: 268, distortion: 20, brushStrength: 0, brushRadius: .22, enabled: false, hue: 100, strength: 77, depth: 22, speed: 14, swirl: 12 });
    assert.equal(fs.readFileSync(path.join(dataDirectory, 'library.json'), 'utf8'), baseline);
    await page.getByRole('dialog', { name: '数据与设置' }).getByRole('button', { name: '关闭', exact: true }).click();
    await app.close(); app = null;
    await launch();
    await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.show(); window.focus(); });
    await page.bringToFront(); await waitMotion('static');
    await backgroundSettings();
    assert.equal(await page.getByRole('button', { name: '紫罗兰', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('slider', { name: '背景明暗', exact: true }).inputValue(), '77');
    assert.equal(await page.getByRole('checkbox', { name: '动态背景', exact: true }).isChecked(), false);
    report.checks.push({ name: '颜色、明暗与开关跨进程记忆，收藏不写入' });
    await page.getByRole('checkbox', { name: '动态背景', exact: true }).check();
    await waitMotion('animated');
    report.checks.push({ name: '重新开启恢复运动', frames: await changing(true) });
    assert.deepEqual(report.pageErrors, []);
    assert.equal(fs.readFileSync(path.join(dataDirectory, 'library.json'), 'utf8'), baseline);
    report.passed = true;
  } catch (error) { report.failure = error.stack; process.exitCode = 1; }
  finally {
    if (app) await app.close().catch(() => {});
    report.timestamp = new Date().toISOString();
    fs.writeFileSync(path.join(output, 'ambient-desktop-validation.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(output, `ambient-desktop-${process.argv[2] ? 'packaged' : 'source'}-validation.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  }
})();
