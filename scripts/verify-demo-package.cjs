// Run ONLY against a freshly extracted acceptance bundle. Never launches normal mode.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict'), net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const bundle = path.resolve(process.argv[2] || 'MISSING-BUNDLE');
const executable = path.join(bundle, '栖域.exe'), entry = path.join(bundle, '启动演示.cmd');
const output = path.join(root, 'evidence', 'demo-package-v0424', new Date().toISOString().replace(/[:.]/g, '-'));
const report = { passed: false, version: '0.4.24', userDataAccessed: false, actualLauncher: true, checks: [], errors: [], screenshots: [] };
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.QIYU_E2E; delete env.QIYU_TEST_DATA_DIR;
let browser, page, profile, file;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const read = () => JSON.parse(fs.readFileSync(file, 'utf8'));
const item = id => read().items.find(value => value.id === id);
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
async function check(name, action) { await action(); report.checks.push({ name, passed: true }); console.log(`通过：${name}`); }
async function poll(fn, expected, timeout = 15000) { const deadline = Date.now() + timeout; while (Date.now() < deadline) { try { if (await fn() === expected) return; } catch {} await sleep(100); } assert.equal(await fn(), expected); }
async function freePort() { const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }
async function launchEntry() {
  const port = await freePort();
  const launcher = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${entry}" -VerifyPort ${port}"`], { cwd: bundle, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; launcher.stderr.on('data', data => log += data);
  await poll(async () => { try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { return false; } }, true, 45000).catch(error => { throw new Error(`${error.message}\n启动器：${log}`); });
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0]; page = context.pages()[0] || await context.waitForEvent('page');
  page.on('pageerror', error => report.errors.push(error.message));
  await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
  await poll(() => page.evaluate(() => window.qiyuDesktop.getInfo().windowVisible), true);
  const info = await page.evaluate(() => window.qiyuDesktop.getInfo());
  const locator = JSON.parse(fs.readFileSync(path.join(bundle, 'qiyu-demo-profile.json'), 'utf8'));
  assert.equal(info.demo, true); assert.equal(info.version, '0.4.24');
  assert.equal(path.resolve(info.dataDirectory), path.resolve(locator.directory));
  if (profile) assert.equal(info.dataDirectory, profile, 'same entry must reuse its directory');
  profile = info.dataDirectory; file = path.join(profile, 'library.json');
  assert.ok(path.basename(profile).startsWith('qiyu-demo-'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'qiyu-demo.json'))).format, 'qiyu.demo.v1');
  await page.locator('.demo-mode-banner').waitFor(); assert.match(await page.locator('.demo-mode-banner').innerText(), /演示数据.*0\.4\.24/);
  return info;
}
async function closeEntry() {
  await page.close(); await browser.close().catch(() => {}); browser = null; page = null;
  await sleep(1200); // allow Chromium to release the independently scoped demo lock
}
async function open(title) { await button('全部游戏', page.locator('.library-views')).click(); await button(`查看${title}详情`).click(); return page.getByRole('dialog', { name: `${title}详情`, exact: true }); }
async function screenshot(name) { const target = path.join(output, name); await page.screenshot({ path: target }); report.screenshots.push(name); }
async function startupFailure(args, expectedFile, original) {
  const child = spawn(executable, args, { cwd: bundle, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', value => stderr += value);
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  try {
    await poll(() => stderr.includes('QIYU_STARTUP_FAILED:'), true, 15000);
    // Dismiss only this newly created test process's error dialog, never another application.
    const command = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class QiyuClose { [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l); }'; $p=Get-Process -Id ${child.pid} -ErrorAction SilentlyContinue; if($p -and $p.MainWindowHandle -ne 0){ [QiyuClose]::PostMessage($p.MainWindowHandle,16,[IntPtr]::Zero,[IntPtr]::Zero) | Out-Null }`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { windowsHide: true });
    const result = await Promise.race([exited, sleep(8000).then(() => null)]);
    assert.ok(result && result.code !== 0, 'invalid startup must exit with failure');
    if (expectedFile) assert.equal(fs.readFileSync(expectedFile, 'utf8'), original);
  } finally { if (child.exitCode === null) child.kill(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  assert.ok(fs.existsSync(executable) && fs.existsSync(entry));
  assert.equal(fs.existsSync(path.join(bundle, 'qiyu-demo-profile.json')), false, 'use a freshly extracted bundle');
  const seed = fs.readFileSync(path.join(bundle, 'demo-library.json'), 'utf8');
  await check('真实CMD入口：窗口可见、0.4.24、独立目录及浏览零写', async () => {
    await launchEntry(); assert.equal(fs.readFileSync(file, 'utf8'), seed); await screenshot('01-demo-start.png');
  });
  await check('通关后计划重玩，原通关/评级/旧轴保留；右键两等级入口', async () => {
    await button('全部游戏', page.locator('.library-views')).click(); await button('查看星海旅人详情').click({ button: 'right' });
    const menu = page.getByRole('menu', { name: '星海旅人快捷编辑', exact: true });
    await menu.getByRole('menuitemradio', { name: '计划游玩', exact: true }).click();
    assert.equal(await menu.getByRole('group', { name: '待体验优先级', exact: true }).count(), 1);
    assert.equal(await menu.getByRole('group', { name: '通关评级', exact: true }).count(), 1);
    await menu.getByRole('group', { name: '待体验优先级', exact: true }).getByRole('menuitemradio', { name: 'S', exact: true }).click();
    assert.equal(item('demo-a').playEngagement, 'planned'); assert.equal(item('demo-a').completion, 'cleared'); assert.equal(item('demo-a').personalGrade, 'SS'); assert.equal(item('demo-a').gamePlayState, 'cleared');
  });
  await check('60小时未通关搁置、当前关系与进度独立', async () => {
    const d = await open('远界编年史'); await button('暂时搁置', d).click(); assert.equal(item('demo-b').playtimeMinutes, 3600); assert.equal(item('demo-b').completion, 'not-cleared'); await button('关闭详情', d).click();
  });
  await check('累计3→4→撤销3，事件原子落盘', async () => {
    const d = await open('潮汐协议'); await button('记录一次完成', d).click(); await d.getByRole('combobox', { name: '累计次数处理', exact: true }).selectOption('increment'); await button('保存这条完成记录', d).click();
    assert.equal(item('demo-d').completionCount, 4); assert.equal(item('demo-d').completionEvents.length, 1); await button('撤销本次', d).click(); assert.equal(item('demo-d').completionCount, 3); assert.equal(item('demo-d').completionEvents.length, 0); await button('关闭详情', d).click();
  });
  await check('补录2023保留年份精度与未知累计', async () => {
    const d = await open('机械花园'); await button('记录一次完成', d).click(); await d.getByRole('textbox', { name: '实际完成日期', exact: true }).fill('2023'); await button('保存这条完成记录', d).click();
    assert.equal(item('demo-e').completionCount, undefined); assert.equal(item('demo-e').completionEvents[0].occurredAt, '2023'); await screenshot('02-completion-record.png'); await button('关闭详情', d).click();
  });
  await check('无终点游戏自填累计5，默认保留不适用及评级', async () => {
    const d = await open('无尽回廊'); await button('记录一次完成', d).click(); await d.getByRole('combobox', { name: '累计次数处理', exact: true }).selectOption('set'); await d.getByRole('textbox', { name: '包含本次的累计值', exact: true }).fill('5'); await button('保存这条完成记录', d).click();
    assert.equal(item('demo-c').completionCount, 5); assert.equal(item('demo-c').completion, 'not-applicable'); assert.equal(item('demo-c').personalGrade, 'S'); await button('关闭详情', d).click();
  });
  const changed = fs.readFileSync(file, 'utf8');
  await check('关闭后从同一CMD入口重新启动，读回所有修改且不重播种', async () => {
    await closeEntry(); await launchEntry(); assert.equal(fs.readFileSync(file, 'utf8'), changed); await screenshot('03-reopened.png'); await closeEntry();
  });
  await check('成品缺失演示参数与损坏独立演示库均失败、不回退、不改原文', async () => {
    await startupFailure(['--demo-profile'], null);
    const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-bad-demo-'));
    try { fs.writeFileSync(path.join(bad, 'qiyu-demo.json'), '{"format":"qiyu.demo.v1"}'); const badFile = path.join(bad, 'library.json'); fs.writeFileSync(badFile, '{broken'); await startupFailure(['--demo', `--demo-profile=${bad}`], badFile, '{broken'); }
    finally { fs.rmSync(bad, { recursive: true, force: true }); }
    assert.equal(fs.readFileSync(file, 'utf8'), changed);
  });
  assert.deepEqual(report.errors, []); report.passed = true;
})().catch(error => { report.error = error.stack; console.error(error); process.exitCode = 1; }).finally(async () => {
  if (page && !page.isClosed()) await page.close().catch(() => {});
  await browser?.close().catch(() => {});
  fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2));
  console.log(`报告：${path.join(output, 'validation.json')}`);
});
