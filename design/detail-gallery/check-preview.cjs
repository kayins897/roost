// Design prototype only. No app process, repository or user-data directory is accessed.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const directory = path.resolve(process.argv[2]);
const output = path.join(directory, 'screenshots');
const report = { passed: false, appSourceChanged: false, persisted: false, checks: [], errors: [], layouts: [] };
let server, browser, page;
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
  server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://127.0.0.1').pathname;
    const file = path.resolve(directory, '.' + decodeURIComponent(name === '/' ? '/index.html' : name));
    if (!file.startsWith(directory + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf' })[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1060 } });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === base || route.request().url().startsWith('blob:') ? route.continue() : route.abort());
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
  await check('常驻资料与标签可编辑，一句话印象80字，测评默认折叠', async () => {
    await button('编辑').nth(0).click(); await page.locator('[data-input=creator]').fill('示例创作者'); await page.locator('#save-facts').click(); assert.equal(await page.locator('[data-field=creator]').innerText(), '示例创作者');
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
  assert.deepEqual(report.errors, []); report.passed = true;
})().catch(error => { report.error = error.stack; process.exitCode = 1; console.error(error); }).finally(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, output })); });
