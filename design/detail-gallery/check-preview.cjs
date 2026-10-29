// Design prototype only. No app process, repository or user-data directory is accessed.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const directory = path.resolve(process.argv[2]);
const output = path.join(directory, 'screenshots');
const files = ['index.html', 'preview.css', 'preview.js', 'card-menu.js', 'layout.js', 'platforms.js', 'card-content.js'];
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
async function openCard(id) {
  if (await page.locator('#card-context-menu').isVisible()) await page.locator('#context-close').click();
  const card = page.locator('.widget[data-widget="' + id + '"]');
  await card.scrollIntoViewIfNeeded(); await card.click({ button: 'right', position: { x: 12, y: 32 } });
  assert.equal(await page.locator('#card-context-menu').getAttribute('data-widget'), id);
  assert.equal(await page.locator('#card-context-menu').getAttribute('data-page'), 'content');
}
async function saveCard(id) { await page.locator('[data-content-save="' + id + '"]').click(); }
async function reload() { await page.setViewportSize({ width: 1440, height: 1060 }); await page.reload(); await page.evaluate(() => document.fonts.ready); }
async function addNote(title) {
  await openCard('footprint'); await page.locator('.context-note-editor summary').click();
  await page.locator('#context-note-title').fill(title); await page.locator('#context-note-text').fill('普通合成体验日志');
  await page.locator('#context-note-save').click();
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
  await check('完整封面、独立数字评分与默认单图相册', async () => {
    await page.waitForFunction(() => [...document.querySelectorAll('.cover-card img,.gallery-photo img')].every(img => img.complete && img.naturalWidth));
    assert.equal(await page.locator('.facts-card').isVisible(), true);
    assert.equal(await page.locator('#grade-value').innerText(), '9.0');
    assert.equal(await page.locator('.gallery-photo').count(), 1);
    assert.equal((await page.locator('#photo-count').innerText()).trim(), '4 张');
    assert.equal(await page.locator('.gallery-card').getAttribute('data-gallery-mode'), 'single');
    await layout(1440, 1060); await shot('01-desktop');
    await page.locator('.detail-window').evaluate(n => { n.dataset.originalHeight = n.style.maxHeight; n.style.maxHeight = 'none'; });
    await page.locator('.detail-window').screenshot({ path: path.join(output, '02-full-layout.png') });
    await page.locator('.detail-window').evaluate(n => { n.style.maxHeight = n.dataset.originalHeight; n.scrollTop = 0; });
    await openCard('grade'); await shot('11-card-menu');
    await page.locator('#context-appearance').click(); await page.locator('#edit-layout').click(); await shot('09-layout-editor');
    await page.locator('#manage-widgets').click(); await page.locator('#widget-manager details').evaluate(n => n.open = true); await shot('10-card-controls');
    await page.locator('#layout-cancel').click();
  });
  await check('足迹卡管理分类，独立评分与时长未记录及0有区别', async () => {
    await openCard('footprint'); await page.locator('[data-context-state="收官完结"]').click();
    assert.equal(await page.locator('#priority-field').isVisible(), false);
    assert.equal(await page.locator('#context-priority-choices').count(), 0);
    await page.locator('[data-context-state="新游戏+"]').click();
    assert.equal(await page.locator('#priority-field').isVisible(), true);
    await openCard('grade'); await page.locator('#context-rating').fill('8.5'); await saveCard('grade');
    assert.equal(await page.locator('#grade-value').innerText(), '8.5');
    await openCard('hours'); await page.locator('#context-hours').fill('0'); await saveCard('hours');
    assert.equal(await page.locator('#hours-value').innerText(), '0h');
    await openCard('hours'); await page.locator('#context-hours').fill(''); await saveCard('hours');
    assert.equal(await page.locator('#hours-value').innerText(), '未记录');
    await reload();
  });
  await check('最后运行只来自明确记录，普通足迹不改统计或推断日期', async () => {
    const lastRun = page.locator('#last-run-value');
    assert.equal(await lastRun.getAttribute('datetime'), '2026-10-24T21:36');
    assert.equal(await lastRun.innerText(), '2026.10.24 21:36');
    await openCard('hours'); await page.locator('#context-hours').fill('0'); await page.locator('#context-last-run').fill(''); await saveCard('hours');
    assert.equal(await page.locator('#hours-value').innerText(), '0h');
    assert.equal(await lastRun.innerText(), '未记录'); assert.equal(await lastRun.getAttribute('datetime'), null);
    const count = await page.locator('#count-value').textContent();
    await addNote('合成足迹：2026年10月26日再次尝试');
    assert.equal(await lastRun.innerText(), '未记录'); assert.equal(await lastRun.getAttribute('datetime'), null);
    assert.equal(await page.locator('#count-value').textContent(), count);
    assert.equal(await page.locator('#hours-value').innerText(), '0h');
    await openCard('hours'); await page.locator('#context-last-run').fill('2026-10-20T10:15'); await saveCard('hours');
    assert.equal(await lastRun.getAttribute('datetime'), '2026-10-20T10:15'); assert.equal(await lastRun.innerText(), '2026.10.20 10:15');
    assert.equal(await page.locator('#hours-value').innerText(), '0h');
    await reload();
  });
  await check('拥有平台默认两项，八种不同SVG与对应名字即时切换', async () => {
    const badges = page.locator('#platform-list .platform-badge');
    assert.equal(await badges.count(), 2); await openCard('platform');
    const choices = page.locator('#platform-choices button[data-platform]');
    const selected = () => choices.evaluateAll(nodes => nodes.filter(n => n.getAttribute('aria-pressed') === 'true').map(n => n.dataset.platform));
    assert.deepEqual((await selected()).sort(), ['steam', 'switch']);
    const names = { steam: /Steam/i, playstation: /PlayStation/i, switch: /Switch/i, ea: /\bEA\b/i, battlenet: /Battle\.net/i, ubisoft: /Ubisoft/i, wegame: /WeGame/i, epic: /Epic/i };
    assert.deepEqual((await choices.evaluateAll(nodes => nodes.map(n => n.dataset.platform))).sort(), Object.keys(names).sort());
    for (const id of await selected()) await page.locator('#platform-choices [data-platform="' + id + '"]').click();
    assert.equal(await badges.count(), 0); assert.equal((await page.locator('#platform-list').innerText()).trim(), '未记录');
    for (const [id, name] of Object.entries(names)) {
      const choice = page.locator('#platform-choices [data-platform="' + id + '"]'); await choice.click();
      assert.equal(await choice.getAttribute('aria-pressed'), 'true'); assert.equal(await badges.count(), 1);
      assert.match(await badges.first().innerText(), name); const icon = badges.first().locator('svg');
      assert.equal(await icon.count(), 1); assert.equal(await icon.isVisible(), true);
      const signature = await platformIconSignature(icon); assert.ok(signature); platformIconSignatures.set(id, signature);
      await choice.click(); assert.equal(await badges.count(), 0);
    }
    assert.equal(new Set(platformIconSignatures.values()).size, 8);
    for (const id of Object.keys(names)) await page.locator('#platform-choices [data-platform="' + id + '"]').click();
    await page.locator('#done-platforms').click(); await layout(390, 844); await page.locator('.platform-card').scrollIntoViewIfNeeded();
    const surface = await page.locator('.platform-card').evaluate(n => ({ sw: n.scrollWidth, cw: n.clientWidth, sh: n.scrollHeight, ch: n.clientHeight }));
    assert.ok(surface.sw <= surface.cw + 1 && surface.sh <= surface.ch + 2, '八个平台半宽卡完整换行');
    await shot('14-platform-all-narrow'); await reload();
  });
  await check('PS5别名复用PlayStation标志，未知平台文字保留并去重', async () => {
    await openCard('platform');
    const add = async name => { await page.locator('#custom-platform').fill(name); await page.locator('#add-platform').click(); };
    await add('PS5'); const ps = page.locator('#platform-list .platform-badge[data-platform=playstation]');
    assert.equal(await ps.count(), 1); assert.equal(await platformIconSignature(ps.locator('svg')), platformIconSignatures.get('playstation'));
    const count = await page.locator('#platform-list .platform-badge').count(); await add('PS5');
    assert.equal(await page.locator('#platform-list .platform-badge').count(), count);
    const name = '主机小站（合成平台）'; await add(name); await add('  ' + name + '  ');
    const unknown = page.locator('#platform-list .platform-badge').filter({ hasText: name });
    assert.equal(await unknown.count(), 1); assert.equal(await unknown.locator('svg').count(), 0);
    await page.locator('#done-platforms').click(); assert.equal(await unknown.isVisible(), true);
    await shot('13-platform-custom'); await reload();
  });
  await check('资料标签通过右键编辑，印象限80字且测评默认折叠', async () => {
    await openCard('facts'); await page.locator('#context-fact-creator').fill('示例创作者'); await saveCard('facts');
    assert.equal(await page.locator('[data-field=creator]').innerText(), '示例创作者');
    await openCard('tags'); await page.locator('#context-tags-0').fill('动作、动作、探索'); await saveCard('tags');
    assert.equal(await page.locator('.tag-row').first().locator('.tag-pill').count(), 2);
    await openCard('impression'); await page.locator('#context-impression').fill('字'.repeat(90)); await saveCard('impression');
    assert.equal((await page.locator('#impression').inputValue()).length, 80);
    assert.equal(await page.locator('#impression').evaluate(n => n.readOnly), true);
    assert.equal(await page.locator('#review-body').isVisible(), false);
    await openCard('review'); await page.locator('#context-review').fill('合成长文测评'); await saveCard('review');
    await page.locator('#review-toggle').click(); assert.equal(await page.locator('#review-body textarea').inputValue(), '合成长文测评');
    assert.equal(await page.locator('#review-body textarea').evaluate(n => n.readOnly), true);
    await page.locator('#review-toggle').click(); await reload();
  });
  await check('单图入口仍可遍历全相册、编辑说明与Escape关闭', async () => {
    await button('查看截图 1').click(); assert.equal(await page.locator('#lightbox-position').innerText(), '1 / 4');
    await page.keyboard.press('ArrowRight'); assert.equal(await page.locator('#lightbox-position').innerText(), '2 / 4');
    await page.locator('#photo-caption').fill('穿过蓝色的回廊'); await page.locator('#close-lightbox').focus(); await shot('03-lightbox');
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog', { name: '截图大图预览' }).isVisible(), false);
    await button('查看截图 1').click(); await page.keyboard.press('ArrowRight'); assert.equal(await page.locator('#photo-caption').inputValue(), '穿过蓝色的回廊');
    await page.keyboard.press('Escape'); await reload();
  });
  await check('本地导入保留总照片数，移除全部照片后显示空态', async () => {
    await page.locator('#photo-files').setInputFiles([path.join(directory, 'assets', 'shot-1.jpg'), path.join(directory, 'assets', 'shot-2.jpg')]);
    await page.waitForFunction(() => parseInt(document.querySelector('#photo-count').textContent) === 6);
    assert.equal(await page.locator('.gallery-photo').count(), 1, '单图布局不等于总照片数');
    await page.locator('.gallery-photo').click(); for (let n = 0; n < 6; n++) await page.locator('#remove-photo').click();
    assert.equal(await page.getByRole('dialog', { name: '截图大图预览' }).isVisible(), false);
    assert.equal(await page.locator('.gallery-empty').isVisible(), true); await shot('04-empty-gallery'); await reload();
  });
  await check('880与390边界、相册与大图可达，详情关闭后可重开', async () => {
    await layout(880, 1000); await shot('05-medium'); await layout(390, 844); await shot('06-narrow');
    await page.locator('.gallery-card').scrollIntoViewIfNeeded(); await shot('07-narrow-gallery');
    await page.locator('.gallery-photo').click(); await shot('08-narrow-lightbox'); await page.keyboard.press('Escape');
    await button('关闭详情预览').click(); await button('重新打开').click(); assert.equal(await page.locator('.detail-window').isVisible(), true);
  });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.externalRequests, [], '平台标志与预览素材均无外网请求');
  assert.deepEqual(report.failedLocalRequests, [], '本地素材全部可达');
  for (const file of [...files, 'assets/platform-icons.js']) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex'), report.testedFiles[file], '被测文件运行中保持稳定：' + file);
  report.passed = true;
})().catch(error => { report.error = error.stack; process.exitCode = 1; console.error(error); }).finally(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, output })); });
