const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const out = path.join(root, 'evidence', 'cover-finishes-v' + version.replaceAll('.', ''));
fs.mkdirSync(out, { recursive: true });
const sha = value => createHash('sha256').update(value).digest('hex');
const report = { passed: false, version, isolatedDataOnly: true, userLibraryAccessed: false, checks: [], reflections: [], diagnostics: [], screenshots: [], errors: [], notes: ['使用全新浏览器上下文、内联合成 SVG 转 PNG，不读取或导入真实收藏与封面。', '截图与像素变化用于目视检查，不能单凭像素差诊断反光质量。'] };
// Self-contained original artwork: no game asset, personal path or external fixture.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360" viewBox="0 0 240 360">
  <defs><linearGradient id="sky" x2=".8" y2="1"><stop stop-color="#0f1640"/><stop offset="1" stop-color="#28325e"/></linearGradient><linearGradient id="shape" x2="1" y2="1"><stop stop-color="#f2cf8a"/><stop offset="1" stop-color="#b7738e"/></linearGradient></defs>
  <rect width="240" height="360" fill="url(#sky)"/><circle cx="154" cy="99" r="49" fill="#d09a98" opacity=".6"/>
  <path d="M38 230 120 100 202 230Z" fill="url(#shape)"/><path d="m82 234 38-114 38 114Z" fill="#32436d"/><path d="m120 120 38 114 44-4Z" fill="#976b90"/>
  <path d="M30 273H210" stroke="#e8d4b5" stroke-opacity=".5"/><text x="24" y="309" fill="#fff3db" font-family="sans-serif" font-size="27" font-weight="bold">QIYU</text><text x="25" y="330" fill="#c5cfdf" font-family="sans-serif" font-size="10" letter-spacing="2">SYNTHETIC COVER</text>
</svg>`;
const grades = ['SSS', 'SS', 'S', 'A', 'B', 'C'];
const finish = { SSS: 'prismatic', SS: 'holographic', S: 'gold', A: 'silver', B: 'standard', C: 'standard' };
const names = { SSS: '对照甲', SS: '对照乙', S: '对照丙', A: '对照丁', B: '对照戊', C: '对照己' };
const item = (grade, bright = false) => ({ id: `${bright ? 'bright' : 'cover'}-${grade}`, title: `${bright ? '浅封面' : '深封面'}${names[grade]}`, category: 'game', subcategory: 'Steam', platforms: ['Steam'], creator: '合成图像验收', year: '2026', status: 'finished', gamePlayState: 'cleared', personalGrade: grade, tags: [], gameTags: { gameplay: [], theme: [], scenario: [], other: [] }, impression: '保持封面内容可读', favorite: false, playtimeMinutes: 1234, artwork: 'outer', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', fixtureBright: bright });
const fixture = { schemaVersion: 1, futureRoot: { keep: true }, items: [...grades.map(grade => item(grade)), ...['SSS', 'SS'].map(grade => item(grade, true))] };
const key = 'qiyu.library.v1';
let browser, context, page, server, baseline;
async function check(name, run) { await run(); report.checks.push(name); console.log('PASS ' + name); }
async function capture(name, locator = page) { const file = name + '.png'; await locator.screenshot({ path: path.join(out, file), animations: 'disabled' }); report.screenshots.push(file); return path.join(out, file); }
const card = title => page.getByRole('button', { name: `查看${title}详情`, exact: true });
async function point(target, x, y) { await target.scrollIntoViewIfNeeded(); const box = await target.locator('.card-cover').boundingBox(); await page.mouse.move(box.x + box.width * x, box.y + box.height * y); await page.waitForTimeout(300); }
async function query(title) { await page.getByRole('textbox', { name: '搜索收藏', exact: true }).fill(title); }
async function stableInfo(target) {
  for (const selector of ['.card-name', '.card-playtime']) assert.equal(await target.locator(selector).count(), 1, selector + ' must exist');
  return target.locator('.card-name,.card-playtime').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { text: element.textContent, transform: getComputedStyle(element).transform, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
}
async function material(target) { return target.locator('.card-cover').evaluate(cover => {
  const foil = cover.querySelector('.cover-foil'), shine = cover.querySelector('.card-cover-shine'), f = foil && getComputedStyle(foil), after = foil && getComputedStyle(foil, '::after');
  return { finish: cover.dataset.finish, depth: cover.dataset.depth || null, transform: getComputedStyle(cover).transform, angle: parseFloat(cover.style.getPropertyValue('--cover-angle')), foil: f && { opacity: +f.opacity, display: f.display, background: f.backgroundImage, position: f.backgroundPosition, mask: f.maskImage, blend: f.mixBlendMode, after: after.backgroundImage }, shine: shine && { display: getComputedStyle(shine).display, opacity: +getComputedStyle(shine).opacity } };
}); }
async function pngPixels(file) { return page.evaluate(async base64 => { const img = new Image(); await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = 'data:image/png;base64,' + base64; }); const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0); return { width: img.width, height: img.height, pixels: Array.from(ctx.getImageData(0, 0, img.width, img.height).data) }; }, fs.readFileSync(file).toString('base64')); }
async function compare(name, a, b) { const x = await pngPixels(a), y = await pngPixels(b); assert.equal(x.width, y.width); assert.equal(x.height, y.height); assert.notDeepEqual(x.pixels, y.pixels, 'SS and SSS must render differently'); const differences = []; for (let i = 0; i < x.pixels.length; i += 4) differences.push(Math.max(...[0, 1, 2].map(k => Math.abs(x.pixels[i + k] - y.pixels[i + k])))); report.diagnostics.push({ name, width: x.width, height: x.height, meanMaxChannelDifference: differences.reduce((sum, v) => sum + v, 0) / differences.length, changedRatio: differences.filter(v => v > 5).length / differences.length, pixelThresholdDiagnosticOnly: true }); }
(async () => { try {
  report.distAssets = [...fs.readFileSync(path.join(dist, 'index.html'), 'utf8').matchAll(/(?:src|href)="((?:\.\/|\/)?assets\/[^\"]+\.(?:js|css))"/g)].map(match => ({ path: match[1], sha256: sha(fs.readFileSync(path.join(dist, match[1]))) }));
  server = http.createServer((req, res) => { const pathname = new URL(req.url, 'http://127.0.0.1').pathname; if (pathname === '/__init') { res.end('<!doctype html><title>Isolated foil fixture</title>'); return; } if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; } let file; try { file = path.resolve(dist, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname)); } catch { res.writeHead(400); res.end(); return; } if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; } const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }; res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(file).pipe(res); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', reducedMotion: 'no-preference' });
  await context.addInitScript(key => {
    window.__finishSaves = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) { if (name === key && location.pathname !== '/__init') window.__finishSaves++; return original.call(this, name, value); };
  }, key);
  page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.route('**/*', route => route.request().url().startsWith(base) || route.request().url().startsWith('data:') ? route.continue() : route.abort());
  await page.goto(base + '/__init');
  baseline = await page.evaluate(async ({ fixture, svg, key }) => { const img = new Image(); await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); }); for (const entry of fixture.items) { const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 360; const ctx = canvas.getContext('2d'); if (entry.fixtureBright) { ctx.fillStyle = '#faf8f1'; ctx.fillRect(0, 0, 240, 360); ctx.drawImage(img, 40, 60, 160, 240); } else ctx.drawImage(img, 0, 0, 240, 360); entry.coverUrl = canvas.toDataURL('image/png'); } const raw = JSON.stringify(fixture); localStorage.setItem(key, raw); localStorage.setItem('qiyu.appearance.v1', JSON.stringify({ mode: 'dark' })); localStorage.setItem('qiyu.background.v1', JSON.stringify({ enabled: false, fluidEnabled: false, starsEnabled: false })); return raw; }, { fixture, svg, key });
  await page.goto(base, { waitUntil: 'networkidle' }); await page.locator('.library-views').getByRole('button', { name: '全部游戏', exact: true }).click(); await page.evaluate(() => document.fonts.ready);
  await check('同一 PNG 封面六档映射，SS 冷色线性镭射，SSS 棱彩锥形光谱，无网格网点', async () => {
    for (const grade of grades) { const target = card('深封面' + names[grade]); assert.equal(await target.locator('.card-cover').getAttribute('data-finish'), finish[grade]); }
    for (const grade of ['SS', 'SSS', 'S', 'A']) { const title = '深封面' + names[grade]; await query(title); const target = card(title); await point(target, .84, .2); const value = await material(target); assert.equal(value.depth, 'active'); assert.ok(value.foil.opacity >= .3); assert.ok(value.angle >= 38 && value.angle <= 52); assert.doesNotMatch(value.foil.background + value.foil.after, /repeating|radial-gradient|url\(/); assert.equal(value.foil.mask, 'none'); if (grade === 'SS') { assert.ok(value.foil.background.startsWith('linear-gradient')); assert.equal(value.foil.opacity, .52); } if (grade === 'SSS') { assert.ok(value.foil.background.startsWith('conic-gradient')); assert.equal(value.foil.opacity, .58); } report.reflections.push({ grade, ...value }); await capture(`${grade}-hover`, target); }
  });
  await check('同图同位置 SS 与 SSS 对比，退出悬停恢复原始封面，标题和时长不倾斜', async () => {
    for (const bright of [false, true]) {
      const prefix = bright ? '浅封面' : '深封面', shots = {}, sourceImages = [];
      for (const grade of ['SS', 'SSS']) {
        await query(prefix + names[grade]); const target = card(prefix + names[grade]);
        await page.mouse.move(5, 5); await page.waitForTimeout(300);
        assert.equal((await material(target)).foil.opacity, 0);
        const fixed = await stableInfo(target), source = await target.locator('.poster-image').getAttribute('src');
        sourceImages.push(source); assert.ok(source.startsWith('data:image/png;base64,'));
        assert.ok(fixed.every(element => element.transform === 'none'));
        await point(target, .84, .2);
        shots[grade] = await capture(`${bright ? 'bright' : 'same'}-${grade}-cover`, target.locator('.card-cover'));
        assert.deepEqual(await stableInfo(target), fixed);
        assert.equal(await target.locator('.poster-image').getAttribute('src'), source);
        await capture(`${bright ? 'bright' : 'same'}-${grade}-card`, target);
        await page.mouse.move(5, 5); await page.waitForTimeout(300);
        assert.equal((await material(target)).foil.opacity, 0);
      }
      assert.equal(sourceImages[0], sourceImages[1], 'SS/SSS comparison must use exactly the same PNG');
      await compare(bright ? '浅封面 SS vs SSS' : '深封面 SS vs SSS', shots.SS, shots.SSS);
    }
  });
  await check('反光随指针移动且保持左上至右下方向，普通封面无强光', async () => {
    await query('深封面' + names.SSS); const target = card('深封面' + names.SSS); await point(target, .12, .15); const left = await material(target); await point(target, .88, .82); const right = await material(target); assert.notEqual(left.foil.background, right.foil.background); assert.notEqual(left.transform, right.transform); for (const value of [left, right]) assert.ok(value.angle >= 38 && value.angle <= 52); await capture('SSS-opposite-angle', target); await query('深封面' + names.B); const normal = card('深封面' + names.B); await point(normal, .8, .2); const value = await material(normal); assert.equal(value.foil, null); assert.equal(value.shine.display, 'none');
  });
  await check('减少动态时不倾斜不闪光，浏览和切换不写收藏', async () => {
    await query('深封面' + names.SSS); await page.emulateMedia({ reducedMotion: 'reduce' }); const target = card('深封面' + names.SSS); await point(target, .8, .2); const value = await material(target); assert.equal(value.transform, 'none'); assert.equal(value.foil.display, 'none'); const raw = await page.evaluate(key => localStorage.getItem(key), key); assert.equal(raw, baseline); assert.equal(await page.evaluate(() => window.__finishSaves), 0); report.integrity = { same: true, beforeSha256: sha(baseline), afterSha256: sha(raw), saveAttempts: 0 }; assert.equal(report.errors.length, 0);
  });
  report.passed = true;
} catch (error) { report.failure = error.stack; process.exitCode = 1; if (page && !page.isClosed()) try { await capture('failure'); } catch {} }
finally { if (context) await context.close(); if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); report.timestamp = new Date().toISOString(); fs.writeFileSync(path.join(out, 'validation.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failure: report.failure, output: out })); }
})();

