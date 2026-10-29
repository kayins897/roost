// Actual Electron UI and disk checks, using synthetic data in an isolated profile.
// Usage: node scripts/verify-interface-preferences.cjs [absolute-path-to-packaged.exe]
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '..'), executable = process.argv[2], packaged = Boolean(executable);
const output = path.join(root, 'evidence', 'interface-v0435', packaged ? 'packaged' : 'source');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-interface-preferences-'));
const file = path.join(data, 'library.json'), checks = [], errors = [], layouts = [];
fs.mkdirSync(output, { recursive: true });
const make = (id, title, extra = {}) => ({ id, title, category: 'game', subcategory: 'Steam', creator: '原文作者 Raw author', year: '2026', status: 'want', tags: ['个人标签 Raw tag'], impression: '个人印象保留原文 Raw reflection', favorite: false, artwork: 'default', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '', ...extra });
const fixture = { schemaVersion: 1, futureRoot: { keep: true }, items: [
  make('game-unknown', '未知评分 中文 Game'),
  make('game-zero', '零分与零时长 Game', { experienceStatus: 'experienced', experienceCategory: 'completed', personalScore: 0, playtimeMinutes: 0 }),
  make('book-original', '用户书名 原样 Book', { category: 'book', subcategory: '用户自定书籍类型', bookDetails: { publisher: '原文出版社 Raw publisher', metadataSource: '豆瓣', readingSources: ['纸质书'] }, bookReading: { arrangement: 'want' } }),
  make('film-original', '用户片名 原样 Film', { category: 'screen', subcategory: '电影', screenViewing: { arrangement: 'want' } }),
  make('anime-original', '用户番剧 原样 Anime', { category: 'screen', subcategory: '番剧', screenViewing: { arrangement: 'want' } }),
  make('music-legacy', '历史音乐 不得删除', { category: 'music', subcategory: '专辑', futureMusic: { untouched: true } }),
] };
let app, page;
const raw = () => fs.readFileSync(file, 'utf8');
const stored = () => JSON.parse(raw());
const item = id => stored().items.find(entry => entry.id === id);
const check = name => { checks.push(name); console.log('PASS ' + name); };
async function eventually(predicate, message) {
  const until = Date.now() + 8000;
  do { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 80)); } while (Date.now() < until);
  assert.fail(message);
}
function backupSnapshot() {
  const result = {};
  const walk = dir => { if (!fs.existsSync(dir)) return; for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else result[path.relative(data, full)] = fs.readFileSync(full).toString('base64'); } };
  for (const entry of fs.readdirSync(data, { withFileTypes: true })) if (/backup/i.test(entry.name)) { const full = path.join(data, entry.name); if (entry.isDirectory()) walk(full); else result[entry.name] = fs.readFileSync(full).toString('base64'); }
  return result;
}
async function size(width, height = 980) {
  await app.evaluate(({ BrowserWindow }, bounds) => { const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(360, 500); win.setBounds(bounds); win.show(); win.webContents.setBackgroundThrottling(false); }, { width, height });
  await page.waitForTimeout(180);
}
async function launch() {
  const env = { ...process.env, QIYU_E2E: '1', QIYU_TEST_DATA_DIR: data }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: executable || path.join(root, 'node_modules/electron/dist/electron.exe'), args: packaged ? [] : [root], env, timeout: 45000 });
  page = await app.firstWindow(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept().catch(() => {}));
  await page.locator('.sidebar-nav').waitFor({ state: 'attached' });
  assert.equal(await page.evaluate(() => window.qiyuDesktop.getInfo().dataDirectory), data);
  await size(1440);
}
async function dock() {
  if (await page.locator('.mobile-menu').isVisible()) { if (!(await page.locator('.sidebar').evaluate(node => node.classList.contains('sidebar--open')))) await page.locator('.mobile-menu').click(); }
}
async function navigate(index) { await dock(); await page.locator('.sidebar-nav button').nth(index).click(); }
async function settings() {
  await dock(); await page.locator('.sidebar-tools button').last().click();
  await page.locator('.settings-dialog').waitFor(); await page.locator('.settings-nav button').first().click();
}
async function closeSettings() { await page.locator('.settings-dialog > .modal-heading > .icon-button').click(); await page.locator('.settings-dialog').waitFor({ state: 'hidden' }); }
async function language(value) {
  await page.locator('.settings-section select').first().selectOption(value);
  await page.waitForFunction(locale => document.documentElement.lang === locale, value);
}
async function externalLanguage(value) {
  await page.evaluate(locale => { localStorage.setItem('qiyu.interface.locale.v1', locale); window.dispatchEvent(new StorageEvent('storage', { key: 'qiyu.interface.locale.v1', newValue: locale, storageArea: localStorage })); }, value);
  await page.waitForFunction(locale => document.documentElement.lang === locale, value);
}
async function collect(mode) {
  await dock(); await page.locator('.sidebar-tools button').first().click();
  await page.locator('.collection-hub').waitFor(); await page.locator('.collection-hub-actions button').nth(mode).click();
  await page.locator(mode === 0 ? '.editor-form' : '.steam-library-import').waitFor();
}
async function shot(name) { await page.screenshot({ path: path.join(output, name + '.png') }); }
async function layout(name) {
  // Let hover-expanded navigation retract before taking a neutral layout image.
  await page.mouse.move((await page.evaluate(() => innerWidth)) - 10, 100);
  await page.waitForTimeout(350);
  const info = await page.evaluate(() => {
    const areas = ['html', 'body', '.main-panel', '.main-scroll', '.content-wrap', '.settings-dialog', '.settings-content'];
    const boxes = areas.map(selector => { const node = document.querySelector(selector); if (!node || !node.getClientRects().length) return null; const rect = node.getBoundingClientRect(); return { selector, client: node.clientWidth, scroll: node.scrollWidth, left: rect.left, right: rect.right, overflowX: getComputedStyle(node).overflowX }; }).filter(Boolean);
    const labelOverlaps = Array.from(document.querySelectorAll('.game-filter-group')).flatMap(group => {
      const label = group.querySelector('.game-filter-label'), strip = group.querySelector('.tag-strip');
      if (!label || !strip || !group.getClientRects().length) return [];
      const range = document.createRange(); range.selectNodeContents(label);
      const text = range.getBoundingClientRect(), tags = strip.getBoundingClientRect();
      return text.right > tags.left + 1 && text.left < tags.right && text.bottom > tags.top && text.top < tags.bottom ? [{ label: label.textContent, textRight: text.right, tagsLeft: tags.left }] : [];
    });
    return { viewport: innerWidth, boxes, labelOverlaps };
  });
  const overflow = info.boxes.filter(box => (box.right > info.viewport + 2 || box.left < -2 || box.scroll > box.client + 2 && !['hidden', 'clip', 'auto', 'scroll'].includes(box.overflowX)));
  layouts.push({ name, ...info, overflow }); await shot(name);
  assert.equal(overflow.length, 0, `${name}: horizontal overflow ${JSON.stringify(overflow)}`);
  assert.equal(info.labelOverlaps.length, 0, `${name}: English tag labels overlap content ${JSON.stringify(info.labelOverlaps)}`);
}
(async () => {
  fs.writeFileSync(file, JSON.stringify(fixture, null, 2)); await launch();
  assert.equal(await page.locator('.error-banner').count(), 0); assert.equal(await page.locator('.sidebar-nav button').count(), 3);
  assert.deepEqual(await page.locator('.sidebar-nav button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), ['游戏', '书籍', '影视']);
  const original = raw(), backups = backupSnapshot();
  check('Real Electron opens an isolated synthetic profile; three media entries and legacy music retained');

  await settings(); await language('en');
  assert.deepEqual(await page.locator('.sidebar-nav button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), ['Games', 'Books', 'Films & TV']);
  assert.equal(await page.locator('.settings-dialog').getAttribute('aria-label'), 'Settings');
  assert.match(await page.locator('.settings-nav').innerText(), /Language and fonts/);
  assert.equal(await page.locator('.settings-section select').first().inputValue(), 'en');
  await closeSettings();
  for (const [index, title] of [[0, 'Games'], [1, 'Books'], [2, 'Films & TV']]) { await navigate(index); await page.getByRole('heading', { name: title, exact: true }).waitFor(); }
  check('Chinese to English updates Dock, all three workspaces and settings without reloading');

  await settings(); await language('zh-CN');
  assert.deepEqual(await page.locator('.sidebar-nav button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), ['游戏', '书籍', '影视']);
  assert.equal(await page.locator('.settings-dialog').getAttribute('aria-label'), '数据与设置');
  await closeSettings(); await navigate(0); await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
  check('English to Chinese restores interface labels without reloading');

  await settings(); const families = {};
  for (const family of ['sans', 'serif', 'system']) {
    await page.locator(`.typography-options button[data-font-preview="${family}"]`).click();
    assert.equal(await page.locator('html').getAttribute('data-interface-font'), family);
    assert.equal(await page.locator(`.typography-options button[data-font-preview="${family}"]`).getAttribute('aria-pressed'), 'true');
    families[family] = await page.locator('html').evaluate(node => getComputedStyle(node).fontFamily);
  }
  assert.equal(new Set(Object.values(families)).size, 3);
  check('All three font presets immediately update the font family and selected state');

  await page.locator('.typography-options button[data-font-preview="serif"]').click();
  const serif = await page.evaluate(async () => { await document.fonts.load('16px "Noto Serif SC"', '栖域阅读汉字'); return { checked: document.fonts.check('16px "Noto Serif SC"', '栖域阅读汉字'), loaded: Array.from(document.fonts).filter(font => font.family.includes('Noto Serif SC')).map(font => ({ family: font.family, status: font.status })) }; });
  assert.equal(serif.checked, true); assert.ok(serif.loaded.some(font => font.status === 'loaded'));
  check('Bundled Noto Serif SC actually loads in Electron and supplies Chinese glyphs');

  await language('en'); await closeSettings();
  assert.equal(raw(), original); assert.deepEqual(backupSnapshot(), backups);
  await app.close(); app = null; await launch();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await page.locator('html').getAttribute('data-interface-font'), 'serif');
  await settings(); assert.equal(await page.locator('.settings-section select').first().inputValue(), 'en');
  assert.equal(await page.locator('[data-font-preview="serif"]').getAttribute('aria-pressed'), 'true'); await closeSettings();
  assert.equal(raw(), original); assert.deepEqual(backupSnapshot(), backups);
  check('Language and serif preference survive a real process restart without library or backup writes');

  await navigate(0);
  assert.ok((await page.locator('.card-name').allTextContents()).includes('未知评分 中文 Game'));
  assert.ok((await page.locator('.tag-filter').allTextContents()).some(text => text.includes('个人标签 Raw tag')));
  await page.getByRole('button', { name: 'View 未知评分 中文 Game details', exact: true }).click();
  assert.match(await page.locator('.game-bento-dialog').innerText(), /个人印象保留原文 Raw reflection/);
  await page.locator('.game-bento-close').click();
  await navigate(1); assert.match(await page.locator('.books-workspace').innerText(), /用户书名 原样 Book/);
  assert.equal(item('game-unknown').impression, fixture.items[0].impression); assert.equal(raw(), original);
  check('User titles, tags and personal impressions remain verbatim while interface language changes');

  await navigate(0); await externalLanguage('zh-CN'); await collect(0);
  const editor = page.locator('.editor-form');
  await editor.locator('.editor-fields > .form-field input').first().fill('未提交的中文标题 Unsaved title');
  await editor.getByLabel('一句话印象', { exact: true }).fill('未提交的中文感想 Draft reflection');
  await page.evaluate(() => { window.__qiyuDraftNode = document.querySelector('.editor-form'); });
  await externalLanguage('en');
  assert.equal(await editor.locator('.editor-fields > .form-field input').first().inputValue(), '未提交的中文标题 Unsaved title');
  assert.equal(await editor.getByLabel('One-line impression', { exact: true }).inputValue(), '未提交的中文感想 Draft reflection');
  assert.equal(await page.evaluate(() => window.__qiyuDraftNode === document.querySelector('.editor-form')), true);
  assert.equal(raw(), original);
  check('Cross-window language event preserves unsaved title and impression drafts, without remount or saving');

  const editorTypes = await editor.locator('select').first().locator('option').evaluateAll(nodes => nodes.map(node => node.value));
  assert.deepEqual(editorTypes, ['game', 'book', 'screen']);
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await editor.waitFor({ state: 'hidden' }); assert.equal(raw(), original);
  check('New-item form omits music; cancelling translated drafts leaves the collection byte-identical');

  const unknown = page.locator('.media-card').filter({ has: page.locator('.card-name', { hasText: '未知评分 中文 Game' }) });
  assert.equal(await unknown.locator('.card-score strong').innerText(), 'Unrated');
  await page.locator('.game-status-tabs button').nth(1).click();
  const zero = page.locator('.media-card').filter({ has: page.locator('.card-name', { hasText: '零分与零时长 Game' }) });
  await zero.waitFor(); assert.equal(await zero.locator('.card-score strong').innerText(), '0.0');
  assert.equal(await zero.locator('.card-score.is-unrated').count(), 0);
  assert.match(await zero.locator('.card-playtime').innerText(), /^0/);
  assert.equal(item('game-zero').personalScore, 0); assert.equal(item('game-unknown').personalScore, undefined);
  check('Unrated stays distinct from a real zero score and zero playtime');

  await navigate(2); await page.locator('.screen-kind-tabs button').filter({ hasText: 'Anime' }).click();
  await collect(0); const newEditor = page.locator('.editor-form');
  await newEditor.locator('select').first().selectOption('screen');
  await newEditor.getByLabel('Viewing type', { exact: true }).selectOption('番剧');
  assert.equal(await newEditor.getByLabel('Viewing type', { exact: true }).locator('option:checked').innerText(), 'Anime');
  await newEditor.locator('.editor-fields > .form-field input').first().fill('英文界面新建番剧 Raw anime');
  await newEditor.getByRole('button', { name: 'Add to collection', exact: true }).click();
  await newEditor.waitFor({ state: 'hidden' });
  await eventually(() => stored().items.some(entry => entry.title === '英文界面新建番剧 Raw anime'), 'New anime was not persisted');
  const created = stored().items.find(entry => entry.title === '英文界面新建番剧 Raw anime');
  assert.equal(created.category, 'screen'); assert.equal(created.subcategory, '番剧');
  const openDetail = page.locator('.modal-backdrop [role="dialog"]');
  if (await openDetail.count()) await openDetail.last().getByRole('button', { name: 'Close', exact: true }).click();
  check('Creating Anime in English persists the existing Chinese subcategory enum, not its translated label');

  await collect(2); const importer = page.locator('.steam-library-import');
  assert.deepEqual(await importer.locator('.steam-import-options select').first().locator('option').evaluateAll(nodes => nodes.map(node => node.value)), ['game', 'screen', 'book']);
  await importer.getByLabel('Item list', { exact: true }).fill(JSON.stringify({ format: 'qiyu.batch.v1', items: [{ category: 'game', title: '混合清单新游戏 Raw import' }, { category: 'music', title: '不得导入的新音乐' }] }));
  await importer.getByRole('button', { name: 'Generate preview', exact: true }).click();
  assert.match(await importer.locator('.import-info').innerText(), /Skipped 1 music records/);
  assert.equal(await importer.locator('.steam-import-row').count(), 1);
  assert.match(await importer.locator('.steam-import-row').innerText(), /混合清单新游戏 Raw import/);
  check('Batch media selector omits music and mixed JSON explicitly reports skipped music');

  await importer.getByRole('button', { name: /^Import 1 selected/ }).click();
  await importer.waitFor({ state: 'hidden' });
  await eventually(() => stored().items.some(entry => entry.title === '混合清单新游戏 Raw import'), 'Non-music import not saved');
  assert.equal(stored().items.some(entry => entry.title === '不得导入的新音乐'), false);
  assert.deepEqual(item('music-legacy'), fixture.items.find(entry => entry.id === 'music-legacy'));
  assert.deepEqual(stored().futureRoot, fixture.futureRoot);
  check('Mixed import saves permitted media only; legacy music and unknown extension fields survive');

  for (const width of [390, 768, 1440]) {
    await size(width);
    for (const [index, name] of [[0, 'games'], [1, 'books'], [2, 'screen']]) { await navigate(index); await layout(`en-${name}-${width}`); }
    await settings(); await layout(`en-settings-${width}`); await closeSettings();
    check(`English workspaces and settings have no viewport overflow at ${width}px (four screenshots)`);
  }

  const beforeRestart = stored(); await app.close(); app = null; await launch();
  assert.deepEqual(stored(), beforeRestart);
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(item('game-zero').personalScore, 0); assert.equal(item('game-unknown').personalScore, undefined);
  assert.deepEqual(item('music-legacy'), fixture.items.find(entry => entry.id === 'music-legacy'));
  check('Final process restart retains new Anime/import, zero-vs-unrated, legacy music and preferences');
  assert.deepEqual(errors, []); check('No renderer page errors during all scenarios');
  fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({ passed: true, version: require('../package.json').version, checks, errors, layouts, dataDirectory: data, executable: executable || 'source Electron', fontFamilies: families, serif }, null, 2));
  console.log(JSON.stringify({ passed: true, checks: checks.length, output, dataDirectory: data }, null, 2));
})().catch(async error => {
  console.error(error); if (page) { await shot('failure').catch(() => {}); fs.writeFileSync(path.join(output, 'failure.txt'), await page.locator('body').innerText().catch(() => '')); }
  fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({ passed: false, checks, errors, layouts, dataDirectory: data, error: String(error), stack: error.stack }, null, 2)); process.exitCode = 1;
}).finally(async () => { if (app) await app.close().catch(() => {}); });
