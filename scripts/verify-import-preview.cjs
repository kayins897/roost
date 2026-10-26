// N4 离线清单预览改进专项：分类筛选计数、当前结果全选/半选、隐藏已选、跨筛选保持选择、重复导入不增量。浏览器+内存桥双模式。
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), version = require('../package.json').version;
const output = path.join(root, 'evidence', `import-preview-v${version.replaceAll('.', '')}`), sha = value => createHash('sha256').update(value).digest('hex');
const report = { passed: false, version, isolatedDataOnly: true, userLibraryAccessed: false, checks: [], screenshots: [], errors: [], notes: ['浏览器真实 LocalStorageRepository / bridge 真实 DesktopRepository + 合成内存桥；不访问真实 AppData/QIYU。'] };
const work = (id, title, extra = {}) => ({ id, title, category: 'game', subcategory: 'Steam', creator: '隔离', year: '2025', status: 'want', gamePlayState: 'want', platforms: ['Steam'], tags: [], gameTags: { gameplay: [], theme: [], scenario: [], other: [] }, impression: '', favorite: false, artwork: 'default', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...extra });
const fixture = { schemaVersion: 1, importExclusions: [{ provider: 'steam', id: '555' }], items: [
  work('lib1', '库中作品X', { externalIds: [{ provider: 'steam', id: '100' }] }),
  work('lib2', '同名作品Y'),
] };
const manifest = ['全新 Beta', '来源不同名称 | https://store.steampowered.com/app/100/ | 30', '同名作品Y', '双胞 Gamma', '双胞 Gamma', '排除 Delta | https://store.steampowered.com/app/555/ | 0', '全新 Epsilon', '全新 Zeta'].join('\n');
let baseline = JSON.stringify(fixture);
let browser, server, base, context, page, mode, stage;
const raw = () => page.evaluate(key => localStorage.getItem(key), mode === 'bridge' ? 'qiyu.test.import.library' : 'qiyu.library.v1');
const data = async () => JSON.parse(await raw());
async function check(name, run) { stage = `${mode}: ${name}`; await run(); report.checks.push(stage); console.log(`PASS ${stage}`); }
async function capture(name) { await page.screenshot({ path: path.join(output, mode + '-' + name + '.png'), caret: 'hide' }); report.screenshots.push(mode + '-' + name + '.png'); }
function serve() { const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }; server = http.createServer((req, res) => { const name = new URL(req.url, 'http://127.0.0.1').pathname; let file; try { file = path.resolve(dist, '.' + decodeURIComponent(name === '/' ? '/index.html' : name)); } catch { res.writeHead(400); return res.end(); } if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(file).pipe(res); }); return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))); }
async function prepare(currentMode) {
  mode = currentMode; context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', colorScheme: 'dark' });
  await context.addInitScript(({ initial, mode }) => {
    const key = mode === 'bridge' ? 'qiyu.test.import.library' : 'qiyu.library.v1', set = Storage.prototype.setItem;
    if (!localStorage.getItem(key)) set.call(localStorage, key, initial);
    window.__importFail = false;
    Storage.prototype.setItem = function(name, value) { if (name === key && window.__importFail) throw new DOMException('隔离模拟保存失败', 'QuotaExceededError'); return set.call(this, name, value); };
    set.call(localStorage, 'qiyu.background.v1', JSON.stringify({ enabled: false, hue: 33 }));
    if (mode === 'bridge') { let revision = 'import-0', count = 0; window.qiyuDesktop = { getInfo: () => ({ version: 'test', dataDirectory: 'ISOLATED', windowVisible: true }), loadLibrary: () => ({ ok: true, value: { snapshot: JSON.parse(localStorage.getItem(key)), revision } }), saveLibrary: (snapshot, expected) => { if (window.__importFail) return { ok: false, error: '隔离模拟保存失败' }; if (expected !== revision) return { ok: false, error: '隔离修订号冲突' }; set.call(localStorage, key, JSON.stringify(snapshot)); revision = `import-${++count}`; return { ok: true, value: { revision } }; }, onWindowVisibility: () => () => {}, openDataDirectory: () => {} }; }
  }, { initial: baseline, mode });
  page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.errors.push({ stage, message: error.message }));
  await page.goto(base); await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
  assert.equal(await raw(), baseline);
}
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const dialog = () => page.getByRole('dialog', { name: '批量导入作品', exact: true });
async function openAndParse() {
  await button('批量导入作品').click();
  const dlg = dialog(); await dlg.waitFor();
  await dlg.getByRole('textbox').first().fill(manifest);
  await button('生成预览', dlg).click();
  await dlg.locator('.steam-import-rows').waitFor();
  return dlg;
}
async function suite(currentMode) {
  await prepare(currentMode);
  await check('分类筛选计数正确，当前结果全选半选与隐藏已选计数', async () => {
    const dlg = await openAndParse();
    assert.match(await dlg.locator('.steam-import-row').filter({ hasText: '来源不同名称' }).innerText(), /已收藏：库中作品X/);
    const filters = dlg.locator('.steam-import-filter'); // 清单内重复仅标记第二行，第一行双胞 Gamma 属可新增（故可新增=4）
    for (const [label, count] of [['全部', '8'], ['可新增', '4'], ['库中重复', '2'], ['清单内重复', '1'], ['已移除跳过', '1']]) {
      assert.ok(await filters.filter({ hasText: label }).first().innerText().then(text => text.includes(count)), `${label} 计数应含 ${count}`);
    }
    // 默认全选新增 3；切到可新增，取消一件 → 当前结果半选、隐藏计数出现于搜索后。
    await filters.filter({ hasText: '可新增' }).first().click();
    await capture('filters-counts');
    const current = dlg.locator('input[aria-label="全选当前结果"]');
    assert.equal(await current.isChecked(), true, '当前结果初始全选');
    await current.uncheck(); assert.equal(await current.isChecked(), false);
    await current.check(); assert.equal(await current.isChecked(), true, '真实点击当前结果全选恢复所选');
    await dlg.locator('input[aria-label="导入 全新 Beta"]').uncheck();
    assert.equal(await current.isChecked(), false);
    assert.equal(await current.evaluate(node => node.indeterminate), true, '半选状态');
    await dlg.getByRole('textbox', { name: '查找清单中的作品' }).fill('Epsilon');
    await dlg.locator('.steam-import-hidden').waitFor();
    assert.ok((await dlg.locator('.steam-import-hidden').innerText()).includes('2 件已选'), '隐藏已选计数');
    await dlg.getByRole('textbox', { name: '查找清单中的作品', exact: true }).fill('NO_MATCH_ZZZ');
    assert.equal(await current.isDisabled(), true); assert.match(await dlg.innerText(), /没有匹配名称/);
    // 清空搜索、切回全部：选择保持（Beta 仍未选），导入选中 2 件。
    await dlg.getByRole('textbox', { name: '查找清单中的作品' }).fill('');
    await filters.filter({ hasText: '全部' }).first().click();
    assert.equal(await dlg.locator('input[aria-label="导入 全新 Beta"]').isChecked(), false, '跨筛选与搜索保持原选择');
    assert.ok((await button('导入选中的 3 件', dlg).count()) >= 1);
    // 重复项不可选。
    await filters.filter({ hasText: '库中重复' }).first().click();
    assert.equal(await dlg.locator('input[aria-label="导入 来源不同名称"]').isDisabled(), true);
    assert.equal(await dlg.locator('input[aria-label="导入 同名作品Y"]').isDisabled(), true);
    await filters.filter({ hasText: '可新增' }).first().click();
    const beforeFailure = await raw(); await page.evaluate(() => window.__importFail = true);
    await button('导入选中的 3 件', dlg).click();
    assert.equal(await raw(), beforeFailure); await dlg.waitFor();
    await page.evaluate(() => window.__importFail = false);
    await button('导入选中的 3 件', dlg).click();
    await dlg.waitFor({ state: 'hidden' });
    const after = await data();
    assert.equal(after.items.length, 5, '只新增选中 3 件');
    const titles = after.items.map(item => item.title);
    assert.ok(titles.includes('全新 Epsilon') && titles.includes('全新 Zeta') && titles.includes('双胞 Gamma') && !titles.includes('全新 Beta'));
  });
  await check('重复提交不产生重复作品，取消零写入', async () => {
    // 重贴同一清单：已导入两件变为库中重复，可新增仅剩 Beta；导入后库内 5 件、无重复标题。
    const before = await raw();
    const dlg = await openAndParse();
    const filters = dlg.locator('.steam-import-filter'); // 清单内重复仅标记第二行，第一行双胞 Gamma 属可新增（故可新增=4）
    assert.ok(await filters.filter({ hasText: '可新增' }).first().innerText().then(text => text.includes('1')), '重复导入时仅剩 1 件可新增');
    // 先取消整批，验证零写入。
    await dlg.locator('input[aria-label="选择全部新作品"]').uncheck();
    await button('取消', dlg).click();
    await page.locator('.steam-import-discard').getByRole('button', { name: '放弃本次清单' }).click();
    await dlg.waitFor({ state: 'hidden' });
    assert.equal(await raw(), before, '取消不写入');
    const second = await openAndParse();
    await button('导入选中的 1 件', second).click();
    await second.waitFor({ state: 'hidden' });
    const after = await data();
    assert.equal(after.items.length, 6);
    const duplicateTitles = after.items.map(item => item.title).filter((title, index, all) => all.indexOf(title) !== index);
    assert.deepEqual(duplicateTitles, [], '库内无重复作品');
    await capture('after-second-import');
  });
  await context.close();
}
(async () => { try {
  fs.mkdirSync(output, { recursive: true });
  base = await serve(); browser = await chromium.launch({ channel: 'msedge', headless: true });
  await suite('browser'); await suite('bridge');
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) { report.failure = { stage, message: error.message, stack: error.stack }; process.exitCode = 1; console.error(error.stack);
} finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); report.timestamp = new Date().toISOString(); fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failure: report.failure })); } })();
