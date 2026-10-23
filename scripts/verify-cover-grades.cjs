const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const output = path.join(root, 'evidence', `cover-grades-v${version.replaceAll('.', '')}`);
const visualOnly = process.argv.includes('--visual-only');
const finalSmoke = process.argv.includes('--final-smoke');
const previewOnly = process.argv.includes('--preview-only');
const states = ['want', 'playing', 'cleared', 'ongoing', 'paused', 'abandoned'];
const labels = ['待体验', '游玩中', '已通关', '持续游玩', '暂时搁置', '已放弃'];
const grades = ['SSS', 'SS', 'S', 'A', 'B', 'C'];
const finishes = { SSS: 'prismatic', SS: 'holographic', S: 'gold', A: 'silver', B: 'standard', C: 'standard' };
const artworks = ['hollow', 'spire', 'disco', 'outer', 'hades', 'dave'];
const legacyStatus = state => state === 'cleared' ? 'finished' : ['paused', 'abandoned'].includes(state) ? 'paused' : state === 'want' ? 'want' : 'active';
const work = (id, title, state, index, extra = {}) => ({ id, title, category: 'game', subcategory: 'Steam', platforms: ['Steam', '本地收藏'], creator: '栖域隔离图像测试', year: '2026', status: legacyStatus(state), gamePlayState: state,
  tags: ['保留标签'], gameTags: { gameplay: [], theme: [], scenario: [], other: ['保留标签'], futureGroup: ['保留扩展'] }, impression: '保留亲手写的测评，评级不影响这些内容。', favorite: false,
  playtimeMinutes: 73 + index * 91, externalIds: [{ provider: 'steam', id: String(9000 + index) }], experienceEntries: [{ id: `note-${id}`, date: '2026-10', kind: 'note', note: '真实日期样例' }],
  artwork: artworks[index % artworks.length], createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', futureItem: { keep: id }, ...extra });
const fixture = { schemaVersion: 1, futureRoot: { keep: ['未知根扩展'] }, items: [
  ...states.map((state, i) => work(`state-${state}`, `状态 · ${labels[i]}`, state, i)),
  ...grades.map((grade, i) => work(`grade-${grade}`, `评级 · ${grade}`, 'cleared', i + 6, { personalGrade: grade })),
  work('retained', '保留 · 进行中', 'playing', 12, { personalGrade: 'SSS' }),
  ...['SSS', 'SS', 'S', 'A'].map((grade, i) => work(`bright-${grade}`, `浅色封面 · ${grade}`, 'cleared', i + 13, { personalGrade: grade })),
] };
const report = { passed: false, version, scope: previewOnly ? 'preview-only' : finalSmoke ? 'final-copy-navigation-smoke' : visualOnly ? 'visual-only' : 'full', isolatedDataOnly: true, userLibraryAccessed: false, checks: [], screenshots: [], integrity: [], colors: [], reflections: [], brightPixels: [], scrollToTop: [], layouts: [], pageErrors: [], resourceErrors: [], notes: [
  '全新 Edge 上下文与本地 dist，仅使用设计目录原创 SVG 转 PNG 的合成收藏；不连接真实窗口或收藏。',
  'browser 使用真实浏览器 repository；bridge 使用真实 DesktopRepository 加隔离内存桥接，不能代替原生文件系统检查。',
  '评级 JSON 往返走界面导出与文件导入；图片原文及其他个人字段逐字段核对。',
  'v0.4.20 恢复初版大部分箔面可见度，去掉网点、网格与局部遮罩，保留柔和对角方向；白区像素变化仍仅作诊断，另以截图目视检查原封面可读性。',
] };
if (visualOnly) report.notes.push('本次只验收最终视觉、回顶部交互与收藏原文保护；评级保存/失败/JSON往返的10组交互保留在 validation-intermediate.json，不计入本报告场景数。');
if (finalSmoke) report.notes.push('同版最后补验：只刷新深浅宽窄原始封面文案、回顶部hover对比与指针点击；不重复 validation.json 中已通过的23组视觉及回顶部验收。');
const sha = value => createHash('sha256').update(value).digest('hex');
report.distAssets = [...fs.readFileSync(path.join(dist, 'index.html'), 'utf8').matchAll(/(?:src|href)="((?:\.\/|\/)?assets\/[^\"]+\.(?:js|css))"/g)].map(match => ({ path: match[1], sha256: sha(fs.readFileSync(path.join(dist, match[1]))) }));
let browser, server, base, page, context, mode, stage, baseline;
fs.mkdirSync(output, { recursive: true });
async function serve() {
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
  server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://127.0.0.1').pathname;
    if (name === '/__fixture-init') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>Isolated cover fixture</title>'); return; }
    if (name === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    let file; try { file = path.resolve(dist, '.' + decodeURIComponent(name === '/' ? '/index.html' : name)); } catch { res.writeHead(400); res.end(); return; }
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)); });
}
async function check(name, run) { stage = `${mode}: ${name}`; await run(); report.checks.push(stage); console.log(`PASS ${stage}`); }
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const card = title => button(`查看${title}详情`);
const dialog = title => page.getByRole('dialog', { name: `${title}详情`, exact: true });
const raw = () => page.evaluate(key => localStorage.getItem(key), mode === 'bridge' ? 'qiyu.test.grades.library' : 'qiyu.library.v1');
const data = async () => JSON.parse(await raw());
const byId = (value, id) => value.items.find(item => item.id === id);
async function query(text) { await page.getByRole('textbox', { name: '搜索收藏', exact: true }).fill(text); }
async function closeDetail(title) { await button('关闭详情', dialog(title)).click(); await dialog(title).waitFor({ state: 'hidden' }); }
async function capture(name) { await page.evaluate(() => document.fonts.ready); const file = `${mode}-${name}.png`; await page.screenshot({ path: path.join(output, file), animations: 'disabled', caret: 'hide' }); report.screenshots.push(file); }
async function unchanged(name, before) { const after = await raw(); report.integrity.push({ mode, name, same: before === after, beforeSha256: sha(before), afterSha256: sha(after) }); assert.equal(after, before, name); }
function preserved(before, after, id, mutable = ['personalGrade', 'updatedAt']) {
  assert.deepEqual(after.futureRoot, before.futureRoot); assert.equal(after.items.length, before.items.length);
  for (const original of before.items) { const updated = byId(after, original.id); assert.ok(updated); for (const field of Object.keys(original)) if (original.id !== id || !mutable.includes(field)) assert.deepEqual(updated[field], original[field], `${original.id}.${field} 应保留`); }
}
async function prepare(currentMode, theme = 'dark', width = 1440, extra = {}) {
  mode = currentMode;
  context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme, reducedMotion: 'reduce', ...extra });
  await context.addInitScript(({ currentMode, version }) => {
    window.__gradeFail = false; window.__gradeSaves = 0; const key = currentMode === 'bridge' ? 'qiyu.test.grades.library' : 'qiyu.library.v1'; const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) { if (name === 'qiyu.library.v1' && !location.pathname.includes('__fixture-init')) { window.__gradeSaves++; if (window.__gradeFail) throw new DOMException('隔离评级保存失败', 'QuotaExceededError'); } return original.call(this, name, value); };
    if (currentMode === 'bridge') { let revision = 'fixture-0', saves = 0; window.qiyuDesktop = { getInfo: () => ({ version, dataDirectory: 'ISOLATED_NO_REAL_FILES', windowVisible: true }), loadLibrary: () => ({ ok: true, value: { snapshot: JSON.parse(localStorage.getItem(key)), revision } }), saveLibrary: (value, expected) => { window.__gradeSaves++; if (window.__gradeFail) return { ok: false, error: '隔离评级保存失败' }; if (expected !== revision) return { ok: false, error: '隔离修订冲突' }; original.call(localStorage, key, JSON.stringify(value)); revision = `fixture-${++saves}`; return { ok: true, value: { revision } }; }, onWindowVisibility: () => () => {}, openDataDirectory: () => {} }; }
  }, { currentMode, version });
  page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.pageErrors.push({ mode, message: error.message }));
  page.on('response', response => { if (response.status() >= 400) report.resourceErrors.push({ mode, url: response.url(), status: response.status() }); });
  page.on('dialog', browserDialog => browserDialog.accept());
  await page.route('**/*', route => route.request().url().startsWith(base) || route.request().url().startsWith('data:') ? route.continue() : route.abort('blockedbyclient'));
  await page.goto(`${base}/__fixture-init`);
  const svgs = Object.fromEntries(artworks.map(name => [name, fs.readFileSync(path.join(root, '../design/2026-10-22-concepts/assets', `cover-${name}.svg`), 'utf8')]));
  baseline = await page.evaluate(async ({ fixture, svgs, theme, currentMode }) => {
    const covers = {}; for (const [name, svg] of Object.entries(svgs)) { const image = new Image(); await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); }); const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 360; canvas.getContext('2d').drawImage(image, 0, 0, 240, 360); covers[name] = canvas.toDataURL('image/png'); }
    for (const item of fixture.items) {
      item.coverUrl = covers[item.artwork];
      if (item.id.startsWith('bright-')) { const image = new Image(); await new Promise(resolve => { image.onload = resolve; image.src = item.coverUrl; }); const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 360; const paint = canvas.getContext('2d'); paint.fillStyle = '#faf8f1'; paint.fillRect(0, 0, 240, 360); paint.drawImage(image, 52.5, 78.75, 135, 202.5); item.coverUrl = canvas.toDataURL('image/png'); }
    }
    const text = JSON.stringify(fixture); localStorage.setItem(currentMode === 'bridge' ? 'qiyu.test.grades.library' : 'qiyu.library.v1', text); localStorage.setItem('qiyu.appearance.v1', JSON.stringify({ mode: theme })); localStorage.setItem('qiyu.background.v1', JSON.stringify({ enabled: false, hue: 0, strength: 60 })); return text;
  }, { fixture, svgs, theme, currentMode });
  report.fixture = { items: fixture.items.length, pngWidth: 240, pngHeight: 360, rawBytes: Buffer.byteLength(baseline), brightCoverWhiteArea: '68.36%' };
  await page.goto(base, { waitUntil: 'networkidle' }); await button('全部游戏', page.locator('.library-views')).click(); await page.evaluate(() => document.fonts.ready);
  await page.locator('.poster-image').first().evaluate(image => image.decode()); assert.equal(await raw(), baseline);
}
async function interactive(currentMode) {
  await prepare(currentMode);
  await check('旧记录与全部评级仅读不写，非通关已有评级禁改且无特殊箔面', async () => {
    assert.equal(await page.evaluate(() => window.__gradeSaves), 0); assert.equal(await card('保留 · 进行中').locator('.card-cover').getAttribute('data-finish'), 'standard');
    await card('保留 · 进行中').click(); const select = dialog('保留 · 进行中').getByRole('combobox', { name: '我的评级', exact: true }); assert.equal(await select.inputValue(), 'SSS'); assert.equal(await select.isDisabled(), true); assert.equal(await button('清除个人评级', dialog('保留 · 进行中')).count(), 0); await closeDetail('保留 · 进行中');
    await card('状态 · 待体验').click(); assert.equal(await dialog('状态 · 待体验').getByRole('combobox', { name: '我的评级', exact: true }).count(), 0); await closeDetail('状态 · 待体验'); await unchanged('未通关浏览不推测评级', baseline);
  });
  await check('通关作品六档评级自动保存与清除，只有评级和修改时间改变', async () => {
    const title = '状态 · 已通关'; await card(title).click(); const select = dialog(title).getByRole('combobox', { name: '我的评级', exact: true }); assert.equal(await select.inputValue(), '');
    for (const grade of grades) { const before = await data(); await select.selectOption(grade); const after = await data(); assert.equal(byId(after, 'state-cleared').personalGrade, grade); preserved(before, after, 'state-cleared'); assert.equal(await select.inputValue(), grade); }
    const before = await data(); await button('清除个人评级', dialog(title)).click(); const after = await data(); assert.equal(byId(after, 'state-cleared').personalGrade, undefined); assert.equal(Object.hasOwn(byId(after, 'state-cleared'), 'personalGrade'), false); preserved(before, after, 'state-cleared'); await closeDetail(title); assert.equal(await card(title).locator('.card-cover').getAttribute('data-finish'), 'standard');
  });
  await check('评级保存失败保留旧值和原文，取消故障后可重试', async () => {
    const title = '评级 · S'; await card(title).click(); const select = dialog(title).getByRole('combobox', { name: '我的评级', exact: true }); const before = await raw(); await page.evaluate(() => { window.__gradeFail = true; }); await select.selectOption('SSS'); await dialog(title).getByRole('alert').waitFor(); assert.equal(await select.inputValue(), 'S'); await unchanged('评级保存失败原文不变', before); await capture('grade-save-failure');
    await page.evaluate(() => { window.__gradeFail = false; }); await select.selectOption('SSS'); assert.equal(byId(await data(), 'grade-S').personalGrade, 'SSS'); await select.selectOption('S'); await closeDetail(title);
  });
  await check('改变游玩状态保留原评级，离开通关只撤销箔面，回通关恢复', async () => {
    const title = '评级 · SSS', before = await data(); await card(title).click(); await button('游玩中', dialog(title)).click(); const select = dialog(title).getByRole('combobox', { name: '我的评级', exact: true }); assert.equal(await select.isDisabled(), true); assert.equal(await select.inputValue(), 'SSS'); await closeDetail(title); assert.equal(await card(title).locator('.card-cover').getAttribute('data-finish'), 'standard'); preserved(before, await data(), 'grade-SSS', ['status', 'gamePlayState', 'updatedAt']);
    await card(title).click(); await button('已通关', dialog(title)).click(); assert.equal(await dialog(title).getByRole('combobox', { name: '我的评级', exact: true }).isEnabled(), true); await closeDetail(title); assert.equal(await card(title).locator('.card-cover').getAttribute('data-finish'), 'prismatic');
  });
  await check('重载及真实备份导出/导入往返保留评级、封面原文及未知字段', async () => {
    const before = await raw(); await page.reload({ waitUntil: 'networkidle' }); await unchanged('重载不写原文', before);
    const downloadPromise = page.waitForEvent('download'); await button('导出备份').click(); const download = await downloadPromise, stream = await download.createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(chunk); const buffer = Buffer.concat(chunks), exported = JSON.parse(buffer.toString('utf8')); const previous = JSON.parse(before); assert.deepEqual(exported.items, previous.items); assert.deepEqual(exported.futureRoot, previous.futureRoot); assert.ok(exported.exportedAt);
    await button('数据与设置').click(); const settings = page.getByRole('dialog', { name: '数据与设置', exact: true }), chooserPromise = page.waitForEvent('filechooser'); await button('导入', settings).click(); const chooser = await chooserPromise; await chooser.setFiles({ name: 'isolated-grades.json', mimeType: 'application/json', buffer }); await settings.waitFor({ state: 'hidden' }); assert.deepEqual(await data(), exported); assert.equal(byId(await data(), 'grade-SSS').personalGrade, 'SSS'); report.integrity.push({ mode, name: '实际 JSON 备份往返', sameItems: true, beforeItemsSha256: sha(JSON.stringify(previous.items)), afterItemsSha256: sha(JSON.stringify((await data()).items)) });
  });
  await context.close(); context = null;
}
async function geometry(target) {
  return target.evaluate(element => {
    const cover = element.querySelector('.card-cover'), image = element.querySelector('.poster-image'), foil = element.querySelector('.cover-foil'), state = element.querySelector('.card-game-state'), shine = element.querySelector('.card-cover-shine');
    const rect = selector => { const bounds = element.querySelector(selector).getBoundingClientRect(); return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }; };
    const style = getComputedStyle(cover), f = foil && getComputedStyle(foil); const probe = document.createElement('span'); probe.style.color = `var(--game-${element.dataset.gameState})`; document.body.append(probe); const expected = getComputedStyle(probe).color; probe.remove();
    return { state: element.dataset.gameState, finish: cover.dataset.finish, border: style.borderTopColor, borderWidth: style.borderTopWidth, boxShadow: style.boxShadow, expected, text: getComputedStyle(state).color, icon: getComputedStyle(state.querySelector('svg')).color, depth: cover.dataset.depth ?? null, rx: cover.style.getPropertyValue('--cover-rx'), ry: cover.style.getPropertyValue('--cover-ry'), angle: cover.style.getPropertyValue('--cover-angle'), coverProperties: Object.fromEntries([...cover.style].filter(name => name.startsWith('--cover-')).map(name => [name, cover.style.getPropertyValue(name)])), transform: style.transform, image: getComputedStyle(image).transform, title: rect('.card-name'), time: rect('.card-playtime'), shine: shine && { display: getComputedStyle(shine).display, opacity: getComputedStyle(shine).opacity, image: getComputedStyle(shine).backgroundImage }, foil: f && { opacity: f.opacity, display: f.display, mixBlendMode: f.mixBlendMode, image: f.backgroundImage, size: f.backgroundSize, position: f.backgroundPosition, maskImage: f.maskImage, maskPosition: f.maskPosition, before: getComputedStyle(foil, '::before').backgroundImage, after: getComputedStyle(foil, '::after').backgroundImage } };
  });
}
function colorConsistency(value) { for (const field of ['border', 'text', 'icon']) assert.equal(value[field], value.expected, `${value.state} 的 ${field} 与语义色不一致`); assert.equal(value.borderWidth, '2px', '边框只应轻度增强，不增加实线宽度'); }
function softReflection(value) {
  assert.ok(Math.abs(parseFloat(value.angle) - 45) <= 6.1, '主光 CSS 法线应为 45±6°，光带沿左上到右下');
  const lightX = parseFloat(value.coverProperties['--cover-light-x']), lightY = parseFloat(value.coverProperties['--cover-light-y']);
  assert.ok(lightX >= 55.9 && lightX <= 68.1 && lightY >= 32.9 && lightY <= 43.1, '亮带中心应克制地停留在右上区域');
  const shineAngle = Number(value.shine.image.match(/linear-gradient\(([-.\d]+)deg/)?.[1]); assert.ok(Math.abs(shineAngle - 45) <= 6.1, '主高光与箔面应使用同一对角方向');
  for (const image of [value.foil.image, value.foil.before, value.foil.after, value.foil.maskImage, value.shine.image]) assert.ok(!/repeating-|conic-gradient/.test(image), '不应残留点阵、棋盘、环线或重复纹理');
  assert.equal(value.foil.before, 'none', '箔面伪元素不应残留网点/网格'); assert.equal(value.foil.after, 'none', '箔面伪元素不应残留星芒/点阵');
  assert.ok((value.foil.maskImage.match(/gradient\(/g) ?? []).length <= 1, '材质只使用单层柔和遮罩');
}
async function point(target, x, y) {
  await target.scrollIntoViewIfNeeded(); const bounds = await target.boundingBox(), cover = await target.locator('.card-cover').boundingBox(); await page.mouse.move(bounds.x + cover.width * x, bounds.y + cover.height * y, { steps: 14 }); await page.waitForTimeout(320); return geometry(target);
}
async function whitePixels(target) {
  const cover = target.locator('.card-cover');
  const styles = await cover.evaluate(element => { const image = element.querySelector('.poster-image'); const original = [element.getAttribute('style'), image.getAttribute('style')]; element.style.setProperty('transform', 'none', 'important'); element.style.setProperty('transition', 'none', 'important'); image.style.setProperty('transform', 'none', 'important'); image.style.setProperty('transition', 'none', 'important'); return original; });
  const png = await cover.screenshot({ animations: 'disabled' });
  await cover.evaluate((element, original) => { [element, element.querySelector('.poster-image')].forEach((node, i) => original[i] === null ? node.removeAttribute('style') : node.setAttribute('style', original[i])); }, styles);
  return page.evaluate(async base64 => { const image = new Image(); await new Promise(resolve => { image.onload = resolve; image.src = 'data:image/png;base64,' + base64; }); const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const paint = canvas.getContext('2d'); paint.drawImage(image, 0, 0); const value = paint.getImageData(0, 0, canvas.width, canvas.height).data, pixels = []; for (const [left, top, right, bottom] of [[.1, .2, .17, .8], [.83, .2, .9, .8], [.24, .1, .7, .16], [.24, .84, .7, .9]]) for (let y = Math.ceil(top * canvas.height); y < bottom * canvas.height; y++) for (let x = Math.ceil(left * canvas.width); x < right * canvas.width; x++) { const i = (y * canvas.width + x) * 4; pixels.push([value[i], value[i + 1], value[i + 2]]); } return pixels; }, png.toString('base64'));
}
async function layout(name) { const value = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, dialogs: [...document.querySelectorAll('[role="dialog"]')].map(el => ({ width: el.clientWidth, scroll: el.scrollWidth })) })); report.layouts.push({ mode, name, ...value }); assert.ok(value.scroll <= value.width + 1); value.dialogs.forEach(dialog => assert.ok(dialog.scroll <= dialog.width + 1)); }
async function visual(theme, width) {
  await prepare('browser', theme, width); mode = `${theme}-${width}`;
  await check('六状态边框文字图标在静止/hover同色且互相区分', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' }); const colors = [];
    for (let i = 0; i < states.length; i++) { const title = `状态 · ${labels[i]}`; await query(title); const target = card(title); await page.mouse.move(5, 5); const rest = await geometry(target); colorConsistency(rest); const hover = await point(target, .78, .25); colorConsistency(hover); assert.equal(hover.border, rest.border); assert.equal(hover.finish, 'standard'); assert.ok(!hover.shine || hover.shine.display === 'none' || Number(hover.shine.opacity) === 0 || hover.shine.image === 'none', '普通封面不能残留 hover 反光'); assert.equal(hover.foil, null); assert.equal(hover.depth, 'active', '普通封面保留轻微倾斜'); colors.push(rest.expected); report.colors.push({ mode, rest, hover }); }
    assert.equal(new Set(colors).size, 6); await query(''); await page.mouse.move(5, 5); await page.locator('.main-scroll').evaluate(el => { el.scrollTop = 0; }); await layout('library'); await capture('six-state-borders');
  });
  await check('通关评级材质映射正确，四种箔面随角度反射而文字和时长固定', async () => {
    for (const grade of grades) { const title = `评级 · ${grade}`; await query(title); const target = card(title); assert.equal(await target.locator('.card-cover').getAttribute('data-finish'), finishes[grade]);
      if (['B', 'C'].includes(grade)) { assert.equal(await target.locator('.cover-foil').count(), 0); continue; }
      await target.scrollIntoViewIfNeeded(); await page.mouse.move(5, 5); await page.waitForTimeout(300); const rest = await geometry(target); assert.equal(Number(rest.foil.opacity), 0); assert.equal(Number(rest.shine.opacity), 0); const left = await point(target, .1, .1), right = await point(target, .9, .85); assert.equal(left.depth, 'active'); assert.equal(right.depth, 'active'); assert.notEqual(left.transform, right.transform); assert.notEqual(left.image, right.image); assert.notDeepEqual([left.foil.image, left.foil.position, left.foil.maskImage, left.foil.maskPosition, left.shine.image], [right.foil.image, right.foil.position, right.foil.maskImage, right.foil.maskPosition, right.shine.image]); assert.notEqual(left.angle, right.angle); assert.ok(Number(right.foil.opacity) >= .3 && Number(right.foil.opacity) < .52, '箔面应保留初版大部分可见度，并略低于初版0.52'); softReflection(left); softReflection(right); colorConsistency(right);
      assert.deepEqual(left.title, rest.title); assert.deepEqual(right.title, rest.title); assert.deepEqual(right.time, rest.time); await capture(`foil-${finishes[grade]}`); await page.mouse.move(5, 5); await page.waitForTimeout(300); const reset = await geometry(target); assert.equal(reset.depth, null); assert.equal(reset.rx, ''); assert.equal(Number(reset.foil.opacity), 0); assert.equal(Number(reset.shine.opacity), 0); report.reflections.push({ mode, grade, rest, left, right, reset });
    }
    await query('评级 · SSS'); await card('评级 · SSS').click(); const panel = dialog('评级 · SSS'); assert.equal(await panel.getByRole('combobox', { name: '我的评级', exact: true }).inputValue(), 'SSS'); await layout('rating-detail'); await capture('rating-detail'); await closeDetail('评级 · SSS');
  });
  await check('批量状态六个未选图标沿用各自状态色，取消保持原文', async () => {
    await button('批量编辑游戏').click(); await button('选择评级 · SSS').click(); await button('改状态', page.locator('.selection-actionbar')).click(); const panel = page.getByRole('dialog', { name: '更改状态', exact: true });
    const colors = await panel.locator('.game-state-options [data-game-state]').evaluateAll(options => options.map(option => { const probe = document.createElement('span'); probe.style.color = `var(--game-${option.dataset.gameState})`; document.body.append(probe); const value = { state: option.dataset.gameState, selected: option.getAttribute('aria-pressed'), color: getComputedStyle(option.querySelector('svg')).color, expected: getComputedStyle(probe).color }; probe.remove(); return value; }));
    assert.equal(colors.length, 6); for (const value of colors) { assert.equal(value.selected, 'false'); assert.equal(value.color, value.expected, value.state); } await capture('batch-state-colors'); await button('取消', panel).click(); await button('退出多选').click();
  });
  if (width === 1440) await check('大面积浅色几何封面保留原图并展示四种材质供目视检查', async () => {
    for (const grade of ['SSS', 'SS', 'S', 'A']) { const title = `浅色封面 · ${grade}`; await query(title); const target = card(title); await target.scrollIntoViewIfNeeded(); await page.mouse.move(5, 5); await page.waitForTimeout(300); await capture(`bright-${finishes[grade]}-rest`); const rest = await whitePixels(target); const value = await point(target, .88, .2); assert.ok(Number(value.foil.opacity) >= .3 && Number(value.foil.opacity) < .52); await capture(`bright-${finishes[grade]}-hover`); const hover = await whitePixels(target); assert.equal(hover.length, rest.length); const differences = hover.map((pixel, i) => Math.max(...pixel.map((channel, j) => Math.abs(channel - rest[i][j])))); const changedRatio = differences.filter(difference => difference > 5).length / differences.length; report.brightPixels.push({ mode, grade, finish: finishes[grade], pixels: differences.length, changedRatio, meanMaxChannelDifference: differences.reduce((sum, value) => sum + value, 0) / differences.length, originalImageBytesUnchanged: true, diagnosticOnly: true }); }
    await query('评级 · SSS');
  });
  await check('减少动态及多选模式停止倾斜和箔面，视觉浏览不改收藏', async () => {
    const title = '评级 · SSS', target = card(title); await page.emulateMedia({ reducedMotion: 'reduce' }); const reduced = await point(target, .8, .2); assert.equal(reduced.depth, null); assert.equal(reduced.transform, 'none'); assert.equal(reduced.image, 'none'); assert.equal(reduced.foil.display, 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' }); const active = await point(target, .8, .2); assert.equal(active.depth, 'active'); await button('批量编辑游戏').focus(); await page.keyboard.press('Enter'); const selecting = button(`选择${title}`); await point(selecting, .8, .2); const selection = await geometry(selecting); assert.equal(selection.transform, 'none'); assert.ok(selection.foil.display === 'none' || Number(selection.foil.opacity) === 0); await button('退出多选').click(); mode = 'browser'; await unchanged(`${theme}-${width} 视觉与选择不写收藏`, baseline); mode = `${theme}-${width}`;
  });
  await check('Dock下方独立回顶部按钮响应滚动，普通与减少动态均可用且不写库', async () => {
    await query(''); const scroller = page.locator('.main-scroll'), topButton = button('回到顶部');
    for (const motion of ['no-preference', 'reduce']) {
      await page.emulateMedia({ reducedMotion: motion }); await scroller.evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' })); await page.waitForTimeout(100); assert.equal(await topButton.isVisible(), false, '顶部不应显示返回按钮');
      await scroller.evaluate(element => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' })); await page.waitForTimeout(160); if (width === 390) await button('打开菜单').click(); await topButton.waitFor({ state: 'visible' }); await topButton.click({ trial: true });
      const position = await topButton.evaluate(element => { const rect = element.getBoundingClientRect(), dock = document.querySelector('.sidebar-dock').getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, dockBottom: dock.bottom, separate: !element.closest('.sidebar-dock'), radius: getComputedStyle(element).borderRadius, viewport: { width: innerWidth, height: innerHeight } }; });
      assert.equal(position.separate, true); assert.ok(position.y >= position.dockBottom, '回顶部按钮应独立位于 Dock 下方'); assert.ok(Math.abs(position.width - position.height) < 1, '回顶部按钮应为圆形'); assert.ok(position.x >= 0 && position.y + position.height <= position.viewport.height); if (motion === 'no-preference') await capture('dock-scroll-to-top');
      await topButton.focus(); await page.keyboard.press('Enter'); if (motion === 'reduce') { await page.waitForTimeout(40); assert.ok(await scroller.evaluate(element => element.scrollTop) <= 1, '减少动态应直接回到顶部'); } else { const end = Date.now() + 3000; while (await scroller.evaluate(element => element.scrollTop) > 1 && Date.now() < end) await page.waitForTimeout(30); assert.ok(await scroller.evaluate(element => element.scrollTop) <= 1); }
      assert.equal(await topButton.isVisible(), false); if (width === 390 && await button('关闭菜单').isVisible()) await button('关闭菜单').click(); report.scrollToTop.push({ mode, motion, ...position, returnedToTop: true });
    }
    await layout('after-scroll-to-top'); mode = 'browser'; await unchanged(`${theme}-${width} 回顶部不写收藏`, baseline); mode = `${theme}-${width}`;
  });
  await context.close(); context = null;
}
async function touch() {
  await prepare('browser', 'dark', 390, { hasTouch: true, isMobile: true }); mode = 'touch-390';
  await check('触摸设备不启用透视和箔面跟踪', async () => { await query('评级 · SSS'); await page.emulateMedia({ reducedMotion: 'no-preference' }); const target = card('评级 · SSS'); await target.locator('.card-cover').dispatchEvent('pointermove', { pointerType: 'touch', clientX: 140, clientY: 250 }); const value = await geometry(target); assert.equal(value.depth, null); assert.equal(value.transform, 'none'); assert.equal(value.foil.display, 'none'); await capture('static-touch'); mode = 'browser'; await unchanged('触摸浏览不写库', baseline); mode = 'touch-390'; });
  await context.close(); context = null;
}
async function video() {
  await prepare('browser', 'dark', 1440, { reducedMotion: 'no-preference', recordVideo: { dir: path.join(output, 'recordings'), size: { width: 1440, height: 1000 } } }); mode = 'preview'; await query('评级 ·'); await page.mouse.move(5, 5); await page.waitForTimeout(350);
  const video = page.video(), started = Date.now(); for (const grade of ['SSS', 'SS', 'S', 'A']) { await point(card(`评级 · ${grade}`), .14, .16); await point(card(`评级 · ${grade}`), .88, .83); await page.waitForTimeout(500); } await page.waitForTimeout(Math.max(0, 7000 - (Date.now() - started))); mode = 'browser'; await unchanged('材质视频不写库', baseline); mode = 'preview';
  await context.close(); context = null; const source = await video.path(), target = path.join(output, 'cover-materials.webm'); const cache = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ms-playwright'); const folder = cache && fs.existsSync(cache) && fs.readdirSync(cache).filter(name => name.startsWith('ffmpeg-')).find(name => fs.existsSync(path.join(cache, name, 'ffmpeg-win64.exe')));
  let trimmed = false; if (folder) { const result = spawnSync(path.join(cache, folder, 'ffmpeg-win64.exe'), ['-hide_banner', '-loglevel', 'error', '-sseof', '-7', '-i', source, '-t', '7', '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-y', target], { encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr); trimmed = true; } else fs.copyFileSync(source, target);
  report.video = { path: path.relative(root, target), bytes: fs.statSync(target).size, trimmed, durationSeconds: trimmed ? 7 : undefined, isolatedDataOnly: true };
}
async function finalSupplement(theme, width) {
  await prepare('browser', theme, width); mode = `final-${theme}-${width}`;
  await check('详情原始封面文案和宽窄布局正确，浏览不写库', async () => {
    await card('评级 · B').click(); const panel = dialog('评级 · B'); await panel.getByRole('combobox', { name: '我的评级', exact: true }).scrollIntoViewIfNeeded();
    assert.equal((await panel.locator('.rating-finish').innerText()).trim(), '原始封面'); assert.ok((await panel.locator('.game-rating').innerText()).includes('B／C 原始封面')); assert.equal((await panel.innerText()).includes('普通反光'), false); await layout('final-detail-copy'); await capture('original-cover-copy'); await closeDetail('评级 · B'); mode = 'browser'; await unchanged('最终文案浏览不写库', baseline); mode = `final-${theme}-${width}`;
  });
  await check('回顶部hover图标沿用强调色且可点击，返回后恢复搜索焦点', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' }); const scroller = page.locator('.main-scroll'), topButton = button('回到顶部'); await scroller.evaluate(element => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' })); if (width === 390) await button('打开菜单').click(); await topButton.click({ trial: true }); await topButton.hover(); await page.waitForTimeout(200);
    const appearance = await topButton.evaluate(element => { const probe = document.createElement('span'); probe.style.color = 'var(--accent)'; document.body.append(probe); const style = getComputedStyle(element), icon = getComputedStyle(element.querySelector('svg')); const value = { color: style.color, icon: icon.color, expected: getComputedStyle(probe).color, background: style.backgroundColor }; probe.remove(); return value; }); assert.equal(appearance.color, appearance.expected); assert.equal(appearance.icon, appearance.expected); await capture('dock-top-hover');
    await topButton.click(); const end = Date.now() + 3000; while (await scroller.evaluate(element => element.scrollTop) > 1 && Date.now() < end) await page.waitForTimeout(30); assert.ok(await scroller.evaluate(element => element.scrollTop) <= 1); assert.equal(await topButton.isVisible(), false); assert.equal(await page.getByRole('textbox', { name: '搜索收藏', exact: true }).evaluate(element => document.activeElement === element), true); if (width === 390) assert.equal(await button('打开菜单').getAttribute('aria-expanded'), 'false'); report.scrollToTop.push({ mode, ...appearance, pointerClickReturnedToTop: true }); mode = 'browser'; await unchanged('最终hover与点击不写库', baseline); mode = `final-${theme}-${width}`;
  });
  await context.close(); context = null;
}
(async () => {
  try { base = await serve(); browser = await chromium.launch({ channel: 'msedge', headless: true }); if (previewOnly) await video(); else if (finalSmoke) { for (const theme of ['dark']) for (const width of [1440, 390]) await finalSupplement(theme, width); } else { if (!visualOnly) for (const currentMode of ['browser', 'bridge']) await interactive(currentMode); for (const theme of ['dark']) for (const width of [1440, 390]) await visual(theme, width); await touch(); await video(); } assert.equal(report.pageErrors.length, 0); assert.equal(report.resourceErrors.length, 0); report.passed = true; }
  catch (error) { report.failure = `${stage}\n${error.stack}`; process.exitCode = 1; if (page && !page.isClosed()) try { await capture('failure'); } catch {} }
  finally { if (context) await context.close(); if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); report.timestamp = new Date().toISOString(); fs.writeFileSync(path.join(output, previewOnly ? 'validation-preview.json' : finalSmoke ? 'validation-final-smoke.json' : 'validation.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, version, scope: report.scope, checks: report.checks.length, screenshots: report.screenshots.length, integrity: report.integrity.length, reflectionCases: report.reflections.length, failure: report.failure, pageErrors: report.pageErrors, resourceErrors: report.resourceErrors, video: report.video })); }
})();
