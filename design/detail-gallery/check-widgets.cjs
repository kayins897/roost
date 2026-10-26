// Design prototype only. Serves the supplied preview directory and never opens the app or a user-data directory.
// Usage: node design/detail-gallery/check-widgets.cjs <assembled-preview-directory>
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

if (!process.argv[2]) {
  console.error('Usage: node design/detail-gallery/check-widgets.cjs <assembled-preview-directory>');
  process.exit(1);
}

const directory = path.resolve(process.argv[2]);
const output = path.join(directory, 'screenshots');
const widgetIds = ['cover', 'experience', 'facts', 'hours', 'count', 'tags', 'impression', 'footprint', 'gallery', 'review'];
const fieldIds = ['original', 'year', 'date', 'creator', 'platform', 'source'];
const report = {
  passed: false, scope: 'design-prototype', productionPersistenceValidated: false,
  startedAt: new Date().toISOString(), testedFiles: {},
  dragValidation: 'HTML DragEvent dispatch path only',
  browserMouseDragValidated: false,
  unverified: ['浏览器鼠标拖动未验证', '原生Electron/真实触屏拖动未验证'],
  checks: [], errors: [], externalRequests: [], localStorageWrites: [], layouts: [], screenshots: [],
};
let server, browser, context, page, base, initialLayout, initialContent;
const widget = id => page.locator('.widget[data-widget="' + id + '"]');
const action = (id, name) => widget(id).locator('.widget-tools [data-action="' + name + '"]');
const toggleWidget = id => page.locator('#widget-manager [data-toggle-widget="' + id + '"]');
const toggleField = id => page.locator('#widget-manager [data-toggle-field="' + id + '"]');

async function check(name, run) {
  await run();
  report.checks.push(name);
  console.log('PASS ' + name);
}

async function shot(name) {
  const file = 'widgets-' + name + '.png';
  await page.locator('.detail-window').evaluate(node => { node.scrollTop = 0; });
  await page.screenshot({ path: path.join(output, file), animations: 'disabled', fullPage: false });
  report.screenshots.push(file);
}

async function settle() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function ready() {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.querySelectorAll('.cover-card img,.gallery-photo img')]
    .every(image => image.complete && image.naturalWidth > 0));
  assert.equal(await page.evaluate(() => window.__widgetStorageInstrumentationError || null), null, '浏览器存储写入监测必须可用');
  await settle();
}

async function enterEdit() {
  await widget('cover').locator('img').click({ button: 'right' });
  assert.equal(await page.locator('#card-context-menu').isVisible(), true, '右键封面打开卡片菜单');
  await page.locator('#edit-layout').click();
  assert.equal(await page.locator('#layout-tools').isVisible(), true, '进入布局编辑');
  assert.equal(await page.locator('#impression').evaluate(node => Boolean(node.closest('[inert]'))), true, '布局编辑期间业务内容禁止误操作');
}

async function manager() {
  if (!await page.locator('#widget-manager').isVisible()) await page.locator('#manage-widgets').click();
  assert.equal(await page.locator('#widget-manager').isVisible(), true, '卡片管理始终可打开');
}

async function fieldManager() {
  await manager();
  if (!await toggleField('original').isVisible()) {
    await page.locator('#widget-manager details').filter({ has: page.locator('[data-toggle-field="original"]') }).locator('summary').click();
  }
}

async function order() {
  return page.locator('.widget[data-widget]').evaluateAll(nodes => nodes.map(node => node.dataset.widget));
}

async function captureLayout() {
  await settle();
  return page.evaluate(() => ({
    widgets: [...document.querySelectorAll('.widget[data-widget]')].map(node => {
      const css = getComputedStyle(node);
      return {
        id: node.dataset.widget, hidden: node.hidden, size: node.dataset.size, color: node.dataset.color,
        width: node.hidden ? null : Math.round(node.getBoundingClientRect().width * 100) / 100,
        columns: [css.gridColumnStart, css.gridColumnEnd],
      };
    }),
    fields: [...document.querySelectorAll('[data-field-row]')].map(node => ({ id: node.dataset.fieldRow, hidden: node.hidden })),
  }));
}

async function captureContent() {
  return page.evaluate(() => ({
    impression: document.querySelector('#impression').value,
    review: document.querySelector('#review-body textarea').value,
    facts: [...document.querySelectorAll('[data-field-row]')].map(node => [node.dataset.fieldRow, node.textContent]),
    photos: [...document.querySelectorAll('.gallery-photo')].map(node => ({
      src: node.querySelector('img').getAttribute('src'), caption: node.querySelector('figcaption').textContent,
    })),
    hours: document.querySelector('#hours-value').textContent,
    count: document.querySelector('#count-value').textContent,
  }));
}

async function resize(id, size) {
  await action(id, 'size').click();
  const menu = widget(id).locator('.widget-sizes');
  assert.equal(await menu.isVisible(), true, '显示尺寸选项');
  await menu.locator('button[data-size="' + size + '"]').click();
  await settle();
}

function moved(items, id, nextIndex) {
  const next = items.filter(value => value !== id);
  next.splice(nextIndex, 0, id);
  return next;
}

async function drag(id, targetId, half) {
  const source = widget(id).locator('.widget-drag');
  await source.scrollIntoViewIfNeeded();
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  try {
    await source.dispatchEvent('dragstart', { dataTransfer: transfer });
    const target = widget(targetId);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    assert.ok(box && box.width > 0 && box.height > 0, '拖动目标必须可见');
    const position = { dataTransfer: transfer, clientX: box.x + box.width / 2, clientY: box.y + box.height * (half === 'before' ? 0.25 : 0.75) };
    await target.dispatchEvent('dragover', position);
    await target.dispatchEvent('drop', position);
    await source.dispatchEvent('dragend', { dataTransfer: transfer });
  } finally {
    await transfer.dispose();
  }
  await settle();
}

async function mouseDrag(id, targetId, half) {
  const handle = widget(id).locator('.widget-drag');
  await handle.scrollIntoViewIfNeeded();
  await settle();
  const source = await handle.boundingBox(), target = await widget(targetId).boundingBox();
  assert.ok(source && target, '鼠标拖动起点和目标必须可见');
  const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const end = { x: target.x + target.width / 2, y: target.y + target.height * (half === 'before' ? 0.25 : 0.75) };
  assert.ok(end.y > 0 && end.y < page.viewportSize().height, '鼠标拖动目标位于首屏');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  try {
    await page.mouse.move(start.x - 12, start.y + 8, { steps: 4 });
    await page.mouse.move(end.x, end.y, { steps: 20 });
    await page.mouse.move(end.x, end.y + 1, { steps: 2 });
  } finally {
    await page.mouse.up();
  }
  await settle();
}

async function layout(width, height, label) {
  await page.setViewportSize({ width, height });
  await settle();
  const boxes = await page.evaluate(() => ({
    rootWidth: document.documentElement.scrollWidth, width: innerWidth,
    panel: document.querySelector('.detail-window').getBoundingClientRect().toJSON(),
    grid: document.querySelector('.bento-grid').getBoundingClientRect().toJSON(),
    coverFit: getComputedStyle(document.querySelector('.cover-card img')).objectFit,
    cards: [...document.querySelectorAll('.widget[data-widget]')].filter(node => !node.hidden).map(node => ({
      id: node.dataset.widget, box: node.getBoundingClientRect().toJSON(), scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
    })),
  }));
  assert.ok(boxes.rootWidth <= width + 1, label + ' 页面不能横向溢出');
  assert.ok(boxes.panel.x >= 0 && boxes.panel.right <= width + 1, label + ' 弹窗边界');
  assert.equal(boxes.coverFit, 'contain', '封面保持完整显示');
  for (const card of boxes.cards) {
    assert.ok(card.box.width > 0 && card.box.height > 0, label + ' 卡片可见：' + card.id);
    assert.ok(card.box.x >= boxes.grid.x - 1 && card.box.right <= boxes.grid.right + 1, label + ' 卡片在栅格内：' + card.id);
    assert.ok(card.scrollWidth <= card.clientWidth + 1, label + ' 卡片内容横向边界：' + card.id);
  }
  for (let i = 0; i < boxes.cards.length; i++) for (let j = i + 1; j < boxes.cards.length; j++) {
    const a = boxes.cards[i], b = boxes.cards[j];
    const overlapX = Math.min(a.box.right, b.box.right) - Math.max(a.box.x, b.box.x);
    const overlapY = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.y, b.box.y);
    assert.ok(overlapX <= 1 || overlapY <= 1, label + ' 卡片不重叠：' + a.id + '/' + b.id);
  }
  report.layouts.push({ label, width, height, ...boxes });
}

async function reloadDefaults() {
  await page.setViewportSize({ width: 1440, height: 1060 });
  await page.reload();
  await ready();
  assert.deepEqual(await captureLayout(), initialLayout, '刷新恢复默认布局与显示');
  assert.deepEqual(await captureContent(), initialContent, '刷新恢复示例内容');
  assert.equal(await page.locator('#impression').evaluate(node => Boolean(node.closest('[inert]'))), false, '普通模式恢复内容编辑');
}

(async () => {
  assert.ok(fs.existsSync(path.join(directory, 'index.html')), '参数应为含 index.html 的组装预览目录');
  fs.mkdirSync(output, { recursive: true });
  for (const file of ['index.html', 'preview.css', 'preview.js', 'card-menu.js', 'layout.js']) {
    report.testedFiles[file] = createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex');
  }
  server = http.createServer((request, response) => {
    let file;
    try {
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      file = path.resolve(directory, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
    } catch { response.writeHead(400); response.end(); return; }
    const relative = path.relative(directory, file);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)
      || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': ({
      '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
      '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    })[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  report.browser = 'Microsoft Edge ' + browser.version();
  context = await browser.newContext({ viewport: { width: 1440, height: 1060 }, reducedMotion: 'reduce' });
  await context.exposeBinding('__reportWidgetStorageWrite', (_, entry) => report.localStorageWrites.push(entry));
  await context.addInitScript(() => {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
      const storage = window.localStorage, pending = [];
      const record = (method, key) => {
        const entry = { method, key: key == null ? null : String(key) };
        pending.push(Promise.resolve(window.__reportWidgetStorageWrite(entry)));
      };
      const proxy = new Proxy(storage, {
        get(target, key) {
          if (['setItem', 'removeItem', 'clear'].includes(key)) return (...args) => { record(key, args[0]); return target[key](...args); };
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
        set(target, key, value) { record('assign', key); return Reflect.set(target, key, value, target); },
        deleteProperty(target, key) { record('delete', key); return Reflect.deleteProperty(target, key); },
        defineProperty(target, key, value) { record('defineProperty', key); return Reflect.defineProperty(target, key, value); },
      });
      Object.defineProperty(window, 'localStorage', { ...descriptor, get: () => proxy });
      window.__flushWidgetStorageReports = () => Promise.all(pending);
    } catch (error) { window.__widgetStorageInstrumentationError = String(error); }
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === base || ['blob:', 'data:'].includes(url.protocol)) return route.continue();
    report.externalRequests.push({ method: route.request().method(), url: url.href });
    return route.abort();
  });
  page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(base);
  await ready();

  await check('十张独立小组件、资料字段及默认布局', async () => {
    const ids = await order();
    assert.equal(ids.length, 10);
    assert.deepEqual([...ids].sort(), [...widgetIds].sort(), '组件 ID 唯一且完整');
    for (const id of widgetIds) assert.equal(await widget(id).isVisible(), true, id + ' 默认显示');
    assert.equal(await page.locator('#layout-tools').isVisible(), false);
    assert.equal(await page.locator('#layout-empty').isVisible(), false);
    for (const id of fieldIds) assert.equal(await widget('facts').locator('[data-field-row="' + id + '"]').isVisible(), true, '资料行默认显示：' + id);
    assert.equal(await widget('facts').locator('.widget[data-widget=tags]').count(), 0, '标签为独立卡片');
    initialLayout = await captureLayout();
    initialContent = await captureContent();
    await layout(1440, 1060, '默认宽屏');
    await shot('01-default');
  });

  await check('浏览器鼠标按住拖动可将资料卡移至体验卡之前', async () => {
    await enterEdit();
    const start = await order(), remaining = start.filter(id => id !== 'facts');
    await mouseDrag('facts', 'experience', 'before');
    assert.deepEqual(await order(), moved(start, 'facts', remaining.indexOf('experience')), '鼠标落在上半放到目标前');
    report.browserMouseDragValidated = true;
    report.dragValidation = 'Browser mouse down/move/up plus HTML DragEvent dispatch paths';
    report.unverified = ['原生Electron/真实触屏拖动未验证'];
    await shot('02-mouse-drag');
    await page.locator('#layout-reset').click();
    await page.locator('#layout-done').click();
    assert.deepEqual(await captureLayout(), initialLayout, '鼠标测试后恢复默认再检查其他交互');
  });

  await check('键盘按钮移动及拖放事件路径按上下半插入', async () => {
    await enterEdit();
    const start = await order(), index = start.indexOf('facts');
    assert.ok(index > 0 && index < start.length - 1, '资料卡可双向移动');
    await action('facts', 'move-up').focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await order(), moved(start, 'facts', index - 1), '键盘上移一位');
    await action('facts', 'move-down').focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await order(), start, '键盘下移一位');
    const source = 'review', target = 'experience';
    await drag(source, target, 'before');
    assert.deepEqual(await order(), moved(start, source, start.indexOf(target)), '落在上半放到目标前');
    const beforeSecond = await order(), remaining = beforeSecond.filter(id => id !== source);
    await drag(source, target, 'after');
    assert.deepEqual(await order(), moved(beforeSecond, source, remaining.indexOf(target) + 1), '落在下半放到目标后');
    assert.equal(new Set(await order()).size, 10, '拖动不会复制或丢失卡片');
    await shot('02-editing');
    await page.locator('#layout-cancel').click();
    assert.deepEqual(await captureLayout(), initialLayout, '取消恢复进入时的顺序');
  });

  await check('受限尺寸、完成保留当前页面及跨窗宽无损回流', async () => {
    await enterEdit();
    await resize('facts', 'small');
    const small = await widget('facts').boundingBox();
    await resize('facts', 'large');
    const large = await widget('facts').boundingBox();
    assert.ok(large.width > small.width + 1, '大号实际占用更多宽度');
    await action('footprint', 'hide').click();
    assert.equal(await widget('footprint').evaluate(node => node.hidden), true, '隐藏位于组件节点');
    const custom = await captureLayout();
    await page.locator('#layout-done').click();
    assert.equal(await page.locator('#layout-tools').isVisible(), false, '完成退出编辑');
    assert.deepEqual(await captureLayout(), custom, '完成保留本页面布局');
    await shot('03-custom');
    await layout(1440, 1060, '自定义宽屏');
    await layout(880, 1000, '自定义中窗');
    await shot('04-medium');
    await layout(390, 844, '自定义窄窗');
    await shot('05-narrow');
    await layout(1440, 1060, '回到宽屏');
    assert.deepEqual(await captureLayout(), custom, '跨断点不覆盖用户尺寸、顺序及显示');
    await enterEdit();
    assert.deepEqual(await captureLayout(), custom, '再次进入编辑保留已完成布局');
    await page.locator('#layout-cancel').click();
    await reloadDefaults();
  });

  await check('字段隐藏保留内容，取消只回退布局', async () => {
    const values = await widget('facts').locator('[data-field-row]').evaluateAll(nodes => nodes.map(node => [node.dataset.fieldRow, node.textContent]));
    const impression = '取消布局时，这条新输入的印象仍应保留。';
    await page.locator('#impression').fill(impression);
    await enterEdit();
    await fieldManager();
    for (const id of fieldIds) {
      await toggleField(id).setChecked(false);
      assert.equal(await page.locator('[data-field-row="' + id + '"]').evaluate(node => node.hidden), true, '字段仅隐藏：' + id);
    }
    assert.deepEqual(await widget('facts').locator('[data-field-row]').evaluateAll(nodes => nodes.map(node => [node.dataset.fieldRow, node.textContent])), values, '隐藏不删除字段内容');
    await page.locator('#layout-done').click();
    const atEntry = await captureLayout();
    await enterEdit();
    await fieldManager();
    for (const id of fieldIds) await toggleField(id).setChecked(true);
    await action('facts', 'move-down').click();
    await page.locator('#layout-cancel').click();
    assert.deepEqual(await captureLayout(), atEntry, '取消恢复进入时字段与顺序');
    assert.equal(await page.locator('#impression').inputValue(), impression, '取消布局不回滚内容编辑');
    await enterEdit();
    await page.locator('#layout-reset').click();
    for (const id of fieldIds) assert.equal(await page.locator('[data-field-row="' + id + '"]').isVisible(), true, '重置恢复资料行：' + id);
    assert.equal(await page.locator('#impression').inputValue(), impression, '恢复默认布局保留文字');
    await page.locator('#layout-done').click();
    await reloadDefaults();
  });

  await check('全部隐藏仍可找回，重置保留文字与临时照片', async () => {
    const impression = '恢复布局也保留这一页的文字和照片。';
    await page.locator('#impression').fill(impression);
    await page.locator('#photo-files').setInputFiles(path.join(directory, 'assets', 'shot-1.jpg'));
    await page.waitForFunction(count => document.querySelectorAll('.gallery-photo').length === count, initialContent.photos.length + 1);
    const content = await captureContent();
    await enterEdit();
    await manager();
    for (const id of widgetIds) await toggleWidget(id).setChecked(false);
    for (const id of widgetIds) assert.equal(await widget(id).evaluate(node => node.hidden), true, '组件节点隐藏：' + id);
    assert.equal(await page.locator('#layout-empty').isVisible(), true, '全部隐藏有空态');
    assert.equal(await page.locator('#layout-tools').isVisible(), true, '空态仍可管理布局');
    assert.equal(await page.locator('#widget-manager').isVisible(), true, '空态仍可找回卡片');
    await toggleWidget('facts').setChecked(true);
    assert.equal(await widget('facts').isVisible(), true, '可单独恢复卡片');
    assert.equal(await page.locator('#layout-empty').isVisible(), false);
    await toggleWidget('facts').setChecked(false);
    await page.locator('#layout-reset').click();
    for (const id of widgetIds) assert.equal(await widget(id).isVisible(), true, '恢复默认显示：' + id);
    assert.equal(await page.locator('#layout-empty').isVisible(), false);
    assert.deepEqual(await captureContent(), content, '恢复默认只改布局，不清除文字、资料和照片');
    assert.deepEqual(await captureLayout(), initialLayout, '恢复默认布局及尺寸');
    await page.locator('#layout-done').click();
    assert.deepEqual(await captureContent(), content, '完成后内容保持');
    await reloadDefaults();
  });

  await check('刷新复位、页面不写入 localStorage 且不请求外网', async () => {
    await page.evaluate(() => window.__flushWidgetStorageReports());
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), [], '浏览器存储保持空白');
    assert.deepEqual(report.localStorageWrites, [], '所有页面生命周期均无 localStorage 写入');
    assert.deepEqual(report.externalRequests, [], '预览只请求本地组装素材');
    assert.deepEqual(report.errors, [], '页面无脚本错误');
  });
  report.passed = true;
})().catch(error => {
  report.error = error.stack;
  process.exitCode = 1;
  console.error(error);
}).finally(async () => {
  if (page && !report.passed) {
    try { await shot('failure'); } catch { /* Keep the original failure. */ }
  }
  await context?.close();
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (fs.existsSync(output)) fs.writeFileSync(path.join(output, 'widgets-validation.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, output }));
});
