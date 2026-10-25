const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const version = require('../package.json').version;
const output = path.join(root, 'evidence', `settings-v${version.replaceAll('.', '')}`);
const sha = value => createHash('sha256').update(value).digest('hex');
const backgroundDefaults = { fluidEnabled: true, starsEnabled: true, parallax: 100, density: 60, distortion: 20, brushStrength: 0, brushRadius: .22, enabled: true, hue: 33, strength: 60, depth: 22, speed: 14, swirl: 12 };
const glassDefaults = { mode: 'liquid', tint: 'smoke', refraction: 100, blur: 3, dispersion: 10, depth: 8, elasticity: 25, actionsEnabled: true, actionBlur: 8, actionOpacity: 56 };
const fixture = { schemaVersion: 1, futureRoot: { untouched: '未知根字段' }, items: Array.from({ length: 8 }, (_, i) => ({ id: `settings-${i}`, category: 'game', title: `设置合成作品 ${i + 1}`, subcategory: 'Steam', platforms: ['Steam'], status: 'want', gamePlayState: 'want', creator: '隔离测试', year: '2026', tags: ['原始标签'], gameTags: { gameplay: [], theme: [], scenario: [], other: [] }, impression: '设置不能改写这段原文。', playtimeMinutes: 120 + i, favorite: false, artwork: 'outer', futureItem: { keep: i }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' })) };
const baseline = JSON.stringify(fixture);
const report = { passed: false, version, isolatedDataOnly: true, userLibraryAccessed: false, checks: [], screenshots: [], integrity: [], runtime: [], dockSelection: [], pageErrors: [], consoleErrors: [], resourceErrors: [], notes: ['使用全新 Edge 隔离上下文与合成收藏，HTTP 仅绑定 127.0.0.1；不访问真实 AppData/QIYU。', 'GL 计数和 uniform 值在真实浏览器 WebGL 原型方法调用处记录；断言实际 SVG 滤镜、Canvas 星河绘制及 CSS 变换，不以 localStorage 值冒充渲染生效。'] };
report.visualScope = { themes: ['dark'], widths: [1440, 390], legacyLightPreference: '单独兼容性检查，不计为浅色视觉验收' };
report.scope = process.argv.includes('--tint-preview-only') ? 'default-tint-preview-only' : 'full';
report.distAssets = [...fs.readFileSync(path.join(dist, 'index.html'), 'utf8').matchAll(/(?:src|href)="((?:\.\/|\/)?assets\/[^\"]+\.(?:js|css))"/g)].map(m => ({ path: m[1], sha256: sha(fs.readFileSync(path.join(dist, m[1]))) }));
let server, browser, context, page, base, stage = '';
fs.mkdirSync(output, { recursive: true });
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const dialog = () => page.getByRole('dialog', { name: '数据与设置', exact: true });
async function check(name, run) { stage = name; await run(); await unchanged(name); report.checks.push(name); console.log(`PASS ${name}`); }
async function capture(name) { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled', caret: 'hide' }); report.screenshots.push(`${name}.png`); }
async function unchanged(name) { const state = await page.evaluate(() => ({ raw: localStorage.getItem('qiyu.library.v1'), writes: window.__settingsStats.libraryWrites })); assert.equal(state.raw, baseline, name); assert.equal(state.writes, 0, name); report.integrity.push({ name, same: true, libraryWrites: state.writes, sha256: sha(state.raw) }); }
async function serve() {
  const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (url.pathname === '/__init') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>Isolated settings fixture</title>'); }
    let file; try { file = path.resolve(dist, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)); } catch { res.writeHead(400); return res.end(); }
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(file).pipe(res);
  });
  await require('./test-loopback.cjs').listenLoopback(server);
  return `http://127.0.0.1:${server.address().port}`;
}
async function prepare(theme = 'dark', width = 1440) {
  context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme, reducedMotion: 'no-preference' });
  await context.addInitScript(() => {
    window.__settingsStats = { draws: 0, starDraws: 0, starClears: 0, scalars: {}, vectors: {}, colors: {}, libraryWrites: 0 };
    const locations = new WeakMap();
    for (const ctor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!ctor) continue;
      for (const method of ['getUniformLocation', 'uniform1f', 'uniform2f', 'uniform4f', 'drawArrays']) {
        const original = ctor.prototype[method];
        ctor.prototype[method] = function (...args) {
          if (this.canvas.classList.contains('ambient-scene__fluid')) {
            if (method === 'getUniformLocation') { const location = original.apply(this, args); if (location) locations.set(location, args[1]); return location; }
            const name = locations.get(args[0]);
            if (method === 'uniform1f' && name) window.__settingsStats.scalars[name] = args[1];
            if (method === 'uniform2f' && name) window.__settingsStats.vectors[name] = args.slice(1);
            if (method === 'uniform4f' && name) window.__settingsStats.colors[name] = args.slice(1);
            if (method === 'drawArrays') window.__settingsStats.draws++;
          }
          return original.apply(this, args);
        };
      }
    }
    for (const method of ['drawImage', 'clearRect']) {
      const original = CanvasRenderingContext2D.prototype[method];
      CanvasRenderingContext2D.prototype[method] = function (...args) {
        if (this.canvas.classList.contains('ambient-scene__particles')) window.__settingsStats[method === 'drawImage' ? 'starDraws' : 'starClears']++;
        return original.apply(this, args);
      };
    }
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { if (key === 'qiyu.library.v1') window.__settingsStats.libraryWrites++; return setItem.call(this, key, value); };
  });
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => report.pageErrors.push({ stage, message: e.message }));
  page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push({ stage, text: m.text() }); });
  page.on('response', r => { if (r.status() >= 400) report.resourceErrors.push({ stage, status: r.status(), url: r.url() }); });
  await page.route('**/*', route => route.request().url().startsWith(base) || route.request().url().startsWith('data:') ? route.continue() : route.abort('blockedbyclient'));
  await page.goto(base + '/__init');
  await page.evaluate(({ baseline, theme, backgroundDefaults, glassDefaults }) => {
    localStorage.setItem('qiyu.library.v1', baseline);
    localStorage.setItem('qiyu.appearance.v1', JSON.stringify({ mode: theme, futureAppearance: { keep: 1 } }));
    localStorage.setItem('qiyu.background.v1', JSON.stringify({ ...backgroundDefaults, enabled: false, futureBackground: { keep: '未来背景字段' } }));
    localStorage.setItem('qiyu.glass.v1', JSON.stringify({ ...glassDefaults, futureGlass: { keep: '未来玻璃字段' } }));
  }, { baseline, theme, backgroundDefaults, glassDefaults });
  await page.goto(base, { waitUntil: 'networkidle' }); await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('.sidebar-dock')?.dataset.glassEffective === 'liquid' && document.querySelector('.ambient-scene')?.dataset.fluidAvailable === 'true');
}
async function dispose() { if (context) await context.close(); context = null; }
async function openSettings(section = '背景与配色', advanced = false) {
  if (!await dialog().count()) { const open = button('打开菜单'); if (await open.isVisible() && await open.getAttribute('aria-expanded') !== 'true') await open.click(); await button('数据与设置').click(); }
  const d = dialog(); await d.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: section, exact: true }).click();
  if (advanced) { const details = d.locator('details.settings-advanced'); if (!await details.evaluate(e => e.open)) await details.locator('summary').click(); }
  return d;
}
async function closeSettings() { if (await dialog().count()) await button('关闭', dialog()).click(); }
async function range(name, value) { const control = dialog().getByRole('slider', { name, exact: true }); await control.fill(String(value)); assert.equal(await control.inputValue(), String(value)); await page.waitForTimeout(['自定义色相','流体色深'].includes(name) ? 480 : 90); }
async function toggle(name, value) { await dialog().getByRole('checkbox', { name, exact: true }).setChecked(value); await page.waitForTimeout(150); }
async function stats() { return page.evaluate(() => { const scene = document.querySelector('.ambient-scene'), fluid = scene.querySelector('.ambient-scene__fluid'), stars = scene.querySelector('.ambient-scene__particles'); return { ...structuredClone(window.__settingsStats), scene: { ...scene.dataset }, fluidTransform: fluid.style.transform, starTransform: stars.style.transform, fluidVisibility: getComputedStyle(fluid).visibility, starVisibility: getComputedStyle(stars).visibility, fluidOpacity: Number(getComputedStyle(fluid).opacity), starOpacity: Number(getComputedStyle(stars).opacity), fieldOpacity: Number(getComputedStyle(scene.querySelector('.ambient-scene__field')).opacity), sceneX: scene.style.getPropertyValue('--scene-x'), sceneY: scene.style.getPropertyValue('--scene-y') }; }); }
async function frames(name, fluid, stars) { await page.waitForTimeout(180); const a = await stats(); await page.waitForTimeout(500); const b = await stats(); assert.equal(b.draws > a.draws, fluid, name + ' GL'); assert.equal(b.starDraws > a.starDraws, stars, name + ' 星河'); report.runtime.push({ name, a, b }); return b; }
async function preferences() { return page.evaluate(() => ({ background: JSON.parse(localStorage.getItem('qiyu.background.v1')), glass: JSON.parse(localStorage.getItem('qiyu.glass.v1')), appearance: JSON.parse(localStorage.getItem('qiyu.appearance.v1')) })); }
async function glassState() { return page.locator('.global-search').evaluate(host => { const effect = host.querySelector('.glass-material__effect'), id = effect.style.backdropFilter.match(/#([^)\"]+)/)?.[1], f = id ? document.getElementById(id) : null; return { id: id ?? null, effective: host.dataset.glassEffective, blur: getComputedStyle(effect).backdropFilter, translate: host.style.translate, sigma: f ? Number(f.querySelector('feGaussianBlur').getAttribute('stdDeviation')) : null, scales: f ? [...f.querySelectorAll('feDisplacementMap')].map(e => Number(e.getAttribute('scale'))) : [], lens: f?.querySelector('feImage').getAttribute('href') ?? null }; }); }
async function actionState() { return button('重置背景与玻璃', dialog()).evaluate(e => { const style = getComputedStyle(e), c = document.createElement('canvas'); c.width = c.height = 1; const ctx = c.getContext('2d'); ctx.fillStyle = style.backgroundColor; ctx.fillRect(0, 0, 1, 1); return { backdrop: style.backdropFilter, background: style.backgroundColor, alpha: ctx.getImageData(0, 0, 1, 1).data[3] / 255, mode: document.documentElement.dataset.actionGlass, blurVariable: document.documentElement.style.getPropertyValue('--action-glass-blur'), opacityVariable: document.documentElement.style.getPropertyValue('--action-glass-opacity'), svgLayers: e.querySelectorAll('.glass-material__effect,.glass-material__highlight,svg filter,feDisplacementMap').length, material: e.hasAttribute('data-material-glass'), translate: e.style.translate }; }); }
async function pickerState(control) { return control.evaluate(e => { const option = e.querySelector('option:checked'), sample = document.createElement('span'); sample.style.background = 'var(--accent-soft)'; sample.style.color = 'var(--accent-ink)'; document.body.append(sample); const expected = getComputedStyle(sample); const result = { supported: CSS.supports('appearance', 'base-select'), appearance: getComputedStyle(e).appearance, open: e.matches(':open'), checked: option.value, background: getComputedStyle(option).backgroundColor, ink: getComputedStyle(option).color, expectedBackground: expected.backgroundColor, expectedInk: expected.color, pickerBackground: getComputedStyle(e, '::picker(select)').backgroundColor }; sample.remove(); return result; }); }
function near(actual, expected, message) { assert.ok(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} ≠ ${expected}`); }
function expectedPalette(hue, theme, depth) {
  const d = depth / 100, ramp = (a, b, c) => d < .5 ? a + (b - a) * d * 2 : b + (c - b) * (d - .5) * 2;
  const hsl = (h, s, l) => { const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60 % 2) - 1)), m = l - c / 2; return (h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]).map(v => Math.round((v + m) * 255) / 255).concat(1); };
  return Object.fromEntries((theme === 'dark' ? [[.85, ramp(0, .46, .62)], [.9, ramp(0, .305, .45)], [.5, ramp(0, .075, .10)]] : [[.55, ramp(.93, .78, .68)], [.45, ramp(.97, .89, .82)], [.25, ramp(.99, .97, .94)]]).map(([s, l], i) => [`u_color${i + 1}`, hsl(hue, s, l)]));
}
async function parameters() {
  await prepare();
  await check('分类导航与高级折叠：初始聚焦搜索、隐藏高级不占Tab顺序', async () => {
    await button('数据与设置').click(); const d = dialog(); assert.equal(await d.getByRole('textbox', { name: '搜索设置' }).evaluate(e => document.activeElement === e), true);
    assert.deepEqual(await d.getByRole('navigation', { name: '设置分类' }).getByRole('button').allTextContents(), ['背景与配色', '导航玻璃', '操作按钮', '数据与备份']);
    assert.equal(await d.getByRole('combobox', { name: '外观模式' }).count(), 0); assert.equal(await d.locator('.settings-section').getAttribute('aria-label'), '背景与配色');
    await openSettings('背景与配色'); assert.equal(await d.locator('details').evaluate(e => e.open), false); assert.equal(await d.getByRole('slider', { name: '流体色深', exact: true }).isVisible(), false);
    await openSettings('背景与配色', true); assert.equal(await d.getByRole('slider', { name: '流体色深', exact: true }).isVisible(), true);
  });
  await check('五套颜色与自定义色相驱动真实GL调色且静态不持续绘制', async () => {
    const d = await openSettings('背景与配色', true), palettes = [['香槟金', 44, 33], ['深海蓝', 210, 80], ['极光绿', 160, 67], ['紫罗兰', 268, 100], ['绛红', 355, 0]];
    let previous;
    for (const [label, hue, legacy] of palettes) {
      const before = await stats(); await button(label, d).click(); await page.waitForTimeout(480); const after = await stats();
      assert.equal(await button(label, d).getAttribute('aria-pressed'), 'true'); assert.deepEqual(after.colors, expectedPalette(hue, 'dark', 22)); assert.ok(after.draws > before.draws);
      if (previous) assert.notDeepEqual(after.colors, previous); previous = after.colors;
      const saved = (await preferences()).background; assert.equal(saved.paletteHue, hue); assert.equal(saved.hue, legacy);
      report.runtime.push({ name: `palette-${label}`, colors: after.colors });
    }
    await range('自定义色相', 123); assert.deepEqual((await stats()).colors, expectedPalette(123, 'dark', 22)); assert.equal(await d.getByRole('group', { name: '环境光色相' }).locator('[aria-pressed="true"]').count(), 0);
    await range('流体色深', 70); assert.deepEqual((await stats()).colors, expectedPalette(123, 'dark', 70));
    await frames('静态改色后', false, false);
  });
  await check('明暗实际改变流体、粒子与环境光层透明度', async () => {
    await range('背景明暗', 0); const a = await stats(); near(a.fluidOpacity, .7, 'fluid strength 0'); near(a.starOpacity, .4, 'stars strength 0'); near(a.fieldOpacity, .45, 'field strength 0');
    await range('背景明暗', 100); const b = await stats(); near(b.fluidOpacity, 1, 'fluid strength 100'); near(b.starOpacity, 1, 'stars strength 100'); near(b.fieldOpacity, 1, 'field strength 100 CSS clamps opacity'); report.runtime.push({ name: 'strength', a, b });
  });
  await check('流体涡旋、扭曲、笔刷力度与半径进入真实uniform1f', async () => {
    for (const [label, value, uniform, expected] of [['流体涡旋', 30, 'u_swirl', .6], ['流体扭曲', 60, 'u_distortion', .6], ['笔刷力度', 2.5, 'u_brushStrength', 2.5], ['笔刷半径', .5, 'u_brushRadius', .5]]) {
      await range(label, value); near((await stats()).scalars[uniform], expected, label);
    }
    await range('笔刷力度', 0); near((await stats()).scalars.u_brushStrength, 0, 'brush off');
    await range('笔刷半径', .05); near((await stats()).scalars.u_brushRadius, .05, 'small radius');
    report.runtime.push({ name: 'actual-shader-uniforms', state: await stats() });
  });
  await check('流速控制实际GL时间步长，动态开关停止/恢复真实绘制', async () => {
    await range('流体流速', 2); await toggle('动态背景', true); await frames('动态启动', true, true);
    async function timeSlope() { const a = await stats(), start = Date.now(); await page.waitForTimeout(1000); const b = await stats(); assert.ok(b.draws > a.draws); return (b.scalars.u_time - a.scalars.u_time) / ((Date.now() - start) / 1000); }
    const slow = await timeSlope(); await range('流体流速', 40); const fast = await timeSlope(); assert.ok(slow > .008 && slow < .03, `slow ${slow}`); assert.ok(fast > .2 && fast < .55, `fast ${fast}`); assert.ok(fast / slow > 10 && fast / slow < 30, JSON.stringify({ slow, fast })); report.runtime.push({ name: 'speed', slow, fast, ratio: fast / slow });
    await toggle('动态背景', false); await frames('动态关闭', false, false); await toggle('动态背景', true); await frames('动态恢复', true, true);
  });
  await check('流体板/星河开关相互独立，两者关闭停止所有帧', async () => {
    await toggle('流体板', false); let s = await frames('星河独立运行', false, true); assert.equal(s.scene.fluid, 'off'); assert.equal(s.fluidVisibility, 'hidden'); assert.equal(s.starVisibility, 'visible');
    await toggle('流体板', true); await toggle('星河', false); s = await frames('流体独立运行', true, false); assert.equal(s.scene.stars, 'off'); assert.equal(s.starVisibility, 'hidden');
    await toggle('流体板', false); s = await frames('双关闭', false, false); assert.equal(s.scene.motion, 'static'); assert.equal(s.fluidTransform, 'none'); assert.equal(s.starTransform, 'none');
    await toggle('流体板', true); await toggle('星河', true); await frames('双恢复', true, true);
  });
  await check('粒子密度重建实际星河数量，视差0关闭变换、150恢复双层景深', async () => {
    const size = await page.locator('.ambient-scene').boundingBox(); const expected = density => Math.round(Math.max(30, Math.min(1400, size.width * size.height / 3400 * (density / 50))));
    await toggle('动态背景', false); const beforeDensity = await stats(); await range('粒子密度', 10); const sparse = await stats(); assert.equal(Number(sparse.scene.particles), expected(10)); await range('粒子密度', 100); const dense = await stats(); assert.equal(Number(dense.scene.particles), expected(100)); assert.ok(Number(dense.scene.particles) > Number(sparse.scene.particles)); const sparseSprites = sparse.starDraws - beforeDensity.starDraws, denseSprites = dense.starDraws - sparse.starDraws; assert.ok(sparseSprites > 0); assert.ok(denseSprites > sparseSprites * 5, JSON.stringify({ sparseSprites, denseSprites })); await toggle('动态背景', true);
    await range('视差幅度', 0); await closeSettings(); await page.mouse.move(1300, 800); await page.waitForTimeout(600); const zero = await stats(); assert.equal(zero.fluidTransform, 'none'); assert.equal(zero.starTransform, 'none'); near(parseFloat(zero.sceneX), 0, 'scene x'); near(parseFloat(zero.sceneY), 0, 'scene y');
    await openSettings('背景与配色'); await range('视差幅度', 150); await closeSettings(); await page.mouse.move(1300, 800); await page.waitForTimeout(700); const moving = await stats(); assert.match(moving.fluidTransform, /perspective\(1200px\)/); assert.notEqual(moving.fluidTransform, moving.starTransform); assert.ok(Math.abs(parseFloat(moving.sceneX)) > 10); assert.ok(Math.abs(parseFloat(moving.sceneY)) > 5); report.runtime.push({ name: 'density-parallax', sparseSprites, denseSprites, sparse, dense, zero, moving });
  });
  await check('玻璃模糊改变SVG sigma，色散改变RGB比例，透镜深度重建位移图', async () => {
    await openSettings('导航玻璃', true); await range('玻璃弹性', 0); await range('玻璃模糊', 12); let s = await glassState(); near(s.sigma, 6, 'sigma'); await range('玻璃模糊', 0); s = await glassState(); near(s.sigma, 0, 'zero sigma');
    await range('玻璃色散', 100); s = await glassState(); near(s.scales[0] / s.scales[1], 1.2, 'R/G'); near(s.scales[2] / s.scales[1], .8, 'B/G'); await range('玻璃色散', 0); s = await glassState(); near(s.scales[0], s.scales[1], 'zero dispersion R'); near(s.scales[2], s.scales[1], 'zero dispersion B');
    await range('透镜深度', 2); const thin = await glassState(); await range('透镜深度', 20); const deep = await glassState(); assert.ok(thin.lens?.startsWith('data:image/png;base64,')); assert.ok(deep.lens?.startsWith('data:image/png;base64,')); assert.notEqual(thin.lens, deep.lens); report.runtime.push({ name: 'glass-filter', thin: { ...thin, lens: sha(thin.lens) }, deep: { ...deep, lens: sha(deep.lens) } });
    await range('玻璃折射强度', 0); assert.ok((await glassState()).scales.every(n => n === 0)); await range('玻璃折射强度', 100); near((await glassState()).scales[1], 24 * 255 / 127, 'full refraction');
  });
  await check('玻璃弹性实际跟随指针，0端点保持零位移', async () => {
    await range('玻璃弹性', 50); await closeSettings(); await page.locator('.global-search').hover({ position: { x: 20, y: 10 } }); await page.waitForTimeout(800); const flexible = await glassState(); assert.ok(flexible.translate && !/^0(?:\.00)?px 0(?:\.00)?px$/.test(flexible.translate), JSON.stringify(flexible));
    await openSettings('导航玻璃', true); await range('玻璃弹性', 0); await closeSettings(); await page.locator('.global-search').hover({ position: { x: 20, y: 10 } }); await page.waitForTimeout(800); const fixed = await glassState(); assert.ok(fixed.translate === '' || fixed.translate === '0px' || /^0(?:\.00)?px 0(?:\.00)?px$/.test(fixed.translate), JSON.stringify(fixed)); report.runtime.push({ name: 'elasticity', flexible: { ...flexible, lens: sha(flexible.lens) }, fixed: { ...fixed, lens: sha(fixed.lens) } });
  });
  await check('导航深薄荷/香槟渐变真实染色，保留同一SVG透镜、文字与独立操作按钮/背景', async () => {
    await page.getByRole('textbox', { name: '搜索收藏', exact: true }).fill('设置合成作品'); const d = await openSettings('导航玻璃'), tint = d.getByRole('combobox', { name: '导航玻璃色调' }); assert.equal(await tint.inputValue(), 'smoke');
    const lensBefore = await glassState(), actionBefore = await actionState(), backgroundBefore = (await preferences()).background, colorsBefore = (await stats()).colors;
    const coating = () => page.evaluate(() => ({ tint: document.documentElement.dataset.glassTint, search: getComputedStyle(document.querySelector('.global-search > .glass-material__effect')).backgroundImage, dock: getComputedStyle(document.querySelector('.sidebar-dock > .glass-material__effect')).backgroundImage, text: document.querySelector('[aria-label="搜索收藏"]').value, ink: getComputedStyle(document.querySelector('[aria-label="搜索收藏"]')).color }));
    const original = await coating(); await tint.selectOption('deep-mint'); const mint = await coating(); assert.equal(mint.tint, 'deep-mint'); assert.match(mint.search, /linear-gradient\(125deg/); assert.match(mint.search, /19, 92, 77/); assert.equal(mint.dock, mint.search); assert.equal(mint.text, original.text); assert.equal(mint.ink, original.ink); assert.deepEqual(await glassState(), lensBefore); assert.deepEqual(await actionState(), actionBefore); assert.deepEqual((await preferences()).background, backgroundBefore); assert.deepEqual((await stats()).colors, colorsBefore);
    await closeSettings(); await capture('deep-mint-dock-search'); await openSettings('导航玻璃'); await dialog().getByRole('combobox', { name: '导航玻璃色调' }).selectOption('champagne'); const champagne = await coating(); assert.equal(champagne.tint, 'champagne'); assert.match(champagne.search, /linear-gradient\(125deg/); assert.match(champagne.search, /103, 79, 35/); assert.notEqual(champagne.search, mint.search); assert.equal((await glassState()).id, lensBefore.id); await closeSettings(); await capture('champagne-dock-search'); await openSettings('导航玻璃'); await dialog().getByRole('combobox', { name: '导航玻璃色调' }).selectOption('deep-mint'); report.runtime.push({ name: 'independent-navigation-tints', original, mint, champagne, unchangedFilter: lensBefore.id });
  });
  await check('操作按钮独立毛玻璃：实际CSS模糊/透明度/开关，不重建导航透镜', async () => {
    await openSettings('操作按钮'); const before = await glassState(); assert.ok(before.id); const initial = await actionState(); assert.equal(initial.mode, 'on'); assert.match(initial.backdrop, /blur\(8px\)/); assert.equal(initial.svgLayers, 0); assert.equal(initial.material, false);
    await range('按钮模糊', 20); await range('按钮不透明度', 0); await page.waitForTimeout(300); const transparent = await actionState(); assert.match(transparent.backdrop, /blur\(20px\)/); near(transparent.alpha, 0, 'transparent action fill'); assert.equal(transparent.blurVariable, '20px'); assert.equal(transparent.opacityVariable, '0%');
    await range('按钮不透明度', 100); await page.waitForTimeout(300); const opaque = await actionState(); assert.ok(opaque.alpha > .5, JSON.stringify(opaque)); assert.equal(opaque.opacityVariable, '100%');
    await toggle('操作按钮毛玻璃', false); const off = await actionState(); assert.equal(off.mode, 'off'); assert.equal(off.backdrop, 'none'); for (const name of ['按钮模糊', '按钮不透明度']) assert.equal(await dialog().getByRole('slider', { name, exact: true }).isDisabled(), true);
    await toggle('操作按钮毛玻璃', true); await range('按钮模糊', 11); await range('按钮不透明度', 65); const after = await glassState(); assert.deepEqual(after, before, '操作设置不应重建/改变导航SVG');
    await button('重置背景与玻璃', dialog()).hover(); await page.waitForTimeout(500); const hovering = await actionState(); assert.equal(hovering.translate, ''); assert.equal(hovering.svgLayers, 0); assert.equal(hovering.material, false); await page.mouse.move(20, 20); report.runtime.push({ name: 'independent-action-glass', initial, transparent, opaque, off, hovering, unchangedNavigationFilter: before.id }); await capture('action-glass-controls');
  });
  await check('系统减少透明度将操作按钮降为实底并关闭CSS毛玻璃', async () => {
    const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] }); await page.waitForTimeout(200); assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches), true);
    const reduced = await actionState(); assert.equal(reduced.backdrop, 'none'); assert.ok(reduced.alpha > .5); assert.equal((await glassState()).effective, 'solid');
    const selectedFallback = await page.evaluate(() => {
      const probe = document.createElement('div'); probe.dataset.settingsFallbackProbe = ''; probe.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none';
      const sample = document.createElement('span'); sample.style.background = 'var(--control-selected)'; sample.style.color = 'var(--control-selected-ink)'; probe.append(sample);
      const buttons = ['tag-filter is-selected', 'advanced-toggle is-expanded'].map(className => { const element = document.createElement('button'); element.type = 'button'; element.className = className; element.textContent = '仅测试选中控件'; probe.append(element); return element; });
      document.body.append(probe);
      try { const expected = getComputedStyle(sample); return { expected: { background: expected.backgroundColor, ink: expected.color, image: expected.backgroundImage }, controls: buttons.map(element => { const style = getComputedStyle(element); return { className: element.className, background: style.backgroundColor, ink: style.color, image: style.backgroundImage, backdrop: style.backdropFilter }; }) }; }
      finally { probe.remove(); }
    });
    for (const control of selectedFallback.controls) { assert.equal(control.background, selectedFallback.expected.background, control.className + ' 实底选中色'); assert.equal(control.ink, selectedFallback.expected.ink, control.className + ' 选中字色'); assert.equal(control.image, selectedFallback.expected.image); assert.equal(control.backdrop, 'none'); }
    assert.equal(await page.locator('[data-settings-fallback-probe]').count(), 0);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'no-preference' }] }); await page.waitForTimeout(200); assert.match((await actionState()).backdrop, /blur\(11px\)/); assert.equal((await glassState()).effective, 'liquid'); await cdp.detach(); report.runtime.push({ name: 'action-reduced-transparency', reduced, selectedFallback });
  });
  await check('磨砂模式禁用折射/色散/透镜深度，保留模糊与弹性可调', async () => {
    const d = await openSettings('导航玻璃', true); await d.getByRole('combobox', { name: '玻璃材质' }).selectOption('frosted');
    for (const name of ['玻璃折射强度', '玻璃色散', '透镜深度']) assert.equal(await d.getByRole('slider', { name, exact: true }).isDisabled(), true);
    for (const name of ['玻璃模糊', '玻璃弹性']) assert.equal(await d.getByRole('slider', { name, exact: true }).isEnabled(), true);
    assert.equal(await page.locator('feDisplacementMap').count(), 0); await range('玻璃模糊', 9); const s = await glassState(); assert.equal(s.effective, 'frosted'); assert.match(s.blur, /blur\(9px\)/); await capture('frosted-controls');
  });
  await check('重新载入记忆所有参数与未知字段，收藏原文和写入次数保持不变', async () => {
    const saved = await preferences(); await page.reload({ waitUntil: 'networkidle' }); assert.deepEqual(await preferences(), saved);
    await openSettings('背景与配色', true); const d = dialog();
    for (const [label, value] of [['视差幅度', 150], ['粒子密度', 100], ['背景明暗', 100], ['自定义色相', 123], ['流体色深', 70], ['流体流速', 40], ['流体涡旋', 30], ['流体扭曲', 60], ['笔刷力度', 0], ['笔刷半径', .05]]) assert.equal(await d.getByRole('slider', { name: label, exact: true }).inputValue(), String(value));
    for (const name of ['动态背景', '流体板', '星河']) assert.equal(await d.getByRole('checkbox', { name, exact: true }).isChecked(), true);
    await openSettings('导航玻璃', true); assert.equal(await d.getByRole('combobox', { name: '玻璃材质' }).inputValue(), 'frosted'); assert.equal(await d.getByRole('combobox', { name: '导航玻璃色调' }).inputValue(), 'deep-mint');
    for (const [label, value] of [['玻璃模糊', 9], ['玻璃折射强度', 100], ['玻璃色散', 0], ['透镜深度', 20], ['玻璃弹性', 0]]) assert.equal(await d.getByRole('slider', { name: label, exact: true }).inputValue(), String(value));
    await openSettings('操作按钮'); assert.equal(await d.getByRole('checkbox', { name: '操作按钮毛玻璃' }).isChecked(), true); assert.equal(await d.getByRole('slider', { name: '按钮模糊' }).inputValue(), '11'); assert.equal(await d.getByRole('slider', { name: '按钮不透明度' }).inputValue(), '65');
    assert.deepEqual(saved.background.futureBackground, { keep: '未来背景字段' }); assert.deepEqual(saved.glass.futureGlass, { keep: '未来玻璃字段' });
  });
  await check('重置精确恢复示例全部背景/玻璃默认并保留未知字段和外观', async () => {
    const before = await preferences(); await button('重置背景与玻璃', dialog()).click(); assert.equal(await dialog().locator('.settings-footer [role="status"]').textContent(), '已恢复示例默认背景与玻璃参数'); const saved = await preferences();
    assert.deepEqual(saved.background, { ...backgroundDefaults, futureBackground: before.background.futureBackground }); assert.deepEqual(saved.glass, { ...glassDefaults, futureGlass: before.glass.futureGlass }); assert.deepEqual(saved.appearance, before.appearance);
    await closeSettings(); await page.mouse.move(1000, 700); await page.waitForTimeout(400); const glass = await glassState(); assert.equal(glass.effective, 'liquid'); near(glass.sigma, 1.5, 'reset sigma'); near(glass.scales[0] / glass.scales[1], 1.02, 'reset dispersion'); assert.equal(await page.locator('html').getAttribute('data-glass-tint'), 'smoke'); assert.equal(await page.locator('.global-search > .glass-material__effect').evaluate(e => getComputedStyle(e).backgroundImage), 'none'); assert.deepEqual((await stats()).colors, expectedPalette(44, 'dark', 22)); await frames('重置后动态继续', true, true);
    await page.reload({ waitUntil: 'networkidle' }); assert.deepEqual(await preferences(), saved);
  });
  await dispose();
}
async function layouts(theme, width) {
  await prepare(theme, width); const prefix = `${theme}-${width}`;
  await check(`${prefix}：Dock选中材质填充与字色清楚区分`, async () => {
    if (width < 760) await button('打开菜单').click();
    const nav = page.getByRole('navigation', { name: '作品分类' }); const selected = nav.getByRole('button', { name: '游戏', exact: true }), idle = nav.getByRole('button', { name: '书籍', exact: true });
    const read = e => ({ color: getComputedStyle(e).color, fill: getComputedStyle(e.querySelector('.glass-material__effect')).backgroundColor, edge: getComputedStyle(e.querySelector('.glass-material__highlight')).boxShadow, current: e.getAttribute('aria-current') });
    const a = await selected.evaluate(read), b = await idle.evaluate(read); assert.equal(a.current, 'page'); assert.notEqual(a.fill, b.fill); assert.notEqual(a.color, b.color); const rgba = value => value.match(/[\d.]+/g).map(Number); const sa = rgba(a.fill), sb = rgba(b.fill); assert.ok((sa[3] ?? 1) >= (sb[3] ?? 1) + .15, JSON.stringify({ a, b })); report.dockSelection.push({ theme, width, selected: a, idle: b, alphaDelta: (sa[3] ?? 1) - (sb[3] ?? 1) }); await capture(`${prefix}-dock-selected`);
    if (width < 760) await button('关闭菜单').click();
  });
  await check(`${prefix}：四类设置完整可见、弹层与控件不横向溢出`, async () => {
    for (const section of ['背景与配色', '导航玻璃', '操作按钮', '数据与备份']) {
      const d = await openSettings(section, ['背景与配色', '导航玻璃'].includes(section)); const bounds = await d.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1); assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 1001);
      const content = await d.locator('.settings-content').evaluate(e => ({ width: e.clientWidth, scrollWidth: e.scrollWidth, h: e.clientHeight })); assert.ok(content.h > 100); assert.ok(content.scrollWidth <= content.width + 1, JSON.stringify({ section, content }));
      const outside = await d.locator('.settings-content input,.settings-content select,.settings-content button').evaluateAll(nodes => nodes.filter(e => e.offsetParent !== null).filter(e => { const r = e.getBoundingClientRect(), p = e.closest('.settings-content').getBoundingClientRect(); return r.left < p.left - 1 || r.right > p.right + 1; }).map(e => e.getAttribute('aria-label') || e.textContent)); assert.deepEqual(outside, []);
      await d.locator('.settings-content').evaluate(e => { e.scrollTop = 0; });
      await capture(`${prefix}-${section === '背景与配色' ? 'background' : section === '导航玻璃' ? 'glass' : section === '操作按钮' ? 'actions' : 'data'}`);
      if (section === '背景与配色') { await d.locator('.settings-content').evaluate(e => { e.scrollTop = e.scrollHeight; }); await capture(`${prefix}-background-advanced`); }
    }
    await closeSettings();
  });
  await check(`${prefix}：排序与玻璃原生下拉展开使用主题选项，箭头/Enter提交并恢复`, async () => {
    if (width < 760 && await button('关闭菜单').isVisible()) await button('关闭菜单').click();
    const sort = page.getByRole('combobox', { name: '排序方式', exact: true }); await sort.selectOption('recent'); await sort.click(); await page.waitForFunction(() => document.querySelector('select[aria-label="排序方式"]').matches(':open'));
    const sortPicker = await pickerState(sort); assert.equal(sortPicker.supported, true); assert.equal(sortPicker.appearance, 'base-select'); assert.equal(sortPicker.open, true); assert.equal(sortPicker.background, sortPicker.expectedBackground); assert.equal(sortPicker.ink, sortPicker.expectedInk); await capture(`${prefix}-sort-picker-open`);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); assert.equal(await sort.inputValue(), 'title'); assert.equal(await sort.evaluate(e => e.matches(':open')), false); await sort.selectOption('recent');
    const d = await openSettings('导航玻璃'), mode = d.getByRole('combobox', { name: '玻璃材质' }); await mode.selectOption('liquid'); await mode.click(); await page.waitForFunction(() => document.querySelector('select[aria-label="玻璃材质"]').matches(':open'));
    const glassPicker = await pickerState(mode); assert.equal(glassPicker.supported, true); assert.equal(glassPicker.appearance, 'base-select'); assert.equal(glassPicker.background, glassPicker.expectedBackground); assert.equal(glassPicker.ink, glassPicker.expectedInk); await capture(`${prefix}-glass-picker-open`);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); assert.equal(await mode.inputValue(), 'frosted'); assert.equal(await mode.evaluate(e => e.matches(':open')), false); assert.equal((await glassState()).effective, 'frosted'); await mode.selectOption('liquid'); assert.equal((await glassState()).effective, 'liquid'); await closeSettings(); report.runtime.push({ name: `${prefix}-native-select-theme`, sortPicker, glassPicker });
  });
  await check(`${prefix}：设置搜索自动展开高级、无结果可恢复、键盘焦点循环与Escape返回`, async () => {
    const d = await openSettings('背景与配色'), search = d.getByRole('textbox', { name: '搜索设置' }); await search.fill('笔刷'); assert.equal(await d.getByRole('slider', { name: '笔刷力度' }).isVisible(), true); assert.equal(await d.locator('details').evaluate(e => e.open), true);
    await search.fill('折射'); assert.equal(await d.getByRole('slider', { name: '玻璃折射强度' }).isVisible(), true); assert.equal(await d.getByRole('slider', { name: '笔刷力度' }).count(), 0);
    await search.fill('不存在的设置zzq'); await d.getByRole('heading', { name: '没有找到相关设置' }).waitFor(); assert.equal(await d.locator('.settings-section').count(), 0); await capture(`${prefix}-search-empty`); await button('清除搜索', d).click(); assert.equal(await search.inputValue(), ''); assert.equal(await d.getByRole('checkbox', { name: '动态背景' }).count(), 1);
    await openSettings('背景与配色'); await search.focus(); await page.keyboard.press('Shift+Tab'); assert.equal(await button('重置背景与玻璃', d).evaluate(e => document.activeElement === e), true); await page.keyboard.press('Tab'); assert.equal(await search.evaluate(e => document.activeElement === e), true);
    await page.keyboard.press('Escape'); await d.waitFor({ state: 'hidden' }); assert.equal(await dialog().count(), 0); assert.equal(await button('数据与设置').evaluate(e => document.activeElement === e), true);
  });
  await dispose();
}
async function legacyLightCompatibility() {
  await prepare('light', 1440);
  await check('旧light偏好启动兼容：保留原始偏好，深色渲染，不计入浅色视觉矩阵', async () => {
    const before = await page.evaluate(() => localStorage.getItem('qiyu.appearance.v1')); assert.equal(JSON.parse(before).mode, 'light'); assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark'); assert.deepEqual((await stats()).colors, expectedPalette(44, 'dark', 22));
    await openSettings('背景与配色'); assert.equal(await dialog().getByRole('combobox', { name: '外观模式' }).count(), 0); await closeSettings(); const palette = button('切换背景主题配色'); const expected = [210, 160, 268, 355, 44];
    for (const hue of expected) { await palette.click(); await page.waitForTimeout(480); assert.equal((await preferences()).background.paletteHue, hue); assert.deepEqual((await stats()).colors, expectedPalette(hue, 'dark', 22)); }
    assert.equal(await page.evaluate(() => localStorage.getItem('qiyu.appearance.v1')), before); assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark'); await page.reload({ waitUntil: 'networkidle' }); assert.equal(await page.evaluate(() => localStorage.getItem('qiyu.appearance.v1')), before); assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark'); report.compatibility = { originalAppearance: JSON.parse(before), effectiveTheme: 'dark', appearanceRewritten: false, dockPaletteCycle: expected, countsAsLightVisualValidation: false };
  });
  await dispose();
}
async function defaultTintPreviews() {
  await prepare('dark', 1440);
  await check('默认深色背景下的深薄荷与香槟玻璃预览，保留折射和收藏原文', async () => {
    for (const tint of ['deep-mint', 'champagne']) {
      const d = await openSettings('导航玻璃'); await d.getByRole('combobox', { name: '导航玻璃色调' }).selectOption(tint); await closeSettings(); await page.mouse.move(1000, 700); await page.waitForTimeout(300);
      assert.equal(await page.locator('html').getAttribute('data-glass-tint'), tint); assert.equal((await glassState()).effective, 'liquid'); assert.ok((await glassState()).scales.every(value => value > 0)); assert.deepEqual((await stats()).colors, expectedPalette(44, 'dark', 22)); await capture(`dark-1440-${tint}-default-preview`);
    }
  });
  await dispose();
}
(async () => {
  try { base = await serve(); browser = await chromium.launch({ channel: 'msedge', headless: true }); if (process.argv.includes('--tint-preview-only')) await defaultTintPreviews(); else { await parameters(); for (const width of [1440, 390]) await layouts('dark', width); await legacyLightCompatibility(); } assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.resourceErrors, []); report.passed = true; }
  catch (error) { report.failure = { stage, message: error.stack }; process.exitCode = 1; }
  finally { if (page && report.failure) await capture('failure').catch(() => {}); await dispose().catch(() => {}); if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); if (report.passed && fs.existsSync(path.join(output, 'failure.png'))) fs.unlinkSync(path.join(output, 'failure.png')); report.timestamp = new Date().toISOString(); const reportName = process.argv.includes('--tint-preview-only') ? 'tint-preview-validation.json' : 'validation.json'; fs.writeFileSync(path.join(output, reportName), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, screenshots: report.screenshots.length, integrity: report.integrity.length, report: path.join(output, reportName), failure: report.failure })); }
})();
