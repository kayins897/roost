const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const reference = path.join(root, 'design/mineradio-reference/index.html');
const version = require('../package.json').version;
const output = path.join(root, 'evidence', `material-reference-v${version.replaceAll('.', '')}`);
const sha = value => createHash('sha256').update(value).digest('hex');
const report = { passed: false, version, isolatedDataOnly: true, userLibraryAccessed: false, checks: [], screenshots: [], integrity: [], materials: [], motion: [], pageErrors: [], consoleErrors: [], resourceErrors: [], notes: ['全新 Edge 上下文及合成收藏；没有读取真实 AppData。', '暂停恢复同时检查 WebGL drawArrays 计数与画布变化；文档隐藏为隔离浏览器的可见性信号模拟，不等同于 Windows 原生最小化。', '原示例与应用保留独立截图和短视频；材质参数直接检查发行构建 SVG/CSS，不用像素一致冒充不同布局完全相同。'] };
report.scope = process.argv.includes('--preview-only') ? 'preview-only' : process.argv.includes('--debug-dispatch') ? 'diagnostic-synthetic-media-events-not-final' : process.argv.includes('--lifecycle-only') ? 'lifecycle-only' : 'full';
report.visualScope = { themes: ['dark'], widths: [1440, 390], reason: '当前界面采用深色专注模式' };
report.referenceSha256 = sha(fs.readFileSync(reference));
report.distAssets = [...fs.readFileSync(path.join(dist, 'index.html'), 'utf8').matchAll(/(?:src|href)="((?:\.\/|\/)?assets\/[^\"]+\.(?:js|css))"/g)].map(m => ({ path: m[1], sha256: sha(fs.readFileSync(path.join(dist, m[1]))) }));
const fixture = { schemaVersion: 1, futureRoot: { keep: ['未知扩展'] }, items: Array.from({ length: 36 }, (_, i) => ({ id: `material-${i}`, category: 'game', title: `材质验收 ${String(i + 1).padStart(2, '0')}`, subcategory: 'Steam', platforms: ['Steam'], status: i % 3 === 0 ? 'finished' : 'want', gamePlayState: i % 3 === 0 ? 'cleared' : 'want', personalGrade: i % 3 === 0 ? 'S' : undefined, creator: '隔离合成作品', year: '2026', tags: ['保留标签'], gameTags: { gameplay: ['冒险'], theme: [], scenario: [], other: [] }, impression: '个人印象必须保持原文。', playtimeMinutes: 87 + i, favorite: false, artwork: 'outer', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', futureItem: { keep: i } })) };
let browser, server, base, page, context, baseline, mediaSession, stage = '';
fs.mkdirSync(output, { recursive: true });
async function serve() {
  const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (url.pathname === '/__init') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>Isolated material fixture</title>'); }
    let file;
    try { file = url.pathname === '/__reference' ? reference : path.resolve(dist, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)); } catch { res.writeHead(400); return res.end(); }
    if ((file !== reference && !file.startsWith(dist + path.sep)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return `http://127.0.0.1:${server.address().port}`;
}
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
async function check(name, run) { stage = name; await run(); report.checks.push(name); console.log(`PASS ${name}`); }
async function capture(name) { if (process.argv.includes('--debug-no-shots')) return; await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled', caret: 'hide' }); report.screenshots.push(`${name}.png`); }
async function unchanged(name) { const raw = await page.evaluate(() => localStorage.getItem('qiyu.library.v1')); const same = raw === baseline; report.integrity.push({ name, same, beforeSha256: sha(baseline), afterSha256: sha(raw || '') }); assert.equal(raw, baseline, name); }
async function prepare(theme = 'dark', width = 1440, options = {}) {
  context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme, reducedMotion: 'no-preference', ...(options.video ? { recordVideo: { dir: output, size: { width: 1440, height: 1000 } } } : {}) });
  await context.addInitScript(({ denyGl }) => {
    window.__materialStats = { draws: 0, colors: {}, locations: 0, canvasFrames: 0 };
    if (location.search.includes('debug-media')) {
      const originalMedia = window.matchMedia.bind(window); window.__materialQueries = []; window.__materialMediaEvents = [];
      window.matchMedia = query => { const q = originalMedia(query), id = window.__materialQueries.length; window.__materialQueries.push(q); q.addEventListener('change', event => window.__materialMediaEvents.push({ id, media: event.media, value: event.matches })); return q; };
    }
    const names = new WeakMap();
    for (const ctor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!ctor) continue;
      const proto = ctor.prototype;
      for (const method of ['getUniformLocation', 'uniform4f', 'drawArrays']) {
        const original = proto[method];
        proto[method] = function (...args) {
          if (this.canvas.classList.contains('ambient-scene__fluid')) {
            if (method === 'getUniformLocation') { const location = original.apply(this, args); if (location) names.set(location, args[1]); return location; }
            if (method === 'uniform4f' && names.has(args[0])) window.__materialStats.colors[names.get(args[0])] = args.slice(1);
            if (method === 'drawArrays') window.__materialStats.draws++;
          }
          return original.apply(this, args);
        };
      }
    }
    if (denyGl) { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return /webgl/i.test(kind) ? null : original.call(this, kind, ...args); }; }
  }, { denyGl: options.denyGl || false });
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => report.pageErrors.push({ stage, message: e.message }));
  page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push({ stage, text: m.text() }); });
  page.on('response', r => { if (r.status() >= 400) report.resourceErrors.push({ stage, status: r.status(), url: r.url() }); });
  await page.route('**/*', route => route.request().url().startsWith(base) || route.request().url().startsWith('data:') ? route.continue() : route.abort('blockedbyclient'));
  await page.goto(`${base}/__init`);
  baseline = await page.evaluate(({ fixture, theme, animated }) => {
    const c = document.createElement('canvas'); c.width = 240; c.height = 360; const p = c.getContext('2d'); const g = p.createLinearGradient(0, 0, 240, 360); g.addColorStop(0, '#213b52'); g.addColorStop(1, '#4f3057'); p.fillStyle = g; p.fillRect(0, 0, 240, 360); p.fillStyle = '#f4d28a'; p.font = 'bold 64px sans-serif'; p.fillText('QIYU', 25, 200);
    fixture.items.forEach(item => { item.coverUrl = c.toDataURL('image/png'); }); const raw = JSON.stringify(fixture); localStorage.setItem('qiyu.library.v1', raw);
    localStorage.setItem('qiyu.appearance.v1', JSON.stringify({ mode: theme })); localStorage.setItem('qiyu.background.v1', JSON.stringify({ enabled: animated, hue: 33, strength: 60, depth: 22, speed: 14, swirl: 12, futurePreference: '保留扩展' })); localStorage.setItem('qiyu.glass.v1', JSON.stringify({ mode: 'liquid', refraction: 100 })); return raw;
  }, { fixture, theme, animated: options.animated ?? false });
  await page.goto(base + (process.argv.includes('--debug-media') ? '?debug-media' : ''), { waitUntil: 'networkidle' }); await page.getByRole('heading', { name: '游戏', exact: true }).waitFor(); await page.evaluate(() => document.fonts.ready);
  await button('全部游戏', page.locator('.library-views')).click();
  await page.waitForFunction(() => document.querySelector('.sidebar-dock')?.dataset.glassEffective);
}
async function dispose() { if (context) await context.close(); context = null; mediaSession = null; }
async function openMenu() { const opener = button('打开菜单'); if (await opener.isVisible() && await opener.getAttribute('aria-expanded') !== 'true') await opener.click(); }
async function settings(section = '导航玻璃', advanced = true) {
  if (await page.getByRole('dialog', { name: '数据与设置', exact: true }).count() === 0) { await openMenu(); await button('数据与设置').click(); }
  const d = page.getByRole('dialog', { name: '数据与设置', exact: true });
  await d.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: section, exact: true }).click();
  if (advanced && ['导航玻璃', '背景与配色'].includes(section)) {
    const details = d.locator('details.settings-advanced');
    if (!await details.evaluate(e => e.open)) await details.locator('summary').click();
  }
  return d;
}
async function closeSettings() { const d = page.getByRole('dialog', { name: '数据与设置', exact: true }); await button('关闭', d).click(); }
async function stats() { return page.evaluate(() => ({ ...window.__materialStats, colors: { ...window.__materialStats.colors }, scene: { ...document.querySelector('.ambient-scene').dataset }, media: { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, reducedTransparency: matchMedia('(prefers-reduced-transparency: reduce)').matches }, queries: window.__materialQueries?.map((q, i) => ({ i, media: q.media, value: q.matches })), events: window.__materialMediaEvents })); }
async function stopped(name) { await page.waitForTimeout(200); const a = await stats(); await page.waitForTimeout(650); const b = await stats(); report.motion.push({ name, before: a, after: b }); assert.equal(b.draws, a.draws, name + JSON.stringify({ a, b })); }
async function moving(name) { const a = await stats(); await page.waitForTimeout(650); const b = await stats(); assert.ok(b.draws > a.draws, name); report.motion.push({ name, before: a, after: b }); }
async function media(features) { const motion = features.find(f => f.name === 'prefers-reduced-motion'); if (motion) await page.emulateMedia({ reducedMotion: motion.value }); else { mediaSession ??= await context.newCDPSession(page); await mediaSession.send('Emulation.setEmulatedMedia', { features }); } await page.waitForTimeout(200); if (process.argv.includes('--debug-dispatch')) await page.evaluate(() => window.__materialQueries?.forEach(q => q.dispatchEvent(new Event('change')))); }
async function visibleTooltips() {
  const game = button('游戏'); await game.hover(); await page.waitForTimeout(350);
  const state = await game.evaluate(e => { const pseudo = getComputedStyle(e, '::after'); const clips = []; for (let p = e; p && !p.matches('.sidebar'); p = p.parentElement) { const s = getComputedStyle(p); if (/hidden|clip/.test(s.overflowX)) clips.push(p.className); } return { content: pseudo.content, opacity: Number(pseudo.opacity), visibility: pseudo.visibility, clips }; });
  assert.equal(state.visibility, 'visible'); assert.equal(state.opacity, 1); assert.equal(state.clips.length, 0, JSON.stringify(state)); return state;
}
async function layouts(theme, width) {
  await prepare(theme, width); const prefix = `${theme}-${width}`;
  await check(`${prefix}：Dock提示/材质分层/搜索输入与清除`, async () => {
    if (width < 760) await openMenu(); await visibleTooltips(); await capture(`${prefix}-dock-hover`);
    const materials = await page.locator('[data-material-glass]').evaluateAll(hosts => hosts.map(host => ({ kind: host.dataset.materialGlass, effective: host.dataset.glassEffective, overflow: getComputedStyle(host).overflow, backdrop: getComputedStyle(host).backdropFilter, effects: host.querySelectorAll(':scope > .glass-material__effect').length, highlights: host.querySelectorAll(':scope > .glass-material__highlight').length })));
    assert.ok(materials.length >= 9); for (const value of materials) { assert.equal(value.effects, 1); assert.equal(value.highlights, 1); assert.equal(value.backdrop, 'none'); assert.equal(value.effective, 'liquid'); } report.materials.push({ theme, width, materials });
    if (width < 760) await button('关闭菜单').click(); const search = page.getByRole('textbox', { name: '搜索收藏', exact: true }); await search.fill('材质验收 01'); assert.equal(await page.locator('.media-card').count(), 1); await button('清除搜索').click(); assert.equal(await search.inputValue(), '');
  });
  await check(`${prefix}：中央详情与设置布局/按钮清晰`, async () => {
    await button('查看材质验收 01详情').click(); const detail = page.getByRole('dialog', { name: '材质验收 01详情', exact: true }); const box = await detail.boundingBox(); assert.ok(box && box.x >= -1 && box.x + box.width <= width + 1); await capture(`${prefix}-detail`); await button('关闭详情', detail).click();
    const d = await settings(); const box2 = await d.boundingBox(); assert.ok(box2 && box2.x >= -1 && box2.x + box2.width <= width + 1); assert.equal(await d.getByRole('combobox', { name: '玻璃材质' }).inputValue(), 'liquid'); await capture(`${prefix}-settings`); await closeSettings();
  });
  await check(`${prefix}：独立回顶按钮保持圆形居中与搜索焦点`, async () => {
    await page.locator('.main-scroll').evaluate(e => { e.scrollTop = 1200; }); if (width < 760) await openMenu(); const back = button('回到顶部'); await back.waitFor({ state: 'visible' }); await page.waitForTimeout(300); const a = await back.boundingBox(), b = await page.locator('.sidebar-dock').boundingBox(); assert.ok(Math.abs(a.width - a.height) < 1); assert.ok(Math.abs(a.x + a.width / 2 - b.x - b.width / 2) < 4); assert.ok(a.y >= b.y + b.height); await capture(`${prefix}-back-top`); await back.click(); await page.waitForFunction(() => document.querySelector('.main-scroll').scrollTop <= 1); assert.equal(await page.getByRole('textbox', { name: '搜索收藏' }).evaluate(e => document.activeElement === e), true);
  });
  await unchanged(`${prefix}浏览与偏好不写收藏`); await dispose();
}
async function parametersAndLifecycle() {
  await prepare();
  await check('参考参数：sigma1.5/亮度1.1/色散±2%与1px+2px遮罩环', async () => {
    const params = await page.locator('.global-search').evaluate(host => { const effect = host.querySelector('.glass-material__effect'), h = host.querySelector('.glass-material__highlight'); const id = effect.style.backdropFilter.match(/#([^)"]+)/)[1]; const f = document.getElementById(id); return { background: getComputedStyle(effect).backgroundColor, sigma: Number(f.querySelector('feGaussianBlur').getAttribute('stdDeviation')), brightness: [...f.querySelectorAll('feFuncR,feFuncG,feFuncB')].map(n => Number(n.getAttribute('slope'))), scales: [...f.querySelectorAll('feDisplacementMap')].map(n => Number(n.getAttribute('scale'))), before: { padding: getComputedStyle(h, '::before').padding, mask: getComputedStyle(h, '::before').maskComposite }, after: { padding: getComputedStyle(h, '::after').padding, mask: getComputedStyle(h, '::after').maskComposite } }; });
    assert.equal(params.sigma, 1.5); assert.deepEqual(params.brightness, [1.1, 1.1, 1.1]); assert.ok(Math.abs(params.scales[0] / params.scales[1] - 1.02) < .0001); assert.ok(Math.abs(params.scales[2] / params.scales[1] - .98) < .0001); assert.equal(params.before.padding, '1px'); assert.equal(params.after.padding, '2px'); assert.ok(params.before.mask.includes('exclude')); assert.ok(params.after.mask.includes('exclude')); assert.equal(params.background, 'rgba(18, 20, 26, 0.2)'); report.materials.push({ parameters: params });
  });
  await check('零折射端点：全部SVG位移有效且零强度', async () => {
    const d = await settings(); await d.getByRole('slider', { name: '玻璃折射强度' }).fill('0'); await closeSettings(); await page.mouse.move(700, 500); await page.waitForTimeout(300); const scales = await page.locator('feDisplacementMap').evaluateAll(nodes => nodes.map(n => Number(n.getAttribute('scale')))); assert.ok(scales.length >= 6); assert.ok(scales.every(n => Number.isFinite(n) && n === 0)); const d2 = await settings(); await d2.getByRole('slider', { name: '玻璃折射强度' }).fill('100'); await closeSettings();
  });
  await check('静态流体改色相与色深：实际GL调色更新且没有持续帧', async () => {
    await stopped('用户关闭动态'); const before = await stats(); assert.ok(before.scene.fluidAvailable === 'true', '本机Edge必须支持WebGL2'); const d = await settings('背景与配色'); await button('紫罗兰', d).click(); await page.waitForTimeout(100); const hue = await stats(); assert.notDeepEqual(hue.colors, before.colors); assert.ok(hue.draws > before.draws); await d.getByRole('slider', { name: '流体色深' }).fill('70'); await page.waitForTimeout(100); const depth = await stats(); assert.notDeepEqual(depth.colors, hue.colors); assert.ok(depth.draws > hue.draws); assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('qiyu.background.v1')).futurePreference), '保留扩展'); await capture('static-violet-depth70'); await closeSettings(); await stopped('静态调色后无持续帧');
  });
  await check('减少动态实时降级玻璃/停止流体，恢复后继续流动', async () => {
    const d = await settings('背景与配色'); await d.getByRole('checkbox', { name: '动态背景' }).check(); await closeSettings(); await moving('动态开启'); await page.locator('.global-search').hover({ position: { x: 80, y: 12 } }); await page.waitForTimeout(500);
    await media([{ name: 'prefers-reduced-motion', value: 'reduce' }]); await page.waitForFunction(() => document.querySelector('.sidebar-dock').dataset.glassEffective === 'frosted'); await stopped('减少动态停止WebGL'); const translation = await page.locator('[data-material-glass]').evaluateAll(nodes => nodes.map(e => e.style.translate)); assert.ok(translation.every(n => n === '' || n === 'none')); await capture('reduced-motion'); await media([{ name: 'prefers-reduced-motion', value: 'no-preference' }]); await page.waitForFunction(() => document.querySelector('.sidebar-dock').dataset.glassEffective === 'liquid'); await moving('减少动态关闭后恢复');
  });
  await check('减少透明度实时关闭折射和流体，恢复后自动恢复', async () => {
    await media([{ name: 'prefers-reduced-transparency', value: 'reduce' }]); assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches), true); await page.waitForFunction(() => document.querySelector('.sidebar-dock').dataset.glassEffective === 'solid'); const backdrops = await page.locator('.glass-material__effect').evaluateAll(nodes => nodes.map(e => getComputedStyle(e).backdropFilter)); assert.ok(backdrops.every(n => n === 'none')); await stopped('减少透明度停止WebGL'); assert.equal((await stats()).scene.fluid, 'off'); await capture('reduced-transparency'); await media([{ name: 'prefers-reduced-transparency', value: 'no-preference' }]); await moving('透明度恢复后WebGL继续');
  });
  await check('文档隐藏与恢复：玻璃复位且真实GL计数停止/恢复', async () => {
    await page.evaluate(() => { window.__testHidden = true; Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__testHidden }); document.dispatchEvent(new Event('visibilitychange')); }); await stopped('文档隐藏停止'); assert.equal((await stats()).scene.motion, 'paused'); await page.evaluate(() => { window.__testHidden = false; document.dispatchEvent(new Event('visibilitychange')); }); await moving('文档显示恢复');
  });
  await check('WebGL上下文丢失显示回退、恢复重建并继续绘制', async () => {
    const available = await page.locator('.ambient-scene__fluid').evaluate(c => { const gl = c.getContext('webgl2'); const ext = gl.getExtension('WEBGL_lose_context'); window.__lostContextExtension = ext; if (ext) ext.loseContext(); return Boolean(ext); }); assert.ok(available, 'Edge测试需要WEBGL_lose_context'); await page.waitForFunction(() => document.querySelector('.ambient-scene').dataset.fluid === 'off'); await stopped('上下文丢失后停止GL'); await capture('context-lost-fallback'); await page.evaluate(() => window.__lostContextExtension.restoreContext()); await page.waitForFunction(() => document.querySelector('.ambient-scene').dataset.fluid === 'on'); await moving('上下文恢复后继续GL'); await capture('context-restored');
  });
  await check('磨砂模式保留环形材质，不留任何液态SVG折射', async () => { const d = await settings(); await d.getByRole('combobox', { name: '玻璃材质' }).selectOption('frosted'); await closeSettings(); assert.equal(await page.locator('feDisplacementMap').count(), 0); assert.equal(await page.locator('.sidebar-dock').getAttribute('data-glass-effective'), 'frosted'); await capture('frosted-mode'); });
  await unchanged('全部材质和生命周期调整保留收藏原文'); await dispose();
  await prepare('dark', 1440, { denyGl: true }); await check('无WebGL环境回退，作品库与搜索仍可操作', async () => { assert.equal((await stats()).scene.fluid, 'off'); const s = page.getByRole('textbox', { name: '搜索收藏' }); await s.fill('材质验收 02'); assert.equal(await page.locator('.media-card').count(), 1); await capture('no-webgl-fallback'); await unchanged('WebGL不可用不写收藏'); }); await dispose();
}
async function videos() {
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: output, size: { width: 1440, height: 1000 } } }); page = await context.newPage(); await page.goto(`${base}/__reference`); await page.waitForTimeout(800); await capture('reference-original'); const refParams = await page.locator('#mr-pane-liquid').evaluate(e => { const effect = e.querySelector('.ngs-effect'), id = effect.style.backdropFilter.match(/#([^)"]+)/)[1], f = document.getElementById(id); return { sigma: f.querySelector('feGaussianBlur').getAttribute('stdDeviation'), scales: [...f.querySelectorAll('feDisplacementMap')].map(n => n.getAttribute('scale')), background: getComputedStyle(effect).backgroundColor }; }); report.materials.push({ referenceParameters: refParams }); const a = await page.locator('#mr-pane-liquid').boundingBox(); await page.mouse.move(a.x + 20, a.y + 20); await page.waitForTimeout(800); await capture('reference-original-hover'); await page.mouse.move(a.x + a.width - 20, a.y + a.height - 20, { steps: 24 }); await page.waitForTimeout(1200); const refVideo = page.video(); await dispose(); await refVideo.saveAs(path.join(output, 'reference-original.webm'));
  await prepare('dark', 1440, { animated: true, video: true }); await page.waitForTimeout(500); await capture('application-final'); await page.mouse.move(1000, 650, { steps: 25 }); await page.waitForTimeout(600); await page.mouse.move(32, 220, { steps: 30 }); await page.waitForTimeout(600); await page.locator('.global-search').hover({ position: { x: 160, y: 18 } }); await page.waitForTimeout(700); await capture('application-final-hover'); await page.mouse.move(1100, 700, { steps: 25 }); await page.waitForTimeout(700); await unchanged('预览视频不写收藏'); const appVideo = page.video(); await dispose(); await appVideo.saveAs(path.join(output, 'application-final.webm')); report.videos = ['reference-original.webm', 'application-final.webm'];
}
(async () => {
  try { base = await serve(); browser = await chromium.launch({ channel: 'msedge', headless: true }); if (!process.argv.includes('--preview-only')) { if (!process.argv.includes('--lifecycle-only')) for (const width of [1440, 390]) await layouts('dark', width); await parametersAndLifecycle(); } if (!process.argv.includes('--lifecycle-only')) await check('原始demo与应用截图/动态视频留证', videos); assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.resourceErrors, []); report.passed = true; }
  catch (error) { report.failure = { stage, message: error.stack }; process.exitCode = 1; }
  finally { await dispose().catch(() => {}); if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); report.timestamp = new Date().toISOString(); const file = process.argv.includes('--preview-only') ? 'preview-validation.json' : process.argv.includes('--debug-dispatch') ? 'validation-debug-dispatch.json' : 'validation.json'; fs.writeFileSync(path.join(output, file), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, screenshots: report.screenshots.length, integrity: report.integrity.length, report: path.join(output, file), failure: report.failure })); }
})();
