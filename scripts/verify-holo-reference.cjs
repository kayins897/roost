/* Standalone browser verification. Never launches the production app or touches its library. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright'); }
catch (error) {
  if (process.env.PLAYWRIGHT_PACKAGE) throw error;
  // A linked worktree can explicitly point at the owner's existing local dependencies.
  throw new Error('Playwright is unavailable. Run npm ci, or set PLAYWRIGHT_PACKAGE to an existing playwright package directory.');
}
const { chromium } = playwright;

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'design', 'holo-card-reference');
const evidence = path.resolve(process.env.HOLO_EVIDENCE_DIR || path.join(root, 'evidence', 'holo-reference-facets'));
const report = { startedAt: new Date().toISOString(), browser: '', checks: [], diagnostics: [], limits: [
  'Uses headless Edge with SwiftShader; this is functional verification, not device GPU performance measurement.',
  'Hidden-page behavior is tested with a synthetic document.hidden getter and visibilitychange event because headless Edge keeps background tabs visible.',
  'Reference-video fidelity, filled triangle-facet shape, and artistic restraint require visual comparison; pixel differences reported here do not certify them.'
] };
const kinds = ['foil', 'holo', 'poly'];
let browser, server;

async function check(name, fn) {
  try { const detail = await fn(); report.checks.push({ name, pass: true, detail: detail ?? null }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, pass: false, error: error.stack || String(error) }); console.log(`FAIL ${name}: ${error.message}`); }
}

async function setupPage(context, base, options = {}) {
  const page = await context.newPage();
  const audit = { requests: [], consoleErrors: [], pageErrors: [] };
  page.on('request', request => audit.requests.push({ url: request.url(), method: request.method(), type: request.resourceType() }));
  page.on('pageerror', error => audit.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') audit.consoleErrors.push(message.text()); });
  await page.addInitScript(({ noWebGL }) => {
    const verify = window.__holoVerify = { storageWrites: [], draws: 0, rafs: 0, captured: {} };
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { verify.storageWrites.push({ key, value }); return originalSetItem.call(this, key, value); };
    const originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => originalRaf.call(window, time => { verify.rafs++; callback(time); });
    const originalDraw = WebGLRenderingContext.prototype.drawArrays;
    WebGLRenderingContext.prototype.drawArrays = function (...args) { verify.draws++; return originalDraw.apply(this, args); };
    if (noWebGL) {
      const originalGet = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /^(webgl|experimental-webgl|webgl2)$/.test(type) ? null : originalGet.call(this, type, ...args); };
    }
    verify.read = kind => {
      const canvas = document.querySelector(`[data-kind="${kind}"] canvas`);
      const gl = canvas.getContext('webgl');
      if (!gl) return null;
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const upright = new Uint8Array(pixels.length);
      for (let row = 0; row < canvas.height; row++) upright.set(pixels.subarray(row * canvas.width * 4, (row + 1) * canvas.width * 4), (canvas.height - row - 1) * canvas.width * 4);
      return upright;
    };
    verify.capture = name => {
      const result = {};
      verify.captured[name] = {};
      for (const kind of ['foil', 'holo', 'poly']) {
        const pixels = verify.read(kind); verify.captured[name][kind] = pixels;
        if (!pixels) { result[kind] = null; continue; }
        let min = 255, max = 0, sum = 0, hash = 2166136261;
        const values = new Set();
        for (let i = 0; i < pixels.length; i += 16) for (let channel = 0; channel < 3; channel++) {
          const v = pixels[i + channel]; min = Math.min(min, v); max = Math.max(max, v); sum += v;
          hash = Math.imul(hash ^ v, 16777619) >>> 0; values.add(v);
        }
        result[kind] = { hash: hash.toString(16), min, max, values: values.size, mean: sum / (pixels.length / 16 * 3) };
      }
      return result;
    };
    verify.difference = (first, second, firstKind, secondKind = firstKind) => {
      const a = verify.captured[first][firstKind], b = verify.captured[second][secondKind];
      let sum = 0, changed = 0, count = 0;
      for (let i = 0; i < a.length; i += 16) for (let channel = 0; channel < 3; channel++) {
        const d = Math.abs(a[i + channel] - b[i + channel]); sum += d; if (d > 2) changed++; count++;
      }
      return { meanAbsolute: sum / count, changedFraction: changed / count };
    };
    verify.uniform = (kind, name) => {
      const gl = document.querySelector(`[data-kind="${kind}"] canvas`).getContext('webgl');
      return Array.from([gl.getUniform(gl.getParameter(gl.CURRENT_PROGRAM), gl.getUniformLocation(gl.getParameter(gl.CURRENT_PROGRAM), name))]).flatMap(v => ArrayBuffer.isView(v) ? Array.from(v) : v);
    };
  }, options);
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__deck);
  return { page, audit };
}

const capture = (page, name) => page.evaluate(name => window.__holoVerify.capture(name), name);
const delta = (page, a, b, kind, otherKind) => page.evaluate(args => window.__holoVerify.difference(...args), [a, b, kind, otherKind || kind]);
const counters = page => page.evaluate(() => ({ draws: window.__holoVerify.draws, rafs: window.__holoVerify.rafs }));
async function settle(page, milliseconds = 350) { await page.waitForTimeout(milliseconds); }
async function inputRange(page, id, value) { await page.locator(`#${id}`).fill(String(value)); await page.locator(`#${id}`).dispatchEvent('input'); await settle(page, 60); }
async function pause(page) { if (await page.locator('#motion').getAttribute('aria-pressed') === 'true') await page.locator('#motion').click(); await page.mouse.move(1, 1); await settle(page, 900); }
async function play(page) { if (await page.locator('#motion').getAttribute('aria-pressed') === 'false') await page.locator('#motion').click(); await settle(page, 120); }
async function materialUniforms(page, strength, filter) {
  const actual = await page.evaluate(() => Object.fromEntries(['foil', 'holo', 'poly'].map(kind => [kind, {
    strength: window.__holoVerify.uniform(kind, 'uStrength')[0],
    filter: window.__holoVerify.uniform(kind, 'uFilter')[0]
  }])));
  for (const kind of kinds) {
    assert.ok(typeof actual[kind].strength === 'number' && Math.abs(actual[kind].strength - strength) < .001, `${kind}: uStrength=${actual[kind].strength}, expected ${strength}`);
    assert.ok(typeof actual[kind].filter === 'number' && Math.abs(actual[kind].filter - filter) < .001, `${kind}: uFilter=${actual[kind].filter}, expected ${filter}`);
  }
  return actual;
}

(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const allowed = new Map([['/', 'index.html'], ['/index.html', 'index.html'], ['/holo.css', 'holo.css'], ['/holo.js', 'holo.js'], ['/shaders.js', 'shaders.js'], ['/fixtures.js', 'fixtures.js']]);
  report.sourceHashes = Object.fromEntries([...new Set(allowed.values())].map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(source, file))).digest('hex')]));
  server = http.createServer((request, response) => {
    const file = allowed.get(new URL(request.url, 'http://localhost').pathname);
    if (!file) { response.writeHead(request.url === '/favicon.ico' ? 204 : 404).end(); return; }
    response.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8');
    response.end(fs.readFileSync(path.join(source, file)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  report.browser = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1120 }, deviceScaleFactor: 1 });
  const { page, audit } = await setupPage(context, base);

  await check('Default settings, live WebGL, and nonempty pixels', async () => {
    assert.equal(await page.locator('#strength').inputValue(), '65');
    assert.equal(await page.locator('#filter').inputValue(), '55');
    assert.equal(await page.locator('#speed').inputValue(), '35');
    assert.equal(await page.locator('#etching').isChecked(), true);
    assert.deepEqual(await page.evaluate(() => window.__deck.snapshot().failed), []);
    await materialUniforms(page, .65, .55);
    const result = await capture(page, 'live');
    for (const kind of kinds) { assert.ok(result[kind].values > 100, `${kind} pixel variation`); assert.ok(result[kind].max - result[kind].min > 100, `${kind} pixel range`); }
    const before = await counters(page); await settle(page, 250); const after = await counters(page);
    assert.ok(after.draws > before.draws, 'Default preview animates');
    return result;
  });

  await check('Pause and resume control actual draws', async () => {
    await pause(page); const before = await counters(page); await settle(page, 250); const after = await counters(page);
    assert.deepEqual(after, before, 'Paused, settled preview stops requesting frames');
    await page.locator('#motion').click(); await settle(page, 180); assert.ok((await counters(page)).draws > after.draws);
    await pause(page); return { stopped: before, resumed: true };
  });

  await check('Original view equals source and all three materials remain distinct', async () => {
    await page.locator('#compare').click(); await settle(page, 100); await capture(page, 'original');
    await materialUniforms(page, 0, 0);
    assert.equal(await page.locator('#strength').inputValue(), '65');
    assert.equal(await page.locator('#filter').inputValue(), '55');
    const errors = await page.evaluate(() => {
      const source = window.HoloFixtures.cover().getContext('2d').getImageData(0, 0, 480, 720).data;
      return Object.fromEntries(['foil', 'holo', 'poly'].map(kind => {
        const pixels = window.__holoVerify.captured.original[kind]; let error = 0, count = 0;
        for (let i = 0; i < source.length; i += 16) for (let c = 0; c < 3; c++) { error += Math.abs(source[i + c] - pixels[i + c]); count++; }
        return [kind, error / count];
      }));
    });
    for (const error of Object.values(errors)) assert.ok(error < 0.5, `Original-source error ${error}`);
    await page.screenshot({ path: path.join(evidence, 'original-1440.png'), fullPage: true });
    await page.locator('#compare').click(); await settle(page, 80); const result = await capture(page, 'default');
    await materialUniforms(page, .65, .55);
    assert.equal(new Set(Object.values(result).map(item => item.hash)).size, 3);
    const differences = {};
    for (const kind of kinds) { differences[kind] = await delta(page, 'original', 'default', kind); assert.ok(differences[kind].meanAbsolute > 2, `${kind} materially differs from original`); }
    for (const [a, b] of [['foil', 'holo'], ['foil', 'poly'], ['holo', 'poly']]) assert.ok((await delta(page, 'default', 'default', a, b)).meanAbsolute > 2, `${a}/${b} differ`);
    await page.screenshot({ path: path.join(evidence, 'materials-1440.png'), fullPage: true });
    return { errors, differences };
  });

  await check('With filter off, texture strength 0, 20, 65, 100 produces ordered differences', async () => {
    const results = {};
    await inputRange(page, 'filter', 0);
    for (const amount of [0, 20, 65, 100]) { await inputRange(page, 'strength', amount); await capture(page, `strength-${amount}`); }
    for (const kind of kinds) {
      results[kind] = {};
      for (const amount of [0, 20, 65, 100]) results[kind][amount] = (await delta(page, 'original', `strength-${amount}`, kind)).meanAbsolute;
      assert.ok(results[kind][0] < 0.5);
      assert.ok(results[kind][20] > 1);
      assert.ok(results[kind][65] > results[kind][20] * 1.5);
      assert.ok(results[kind][100] > results[kind][65] * 1.2);
    }
    await inputRange(page, 'strength', 65); await inputRange(page, 'filter', 55); return results;
  });

  await check('Texture and base-colour filter operate independently, with both zero matching original', async () => {
    const result = {};
    await inputRange(page, 'filter', 0); await capture(page, 'texture-only');
    await materialUniforms(page, .65, 0);
    assert.equal(await page.locator('#strength').inputValue(), '65');
    await page.screenshot({ path: path.join(evidence, 'texture-only-1440.png'), fullPage: true });
    await inputRange(page, 'strength', 0); await inputRange(page, 'filter', 55); await capture(page, 'filter-only');
    await materialUniforms(page, 0, .55);
    assert.equal(await page.locator('#strength').inputValue(), '0');
    await page.screenshot({ path: path.join(evidence, 'filter-only-1440.png'), fullPage: true });
    await inputRange(page, 'filter', 100); await capture(page, 'filter-full');
    await inputRange(page, 'filter', 0); await capture(page, 'both-zero');
    await materialUniforms(page, 0, 0);
    for (const kind of kinds) {
      result[kind] = {
        textureOnly: await delta(page, 'original', 'texture-only', kind),
        filterOnly: await delta(page, 'original', 'filter-only', kind),
        filterFull: await delta(page, 'original', 'filter-full', kind),
        textureVersusFilter: await delta(page, 'texture-only', 'filter-only', kind),
        bothZero: await delta(page, 'original', 'both-zero', kind),
        combinedVersusTexture: await delta(page, 'default', 'texture-only', kind),
        combinedVersusFilter: await delta(page, 'default', 'filter-only', kind)
      };
      assert.ok(result[kind].textureOnly.meanAbsolute > .5, `${kind}: texture is visible without filter`);
      assert.ok(result[kind].filterOnly.meanAbsolute > .5, `${kind}: filter is visible without texture`);
      assert.ok(result[kind].filterFull.meanAbsolute > result[kind].filterOnly.meanAbsolute, `${kind}: filter strength increases visible effect`);
      assert.ok(result[kind].textureVersusFilter.meanAbsolute > .5, `${kind}: texture and filter differ`);
      assert.ok(result[kind].bothZero.meanAbsolute < .5, `${kind}: both zero restores original`);
      assert.ok(result[kind].combinedVersusTexture.meanAbsolute > .5, `${kind}: filter also affects textured material`);
      assert.ok(result[kind].combinedVersusFilter.meanAbsolute > .5, `${kind}: texture also affects filtered material`);
    }
    await inputRange(page, 'strength', 65); await inputRange(page, 'filter', 55);
    return result;
  });

  await check('Filter-only base colour changes between fixed times 0 and 8', async () => {
    const clock = await page.evaluate(() => window.__deck.snapshot().clock);
    await inputRange(page, 'strength', 0); await materialUniforms(page, 0, .55);
    await page.evaluate(() => window.__deck.setTime(0)); await capture(page, 'filter-time-0');
    await page.screenshot({ path: path.join(evidence, 'filter-only-time0-1440.png'), fullPage: true });
    await page.evaluate(() => window.__deck.setTime(8)); await capture(page, 'filter-time-8');
    await page.screenshot({ path: path.join(evidence, 'filter-only-time8-1440.png'), fullPage: true });
    const result = {};
    for (const kind of kinds) {
      result[kind] = await delta(page, 'filter-time-0', 'filter-time-8', kind);
      assert.ok(result[kind].meanAbsolute > .001, `${kind}: filter-only changes subtly with time`);
    }
    await page.evaluate(clock => window.__deck.setTime(clock), clock); await inputRange(page, 'strength', 65);
    return result;
  });

  await check('Both zero stop automatic flow; either nonzero resumes; compare disables both', async () => {
    await inputRange(page, 'strength', 0); await inputRange(page, 'filter', 0); await play(page);
    const stopped = await counters(page); await settle(page, 220); assert.deepEqual(await counters(page), stopped);
    await inputRange(page, 'strength', 65); const texture = await counters(page); await settle(page, 220); assert.ok((await counters(page)).draws > texture.draws, 'Texture-only keeps automatic flow');
    await inputRange(page, 'strength', 0); await inputRange(page, 'filter', 55); const filter = await counters(page); await settle(page, 220); assert.ok((await counters(page)).draws > filter.draws, 'Filter-only keeps automatic flow');
    await page.locator('#compare').click(); await settle(page, 100); await materialUniforms(page, 0, 0);
    const comparing = await counters(page); await settle(page, 220); assert.deepEqual(await counters(page), comparing);
    await capture(page, 'filter-only-compare');
    for (const kind of kinds) assert.ok((await delta(page, 'original', 'filter-only-compare', kind)).meanAbsolute < .5, `${kind}: compare bypasses remaining filter`);
    await page.locator('#compare').click(); await settle(page, 100); await materialUniforms(page, 0, .55);
    const restored = await counters(page); await settle(page, 220); assert.ok((await counters(page)).draws > restored.draws);
    await pause(page); await inputRange(page, 'strength', 65); await inputRange(page, 'filter', 55);
    return { bothZero: stopped, compare: comparing, textureOnlyContinuesDrawing: true, filterOnlyContinuesDrawing: true };
  });

  await check('Pointer x/y reach shader uniforms and visibly alter each material', async () => {
    const result = {};
    for (const kind of kinds) {
      const card = page.locator(`[data-kind="${kind}"]`); const rect = await card.boundingBox();
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await settle(page, 900); await capture(page, `${kind}-center`);
      await page.mouse.move(rect.x + rect.width * .82, rect.y + rect.height / 2); await settle(page, 900); await capture(page, `${kind}-x`);
      const xUniform = await page.evaluate(kind => window.__holoVerify.uniform(kind, 'uRay'), kind);
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * .82); await settle(page, 900); await capture(page, `${kind}-y`);
      const yUniform = await page.evaluate(kind => window.__holoVerify.uniform(kind, 'uRay'), kind);
      const xDelta = await delta(page, `${kind}-center`, `${kind}-x`, kind); const yDelta = await delta(page, `${kind}-center`, `${kind}-y`, kind);
      result[kind] = { xUniform, yUniform, xDelta, yDelta };
      assert.ok(xUniform[0] > .5 && Math.abs(xUniform[1]) < .01, `${kind}: pointer x enters uRay`);
      assert.ok(yUniform[1] > .5 && Math.abs(yUniform[0]) < .01, `${kind}: pointer y enters uRay`);
      assert.ok(xDelta.meanAbsolute > .05, `${kind}: x changes material pixels`);
      assert.ok(yDelta.meanAbsolute > .05, `${kind}: y changes material pixels`);
    }
    await page.mouse.move(1, 1); await settle(page, 900);
    return result;
  });

  await check('Keyboard navigation selects material, changes both axes, and Escape recenters', async () => {
    const card = page.locator('[data-kind="poly"]'); await card.focus();
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await settle(page, 900);
    const ray = await page.evaluate(() => window.__holoVerify.uniform('poly', 'uRay'));
    assert.ok(ray[0] > .19 && ray[1] > .19);
    assert.ok((await page.locator('#srcTitle').textContent()).includes('多彩'));
    await page.keyboard.press('Escape'); await settle(page, 900);
    assert.deepEqual(await page.evaluate(() => window.__holoVerify.uniform('poly', 'uRay')), [0, 0]);
    return { ray };
  });

  await check('Default-on facet control changes only holographic material and can be disabled', async () => {
    assert.equal(await page.locator('#etching').isChecked(), true);
    await capture(page, 'etch-on'); await page.locator('#etching').uncheck(); await settle(page, 80); await capture(page, 'etch-off');
    const result = {};
    for (const kind of kinds) result[kind] = await delta(page, 'etch-off', 'etch-on', kind);
    assert.ok(result.holo.meanAbsolute > .05); assert.equal(result.foil.meanAbsolute, 0); assert.equal(result.poly.meanAbsolute, 0);
    await page.screenshot({ path: path.join(evidence, 'smooth-holographic-1440.png'), fullPage: true });
    await page.locator('#etching').check(); return result;
  });

  await check('Local image replacement, invalid image handling, reset, and no persistence', async () => {
    const data = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 720;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ef285b'; ctx.fillRect(0, 0, 480, 720); ctx.fillStyle = '#30c5a0'; ctx.fillRect(0, 0, 240, 360);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await capture(page, 'before-upload');
    const beforeUpload = await counters(page);
    await page.locator('#coverFile').setInputFiles({ name: 'verification-cover.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
    await page.waitForFunction(() => document.querySelector('#message').textContent.includes('未保存'));
    await page.waitForFunction(draws => window.__holoVerify.draws > draws, beforeUpload.draws);
    await capture(page, 'uploaded');
    for (const kind of kinds) assert.ok((await delta(page, 'before-upload', 'uploaded', kind)).meanAbsolute > 20, `${kind} updates to local cover`);
    await page.locator('#coverFile').setInputFiles({ name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('not a PNG') });
    await page.waitForFunction(() => document.querySelector('#message').textContent.includes('无法读取'));
    await capture(page, 'after-invalid');
    for (const kind of kinds) assert.equal((await delta(page, 'uploaded', 'after-invalid', kind)).meanAbsolute, 0);
    await inputRange(page, 'strength', 20); await inputRange(page, 'filter', 30); await inputRange(page, 'speed', 80); await page.locator('#etching').uncheck();
    await page.locator('#compare').click();
    await page.locator('#reset').click();
    assert.equal(await page.locator('#strength').inputValue(), '65'); assert.equal(await page.locator('#filter').inputValue(), '55');
    assert.equal(await page.locator('#speed').inputValue(), '35'); assert.equal(await page.locator('#etching').isChecked(), true);
    assert.equal(await page.locator('#compare').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#motion').getAttribute('aria-pressed'), 'true');
    await pause(page); await materialUniforms(page, .65, .55);
    await page.locator('#compare').click(); await settle(page, 80); await capture(page, 'reset-original');
    for (const kind of kinds) assert.equal((await delta(page, 'original', 'reset-original', kind)).meanAbsolute, 0);
    await page.locator('#compare').click();
    assert.deepEqual(await page.evaluate(() => window.__holoVerify.storageWrites), []);
    assert.equal(await page.evaluate(() => localStorage.length), 0);
  });

  await check('Speed zero stops animation; positive speed resumes', async () => {
    await page.locator('#motion').click(); await inputRange(page, 'speed', 0); await settle(page, 150);
    const before = await counters(page); await settle(page, 200); assert.deepEqual(await counters(page), before);
    await inputRange(page, 'speed', 80); const resumed = await counters(page); await settle(page, 200); assert.ok((await counters(page)).draws > resumed.draws);
    await pause(page); await inputRange(page, 'speed', 35);
  });

  await check('390, 760, and 1440 layouts fit without horizontal page overflow', async () => {
    const result = [];
    for (const width of [390, 760, 1440]) {
      await page.setViewportSize({ width, height: 1120 }); await settle(page, 120);
      const metrics = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth, body: document.body.scrollWidth,
        cards: [...document.querySelectorAll('.card-face')].map(card => { const r = card.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height }; }) }));
      assert.ok(metrics.page <= width && metrics.body <= width, `No horizontal overflow at ${width}`);
      for (const card of metrics.cards) assert.ok(card.left >= 0 && card.right <= width && card.width > 50 && card.height > 50);
      await page.screenshot({ path: path.join(evidence, `layout-${width}.png`), fullPage: true }); result.push(metrics);
    }
    return result;
  });

  await check('Synthetic hidden-page event cancels draws and visible event resumes them', async () => {
    await page.locator('#motion').click(); await settle(page, 80);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    const hidden = await counters(page); await settle(page, 250); assert.deepEqual(await counters(page), hidden);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await settle(page, 200); assert.ok((await counters(page)).draws > hidden.draws);
    await pause(page); return { method: 'synthetic hidden getter + visibilitychange', hidden };
  });

  await check('Real WebGL context loss shows original image and restored context redraws', async () => {
    await page.evaluate(() => {
      const gl = document.querySelector('#cv-foil').getContext('webgl'); window.__holoVerify.lostExtension = gl.getExtension('WEBGL_lose_context');
      if (!window.__holoVerify.lostExtension) throw new Error('WEBGL_lose_context unavailable'); window.__holoVerify.lostExtension.loseContext();
    });
    const fallback = page.locator('[data-kind="foil"] .fallback');
    await fallback.waitFor({ state: 'visible' });
    assert.ok(await fallback.evaluate(img => img.complete && img.naturalWidth === 480));
    assert.equal(await page.locator('#cv-foil').evaluate(canvas => getComputedStyle(canvas).visibility), 'hidden');
    await settle(page, 100); await page.evaluate(() => window.__holoVerify.lostExtension.restoreContext());
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#cv-foil')).visibility !== 'hidden');
    await settle(page, 100); const pixels = await capture(page, 'restored'); assert.ok(pixels.foil.values > 100);
    return { restoredPixels: pixels.foil };
  });

  await check('Reduced motion renders only necessary frames and disables tilt', async () => {
    const reducedContext = await browser.newContext({ viewport: { width: 1440, height: 1120 }, reducedMotion: 'reduce' });
    const reduced = await setupPage(reducedContext, base);
    try {
      await settle(reduced.page, 150); const before = await counters(reduced.page); await settle(reduced.page, 250); assert.deepEqual(await counters(reduced.page), before);
      assert.equal(await reduced.page.locator('#motion').isDisabled(), true);
      const rect = await reduced.page.locator('[data-kind="foil"]').boundingBox(); await reduced.page.mouse.move(rect.x + rect.width * .8, rect.y + rect.height * .7); await settle(reduced.page, 80);
      const after = await counters(reduced.page); assert.ok(after.draws > before.draws && after.draws - before.draws <= 6);
      assert.equal(await reduced.page.locator('[data-kind="foil"] .card-face').evaluate(card => getComputedStyle(card).transform), 'none');
      await settle(reduced.page, 250); assert.deepEqual(await counters(reduced.page), after);
      await inputRange(reduced.page, 'strength', 30); const changed = await counters(reduced.page); assert.ok(changed.draws > after.draws); await settle(reduced.page, 150); assert.deepEqual(await counters(reduced.page), changed);
      await inputRange(reduced.page, 'filter', 40); const filtered = await counters(reduced.page); assert.ok(filtered.draws > changed.draws); await settle(reduced.page, 150); assert.deepEqual(await counters(reduced.page), filtered);
      assert.deepEqual(reduced.audit.pageErrors, []); return { initial: before, afterPointer: after, afterStrength: changed, afterFilter: filtered };
    } finally { await reducedContext.close(); }
  });

  await check('No WebGL uses visible local-image fallback and stops animation', async () => {
    const fallbackContext = await browser.newContext({ viewport: { width: 760, height: 1120 } });
    const fallback = await setupPage(fallbackContext, base, { noWebGL: true });
    try {
      await settle(fallback.page, 100);
      assert.equal(await fallback.page.locator('.fallback:visible').count(), 3);
      assert.ok(await fallback.page.locator('.fallback').evaluateAll(imgs => imgs.every(img => img.complete && img.naturalWidth === 480)));
      assert.equal(await fallback.page.locator('#message').textContent(), '部分材质不可用，已保留原图。');
      const before = await counters(fallback.page); await settle(fallback.page, 250); assert.deepEqual(await counters(fallback.page), before);
      await fallback.page.screenshot({ path: path.join(evidence, 'fallback-760.png'), fullPage: true });
      assert.deepEqual(fallback.audit.pageErrors, []); assert.deepEqual(await fallback.page.evaluate(() => window.__holoVerify.storageWrites), []);
      assert.ok(fallback.audit.requests.every(request => request.url.startsWith(base) || request.url.startsWith('data:') || request.url.startsWith('blob:')));
      return { count: 3, counters: before };
    } finally { await fallbackContext.close(); }
  });

  await check('No unexpected remote requests, storage writes, browser errors, or production bridge', async () => {
    const remote = audit.requests.filter(request => !request.url.startsWith(base) && !request.url.startsWith('data:') && !request.url.startsWith('blob:'));
    assert.deepEqual(remote, []); assert.ok(audit.requests.every(request => request.method === 'GET'));
    assert.deepEqual(await page.evaluate(() => window.__holoVerify.storageWrites), []);
    assert.deepEqual(audit.pageErrors, []); assert.deepEqual(audit.consoleErrors, []);
    assert.equal(await page.evaluate(() => typeof window.qiyu), 'undefined');
    return { requests: audit.requests, errors: audit.pageErrors, consoleErrors: audit.consoleErrors };
  });
  await check('Source files remained unchanged throughout verification', async () => {
    const finalHashes = Object.fromEntries(Object.keys(report.sourceHashes).map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(source, file))).digest('hex')]));
    assert.deepEqual(finalHashes, report.sourceHashes); return finalHashes;
  });
  await context.close();
})().catch(error => { report.fatal = error.stack || String(error); console.error(error); }).finally(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  report.finishedAt = new Date().toISOString();
  report.summary = { passed: report.checks.filter(check => check.pass).length, failed: report.checks.filter(check => !check.pass).length, findings: report.diagnostics.length };
  fs.mkdirSync(evidence, { recursive: true }); fs.writeFileSync(path.join(evidence, 'verification-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report.summary, evidence, fatal: report.fatal || null }));
  process.exitCode = report.fatal || report.summary.failed ? 1 : 0;
});
