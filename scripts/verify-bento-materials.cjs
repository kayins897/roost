const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '..');
const executablePath = process.argv[2] || path.join(root, 'node_modules/electron/dist/electron.exe');
const packaged = Boolean(process.argv[2]);
const evidence = path.join(root, 'evidence', 'v' + require('../package.json').version.replaceAll('.', ''), packaged ? 'packaged' : 'source');
fs.mkdirSync(evidence, { recursive: true });
let data = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-bento-integration-'));
let app, page; const checks = [], errors = [];
const item = (id, score, more = {}) => ({ id, title: `星际档案 ${id}`, originalTitle: `Astral Archive ${id}`, category: 'game', subcategory: 'Steam', platforms: ['Steam', 'PS5'], creator: '合成测试工作室', year: '2025', status: 'finished', experienceStatus: 'experienced', experienceCategory: 'completed', personalGrade: 'A', ...(score === undefined ? {} : { personalScore: score }), tags: ['太空', '探索'], gameTags: { gameplay: ['探索'], theme: ['太空'], scenario: [], other: [] }, impression: '在星海中，留住每一次出发的勇气。', review: '完整保留的长文测评。\n这里是第二段。', favorite: false, artwork: 'default', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', completionCount: 0, ...more });
const initial = { schemaVersion: 1, items: [item('多彩', 9.4, { playtimeMinutes: 120, lastPlayedAt: '2026-10-26T12:30:21.123Z' }), item('镭射', 9.8), item('标准', 8.9), item('未评分', undefined), item('零分', 0, { playtimeMinutes: 0 }), item('新作', undefined, { status: 'want', experienceStatus: 'unplayed', experienceCategory: undefined, personalGrade: undefined, playPriority: 'SSS' })] };
const libraryFile = () => path.join(data, 'library.json');
const snapshot = () => JSON.parse(fs.readFileSync(libraryFile(), 'utf8'));
const check = (name, details) => { checks.push({ name, passed: true, ...(details ? { details } : {}) }); console.log(`PASS ${name}`); };
async function launch() {
  const env = { ...process.env, QIYU_E2E: '1', QIYU_TEST_DATA_DIR: data }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath, args: packaged ? [] : [root], env, timeout: 45000 });
  app.process().stderr?.on('data', chunk => fs.appendFileSync(path.join(evidence, 'electron-stderr.txt'), chunk));
  app.process().on('exit', (code, signal) => console.log(`Electron exit: code=${code}, signal=${signal}`));
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept().catch(() => {}));
  await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setMinimumSize(360, 500); w.setBounds({ width: 1440, height: 960 }); w.show(); });
}
async function all() {
  const group = page.getByRole('group', { name: '按体验分类筛选', exact: true });
  for (const name of ['新作开荒', '已体验']) { const button = group.getByRole('button', { name, exact: true }); if (await button.getAttribute('aria-pressed') !== 'true') await button.click(); }
}
const card = id => page.getByRole('button', { name: `查看星际档案 ${id}详情`, exact: true });
async function open(id = '多彩') { await all(); await card(id).click(); await page.locator('.game-bento-dialog').waitFor(); }
async function context(id) { const widget = page.locator(`[data-widget="${id}"]`); await widget.scrollIntoViewIfNeeded(); await widget.click({ button: 'right', position: { x: 20, y: 20 } }); const menu = page.locator('.bento-context-menu'); await menu.waitFor(); return menu; }
async function closeDetail() { await page.getByRole('button', { name: '关闭详情', exact: true }).click(); }
async function picture(name) { await page.screenshot({ path: path.join(evidence, name + '.png') }); }
async function nativeOpen(filename) { await app.evaluate(({ dialog }, files) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files }); }, Array.isArray(filename) ? filename : [filename]); }
async function settings() { await page.getByRole('button', { name: '数据与设置', exact: true }).click(); }
async function dataSettings() { await settings(); await page.getByRole('button', { name: '数据与备份', exact: true }).click(); }
async function waitSavedScore(value, id = '多彩') {
  const until = Date.now() + 5000;
  while (snapshot().items.find(item => item.id === id).personalScore !== value) {
    assert.ok(Date.now() < until, `Score ${value} did not reach the isolated repository: ${await page.locator('.toast').allTextContents()}`);
    await page.waitForTimeout(20);
  }
}
async function setScore(scope, value, label = '通关评分') {
  const integer = Math.floor(value), decimal = Math.round(value * 10) % 10;
  const wholeWheel = scope.getByRole('spinbutton', { name: `${label}整数`, exact: true }); await wholeWheel.press('Home');
  for (let i = 0; i < integer; i++) await wholeWheel.press('ArrowUp');
  const decimalWheel = scope.getByRole('spinbutton', { name: `${label}小数`, exact: true });
  if (integer !== 10) { await decimalWheel.press('Home'); for (let i = 0; i < decimal; i++) await decimalWheel.press('ArrowUp'); }
  await page.waitForTimeout(250);
  if(await scope.locator('.score-control--instant').count()) await waitSavedScore(value);
  return { wholeWheel, decimalWheel };
}
(async () => {
  fs.writeFileSync(libraryFile(), JSON.stringify(initial, null, 2)); const raw = fs.readFileSync(libraryFile(), 'utf8');
  await launch(); assert.equal(fs.readFileSync(libraryFile(), 'utf8'), raw); check('启动纯读取，不迁移或补写旧库');
  const covers = await page.evaluate(() => ['#1169cf', '#6628ac', '#13575f'].map((color, index) => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 900; const x = c.getContext('2d');
    const gradient = x.createLinearGradient(0, 0, 600, 900); gradient.addColorStop(0, color); gradient.addColorStop(1, '#071322'); x.fillStyle = gradient; x.fillRect(0, 0, 600, 900);
    x.strokeStyle = '#c6e4ed'; x.lineWidth = 4; x.beginPath(); x.arc(300, 360, 185, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#d9c08c'; x.beginPath(); x.moveTo(300, 150); x.lineTo(370, 360); x.lineTo(300, 520); x.lineTo(230, 360); x.closePath(); x.fill();
    x.fillStyle = '#eef6ff'; x.font = 'bold 46px sans-serif'; x.fillText('ASTRAL ARCHIVE', 66, 710); x.font = '22px sans-serif'; x.fillText(`QIYU  /  ${index + 1}    SYNTHETIC DEMO`, 68, 758); return c.toDataURL('image/png');
  }));
  initial.items.forEach((game, i) => { game.coverUrl = covers[i % 3]; }); fs.writeFileSync(libraryFile(), JSON.stringify(initial, null, 2)); await page.reload(); await all();
  for (const [name, finish] of [['多彩', 'prismatic'], ['镭射', 'holographic'], ['标准', 'standard'], ['零分', 'standard']]) assert.equal(await card(name).locator('.card-cover').getAttribute('data-finish'), finish);
  check('9.0到9.4多彩、9.5以上镭射，8.9与0分保留原图');
  for (const [name, filename] of [['镭射', 'holographic'], ['多彩', 'polychrome']]) {
    await card(name).locator('.card-cover').hover({ position: { x: 135, y: 100 } }); await page.waitForTimeout(150); await card(name).locator('.card-cover').hover({ position: { x: 136, y: 101 } });
    await card(name).locator('[data-webgl-material="active"]').waitFor(); assert.equal(await page.locator('.cover-material-canvas').count(), 1); await picture(filename);
  }
  await page.locator('.cover-material-canvas').evaluate(canvas => { window.__materialRecovery = canvas.getContext('webgl').getExtension('WEBGL_lose_context'); window.__materialRecovery.loseContext(); });
  await page.waitForFunction(() => !document.querySelector('[data-webgl-material="active"]'));
  assert.equal(await card('多彩').locator('img').evaluate(image => image.complete && image.naturalWidth > 0), true);
  await page.waitForTimeout(100); await page.evaluate(() => window.__materialRecovery.restoreContext()); await card('多彩').locator('[data-webgl-material="active"]').waitFor(); check('WebGL上下文丢失回退原图，恢复后重建材质');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(100); await card('镭射').locator('.card-cover').hover(); await card('镭射').locator('[data-webgl-material="active"]').waitFor(); await page.emulateMedia({ reducedMotion: 'no-preference' }); check('减少动态效果仍可显示静态材质');
  await page.mouse.move(1300, 120); await page.locator('.cover-material-canvas').waitFor({ state: 'detached' }); check('共享一个卡面渲染器，离开后移除');
  await picture('library'); await open(); assert.equal(await page.locator('.detail-dialog-heading').count(), 0); assert.equal(await page.locator('[data-widget=count]').count(), 0);
  assert.equal(await page.locator('.bento-cover-image').evaluate(image => getComputedStyle(image).objectFit), 'contain'); await picture('detail-top'); check('正式无标题栏Bento、封面contain、完成次数默认隐藏');
  let menu = await context('grade'); const untouchedScore = fs.readFileSync(libraryFile(), 'utf8'); await page.waitForTimeout(150); assert.equal(fs.readFileSync(libraryFile(), 'utf8'), untouchedScore); assert.equal(await menu.getByRole('button', { name: '保存', exact: true }).count(), 0); check('打开评分不写库，没有多余保存按钮');
  let wheels = await setScore(menu, 9.2); await wheels.decimalWheel.hover(); await page.mouse.wheel(0, 120); await page.waitForFunction(() => document.querySelector('[aria-label="通关评分小数"]')?.getAttribute('aria-valuenow') === '3'); await waitSavedScore(9.3); assert.equal(snapshot().items[0].personalScore, 9.3);
  await page.mouse.wheel(0, -120); await page.waitForFunction(() => document.querySelector('[aria-label="通关评分小数"]')?.getAttribute('aria-valuenow') === '2'); await waitSavedScore(9.2); assert.equal(snapshot().items[0].personalScore, 9.2);
  await page.mouse.wheel(0, 480); await page.waitForFunction(() => document.querySelector('[aria-label="通关评分小数"]')?.getAttribute('aria-valuenow') === '3'); await waitSavedScore(9.3); assert.equal(snapshot().items[0].personalScore, 9.3); check('真实鼠标120和480像素滚动都仅选一档并自动保存');
  await wheels.decimalWheel.evaluate(element => { for (let i=0;i<5;i++) element.dispatchEvent(new WheelEvent('wheel', { deltaY: 3, bubbles: true, cancelable: true })); }); assert.equal(snapshot().items[0].personalScore, 9.3); check('触控板微小惯性不造成多档连跳');
  await setScore(menu, 9.2); const beforeBurst=fs.readFileSync(libraryFile(),'utf8'); await wheels.decimalWheel.evaluate(element => { for(let i=0;i<3;i++) element.dispatchEvent(new WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true})); }); await waitSavedScore(9.5); assert.ok(fs.readFileSync(path.join(data,'library.previous.json'),'utf8')===beforeBurst,'Rapid three-notch input must make one repository write'); check('连续三档仅保存最终9.5分一次，避免反复写整库');
  await setScore(menu, 10); assert.equal(await wheels.decimalWheel.getAttribute('aria-disabled'), 'true'); assert.equal(snapshot().items[0].personalScore, 10); await wheels.decimalWheel.evaluate(element => element.dispatchEvent(new WheelEvent('wheel', { deltaY:120, bubbles:true, cancelable:true }))); assert.equal(snapshot().items[0].personalScore, 10);
  await setScore(menu, 0); const zeroRaw=fs.readFileSync(libraryFile(),'utf8'); await wheels.wholeWheel.hover(); await page.mouse.wheel(0,-120); assert.equal(fs.readFileSync(libraryFile(),'utf8'),zeroRaw); assert.equal(snapshot().items[0].personalScore,0); check('0分与10分边界锁定，同值不重复写入');
  await menu.getByRole('button', { name: '清除评分', exact: true }).click(); assert.equal(snapshot().items[0].personalScore, undefined); assert.equal(snapshot().items[0].personalGrade, 'A'); await setScore(menu,9.2); check('清除只移除数值，旧字母保留，未评分与0区别');
  const beforeScoreConflict=fs.readFileSync(libraryFile(),'utf8'); fs.writeFileSync(libraryFile(), beforeScoreConflict+'\n'); await wheels.decimalWheel.press('ArrowUp'); assert.equal(await wheels.decimalWheel.getAttribute('aria-valuenow'),'3'); assert.equal(snapshot().items[0].personalScore,9.2); await menu.getByRole('button', { name:'重试', exact:true }).waitFor(); await page.keyboard.press('Escape'); assert.equal(await menu.isVisible(),true); await page.mouse.click(1350,100); assert.equal(await menu.isVisible(),true); fs.writeFileSync(libraryFile(), beforeScoreConflict); await page.mouse.click(1350,100); assert.equal(await menu.isVisible(),true); assert.equal(snapshot().items[0].personalScore,9.2); await menu.getByRole('button', { name:'重试', exact:true }).click(); assert.equal(snapshot().items[0].personalScore,9.3); check('自动保存冲突保留草稿，关闭被拦下，原位重试成功');
  await setScore(menu,9.2); await wheels.decimalWheel.press('ArrowUp'); await page.keyboard.press('Escape'); assert.equal(snapshot().items[0].personalScore,9.3); menu=await context('grade'); await setScore(menu,9.2); await picture('score-wheels'); await menu.screenshot({ path:path.join(evidence,'score-picker.png') }); await page.keyboard.press('Escape'); assert.equal(snapshot().items[0].personalScore,9.2); check('关闭菜单前最后一档已入库，不依赖延迟保存');
  menu=await context('grade'); await setScore(menu,9.2); const beforeTouchConflict=fs.readFileSync(libraryFile(),'utf8'); fs.writeFileSync(libraryFile(),beforeTouchConflict+'\n'); await page.waitForTimeout(50); await menu.getByRole('spinbutton',{name:'通关评分小数',exact:true}).evaluate(element=>{element.scrollTop=5*32; window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));}); await menu.getByRole('button',{name:'重试',exact:true}).waitFor(); assert.equal(await menu.isVisible(),true); assert.equal(await menu.getByRole('spinbutton',{name:'通关评分小数',exact:true}).getAttribute('aria-valuenow'),'4'); assert.equal(snapshot().items[0].personalScore,9.2); fs.writeFileSync(libraryFile(),beforeTouchConflict); await menu.getByRole('button',{name:'撤销修改',exact:true}).click(); await page.keyboard.press('Escape'); check('未结算拖动在Escape前先结算，失败草稿可撤销而不丢失');
  menu = await context('footprint'); await menu.getByRole('button', { name: '新游戏+', exact: true }).click(); await menu.getByRole('button', { name: 'SS', exact: true }).click();
  assert.equal(snapshot().items[0].experienceCategory, 'replayable'); assert.equal(snapshot().items[0].playPriority, 'SS'); assert.equal(snapshot().items[0].personalScore, 9.2); assert.equal(snapshot().items[0].completionCount, 0);
  await menu.getByRole('button', { name: '收官完结', exact: true }).click(); await page.keyboard.press('Escape'); check('分类与字母优先级原位生效，评分/完成次数独立');
  menu = await context('impression'); await menu.getByRole('textbox', { name: '一句话印象', exact: true }).fill('一段只属于自己的星海记忆。'); await menu.getByRole('button', { name: '保存', exact: true }).click(); assert.equal(snapshot().items[0].review, initial.items[0].review); check('印象直接保存，不覆盖长测评');
  menu = await context('hours'); await menu.getByRole('spinbutton', { name: '累计游玩小时', exact: true }).fill('0'); await menu.getByRole('button', { name: '保存', exact: true }).click(); assert.equal(snapshot().items[0].lastPlayedAt, initial.items[0].lastPlayedAt);
  menu = await context('hours'); await menu.getByLabel('最后运行时间', { exact: true }).fill('2026-10-26T20:30'); await menu.getByRole('button', { name: '保存', exact: true }).click();
  assert.equal(snapshot().items[0].playtimeMinutes, 0); assert.ok(snapshot().items[0].lastPlayedAt); check('0小时与最后运行独立保存');
  const screenshotSource = path.join(data, '合成截图.png'); fs.writeFileSync(screenshotSource, Buffer.from(covers[0].split(',')[1], 'base64')); await nativeOpen(screenshotSource);
  menu = await context('gallery'); await menu.getByRole('button', { name: '导入截图', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.bento-gallery-heading small')?.textContent === '1 张');
  let shot = snapshot().items[0].screenshots[0]; assert.ok(fs.existsSync(path.join(data, 'screenshots', shot.assetId + '.original'))); assert.equal(shot.filename, '合成截图.png'); fs.unlinkSync(screenshotSource);
  await menu.getByRole('button', { name: '四宫格', exact: true }).click(); await page.keyboard.press('Escape'); assert.equal(await page.locator('.bento-gallery').getAttribute('data-mode'), '4');
  await page.locator('.bento-gallery-image').click(); await page.getByRole('textbox', { name: '截图说明', exact: true }).fill('第一次抵达这里。'); await page.getByRole('textbox', { name: '截图说明', exact: true }).press('Tab'); await page.getByRole('button', { name: '设为封面', exact: true }).click(); await picture('screenshot-original'); await page.getByRole('button', { name: '关闭截图', exact: true }).click();
  assert.equal(snapshot().items[0].screenshots[0].caption, '第一次抵达这里。'); assert.equal(snapshot().items[0].screenshotCoverId, shot.id); await picture('detail-gallery'); check('原图复制、删除来源仍可读、说明/封面/四宫格保存');
  await page.locator('.bento-gallery-image').click(); const rawBeforeConflict = fs.readFileSync(libraryFile(), 'utf8'); fs.writeFileSync(libraryFile(), rawBeforeConflict + '\n');
  await page.getByRole('textbox', { name: '截图说明', exact: true }).fill('保存失败时也保留这句话。'); await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog', { name: '截图原图', exact: true }).isVisible(), true); assert.equal(await page.getByRole('textbox', { name: '截图说明', exact: true }).inputValue(), '保存失败时也保留这句话。');
  fs.writeFileSync(libraryFile(), rawBeforeConflict); await page.keyboard.press('Escape'); assert.equal(snapshot().items[0].screenshots[0].caption, '保存失败时也保留这句话。'); check('修订冲突时截图说明草稿不丢失，重试后保存');
  const moreScreenshots = Array.from({ length: 9 }, (_, i) => { const filename = path.join(data, `截图-${i + 2}.png`); fs.writeFileSync(filename, Buffer.from(covers[1].split(',')[1], 'base64')); return filename; });
  await nativeOpen(moreScreenshots); menu = await context('gallery'); await menu.getByRole('button', { name: '导入截图', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.bento-gallery-heading small')?.textContent === '10 张');
  await menu.getByRole('button', { name: '九宫格', exact: true }).click(); await page.keyboard.press('Escape'); assert.equal(await page.locator('.bento-gallery-image').count(), 9);
  await page.getByRole('button', { name: '下一组截图', exact: true }).click(); assert.equal(await page.locator('.bento-gallery-image').count(), 1);
  const beforeRemove = snapshot().items[0].screenshots; await page.locator('.bento-gallery-image').click();
  assert.equal(await page.locator('.toast').evaluateAll(elements => elements.every(element => getComputedStyle(element).pointerEvents === 'none')), true);
  await page.getByRole('button', { name: '设为封面', exact: true }).click(); assert.equal(snapshot().items[0].screenshotCoverId, beforeRemove[9].id);
  await page.getByRole('button', { name: '移出相册', exact: true }).click(); assert.deepEqual(snapshot().items[0].screenshots, beforeRemove.slice(0, 9)); assert.equal(snapshot().items[0].screenshotCoverId, undefined); await page.getByRole('button', { name: '关闭截图', exact: true }).click();
  menu = await context('gallery'); await menu.getByRole('button', { name: '四宫格', exact: true }).click(); await page.keyboard.press('Escape'); await picture('detail-gallery'); check('十张截图九宫格翻页，移除只影响目标引用并回退封面');
  const beforeLayout = fs.readFileSync(libraryFile(), 'utf8'); menu = await context('tags'); await menu.getByRole('button', { name: '外观与布局', exact: true }).click(); await menu.getByRole('textbox', { name: '卡片颜色色号', exact: true }).fill('#2165d8'); await menu.getByRole('button', { name: '应用', exact: true }).click();
  assert.equal(fs.readFileSync(libraryFile(), 'utf8'), beforeLayout); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); check('逐卡自定义颜色只存偏好，不改收藏');
  menu = await context('cover'); await menu.getByRole('button', { name: '外观与布局', exact: true }).click(); await menu.getByRole('button', { name: '管理卡片与显示内容', exact: true }).click();
  const toolbar = page.getByRole('toolbar', { name: '调整详情布局', exact: true }); await toolbar.getByRole('button', { name: '完成', exact: true }).focus(); await page.keyboard.press('Tab'); assert.equal(await page.getByRole('button', { name: '关闭详情', exact: true }).evaluate(node => node === document.activeElement), true); await page.keyboard.press('Shift+Tab'); assert.equal(await toolbar.getByRole('button', { name: '完成', exact: true }).evaluate(node => node === document.activeElement), true); check('布局管理与完成/取消处于同一个键盘焦点圈');
  await page.getByRole('complementary', { name: '管理卡片与显示内容', exact: true }).getByLabel('完成次数', { exact: true }).check(); await page.getByRole('toolbar', { name: '调整详情布局', exact: true }).getByRole('button', { name: '完成', exact: true }).click(); assert.equal(await page.locator('[data-widget=count]').count(), 1); check('隐藏卡片可恢复，完成次数0不变');
  await closeDetail(); await card('多彩').click({ button: 'right' }); menu = page.getByRole('menu', { name: '星际档案 多彩快捷编辑', exact: true }); await setScore(menu, 9.1); assert.equal(snapshot().items[0].personalScore, 9.1); assert.equal(await menu.isVisible(),true); assert.equal(await menu.getByRole('button', { name:'保存', exact:true }).count(),0); await page.keyboard.press('Escape'); check('库卡片右键即时评分不关闭，无额外保存');
  const savedShots = snapshot().items[0].screenshots; await card('多彩').click({ button: 'right' }); await page.getByRole('menuitem', { name: '编辑作品资料', exact: true }).click(); const form = page.getByRole('dialog', { name: '编辑作品', exact: true }); await setScore(form, 9.7); await form.getByRole('button', { name: '保存修改', exact: true }).click(); assert.equal(snapshot().items[0].personalScore, 9.7); assert.deepEqual(snapshot().items[0].screenshots, savedShots); assert.equal(snapshot().items[0].personalGrade, 'A'); check('作品表单评分滚轮接线与截图/旧评级保留');
  if (await page.locator('.game-bento-dialog').count()) await closeDetail(); await page.getByRole('button', { name: '批量编辑游戏', exact: true }).click(); await page.getByRole('button', { name: '选择星际档案 多彩', exact: true }).click(); await page.getByRole('button', { name: '选择星际档案 镭射', exact: true }).click(); const bulk = page.locator('.selection-actionbar'); await setScore(bulk, 9.2, '统一通关评分'); await picture('bulk-score-wheels'); await bulk.getByRole('button', { name: '应用评分', exact: true }).click(); assert.equal(snapshot().items[0].personalScore, 9.2); assert.equal(snapshot().items[1].personalScore, 9.2); assert.equal(snapshot().items[0].playPriority, 'SS'); await bulk.getByRole('button', { name: '退出多选', exact: true }).click(); check('多选滚轮批量评分，保留字母优先级');
  await settings(); await page.getByRole('button', { name: '卡面材质', exact: true }).click(); for (const label of ['纹理强度', '底色滤镜', '流动速度']) assert.equal(await page.getByRole('slider', { name: label, exact: true }).inputValue(), '100'); assert.equal(await page.getByRole('checkbox', { name: '三角切面', exact: true }).isChecked(), true);
  check('正式设置三项100%与三角切面开启'); await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.reload(); await open(); assert.equal(await page.locator('.bento-gallery').getAttribute('data-mode'), '4'); assert.equal(await page.locator('[data-widget=count]').count(), 1); await page.locator('[data-widget=gallery]').scrollIntoViewIfNeeded(); await page.locator('.bento-gallery-image img').first().waitFor(); assert.ok(await page.locator('.bento-gallery-image img').first().evaluate(image => image.complete && image.naturalWidth > 0)); check('重载后评分/布局/本机图片保持');
  for (const [width, height] of [[1024, 768], [390, 720]]) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setBounds(size), { width, height }); await page.waitForTimeout(150);
    assert.ok(await page.locator('.game-bento-dialog').evaluate(node => node.scrollWidth <= node.clientWidth + 1)); await picture('detail-' + width);
  }
  check('1024与390窄窗详情无横向溢出'); await closeDetail();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 1440, height: 960 }));
  const backup = path.join(data, '完整备份.roost'); await app.evaluate(({ dialog }, filename) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename }); }, backup);
  await dataSettings(); await page.getByRole('button', { name: '导出', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('完整备份已保存')); assert.ok(fs.statSync(backup).size > 0); check('通过正式设置与原生IPC导出单文件完整备份');
  const expected = snapshot(); await app.close(); app = null;
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-bento-restore-')); fs.writeFileSync(libraryFile(), JSON.stringify({ schemaVersion: 1, items: [] })); await launch(); await nativeOpen(backup); await dataSettings(); await page.getByRole('button', { name: '导入', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('完整备份已恢复'));
  assert.deepEqual(snapshot().items, expected.items); shot = snapshot().items[0].screenshots[0]; assert.ok(fs.existsSync(path.join(data, 'screenshots', shot.assetId + '.original'))); assert.ok(fs.readdirSync(path.join(data, 'backups')).some(name => name.startsWith('before-import-'))); check('完整备份跨新目录恢复原图与收藏，保留操作前备份');
  await app.close(); app = null; await launch(); await open(); assert.equal(snapshot().items[0].personalScore, 9.2); await page.locator('[data-widget=gallery]').scrollIntoViewIfNeeded(); assert.ok(await page.locator('.bento-gallery-image img').first().evaluate(image => image.complete && image.naturalWidth > 0)); check('重启进程后恢复数据与截图磁盘读回一致');
  assert.deepEqual(errors, []); check('无页面运行错误');
})().catch(error => { console.error(error); process.exitCode = 1; checks.push({ name: 'FAIL', passed: false, error: error.stack }); }).finally(async () => { if (page && process.exitCode) await picture('failure').catch(() => {}); if (app) await app.close().catch(() => {}); fs.writeFileSync(path.join(evidence, 'verification.json'), JSON.stringify({ packaged, executablePath, dataDirectory: data, checks, errors }, null, 2)); });
