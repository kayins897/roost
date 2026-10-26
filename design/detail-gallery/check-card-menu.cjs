// Design prototype only. Serves the supplied preview directory; never opens the app or a user-data directory.
// Usage: node design/detail-gallery/check-card-menu.cjs <assembled-preview-directory>
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

if (!process.argv[2]) {
  console.error('Usage: node design/detail-gallery/check-card-menu.cjs <assembled-preview-directory>');
  process.exit(1);
}

const directory = path.resolve(process.argv[2]);
const output = path.join(directory, 'screenshots');
const sizes = {
  cover: ['small', 'medium', 'large'], experience: ['small', 'medium', 'large'],
  facts: ['small', 'medium', 'large'], hours: ['medium', 'large'], count: ['medium', 'large'],
  tags: ['small', 'medium', 'large'], impression: ['small', 'medium', 'large'],
  footprint: ['small', 'medium', 'large'], gallery: ['small', 'medium', 'large'], review: ['small', 'medium'],
};
const widgetIds = Object.keys(sizes);
const report = {
  passed: false, scope: 'design-prototype', productionPersistenceValidated: false,
  startedAt: new Date().toISOString(), testedFiles: {}, browserMouseContextMenuValidated: false,
  edgePositionValidation: 'ContextMenu event coordinates; actual mouse opening checked separately on every card',
  unverified: ['原生Electron、系统触摸长按与真实收藏持久化未验证'],
  checks: [], errors: [], externalRequests: [], localStorageWrites: [], screenshots: [],
  menuPositions: [], colorContrast: [],
};
let server, browser, context, page, base, initialLayout, initialContent;
const widget = id => page.locator('.widget[data-widget="' + id + '"]');
const menu = () => page.locator('#card-context-menu');
const action = (id, name) => widget(id).locator('.widget-tools [data-action="' + name + '"]');
const toggle = id => page.locator('#widget-manager [data-toggle-widget="' + id + '"]');
const normalized = color => String(color).trim().toLowerCase();

async function check(name, run) {
  await run();
  report.checks.push(name);
  console.log('PASS ' + name);
}

async function settle() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function ready() {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.querySelectorAll('.cover-card img,.gallery-photo img')]
    .every(image => image.complete && image.naturalWidth > 0));
  assert.equal(await page.evaluate(() => window.__cardMenuStorageInstrumentationError || null), null, '存储写入监测必须可用');
  await settle();
}

async function shot(name) {
  const file = 'card-menu-' + name + '.png';
  // Moving the panel here would close the menu and invalidate the screenshot.
  await page.screenshot({ path: path.join(output, file), animations: 'disabled', fullPage: false });
  report.screenshots.push(file);
}

async function captureLayout() {
  await settle();
  return page.evaluate(() => ({
    widgets: [...document.querySelectorAll('.widget[data-widget]')].map(node => ({
      id: node.dataset.widget, hidden: node.hidden, size: node.dataset.size, color: node.dataset.color,
    })),
    fields: [...document.querySelectorAll('[data-field-row]')].map(node => ({ id: node.dataset.fieldRow, hidden: node.hidden })),
  }));
}

async function captureContent() {
  return page.evaluate(() => ({
    impression: document.querySelector('#impression').value,
    review: document.querySelector('#review-body textarea').value,
    facts: [...document.querySelectorAll('[data-field-row]')].map(node => [node.dataset.fieldRow, node.textContent]),
    tags: document.querySelector('#tag-rows').textContent,
    footprints: document.querySelector('#footprints').textContent,
    photos: [...document.querySelectorAll('.gallery-photo')].map(node => ({
      src: node.querySelector('img').getAttribute('src'), caption: node.querySelector('figcaption').textContent,
    })),
    hours: document.querySelector('#hours-value').textContent,
    count: document.querySelector('#count-value').textContent,
  }));
}

function assertOnlyCardChanged(before, after, id, properties) {
  const comparable = JSON.parse(JSON.stringify(after));
  const original = before.widgets.find(card => card.id === id);
  const changed = comparable.widgets.find(card => card.id === id);
  for (const property of properties) changed[property] = original[property];
  assert.deepEqual(comparable, before, '单卡操作不改变其他卡、字段、顺序或尺寸');
}

async function assertBrowsing() {
  assert.equal(await page.locator('#layout-tools').isVisible(), false, '直接调整不进入整体布局编辑');
  assert.equal(await page.locator('.detail-window').evaluate(node => node.classList.contains('layout-editing')), false);
  assert.equal(await page.locator('#impression').evaluate(node => Boolean(node.closest('[inert]'))), false, '浏览状态内容仍可编辑');
}

async function rightClick(id, image = false) {
  const editing = await page.locator('.detail-window').evaluate(node => node.classList.contains('layout-editing'));
  // Business bodies are inert while editing, so use the card surface below its floating tools.
  const target = image && !editing ? widget(id).locator('img') : widget(id);
  await target.scrollIntoViewIfNeeded();
  await target.click({ button: 'right', position: { x: 12, y: editing ? 32 : 12 } });
  assert.equal(await menu().isVisible(), true, '右键打开卡片菜单：' + id);
  assert.equal(await menu().getAttribute('role'), 'dialog', '菜单为可访问对话区域');
  await settle();
}

async function closeMenu() {
  await page.keyboard.press('Escape');
  assert.equal(await menu().isVisible(), false, 'Escape 关闭菜单');
}

async function chooseSize(id, size) {
  await rightClick(id, id === 'cover');
  await menu().locator('[data-menu-size="' + size + '"]').click();
  await settle();
  assert.equal(await widget(id).getAttribute('data-size'), size, '直接应用当前卡尺寸');
  assert.equal(await menu().isVisible(), false, '选尺寸后关闭菜单');
}

async function customColor(id, color) {
  await rightClick(id, id === 'cover');
  await page.locator('#card-color-hex').fill(color);
  await page.locator('#card-color-apply').click();
  await settle();
  assert.equal(normalized(await widget(id).getAttribute('data-color')), normalized(color), '合法自定义色直接应用');
  assert.equal(await menu().isVisible(), false, '应用自定义色后关闭菜单');
}

async function assertColorApplied(id, expected) {
  const values = await widget(id).evaluate((node, value) => {
    const style = getComputedStyle(node), probe = document.createElement('span');
    probe.style.backgroundColor = value;
    document.body.append(probe);
    const rgb = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      variable: style.getPropertyValue('--widget-color').trim(), background: style.backgroundColor,
      ink: style.getPropertyValue('--widget-ink').trim(), muted: style.getPropertyValue('--widget-muted').trim(), rgb,
    };
  }, expected);
  assert.equal(normalized(values.variable), normalized(expected), '--widget-color 对应当前色：' + id);
  assert.equal(values.background, values.rgb, '卡片背景实际使用当前色：' + id);
  assert.ok(values.ink && values.muted, '每卡提供正文与辅助文字颜色：' + id);
}

async function enterManage(id = 'cover') {
  await rightClick(id, id === 'cover');
  await page.locator('#context-manage').click();
  assert.equal(await menu().isVisible(), false);
  assert.equal(await page.locator('#layout-tools').isVisible(), true, '管理进入布局编辑');
  assert.equal(await page.locator('#widget-manager').isVisible(), true, '管理同时打开卡片面板');
  assert.equal(await page.locator('#impression').evaluate(node => Boolean(node.closest('[inert]'))), true, '编辑时内容禁止误操作');
}

async function reloadDefaults() {
  await page.setViewportSize({ width: 1440, height: 1060 });
  await page.reload();
  await ready();
  assert.deepEqual(await captureLayout(), initialLayout, '刷新恢复默认布局与配色');
  assert.deepEqual(await captureContent(), initialContent, '刷新恢复示例内容');
  await assertBrowsing();
}

async function menuBounds(label, point) {
  const geometry = await menu().evaluate(node => {
    const scrollable = [node, ...node.querySelectorAll('*')].filter(candidate =>
      ['auto', 'scroll'].includes(getComputedStyle(candidate).overflowY) && candidate.clientHeight > 0);
    const target = scrollable.find(candidate => candidate.scrollHeight > candidate.clientHeight + 1) || scrollable[0];
    return {
      box: node.getBoundingClientRect().toJSON(), width: innerWidth, height: innerHeight,
      left: node.style.left, top: node.style.top, position: getComputedStyle(node).position,
      contextEvents: window.__edgeContextEvents || [],
      overflowY: getComputedStyle(node).overflowY, scrollable: Boolean(target),
      scrollHeight: target?.scrollHeight || 0, clientHeight: target?.clientHeight || 0,
    };
  });
  report.menuPositions.push({ label, point, ...geometry });
  const box = geometry.box;
  assert.ok(box.width > 0 && box.height > 0, label + ' 菜单有尺寸');
  assert.ok(box.x >= -1 && box.y >= -1 && box.right <= geometry.width + 1 && box.bottom <= geometry.height + 1, label + ' 菜单完全在视口内');
  assert.ok(geometry.scrollable, label + ' 菜单允许内部滚动');
  assert.ok(box.width <= geometry.width && box.height <= geometry.height, label + ' 菜单不超出窄窗');
  if (geometry.scrollHeight > geometry.clientHeight + 1) {
    const scroll = await menu().evaluate(node => {
      const target = [node, ...node.querySelectorAll('*')].find(candidate =>
        ['auto', 'scroll'].includes(getComputedStyle(candidate).overflowY) && candidate.scrollHeight > candidate.clientHeight + 1);
      target.scrollTop = target.scrollHeight; return target.scrollTop;
    });
    assert.ok(scroll > 0, label + ' 溢出内容实际可滚动');
    assert.equal(await menu().isVisible(), true, '菜单自身滚动不会关闭菜单');
    await menu().evaluate(node => { [node, ...node.querySelectorAll('*')].forEach(candidate => { candidate.scrollTop = 0; }); });
  }
  return geometry;
}

async function contrast(id, selector, minimum = 4.5, pseudo = null) {
  const result = await widget(id).locator(selector).first().evaluate((node, options) => {
    const parse = value => {
      const match = value.match(/^rgba?\(([^)]+)\)$/);
      if (!match) throw new Error('Unsupported computed color: ' + value);
      const values = match[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return [values[0], values[1], values[2], values.length > 3 ? values[3] : 1];
    };
    const blend = (front, back) => front.slice(0, 3).map((channel, index) => channel * front[3] + back[index] * (1 - front[3]));
    const luminance = rgb => rgb.map(channel => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const ancestors = []; let current = node;
    while (current) { ancestors.unshift(current); current = current.parentElement; }
    let background = [255, 255, 255];
    for (const ancestor of ancestors) background = blend(parse(getComputedStyle(ancestor).backgroundColor), background);
    const style = getComputedStyle(node, options.pseudo), foreground = blend(parse(style.color), background);
    const a = luminance(foreground), b = luminance(background);
    return { color: style.color, background, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), fontSize: style.fontSize };
  }, { pseudo });
  report.colorContrast.push({ id, selector, pseudo, minimum, ...result });
  assert.ok(result.ratio >= minimum, id + ' ' + selector + (pseudo || '') + ' 白底对比度 ' + result.ratio.toFixed(2) + ' 应至少 ' + minimum);
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
  await context.exposeBinding('__reportCardMenuStorageWrite', (_, entry) => report.localStorageWrites.push(entry));
  await context.addInitScript(() => {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
      const storage = window.localStorage, pending = [];
      const record = (method, key) => {
        const entry = { method, key: key == null ? null : String(key) };
        pending.push(Promise.resolve(window.__reportCardMenuStorageWrite(entry)));
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
      window.__flushCardMenuStorageReports = () => Promise.all(pending);
    } catch (error) { window.__cardMenuStorageInstrumentationError = String(error); }
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

  await check('无标题栏、独立关闭入口及默认彩色卡片', async () => {
    assert.equal(await page.locator('.window-heading').count(), 0, '删除标题栏节点');
    assert.equal(await page.locator('#close-preview').isVisible(), true, '保留独立关闭按钮');
    assert.equal(await page.locator('#close-preview').evaluate(node => Boolean(node.closest('.window-heading'))), false);
    assert.equal(await menu().isVisible(), false, '菜单默认关闭');
    await assertBrowsing();
    initialLayout = await captureLayout();
    initialContent = await captureContent();
    assert.deepEqual(initialLayout.widgets.map(card => card.id).sort(), [...widgetIds].sort(), '十张卡片完整且唯一');
    assert.ok(new Set(initialLayout.widgets.map(card => normalized(card.color))).size > 1, '默认卡片使用多种颜色');
    for (const card of initialLayout.widgets) {
      assert.match(card.color, /^#[0-9a-f]{6}$/i, '默认色为六位十六进制：' + card.id);
      await assertColorApplied(card.id, card.color);
    }
    await shot('01-default');
    await page.locator('#close-preview').click();
    assert.equal(await page.locator('.detail-window').isVisible(), false, '关闭详情');
    assert.equal(await page.locator('#preview-closed').isVisible(), true);
    await page.locator('#reopen').click();
    assert.equal(await page.locator('.detail-window').isVisible(), true, '重新打开详情');
    assert.deepEqual(await captureLayout(), initialLayout, '关闭再打开保留当前页面布局');
  });

  await check('每卡与封面图片可直接右键，鼠标位置打开菜单', async () => {
    for (const id of widgetIds) {
      await rightClick(id, id === 'cover');
      assert.equal(await page.locator('#edit-layout').isVisible(), true, '调整布局位于菜单内');
      assert.equal(await menu().locator('#edit-layout').count(), 1);
      const options = await menu().locator('button[data-menu-size]').evaluateAll(nodes => nodes.filter(node => !node.hidden && !node.disabled && getComputedStyle(node).display !== 'none').map(node => node.dataset.menuSize));
      assert.deepEqual(options.sort(), [...sizes[id]].sort(), '只提供当前卡支持的尺寸：' + id);
      await assertBrowsing();
      await closeMenu();
    }
    await widget('cover').scrollIntoViewIfNeeded();
    await settle();
    const box = await widget('cover').boundingBox();
    const point = { x: box.x + 22, y: box.y + 24 };
    report.mouseContextPoint = { point, box, target: await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.widget')?.dataset.widget || null, point) };
    await page.mouse.click(point.x, point.y, { button: 'right' });
    assert.equal(await menu().isVisible(), true, '真实鼠标坐标右键打开封面菜单');
    const bounds = await menuBounds('宽屏真实鼠标右键', point);
    assert.ok(Math.abs(bounds.box.x - point.x) <= 18, '横向跟随鼠标位置');
    assert.ok(Math.abs(bounds.box.y - point.y) <= 18, '纵向跟随鼠标位置');
    await shot('02-cover-context');
    report.browserMouseContextMenuValidated = true;
    await closeMenu();
  });

  await check('所有受限尺寸直接生效且不进入整体编辑', async () => {
    for (const id of widgetIds) {
      const geometries = [];
      for (const size of sizes[id]) {
        const before = await captureLayout();
        await chooseSize(id, size);
        assertOnlyCardChanged(before, await captureLayout(), id, ['size']);
        const box = await widget(id).boundingBox();
        geometries.push([Math.round(box.width), Math.round(box.height)].join('x'));
        assert.deepEqual(await captureContent(), initialContent, '改变尺寸保留内容');
        await assertBrowsing();
      }
      assert.equal(new Set(geometries).size, sizes[id].length, '每档尺寸实际改变卡片宽度或高度：' + id);
    }
    await chooseSize('cover', 'small');
    const small = await widget('cover').boundingBox();
    await chooseSize('cover', 'large');
    const large = await widget('cover').boundingBox();
    assert.ok(large.width > small.width + 1, '封面尺寸实际改变宽度');
    await shot('03-cover-large');
    await reloadDefaults();
  });

  await check('各卡预设色与合法自定义色只改变当前卡', async () => {
    for (const id of widgetIds) {
      const before = await captureLayout(), current = before.widgets.find(card => card.id === id).color;
      await rightClick(id, id === 'cover');
      const presets = await menu().locator('button[data-menu-color]').evaluateAll(nodes => nodes.map(node => node.dataset.menuColor));
      assert.ok(presets.length >= 2, '提供多种预设色');
      for (const color of presets) assert.match(color, /^#[0-9a-f]{6}$/i);
      const color = presets.find(value => normalized(value) !== normalized(current));
      assert.ok(color, '至少一种不同于当前色的预设');
      await menu().locator('button[data-menu-color="' + color + '"]').click();
      assert.equal(await menu().isVisible(), false, '预设选色后关闭菜单');
      assert.equal(normalized(await widget(id).getAttribute('data-color')), normalized(color));
      await assertColorApplied(id, color);
      assertOnlyCardChanged(before, await captureLayout(), id, ['color']);
      await assertBrowsing();
    }
    const before = await captureLayout();
    await customColor('facts', '#FaE9d2');
    await assertColorApplied('facts', '#FaE9d2');
    assertOnlyCardChanged(before, await captureLayout(), 'facts', ['color']);
    assert.deepEqual(await captureContent(), initialContent, '选色保留所有示例内容');
    await assertBrowsing();
    await shot('04-custom-colors');
    await reloadDefaults();
  });

  await check('非法颜色保持原色并提供输入错误状态', async () => {
    const before = await captureLayout();
    await rightClick('facts');
    for (const invalid of ['', '#fff', '#12345g', 'ffffff', 'not-a-color']) {
      await page.locator('#card-color-hex').fill(invalid);
      await page.locator('#card-color-apply').click();
      assert.equal(await page.locator('#card-color-hex').getAttribute('aria-invalid'), 'true', '非法色标记错误：' + invalid);
      assert.equal(await menu().isVisible(), true, '非法色保留菜单以便修正');
      assert.deepEqual(await captureLayout(), before, '非法色不改变布局或配色');
    }
    await shot('05-invalid-color');
    await page.locator('#card-color-hex').fill('#123456');
    await page.locator('#card-color-apply').click();
    assert.equal(await menu().isVisible(), false, '修正输入后可应用');
    await assertColorApplied('facts', '#123456');
    await reloadDefaults();
  });

  await check('恢复当前卡默认色保留尺寸、顺序、文字和其他颜色', async () => {
    await page.locator('#impression').fill('恢复当前卡默认颜色，也应保留这段文字。');
    await enterManage();
    await action('facts', 'move-down').click();
    await page.locator('#layout-done').click();
    assert.notDeepEqual((await captureLayout()).widgets.map(card => card.id), initialLayout.widgets.map(card => card.id), '先建立非默认卡片顺序');
    await customColor('facts', '#ffffff');
    await customColor('tags', '#123456');
    await chooseSize('facts', 'large');
    const before = await captureLayout(), content = await captureContent();
    await rightClick('facts');
    await page.locator('#context-default-color').click();
    assert.equal(await menu().isVisible(), false, '恢复颜色后关闭菜单');
    const expected = initialLayout.widgets.find(card => card.id === 'facts').color;
    assert.equal(await widget('facts').getAttribute('data-color'), expected, '恢复当前卡自身默认色');
    await assertColorApplied('facts', expected);
    assertOnlyCardChanged(before, await captureLayout(), 'facts', ['color']);
    assert.deepEqual(await captureContent(), content, '恢复默认色保留内容');
    await assertBrowsing();
    await reloadDefaults();
  });

  await check('白色自定义背景下正文、辅助文字与输入仍可读', async () => {
    for (const id of ['facts', 'impression', 'hours', 'review']) {
      await customColor(id, '#ffffff');
      await assertColorApplied(id, '#ffffff');
    }
    await contrast('facts', 'h2');
    await contrast('facts', 'dd');
    await contrast('facts', 'dt', 3);
    await page.locator('#edit-facts').click();
    await contrast('facts', '.facts-edit label', 3);
    await contrast('facts', '.facts-edit input');
    await contrast('impression', '#impression');
    await contrast('impression', '#impression-count', 3);
    await contrast('impression', '#impression', 3, '::placeholder');
    await widget('hours').locator('[data-stat="hours"]').click();
    await contrast('hours', '#hours-editor input');
    await page.locator('#review-toggle').click();
    await contrast('review', '#review-body textarea');
    await contrast('review', '#review-body small', 3);
    await widget('facts').scrollIntoViewIfNeeded();
    await shot('06-white-readable');
    await reloadDefaults();
  });

  await check('键盘右键、Escape回焦与外部点击、缩放、滚动关闭', async () => {
    for (const key of ['Shift+F10', 'ContextMenu']) {
      for (const id of widgetIds) {
        await widget(id).scrollIntoViewIfNeeded();
        await widget(id).focus();
        assert.equal(await widget(id).evaluate(node => document.activeElement === node), true, '卡片可键盘聚焦');
        await page.keyboard.press(key);
        assert.equal(await menu().isVisible(), true, key + ' 打开 ' + id);
        const options = await menu().locator('button[data-menu-size]').evaluateAll(nodes => nodes.map(node => node.dataset.menuSize));
        assert.deepEqual(options.sort(), [...sizes[id]].sort(), '键盘菜单使用当前聚焦卡片的受限尺寸');
        await page.locator('#card-color-hex').focus();
        await closeMenu();
        assert.equal(await widget(id).evaluate(node => document.activeElement === node), true, 'Escape 回到原卡片');
        if (id === 'facts') {
          const before = await captureLayout(), color = key === 'Shift+F10' ? '#314159' : '#415926';
          await page.keyboard.press(key);
          await page.locator('#card-color-hex').fill(color);
          await page.locator('#card-color-apply').click();
          assert.equal(normalized(await widget(id).getAttribute('data-color')), color, '键盘菜单操作命中当前卡片');
          assertOnlyCardChanged(before, await captureLayout(), id, ['color']);
          await assertBrowsing();
        }
      }
    }
    await page.locator('#impression').click({ button: 'right', position: { x: 12, y: 12 } });
    assert.equal(await menu().isVisible(), false, '文字输入框保留原生右键操作');
    await page.keyboard.press('Escape');
    await rightClick('cover', true);
    await page.mouse.click(2, 2);
    assert.equal(await menu().isVisible(), false, '点击菜单外关闭');
    await rightClick('cover', true);
    await page.setViewportSize({ width: 1439, height: 1060 });
    await settle();
    assert.equal(await menu().isVisible(), false, '窗口改变大小关闭');
    await page.setViewportSize({ width: 1440, height: 1060 });
    await rightClick('cover', true);
    const scroll = await page.locator('.detail-window').evaluate(node => {
      const before = node.scrollTop; node.scrollTop = before + 120; return { before, after: node.scrollTop };
    });
    assert.notEqual(scroll.before, scroll.after, '测试确实滚动详情');
    await settle();
    assert.equal(await menu().isVisible(), false, '详情滚动关闭菜单');
    await assertBrowsing();
  });

  await check('1440与390宽视口四角菜单不越界且小窗可滚动', async () => {
    await page.evaluate(() => {
      window.__edgeContextEvents = [];
      document.addEventListener('contextmenu', event => window.__edgeContextEvents.push({ x: event.clientX, y: event.clientY, target: event.target.dataset.widget, trusted: event.isTrusted }), true);
    });
    for (const viewport of [{ width: 1440, height: 1060 }, { width: 390, height: 844 }, { width: 390, height: 360 }]) {
      await page.setViewportSize(viewport);
      await settle();
      for (const [corner, x, y] of [
        ['左上', 2, 2], ['右上', viewport.width - 2, 2],
        ['左下', 2, viewport.height - 2], ['右下', viewport.width - 2, viewport.height - 2],
      ]) {
        // Playwright's generic contextmenu dispatch constructs Event without mouse coordinates.
        await widget('cover').evaluate((node, point) => node.dispatchEvent(new MouseEvent('contextmenu', {
          button: 2, clientX: point.x, clientY: point.y, bubbles: true, cancelable: true,
        })), { x, y });
        assert.equal(await menu().isVisible(), true);
        await settle();
        const label = viewport.width + '×' + viewport.height + ' ' + corner;
        await menuBounds(label, { x, y });
        if (corner === '右下') await shot('07-edge-' + viewport.width + 'x' + viewport.height);
        await closeMenu();
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '菜单不造成页面横向溢出');
    }
    await reloadDefaults();
  });

  await check('菜单进入整体编辑，底部工具条与取消恢复进入时布局和颜色', async () => {
    await customColor('cover', '#315678');
    await chooseSize('facts', 'small');
    await page.locator('#impression').fill('取消布局编辑保留进入前的内容。');
    const before = await captureLayout(), content = await captureContent();
    await enterManage();
    const tools = await page.locator('#layout-tools').evaluate(node => ({
      position: getComputedStyle(node).position, box: node.getBoundingClientRect().toJSON(), height: innerHeight,
    }));
    assert.ok(['fixed', 'absolute'].includes(tools.position), '编辑工具条以浮动胶囊出现');
    assert.ok(tools.box.bottom <= tools.height + 1 && tools.box.y > tools.height / 2, '工具条位于视口底部');
    await page.setViewportSize({ width: 390, height: 844 });
    await settle();
    const narrowTools = await page.locator('#layout-tools').boundingBox();
    assert.ok(narrowTools.x >= 0 && narrowTools.x + narrowTools.width <= 391
      && narrowTools.y > 422 && narrowTools.y + narrowTools.height <= 845, '窄窗底部工具条完整可用');
    await shot('08-editing-narrow');
    await page.setViewportSize({ width: 1440, height: 1060 });
    await settle();
    await customColor('cover', '#ffffff');
    await chooseSize('facts', 'large');
    await action('facts', 'move-down').click();
    await action('footprint', 'hide').click();
    await shot('08-editing');
    assert.notDeepEqual(await captureLayout(), before, '编辑操作确实改变布局与颜色');
    await page.locator('#layout-cancel').click();
    assert.deepEqual(await captureLayout(), before, '取消恢复进入时的颜色、尺寸、顺序及显示');
    assert.deepEqual(await captureContent(), content, '取消布局保留内容');
    await assertBrowsing();
    await reloadDefaults();
  });

  await check('恢复默认还原布局与默认颜色，保留文字和临时照片', async () => {
    await page.locator('#impression').fill('恢复默认布局也保留这一页的文字和临时截图。');
    await page.locator('#photo-files').setInputFiles(path.join(directory, 'assets', 'shot-1.jpg'));
    await page.waitForFunction(count => document.querySelectorAll('.gallery-photo').length === count, initialContent.photos.length + 1);
    const content = await captureContent();
    await customColor('facts', '#abcdef');
    await chooseSize('facts', 'large');
    await enterManage();
    await action('facts', 'move-down').click();
    await toggle('footprint').setChecked(false);
    await page.locator('#layout-reset').click();
    assert.deepEqual(await captureLayout(), initialLayout, '恢复所有卡默认布局与默认颜色');
    assert.deepEqual(await captureContent(), content, '恢复默认保留文字、资料、截图及统计');
    await page.locator('#layout-done').click();
    await assertBrowsing();
    await shot('09-restored-content');
    await reloadDefaults();
  });

  await check('全部隐藏后空白栅格右键仍可找回全部卡片', async () => {
    await page.locator('#impression').fill('全部隐藏不会删除这段内容。');
    const content = await captureContent();
    await customColor('facts', '#abcdef');
    await enterManage();
    for (const id of widgetIds) await toggle(id).setChecked(false);
    for (const id of widgetIds) assert.equal(await widget(id).evaluate(node => node.hidden), true);
    await page.locator('#layout-done').click();
    assert.equal(await page.locator('#layout-empty').isVisible(), true, '普通模式显示全隐藏空态');
    const grid = page.locator('.bento-grid'), box = await grid.boundingBox();
    assert.ok(box && box.width > 0 && box.height > 0, '空白栅格保留可右键面积');
    await grid.click({ button: 'right', position: { x: Math.min(20, box.width / 2), y: Math.min(20, box.height / 2) } });
    assert.equal(await menu().isVisible(), true, '空白处右键打开菜单');
    await shot('10-empty-context');
    await page.locator('#context-manage').click();
    assert.equal(await page.locator('#widget-manager').isVisible(), true, '空态仍可进入管理');
    await page.locator('#layout-reset').click();
    await page.locator('#layout-done').click();
    assert.deepEqual(await captureLayout(), initialLayout, '空态恢复默认布局和默认色');
    assert.deepEqual(await captureContent(), content, '空态恢复保留内容');
    assert.equal(await page.locator('#layout-empty').isVisible(), false);
    await reloadDefaults();
  });

  await check('自定义浅色和中灰时悬停、分类及表单文字保持对比', async () => {
    for (const color of ['#ffffff','#777777','#797979','#747474']) {
      await customColor('review',color);
      await page.locator('#review-toggle').hover();
      await contrast('review','#review-toggle h2');
      await customColor('experience',color);
      await page.locator('#experience-toggle').click();
      for (let index=0; index<7; index++) {
        const selector='#state-choices button:nth-child('+(index+1)+')';
        await contrast('experience',selector);
        await widget('experience').locator(selector).hover();
        await contrast('experience',selector);
      }
      await page.locator('#experience-toggle').click();
      await contrast('experience','#priority-field select');
      await customColor('facts',color);
      await page.locator('#edit-facts').click();
      await contrast('facts','.facts-edit input');
      await page.locator('#edit-facts').click();
    }
    await shot('11-custom-gray-readable');
    await reloadDefaults();
  });

  await check('全隐藏后重新打开可通过键盘恢复卡片，菜单Tab可退出', async () => {
    await enterManage();
    for (const id of widgetIds) await toggle(id).setChecked(false);
    await page.locator('#layout-done').click();
    await page.locator('#close-preview').click();
    await page.locator('#reopen').click();
    let found=false;
    for (let index=0; index<8; index++) {
      await page.keyboard.press('Tab');
      if (await page.locator('#restore-widgets').evaluate(node=>document.activeElement===node)) { found=true; break; }
    }
    assert.equal(found,true,'重新打开后的空态有可Tab到达的恢复入口');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#widget-manager').isVisible(),true);
    await page.keyboard.press('Space');
    assert.equal(await widget('cover').isVisible(),true,'键盘恢复第一张封面卡');
    await page.locator('#layout-done').click();
    await rightClick('cover',true);
    await page.locator('#context-manage').focus();
    await page.keyboard.press('Tab');
    assert.equal(await menu().isVisible(),false,'Tab离开菜单时关闭，不留下失焦菜单');
    assert.equal(await widget('cover').evaluate(node=>document.activeElement===node),true);
    await page.keyboard.press('Shift+F10');
    await menu().locator('[data-menu-size]').first().focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await menu().isVisible(),false,'反向Tab同样可以退出');
    await shot('12-empty-keyboard-recovered');
    await reloadDefaults();
  });

  await check('靠底菜单提示颜色错误后仍完全位于视口', async () => {
    await widget('cover').evaluate(node=>node.dispatchEvent(new MouseEvent('contextmenu',{
      button:2,clientX:innerWidth-2,clientY:innerHeight-2,bubbles:true,cancelable:true,
    })));
    await page.locator('#card-color-hex').fill('#bad');
    await page.locator('#card-color-apply').click();
    await menuBounds('非法颜色提示后的右下菜单',{x:1438,y:1058});
    await closeMenu();
    await reloadDefaults();
  });

  await check('刷新复位、页面无存储写入与外网访问', async () => {
    await page.evaluate(() => window.__flushCardMenuStorageReports());
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), [], '浏览器存储保持空白');
    assert.deepEqual(report.localStorageWrites, [], '整个页面生命周期无 localStorage 写入');
    assert.deepEqual(report.externalRequests, [], '只请求本地组装素材');
    assert.deepEqual(report.errors, [], '无页面脚本错误');
    assert.equal(await page.evaluate(() => typeof window.qiyuDesktop), 'undefined', '不连接真实桌面收藏');
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
  if (fs.existsSync(output)) fs.writeFileSync(path.join(output, 'card-menu-validation.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, output }));
});
