const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), version = require('../package.json').version;
const output = path.join(root, 'evidence', `theme-motion-v${version.replaceAll('.', '')}`);
const digest = value => createHash('sha256').update(value).digest('hex');
const report = { passed: false, version, isolatedDataOnly: true, userLibraryAccessed: false, checks: [], captures: [], palettes: [], transitions: [], cadence: [], runtime: [], integrity: [], errors: [], notes: ['60 Hz 为渲染目标，实际帧率受 GPU、窗口尺寸和刷新率影响；实测时间与计数原样记录，不承诺任意设备恒定60帧。', '仅使用合成收藏和全新浏览器上下文，不读写真实 AppData/QIYU。'] };
const fixture = JSON.stringify({ schemaVersion: 1, futureRoot: { preserve: 'theme' }, items: [{ id: 'theme-fixture', category: 'game', subcategory: 'Steam', title: '配色隔离作品', status: 'want', gamePlayState: 'want', creator: '隔离测试', year: '2026', platforms: ['Steam'], tags: [], gameTags: { gameplay: [], theme: [], scenario: [], other: [] }, impression: '不能改写的个人记录。', favorite: false, artwork: 'outer', playtimeMinutes: 120, futureItem: 42, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }] });
let server, browser, context, page, base, stage = '';
fs.mkdirSync(output, { recursive: true });
report.distAssets = [...fs.readFileSync(path.join(dist, 'index.html'), 'utf8').matchAll(/(?:src|href)="((?:\.\/|\/)?assets\/[^\"]+\.(?:js|css))"/g)].map(m => ({ path: m[1], sha256: digest(fs.readFileSync(path.join(dist, m[1]))) }));
async function check(name, run) { stage = name; await run(); const state = await page.evaluate(() => ({ raw: localStorage.getItem('qiyu.library.v1'), writes: window.__themeStats.libraryWrites })); assert.equal(state.raw, fixture); assert.equal(state.writes, 0); report.integrity.push({ name, sha256: digest(state.raw), libraryWrites: 0 }); report.checks.push(name); console.log(`PASS ${name}`); }
async function capture(name) { await page.screenshot({ path: path.join(output, name + '.png'), caret: 'hide' }); report.captures.push(name + '.png'); }
async function colors() {
  return page.evaluate(() => {
    window.__readThemeColors = () => {
    const root = document.documentElement, style = getComputedStyle(root);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const ctx = canvas.getContext('2d');
    function resolve(value) { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); return Array.from(ctx.getImageData(0, 0, 1, 1).data); }
    const button = document.querySelector('.topbar .button--primary');
    return { time: performance.now(), hue: root.dataset.themeTone, selected: resolve(style.getPropertyValue('--control-selected')), ink: resolve(style.getPropertyValue('--control-selected-ink')), accent: resolve(style.getPropertyValue('--accent')), ambient: resolve(style.getPropertyValue('--theme-ambient')), fill: resolve(getComputedStyle(button).backgroundColor), border: getComputedStyle(document.querySelector('.media-card[data-game-state="want"] .card-cover')).borderColor, variables: ['--game-want','--game-playing','--game-cleared','--game-ongoing','--game-paused','--game-abandoned'].map(key => style.getPropertyValue(key).trim()), gl: structuredClone(window.__themeStats.colors), motion: document.querySelector('.ambient-scene').dataset.motion };
    };
    return window.__readThemeColors();
  });
}
const distance = (a, b) => Math.hypot(...a.slice(0, 3).map((v, i) => v - b[i]));
const luminance = color => color.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
async function clockChecks() {
  const compiled = require('esbuild').buildSync({ entryPoints: [path.join(root, 'src/presentation/features/ambient/frameClock.ts')], bundle: true, write: false, format: 'esm', platform: 'node' }).outputFiles[0].text;
  const { createFrameClock } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
  for (const refresh of [60, 120, 144, 240, 30]) {
    const clock = createFrameClock(60), deltas = [];
    for (let n = 0; n <= refresh * 2; n++) { const dt = clock.step(n * 1000 / refresh); if (dt !== null) deltas.push(dt); }
    const frames = deltas.length - 1, seconds = deltas.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(frames - Math.min(60, refresh) * 2) <= 1, JSON.stringify({ refresh, frames })); assert.ok(Math.abs(seconds - 2) < .025);
    clock.reset(); assert.equal(clock.step(90000), 0);
    report.cadence.push({ refresh, durationSeconds: 2, renderedFrames: frames, integratedSeconds: seconds });
  }
}
async function measure(label, milliseconds = 2100) {
  const before = await page.evaluate(() => ({ time: performance.now(), stars: window.__themeStats.starFrames, fluid: window.__themeStats.fluidFrames, rafs: window.__themeStats.rafs }));
  await page.waitForTimeout(milliseconds);
  const after = await page.evaluate(() => ({ time: performance.now(), stars: window.__themeStats.starFrames, fluid: window.__themeStats.fluidFrames, rafs: window.__themeStats.rafs }));
  const seconds = (after.time - before.time) / 1000;
  const result = { label, seconds, starFrames: after.stars - before.stars, fluidFrames: after.fluid - before.fluid, displayCallbacks: after.rafs - before.rafs, starFps: (after.stars - before.stars) / seconds, fluidFps: (after.fluid - before.fluid) / seconds, rafFps: (after.rafs - before.rafs) / seconds };
  report.runtime.push(result); return result;
}
function serverStart() {
  const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png' };
  server = http.createServer((req, res) => { const url = new URL(req.url, 'http://127.0.0.1'); if (url.pathname === '/__init') { res.writeHead(200, { 'content-type':'text/html' }); return res.end('<!doctype html><title>Isolated theme setup</title>'); } if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); } let file; try { file = path.resolve(dist, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)); } catch { res.writeHead(400); return res.end(); } if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control':'no-store' }); fs.createReadStream(file).pipe(res); });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)); });
}
(async () => {
  try {
    await clockChecks(); base = await serverStart(); browser = await chromium.launch({ channel: 'msedge', headless: true });
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference', colorScheme: 'dark' });
    await context.addInitScript(() => {
      window.__themeStats = { libraryWrites: 0, starFrames: 0, fluidFrames: 0, rafs: 0, colors: {}, samples: [] };
      const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === 'qiyu.library.v1') window.__themeStats.libraryWrites++; return set.call(this, key, value); };
      const clear = CanvasRenderingContext2D.prototype.clearRect; CanvasRenderingContext2D.prototype.clearRect = function(...args) { if (this.canvas.classList.contains('ambient-scene__particles')) window.__themeStats.starFrames++; return clear.apply(this, args); };
      const names = new WeakMap(), proto = WebGL2RenderingContext.prototype;
      const get = proto.getUniformLocation; proto.getUniformLocation = function(...args) { const value = get.apply(this, args); if (value) names.set(value, args[1]); return value; };
      const color = proto.uniform4f; proto.uniform4f = function(...args) { const name = names.get(args[0]); if (this.canvas.classList.contains('ambient-scene__fluid') && name) { window.__themeStats.colors[name] = args.slice(1); if (name === 'u_color1') window.__themeStats.samples.push({ time: performance.now(), color: args.slice(1) }); if (window.__themeStats.samples.length > 300) window.__themeStats.samples.shift(); } return color.apply(this, args); };
      const draw = proto.drawArrays; proto.drawArrays = function(...args) { if (this.canvas.classList.contains('ambient-scene__fluid') && this.getParameter(this.FRAMEBUFFER_BINDING) === null) window.__themeStats.fluidFrames++; return draw.apply(this, args); };
      const sample = () => { window.__themeStats.rafs++; requestAnimationFrame(sample); }; requestAnimationFrame(sample);
    });
    page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => report.errors.push({ stage, message: e.message })); page.on('console', m => { if (m.type() === 'error') report.errors.push({ stage, message: m.text() }); });
    await page.route('**/*', route => route.request().url().startsWith(base) || route.request().url().startsWith('data:') ? route.continue() : route.abort());
    await page.goto(base + '/__init');
    await page.evaluate(raw => { localStorage.setItem('qiyu.library.v1', raw); localStorage.setItem('qiyu.background.v1', JSON.stringify({ enabled: true, hue: 33, fluidEnabled: true, starsEnabled: true })); }, fixture);
    await page.goto(base); await page.getByRole('heading', { name: '游戏', exact: true }).waitFor(); await page.waitForTimeout(650);
    const themeButton = page.getByRole('button', { name: '切换背景主题配色', exact: true });
    let semantic;
    await check('五色主题同步改变按钮、边框、文字与实际WebGL调色，六状态语义色保持', async () => {
      const colorsByHue = [];
      for (const hue of [44, 210, 160, 268, 355]) {
        await page.waitForTimeout(450); const value = await colors(); semantic ??= value.variables; assert.equal(Number(value.hue), hue); assert.deepEqual(value.variables, semantic); colorsByHue.push(value.selected.join(','));
        const composite = value.fill.slice(0, 3).map(v => v * value.fill[3] / 255); value.minimumPrimaryContrast = (luminance(composite) + .05) / (luminance(value.ink) + .05); assert.ok(value.minimumPrimaryContrast >= 4.5, JSON.stringify(value));
        if (report.palettes.length) assert.equal(value.border, report.palettes[0].border);
        report.palettes.push(value); await capture('theme-' + hue); await themeButton.click();
      }
      assert.equal(new Set(colorsByHue).size, 5);
    });
    await page.waitForTimeout(450);
    await check('切换中间帧及快速连续切换保持连续，最终目标正确', async () => {
      const { from, middle, immediate, restart, target } = await page.evaluate(async () => {
        const button = document.querySelector('button[aria-label="切换背景主题配色"]'), read = window.__readThemeColors;
        const from = read(); button.click(); await new Promise(resolve => setTimeout(resolve, 170)); const middle = read(); button.click(); const immediate = read(); await new Promise(requestAnimationFrame); const restart = read(); await new Promise(resolve => setTimeout(resolve, 500)); return { from, middle, immediate, restart, target:read() };
      });
      assert.equal(Number(target.hue), 160); assert.ok(distance(from.selected, middle.selected) > 1); assert.ok(distance(middle.selected, target.selected) > 5); assert.deepEqual(immediate.selected, middle.selected);
      const segment = target.selected.slice(0,3).map((v,i) => v-middle.selected[i]), changed = restart.selected.slice(0,3).map((v,i) => v-middle.selected[i]);
      const fraction = changed.reduce((sum,v,i) => sum+v*segment[i],0)/segment.reduce((sum,v) => sum+v*v,0), residual = Math.hypot(...changed.map((v,i) => v-fraction*segment[i]));
      assert.ok(fraction >= -.04 && fraction <= 1.04 && residual <= 4, JSON.stringify({ middle, immediate, restart, target, fraction, residual }));
      assert.ok(distance(from.gl.u_color1, middle.gl.u_color1) > .001); assert.ok(distance(middle.gl.u_color1, target.gl.u_color1) > .01);
      report.transitions.push({ name: 'rapid', from, middle, immediate, restart, target, fraction, residual });
    });
    await check('自定义环境色相同时驱动操作按钮，减少动态立即落到目标', async () => {
      await page.getByRole('button', { name: '数据与设置', exact: true }).click(); const settings = page.getByRole('dialog', { name: '数据与设置', exact: true });
      await settings.getByRole('slider', { name: '自定义色相', exact: true }).fill('105'); await page.waitForTimeout(450); const custom = await colors(); assert.equal(Number(custom.hue), 105); assert.ok(custom.selected[1] > custom.selected[0] && custom.selected[1] > custom.selected[2]);
      await page.emulateMedia({ reducedMotion: 'reduce' }); await settings.getByRole('slider', { name: '自定义色相', exact: true }).fill('210');
      await page.waitForTimeout(35); const immediate = await colors(); await page.waitForTimeout(450); const settled = await colors(); assert.deepEqual(immediate.selected, settled.selected); assert.equal(immediate.motion, 'static'); assert.ok(immediate.selected[2] > immediate.selected[0]); report.transitions.push({ name: 'custom-and-reduced-motion', custom, immediate, settled }); await capture('custom-reduced-motion');
      await settings.getByRole('button', { name: '关闭', exact: true }).click();
    });
    await check('正常模式粒子与流体同为60Hz目标，无30帧人为上限', async () => {
      await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.waitForTimeout(450); const measured = await measure('1440x1000');
      assert.ok(measured.starFrames > 30 && measured.fluidFrames > 30); assert.ok(measured.starFps <= 63 && measured.fluidFps <= 64); assert.ok(measured.fluidFrames / measured.starFrames > .85, JSON.stringify(measured));
      if (measured.rafFps >= 54) { assert.ok(measured.starFps >= 52 && measured.fluidFps >= 50, JSON.stringify(measured)); }
    });
    await check('系统减少动态后粒子/GL均停帧，主题按钮仍可即时改色', async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(200); const measured = await measure('reduced-motion', 600); assert.equal(measured.starFrames, 0); assert.equal(measured.fluidFrames, 0); await themeButton.click(); const value = await colors(); assert.equal(value.motion, 'static');
    });
    await check('关闭动态后的主题色有限过渡收敛，星河位置不持续运动', async () => {
      await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.getByRole('button', { name: '数据与设置', exact: true }).click(); const settings = page.getByRole('dialog', { name: '数据与设置', exact: true }); await settings.getByRole('checkbox', { name: '动态背景', exact: true }).uncheck(); await settings.getByRole('button', { name: '关闭', exact: true }).click();
      await themeButton.click(); await page.waitForTimeout(650); const measured = await measure('user-static-after-transition', 600); assert.equal(measured.starFrames, 0); assert.equal(measured.fluidFrames, 0); assert.equal((await colors()).motion, 'static');
    });
    assert.deepEqual(report.errors, []); report.passed = true;
  } catch (error) { report.failure = { stage, message: error.message, stack: error.stack }; process.exitCode = 1; console.error(error.stack); }
  finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); report.timestamp = new Date().toISOString(); fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, runtime: report.runtime, errors: report.errors, failure: report.failure })); }
})();
