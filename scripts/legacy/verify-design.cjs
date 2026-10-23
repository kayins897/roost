const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const assets = path.join(root, '..', 'design', '2026-10-22-concepts', 'assets');
const evidence = path.join(root, 'evidence', 'design-v043');
const notes = [
  '截图使用独立浏览器上下文中的演示作品与合成体验记录，并非用户真实收藏。',
  '六张游戏封面来自项目设计目录的原创几何 SVG，经浏览器 canvas 转为符合现有数据校验的 PNG data URI；不是官方封面。',
  '书籍封面为验证脚本绘制的原创纸质字封面；体验日期和印象均为界面验证样例。',
  '仅连接本脚本启动的本地静态服务；不访问 Steam、豆瓣、真实用户浏览器配置或 Electron 进程。',
];
const checks = [], screenshots = [], pageErrors = [], resourceErrors = [], layouts = [];
let monthlyActivity = [], entryMotion;
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
    const targets = ['.main-scroll', '.detail-panel', '.overview-bento', '.monthly-activity', '.modal'];
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
  const menu = page.getByRole('button', { name: '打开菜单', exact: true });
  if (await menu.isVisible() && !await page.locator('.sidebar--open').count()) await menu.click();
  await page.getByRole('navigation', { name: '作品分类' }).getByRole('button', { name: new RegExp(label) }).click();
  await page.locator('.main-scroll').evaluate(element => { element.scrollTop = 0; });
}
async function closeDetail() { await page.locator('.detail-toolbar').getByRole('button', { name: '关闭', exact: true }).click(); }

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
    context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
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
    await capture('overview');

    for (const [category, label] of [['game', '游戏'], ['book', '书籍'], ['screen', '影视'], ['music', '音乐']]) {
      if (category !== 'game') await navigate('收藏总览');
      const count = fixture.items.filter(item => item.category === category).length;
      await page.getByRole('button', { name: `打开${label}收藏，共 ${count} 件`, exact: true }).click();
      await page.waitForFunction(category => document.querySelector('.app-shell')?.getAttribute('data-section') === category, category);
      assert.equal(await page.locator('.media-gallery .media-card').count(), count);
    }
    checks.push('四个Bento板块入口均进入正确收藏库且数量匹配');

    await navigate('游戏');
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
    assert.equal(await page.locator('.timeline-row').count(), 12);
    await capture('overview-months');
    checks.push('连续12个月热图：5个月真实计数、7个月为空且禁用；月份筛选保持YYYY-MM，不捏造1日');

    const reducedMotion = await page.evaluate(() => ({
      matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
      elements: [...document.querySelectorAll('.media-card,.overview-category,.nav-item,.timeline-row')].slice(0, 30).map(element => {
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
    await navigate('游戏'); await capture('window-880');
    await page.setViewportSize({ width: 390, height: 844 });
    await navigate('收藏总览'); await capture('mobile-390');
    checks.push('1440桌面、880×640小窗、390×844窄屏均无页面或容器横向溢出');
    assert.equal(await page.evaluate(() => localStorage.getItem('qiyu.library.v1')), baseline, '仅浏览交互不应改写演示收藏数据');
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
    const report = { passed: !failure, base, browser: 'Microsoft Edge / isolated context', checks, notes, screenshots, monthlyActivity, entryMotion, pageErrors, resourceErrors, layouts, failure, timestamp: new Date().toISOString() };
    fs.writeFileSync(path.join(evidence, 'validation.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  }
})();
