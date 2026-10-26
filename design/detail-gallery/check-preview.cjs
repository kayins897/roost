// Design prototype only. No app process, repository or user-data directory is accessed.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const directory = path.resolve(process.argv[2]);
const output = path.join(directory, 'screenshots');
const files = ['index.html', 'preview.css', 'preview.js', 'card-menu.js', 'layout.js', 'platforms.js'];
const report = { passed: false, scope: 'static-design-preview', appSourceChanged: false, persisted: false, productionPersistenceValidated: false, testedFiles: {}, checks: [], errors: [], externalRequests: [], failedLocalRequests: [], layouts: [], unverified: ['原生 Electron、真实收藏持久化和最后运行来源集成未验证'] };
let server, browser, page;
const platformIconSignatures = new Map();
async function platformIconSignature(icon) {
  return icon.evaluate(node => node.tagName.toLowerCase() === 'img' ? node.getAttribute('src') : [...node.querySelectorAll('path,polygon,polyline,circle,rect,ellipse,line,use')].map(shape => [...shape.attributes].filter(attribute => !['class','fill','stroke'].includes(attribute.name)).map(attribute => [attribute.name, attribute.value])).map(shape => JSON.stringify(shape)).join('|'));
}
const button = name => page.getByRole('button', { name, exact: true });
async function check(name, action) { await action(); report.checks.push(name); console.log('PASS ' + name); }
async function shot(name) { await page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled', fullPage: false }); }
async function layout(width, height) {
  await page.setViewportSize({ width, height });
  const boxes = await page.evaluate(() => ({
    rootWidth: document.documentElement.scrollWidth, width: innerWidth,
    cover: document.querySelector('.cover-card').getBoundingClientRect().toJSON(),
    coverImage: document.querySelector('.cover-card img').getBoundingClientRect().toJSON(),
    facts: document.querySelector('.facts-card').getBoundingClientRect().toJSON(),
    panel: document.querySelector('.detail-window').getBoundingClientRect().toJSON(),
    coverFit: getComputedStyle(document.querySelector('.cover-card img')).objectFit,
    cards: [...document.querySelectorAll('.bento-grid > .card')].map(n => ({ box: n.getBoundingClientRect().toJSON(), scrollWidth: n.scrollWidth, clientWidth: n.clientWidth })),
  }));
  assert.ok(boxes.rootWidth <= boxes.width + 1, '页面不能横向溢出');
  assert.ok(boxes.panel.x >= 0 && boxes.panel.x + boxes.panel.width <= width + 1, '弹窗边界');
  assert.equal(boxes.coverFit, 'contain', '封面完整显示');
  assert.ok(boxes.coverImage.x >= boxes.cover.x - 1 && boxes.coverImage.right <= boxes.cover.right + 1 && boxes.coverImage.y >= boxes.cover.y - 1 && boxes.coverImage.bottom <= boxes.cover.bottom + 1, '图片元素也在卡片内，不能被外层裁掉');
  boxes.cards.forEach(card => assert.ok(card.scrollWidth <= card.clientWidth + 1, '卡片内容横向边界'));
  report.layouts.push({ width, height, ...boxes });
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  for (const file of [...files, 'assets/platform-icons.js']) report.testedFiles[file] = createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex');
  server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://127.0.0.1').pathname;
    const file = path.resolve(directory, '.' + decodeURIComponent(name === '/' ? '/index.html' : name));
    if (!file.startsWith(directory + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' })[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1060 } });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) report.failedLocalRequests.push({ url: response.url(), status: response.status() }); });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === base || ['blob:', 'data:'].includes(url.protocol)) return route.continue();
    report.externalRequests.push(url.href); return route.abort();
  });
  await page.goto(base); await page.evaluate(() => document.fonts.ready);
  await page.locator('.cover-card img').waitFor();
  await check('实际图片载入，作品资料常驻、完整封面与四张相册', async () => {
    await page.waitForFunction(() => [...document.querySelectorAll('.cover-card img,.gallery-photo img')].every(img => img.complete && img.naturalWidth));
    assert.equal(await page.locator('.facts-card').isVisible(), true); assert.equal(await page.locator('.gallery-photo').count(), 4);
    await layout(1440, 1060); await shot('01-desktop');
    await page.locator('.detail-window').evaluate(n => { n.dataset.originalHeight = n.style.maxHeight; n.style.maxHeight = 'none'; });
    await page.locator('.detail-window').screenshot({ path: path.join(output, '02-full-layout.png') });
    await page.locator('.detail-window').evaluate(n => { n.style.maxHeight = n.dataset.originalHeight; n.scrollTop = 0; });
    await page.locator('.cover-card img').click({button:'right'}); await shot('11-card-menu');
    await page.locator('#edit-layout').click(); await shot('09-layout-editor');
    await page.locator('#manage-widgets').click(); await page.locator('#widget-manager details').evaluate(n => n.open = true); await shot('10-card-controls');
    await page.locator('#layout-cancel').click();
  });
  await check('原位体验分类与等级资格、时长未记录及0有区别', async () => {
    await button('体验分类 新游戏+ ⌄').click(); await button('新作开荒').click(); assert.equal(await page.locator('#priority-field').isVisible(), true); assert.equal(await page.locator('#grade-field').isVisible(), false);
    await page.locator('#experience-toggle').click(); await button('收官完结').click(); assert.equal(await page.locator('#priority-field').isVisible(), false); assert.equal(await page.locator('#grade-field').isVisible(), true);
    await page.locator('#experience-toggle').click(); await button('新游戏+').click();
    await button('修改游玩时长').click(); await page.getByRole('spinbutton', { name: '累计游玩小时' }).fill('0'); await page.locator('[data-save=hours]').click(); assert.equal(await page.locator('#hours-value').innerText(), '0h');
    await button('修改游玩时长').click(); await page.getByRole('spinbutton', { name: '累计游玩小时' }).fill(''); await page.locator('[data-save=hours]').click(); assert.equal(await page.locator('#hours-value').innerText(), '未记录');
  });
  await check('最后运行只显示明确记录，空值与0小时独立且足迹不推断日期', async () => {
    const lastRun = page.locator('#last-run-value');
    assert.equal(await lastRun.getAttribute('datetime'), '2026-10-24T21:36', '默认时间来自固定公开合成记录');
    assert.equal(await lastRun.innerText(), '2026.10.24 21:36');
    await button('修改游玩时长').click();
    await page.getByRole('spinbutton', { name: '累计游玩小时' }).fill('0');
    await page.locator('#last-run-input').fill('');
    await page.locator('[data-save=hours]').click();
    assert.equal(await page.locator('#hours-value').innerText(), '0h');
    assert.equal(await lastRun.innerText(), '未记录', '缺少来源时仅保留空态，不生成日期');
    assert.equal(await lastRun.getAttribute('datetime'), null);
    await page.locator('#add-footprint').click();
    await page.getByRole('textbox', { name: '足迹内容', exact: true }).fill('合成足迹：2026年10月26日再次尝试');
    await page.locator('#save-footprint').click();
    assert.equal(await lastRun.innerText(), '未记录');
    assert.equal(await lastRun.getAttribute('datetime'), null, '普通足迹不得推断最后运行');
    await button('修改游玩时长').click();
    await page.locator('#last-run-input').fill('2026-10-20T10:15');
    await page.locator('[data-save=hours]').click();
    assert.equal(await lastRun.getAttribute('datetime'), '2026-10-20T10:15');
    assert.equal(await lastRun.innerText(), '2026.10.20 10:15');
    assert.equal(await page.locator('#hours-value').innerText(), '0h', '单独编辑时间不改累计时长');
    await page.reload(); await page.evaluate(() => document.fonts.ready);
  });
  await check('拥有平台默认只含Steam和Switch，八个选项独立切换并呈现对应图标名字', async () => {
    const choices = page.locator('#platform-choices button[data-platform]');
    const selected = async () => choices.evaluateAll(nodes => nodes.filter(node => node.getAttribute('aria-pressed') === 'true').map(node => node.dataset.platform));
    const badges = page.locator('#platform-list .platform-badge');
    assert.deepEqual((await selected()).sort(), ['steam', 'switch'], '候选平台不等于全部拥有');
    assert.equal(await badges.count(), 2);
    await page.locator('#edit-platforms').click();
    assert.equal(await page.locator('#platform-editor').isVisible(), true);
    assert.equal(await page.locator('#edit-platforms').getAttribute('aria-expanded'), 'true');
    const expected = ['steam', 'playstation', 'switch', 'ea', 'battlenet', 'ubisoft', 'wegame', 'epic'];
    assert.deepEqual((await choices.evaluateAll(nodes => nodes.map(node => node.dataset.platform))).sort(), [...expected].sort());
    for (const id of await selected()) await page.locator('#platform-choices [data-platform="' + id + '"]').click();
    assert.equal(await badges.count(), 0);
    assert.equal((await page.locator('#platform-list').innerText()).trim(), '未记录');
    const expectedNames = { steam: /Steam/i, playstation: /PlayStation|PS[345]?/i, switch: /Switch/i, ea: /\bEA\b/i, battlenet: /Battle\.net/i, ubisoft: /Ubisoft/i, wegame: /WeGame/i, epic: /Epic/i };
    const iconSignatures = [];
    for (const id of expected) {
      const option = page.locator('#platform-choices [data-platform="' + id + '"]');
      await option.click();
      assert.equal(await option.getAttribute('aria-pressed'), 'true');
      assert.equal(await badges.count(), 1, '点击后拥有列表立即更新为单个平台：' + id);
      assert.equal(await option.locator('svg').isVisible(), true, '编辑选项也直接呈现平台图标：' + id);
      await page.locator('#done-platforms').click();
      assert.equal(await badges.first().isVisible(), true, '收起编辑后拥有平台可见：' + id);
      assert.match((await badges.first().innerText()).trim(), expectedNames[id], '平台具有对应的可读名称：' + id);
      const icon = badges.first().locator('svg,img[src$=".svg"]');
      assert.equal(await icon.count(), 1, '已知平台具有本地或inline SVG标志：' + id);
      assert.equal(await icon.isVisible(), true, '标志实际可见：' + id);
      iconSignatures.push(await platformIconSignature(icon));
      platformIconSignatures.set(id, iconSignatures.at(-1));
      assert.ok(iconSignatures.at(-1), '标志包含实际图形：' + id);
      if (await icon.evaluate(node => node.tagName.toLowerCase() === 'img')) assert.equal(await icon.evaluate(node => node.complete && node.naturalWidth > 0), true);
      await page.locator('#edit-platforms').click();
      await option.click();
      assert.equal(await option.getAttribute('aria-pressed'), 'false');
      assert.equal(await badges.count(), 0);
    }
    assert.equal(new Set(iconSignatures).size, expected.length, '八个平台具有不同标志图形');
    for (const id of expected) await page.locator('#platform-choices [data-platform="' + id + '"]').click();
    assert.equal(await badges.count(), 8, '多个拥有平台可同时呈现');
    await page.locator('#done-platforms').click();
    await layout(390, 844);
    await page.locator('.platform-card').scrollIntoViewIfNeeded();
    const surface = await page.locator('.platform-card').evaluate(node => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }));
    assert.ok(surface.scrollWidth <= surface.clientWidth + 1 && surface.scrollHeight <= surface.clientHeight + 2, '八个平台在手机半宽卡片中完整换行');
    await shot('14-platform-all-narrow');
    await page.setViewportSize({ width: 1440, height: 1060 });
    await page.locator('#edit-platforms').click();
    for (const id of expected) await page.locator('#platform-choices [data-platform="' + id + '"]').click();
    await page.locator('#done-platforms').click();
    assert.equal(await page.locator('#platform-editor').isVisible(), false);
    assert.equal(await page.locator('#edit-platforms').getAttribute('aria-expanded'), 'false');
    await shot('12-platform-empty');
    await page.reload(); await page.evaluate(() => document.fonts.ready);
  });
  await check('平台别名采用对应图标，自定义未知名字保留并去重', async () => {
    await page.locator('#edit-platforms').click();
    const add = async name => { await page.locator('#custom-platform').fill(name); await page.locator('#add-platform').click(); };
    await add('PS5');
    const ps = page.locator('#platform-list .platform-badge').filter({ hasText: /PS5|PlayStation/ });
    assert.equal(await ps.count(), 1);
    assert.equal(await ps.locator('svg,img[src$=".svg"]').count(), 1, 'PS5别名具有PlayStation标志');
    assert.equal(await platformIconSignature(ps.locator('svg,img[src$=".svg"]')), platformIconSignatures.get('playstation'), 'PS5别名复用PlayStation对应标志');
    const count = await page.locator('#platform-list .platform-badge').count();
    await add('PS5');
    assert.equal(await page.locator('#platform-list .platform-badge').count(), count, '已有平台不重复追加');
    const custom = '主机小站（合成平台）';
    await add(custom);
    const unknown = page.locator('#platform-list .platform-badge').filter({ hasText: custom });
    assert.equal(await unknown.count(), 1);
    assert.ok((await unknown.innerText()).includes(custom), '未知名字原文保留');
    assert.equal(await unknown.locator('svg').count(), 0, '未知平台不冒用已知平台标志');
    await add('  ' + custom + '  ');
    assert.equal(await unknown.count(), 1, '前后空白不产生重复自定义平台');
    await page.locator('#done-platforms').click();
    assert.equal(await unknown.isVisible(), true, '关闭编辑后仍保留自定义平台');
    await shot('13-platform-custom');
    await page.reload(); await page.evaluate(() => document.fonts.ready);
  });
  await check('常驻资料与标签可编辑，一句话印象80字，测评默认折叠', async () => {
    await page.locator('#edit-facts').click(); await page.locator('[data-input=creator]').fill('示例创作者'); await page.locator('#save-facts').click(); assert.equal(await page.locator('[data-field=creator]').innerText(), '示例创作者');
    await page.locator('#edit-tags').click(); await page.locator('.tag-editor input').first().fill('动作、动作、探索'); await page.locator('#save-tags').click(); assert.equal(await page.locator('.tag-row').first().locator('.tag-pill').count(), 2);
    await page.locator('#impression').fill('字'.repeat(90)); assert.equal((await page.locator('#impression').inputValue()).length, 80);
    assert.equal(await page.locator('#review-body').isVisible(), false); await page.locator('#review-toggle').click(); assert.equal(await page.locator('#review-body').isVisible(), true); await page.locator('#review-toggle').click();
    await page.reload(); await page.evaluate(() => document.fonts.ready);
  });
  await check('截图放大、键盘切换、说明编辑及Escape关闭', async () => {
    await button('查看截图 1').click(); await page.getByRole('dialog').waitFor(); assert.equal(await page.locator('#lightbox-position').innerText(), '1 / 4'); await page.keyboard.press('ArrowRight'); assert.equal(await page.locator('#lightbox-position').innerText(), '2 / 4');
    await page.locator('#photo-caption').fill('穿过蓝色的回廊'); await page.locator('#close-lightbox').focus(); await shot('03-lightbox'); await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').isVisible(), false); assert.equal(await page.locator('.gallery-photo').nth(1).locator('figcaption').innerText(), '穿过蓝色的回廊');
  });
  await check('多张本地图片仅作预览，删除后空状态，足迹不增加完成次数', async () => {
    await page.locator('#photo-files').setInputFiles([path.join(directory, 'assets', 'shot-1.jpg'), path.join(directory, 'assets', 'shot-2.jpg')]); await page.waitForFunction(() => document.querySelectorAll('.gallery-photo').length === 6);
    const count = await page.locator('#count-value').innerText(); await page.locator('#add-footprint').click(); await page.getByRole('textbox', { name: '足迹内容', exact: true }).fill('这是普通体验记录'); await page.locator('#save-footprint').click(); assert.equal(await page.locator('#count-value').innerText(), count);
    await button('查看截图 1').click(); for (let n = 0; n < 6; n++) await page.locator('#remove-photo').click(); assert.equal(await page.getByRole('dialog').isVisible(), false); assert.equal(await page.locator('.gallery-empty').isVisible(), true); await shot('04-empty-gallery');
    await page.reload(); await page.evaluate(() => document.fonts.ready);
  });
  await check('880与390窄窗边界、图片比例、相册与大图可达', async () => {
    await layout(880, 1000); await shot('05-medium'); await layout(390, 844); await shot('06-narrow');
    await page.locator('.gallery-card').scrollIntoViewIfNeeded(); await shot('07-narrow-gallery'); await button('查看截图 1').click(); await shot('08-narrow-lightbox'); await page.keyboard.press('Escape');
    await button('关闭详情预览').click(); await button('重新打开').click(); assert.equal(await page.locator('.detail-window').isVisible(), true);
  });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.externalRequests, [], '平台标志与预览素材均无外网请求');
  assert.deepEqual(report.failedLocalRequests, [], '本地素材全部可达');
  for (const file of [...files, 'assets/platform-icons.js']) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex'), report.testedFiles[file], '被测文件运行中保持稳定：' + file);
  report.passed = true;
})().catch(error => { report.error = error.stack; process.exitCode = 1; console.error(error); }).finally(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, output })); });
