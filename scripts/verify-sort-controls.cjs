const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), version = require('../package.json').version;
const output = path.join(root, 'evidence', 'sort-controls-v' + version.replaceAll('.', ''));
const sha = value => createHash('sha256').update(value).digest('hex');
const report = { passed: false, version, isolatedDataOnly: true, userLibraryAccessed: false, checks: [], screenshots: [], integrity: [], errors: [], distAssets: [], notes: ['浏览器使用真实 LocalStorageRepository；bridge 使用真实 DesktopRepository 与合成数据内存桥。', '本脚本仅提供隔离网页交互验收，不替代 Electron 原生窗口验收；不访问真实 AppData/QIYU。', '升降序仅改变展示顺序：所有检查均验证收藏原文与写入次数不变。'] };
const work = (id, title, extra = {}) => ({ id, title, category: 'game', subcategory: 'Steam', creator: '隔离测试', year: '2025', status: 'want', gamePlayState: 'want', platforms: ['Steam'], tags: [], gameTags: { gameplay: ['动作'], theme: [], scenario: [], other: [] }, impression: '个人印象原样', review: '个人测评原样', favorite: false, artwork: 'outer', createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', futureItem: { untouched: id }, ...extra });
const fixture = { schemaVersion: 1, futureRoot: { untouched: ['原文'] }, items: [
  work('a', 'Alpha', { createdAt: '2024-01-01', year: '2024', playtimeMinutes: 0, playPriority: 'A', priorityOrder: 1, personalGrade: 'S', ratingOrder: 1, gameTags: { gameplay: ['动作','策略','射击','角色扮演','平台跳跃','潜行','生存'], theme: ['晨星专属'], scenario: [], other: [] } }),
  work('b', 'Beta', { createdAt: '2025-01-01', year: '2020', playtimeMinutes: 120, playPriority: 'A', priorityOrder: 0, personalGrade: 'S', ratingOrder: 0, gameTags: { gameplay: ['解谜'], theme: [], scenario: [], other: [] } }),
  work('c', 'Gamma', { createdAt: '2023-01-01', year: '2025', playtimeMinutes: 240, playPriority: 'SSS' }),
  work('u', 'Unknown', { createdAt: '', year: '', gameTags: { gameplay: ['音乐'], theme: [], scenario: [], other: [] } }),
  work('p', 'Paused', { createdAt: '2022-01-01', year: '2022', playtimeMinutes: 30, playPriority: 'SS', gamePlayState: 'paused', status: 'paused' }),
  work('r', 'Delta', { createdAt: '2026-01-01', year: '2018', playtimeMinutes: 60, playPriority: 'C', personalGrade: 'SSS', ratingOrder: 1, gamePlayState: 'cleared', status: 'finished' }),
  work('s', 'Epsilon', { createdAt: '2021-01-01', year: '2019', playtimeMinutes: 20, playPriority: 'B', personalGrade: 'SSS', ratingOrder: 0, gamePlayState: 'cleared', status: 'finished' }),
  work('t', 'Zeta', { createdAt: '2020-01-01', year: '2023', playtimeMinutes: 99, playPriority: 'SSS', personalGrade: 'A', gamePlayState: 'cleared', status: 'finished' }),
] };
const baseline = JSON.stringify(fixture), idByTitle = Object.fromEntries(fixture.items.map(item => [item.title, item.id]));
const expected = {
  rank: { desc: ['c','t','p','a','b','s','r','u'], asc: ['r','s','a','b','p','c','t','u'] },
  recent: { desc: ['r','b','a','c','p','s','t','u'], asc: ['t','s','p','c','a','b','r','u'] },
  title: { asc: ['a','b','r','s','c','p','u','t'], desc: ['t','u','p','c','s','r','b','a'] },
  year: { asc: ['r','s','b','p','t','a','c','u'], desc: ['c','a','t','p','b','s','r','u'] },
  playtime: { asc: ['a','s','p','r','t','b','c','u'], desc: ['c','b','t','r','p','s','a','u'] },
};
let browser, server, base, context, page, mode, stage;
const libraryKey = () => mode === 'bridge' ? 'qiyu.test.sort.library' : 'qiyu.library.v1';
const raw = () => page.evaluate(key => localStorage.getItem(key), libraryKey());
const saves = () => page.evaluate(() => window.__sortSaves);
const sort = () => page.getByRole('combobox', { name: '排序方式', exact: true });
const direction = () => page.getByRole('button', { name: /^排序方向：/ });
const group = name => page.locator('.ranked-gallery__group').filter({ has: page.locator('summary strong').getByText(name, { exact: true }) });
const groupIds = scope => scope.locator('[data-rank-item]').evaluateAll(elements => elements.map(element => element.dataset.rankItem));
const groupNames = () => page.locator('.ranked-gallery__group summary strong').allTextContents();
const flatIds = async () => (await page.locator('.media-card .card-name').allTextContents()).map(title => idByTitle[title]);
async function check(name, run) { stage = mode + ': ' + name; await run(); report.checks.push(stage); console.log('PASS ' + stage); }
async function capture(name) { const file = mode + '-' + name + '.png'; await page.screenshot({ path: path.join(output, file), caret: 'hide' }); report.screenshots.push(file); }
async function unchanged(name) { const after = await raw(); assert.equal(after, baseline, name + ' changed library bytes'); assert.equal(await saves(), 0, name + ' attempted library writes'); report.integrity.push({ mode, name, beforeSha256: sha(baseline), afterSha256: sha(after), same: true, saveAttempts: 0 }); }
function serve() {
  const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2' };
  server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://127.0.0.1').pathname;
    if (name === '/favicon.ico') { res.writeHead(204); return res.end(); }
    let file; try { file = path.resolve(dist, '.' + decodeURIComponent(name === '/' ? '/index.html' : name)); } catch { res.writeHead(400); return res.end(); }
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control':'no-store' }); fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve('http://127.0.0.1:' + server.address().port)));
}
async function prepare(currentMode, width = 1440) {
  mode = currentMode;
  context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', colorScheme: 'dark' });
  await context.addInitScript(({ initial, mode, version }) => {
    const key = mode === 'bridge' ? 'qiyu.test.sort.library' : 'qiyu.library.v1', originalSet = Storage.prototype.setItem;
    originalSet.call(localStorage, key, initial);
    originalSet.call(localStorage, 'qiyu.background.v1', JSON.stringify({ enabled: false, fluidEnabled: false, starsEnabled: false, hue: 33 }));
    window.__sortSaves = 0;
    Storage.prototype.setItem = function(name, value) { if (name === 'qiyu.library.v1') window.__sortSaves++; return originalSet.call(this, name, value); };
    if (mode === 'bridge') {
      let revision = 'sort-isolated-0', count = 0;
      window.qiyuDesktop = {
        getInfo: () => ({ version, dataDirectory: 'ISOLATED_NO_FILES', windowVisible: true }),
        loadLibrary: () => ({ ok: true, value: { snapshot: JSON.parse(localStorage.getItem(key)), revision } }),
        saveLibrary: (snapshot, expectedRevision) => { window.__sortSaves++; if (expectedRevision !== revision) return { ok: false, error: '隔离修订号冲突' }; originalSet.call(localStorage, key, JSON.stringify(snapshot)); revision = 'sort-isolated-' + ++count; return { ok: true, value: { revision } }; },
        onWindowVisibility: () => () => {}, openDataDirectory: () => {},
      };
    }
  }, { initial: baseline, mode, version });
  page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.errors.push({ stage, message: error.message }));
  page.on('console', message => { if (message.type() === 'error') report.errors.push({ stage, message: message.text() }); });
  await page.route('**/*', route => route.request().url().startsWith(base) || route.request().url().startsWith('data:') ? route.continue() : route.abort());
  await page.goto(base); await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
  assert.equal(await raw(), baseline);
}
async function allGames() { await page.locator('.library-views').getByRole('button', { name: '全部游戏', exact: true }).click(); }
async function expectDirection(value) { assert.equal(await direction().getAttribute('aria-label'), value === 'asc' ? '排序方向：升序，切换为降序' : '排序方向：降序，切换为升序'); }
async function suite(currentMode) {
  await prepare(currentMode);
  await check('五字段默认方向与双向排序，未知始终末尾、0时长真实有效', async () => {
    await allGames();
    assert.deepEqual(await sort().locator('option').allTextContents(), ['优先级','收录时间','名称','年份','游玩时长']);
    for (const field of ['rank','recent','title','year','playtime']) {
      await sort().selectOption(field); const normal = field === 'title' ? 'asc' : 'desc', reverse = normal === 'asc' ? 'desc' : 'asc';
      await expectDirection(normal); assert.deepEqual(await flatIds(), expected[field][normal], field + ' default');
      await direction().click(); await expectDirection(reverse); assert.deepEqual(await flatIds(), expected[field][reverse], field + ' reverse');
    }
    await unchanged('五字段升降序');
  });
  await check('优先级只反转等级组，组内手动序、未知暂停末组与多选禁拖保持', async () => {
    await page.locator('.library-views').getByRole('button', { name: '待体验计划', exact: true }).click();
    await expectDirection('desc');
    assert.deepEqual(await groupNames(), ['优先级 SSS','优先级 A','未设置优先级','以后再说 · 暂时搁置']);
    assert.deepEqual(await groupIds(group('优先级 A')), ['b','a']);
    await direction().click();
    assert.deepEqual(await groupNames(), ['优先级 A','优先级 SSS','未设置优先级','以后再说 · 暂时搁置']);
    assert.deepEqual(await groupIds(group('优先级 A')), ['b','a']);
    await group('优先级 A').locator('summary').click(); assert.equal(await group('优先级 A').getAttribute('open'), null);
    await group('优先级 A').locator('summary').click();
    await page.getByRole('button', { name:'批量编辑游戏', exact:true }).click();
    assert.equal(await page.locator('.ranked-gallery').getAttribute('data-reorder-enabled'), 'false');
    assert.equal(await page.locator('[data-rank-item="a"]').getAttribute('draggable'), 'false');
    assert.deepEqual(await groupIds(group('优先级 A')), ['b','a']);
    await page.getByRole('button', { name:'退出多选', exact:true }).click();
    await sort().selectOption('title'); assert.deepEqual(await groupIds(group('优先级 A')), ['a','b']);
    await direction().click(); assert.deepEqual(await groupIds(group('优先级 A')), ['b','a']);
    await sort().selectOption('rank'); assert.deepEqual(await groupIds(group('优先级 A')), ['b','a']);
    await unchanged('优先级分档/折叠/多选/其他字段');
  });
  await check('已通关排序称评级，双向组序与同档手动顺序独立', async () => {
    await page.locator('.game-status-tabs').getByRole('button', { name:'全部游戏', exact:true }).click(); await page.locator('.completion-row').getByRole('button', { name:'已通关', exact:true }).click();
    assert.equal(await sort().locator('option[value="rank"]').textContent(), '评级');
    assert.deepEqual(await groupNames(), ['个人评级 SSS','个人评级 A']);
    assert.deepEqual(await groupIds(group('个人评级 SSS')), ['s','r']);
    await direction().click(); assert.deepEqual(await groupNames(), ['个人评级 A','个人评级 SSS']);
    assert.deepEqual(await groupIds(group('个人评级 SSS')), ['s','r']);
    await unchanged('评级分档升降序'); await capture('rating-ascending');
  });
  await check('标签区域移除重复搜索管理，分类点击/清除/更多/折叠仍可用', async () => {
    await page.locator('.game-status-tabs').getByRole('button', { name:'全部游戏', exact:true }).click(); await page.locator('.completion-row').getByRole('button', { name:'全部进度', exact:true }).click();
    await allGames(); const panel = page.getByRole('region', { name:'标签筛选', exact:true });
    assert.equal(await panel.locator('input').count(), 0); assert.equal(await panel.getByRole('button', { name:'管理标签', exact:true }).count(), 0);
    assert.equal(await panel.getByText('查找标签', { exact:true }).count(), 0);
    const gameplay = panel.locator('.tag-type--gameplay');
    await gameplay.getByRole('button', { name:/^动作/ }).click();
    assert.deepEqual(new Set(await flatIds()), new Set(['a','c','p','r','s','t']));
    assert.equal(await gameplay.getByRole('button', { name:/^动作/ }).getAttribute('aria-pressed'), 'true');
    await panel.getByRole('button', { name:'清除标签', exact:true }).click(); assert.equal((await flatIds()).length, 8);
    const before = await gameplay.locator('.tag-filter').count();
    await gameplay.getByRole('button', { name:/^展开玩法全部标签/ }).click();
    assert.ok(await gameplay.locator('.tag-filter').count() > before);
    await gameplay.getByRole('button', { name:'收起玩法更多标签', exact:true }).click();
    assert.equal(await gameplay.locator('.tag-filter').count(), before);
    await panel.getByRole('button', { name:'收起标签', exact:true }).click(); assert.equal(await page.locator('#library-tag-filters').isVisible(), false);
    await panel.getByRole('button', { name:'展开标签', exact:true }).click(); assert.equal(await page.locator('#library-tag-filters').isVisible(), true);
    await unchanged('标签筛选/更多/清除/折叠');
  });
  await check('顶部统一搜索能搜标签，Dock管理入口仍能打开关闭', async () => {
    const search = page.getByRole('textbox', { name:'搜索收藏', exact:true });
    await search.fill('晨星专属'); assert.deepEqual(await flatIds(), ['a']);
    await page.getByRole('button', { name:'清除搜索', exact:true }).click(); assert.equal((await flatIds()).length, 8);
    await page.getByRole('button', { name:'标签管理', exact:true }).click();
    const modal = page.getByRole('dialog', { name:'管理标签', exact:true }); await modal.waitFor();
    assert.equal(await modal.getByText('晨星专属', { exact:true }).count(), 1);
    await modal.getByRole('button', { name:'完成', exact:true }).click(); assert.equal(await modal.count(), 0);
    await unchanged('统一搜索/Dock标签管理');
  });
  await context.close();
}
async function layout(width) {
  await prepare('layout-' + width, width);
  await check(width + 'px排序单行、菜单键盘与方向按钮可用，无页面横向溢出', async () => {
    await allGames(); await sort().selectOption('playtime');
    const dimensions = await page.locator('.sort-controls').evaluate(element => {
      const field = element.querySelector('.sort-controls__field'), select = element.querySelector('select'), button = element.querySelector('.sort-controls__direction'), label = button.querySelector('span');
      const a = field.getBoundingClientRect(), b = button.getBoundingClientRect(), text = label.getBoundingClientRect(), css = getComputedStyle(label);
      const scroll = document.querySelector('.main-scroll');
      return { viewport:innerWidth, document:document.documentElement.scrollWidth, scrollWidth:scroll.scrollWidth, scrollClient:scroll.clientWidth, fieldWidth:a.width, selectHeight:select.getBoundingClientRect().height, buttonHeight:b.height, sameLine:Math.abs(a.y+a.height/2-b.y-b.height/2)<2, whiteSpace:getComputedStyle(select).whiteSpace, labelLines:text.height/parseFloat(css.lineHeight), fieldRight:a.right, buttonLeft:b.left };
    });
    assert.ok(dimensions.document <= width + 1); assert.ok(dimensions.scrollWidth <= dimensions.scrollClient + 1);
    assert.ok(dimensions.fieldWidth >= 124 && dimensions.fieldWidth <= 138); assert.ok(dimensions.sameLine); assert.equal(dimensions.whiteSpace, 'nowrap');
    assert.ok(dimensions.fieldRight < dimensions.buttonLeft); assert.ok(dimensions.selectHeight < 30 && dimensions.buttonHeight < 48); assert.ok(dimensions.labelLines <= 1.1);
    await sort().click(); assert.equal(await sort().evaluate(element => element.matches(':open')), true); await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    assert.equal(await sort().inputValue(), 'recent'); await expectDirection('desc');
    await direction().focus(); await direction().press('Enter'); await expectDirection('asc'); assert.deepEqual(await flatIds(), expected.recent.asc);
    await sort().selectOption('playtime'); await capture('single-line-sort'); await unchanged('布局与键盘交互');
    report.layouts ??= []; report.layouts.push({ mode, ...dimensions });
  });
  await context.close();
}
(async () => { try {
  fs.mkdirSync(output, { recursive:true });
  report.distAssets = [...fs.readFileSync(path.join(dist, 'index.html'), 'utf8').matchAll(/(?:src|href)="((?:\.\/|\/)?assets\/[^"]+\.(?:js|css))"/g)].map(match => ({ path:match[1], sha256:sha(fs.readFileSync(path.join(dist, match[1]))) }));
  base = await serve(); browser = await chromium.launch({ channel:'msedge', headless:true });
  await suite('browser'); await suite('bridge'); await layout(1440); await layout(880);
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) { report.failure = { stage, message:error.message, stack:error.stack }; process.exitCode = 1; console.error(error.stack); if (page && !page.isClosed()) try { await capture('failure'); } catch {}
} finally {
  if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve));
  report.timestamp = new Date().toISOString(); fs.mkdirSync(output, { recursive:true }); fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed:report.passed, checks:report.checks.length, screenshots:report.screenshots.length, integrity:report.integrity.length, errors:report.errors, failure:report.failure }));
} })();

