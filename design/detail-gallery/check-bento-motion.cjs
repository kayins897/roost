// Static design preview only. Never opens Electron, a collection or a persistent browser profile.
// Usage: node design/detail-gallery/check-bento-motion.cjs <assembled-preview-directory>
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

if (!process.argv[2]) {
  console.error('Usage: node design/detail-gallery/check-bento-motion.cjs <assembled-preview-directory>');
  process.exit(1);
}

const directory = path.resolve(process.argv[2]);
const output = path.join(directory, 'screenshots');
const files = ['index.html', 'preview.css', 'preview.js', 'card-menu.js', 'layout.js', 'platforms.js', 'card-content.js'];
const ids = ['cover', 'grade', 'hours', 'platform', 'facts', 'impression', 'footprint', 'gallery', 'tags', 'count', 'review'];
const spans = { cover: [2, 3], grade: [2, 1], hours: [1, 1], platform: [1, 1], count: [1, 1], facts: [2, 1], impression: [3, 1], footprint: [1, 2], gallery: [2, 1], tags: [1, 1], review: [4, 1] };
const mediumSpans = { cover: [1, 3], grade: [1, 1], hours: [1, 1], platform: [1, 1], count: [1, 1], facts: [2, 1], impression: [2, 1], footprint: [1, 2], gallery: [1, 1], tags: [1, 1], review: [2, 1] };
const report = {
  passed: false, scope: 'isolated-static-design-preview', startedAt: new Date().toISOString(),
  testedFiles: {}, checks: [], layouts: [], motion: [], colorContrast: [], surfaceContrast: [], screenshots: [], errors: [], consoleErrors: [],
  externalRequests: [], failedLocalRequests: [], localStorageWrites: [], storageInstrumentationErrors: [],
  productionPersistenceValidated: false,
  unverified: ['原生 Electron、真实触屏和真实收藏持久化未验证', '图片上方的相册标题与半透明菜单按钮未逐像素验证；原生 select 展开选项和逐像素背景对比未验证；卡片双色渐变按实际 computed backgroundImage 以 1% 间隔采样，页面径向渐变不纳入文字背景'],
};
let temporary, server, browser, context, page, base;
const widget = id => page.locator('.widget[data-widget="' + id + '"]');
const menu = () => page.locator('#card-context-menu');
const near = (actual, expected, label, tolerance = 1) => assert.ok(Math.abs(actual - expected) <= tolerance, label + ': ' + actual + ' ≈ ' + expected);

async function check(name, run) {
  const started = Date.now();
  await run();
  report.checks.push({ name, passed: true, durationMs: Date.now() - started });
  console.log('PASS ' + name);
}

async function settle(milliseconds = 0) {
  if (milliseconds) await page.waitForTimeout(milliseconds);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function away() { await page.mouse.move(1, 1); await settle(280); }

async function ready() {
  await page.evaluate(() => document.fonts.ready);
  // Gallery images are lazy-loaded; load the supplied local fixtures before checking them.
  await page.locator('img').evaluateAll(images => images.forEach(image => { image.loading = 'eager'; }));
  await page.waitForFunction(() => [...document.querySelectorAll('.cover-card img,.gallery-photo img')].every(image => image.complete && image.naturalWidth > 0));
  assert.equal(await page.evaluate(() => window.__bentoStorageInstrumentationError || null), null, '存储写入监测可用');
  await away();
}

async function shot(name) {
  const file = 'bento-motion-' + name + '.png';
  // Keep real transitions running: disabling animations here would invalidate motion evidence.
  await page.screenshot({ path: path.join(output, file), animations: 'allow', fullPage: false });
  report.screenshots.push(file);
}

async function style(locator) {
  return locator.evaluate(node => {
    const css = getComputedStyle(node), matrix = new DOMMatrixReadOnly(css.transform === 'none' ? undefined : css.transform);
    return {
      transform: css.transform, scaleX: matrix.a, scaleY: matrix.d, translateX: matrix.e, translateY: matrix.f,
      shadow: css.boxShadow, background: css.backgroundColor, color: css.color,
      outlineStyle: css.outlineStyle, outlineWidth: css.outlineWidth, outlineColor: css.outlineColor,
      transitionProperty: css.transitionProperty, transitionDuration: css.transitionDuration,
      transitionTimingFunction: css.transitionTimingFunction, focusVisible: node.matches(':focus-visible'),
      rect: node.getBoundingClientRect().toJSON(), time: performance.now(),
    };
  });
}

function identity(value, label) {
  near(value.scaleX, 1, label + ' 水平缩放', 0.0005);
  near(value.scaleY, 1, label + ' 垂直缩放', 0.0005);
  near(value.translateX, 0, label + ' 水平位移', 0.01);
  near(value.translateY, 0, label + ' 垂直位移', 0.01);
}

function transition(value, property, milliseconds) {
  const properties = value.transitionProperty.split(',').map(item => item.trim());
  const durations = value.transitionDuration.split(',').map(item => parseFloat(item) * 1000);
  const easing = value.transitionTimingFunction.split(/,(?![^()]*\))/).map(item => item.trim());
  const index = properties.findIndex(item => item === property || item === 'all');
  assert.ok(index >= 0, property + ' 有独立平滑过渡');
  near(durations[index % durations.length], milliseconds, property + ' 过渡时长', 1);
  assert.equal(easing[index % easing.length], 'ease-out', property + ' 使用 ease-out');
}

async function layoutState() {
  return page.locator('.widget[data-widget]').evaluateAll(nodes => nodes.map(node => ({
    id: node.dataset.widget, size: node.dataset.size, color: node.dataset.color, hidden: node.hidden,
  })));
}

async function geometry() {
  return page.locator('.widget[data-widget]').evaluateAll(nodes => nodes.filter(node => !node.hidden).map(node => ({
    id: node.dataset.widget, left: node.offsetLeft, top: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight,
  })));
}

function sameGeometry(before, after, label) {
  assert.deepEqual(after.map(item => item.id), before.map(item => item.id), label + ' 卡片完整');
  for (let index = 0; index < before.length; index++) for (const key of ['left', 'top', 'width', 'height']) {
    near(after[index][key], before[index][key], label + ' ' + before[index].id + ' ' + key, 1);
  }
}

async function inspectLayout(label, expectedColumns, defaults = false) {
  await away();
  const value = await page.evaluate(() => {
    const grid = document.querySelector('.bento-grid'), css = getComputedStyle(grid);
    return {
      width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth,
      panel: document.querySelector('.detail-window').getBoundingClientRect().toJSON(),
      grid: grid.getBoundingClientRect().toJSON(), columns: css.gridTemplateColumns.split(/\s+/).filter(Boolean),
      gap: [parseFloat(css.columnGap), parseFloat(css.rowGap)], autoRows: css.gridAutoRows, autoFlow: css.gridAutoFlow,
      padding: [parseFloat(css.paddingLeft), parseFloat(css.paddingRight)],
      coverFit: getComputedStyle(document.querySelector('.cover-card img')).objectFit,
      coverImage: document.querySelector('.cover-card img').getBoundingClientRect().toJSON(),
      cards: [...grid.querySelectorAll('.widget[data-widget]')].filter(node => !node.hidden).map(node => {
        const style = getComputedStyle(node);
        return {
          id: node.dataset.widget, rect: node.getBoundingClientRect().toJSON(), position: style.position,
          column: style.gridColumn, row: style.gridRow, radius: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius],
          scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight,
        };
      }),
    };
  });
  report.layouts.push({ label, ...value });
  assert.equal(value.columns.length, expectedColumns, label + ' 实际底层列数');
  assert.deepEqual(value.gap, [16, 16], label + ' 两轴间距统一 16px');
  assert.equal(value.autoRows, 'auto', label + ' 原生内容行高');
  assert.equal(value.autoFlow, 'row', label + ' 保持自然顺序');
  assert.equal(value.coverFit, 'contain', label + ' 封面完整显示');
  assert.ok(value.documentWidth <= value.width + 1, label + ' 页面不横向溢出');
  assert.ok(value.panel.x >= -1 && value.panel.right <= value.width + 1, label + ' 详情在窗口内');
  for (const card of value.cards) {
    assert.ok(card.rect.width > 0 && card.rect.height > 0, label + ' 卡片实际有尺寸：' + card.id);
    assert.notEqual(card.position, 'absolute', label + ' 卡片由原生网格排布：' + card.id);
    assert.deepEqual(card.radius, ['24px', '24px', '24px', '24px'], label + ' 圆角 24px：' + card.id);
    assert.ok(card.rect.x >= value.grid.x - 1 && card.rect.right <= value.grid.right + 1, label + ' 卡片在栅格内：' + card.id);
    assert.ok(card.scrollWidth <= card.clientWidth + 1, label + ' 内容无横向溢出：' + card.id);
    assert.ok(card.scrollHeight <= card.clientHeight + 2, label + ' 内容未撑出卡片：' + card.id);
    if (defaults) {
      const [columns, rows] = expectedColumns === 4 ? spans[card.id] : value.width <= 700 ? [(['hours', 'platform', 'count'].includes(card.id) ? 1 : 2), 1] : mediumSpans[card.id];
      assert.ok(new RegExp('span ' + columns + '(?:\\D|$)').test(card.column), label + ' 实际列跨度：' + card.id);
      // A single unspanned responsive row may be represented by auto.
      assert.ok(rows === 1 && card.row === 'auto' || new RegExp('span ' + rows + '(?:\\D|$)').test(card.row), label + ' 实际行跨度：' + card.id);
      const columnWidth = parseFloat(value.columns[0]);
      near(card.rect.width, columnWidth * columns + value.gap[0] * (columns - 1), label + ' 测量列宽：' + card.id, 1);
    }
  }
  for (let i = 0; i < value.cards.length; i++) for (let j = i + 1; j < value.cards.length; j++) {
    const a = value.cards[i], b = value.cards[j];
    const overlapX = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.x, b.rect.x);
    const overlapY = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.y, b.rect.y);
    assert.ok(overlapX <= 1 || overlapY <= 1, label + ' 卡片不重叠：' + a.id + '/' + b.id);
  }
  if (defaults && expectedColumns === 4) {
    const columnWidth = parseFloat(value.columns[0]);
    const measuredColumns = value.cards.map(card => Math.round((card.rect.width + value.gap[0]) / (columnWidth + value.gap[0])));
    assert.deepEqual([...new Set(measuredColumns)].sort(), [1, 2, 3, 4], label + ' 真实存在四种宽度层级');
    const shapes = [];
    for (const card of value.cards) if (!shapes.some(shape => Math.abs(shape.width - card.rect.width) <= 1 && Math.abs(shape.height - card.rect.height) <= 1)) shapes.push({ width: card.rect.width, height: card.rect.height });
    report.layouts.at(-1).measuredWidthDistribution = Object.fromEntries([1, 2, 3, 4].map(columns => [columns, measuredColumns.filter(measured => measured === columns).length]));
    report.layouts.at(-1).measuredShapes = shapes;
    assert.ok(shapes.length >= 6, label + ' 至少六种真实宽高组合，实际 ' + shapes.length);
  }
  return Object.fromEntries(value.cards.map(card => [card.id, card.rect]));
}

// Runs in the browser against computed paint values, independently of the preview's color algorithm.
function paintedContrast(nodes, pseudo) {
  const parse = value => {
    const match = value.match(/^rgba?\(([^)]+)\)$/);
    if (!match) throw new Error('Unsupported computed color: ' + value);
    const channels = match[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [...channels.slice(0, 3), channels[3] ?? 1];
  };
  const blend = (front, back) => front.slice(0, 3).map((channel, index) => channel * front[3] + back[index] * (1 - front[3]));
  const luminance = rgb => rgb.map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  return nodes.filter(node => node.getClientRects().length && getComputedStyle(node).visibility === 'visible').map(node => {
    for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
      if (Number(getComputedStyle(ancestor).opacity) !== 1) throw new Error('Group opacity needs separate contrast measurement: ' + ancestor.className);
    }
    // Resolve the actual painted surfaces, including transparent child controls.
    // Stop at an opaque surface so images/gradients behind the widget cannot contaminate it.
    const layers = [], backgroundImages = []; let ancestor = node;
    while (ancestor) {
      const css = getComputedStyle(ancestor), color = parse(css.backgroundColor);
      let paints = [color], opaque = color[3] === 1;
      if (css.backgroundImage !== 'none') {
        const image = css.backgroundImage, colors = image.match(/rgba?\([^)]+\)/g) || [];
        // The design uses one two-stop linear gradient. Fail explicitly if that contract grows.
        if (!image.startsWith('linear-gradient(') || (image.match(/gradient\(/g) || []).length !== 1 || colors.length !== 2) throw new Error('Unsupported contrast background: ' + image);
        const interpolation = image.slice(0, image.indexOf(colors[0])).match(/\bin\s+([a-z0-9-]+)/i)?.[1];
        if (interpolation && interpolation !== 'srgb') throw new Error('Unsupported gradient interpolation: ' + image);
        const positions = [...image.matchAll(/\)\s+(-?[\d.]+)(%|px)/g)].map(match => match[1] + match[2]);
        if (positions.length && (positions.length !== 2 || positions[0] !== '0%' || positions[1] !== '100%')) throw new Error('Unsupported gradient stop positions: ' + image);
        const [start, end] = colors.map(parse);
        if (start[3] !== 1 || end[3] !== 1) throw new Error('Translucent gradients need separate contrast measurement: ' + image);
        paints = Array.from({ length: 101 }, (_, index) => start.map((channel, offset) => channel + (end[offset] - channel) * index / 100));
        opaque = true;
        backgroundImages.push(image);
      }
      layers.unshift(paints);
      if (opaque) break;
      ancestor = ancestor.parentElement;
    }
    if (!ancestor) throw new Error('Contrast needs an opaque backing surface');
    let backgrounds = [[255, 255, 255]];
    for (const paints of layers) backgrounds = backgrounds.flatMap(background => paints.map(paint => blend(paint, background)));
    const css = getComputedStyle(node, pseudo), color = parse(css.color);
    if (pseudo) color[3] *= Number(css.opacity);
    const measurements = backgrounds.map(background => {
      const foreground = blend(color, background), a = luminance(foreground), b = luminance(background);
      return { background, luminance: b, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
    const worst = measurements.reduce((a, b) => a.ratio < b.ratio ? a : b);
    return { id: node.dataset.widget, text: (node.value || node.textContent || node.getAttribute('aria-label') || '').trim().slice(0, 60), color: css.color, background: worst.background, backgroundImages,
      gradientSampleCount: backgroundImages.length ? 101 : 0, luminance: { min: Math.min(...measurements.map(sample => sample.luminance)), max: Math.max(...measurements.map(sample => sample.luminance)) }, ratio: worst.ratio, fontSize: css.fontSize };
  });
}

async function contrastSamples(label, probes) {
  for (const [id, selector, category, pseudo = null] of probes) {
    const samples = await (id === 'menu' ? menu() : widget(id)).locator(selector).evaluateAll(paintedContrast, pseudo);
    assert.ok(samples.length > 0, label + ' 有实际可见样本：' + id + ' ' + selector);
    for (const sample of samples) {
      report.colorContrast.push({ label, selector, category, pseudo, minimum: 4.5, ...sample, id });
      assert.ok(sample.ratio >= 4.5, label + ' ' + id + ' ' + selector + (pseudo || '') + ' 对比度 ' + sample.ratio.toFixed(2) + ' 应至少 4.5');
    }
  }
}

async function rightClick(id) {
  const card = widget(id);
  await card.scrollIntoViewIfNeeded();
  await card.click({ button: 'right', position: { x: 12, y: 35 } });
  assert.equal(await menu().isVisible(), true, '实际鼠标右键打开菜单');
  await settle();
}

async function appearance(id) {
  await rightClick(id);
  await page.locator('#context-appearance').click();
  assert.equal(await menu().getAttribute('data-page'), 'appearance');
}

async function reset() {
  await page.setViewportSize({ width: 1440, height: 1060 });
  await page.reload();
  await ready();
}

async function pressButton(selector, label) {
  const button = page.locator(selector);
  await button.scrollIntoViewIfNeeded();
  await button.hover();
  await settle(280);
  const card = button.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," widget ")][1]');
  const before = await style(card), stable = await geometry();
  await page.mouse.down();
  try {
    await settle(260);
    const pressed = await style(button), parent = await style(card);
    report.motion.push({ label, before, pressed, parent });
    near(pressed.scaleX, 0.98, label + ' 按钮按下缩小', 0.001);
    near(pressed.scaleY, 0.98, label + ' 按钮按下缩小', 0.001);
    near(parent.scaleX, before.scaleX, label + ' 整卡不随按钮收缩', 0.001);
    near(parent.translateY, before.translateY, label + ' 卡片保持悬停位置', 0.01);
    sameGeometry(stable, await geometry(), label + ' 按住按钮时卡位稳定');
    await shot(label);
  } finally {
    // Release off the control so this feedback check does not activate its business action.
    await page.mouse.move(1, 1);
    await page.mouse.up();
    await settle(280);
  }
}

(async () => {
  for (const file of files) {
    assert.ok(fs.statSync(path.join(directory, file)).isFile(), '参数必须为组装预览目录：' + file);
    report.testedFiles[file] = createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex');
  }
  report.testedFiles['assets/platform-icons.js'] = createHash('sha256').update(fs.readFileSync(path.join(directory, 'assets/platform-icons.js'))).digest('hex');
  fs.mkdirSync(output, { recursive: true });
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-bento-motion-'));
  const fixture = path.join(temporary, 'preview');
  fs.mkdirSync(fixture);
  for (const file of files) fs.copyFileSync(path.join(directory, file), path.join(fixture, file));
  for (const file of files) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(fixture, file))).digest('hex'), report.testedFiles[file], '隔离副本与被测哈希一致：' + file);
  fs.cpSync(path.join(directory, 'assets'), path.join(fixture, 'assets'), { recursive: true, dereference: true });
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(fixture, 'assets/platform-icons.js'))).digest('hex'), report.testedFiles['assets/platform-icons.js'], '隔离图标数据副本与被测哈希一致');
  report.isolation = { temporaryRoot: temporary, fixture: 'Copy of supplied static seven files and assets only', browserProfile: 'Playwright ephemeral browser context', storagePolicy: 'Record and block all localStorage writes', realApplicationStarted: false, collectionAccess: false };
  const inside = (root, candidate) => { const relative = path.relative(root, candidate); return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };
  server = http.createServer((request, response) => {
    try {
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      const file = path.resolve(fixture, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
      if (!inside(fixture, file) || !fs.existsSync(file) || !fs.statSync(file).isFile() || !inside(fixture, fs.realpathSync(file))) { response.writeHead(404); response.end(); return; }
      const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
      response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(response);
    } catch { response.writeHead(400); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  report.browser = 'Microsoft Edge ' + browser.version();
  report.environment = { platform: process.platform, node: process.version, headless: true, deviceScaleFactor: 1 };
  context = await browser.newContext({ viewport: { width: 1440, height: 1060 }, reducedMotion: 'no-preference', serviceWorkers: 'block', acceptDownloads: false });
  await context.exposeBinding('__reportBentoStorageWrite', (_, value) => report.localStorageWrites.push(value));
  await context.addInitScript(() => {
    try {
      const storage = window.localStorage, pending = [];
      const record = (method, key) => pending.push(Promise.resolve(window.__reportBentoStorageWrite({ method, key: key == null ? null : String(key) })));
      const proxy = new Proxy(storage, {
        get(target, key) {
          if (['setItem', 'removeItem', 'clear'].includes(key)) return (...args) => { record(key, args[0]); };
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
        set(target, key) { record('assign', key); return true; },
        deleteProperty(target, key) { record('delete', key); return true; },
        defineProperty(target, key) { record('defineProperty', key); return true; },
      });
      Object.defineProperty(window, 'localStorage', { configurable: true, get: () => proxy });
      for (const method of ['setItem', 'removeItem', 'clear']) {
        const native = Storage.prototype[method];
        Storage.prototype[method] = function (...args) { if (this === storage || this === proxy) { record(method, args[0]); return; } return native.apply(this, args); };
      }
      window.__flushBentoStorageReports = () => Promise.all(pending);
    } catch (error) { window.__bentoStorageInstrumentationError = String(error); }
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === base || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    report.externalRequests.push({ method: route.request().method(), url: url.href });
    return route.abort();
  });
  page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) report.failedLocalRequests.push({ url: response.url(), status: response.status() }); });
  page.on('requestfailed', request => { if (request.url().startsWith(base)) report.failedLocalRequests.push({ url: request.url(), failure: request.failure()?.errorText }); });
  await page.goto(base);
  await ready();

  await check('桌面真实四列、四种宽度与至少六种宽高组合的错落 Bento', async () => {
    assert.deepEqual(await page.locator('.widget[data-widget]').evaluateAll(nodes => nodes.map(node => node.dataset.widget)), ids);
    const boxes = await inspectLayout('desktop-default', 4, true);
    near(boxes.cover.y, boxes.grade.y, '封面和体验同顶');
    near(boxes.grade.x, boxes.facts.x, '体验和资料位于右侧同列');
    near(boxes.hours.y - boxes.grade.bottom, 16, '体验和统计上下间距');
    near(boxes.facts.y - boxes.hours.bottom, 16, '统计和资料上下间距');
    near(boxes.cover.bottom, boxes.facts.bottom, '封面跨过右侧三行');
    near(boxes.hours.y, boxes.platform.y, '时长和拥有平台并排');
    near(boxes.platform.x - boxes.hours.right, 16, '时长与平台实际间距');
    near(boxes.impression.y, boxes.footprint.y, '印象和足迹并排');
    near(boxes.footprint.x - boxes.impression.right, 16, '三列印象与单列足迹间距');
    near(boxes.gallery.y - boxes.impression.bottom, 16, '相册在印象下一行');
    near(boxes.gallery.y, boxes.tags.y, '相册与标签同顶');
    near(boxes.tags.x - boxes.gallery.right, 16, '相册和标签间距');
    near(boxes.footprint.bottom, boxes.tags.bottom, '足迹跨过印象与相册两行');
    near(boxes.review.y - boxes.footprint.bottom, 16, '测评位于拼图下一整行');
    assert.ok(boxes.cover.height > boxes.cover.width && boxes.footprint.height > boxes.footprint.width, '封面与足迹形成竖长卡');
    assert.ok(boxes.impression.width > boxes.gallery.width && boxes.review.width > boxes.impression.width, '三列印象与四列测评形成不同宽度');
    await shot('01-desktop-default');
  });

  await check('断点两侧、典型中窗与窄窗的列数、16px 间距、24px 圆角和边界', async () => {
    for (const width of [1920, 1051, 1050, 880, 701, 700, 390, 320]) {
      await page.setViewportSize({ width, height: width <= 700 ? 844 : 1060 });
      const boxes = await inspectLayout('viewport-' + width, width > 1050 ? 4 : 2, true);
      if (width <= 700) {
        near(boxes.hours.y, boxes.platform.y, '窄窗时长与平台实际并排');
        assert.ok(boxes.impression.width > boxes.hours.width * 1.8, '窄窗大卡满宽');
        const image = report.layouts.at(-1).coverImage;
        assert.ok(image.height <= Math.min((width <= 700 ? 844 : 1060) * .62, 520) + 1, '窄窗封面按可用高度显示');
        assert.ok(image.y >= boxes.cover.y - 1 && image.bottom <= boxes.cover.bottom + 1, '窄窗封面图片完整落在卡片内');
      } else if (width <= 1050) {
        near(boxes.cover.y, boxes.grade.y, '中窗封面与体验同顶');
        near(boxes.grade.x, boxes.hours.x, '中窗体验与统计同列');
        near(boxes.hours.x, boxes.platform.x, '中窗时长与平台纵向同列');
        near(boxes.hours.y - boxes.grade.bottom, 16, '中窗体验与时长间距');
        near(boxes.platform.y - boxes.hours.bottom, 16, '中窗时长与平台纵向间距');
        near(boxes.cover.bottom, boxes.platform.bottom, '中窗封面跨右侧三卡');
        near(boxes.footprint.y, boxes.gallery.y, '中窗足迹与相册同顶');
        near(boxes.tags.y - boxes.gallery.bottom, 16, '中窗相册与标签纵向间距');
        near(boxes.footprint.bottom, boxes.tags.bottom, '中窗足迹跨相册和标签');
      }
      if ([880, 390].includes(width)) await shot('02-responsive-' + width);
    }
    await reset();
  });

  await check('卡片明暗层次、正文与不透明输入表面计算对比度达到4.5', async () => {
    const surfaces = await page.locator('.widget[data-widget]').evaluateAll(paintedContrast, null);
    report.surfaceContrast = surfaces;
    const darkest = Math.min(...surfaces.map(surface => surface.luminance.max));
    const bright = surfaces.filter(surface => surface.luminance.min >= .30);
    assert.ok(bright.length >= 1); assert.ok(surfaces.filter(surface => surface.luminance.max <= .15).length >= 3);
    for (const surface of bright) { surface.ratioToDarkest = (surface.luminance.min + .05) / (darkest + .05); assert.ok(surface.ratioToDarkest >= 4.5); }
    await contrastSamples('default', [
      ...ids.filter(id => !['cover','count','gallery'].includes(id)).map(id => [id,'h2','normal']),
      ['grade','#grade-value','normal'], ['grade','#grade-unit','auxiliary'],
      ['footprint','#current-state,#priority-value','normal'], ['footprint','.eyebrow,#priority-field>span,time,li p','auxiliary'],
      ['facts','dd','normal'], ['facts','dt,.source-link','auxiliary'],
      ['hours','.stat-value','normal'], ['hours','.stat-value small,#last-run-value','auxiliary'],
      ['platform','#platform-list .platform-badge','normal'], ['tags','.tag-row>span,.tag-pill','auxiliary'],
      ['impression','#impression-count','auxiliary'], ['impression','textarea','form'], ['impression','textarea','form-placeholder','::placeholder'],
      ['footprint','li strong','normal'], ['review','#review-count','auxiliary'],
    ]);
    await appearance('cover'); await page.locator('#context-manage').click();
    await page.locator('[data-toggle-widget=count]').setChecked(true); await page.locator('#layout-done').click(); await away();
    await contrastSamples('restored-count', [['count','h2,.stat-value,.stat-value small','normal']]);
    for (const id of ['grade','facts','tags','hours','count','impression','review','platform','footprint']) {
      await rightClick(id);
      if (id === 'footprint') await page.locator('.context-note-editor summary').click();
      await contrastSamples('content-editor-' + id, [['menu','input:not([type=range]):not([type=color]),textarea,select','form']]);
      await page.locator('#context-close').click();
    }
    await page.locator('#review-toggle').click();
    await contrastSamples('review-open', [['review','#review-body textarea','form'],['review','#review-body small','auxiliary']]);
    await reset();
  });

  await check('默认渐变改为自定义纯色后恢复，不改尺寸、顺序或内容', async () => {
    const surface = () => widget('grade').evaluate(node => {
      const css = getComputedStyle(node);
      return { image: css.backgroundImage, color: css.backgroundColor, border: css.borderColor };
    });
    const content = () => page.locator('.bento-grid').evaluate(grid => ({
      text: grid.innerText, fields: [...grid.querySelectorAll('input:not([type=file]),textarea,select')].map(node => ({ value: node.value, checked: node.checked })),
      photos: [...grid.querySelectorAll('.gallery-photo img')].map(image => image.getAttribute('src')),
    }));
    const original = await surface(), layout = await layoutState(), stable = await geometry(), savedContent = await content();
    assert.ok(original.image.startsWith('linear-gradient('), '默认评分卡真实使用渐变');
    await appearance('grade');
    await page.locator('#card-color-hex').fill('#FFFFFF');
    await page.locator('#card-color-apply').click();
    await away();
    const white = await surface();
    assert.equal(white.image, 'none', '自定义白色移除实际背景渐变');
    assert.equal(white.color, 'rgb(255, 255, 255)', '自定义白色实际可见');
    assert.deepEqual(await layoutState(), layout.map(card => card.id === 'grade' ? { ...card, color: '#FFFFFF' } : card), '仅当前卡片色值改变');
    sameGeometry(stable, await geometry(), '自定义纯色卡位');
    assert.deepEqual(await content(), savedContent, '自定义纯色保留业务内容');
    await contrastSamples('custom-white-surface', [['grade', 'h2,#grade-value', 'normal'], ['grade', '#grade-unit', 'auxiliary']]);
    await appearance('grade');
    await page.locator('#context-default-color').click();
    await away();
    assert.deepEqual(await surface(), original, '恢复默认色同时恢复实际渐变和描边');
    assert.deepEqual(await layoutState(), layout, '恢复默认表面不改变布局状态');
    sameGeometry(stable, await geometry(), '恢复默认表面卡位');
    assert.deepEqual(await content(), savedContent, '恢复默认表面保留业务内容');
    await shot('18-default-surface-restored');
    await reset();
  });

  await check('真实 hover 中间帧、上浮缩放终态、图标反馈与移出复位', async () => {
    assert.equal(await page.evaluate(() => matchMedia('(hover:hover) and (pointer:fine)').matches), true, 'Edge 细指针悬停环境');
    const card = widget('grade'), icon = card.locator('.widget-icon').first();
    assert.ok(await page.locator('.widget-icon').count() >= 8, '至少八处卡片小图标');
    const start = await style(card), iconStart = await style(icon), stable = await geometry();
    identity(start, '未悬停');
    transition(start, 'transform', 240);
    transition(start, 'box-shadow', 240);
    await card.hover({ position: { x: 35, y: 70 } });
    await page.waitForTimeout(65);
    const middle = await style(card);
    assert.ok(middle.scaleX > 1 && middle.scaleX < 1.01, '真实过渡帧位于起终态之间');
    await shot('03-hover-middle');
    await settle(280);
    const end = await style(card), iconEnd = await style(icon);
    near(end.scaleX, 1.01, '悬停缩放', 0.0005);
    near(end.scaleY, 1.01, '悬停缩放', 0.0005);
    near(end.translateY, -4, '悬停上浮', 0.01);
    near(end.rect.width / start.rect.width, 1.01, '实际渲染宽度缩放', 0.001);
    near((end.rect.y + end.rect.height / 2) - (start.rect.y + start.rect.height / 2), -4, '实际渲染中心上浮', 0.1);
    assert.notEqual(end.shadow, start.shadow, '悬停出现柔和阴影');
    assert.notEqual(end.shadow, 'none', '悬停阴影实际可见');
    near(iconEnd.scaleX, 1.1, '内部图标缩放', 0.001);
    assert.ok(iconEnd.background !== iconStart.background || iconEnd.color !== iconStart.color, '图标实际换色');
    await settle(650);
    sameGeometry(stable, await geometry(), '持续 hover 不改变原生网格卡位');
    await shot('04-hover-final');
    await away();
    const returned = await style(card);
    identity(returned, '移出复位');
    assert.equal(returned.shadow, start.shadow, '移出恢复原阴影');
    sameGeometry(stable, await geometry(), '移出后卡位保持');
    report.motion.push({ label: 'hover', start, middle, end, returned, iconStart, iconEnd });
    await shot('05-hover-return');
  });

  await check('普通按钮与图标按钮实际按住时仅按钮缩小到 .98', async () => {
    await pressButton('#review-toggle', '06-button-pressed');
    await pressButton('.favorite.widget-icon', '07-icon-button-pressed');
  });

  await check('只读文字按住不触发整卡收缩，键盘焦点环仍平滑可见', async () => {
    const input = page.locator('#impression'), card = widget('impression');
    await input.scrollIntoViewIfNeeded();
    await away();
    const value = await input.inputValue();
    await input.hover();
    await settle(280);
    const before = await style(card), stable = await geometry();
    await page.mouse.down();
    try {
      await settle(260);
      const pressed = await style(card);
      near(pressed.scaleX, 1.01, '文本输入期间卡片仍为 hover 尺寸', 0.001);
      near(pressed.scaleX, before.scaleX, '文本输入不缩整卡', 0.001);
      identity(await style(input), '输入框自身');
      sameGeometry(stable, await geometry(), '按住输入框卡位稳定');
      await shot('08-input-pressed');
    } finally { await page.mouse.up(); }
    assert.equal(await input.inputValue(), value, '反馈检查不改文本');
    await away();
    await input.evaluate(node => node.blur());
    await settle(240);
    const unfocused = await style(input);
    transition(unfocused, 'box-shadow', 200);
    await page.keyboard.press('Tab');
    await input.focus();
    await page.waitForTimeout(65);
    const middle = await style(input);
    await shot('09-focus-middle');
    await settle(240);
    const focused = await style(input);
    assert.equal(focused.focusVisible, true, '键盘焦点命中 focus-visible');
    assert.notEqual(focused.shadow, 'none', '输入框有实际焦点环');
    assert.notEqual(focused.shadow, unfocused.shadow, '焦点环区别于未聚焦');
    assert.notEqual(middle.shadow, unfocused.shadow, '焦点环过渡已开始');
    assert.notEqual(middle.shadow, focused.shadow, '捕获真实焦点环中间帧');
    report.motion.push({ label: 'focus-ring', unfocused, middle, focused });
    await shot('10-focus-final');
    await reset();
  });

  await check('右键菜单与布局编辑禁用卡片 transform 且进出卡位稳定', async () => {
    const stable = await geometry();
    await widget('grade').hover({ position: { x: 35, y: 70 } });
    await settle(280);
    await rightClick('grade');
    assert.equal(await page.locator('.detail-window').evaluate(node => node.classList.contains('card-settings-open')), true);
    for (const id of ['grade', 'facts', 'cover']) {
      await widget(id).hover({ position: { x: 10, y: 20 }, force: true });
      identity(await style(widget(id)), '菜单打开：' + id);
    }
    sameGeometry(stable, await geometry(), '菜单打开卡位');
    await shot('11-menu-no-motion');
    await page.locator('#context-appearance').click();
    await page.locator('#edit-layout').click();
    assert.equal(await page.locator('#layout-tools').isVisible(), true);
    assert.equal(await menu().isVisible(), false);
    for (const id of ['grade', 'facts', 'cover']) {
      await widget(id).hover({ position: { x: 10, y: 35 } });
      identity(await style(widget(id)), '布局编辑：' + id);
    }
    sameGeometry(stable, await geometry(), '进入布局编辑卡位');
    await rightClick('grade');
    identity(await style(widget('grade')), '编辑中打开菜单');
    sameGeometry(stable, await geometry(), '编辑菜单卡位');
    await shot('12-editing-no-motion');
    await page.keyboard.press('Escape');
    await page.locator('#layout-cancel').click();
    await away();
    sameGeometry(stable, await geometry(), '退出编辑恢复浏览卡位');
    await shot('13-editing-return');
  });

  await check('合成长资料撑高 auto 行且反复 hover 不累积增高或溢出', async () => {
    const before = await widget('facts').boundingBox();
    await rightClick('facts');
    await page.locator('#context-fact-original').fill('合成验收资料用于检查换行与内容撑高。'.repeat(24));
    await page.locator('[data-content-save=facts]').click();
    const boxes = await inspectLayout('synthetic-long-content', 4);
    assert.ok(boxes.facts.height > before.height + 30, '长资料实际撑高卡片与网格行');
    const stable = await geometry();
    for (let turn = 0; turn < 3; turn++) {
      await widget('facts').hover({ position: { x: 35, y: 70 } });
      await settle(300);
      sameGeometry(stable, await geometry(), '长资料悬停第 ' + (turn + 1) + ' 次');
      await away();
    }
    await shot('14-content-growth');
    await reset();
  });

  await check('尺寸实际变化及自定义卡片完成后的跨窗口无损回流', async () => {
    const widths = {};
    for (const size of ['small', 'medium', 'large']) {
      await appearance('facts');
      await menu().locator('[data-menu-size="' + size + '"]').click();
      await away();
      widths[size] = (await widget('facts').boundingBox()).width;
    }
    assert.ok(widths.small < widths.medium && widths.medium < widths.large, '尺寸选项确实改变卡片宽度');
    report.sizeWidths = widths;
    await appearance('facts');
    await page.locator('#card-color-hex').fill('#394B61');
    await page.locator('#card-color-apply').click();
    await rightClick('facts');
    await page.locator('#context-appearance').click();
    await page.locator('#edit-layout').click();
    await widget('footprint').locator('[data-action="hide"]').click();
    await widget('facts').locator('[data-action="move-up"]').click();
    await page.locator('#layout-done').click();
    await away();
    const custom = await layoutState();
    assert.equal(custom.find(item => item.id === 'facts').color, '#394B61');
    assert.equal(custom.find(item => item.id === 'footprint').hidden, true);
    for (const width of [1440, 880, 390, 1440]) {
      await page.setViewportSize({ width, height: width <= 700 ? 844 : 1060 });
      await inspectLayout('custom-' + width, width > 1050 ? 4 : 2);
      assert.deepEqual(await layoutState(), custom, '响应窗口变化保留尺寸、颜色、显隐和顺序');
    }
    await shot('15-custom-layout');
    await reset();
  });

  await check('减少动态下卡片、图标与按下按钮均无 transform 且焦点仍可见', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await away();
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    const stable = await geometry();
    const button = page.locator('.favorite.widget-icon');
    await button.hover();
    await page.mouse.down();
    try {
      await settle(280);
      for (const target of [widget('grade'), button, widget('grade').locator('.widget-icon').first()]) {
        const value = await style(target);
        identity(value, '减少动态');
        assert.ok(value.transitionDuration.split(',').every(item => parseFloat(item) <= 0.001), '减少动态停用过渡');
      }
      sameGeometry(stable, await geometry(), '减少动态按住不改卡位');
      await shot('16-reduced-motion-pressed');
    } finally { await page.mouse.move(1, 1); await page.mouse.up(); }
    await page.keyboard.press('Tab');
    const input = page.locator('#impression');
    await input.focus();
    const focused = await style(input);
    assert.equal(focused.focusVisible, true);
    assert.notEqual(focused.shadow, 'none', '减少动态仍有可见焦点环');
    identity(await style(widget('impression')), '减少动态输入卡片');
    await shot('17-reduced-motion-focus');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  await check('七个预览文件及图标数据哈希稳定、无外网、无 storage 写入且无页面错误', async () => {
    await page.evaluate(() => window.__flushBentoStorageReports());
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), [], '本地存储保持空白');
    assert.deepEqual(report.localStorageWrites, [], '所有生命周期未尝试写入 localStorage');
    assert.deepEqual(report.externalRequests, [], '仅访问隔离本地素材');
    assert.deepEqual(report.failedLocalRequests, [], '本地素材无请求失败');
    assert.deepEqual(report.errors, [], '无页面脚本错误');
    assert.deepEqual(report.consoleErrors, [], '无浏览器错误');
    for (const file of [...files, 'assets/platform-icons.js']) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex'), report.testedFiles[file], '被测输入未在运行中变化：' + file);
  });
  report.passed = true;
})().catch(error => {
  report.error = error.stack;
  process.exitCode = 1;
  console.error(error);
}).finally(async () => {
  if (page && !report.passed) { try { await shot('failure'); } catch { /* Keep original failure. */ } }
  if (page) { try { await page.evaluate(() => window.__flushBentoStorageReports?.()); } catch { /* Page may have failed to load. */ } }
  await context?.close();
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  // Only remove the independently allocated temporary fixture, never a caller-supplied path.
  if (temporary) {
    const resolved = path.resolve(temporary), tempRoot = path.resolve(os.tmpdir());
    assert.equal(path.dirname(resolved), tempRoot, '清理限定临时根目录');
    assert.ok(path.basename(resolved).startsWith('qiyu-bento-motion-'), '清理限定本次测试夹具');
    fs.rmSync(resolved, { recursive: true, force: true });
  }
  report.finishedAt = new Date().toISOString();
  if (fs.existsSync(output)) fs.writeFileSync(path.join(output, 'bento-motion-validation.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, output }));
});
