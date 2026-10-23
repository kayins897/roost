const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const dist = path.join(root, 'dist');
const output = path.join(root, 'evidence', `ui-live-v${version.replaceAll('.', '')}`, 'cinema');
const categories = ['游戏', '书籍', '影视', '音乐'];
const artworkNames = ['hollow', 'spire', 'disco', 'outer', 'hades', 'dave'];
const report = {
  version, passed: false, isolatedDataOnly: true, userLibraryAccessed: false,
  notes: [
    '仅测试本脚本的本地静态服务及全新浏览器上下文，不连接用户 Electron 进程、浏览器配置或收藏目录。',
    '作品由项目演示数据构造，六张游戏封面是设计目录的原创几何图，书籍与影视使用应用内演示封面。',
    '截图中的背景保持静态以检查布局；动态背景由独立帧及原生检查另行记录，本脚本不替代 Windows 暂停／恢复检查。',
  ],
  checks: [], cases: [], screenshots: [], overlays: [], coverDepth: [], mintGlass: [], integrity: [], pageErrors: [], resourceErrors: [],
};
let browser, server, base;
fs.mkdirSync(output, { recursive: true });

function digest(value) { return createHash('sha256').update(value).digest('hex'); }

async function startServer() {
  assert.ok(fs.existsSync(path.join(dist, 'index.html')), '请先 npm run build，再运行视觉检查');
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname === '/__fixture-init') { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end('<!doctype html><html lang="zh-CN"><title>隔离视觉样例</title></html>'); return; }
    if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    let target;
    try { target = path.resolve(dist, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname)); }
    catch { response.writeHead(400); response.end(); return; }
    if (!target.startsWith(dist + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': mime[path.extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(target).pipe(response);
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)); });
}

async function prepare(page, fixture, theme, svgs) {
  await page.goto(`${base}/__fixture-init`);
  const original = await page.evaluate(async ({ fixture, theme, svgs }) => {
    const covers = {};
    for (const [name, svg] of Object.entries(svgs)) {
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`; });
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 480;
      canvas.getContext('2d').drawImage(image, 0, 0, 320, 480); covers[name] = canvas.toDataURL('image/png');
    }
    for (const item of fixture.items) if (item.category === 'game' && covers[item.artwork]) item.coverUrl = covers[item.artwork];
    const raw = JSON.stringify(fixture);
    localStorage.setItem('qiyu.library.v1', raw);
    localStorage.setItem('qiyu.appearance.v1', JSON.stringify({ mode: theme }));
    localStorage.setItem('qiyu.background.v1', JSON.stringify({ enabled: false, hue: 0, strength: 60 }));
    return raw;
  }, { fixture, theme, svgs });
  await page.goto(base);
  await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.poster-image').first().evaluate(image => image.decode());
  await settle(page);
  assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
  return original;
}

async function settle(page) { await page.waitForTimeout(400); }

async function screenshot(page, name) {
  await settle(page);
  const target = path.join(output, `${name}.png`);
  await page.screenshot({ path: target });
  const relative = path.relative(root, target);
  report.screenshots.push(relative); return relative;
}

async function actionInDock(page, name) {
  const button = page.getByRole('button', { name, exact: true });
  if (!await button.isVisible()) await page.getByRole('button', { name: '打开菜单', exact: true }).click();
  await button.click();
}

async function navigate(page, name) {
  const button = page.getByRole('navigation', { name: '作品分类' }).getByRole('button', { name, exact: true });
  if (!await button.isVisible()) await page.getByRole('button', { name: '打开菜单', exact: true }).click();
  await button.click();
  await page.getByRole('heading', { name, exact: true }).waitFor();
  await page.locator('.main-scroll').evaluate(element => { element.scrollTop = 0; });
}

async function closeDrawer(page) {
  const dismiss = page.getByRole('button', { name: '关闭菜单', exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
}

async function inspectCollection(page, game = false) {
  const value = await page.evaluate(() => {
    const variables = { want: '--purple', playing: '--blue', cleared: '--green', replaying: '--amber', ongoing: '--cyan', paused: '--amber', abandoned: '--danger' };
    const probe = document.createElement('span'); document.body.append(probe);
    const cards = [...document.querySelectorAll('.media-card')].map(card => {
      const state = card.querySelector('.card-game-state'), time = card.querySelector('.card-playtime');
      if (!state) return { title: card.querySelector('.card-name').textContent };
      const stateId = [...state.classList].find(name => name.startsWith('game-state--')).slice('game-state--'.length);
      probe.style.color = `var(${variables[stateId]})`;
      return { title: card.querySelector('.card-name').textContent, state: stateId, color: getComputedStyle(state).color, iconColor: getComputedStyle(state.querySelector('svg')).color, expected: getComputedStyle(probe).color, time: time.textContent, timeWeight: getComputedStyle(time.querySelector('strong')).fontWeight, stateWeight: getComputedStyle(state).fontWeight, timeBeforeState: !!(time.compareDocumentPosition(state) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    probe.remove();
    const surfaces = ['.collection-section', '.tag-panel'].flatMap(selector => {
      const element = document.querySelector(selector); if (!element) return [];
      const style = getComputedStyle(element), before = getComputedStyle(element, '::before');
      return [{ selector, background: style.backgroundColor, image: style.backgroundImage, border: style.borderTopWidth, shadow: style.boxShadow, backdrop: style.backdropFilter, glass: element.hasAttribute('data-glass'), beforeContent: before.content, beforeDisplay: before.display }];
    });
    const toolbarRects = [...document.querySelectorAll('.filter-secondary,.filter-secondary button,.filter-secondary .sort-box,.filter-secondary .view-switch')].flatMap(element => {
      const bounds = element.getBoundingClientRect(); if (!bounds.width || !bounds.height) return [];
      return [{ label: element.getAttribute('aria-label') || element.getAttribute('title') || element.className, left: bounds.left, right: bounds.right, width: bounds.width }];
    });
    return { cards, surfaces, toolbarRects, viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, tagGroups: document.querySelectorAll('.game-filter-group').length, empty: !!document.querySelector('.empty-state') };
  });
  assert.ok(value.documentWidth <= value.viewport + 1, '页面无水平溢出');
  for (const bounds of value.toolbarRects) assert.ok(bounds.left >= -1 && bounds.right <= value.viewport + 1, `${bounds.label} 必须完整位于视口内，不能依靠 overflow 隐藏裁掉按钮`);
  for (const surface of value.surfaces) {
    assert.equal(surface.background, 'rgba(0, 0, 0, 0)', `${surface.selector} 无外层底色`);
    assert.equal(surface.image, 'none'); assert.equal(surface.border, '0px'); assert.equal(surface.shadow, 'none'); assert.equal(surface.backdrop, 'none'); assert.equal(surface.glass, false);
    assert.ok(surface.beforeContent === 'none' || surface.beforeDisplay === 'none', '无截断玻璃伪元素');
  }
  if (game) {
    assert.equal(value.cards.length, artworkNames.length); assert.equal(value.tagGroups, 4);
    for (const card of value.cards) {
      assert.equal(card.color, card.expected, `${card.state} 恢复语义色`); assert.equal(card.iconColor, card.expected);
      assert.equal(card.timeBeforeState, true, '时长在状态前'); assert.ok(Number(card.timeWeight) > Number(card.stateWeight), '时长视觉权重更高');
    }
  }
  return value;
}

async function inspectOverlay(page, prefix, name, element) {
  await element.waitFor();
  const views = [];
  for (const position of ['top', 'bottom']) {
    await element.evaluate((panel, position) => { panel.scrollTop = position === 'top' ? 0 : panel.scrollHeight; }, position);
    await settle(page);
    const inspection = await element.evaluate(panel => {
      const style = getComputedStyle(panel), before = getComputedStyle(panel, '::before');
      return { height: panel.clientHeight, scrollHeight: panel.scrollHeight, scrollTop: panel.scrollTop, horizontalOverflow: panel.scrollWidth > panel.clientWidth + 1, background: style.backgroundImage, beforeContent: before.content, beforeDisplay: before.display, backdrop: style.backdropFilter };
    });
    assert.equal(inspection.beforeContent, 'none', `${name} 不使用旧短玻璃伪元素`);
    assert.equal(inspection.horizontalOverflow, false, `${name} 无水平溢出`);
    assert.notEqual(inspection.background, 'none', `${name} 连续玻璃底色存在`);
    views.push({ position, screenshot: await screenshot(page, `${prefix}-${name}-${position}`), ...inspection });
  }
  report.overlays.push({ prefix, name, views });
  return views;
}

async function checkOverlays(page, prefix) {
  await navigate(page, '游戏');
  await page.getByRole('button', { name: '卡片视图', exact: true }).click();
  await page.locator('.media-card').first().click();
  const detail = page.locator('.detail-panel');
  await inspectOverlay(page, prefix, 'detail', detail);
  const summary = await detail.locator('.detail-personal-summary').evaluate(element => {
    const time = element.querySelector('.detail-summary-playtime'), state = element.querySelector('.detail-summary-state');
    return { timeBeforeState: !!(time.compareDocumentPosition(state) & Node.DOCUMENT_POSITION_FOLLOWING), stateClass: state.className, color: getComputedStyle(state).color };
  });
  assert.equal(summary.timeBeforeState, true);
  await detail.locator('.detail-toolbar').getByRole('button', { name: '关闭', exact: true }).click();
  await actionInDock(page, '数据与设置');
  const settings = page.getByRole('dialog', { name: '数据与设置', exact: true });
  await inspectOverlay(page, prefix, 'settings', settings);
  assert.equal(await settings.getByRole('slider', { name: '环境光色相', exact: true }).count(), 1);
  assert.equal(await settings.getByRole('slider', { name: '背景明暗', exact: true }).count(), 1);
  await settings.getByRole('button', { name: '关闭', exact: true }).click(); await closeDrawer(page);
  await actionInDock(page, '标签管理');
  const tags = page.getByRole('dialog', { name: '管理标签', exact: true });
  await inspectOverlay(page, prefix, 'tags', tags);
  assert.ok(await tags.locator('.manage-tag-row').count() > 0);
  await tags.getByRole('button', { name: '关闭', exact: true }).click(); await closeDrawer(page);
}

async function coverGeometry(card) {
  return card.evaluate(element => {
    const cover = element.querySelector('.card-cover'), image = cover.querySelector('.poster-image');
    return { depth: cover.getAttribute('data-depth'), transform: getComputedStyle(cover).transform, imageTransform: getComputedStyle(image).transform, rx: cover.style.getPropertyValue('--cover-rx'), ry: cover.style.getPropertyValue('--cover-ry'), text: [...element.querySelectorAll('.card-name,.card-meta,.card-game-meta')].map(node => node.getBoundingClientRect().toJSON()) };
  });
}

async function checkCoverDepth(page, prefix) {
  await navigate(page, '游戏'); await page.getByRole('button', { name: '卡片视图', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.mouse.move(1200, 50); await settle(page);
  const card = page.locator('.media-card:has(.poster-image)').first(), cover = card.locator('.card-cover');
  await card.scrollIntoViewIfNeeded(); await settle(page);
  const before = await coverGeometry(card), bounds = await cover.boundingBox();
  await page.mouse.move(bounds.x + bounds.width * .82, bounds.y + bounds.height * .28, { steps: 6 }); await settle(page);
  const hovered = await coverGeometry(card);
  assert.equal(hovered.depth, 'active'); assert.ok(hovered.transform.startsWith('matrix3d('), '封面真实应用 3D 变换'); assert.notEqual(hovered.imageTransform, 'none');
  assert.notEqual(hovered.rx, '0.00deg'); assert.notEqual(hovered.ry, '0.00deg'); assert.deepEqual(before.text, hovered.text, '倾斜只作用封面，文字不移动');
  const hoverScreenshot = await screenshot(page, `${prefix}-cover-hover`);
  await page.mouse.move(1200, 50, { steps: 6 }); await settle(page);
  const left = await coverGeometry(card);
  assert.equal(left.depth, null); assert.equal(left.rx, ''); assert.equal(left.ry, ''); assert.equal(left.transform, 'none'); assert.equal(left.imageTransform, 'none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const again = await cover.boundingBox(); await page.mouse.move(again.x + again.width * .8, again.y + again.height * .3); await settle(page);
  const reduced = await coverGeometry(card);
  assert.equal(reduced.depth, null); assert.equal(reduced.transform, 'none'); assert.equal(reduced.imageTransform, 'none'); assert.deepEqual(before.text, reduced.text);
  const reducedScreenshot = await screenshot(page, `${prefix}-cover-reduced`);
  report.coverDepth.push({ prefix, before, hovered, left, reduced, hoverScreenshot, reducedScreenshot });
  await page.mouse.move(1200, 50);
}

async function checkFixtureIntegrity(page, original, label) {
  const current = await page.evaluate(() => localStorage.getItem('qiyu.library.v1'));
  assert.equal(current, original, `${label} 导航、筛选与视觉检查不改写收藏字节`);
  report.integrity.push({ label, passed: true, sha256: digest(current), bytes: Buffer.byteLength(current) });
}

async function checkMintGlass(page, prefix) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const primary = page.locator('.topbar .button--primary');
  const bounds = await primary.boundingBox();
  const inspect = () => primary.evaluate(element => {
    const style = getComputedStyle(element);
    return { active: element.getAttribute('data-glass-active'), x: element.style.getPropertyValue('--glass-x'), y: element.style.getPropertyValue('--glass-y'), image: style.backgroundImage, color: style.color, background: style.backgroundColor, backdrop: style.backdropFilter, shadow: style.boxShadow };
  });
  await page.mouse.move(bounds.x + bounds.width * .2, bounds.y + bounds.height * .3); await settle(page);
  const left = await inspect();
  await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .7); await settle(page);
  const right = await inspect();
  assert.equal(right.active, 'true'); assert.notEqual(right.x, left.x); assert.notEqual(right.image, left.image);
  assert.match(right.image, /radial-gradient/); assert.match(right.backdrop, /blur/);
  assert.notEqual(right.shadow, 'none');
  const hoverScreenshot = await screenshot(page, `${prefix}-mint-glass-hover`);
  await page.mouse.move(900, 105); await settle(page);
  const reset = await inspect(); assert.equal(reset.active, null); assert.equal(reset.x, '');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .7); await settle(page);
  const reduced = await inspect(); assert.equal(reduced.active, null); assert.equal(reduced.x, '');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
  await settle(page);
  const opaque = await inspect(); assert.equal(opaque.image, 'none'); assert.equal(opaque.backdrop, 'none');
  assert.equal(opaque.background, prefix.startsWith('dark-') ? 'rgb(197, 166, 109)' : 'rgb(23, 110, 134)', '减少透明度时保留黑金或蓝色按钮实底与可读文字');
  const fallbackScreenshot = await screenshot(page, `${prefix}-mint-glass-opaque`);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp.detach(); await page.mouse.move(900, 105);
  report.mintGlass.push({ prefix, left, right, reset, reduced, opaque, hoverScreenshot, fallbackScreenshot });
}

async function recordPreview(fixture, svgs) {
  const recordings = path.join(output, 'recordings');
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'no-preference', recordVideo: { dir: recordings, size: { width: 1440, height: 960 } } });
  const recordStarted = Date.now();
  const page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push({ prefix: 'preview', error: error.message }));
  let metadata;
  try {
    const original = await prepare(page, fixture, 'dark', svgs);
    await actionInDock(page, '数据与设置');
    const settings = page.getByRole('dialog', { name: '数据与设置', exact: true });
    await settings.getByRole('checkbox', { name: '动态背景', exact: true }).check();
    await settings.getByRole('button', { name: '关闭', exact: true }).click();
    await page.locator('.ambient-scene[data-motion="animated"]').waitFor();
    await page.mouse.move(1040, 100); await settle(page);
    const clipStartSeconds = (Date.now() - recordStarted) / 1000;
    const clipStarted = Date.now();
    await page.waitForTimeout(1000);
    const hovered = [];
    for (let index = 0; index < 2; index += 1) {
      const card = page.locator('.media-card:has(.poster-image)').nth(index);
      const bounds = await card.locator('.card-cover').boundingBox();
      await page.mouse.move(bounds.x + bounds.width * (index ? .22 : .82), bounds.y + bounds.height * (index ? .68 : .28), { steps: 32 });
      await page.waitForTimeout(800);
      const geometry = await coverGeometry(card); assert.equal(geometry.depth, 'active'); hovered.push(geometry);
    }
    await page.mouse.move(1100, 100, { steps: 32 });
    await page.waitForTimeout(Math.max(0, 7000 - (Date.now() - clipStarted)));
    assert.equal(await page.evaluate(() => localStorage.getItem('qiyu.library.v1')), original);
    metadata = { isolatedDataOnly: true, clipStartSeconds, durationSeconds: 7, hovered, collectionBytesUnchanged: true, collectionSha256: digest(original), motion: await page.locator('.ambient-scene').getAttribute('data-motion') };
  } finally { await context.close(); }
  const raw = await page.video().path();
  const target = path.join(output, '..', 'preview.webm');
  // The browser records only its isolated page. Trim its setup frames when the
  // already-installed Playwright ffmpeg is available; no extra runtime package.
  const cache = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ms-playwright');
  const ffmpegFolder = cache && fs.existsSync(cache) && fs.readdirSync(cache).filter(name => name.startsWith('ffmpeg-')).sort().reverse().find(name => fs.existsSync(path.join(cache, name, 'ffmpeg-win64.exe')));
  let trimmed = false;
  if (ffmpegFolder) {
    const result = spawnSync(path.join(cache, ffmpegFolder, 'ffmpeg-win64.exe'), ['-hide_banner', '-loglevel', 'error', '-ss', metadata.clipStartSeconds.toFixed(3), '-i', raw, '-t', '7', '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-y', target], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, `动态预览裁剪失败：${result.stderr || result.error}`); trimmed = true;
  } else fs.copyFileSync(raw, target);
  return { ...metadata, trimmed, path: path.relative(root, target), rawPath: path.relative(root, raw), bytes: fs.statSync(target).size };
}

(async () => {
  try {
    const { demoSnapshot } = await import(pathToFileURL(path.join(root, 'src/infrastructure/demoData.ts')).href);
    const { GAME_PLAY_STATES, legacyStatusForGameState, isValidSnapshot } = await import(pathToFileURL(path.join(root, 'src/domain/library.ts')).href);
    const games = artworkNames.map((artwork, index) => {
      const item = demoSnapshot.items.find(item => item.category === 'game' && item.artwork === artwork);
      assert.ok(item, `原创封面 ${artwork} 应有对应演示作品`);
      return { ...item, id: `cinema-game-${index}`, gamePlayState: GAME_PLAY_STATES[index], status: legacyStatusForGameState(GAME_PLAY_STATES[index]), playtimeMinutes: index === 0 ? undefined : (index + 1) * 125 };
    });
    const others = ['book', 'screen'].map(category => ({ ...demoSnapshot.items.find(item => item.category === category), id: `cinema-${category}` }));
    const fixture = { schemaVersion: 1, visualFixtureMarker: 'cinema-isolated-v1', items: [...games, ...others] };
    assert.equal(isValidSnapshot(fixture), true);
    const svgs = Object.fromEntries(artworkNames.filter(name => name !== 'nier').map(name => [name, fs.readFileSync(path.join(root, '../design/2026-10-22-concepts/assets', `cover-${name}.svg`), 'utf8')]));
    report.fixture = { items: fixture.items.length, games: games.length, music: 0, gameStates: GAME_PLAY_STATES };
    const ambientReport = path.join(output, '..', 'ambient-validation.json');
    if (fs.existsSync(ambientReport)) { const raw = fs.readFileSync(ambientReport); const value = JSON.parse(raw); report.ambientReference = { path: path.relative(root, ambientReport), passed: value.passed, checks: value.checks?.length, sha256: digest(raw), scope: value.scope }; }
    base = await startServer();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    for (const theme of ['dark', 'light']) {
      for (const width of [1440, 390]) {
        const prefix = `${theme}-${width}`;
        const context = await browser.newContext({ viewport: { width, height: width === 390 ? 1000 : 960 }, reducedMotion: 'reduce' });
        try {
          const page = await context.newPage();
          page.on('pageerror', error => report.pageErrors.push({ prefix, error: error.message }));
          page.on('response', response => { if (response.status() >= 400) report.resourceErrors.push({ prefix, status: response.status(), url: response.url() }); });
          const original = await prepare(page, fixture, theme, svgs);
          const nav = page.getByRole('navigation', { name: '作品分类' });
          if (!await nav.isVisible()) await page.getByRole('button', { name: '打开菜单', exact: true }).click();
          assert.equal(await nav.getByRole('button').count(), 4);
          assert.equal(await page.getByRole('button', { name: '收藏总览', exact: true }).count(), 0);
          assert.deepEqual(await nav.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))), categories);
          await closeDrawer(page);
          const sections = [];
          for (const name of categories) {
            await navigate(page, name);
            const inspection = await inspectCollection(page, name === '游戏');
            if (name === '音乐') assert.equal(inspection.empty, true);
            sections.push({ name, screenshot: await screenshot(page, `${prefix}-section-${name}`), ...inspection });
          }
          await navigate(page, '游戏');
          const views = [];
          for (const view of ['grid', 'list']) {
            await page.getByRole('button', { name: view === 'grid' ? '卡片视图' : '列表视图', exact: true }).click();
            const inspection = await inspectCollection(page, true);
            views.push({ view, screenshot: await screenshot(page, `${prefix}-${view}`), ...inspection });
          }
          await page.getByRole('button', { name: '收起标签', exact: true }).click(); assert.equal(await page.locator('#library-tag-filters').isVisible(), false);
          await page.getByRole('button', { name: '展开标签', exact: true }).click(); assert.equal(await page.locator('#library-tag-filters').isVisible(), true);
          const tag = page.locator('.tag-type--gameplay .tag-filter').first(); const tagName = await tag.innerText(); await tag.click();
          const filtered = await page.locator('.media-card').count(); assert.ok(filtered > 0 && filtered < artworkNames.length); assert.equal(await tag.getAttribute('aria-pressed'), 'true');
          await page.getByRole('button', { name: '清除标签', exact: true }).click(); assert.equal(await page.locator('.media-card').count(), artworkNames.length);
          await checkOverlays(page, prefix);
          if (width === 1440) { await checkCoverDepth(page, prefix); await checkMintGlass(page, prefix); }
          await checkFixtureIntegrity(page, original, prefix);
          report.cases.push({ theme, width, sections, views, tags: { collapse: true, expand: true, filteredTag: tagName, filtered, clear: true } });
        } finally { await context.close(); }
      }
    }
    if (process.argv.includes('--record-preview')) report.preview = await recordPreview(fixture, svgs);
    assert.equal(report.pageErrors.length, 0); assert.equal(report.resourceErrors.length, 0);
    report.checks = [
      '四类作品直接导航，无收藏总览入口，默认进入游戏',
      '深色/浅色 × 1440 桌面/390 窄屏，四个板块与游戏卡片/列表无水平溢出',
      '六种游戏状态语义色及图标色，时长在前且字重更高；含持续游玩与已放弃',
      '收藏区与标签区透明无外层边框；标签展开、收起、筛选和清除可用',
      '详情、设置与标签管理弹窗上下滚动截图及结构检查，无旧短背景伪元素',
      '封面 hover 真实 3D 变换、内部图像视差，文字稳定，离开复位，系统减少动态禁用',
      '薄荷玻璃按钮指针反光、离开复位、减少动态禁用跟踪及减少透明度的可读实底回退',
      '全部视觉交互后隔离收藏原始字节保持不变',
    ];
    report.passed = true;
  } catch (error) { report.failure = error.stack; process.exitCode = 1; }
  finally {
    if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve));
    report.timestamp = new Date().toISOString(); fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, version, cases: report.cases.length, overlays: report.overlays.length, screenshots: report.screenshots.length, coverDepth: report.coverDepth.length, integrity: report.integrity.length, failure: report.failure, pageErrors: report.pageErrors, resourceErrors: report.resourceErrors }));
  }
})();
