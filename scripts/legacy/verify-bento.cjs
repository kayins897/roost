const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const dist = path.join(root, 'dist');
const assets = path.join(root, '..', 'design', '2026-10-22-concepts', 'assets');
const evidence = path.join(root, 'evidence', `design-v${version.replaceAll('.', '')}`);
const appearanceKey = 'qiyu.appearance.v1';
const notes = [
  '截图使用独立浏览器上下文中的演示作品与合成体验记录，并非用户真实收藏。',
  '六张游戏封面来自项目设计目录的原创几何 SVG，经浏览器 canvas 转为符合现有数据校验的 PNG data URI；不是官方封面。',
  '书籍封面为验证脚本绘制的原创纸质字封面；体验日期和印象均为界面验证样例。',
  '60件大库样例使用同源原创封面的120×180 PNG缩略图，以符合浏览器localStorage容量；实际作品数量和布局检查保持60件。',
  '仅连接本脚本启动的本地静态服务；不访问 Steam、豆瓣、真实用户浏览器配置或 Electron 进程。',
];
const checks = [], screenshots = [], pageErrors = [], resourceErrors = [], layouts = [], fixtureIntegrity = [];
let monthlyActivity = [], entryMotion, navigationAlignment, surfaceDepth, narrowFirstCover;
const dockLayouts = [], dockButtonLayouts = [], themeControls = [], controlMaterials = [], playtimePresentation = [];
const glassInteraction = { samples: [], reducedTransparency: { supported: false } };
const ambientBackground = { frames: [], sampling: '只读复制到willReadFrequently的离屏CPU画布，避免重复getImageData改变原画布读回路径；静态帧仍严格逐字节摘要相等。', visibility: { verified: false }, performanceScope: '验证粒子数量、画布DPR和真实画面变化；未进行跨硬件、长期帧率或广泛性能测试。' };
let largeLibraryGlass;
let browser, context, page, server, base, failure, fixture, baseline;
fs.mkdirSync(evidence, { recursive: true });

function archiveRoundOne() {
  const priorReport = path.join(evidence, 'validation.json');
  const archive = path.join(evidence, 'round-1');
  if (!fs.existsSync(priorReport) || fs.existsSync(path.join(archive, 'validation.json'))) return;
  fs.mkdirSync(archive, { recursive: true });
  for (const name of fs.readdirSync(evidence)) {
    const source = path.join(evidence, name);
    if (fs.statSync(source).isFile() && /\.(?:png|json)$/.test(name)) fs.copyFileSync(source, path.join(archive, name), fs.constants.COPYFILE_EXCL);
  }
}

function startServer() {
  assert.ok(fs.existsSync(path.join(dist, 'index.html')), '请先 npm run build');
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname === '/__fixture-init') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end('<!doctype html><html lang="zh-CN"><title>隔离演示数据准备</title></html>'); return; }
    if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    let target;
    try { target = path.resolve(dist, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname)); }
    catch { response.writeHead(400); response.end(); return; }
    if (!target.startsWith(dist + path.sep)) { response.writeHead(403); response.end(); return; }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'content-type': mime[path.extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(target).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

async function prepareFixture() {
  const { demoSnapshot } = await import(pathToFileURL(path.join(root, 'src', 'infrastructure', 'demoData.ts')).href);
  const { isValidSnapshot } = await import(pathToFileURL(path.join(root, 'src', 'domain', 'library.ts')).href);
  const artworkNames = ['hollow', 'spire', 'disco', 'outer', 'hades', 'dave'];
  const svgs = Object.fromEntries(artworkNames.map(name => [name, fs.readFileSync(path.join(assets, `cover-${name}.svg`), 'utf8')]));
  await page.goto(`${base}/__fixture-init`);
  const covers = await page.evaluate(async ({ svgs }) => {
    const result = {};
    for (const [name, svg] of Object.entries(svgs)) {
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`; });
      const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 600;
      canvas.getContext('2d').drawImage(image, 0, 0, 400, 600); result[name] = canvas.toDataURL('image/png');
    }
    for (const [name, title, author] of [['siddhartha', '悉达多', '赫尔曼·黑塞'], ['design', '设计心理学', '唐纳德·诺曼']]) {
      const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 600;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = name === 'design' ? '#ded8c8' : '#d8cdb5'; ctx.fillRect(0, 0, 400, 600);
      ctx.strokeStyle = '#555d5d'; ctx.lineWidth = 1; ctx.strokeRect(29, 30, 342, 540);
      ctx.fillStyle = '#344346'; ctx.font = '20px "Microsoft YaHei",sans-serif'; ctx.fillText('栖域 · 阅读示例', 50, 88);
      ctx.font = '42px "Microsoft YaHei",sans-serif'; ctx.fillText(title, 50, 224);
      ctx.font = '22px "Microsoft YaHei",sans-serif'; ctx.fillText(author, 50, 285);
      ctx.fillStyle = '#817760'; ctx.fillRect(50, 332, 52, 3);
      ctx.font = '17px "Microsoft YaHei",sans-serif'; ctx.fillText('原创字封面 / 界面验证样例', 50, 521);
      result[name] = canvas.toDataURL('image/png');
    }
    return result;
  }, { svgs });
  fixture = structuredClone(demoSnapshot);
  fixture.items = fixture.items.filter(item => item.category !== 'game' || artworkNames.includes(item.artwork));
  fixture.notes = notes;
  fixture.items.forEach(item => {
    if (covers[item.artwork]) item.coverUrl = covers[item.artwork];
    if (item.category === 'game') item.platforms = item.artwork === 'hades' ? ['Steam', 'Switch'] : [item.subcategory];
    item.impression = item.category === 'book'
      ? '示例笔记：读到这里，开始留意日常事物如何影响自己的判断。\n\n比起记住每一句话，更想保留阅读时发生的联想。留一点空白，等下次翻开时再补上。'
      : '示例记录：留给自己的一次安静体验。喜欢它的节奏，也愿意慢慢发现更多细节。';
    item.experienceEntries = [];
  });
  const games = fixture.items.filter(item => item.category === 'game');
  let index = 0;
  for (const [month, count] of [['2026-06', 1], ['2026-07', 2], ['2026-08', 3], ['2026-09', 4], ['2026-10', 2]]) {
    for (let ordinal = 0; ordinal < count; ordinal++) {
      const target = games[index % games.length];
      target.experienceEntries.push({ id: `design-session-${++index}`, date: ordinal === 0 ? month : `${month}-${String(ordinal * 7 + 2).padStart(2, '0')}`, kind: ordinal === 0 ? 'started' : 'note', note: `界面验证示例：${month} 的第 ${ordinal + 1} 次体验。`, minutes: ordinal ? 45 + ordinal * 15 : undefined });
    }
  }
  assert.ok(isValidSnapshot(fixture), '演示快照须通过真实领域校验');
  baseline = JSON.stringify(fixture);
  await page.evaluate(raw => localStorage.setItem('qiyu.library.v1', raw), baseline);
  checks.push('原创SVG转PNG与纸质字封面、schemaVersion 1真实校验、独立上下文演示数据');
}

async function ready() {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
}
async function layout(name) {
  const measured = await page.evaluate(() => {
    const root = document.documentElement;
    const targets = ['.main-scroll', '.detail-panel', '.collection-workspace', '.collection-section', '.experience-timeline', '.monthly-activity', '.modal', '.topbar'];
    return {
      width: innerWidth, height: innerHeight, cssViewportWidth: root.clientWidth, zoom: getComputedStyle(root).zoom, documentWidth: root.scrollWidth,
      overflow: targets.flatMap(selector => [...document.querySelectorAll(selector)].flatMap(element => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1
          ? [{ selector, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }] : [];
      })),
    };
  });
  layouts.push({ name, ...measured });
  assert.ok(measured.documentWidth <= measured.cssViewportWidth + 1, `${name} 页面横向溢出: ${JSON.stringify(measured)}`);
  assert.deepEqual(measured.overflow, [], `${name} 容器横向溢出`);
}
async function capture(name) {
  await ready(); await layout(name);
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(evidence, file), animations: 'disabled', caret: 'hide', timeout: 30000 });
  screenshots.push(file);
}
async function navigate(label) {
  await revealDock();
  await page.getByRole('navigation', { name: '作品分类' }).getByRole('button', { name: label, exact: true }).click();
  await page.locator('.main-scroll').evaluate(element => { element.scrollTop = 0; });
}
async function closeDetail() { await page.locator('.detail-toolbar').getByRole('button', { name: '关闭', exact: true }).click(); }

function digest(raw) { return createHash('sha256').update(raw).digest('hex'); }
function assertThinGlassEdges(shadow, label) {
  const layers = shadow.split(/,(?![^()]*\))/).filter(layer => layer.includes('inset'));
  for (const layer of layers) {
    const dimensions = layer.replace(/(?:rgba?|color)\([^)]*\)/g, '').match(/-?[\d.]+px/g)?.map(parseFloat) ?? [];
    assert.ok(dimensions.length >= 2 && dimensions.every(value => Math.abs(value) <= 1.01), `${label}允许细边缘高光，不能变为厚内凹阴影：${layer}`);
  }
}
async function verifyFixtureUnchanged(name, expected) {
  const actual = await page.evaluate(() => localStorage.getItem('qiyu.library.v1'));
  fixtureIntegrity.push({ fixture: name, beforeBytes: Buffer.byteLength(expected), afterBytes: Buffer.byteLength(actual ?? ''), beforeSha256: digest(expected), afterSha256: digest(actual ?? ''), unchanged: actual === expected });
  assert.equal(actual, expected, `${name}：仅浏览不应改写演示收藏`);
}
async function installFixture(snapshot) {
  const { isValidSnapshot } = await import(pathToFileURL(path.join(root, 'src', 'domain', 'library.ts')).href);
  assert.ok(isValidSnapshot(snapshot), '各规模示例库必须通过真实领域校验');
  const raw = JSON.stringify(snapshot);
  await page.evaluate(value => localStorage.setItem('qiyu.library.v1', value), raw);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '收藏总览', exact: true }).waitFor();
  return raw;
}
async function verifyChrome() {
  assert.equal(await page.title(), '栖域', '窗口标题只保留产品名称');
  assert.equal(await page.locator('.brand').count(), 0, '圈出的品牌区应从结构中删除');
  assert.equal(await page.locator('.overview-bento,.overview-category').count(), 0, '旧四分类大卡片应从结构中删除');
  assert.equal(await page.getByRole('textbox', { name: '搜索收藏', exact: true }).count(), 1, '全局只保留一个收藏搜索框');
  assert.equal(await page.locator('.topbar').getByRole('textbox', { name: '搜索收藏', exact: true }).count(), 1, '唯一搜索框应位于顶栏');
  assert.equal(await page.locator('.theme-toggle').count(), 1, '主题切换只保留一个入口');
  assert.equal(await page.locator('.sidebar-dock .sidebar-tools .theme-toggle').count(), 1, '主题切换应位于Dock工具区');
  assert.equal(await page.locator('.topbar .theme-toggle,.topbar button[aria-label^="切换为"]').count(), 0, '顶栏不应重复显示主题切换');
  assert.ok(!(await page.locator('body').innerText()).includes('安放每一份喜欢'));
}
async function verifyFirstCover(name) {
  const first = page.locator('.media-gallery .media-card .card-cover').first();
  await first.waitFor();
  const bounds = await first.boundingBox();
  assert.ok(bounds && bounds.y < 680 && bounds.height > 0, `${name}：首排真实作品封面应紧随默认可见的筛选区：${JSON.stringify(bounds)}`);
  return bounds;
}

async function verifyLibraryInteractions() {
  const search = page.getByRole('textbox', { name: '搜索收藏', exact: true });
  await search.fill('空洞骑士');
  assert.equal(await page.locator('.media-gallery .media-card').count(), 1);
  await search.fill('');
  const tagPanel = page.locator('#library-tag-filters');
  assert.equal(await tagPanel.isVisible(), true, '游戏标签默认可见，不需要先展开高级筛选');
  for (const key of ['gameplay', 'theme', 'scenario', 'other']) {
    assert.equal(await tagPanel.locator(`.game-filter-group.tag-type--${key}`).count(), 1, `游戏标签保留${key}分组`);
  }
  const gameplay = tagPanel.locator('.tag-type--gameplay');
  const scenario = tagPanel.locator('.tag-type--scenario');
  const { gameTagCounts } = await import(pathToFileURL(path.join(root, 'src', 'domain', 'library.ts')).href);
  const allGameplay = gameTagCounts(fixture.items.filter(item => item.category === 'game')).gameplay;
  assert.equal(await gameplay.locator('.tag-filter').count(), 5, '桌面游戏分组默认先显示五个常用标签');
  const more = gameplay.getByRole('button', { name: /^展开玩法全部标签/ });
  assert.equal(await more.isVisible(), true);
  await more.click();
  assert.equal(await gameplay.locator('.tag-filter').count(), allGameplay.length, '更多入口可访问全部玩法标签');
  await gameplay.getByRole('button', { name: '收起玩法更多标签', exact: true }).click();
  assert.equal(await gameplay.locator('.tag-filter').count(), 5, '收起更多恢复常用标签');
  const hidden = allGameplay.at(-1);
  const hiddenName = new RegExp(`^${hidden.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  assert.equal(await gameplay.getByRole('button', { name: hiddenName }).count(), 0, '选取一个默认隐藏的标签验证可发现性');
  const tagSearch = page.locator('.tag-panel').getByRole('textbox', { name: '查找筛选标签', exact: true });
  await tagSearch.fill(hidden.name);
  await gameplay.getByRole('button', { name: hiddenName }).click();
  assert.equal(await page.locator('.media-gallery .media-card').count(), hidden.count);
  await tagSearch.fill('');
  assert.equal(await gameplay.getByRole('button', { name: hiddenName }).getAttribute('aria-pressed'), 'true', '清空搜索后已选隐藏标签必须继续可见');
  assert.equal(await gameplay.locator('.tag-filter').count(), 6, '常用五个加上已选隐藏标签');
  assert.equal(await page.locator('.media-gallery .media-card').count(), hidden.count, '清空标签搜索不应取消作品筛选');
  await gameplay.getByRole('button', { name: hiddenName }).click();
  assert.equal(await gameplay.locator('.tag-filter').count(), 5);
  assert.equal(await page.locator('.media-gallery .media-card').count(), 6);
  await gameplay.getByRole('button', { name: /^动作/ }).click();
  assert.equal(await page.locator('.media-gallery .media-card').count(), 2, '动作标签匹配两件示例作品');
  await scenario.getByRole('button', { name: /^需要沉浸/ }).click();
  assert.equal(await page.locator('.media-gallery .media-card').count(), 1, '跨分组标签采用交集');
  await page.getByRole('button', { name: '收起标签', exact: true }).click();
  assert.equal(await tagPanel.isVisible(), false);
  assert.equal(await page.locator('.media-gallery .media-card').count(), 1, '收起标签不应取消既有筛选');
  await page.getByRole('button', { name: '展开标签', exact: true }).click();
  await page.locator('.active-filter-summary').getByRole('button', { name: '全部清除', exact: true }).click();
  assert.equal(await page.locator('.media-gallery .media-card').count(), 6);
  await page.locator('.game-status-tabs').getByRole('button', { name: '已通关', exact: true }).click();
  assert.equal(await page.locator('.media-gallery .media-card').count(), 1);
  await page.locator('.game-status-tabs').getByRole('button', { name: '全部游戏', exact: true }).click();
  await page.getByRole('button', { name: '列表视图', exact: true }).click();
  assert.equal(await page.locator('.media-gallery--list .media-card').count(), 6);
  await layout('game-list-view');
  await page.getByRole('button', { name: '卡片视图', exact: true }).click();
  await page.getByRole('button', { name: /^筛选/ }).click();
  assert.equal(await page.locator('#library-advanced-filters').isVisible(), true);
  const favorites = page.locator('#library-advanced-filters').getByRole('button', { name: '只看喜欢', exact: true });
  await favorites.click();
  assert.equal(await page.locator('.media-gallery .media-card').count(), 1);
  await favorites.click();
  await page.getByRole('button', { name: /^筛选/ }).click();
  assert.equal(await page.locator('#library-advanced-filters').isVisible(), false);
  assert.equal(await page.locator('.media-gallery .media-card').count(), 6);
  const platform = page.locator('#library-advanced-filters').getByRole('button', { name: 'Switch', exact: true });
  await page.getByRole('button', { name: /^筛选/ }).click();
  await platform.click();
  assert.equal(await page.locator('.media-gallery .media-card').count(), 2, '平台为作品属性且独立于游戏标签筛选');
  await page.locator('.active-filter-summary').getByRole('button', { name: '全部清除', exact: true }).click();
  await page.getByRole('button', { name: /^筛选/ }).click();
  checks.push('顶栏唯一搜索、游戏状态、默认可见四组常用标签、更多展开/收起可达全部、搜索默认隐藏标签并选中后清空查询仍保留已选、跨组交集/收起保留/展开/清除、独立高级喜欢与平台、列表和卡片视图结果正确');
}

async function theme() { return page.locator('html').getAttribute('data-theme'); }
async function revealDock() {
  const menu = page.getByRole('button', { name: '打开菜单', exact: true });
  const opened = await menu.isVisible() && !await page.locator('.sidebar--open').count();
  if (opened) await menu.click();
  return opened;
}
async function dismissDock() {
  const dim = page.getByRole('button', { name: '关闭菜单', exact: true });
  if (!await dim.isVisible()) return;
  const bounds = await dim.boundingBox();
  assert.ok(bounds && bounds.width > 0 && bounds.height > 0);
  await dim.click({ position: { x: bounds.width * .9, y: bounds.height * .5 } });
  await page.locator('.sidebar--open').waitFor({ state: 'hidden' });
}
async function chooseTheme(mode) {
  const effective = await theme();
  if (effective !== mode) {
    const opened = await revealDock();
    await page.locator('.sidebar-dock').getByRole('button', { name: mode === 'dark' ? '切换为深色模式' : '切换为浅色模式', exact: true }).click();
    await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, mode);
    if (opened) await dismissDock();
  }
  assert.equal(await theme(), mode);
}
async function openSettings() {
  await revealDock();
  await page.getByRole('button', { name: '数据与设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '数据与设置', exact: true });
  await settings.waitFor(); return settings;
}
async function verifyThemeControl(mode, name) {
  await verifyChrome();
  const measured = await page.evaluate(() => {
    const toggle = document.querySelector('.sidebar-dock .theme-toggle');
    const active = document.querySelector('.sidebar-nav [aria-current="page"]');
    const channels = value => (value.match(/rgba?\(([^)]+)\)/)?.[1] ?? '').split(/[,\s/]+/).filter(Boolean).map(Number);
    const shadows = element => getComputedStyle(element).boxShadow.split(/,(?![^()]*\))/).filter(value => value !== 'none').map(value => {
      const rgba = channels(value);
      const offsets = value.replace(/rgba?\([^)]*\)/g, '').match(/-?[\d.]+px/g)?.map(parseFloat) ?? [];
      return { inset: value.includes('inset'), x: offsets[0], y: offsets[1], blur: offsets[2] ?? 0, alpha: rgba[3] ?? (rgba.length ? 1 : 0) };
    });
    const metrics = element => ({ shadow: getComputedStyle(element).boxShadow, shadows: shadows(element), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height });
    return {
      label: toggle.getAttribute('aria-label'), pressed: toggle.getAttribute('aria-pressed'),
      title: toggle.getAttribute('title'), tooltip: toggle.getAttribute('data-tooltip'),
      iconClasses: [...toggle.querySelectorAll('svg')].map(svg => svg.getAttribute('class')),
      activeBackground: channels(getComputedStyle(active).backgroundColor), toggle: metrics(toggle), active: metrics(active),
    };
  });
  themeControls.push({ name, mode, ...measured });
  const dark = mode === 'dark', current = `当前：${dark ? '深' : '浅'}色模式`;
  assert.equal(measured.label, `切换为${dark ? '浅' : '深'}色模式`, `${name}名称应解释下一次操作`);
  assert.equal(measured.pressed, String(dark), `${name}aria-pressed应与当前模式一致`);
  assert.equal(measured.title, current); assert.equal(measured.tooltip, current);
  assert.equal(measured.iconClasses.length, 1);
  assert.ok(measured.iconClasses[0].split(/\s+/).includes(dark ? 'lucide-moon-star' : 'lucide-sun'), `${name}图标应表达当前模式`);
  for (const [kind, metrics] of Object.entries({ active: measured.active, theme: measured.toggle })) {
    const halo = metrics.shadows.filter(shadow => !shadow.inset && shadow.alpha > 0 && shadow.blur > 0 && Math.abs(shadow.x) + Math.abs(shadow.y) <= shadow.blur * .2);
    assert.ok(halo.length > 0, `${name}/${kind}应具有柔和的外发光：${metrics.shadow}`);
    assert.ok(halo.every(shadow => shadow.blur <= Math.min(metrics.width, metrics.height) * 2), `${name}/${kind}柔光范围应适度：${metrics.shadow}`);
  }
  const [red, green, blue] = measured.activeBackground;
  if (dark) assert.ok(Math.min(red, green, blue) > 255 * .75 && Math.min(red, green, blue) / Math.max(red, green, blue) > .9, `${name}深色选中应为柔白色`);
  else assert.ok(green > red * 1.5 && blue > red * 1.5, `${name}浅色选中应为青色`);
}
async function verifyControlMaterials(mode) {
  const measured = await page.evaluate(() => {
    const selectors = ['.global-search', '.topbar .button--primary', '.topbar .button--secondary', '.advanced-toggle', '.sort-box', '.view-switch', '.game-status-tabs button:not(.is-selected)', '.game-status-tabs button.is-selected', '.tag-filter'];
    return selectors.map(selector => {
      const element = document.querySelector(selector);
      if (!element) return { selector, missing: true };
      const bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
      const radius = value => value.endsWith('%') ? parseFloat(value) * Math.min(bounds.width, bounds.height) / 100 : parseFloat(value);
      return { selector, width: bounds.width, height: bounds.height, radius: Math.min(...[style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(radius)), fill: style.backgroundColor, image: style.backgroundImage, border: style.borderColor, borderWidth: parseFloat(style.borderTopWidth), shadow: style.boxShadow };
    });
  });
  controlMaterials.push({ mode, controls: measured });
  for (const control of measured) {
    assert.equal(control.missing, undefined, `${mode}/${control.selector}应显示`);
    assert.ok(control.width > 0 && control.height > 0 && control.radius >= Math.min(control.width, control.height) * .45, `${mode}/${control.selector}应保持圆润轮廓：${JSON.stringify(control)}`);
    assert.ok((control.fill !== 'transparent' && control.fill !== 'rgba(0, 0, 0, 0)') || control.image !== 'none', `${mode}/${control.selector}应保留可辨识的轻薄表面：${JSON.stringify(control)}`);
    assert.ok(control.borderWidth > 0 || control.shadow !== 'none', `${mode}/${control.selector}应保留可辨识的控件边界`);
    assertThinGlassEdges(control.shadow, `${mode}/${control.selector}`);
  }
}
async function verifyAppearance() {
  assert.equal(await theme(), 'dark', '没有偏好时默认深色，即使系统为浅色');
  await verifyThemeControl('dark', '默认深色');
  await page.keyboard.press('Tab');
  await page.locator('.sidebar-dock .theme-toggle').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await verifyThemeControl('light', '切换浅色');
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), appearanceKey), { mode: 'light' });
  await capture('light-overview');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await theme(), 'light', '外观偏好应在重载后保留');
  const settings = await openSettings();
  const select = settings.getByRole('combobox', { name: '外观模式', exact: true });
  assert.deepEqual(await select.locator('option').evaluateAll(nodes => nodes.map(node => node.value)), ['dark', 'light', 'system']);
  await select.selectOption('system');
  await page.emulateMedia({ colorScheme: 'light' });
  assert.equal(await theme(), 'light');
  await verifyThemeControl('light', '跟随系统浅色');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await verifyThemeControl('dark', '跟随系统深色');
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), appearanceKey), { mode: 'system' });
  await select.selectOption('dark');
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await theme(), 'dark');
  await verifyThemeControl('dark', '主题重载');
  await verifyFixtureUnchanged('主题切换、持久化及跟随系统', baseline);
  checks.push('默认深色、Dock唯一主题入口以MoonStar/Sun显示当前模式并以名称说明切换目标，当前模式tooltip/title和aria-pressed同步；可切换、重载、跟随系统；白色/青色选中与适度外发光通过计算样式检查，外观偏好单独保存且收藏原文不变');
}
async function verifyDockButtons(name) {
  const dock = page.locator('.sidebar-dock');
  await dock.waitFor();
  const buttons = await dock.locator('button').evaluateAll(buttons => buttons.map(button => {
    const svg = button.querySelector('svg');
    const parent = button.getBoundingClientRect(), icon = svg?.getBoundingClientRect();
    const style = getComputedStyle(button);
    const radius = value => value.endsWith('%') ? parseFloat(value) * Math.min(parent.width, parent.height) / 100 : parseFloat(value);
    return {
      label: button.getAttribute('aria-label'), tooltip: button.getAttribute('data-tooltip'), enabled: !button.disabled, tabIndex: button.tabIndex,
      iconClass: svg?.getAttribute('class'),
      width: parent.width, height: parent.height,
      buttonCenter: { x: parent.x + parent.width / 2, y: parent.y + parent.height / 2 },
      iconCenter: icon ? { x: icon.x + icon.width / 2, y: icon.y + icon.height / 2 } : null,
      minimumCornerRadius: Math.min(...[style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(radius)),
    };
  }));
  const effective = await theme();
  dockButtonLayouts.push({ name, theme: effective, buttons });
  assert.deepEqual(buttons.map(item => item.label), ['收藏总览', '游戏', '书籍', '影视', '音乐', '标签管理', effective === 'dark' ? '切换为浅色模式' : '切换为深色模式', '数据与设置']);
  for (const item of buttons) {
    assert.ok(item.width > 0 && item.height > 0 && item.iconCenter, `${item.label}必须显示实际按钮和图标`);
    assert.ok(Math.abs(item.width - item.height) <= Math.max(item.width, item.height) * .08, `${item.label}按钮应为圆形而非长条：${JSON.stringify(item)}`);
    assert.ok(item.minimumCornerRadius >= Math.min(item.width, item.height) * .45, `${item.label}按钮应使用圆形边缘：${JSON.stringify(item)}`);
    assert.ok(Math.abs(item.buttonCenter.x - item.iconCenter.x) <= item.width * .04, `${item.label}图标应水平居中：${JSON.stringify(item)}`);
    assert.ok(Math.abs(item.buttonCenter.y - item.iconCenter.y) <= item.height * .04, `${item.label}图标应垂直居中：${JSON.stringify(item)}`);
    assert.equal(item.enabled, true); assert.ok(item.tabIndex >= 0, `${item.label}必须可从键盘到达`);
    assert.ok(item.tooltip?.trim(), `${item.label}须保留可发现的提示文案`);
  }
  const settings = buttons.find(item => item.label === '数据与设置');
  assert.ok(settings.iconClass?.split(/\s+/).includes('lucide-settings'), '设置入口应使用齿轮图标');
  assert.ok(!settings.iconClass?.split(/\s+/).includes('lucide-settings-2'), '设置入口应有可识别的齿轮形状');
  return buttons;
}
async function verifyNavigationAndDepth() {
  const dock = page.locator('.sidebar-dock');
  navigationAlignment = await verifyDockButtons('1440桌面');
  await verifyDockLayout('1440桌面');
  for (const [label, heading] of [['标签管理', '管理标签'], ['数据与设置', '数据与设置']]) {
    const button = dock.getByRole('button', { name: label, exact: true });
    await page.keyboard.press('Tab'); await button.focus();
    assert.equal(await button.evaluate(element => document.activeElement === element), true, `${label}应获得键盘焦点`);
    const tooltip = await button.evaluate(element => {
      const pseudo = getComputedStyle(element, '::after');
      return { expected: element.getAttribute('data-tooltip'), content: pseudo.content, visibility: pseudo.visibility, opacity: Number(pseudo.opacity) };
    });
    assert.ok(tooltip.content.includes(tooltip.expected), `${label}焦点提示应使用真实文案：${JSON.stringify(tooltip)}`);
    assert.notEqual(tooltip.visibility, 'hidden'); assert.ok(tooltip.opacity > 0, `${label}键盘焦点时提示须可见`);
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: heading, exact: true }); await dialog.waitFor();
    await dialog.getByRole('button', { name: heading === '管理标签' ? '完成' : '关闭', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  }
  surfaceDepth = await page.locator('.collection-section,.controls-panel,.sidebar-nav,.detail-impression,.filter-expanded').evaluateAll(nodes => nodes.map(node => ({ selector: node.className, shadow: getComputedStyle(node).boxShadow, before: getComputedStyle(node, '::before').boxShadow, after: getComputedStyle(node, '::after').boxShadow })));
  for (const surface of surfaceDepth) for (const [layer, shadow] of Object.entries(surface).filter(([key]) => key !== 'selector')) assertThinGlassEdges(shadow, `${surface.selector}/${layer}`);
  checks.push('八个Dock圆按钮及图标实际居中，设置为齿轮，胶囊Y轴居中且上下留白、不遮内容；导航名称及可达性保留，标签/设置可用键盘打开且焦点提示可见；主要Bento容器只允许细玻璃边缘高光，禁用厚内凹阴影');
}

async function verifyDockLayout(name, { overlay = false } = {}) {
  const measured = await page.evaluate(() => {
    const dock = document.querySelector('.sidebar-dock').getBoundingClientRect();
    const serialize = rect => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
    const targets = [...document.querySelectorAll('.topbar .global-search,.topbar-actions,.collection-section,.media-gallery .media-card')].map(element => ({ selector: element.className, rect: element.getBoundingClientRect() })).filter(({ rect }) => rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0);
    return {
      viewport: { width: innerWidth, height: innerHeight }, dock: serialize(dock),
      buttons: [...document.querySelectorAll('.sidebar-dock button')].map(element => ({ label: element.getAttribute('aria-label'), bounds: serialize(element.getBoundingClientRect()) })),
      menuOpen: document.querySelector('.sidebar')?.classList.contains('sidebar--open'),
      dimVisible: Boolean(document.querySelector('.mobile-dim')?.getBoundingClientRect().width),
      centerOffsetRatio: Math.abs(dock.top + dock.height / 2 - innerHeight / 2) / innerHeight,
      overlaps: targets.filter(({ rect }) => Math.min(dock.right, rect.right) - Math.max(dock.left, rect.left) > innerWidth * .001 && Math.min(dock.bottom, rect.bottom) - Math.max(dock.top, rect.top) > innerHeight * .001).map(({ selector, rect }) => ({ selector, bounds: serialize(rect) })),
    };
  });
  dockLayouts.push({ name, overlay, ...measured });
  assert.ok(measured.dock.left >= 0 && measured.dock.right <= measured.viewport.width, `${name}：Dock必须完整位于窗口内`);
  assert.ok(measured.dock.top > 0 && measured.dock.bottom < measured.viewport.height, `${name}：胶囊上下应留有空间：${JSON.stringify(measured)}`);
  assert.ok(measured.dock.height < measured.viewport.height * .9, `${name}：Dock不应占满窗口高度`);
  assert.ok(measured.centerOffsetRatio <= .025, `${name}：Dock应沿窗口Y轴居中：${JSON.stringify(measured)}`);
  assert.equal(measured.buttons.length, 8);
  for (const { label, bounds } of measured.buttons) assert.ok(bounds.left >= measured.dock.left && bounds.right <= measured.dock.right && bounds.top >= measured.dock.top && bounds.bottom <= measured.dock.bottom, `${name}：${label}不能溢出胶囊`);
  if (overlay) assert.ok(measured.menuOpen && measured.dimVisible, `${name}：移动Dock应由明确的菜单及关闭遮罩控制`);
  else assert.deepEqual(measured.overlaps, [], `${name}：Dock不应遮住搜索、作品或收藏区`);
}
async function verifyThemedSurfaces() {
  await navigate('游戏');
  for (const mode of ['dark', 'light']) {
    await chooseTheme(mode);
    await verifyThemeControl(mode, `${mode}游戏库`);
    await verifyControlMaterials(mode);
    await capture(`${mode}-game-library`);
    await page.getByRole('button', { name: '查看空洞骑士详情', exact: true }).click();
    await capture(`${mode}-game-detail`);
    await page.locator('.detail-panel').getByRole('button', { name: '编辑作品', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '编辑作品', exact: true });
    await editor.waitFor(); await capture(`${mode}-editor`);
    await editor.getByRole('button', { name: '取消', exact: true }).click();
    await closeDetail();
    await page.getByRole('button', { name: '检索与导入', exact: true }).click();
    const metadata = page.getByRole('dialog', { name: '从来源收录', exact: true });
    await metadata.waitFor(); await capture(`${mode}-metadata`);
    await metadata.getByRole('button', { name: '关闭', exact: true }).first().click();
    const settings = await openSettings();
    await capture(`${mode}-settings`);
    await settings.getByRole('button', { name: '关闭', exact: true }).click();
  }
  await chooseTheme('dark');
  checks.push('深浅两套作品库、游戏详情、完整编辑表单、资料导入与设置真实页面均已截图并验证无横向溢出；顶栏、搜索、筛选、排序、视图、状态及标签采用统一圆润轻材质；表单取消不写入收藏');
}
async function verifyMobileDock() {
  const toggle = page.locator('.sidebar-dock .theme-toggle');
  const menu = page.getByRole('button', { name: '打开菜单', exact: true });
  assert.equal(await menu.isVisible(), true);
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  assert.equal(await toggle.isVisible(), false, '窄屏菜单关闭后主题入口随Dock收起');
  await revealDock();
  assert.equal(await menu.getAttribute('aria-expanded'), 'true');
  await verifyDockLayout('390移动菜单', { overlay: true });
  await verifyDockButtons('390移动深色');
  await verifyThemeControl('dark', '390移动深色');
  await capture('mobile-dark-dock');
  await chooseTheme('light');
  assert.equal(await menu.getAttribute('aria-expanded'), 'true', '切换主题不应关闭已经打开的菜单');
  await verifyDockButtons('390移动浅色');
  await verifyThemeControl('light', '390移动浅色');
  await capture('mobile-light-dock');
  await dismissDock();
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  await chooseTheme('dark');
  assert.equal(await toggle.isVisible(), false, '从隐藏入口切换时应先打开Dock，并恢复原菜单收起状态');
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  await verifyFixtureUnchanged('移动Dock与主题切换', baseline);
  checks.push('390窄屏通过菜单打开八按钮Dock，圆按钮/图标居中且完整位于窗口；唯一主题入口随菜单收起，MoonStar/Sun和模式信息随切换同步，关闭遮罩及隐藏入口切换路径可用，收藏原文不变');
}
async function glassStyles() {
  return page.locator('[data-glass]').evaluateAll(elements => elements.map(element => {
    const alpha = color => {
      const channels = color.match(/rgba?\(([^)]+)\)/)?.[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return channels?.length ? channels[3] ?? 1 : undefined;
    };
    const layers = [null, '::before', '::after'].map(pseudo => {
      const style = getComputedStyle(element, pseudo);
      return { pseudo, background: style.backgroundColor, alpha: alpha(style.backgroundColor), image: style.backgroundImage, backdrop: style.backdropFilter || style.webkitBackdropFilter || 'none', opacity: Number(style.opacity) };
    });
    return { surface: element.getAttribute('data-glass') || element.className, layers };
  }));
}
async function glassPointerSample(selector, position, name) {
  const surface = page.locator(selector);
  await surface.waitFor();
  const bounds = await surface.boundingBox();
  assert.ok(bounds && bounds.width > 0 && bounds.height > 0, `${name}应有可操作的玻璃表面`);
  await page.mouse.move(bounds.x + bounds.width * position.x, bounds.y + bounds.height * position.y);
  await page.waitForFunction(({ selector, position }) => {
    const active = document.querySelectorAll('[data-glass-active="true"]');
    const element = document.querySelector(selector);
    if (active.length !== 1 || active[0] !== element) return false;
    const bounds = element.getBoundingClientRect();
    return Math.abs(parseFloat(element.style.getPropertyValue('--glass-x')) / bounds.width - position.x) <= .02 && Math.abs(parseFloat(element.style.getPropertyValue('--glass-y')) / bounds.height - position.y) <= .02;
  }, { selector, position });
  const measured = await surface.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const highlight = getComputedStyle(element, '::before');
    return { surface: element.getAttribute('data-glass') || element.className, x: parseFloat(element.style.getPropertyValue('--glass-x')), y: parseFloat(element.style.getPropertyValue('--glass-y')), width: bounds.width, height: bounds.height, activeCount: document.querySelectorAll('[data-glass-active="true"]').length, highlightImage: highlight.backgroundImage, highlightOpacity: Number(highlight.opacity) };
  });
  glassInteraction.samples.push({ name, ...measured });
  assert.ok(Number.isFinite(measured.x) && Number.isFinite(measured.y), `${name}热点应具有实际坐标`);
  assert.ok(Math.abs(measured.x / measured.width - position.x) <= .02 && Math.abs(measured.y / measured.height - position.y) <= .02, `${name}热点应随鼠标位于表面相应位置：${JSON.stringify(measured)}`);
  return measured;
}
async function verifyGlassCleared(name) {
  await page.waitForFunction(() => !document.querySelector('[data-glass-active]'));
  const leftovers = await page.locator('[data-glass]').evaluateAll(elements => elements.filter(element => element.style.getPropertyValue('--glass-x') || element.style.getPropertyValue('--glass-y')).map(element => element.getAttribute('data-glass') || element.className));
  assert.deepEqual(leftovers, [], `${name}应清理旧表面的热点坐标`);
  glassInteraction.samples.push({ name, activeCount: 0, cleared: true });
}
async function twoFrames() { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function verifyGlassInteraction() {
  const search = '.global-search[data-glass]', dock = '.sidebar-dock[data-glass]';
  let session, mediaOverridden = false;
  await navigate('游戏');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  try {
    glassInteraction.preferences = await page.evaluate(() => ({ finePointer: matchMedia('(hover: hover) and (pointer: fine)').matches, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }));
    assert.equal(glassInteraction.preferences.finePointer, true, '桌面隔离浏览器应提供精确指针');
    assert.equal(glassInteraction.preferences.reducedMotion, false);
    const first = await glassPointerSample(search, { x: .3, y: .4 }, '搜索左侧热点');
    const next = await glassPointerSample(search, { x: .75, y: .65 }, '搜索右侧热点');
    assert.ok(next.x - first.x > first.width * .25, '鼠标移动应真实改变热点位置');
    assert.notEqual(next.highlightImage, first.highlightImage, '玻璃伪元素的实际渐变热点应随鼠标移动');
    await glassPointerSample(dock, { x: .5, y: .2 }, '切换到Dock仅保留一个热点');
    const quiet = await page.evaluate(() => {
      const points = [[innerWidth * .99, innerHeight * .01], [innerWidth * .01, innerHeight * .01], [innerWidth * .5, innerHeight * .08]];
      return points.find(([x, y]) => !document.elementFromPoint(x, y)?.closest('[data-glass]'));
    });
    assert.ok(quiet, '应有可离开玻璃表面的普通区域');
    await page.mouse.move(...quiet);
    await verifyGlassCleared('离开玻璃表面');
    await glassPointerSample(search, { x: .4, y: .5 }, '减少动态前热点');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    await verifyGlassCleared('减少动态实时清理');
    const bounds = await page.locator(search).boundingBox();
    await page.mouse.move(bounds.x + bounds.width * .6, bounds.y + bounds.height * .5);
    await twoFrames();
    await verifyGlassCleared('减少动态时移动鼠标不激活热点');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
    await glassPointerSample(search, { x: .7, y: .5 }, '恢复动态后热点重新可用');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await verifyGlassCleared('窗口失焦清理');
    glassInteraction.normalSurfaces = [];
    for (const mode of ['dark', 'light']) {
      await chooseTheme(mode);
      await glassPointerSample(search, { x: .55, y: .45 }, `${mode}玻璃截图热点`);
      const surfaces = await glassStyles();
      assert.ok(surfaces.some(surface => surface.layers.some(layer => /blur\(/.test(layer.backdrop))), `${mode}应在少数表面保留玻璃背景模糊`);
      glassInteraction.normalSurfaces.push({ mode, surfaces });
      await capture(`${mode}-glass-pointer`);
    }
    await chooseTheme('dark');
    session = await context.newCDPSession(page);
    let configured = true;
    try {
      await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-reduced-motion', value: 'no-preference' }, { name: 'prefers-color-scheme', value: 'dark' }] });
      mediaOverridden = true;
    } catch (error) {
      configured = false;
      glassInteraction.reducedTransparency.reason = `浏览器不支持此媒体特征模拟：${error.message}`;
    }
    const supported = configured && await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches);
    glassInteraction.reducedTransparency.supported = supported;
    if (supported) {
      await verifyGlassCleared('减少透明度实时清理');
      glassInteraction.reducedTransparency.themes = [];
      for (const mode of ['dark', 'light']) {
        await chooseTheme(mode);
        const surfaces = await glassStyles();
        for (const surface of surfaces) {
          assert.ok(surface.layers.every(layer => !/blur\(/.test(layer.backdrop)), `${mode}/${surface.surface}减少透明度时不能保留背景模糊`);
          const normal = glassInteraction.normalSurfaces.find(entry => entry.mode === mode).surfaces.find(entry => entry.surface === surface.surface);
          const solid = surface.layers.find(layer => layer.pseudo === null);
          const original = normal?.layers.find(layer => layer.pseudo === null);
          assert.ok(solid?.alpha >= .9 && (original?.alpha === undefined || solid.alpha >= original.alpha), `${mode}/${surface.surface}减少透明度时应采用更实的底色：${JSON.stringify(surface)}`);
        }
        glassInteraction.reducedTransparency.themes.push({ mode, surfaces });
      }
      const bounds = await page.locator(search).boundingBox();
      await page.mouse.move(bounds.x + bounds.width * .4, bounds.y + bounds.height * .6);
      await twoFrames();
      await verifyGlassCleared('减少透明度时移动鼠标不激活热点');
      await capture('glass-reduced-transparency');
    } else if (!glassInteraction.reducedTransparency.reason) glassInteraction.reducedTransparency.reason = '浏览器接受媒体模拟，但此版本未匹配减少透明度偏好';
  } finally {
    if (session) { if (mediaOverridden) await session.send('Emulation.setEmulatedMedia', { features: [] }); await session.detach(); }
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await chooseTheme('dark');
  }
  await verifyGlassCleared('玻璃验证结束恢复减少动态');
  await verifyFixtureUnchanged('玻璃热点与辅助偏好', baseline);
  checks.push('真实鼠标移动驱动单一玻璃热点，切换表面、离开与失焦清理；减少动态实时禁用并在恢复后可用；深浅玻璃截图、支持时减少透明度关闭blur并使用实底；仅浏览不改写收藏');
}

async function verifyLargeLibraryGlass() {
  largeLibraryGlass = await page.locator('.media-gallery .media-card,.media-gallery .card-cover').evaluateAll(elements => ({
    elements: elements.length,
    markedSurfaces: elements.filter(element => element.hasAttribute('data-glass')).length,
    filtered: elements.flatMap(element => [null, '::before', '::after'].flatMap(pseudo => {
      const style = getComputedStyle(element, pseudo), backdrop = style.backdropFilter || style.webkitBackdropFilter || 'none';
      return backdrop !== 'none' ? [{ className: element.className, pseudo, backdrop }] : [];
    })),
  }));
  assert.equal(largeLibraryGlass.elements, 120, '60件游戏卡片和封面均须检查');
  assert.equal(largeLibraryGlass.markedSurfaces, 0, '大库卡片不能逐张成为指针玻璃表面');
  assert.deepEqual(largeLibraryGlass.filtered, [], '大库卡片、封面及伪元素不能逐张叠加背景模糊');
}

async function ambientFrame(name) {
  const measured = await page.locator('.ambient-scene').evaluate(scene => {
    const canvas = scene.querySelector('canvas'), bounds = canvas.getBoundingClientRect();
    // Reading the source repeatedly can change GPU/CPU rounding without a draw.
    const snapshot = document.createElement('canvas');
    snapshot.width = canvas.width; snapshot.height = canvas.height;
    const reader = snapshot.getContext('2d', { willReadFrequently: true });
    reader.drawImage(canvas, 0, 0);
    const data = reader.getImageData(0, 0, snapshot.width, snapshot.height).data;
    let hash = 2166136261, pixels = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (!data[index]) continue;
      pixels++;
      hash = Math.imul(hash ^ index, 16777619);
      hash = Math.imul(hash ^ (data[index - 3] | data[index - 2] << 8 | data[index - 1] << 16 | data[index] << 24), 16777619);
    }
    return { hash: (hash >>> 0).toString(16), nontransparentPixels: pixels, motion: scene.getAttribute('data-motion'), particles: Number(scene.getAttribute('data-particles')), canvas: { width: canvas.width, height: canvas.height, cssWidth: bounds.width, cssHeight: bounds.height }, sceneX: parseFloat(scene.style.getPropertyValue('--scene-x')) || 0, sceneY: parseFloat(scene.style.getPropertyValue('--scene-y')) || 0 };
  });
  ambientBackground.frames.push({ name, ...measured });
  assert.ok(measured.nontransparentPixels > 0, `${name}粒子画布须包含实际绘制像素`);
  assert.ok(measured.particles > 0 && measured.particles <= 112, `${name}粒子数量应有上限`);
  assert.ok(measured.canvas.width / measured.canvas.cssWidth <= 1.51 && measured.canvas.height / measured.canvas.cssHeight <= 1.51, `${name}画布DPR应限制在1.5以内`);
  return measured;
}
async function ambientFramePair(name, animated) {
  const first = await ambientFrame(`${name}·首帧`);
  await page.waitForTimeout(160);
  const second = await ambientFrame(`${name}·次帧`);
  if (animated) assert.notEqual(second.hash, first.hash, `${name}实际画布像素应持续变化`);
  else assert.equal(second.hash, first.hash, `${name}实际画布像素应保持静止`);
  return [first, second];
}
async function ambientUiBounds() {
  return page.locator('.main-panel,.topbar,.page-heading h1,.collection-section').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { className: element.className || element.tagName, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
}
async function verifyAmbientBackground() {
  const preferenceKey = 'qiyu.background.v1';
  const scene = page.locator('.ambient-scene');
  await navigate('游戏');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), preferenceKey), null, '未设置时应使用默认背景偏好');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  try {
    await page.locator('.ambient-scene[data-motion="animated"]').waitFor();
    const before = await ambientUiBounds();
    assert.ok(before.length >= 4, '应实际记录主容器、顶栏、页面标题与收藏区位置');
    const viewport = page.viewportSize();
    await page.mouse.move(viewport.width * .15, viewport.height * .15);
    await page.waitForFunction(() => {
      const scene = document.querySelector('.ambient-scene');
      return parseFloat(scene.style.getPropertyValue('--scene-x')) < -.2 && parseFloat(scene.style.getPropertyValue('--scene-y')) < -.2;
    });
    const left = await ambientFrame('指针左上背景偏移');
    await page.mouse.move(viewport.width * .85, viewport.height * .85);
    await page.waitForFunction(() => {
      const scene = document.querySelector('.ambient-scene');
      return parseFloat(scene.style.getPropertyValue('--scene-x')) > .2 && parseFloat(scene.style.getPropertyValue('--scene-y')) > .2;
    });
    const right = await ambientFrame('指针右下背景偏移');
    const after = await ambientUiBounds();
    ambientBackground.pointer = { left: { x: left.sceneX, y: left.sceneY }, right: { x: right.sceneX, y: right.sceneY }, uiBefore: before, uiAfter: after };
    assert.ok(right.sceneX > left.sceneX && right.sceneY > left.sceneY, '背景应对指针产生轻微视差响应');
    assert.deepEqual(after.map(bounds => bounds.className), before.map(bounds => bounds.className));
    for (let index = 0; index < before.length; index++) for (const dimension of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(after[index][dimension] - before[index][dimension]) <= .5, `背景视差不能带动主UI或标题：${before[index].className}/${dimension}`);
    await ambientFramePair('默认开启动态背景', true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.ambient-scene[data-motion="static"]').waitFor();
    await ambientFramePair('减少动态静态背景', false);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('.ambient-scene[data-motion="animated"]').waitFor();
    let settings = await openSettings();
    let toggle = settings.getByRole('checkbox', { name: '动态背景', exact: true });
    assert.equal(await toggle.isChecked(), true, '未设置时动态背景默认开启');
    await toggle.uncheck();
    await page.locator('.ambient-scene[data-motion="static"]').waitFor();
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), preferenceKey), { enabled: false });
    await settings.getByRole('button', { name: '关闭', exact: true }).click();
    await ambientFramePair('关闭动态背景', false);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.ambient-scene[data-motion="static"]').waitFor();
    await ambientFramePair('重载保留关闭', false);
    settings = await openSettings();
    toggle = settings.getByRole('checkbox', { name: '动态背景', exact: true });
    assert.equal(await toggle.isChecked(), false, '动态背景关闭偏好应在重载后保留');
    await toggle.check();
    await page.locator('.ambient-scene[data-motion="animated"]').waitFor();
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), preferenceKey), { enabled: true });
    await settings.getByRole('button', { name: '关闭', exact: true }).click();
    await ambientFramePair('重新开启动效', true);
    let foreground;
    try {
      foreground = await context.newPage();
      await foreground.bringToFront();
      const hidden = await page.evaluate(() => document.hidden);
      if (hidden) {
        await page.waitForFunction(() => document.querySelector('.ambient-scene')?.getAttribute('data-motion') === 'paused', undefined, { polling: 50 });
        await ambientFramePair('真实hidden页面停帧', false);
        ambientBackground.visibility.verified = true;
      } else ambientBackground.visibility.reason = '隔离浏览器切换空白页后未进入真实hidden，未验证后台停帧；未模拟内部可见性函数。';
    } finally {
      if (foreground) await foreground.close();
      await page.bringToFront();
    }
    await page.locator('.ambient-scene[data-motion="animated"]').waitFor();
    await navigate('游戏');
    for (const mode of ['dark', 'light']) {
      await chooseTheme(mode);
      await page.locator('.ambient-scene[data-motion="animated"]').waitFor();
      await ambientFrame(`${mode}背景截图`);
      await capture(`${mode}-ambient-background`);
    }
  } finally {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await chooseTheme('dark');
  }
  await page.locator('.ambient-scene[data-motion="static"]').waitFor();
  assert.equal(await scene.getAttribute('data-motion'), 'static');
  await verifyFixtureUnchanged('动态背景开关与辅助偏好', baseline);
  checks.push('动态背景默认开启：实际canvas连续帧变化、指针改变背景视差而主UI和标题位置不动；减少动态/手动关闭均停帧，关闭重载保留且重新开启恢复；粒子≤112、DPR≤1.5，深浅截图及收藏原文不变，后台停帧仅在真实hidden可用时验证');
}

async function verifyGenericTags() {
  await navigate('收藏总览');
  const { availableTags } = await import(pathToFileURL(path.join(root, 'src', 'domain', 'library.ts')).href);
  const overviewTags = page.locator('#library-tag-filters');
  assert.equal(await overviewTags.locator('.tag-filter').count(), 8, '桌面普通板块默认显示八个常用标签');
  await overviewTags.getByRole('button', { name: /^展开全部标签/ }).click();
  assert.equal(await overviewTags.locator('.tag-filter').count(), availableTags(fixture.items).length, '普通板块更多入口可达全部标签');
  await overviewTags.getByRole('button', { name: '收起更多标签', exact: true }).click();
  assert.equal(await overviewTags.locator('.tag-filter').count(), 8);
  await navigate('书籍');
  const panel = page.locator('#library-tag-filters');
  assert.equal(await panel.isVisible(), true);
  const search = page.locator('.tag-panel').getByRole('textbox', { name: '查找筛选标签', exact: true });
  await search.fill('哲思');
  assert.equal(await panel.locator('.tag-filter').count(), 1);
  await panel.getByRole('button', { name: /^哲思/ }).click();
  assert.equal(await page.locator('.media-gallery .media-card').count(), 1);
  assert.equal(await page.locator('.media-gallery .card-name').innerText(), '悉达多');
  await page.locator('.active-filter-summary').getByRole('button', { name: '全部清除', exact: true }).click();
  await search.fill('');
  checks.push('普通板块常用八标签可展开全部再收起，书籍标签默认可见且支持标签查找、直接筛选作品及清除');
}

async function verifyAppearanceFailure() {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installFixture(fixture);
  await page.evaluate(key => localStorage.setItem(key, '{bad-json'), appearanceKey);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await theme(), 'dark', '损坏偏好降级为深色');
  assert.match(await page.locator('body').innerText(), /外观设置.*无法读取/);
  await verifyFixtureUnchanged('损坏外观偏好降级', baseline);
  await capture('appearance-invalid-preference');
  await page.evaluate(key => {
    const originalGet = Storage.prototype.getItem, originalSet = Storage.prototype.setItem;
    window.__qiyuPreferenceRestore = () => { Storage.prototype.getItem = originalGet; Storage.prototype.setItem = originalSet; };
    Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('Preference unavailable', 'QuotaExceededError'); return originalSet.call(this, name, value); };
  }, appearanceKey);
  await chooseTheme('light');
  assert.match(await page.locator('body').innerText(), /外观已切换.*无法保存/);
  await verifyFixtureUnchanged('外观写入失败仍可切换', baseline);
  await capture('appearance-storage-unavailable');
  await page.evaluate(key => { window.__qiyuPreferenceRestore(); delete window.__qiyuPreferenceRestore; localStorage.setItem(key, JSON.stringify({ mode: 'dark' })); }, appearanceKey);
  await page.reload({ waitUntil: 'networkidle' });
  await page.addInitScript(key => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function(name) { if (name === key) throw new DOMException('Preference unavailable', 'SecurityError'); return original.call(this, name); };
  }, appearanceKey);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await theme(), 'dark', '偏好读取被浏览器拒绝时默认深色');
  assert.match(await page.locator('body').innerText(), /外观设置.*无法读取/);
  await verifyFixtureUnchanged('外观读取不可用降级', baseline);
  await capture('appearance-read-unavailable');
  checks.push('损坏及无法读取的外观偏好降级且提示，模拟偏好写入失败后仍即时切换并显示提示；收藏库原文与SHA256均不变');
}

async function verifyCollectionSizes() {
  await page.setViewportSize({ width: 1440, height: 960 });
  const empty = { schemaVersion: 1, items: [], notes };
  let raw = await installFixture(empty);
  await verifyChrome();
  assert.equal(await page.locator('.media-card').count(), 0);
  assert.equal(await page.locator('.experience-timeline').count(), 0);
  assert.equal(await page.locator('.collection-workspace--split').count(), 0);
  await page.getByRole('button', { name: '收录第一件作品', exact: true }).waitFor();
  await capture('empty-library');
  await page.setViewportSize({ width: 880, height: 640 }); await capture('empty-window-880');
  await page.setViewportSize({ width: 390, height: 844 }); await capture('empty-mobile-390');
  await verifyFixtureUnchanged('0件示例库', raw);

  const single = { schemaVersion: 1, notes, items: [{ ...structuredClone(fixture.items.find(item => item.category === 'game')), id: 'visual-single-1', title: '示例作品', creator: '界面验证示例', impression: '这是一件虚构的界面验证作品，不是用户收藏。', experienceEntries: [] }] };
  await page.setViewportSize({ width: 1440, height: 960 });
  raw = await installFixture(single);
  await verifyChrome();
  assert.equal(await page.locator('.media-gallery .media-card').count(), 1);
  assert.equal(await page.locator('.experience-timeline').count(), 0);
  assert.equal(await page.locator('.collection-workspace--split').count(), 0);
  assert.equal(await page.locator('.add-collection-tile').count(), 1);
  assert.equal(await page.locator('.add-collection-tile.media-card').count(), 0, '添加入口不应冒充收藏作品');
  await verifyFirstCover('1件示例库');
  await capture('single-library');
  await page.locator('.add-collection-tile').click();
  const editor = page.getByRole('dialog');
  await editor.waitFor();
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 880, height: 640 }); await capture('single-window-880');
  await page.setViewportSize({ width: 390, height: 844 }); await capture('single-mobile-390');
  await verifyFixtureUnchanged('1件示例库', raw);

  const templates = fixture.items.filter(item => item.category === 'game');
  const thumbnails = await page.evaluate(async covers => {
    const result = [];
    for (const cover of covers) {
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = cover; });
      const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 180;
      canvas.getContext('2d').drawImage(image, 0, 0, 120, 180); result.push(canvas.toDataURL('image/png'));
    }
    return result;
  }, templates.map(item => item.coverUrl));
  const large = { schemaVersion: 1, notes, items: Array.from({ length: 60 }, (_, index) => ({ ...structuredClone(templates[index % templates.length]), id: `visual-large-${index + 1}`, title: `示例游戏 ${String(index + 1).padStart(2, '0')}`, creator: '批量界面验证示例', coverUrl: thumbnails[index % thumbnails.length], experienceEntries: [] })) };
  await page.setViewportSize({ width: 1440, height: 960 });
  raw = await installFixture(large);
  await verifyChrome();
  assert.equal(await page.locator('.media-gallery .media-card').count(), 60);
  assert.equal(await page.locator('.experience-timeline').count(), 0);
  assert.equal(await page.locator('.collection-workspace--split').count(), 0);
  assert.equal(await page.locator('.add-collection-tile').count(), 0);
  await verifyFirstCover('60件示例库');
  await verifyLargeLibraryGlass();
  await capture('large-library');
  await page.setViewportSize({ width: 880, height: 640 }); await capture('large-window-880');
  await page.setViewportSize({ width: 390, height: 844 }); await capture('large-mobile-390');
  await verifyFixtureUnchanged('60件示例库', raw);
  checks.push('0件、1件与60件独立示例库通过真实校验；无记录时收藏库全宽且不造回顾，单件添加入口不计为作品；60张卡片及封面均无逐张背景模糊；桌面/880/390无横向溢出');
}

async function verifyPlaytimePresentation() {
  await page.setViewportSize({ width: 1440, height: 960 });
  const template = fixture.items.find(item => item.category === 'game');
  const cases = [
    { id: 'recorded', title: '时长验证·已记录', minutes: 90, text: '1.5h' },
    { id: 'zero', title: '时长验证·零分钟', minutes: 0, text: '0h' },
    { id: 'unknown', title: '时长验证·未记录', minutes: undefined, text: '时长未记录' },
  ];
  const snapshot = {
    schemaVersion: 1, notes,
    items: cases.map(entry => ({
      ...structuredClone(template), id: `visual-want-${entry.id}`, title: entry.title,
      creator: '界面验证示例', status: 'want', gamePlayState: 'want',
      playtimeMinutes: entry.minutes, experienceEntries: [],
    })),
  };
  const raw = await installFixture(snapshot);
  await navigate('游戏');
  assert.equal(await page.locator('.media-gallery .media-card').count(), cases.length);
  async function verifyOrder(container, selectors, entry, view) {
    const measured = await container.evaluate((element, selectors) => {
      const time = element.querySelector(selectors.time), state = element.querySelector(selectors.state);
      if (!time || !state) return { missing: true };
      const value = time.querySelector('strong') ?? time;
      const timeRect = time.getBoundingClientRect(), stateRect = state.getBoundingClientRect();
      const timeStyle = getComputedStyle(value), stateStyle = getComputedStyle(state);
      const bounds = rect => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
      return {
        timeText: time.textContent.replace(/\s+/g, ''), stateText: state.textContent.trim(),
        timeValue: value.textContent.replace(/\s+/g, ''),
        timeBeforeState: Boolean(time.compareDocumentPosition(state) & Node.DOCUMENT_POSITION_FOLLOWING),
        time: bounds(timeRect), state: bounds(stateRect), stateClass: state.className,
        timeFontSize: parseFloat(timeStyle.fontSize), stateFontSize: parseFloat(stateStyle.fontSize),
        timeWeight: Number(timeStyle.fontWeight), stateWeight: Number(stateStyle.fontWeight),
        timeColor: timeStyle.color, stateColor: stateStyle.color,
      };
    }, selectors);
    playtimePresentation.push({ view, fixture: entry.id, ...measured });
    assert.equal(measured.missing, undefined, `${view}/${entry.id}应同时呈现时长和状态`);
    assert.equal(measured.timeValue, entry.text, `${view}/${entry.id}时长须区分90分钟、明确零和未知`);
    assert.equal(measured.stateText, '待体验', `${view}/${entry.id}已有时长也不能推断或改写状态`);
    assert.ok(measured.stateClass.includes('game-state--want'));
    assert.equal(measured.timeBeforeState, true, `${view}/${entry.id}阅读顺序必须先时长后状态`);
    const tolerance = Math.max(measured.time.height, measured.state.height) * .2;
    const stateBelow = measured.state.top >= measured.time.bottom - tolerance;
    const stateOnRight = measured.state.top >= measured.time.top - tolerance && measured.state.left >= measured.time.right - Math.min(measured.time.width, measured.state.width) * .1;
    assert.ok(measured.time.width > 0 && measured.time.height > 0 && measured.state.width > 0 && measured.state.height > 0 && (stateBelow || stateOnRight), `${view}/${entry.id}实际布局应先时长后状态：${JSON.stringify(measured)}`);
    assert.ok(measured.timeFontSize >= measured.stateFontSize && measured.timeWeight >= measured.stateWeight && measured.timeColor !== measured.stateColor, `${view}/${entry.id}状态应比时长弱化：${JSON.stringify(measured)}`);
  }
  for (const [view, label] of [['grid', '卡片视图'], ['list', '列表视图']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    for (const entry of cases) {
      const card = page.getByRole('button', { name: `查看${entry.title}详情`, exact: true });
      await verifyOrder(card, { time: '.card-playtime', state: '.card-game-state' }, entry, view);
    }
    await capture(`want-playtime-${view}`);
  }
  await page.getByRole('button', { name: '卡片视图', exact: true }).click();
  for (const entry of cases) {
    await page.getByRole('button', { name: `查看${entry.title}详情`, exact: true }).click();
    await verifyOrder(page.locator('.detail-personal-summary'), { time: '.detail-summary-playtime', state: '.detail-summary-state' }, entry, 'detail');
    assert.equal(await page.locator('.game-state-option--want.is-selected').count(), 1, `${entry.id}详情仍选中待体验`);
    if (entry.id === 'unknown') await capture('want-playtime-unknown-detail');
    await closeDetail();
  }
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('qiyu.library.v1')));
  assert.deepEqual(stored.items.map(item => ({ status: item.status, state: item.gamePlayState, minutes: item.playtimeMinutes })), cases.map(entry => ({ status: 'want', state: 'want', minutes: entry.minutes })));
  await verifyFixtureUnchanged('三件待体验时长展示', raw);
  await installFixture(fixture);
  checks.push('独立三件待体验样例在卡片、列表及详情均先显示1.5 h、0 h或时长未记录，再弱化显示待体验；时长与状态保留原值，浏览前后收藏原文及SHA256不变');
}

async function verifyDetailEntryMotion() {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    const events = [];
    const listener = event => {
      if (event.target instanceof Element && event.target.matches('.detail-panel')) events.push({ type: event.type, name: event.animationName, elapsedTime: event.elapsedTime, capturedAt: performance.now() });
    };
    window.__qiyuDesignMotion = { events, listener };
    document.addEventListener('animationstart', listener);
    document.addEventListener('animationend', listener);
  });
  await page.getByRole('button', { name: '查看空洞骑士详情', exact: true }).click();
  const panel = page.locator('.detail-panel[data-category="game"]');
  await panel.waitFor();
  entryMotion = await panel.evaluate(async element => {
    const style = getComputedStyle(element);
    const initial = { animationName: style.animationName, animationDuration: style.animationDuration, transform: style.transform, opacity: style.opacity };
    const animations = element.getAnimations();
    const runningFrames = animations.map(animation => ({ playState: animation.playState, currentTime: animation.currentTime, timing: animation.effect?.getComputedTiming() }));
    let timer;
    try {
      await Promise.race([
        Promise.all(animations.map(animation => animation.finished)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('详情进入动画未在3秒内结束')), 3000); }),
      ]);
    } finally { clearTimeout(timer); }
    const finalStyle = getComputedStyle(element);
    return {
      noPreference: matchMedia('(prefers-reduced-motion: no-preference)').matches,
      initial, runningFrames,
      final: { transform: finalStyle.transform, identityTransform: finalStyle.transform === 'none' || new DOMMatrixReadOnly(finalStyle.transform).isIdentity, opacity: finalStyle.opacity, activeAnimations: element.getAnimations().filter(animation => animation.playState !== 'finished').map(animation => animation.playState) },
    };
  });
  await page.waitForFunction(() => window.__qiyuDesignMotion.events.some(event => event.type === 'animationend'), undefined, { timeout: 3000 });
  entryMotion.events = await page.evaluate(() => {
    const { events, listener } = window.__qiyuDesignMotion;
    document.removeEventListener('animationstart', listener); document.removeEventListener('animationend', listener);
    delete window.__qiyuDesignMotion; return events;
  });
  assert.equal(entryMotion.noPreference, true);
  assert.notEqual(entryMotion.initial.animationName, 'none');
  assert.ok(entryMotion.initial.animationDuration.split(',').some(duration => parseFloat(duration) > 0));
  assert.ok(entryMotion.events.some(event => event.type === 'animationstart'));
  assert.ok(entryMotion.events.some(event => event.type === 'animationend' && event.elapsedTime > 0));
  assert.equal(entryMotion.final.identityTransform, true); assert.equal(Number(entryMotion.final.opacity), 1);
  assert.deepEqual(entryMotion.final.activeAnimations, []);
  fs.writeFileSync(path.join(evidence, 'entry-motion.json'), JSON.stringify(entryMotion, null, 2));
  checks.push('默认动态设置下记录详情进入动画名称、时长和帧，实际结束后恢复最终位置且无残余动画');
}

(async () => {
  try {
    archiveRoundOne();
    base = await startServer();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'light' });
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(base + '/') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      resourceErrors.push(`已阻止外部请求: ${url}`); return route.abort();
    });
    page = await context.newPage(); page.setDefaultTimeout(12000);
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) resourceErrors.push(`${response.status()} ${response.url()}`); });
    await prepareFixture();
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '收藏总览', exact: true }).waitFor();
    assert.equal(await page.locator('.error-banner').count(), 0);
    assert.equal(await page.locator('.demo-banner').count(), 1, '示例作品应明确标示为演示');
    await verifyChrome();
    await verifyNavigationAndDepth();
    await verifyAppearance();
    assert.equal(await page.locator('.collection-workspace--split').count(), 1, '总览有真实记录时才呈现不对称Bento分区');
    assert.equal(await page.locator('.timeline-row').count(), 4, '紧凑回顾默认只展示4条实际记录');
    await verifyFirstCover('11件示例库总览');
    await capture('overview');
    await capture('dark-overview');

    for (const [category, label] of [['overview', '收藏总览'], ['game', '游戏'], ['book', '书籍'], ['screen', '影视'], ['music', '音乐']]) {
      const count = category === 'overview' ? fixture.items.length : fixture.items.filter(item => item.category === category).length;
      await navigate(label);
      await page.waitForFunction(category => document.querySelector('.app-shell')?.getAttribute('data-section') === category, category);
      assert.equal(await page.locator('.media-gallery .media-card').count(), count);
      const nav = page.getByRole('navigation', { name: '作品分类' });
      assert.equal(await nav.locator('[aria-current="page"]').count(), 1, '当前分类应有唯一可访问标识');
      assert.equal(await nav.getByRole('button', { name: label, exact: true }).getAttribute('aria-current'), 'page');
      await verifyChrome();
    }
    checks.push('五个侧栏导航均能进入正确收藏库且数量匹配；无重复品牌、口号和四分类大卡，顶栏只保留一个收藏搜索框');

    await navigate('游戏');
    await verifyFirstCover('游戏库');
    await verifyLibraryInteractions();
    await capture('game-library');
    await verifyDetailEntryMotion();
    await capture('game-detail');
    assert.ok(await page.locator('.detail-panel .impression-input').inputValue());
    await page.locator('.detail-panel').getByRole('button', { name: '记录体验', exact: true }).click();
    const experienceDialog = page.getByRole('dialog', { name: '添加体验记录', exact: true });
    await experienceDialog.waitFor();
    await experienceDialog.getByRole('button', { name: '取消', exact: true }).click();
    await experienceDialog.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.detail-panel[data-category="game"]').count(), 1);
    checks.push('游戏详情主按钮可打开体验记录对话框，直接取消后仍停留详情且不写入记录');
    await closeDetail();
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await navigate('书籍');
    await page.getByRole('button', { name: '查看设计心理学详情', exact: true }).click();
    await page.locator('.detail-impression').scrollIntoViewIfNeeded();
    await capture('book-impression');
    assert.ok((await page.locator('.impression-input').inputValue()).includes('示例笔记'));
    await closeDetail();
    checks.push('游戏详情与书籍印象布局可访问，示例封面加载成功');
    await verifyGenericTags();
    await verifyThemedSurfaces();
    await verifyGlassInteraction();
    await verifyAmbientBackground();

    await navigate('收藏总览');
    monthlyActivity = await page.locator('.month-activity-cell').evaluateAll(elements => elements.map(element => ({
      month: element.getAttribute('data-month'), level: element.getAttribute('data-level'), label: element.getAttribute('aria-label'), disabled: element.disabled,
    })));
    const calendarMonths = ['2025-11', '2025-12', ...Array.from({ length: 10 }, (_, index) => `2026-${String(index + 1).padStart(2, '0')}`)];
    const recordedCounts = { '2026-06': 1, '2026-07': 2, '2026-08': 3, '2026-09': 4, '2026-10': 2 };
    assert.deepEqual(monthlyActivity.map(entry => entry.month), calendarMonths, '热图应从最新记录月份向前显示连续12个月');
    for (const entry of monthlyActivity) {
      const count = recordedCounts[entry.month] ?? 0;
      assert.equal(entry.level, String(count));
      assert.equal(entry.disabled, count === 0, '没有体验记录的月份应为禁用空格');
      assert.ok(entry.label.startsWith(entry.month), '可访问名称应保留完整年月');
      if (count > 0) assert.equal(entry.label, `${entry.month}，${count} 条体验记录`);
    }
    const june = page.locator('.month-activity-cell[data-month="2026-06"]');
    await june.scrollIntoViewIfNeeded();
    assert.equal(await june.getAttribute('aria-label'), '2026-06，1 条体验记录');
    await june.click();
    assert.equal(await june.getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await page.locator('.timeline-row time').allTextContents(), ['2026-06']);
    assert.equal(await page.getByLabel(/^回顾月份/).inputValue(), '2026-06');
    const september = page.locator('.month-activity-cell[data-month="2026-09"]');
    assert.equal(await september.getAttribute('aria-label'), '2026-09，4 条体验记录');
    await september.click();
    assert.equal(await page.locator('.timeline-row').count(), 4);
    assert.ok((await page.locator('.timeline-row time').allTextContents()).every(date => date.startsWith('2026-09')));
    await september.click();
    assert.equal(await page.getByLabel(/^回顾月份/).inputValue(), 'all');
    assert.equal(await page.locator('.timeline-row').count(), 4, '取消月份后恢复紧凑4条');
    await page.getByRole('button', { name: '展开全部体验记录', exact: true }).click();
    assert.equal(await page.locator('.timeline-row').count(), 12);
    await capture('overview-months');
    await page.getByRole('button', { name: '收起体验记录', exact: true }).click();
    assert.equal(await page.locator('.timeline-row').count(), 4);
    checks.push('连续12个月热图：5个月真实计数、7个月为空且禁用；月份筛选保持YYYY-MM，不捏造1日；4条紧凑记录可展开12条再收起');

    const reducedMotion = await page.evaluate(() => ({
      matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
      elements: [...document.querySelectorAll('.media-card,.nav-item,.timeline-row,.button,.advanced-toggle')].slice(0, 40).map(element => {
        const style = getComputedStyle(element);
        return { className: element.className, transitionProperty: style.transitionProperty, transitionDuration: style.transitionDuration, animationName: style.animationName, animationDuration: style.animationDuration };
      }),
    }));
    assert.equal(reducedMotion.matches, true);
    for (const element of reducedMotion.elements) {
      if (element.transitionProperty !== 'none') assert.ok(element.transitionDuration.split(',').every(duration => parseFloat(duration) <= 0.05), `减少动态效果未生效: ${JSON.stringify(element)}`);
      if (element.animationName !== 'none') assert.ok(element.animationDuration.split(',').every(duration => parseFloat(duration) <= 0.05), `减少动画未生效: ${JSON.stringify(element)}`);
    }
    fs.writeFileSync(path.join(evidence, 'reduced-motion.json'), JSON.stringify(reducedMotion, null, 2));
    checks.push('prefers-reduced-motion真实计算样式符合减少动态设置');

    await navigate('游戏');
    for (const [zoom, label] of [[1.25, 'zoom-125'], [1.5, 'zoom-150']]) {
      await page.evaluate(value => { document.documentElement.style.zoom = String(value); document.querySelector('.main-scroll').scrollTop = 0; }, zoom);
      assert.equal(await page.evaluate(() => Number(getComputedStyle(document.documentElement).zoom)), zoom);
      await capture(label);
    }
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });
    checks.push('1440×960下125%/150%真实CSS缩放重排无横向溢出，未使用CDP页面放大');

    await page.setViewportSize({ width: 880, height: 640 });
    await navigate('游戏');
    await verifyDockLayout('880窄窗');
    await verifyDockButtons('880窄窗');
    assert.equal(await page.locator('.tag-type--gameplay .tag-filter').count(), 2, '窄窗游戏分组默认显示两个常用标签');
    narrowFirstCover = await verifyFirstCover('880窄窗');
    assert.ok(narrowFirstCover.y < 610, `880窄窗首封面应提前至首屏，旧版在640以下：${JSON.stringify(narrowFirstCover)}`);
    await capture('window-880');
    await page.setViewportSize({ width: 880, height: 360 });
    await verifyDockLayout('880短窗');
    await verifyDockButtons('880短窗');
    await capture('dock-short-window');
    await page.setViewportSize({ width: 390, height: 844 });
    await navigate('收藏总览'); await capture('mobile-390');
    await verifyMobileDock();
    checks.push('1440桌面、880×640小窗、390×844窄屏均无页面或容器横向溢出');
    await verifyFixtureUnchanged('11件示例库', baseline);
    await verifyCollectionSizes();
    await verifyPlaytimePresentation();
    await verifyAppearanceFailure();
    assert.deepEqual(pageErrors, []); assert.deepEqual(resourceErrors, []);
  } catch (error) {
    failure = { message: error.message, stack: error.stack }; process.exitCode = 1; console.error(error);
    if (page && !page.isClosed()) {
      try { await page.screenshot({ path: path.join(evidence, 'failure.png'), timeout: 15000 }); } catch { /* Preserve the original failure. */ }
      try { fs.writeFileSync(path.join(evidence, 'failure.html'), await page.content()); } catch { /* Preserve the original failure. */ }
    }
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    const report = { passed: !failure, base, browser: 'Microsoft Edge / isolated context', checks, notes, screenshots, monthlyActivity, entryMotion, navigationAlignment, dockLayouts, dockButtonLayouts, themeControls, controlMaterials, playtimePresentation, glassInteraction, ambientBackground, largeLibraryGlass, surfaceDepth, narrowFirstCover, fixtureIntegrity, pageErrors, resourceErrors, layouts, failure, timestamp: new Date().toISOString() };
    fs.writeFileSync(path.join(evidence, 'validation.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  }
})();
