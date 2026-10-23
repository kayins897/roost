const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');

const root = path.resolve(__dirname, '..');
const executablePath = process.argv[2] || path.join(root, 'node_modules/electron/dist/electron.exe');
const packaged = Boolean(process.argv[2]);
const prefix = process.argv[3] ? process.argv[3].replace(/[^a-z0-9-]/gi, '') + '-' : '';
const evidence = path.join(root, 'evidence');
const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-features-'));
const dataFile = path.join(dataDirectory, 'library.json');
const env = { ...process.env, QIYU_E2E: '1', QIYU_TEST_DATA_DIR: dataDirectory };
delete env.ELECTRON_RUN_AS_NODE;
const checks = [], pageErrors = [], requests = [], screenshots = [], screenshotErrors = [];
let app, page, stage = '初始化', conflictRestorationRaw, exportCounter = 0;
const snapshot = () => JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const item = (id, category, title, extra = {}) => ({
  id, category, title, subcategory: '', creator: '', year: '', status: 'want', tags: [],
  impression: '', favorite: false, artwork: 'default', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...extra,
});
const fixtures = {
  schemaVersion: 1, futureRoot: { untouched: '保留根扩展' },
  items: [
    item('legacy', 'game', '旧版游戏', {
      subcategory: 'Steam / Switch', playtimeMinutes: 75, gamePlayState: 'cleared',
      tags: ['旧标签'], futureItem: { untouched: '保留作品扩展' },
      gameTags: { gameplay: ['旧标签'], theme: [], scenario: [], other: [], futureGroup: ['保留分组扩展'] },
    }),
    item('multi', 'game', '多平台游戏', {
      subcategory: 'Switch', platforms: ['Switch', 'PS5'], favorite: true, playtimeMinutes: 195,
      gamePlayState: 'ongoing', status: 'active', impression: '我的原始印象',
      tags: ['同名'], gameTags: { gameplay: ['同名'], theme: ['同名'], scenario: [], other: [] },
      externalIds: [{ provider: 'steam', id: '100' }],
    }),
    item('scenario', 'game', '场景同名游戏', {
      platforms: ['Steam'], tags: ['同名'], gameTags: { gameplay: [], theme: [], scenario: ['同名'], other: [] },
    }),
    item('new', 'book', '标签很多的书', { tags: ['同名', ...Array.from({ length: 22 }, (_, i) => `标签${String(i + 1).padStart(2, '0')}`)] }),
  ],
};
fs.mkdirSync(evidence, { recursive: true });
fs.writeFileSync(dataFile, JSON.stringify(fixtures, null, 2));

async function check(name, run) { stage = name; await run(); checks.push(name); console.log(`PASS ${name}`); }
async function closeDetail() {
  await page.locator('.detail-toolbar').getByRole('button', { name: '关闭', exact: true }).click();
}
async function openWork(title) {
  await page.getByRole('button', { name: `查看${title}详情`, exact: true }).click();
  await page.locator('.detail-panel').getByRole('heading', { name: title, exact: true }).waitFor();
}
async function navigate(label) { await page.getByRole('navigation', { name: '作品分类' }).getByRole('button', { name: new RegExp(label) }).click(); }
async function advanced() { const toggle = page.getByRole('button', { name: /^筛选/ }); if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click(); }
async function clearFilters() {
  const clear = page.locator('.active-filter-summary').getByRole('button', { name: '全部清除', exact: true });
  if (await clear.count()) await clear.click();
  await page.getByRole('textbox', { name: '搜索收藏', exact: true }).fill('');
}
async function galleryTitles() { return page.locator('.media-gallery .media-card').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))); }
async function captureEvidence(name) {
  let timer;
  try {
    // Hidden Electron windows can otherwise capture the compositor's preceding frame.
    await page.waitForTimeout(350);
    const png = await Promise.race([
      app.evaluate(async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        const image = await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
        if (image.isEmpty()) throw new Error('截图为空');
        return image.toPNG().toString('base64');
      }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('隐藏测试窗口截图超时')), 15000); }),
    ]);
    fs.writeFileSync(path.join(evidence, prefix + name), Buffer.from(png, 'base64'));
    screenshots.push(prefix + name);
  } catch (error) { screenshotErrors.push({ name, message: error.message }); }
  finally { clearTimeout(timer); }
}
async function exportSnapshot() {
  const file = path.join(dataDirectory, `features-export-${++exportCounter}.json`);
  await app.evaluate(({ BrowserWindow }, destination) => {
    BrowserWindow.getAllWindows()[0].webContents.session.once('will-download', (_event, download) => download.setSavePath(destination));
  }, file);
  await page.getByRole('button', { name: '导出备份', exact: true }).click();
  for (let index = 0; index < 150; index++) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  throw new Error('备份导出没有完成');
}
async function setupNetwork() {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 6;
    const context = canvas.getContext('2d'); context.fillStyle = '#658d81'; context.fillRect(0, 0, 4, 6);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const bookHtml = '<html><head><meta property="og:title" content="豆瓣测试图书"><meta property="og:image" content="https://img1.doubanio.com/mock.png"><meta property="book:author" content="测试作家"><script type="application/ld+json">{"@type":"Book","name":"豆瓣测试图书","author":{"name":"测试作家"},"datePublished":"2020-01-01"}</script></head><body><h1>豆瓣测试图书</h1><div id="info"><span>出版年:</span> 2020<br/><span>原作名:</span> Fixture Book</div></body></html>';
  const screenHtml = '<html><head><meta property="og:title" content="豆瓣测试番剧"><meta property="og:type" content="video.tv_show"><meta property="og:image" content="https://img1.doubanio.com/mock.png"><meta property="video:tag" content="动画"><meta property="video:release_date" content="2021-04-01"><script type="application/ld+json">{"@type":"TVSeries","name":"豆瓣测试番剧","director":{"name":"测试导演"}}</script></head><body><h1><span property="v:itemreviewed">豆瓣测试番剧</span></h1><div id="info"><span>类型:</span> 动画<br/><span>集数:</span> 12</div></body></html>';
  await app.evaluate(({ net }, fixture) => {
    const originalFetch = net.fetch.bind(net);
    globalThis.__qiyuFeatureRequests = [];
    net.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url ?? input.toString());
      if (url.protocol === 'file:' || url.protocol === 'qiyu:') return originalFetch(input, init);
      globalThis.__qiyuFeatureRequests.push({ url: url.toString(), credentials: init?.credentials, redirect: init?.redirect });
      if (url.hostname === 'store.steampowered.com' && url.pathname === '/api/storesearch/') return new Response(JSON.stringify({ items: [
        { type: 'app', id: 100, name: '来源测试游戏', tiny_image: 'https://shared.akamai.steamstatic.com/mock.png' },
        { type: 'app', id: 200, name: '全新资料游戏', tiny_image: 'https://shared.akamai.steamstatic.com/mock.png' },
      ] }), { headers: { 'content-type': 'application/json' } });
      if (url.hostname === 'store.steampowered.com' && url.pathname === '/api/appdetails') {
        const id = url.searchParams.get('appids');
        return new Response(JSON.stringify({ [id]: { success: true, data: { name: id === '100' ? '来源测试游戏' : '全新资料游戏', developers: ['Fixture Developer'], release_date: { date: '1 Jan, 2024' }, header_image: 'https://shared.akamai.steamstatic.com/mock.png' } } }), { headers: { 'content-type': 'application/json' } });
      }
      if (url.hostname === 'book.douban.com' && url.pathname === '/subject/300/') return new Response(fixture.bookHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      if (url.hostname === 'movie.douban.com' && url.pathname === '/subject/400/') return new Response(fixture.screenHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      if (['shared.akamai.steamstatic.com', 'img1.doubanio.com'].includes(url.hostname) && url.pathname === '/mock.png') return new Response(Buffer.from(fixture.png, 'base64'), { headers: { 'content-type': 'image/png' } });
      throw new Error(`E2E拒绝未mock的网络请求: ${url}`);
    };
  }, { png, bookHtml, screenHtml });
}
async function metadataLookup(query, selection = 0) {
  await page.getByRole('button', { name: '检索与导入', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '从来源收录', exact: true });
  await dialog.getByLabel('游戏名称或作品链接', { exact: true }).fill(query);
  await dialog.getByRole('button', { name: '读取资料', exact: true }).click();
  await dialog.getByRole('button', { name: '选择', exact: true }).nth(selection).click();
  return page.getByRole('dialog', { name: '确认收录与合并', exact: true });
}
async function finishMetadata(review, create) {
  if (create) await review.getByRole('radio', { name: /新建独立作品/ }).check();
  await review.getByRole('button', { name: '确认并编辑', exact: true }).click();
  const editor = page.getByRole('dialog', { name: create ? '收录新作品' : '编辑作品', exact: true });
  await editor.getByRole('button', { name: create ? '加入收藏' : '保存修改', exact: true }).click();
  await page.locator('.detail-panel').waitFor();
}

(async () => {
  let failure;
  try {
    app = await electron.launch({ executablePath, args: packaged ? [] : [root], env, timeout: 45000 });
    page = await app.firstWindow(); page.setDefaultTimeout(12000);
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
    assert.deepEqual(await page.getByRole('navigation', { name: '作品分类' }).getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))), ['游戏', '书籍', '影视', '音乐']);
    assert.equal((await page.evaluate(() => window.qiyuDesktop.getInfo())).dataDirectory, dataDirectory);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
    await setupNetwork();

    await check('旧库完整编辑、快捷标签及导出保留未知字段和分钟精度', async () => {
      await openWork('旧版游戏'); await page.getByRole('button', { name: '编辑作品', exact: true }).click();
      const editor = page.getByRole('dialog', { name: '编辑作品', exact: true });
      assert.equal(await editor.getByLabel(/累计游玩时长/).inputValue(), '1.25');
      assert.equal(await editor.getByLabel(/拥有平台/).inputValue(), 'Steam / Switch');
      await editor.getByLabel(/作品名称/).fill('旧版游戏编辑后');
      await editor.getByRole('button', { name: '保存修改', exact: true }).click();
      await page.getByRole('button', { name: '编辑标签', exact: true }).click();
      const quick = page.getByRole('dialog', { name: '编辑标签', exact: true });
      await quick.getByLabel('其他', { exact: true }).fill('快捷补充');
      await quick.getByRole('button', { name: '保存', exact: true }).click();
      await closeDetail();
      const exported = await exportSnapshot();
      const legacy = exported.items.find(row => row.id === 'legacy');
      assert.deepEqual(exported.futureRoot, fixtures.futureRoot);
      assert.deepEqual(legacy.futureItem, fixtures.items[0].futureItem);
      assert.deepEqual(legacy.gameTags.futureGroup, ['保留分组扩展']);
      assert.deepEqual(legacy.platforms, ['Steam / Switch']);
      assert.equal(legacy.playtimeMinutes, 75);
      assert.ok(legacy.tags.includes('快捷补充'));
    });

    await check('印象关闭自动保存，外部冲突保留草稿、原界面与文件', async () => {
      await openWork('多平台游戏');
      assert.equal(await page.locator('.detail-impression [role=status]').innerText(), '已保存 · 本地');
      await page.locator('.impression-input').fill('离开详情自动保存的印象');
      assert.equal(await page.locator('.detail-impression [role=status]').innerText(), '未保存');
      await closeDetail();
      assert.equal(snapshot().items.find(row => row.id === 'multi').impression, '离开详情自动保存的印象');
      await openWork('多平台游戏');
      assert.equal(await page.locator('.detail-impression [role=status]').innerText(), '已保存 · 本地');
      const original = fs.readFileSync(dataFile, 'utf8'); conflictRestorationRaw = original;
      const changed = original + '\n '; fs.writeFileSync(dataFile, changed);
      await page.locator('.impression-input').fill('冲突时不能丢失的草稿');
      await closeDetail();
      assert.equal(await page.locator('.detail-panel').count(), 1);
      assert.equal(await page.locator('.impression-input').inputValue(), '冲突时不能丢失的草稿');
      assert.equal(await page.locator('.detail-impression [role=status]').innerText(), '未保存', '保存失败不能显示为已保存');
      assert.equal(fs.readFileSync(dataFile, 'utf8'), changed);
      assert.equal(snapshot().items.find(row => row.id === 'multi').impression, '离开详情自动保存的印象');
      fs.writeFileSync(dataFile, original); conflictRestorationRaw = undefined;
      await closeDetail();
      assert.equal(await page.locator('.detail-panel').count(), 0);
      assert.equal(snapshot().items.find(row => row.id === 'multi').impression, '冲突时不能丢失的草稿');
    });

    await check('快捷累计时长保留整数分钟，平台及喜欢筛选生效', async () => {
      await openWork('多平台游戏');
      await page.getByRole('button', { name: '修改时长', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '修改累计游玩时长', exact: true });
      await dialog.getByLabel('累计时长（小时）', { exact: true }).fill('1.25');
      await dialog.getByRole('button', { name: '保存', exact: true }).click();
      assert.equal(snapshot().items.find(row => row.id === 'multi').playtimeMinutes, 75);
      await closeDetail(); await navigate('游戏'); await advanced();
      await page.locator('.subtype-row').filter({ hasText: '平台' }).getByRole('button', { name: 'PS5', exact: true }).click();
      assert.deepEqual(await galleryTitles(), ['查看多平台游戏详情']);
      await clearFilters();
      await page.locator('#library-advanced-filters').getByRole('button', { name: '只看喜欢', exact: true }).click();
      assert.deepEqual(await galleryTitles(), ['查看多平台游戏详情']); await clearFilters();
    });

    await check('同名标签分组筛选与重命名限定分组和板块', async () => {
      const group = page.locator('.game-filter-group.tag-type--gameplay');
      await group.locator('.tag-filter').filter({ hasText: '同名' }).click();
      assert.deepEqual(await galleryTitles(), ['查看多平台游戏详情']); await clearFilters();
      await page.locator('.game-filter-group.tag-type--scenario .tag-filter').filter({ hasText: '同名' }).click();
      assert.deepEqual(await galleryTitles(), ['查看场景同名游戏详情']); await clearFilters();
      await page.getByRole('button', { name: '标签管理', exact: true }).click();
      const manager = page.getByRole('dialog', { name: '管理标签', exact: true });
      await manager.locator('.manager-tag-group.tag-type--gameplay').getByRole('button', { name: '重命名同名', exact: true }).click();
      await manager.getByLabel('标签新名称', { exact: true }).fill('玩法限定');
      await manager.getByRole('button', { name: '确认', exact: true }).click();
      await manager.getByRole('button', { name: '完成', exact: true }).click();
      const saved = snapshot();
      assert.deepEqual(saved.items.find(row => row.id === 'multi').gameTags.gameplay, ['玩法限定']);
      assert.deepEqual(saved.items.find(row => row.id === 'multi').gameTags.theme, ['同名']);
      assert.deepEqual(saved.items.find(row => row.id === 'scenario').gameTags.scenario, ['同名']);
      assert.ok(saved.items.find(row => row.id === 'new').tags.includes('同名'));
      await navigate('书籍'); await advanced();
      await page.getByLabel('查找筛选标签', { exact: true }).fill('标签22');
      await page.locator('.filter-tags .tag-filter').filter({ hasText: '标签22' }).click();
      assert.deepEqual(await galleryTitles(), ['查看标签很多的书详情']); await clearFilters();
    });

    await check('年月和具体日体验记录增改删、详情日期排序与关闭重开持久化', async () => {
      await navigate('游戏'); await openWork('多平台游戏');
      await page.getByRole('button', { name: '添加记录', exact: true }).click();
      let dialog = page.getByRole('dialog', { name: '添加体验记录', exact: true });
      await dialog.getByLabel(/^日期精度/).selectOption('month');
      await dialog.getByLabel('实际体验日期', { exact: true }).fill('2025-06');
      await dialog.getByLabel(/^记录类型/).selectOption('started');
      await dialog.getByLabel(/^体验内容/).fill('月份精度体验');
      await dialog.getByRole('button', { name: '保存记录', exact: true }).click();
      await page.getByRole('button', { name: '添加记录', exact: true }).click();
      dialog = page.getByRole('dialog', { name: '添加体验记录', exact: true });
      await dialog.getByLabel(/^日期精度/).selectOption('month');
      await dialog.getByLabel('实际体验日期', { exact: true }).fill('2025-07');
      await dialog.getByLabel(/^日期精度/).selectOption('day');
      assert.equal(await dialog.getByLabel('实际体验日期', { exact: true }).inputValue(), '', '月份精度切换为具体日不得自动编造1日');
      await dialog.getByLabel('实际体验日期', { exact: true }).fill('2025-07-04');
      await dialog.getByLabel(/^记录类型/).selectOption('completed');
      await dialog.getByLabel(/^体验内容/).fill('具体日期体验');
      await dialog.getByLabel('本次时长（分钟，可留空）', { exact: true }).fill('17');
      await dialog.getByRole('button', { name: '保存记录', exact: true }).click();
      await page.getByRole('button', { name: '编辑2025-06体验记录', exact: true }).click();
      dialog = page.getByRole('dialog', { name: '编辑体验记录', exact: true });
      assert.equal(await dialog.getByLabel(/^日期精度/).inputValue(), 'month');
      await dialog.getByLabel(/^体验内容/).fill('月份体验已修改');
      await dialog.getByRole('button', { name: '保存记录', exact: true }).click();
      assert.equal(snapshot().items.find(row => row.id === 'multi').playtimeMinutes, 75);
      assert.deepEqual(await page.locator('.experience-list .experience-entry time').allTextContents(), ['2025-07-04', '2025-06']);
      assert.match(await page.locator('.experience-entry').filter({ has: page.locator('time', { hasText: '2025-06' }) }).innerText(), /月份体验已修改/);
      await closeDetail(); await openWork('多平台游戏');
      assert.deepEqual(await page.locator('.experience-list .experience-entry time').allTextContents(), ['2025-07-04', '2025-06']);
      const preservedEntries = snapshot().items.find(row => row.id === 'multi').experienceEntries;
      assert.equal(preservedEntries.find(entry => entry.date === '2025-06').note, '月份体验已修改');
      assert.equal(preservedEntries.find(entry => entry.date === '2025-07-04').minutes, 17);
      await page.getByRole('button', { name: '删除2025-06体验记录', exact: true }).click();
      assert.equal(snapshot().items.find(row => row.id === 'multi').experienceEntries.length, 1);
      assert.deepEqual(await page.locator('.experience-list .experience-entry time').allTextContents(), ['2025-07-04']);
      await closeDetail(); await openWork('多平台游戏');
      assert.deepEqual(await page.locator('.experience-list .experience-entry time').allTextContents(), ['2025-07-04']);
      await closeDetail();
    });

    await check('Steam名称检索到详情、重复预览、合并保留个人记录并新建作品', async () => {
      const before = snapshot().items.find(row => row.id === 'multi');
      let review = await metadataLookup('确定性搜索');
      assert.equal(await review.getByRole('radio', { name: /合并到「多平台游戏」/ }).isChecked(), true);
      await captureEvidence('features-metadata.png');
      await finishMetadata(review, false);
      let saved = snapshot().items.find(row => row.id === 'multi');
      assert.deepEqual(saved.platforms, ['Switch', 'PS5', 'Steam']);
      assert.equal(saved.title, before.title); assert.equal(saved.impression, before.impression);
      assert.equal(saved.playtimeMinutes, before.playtimeMinutes); assert.equal(saved.gamePlayState, before.gamePlayState);
      assert.equal(saved.favorite, before.favorite); assert.deepEqual(saved.experienceEntries, before.experienceEntries);
      assert.equal(saved.creator, 'Fixture Developer'); assert.ok(saved.coverUrl.startsWith('data:image/jpeg;base64,'));
      assert.equal(saved.externalIds.filter(ref => ref.provider === 'steam' && ref.id === '100').length, 1);
      await closeDetail();
      review = await metadataLookup('确定性搜索', 1); await finishMetadata(review, true);
      saved = snapshot().items.find(row => row.externalIds?.some(ref => ref.provider === 'steam' && ref.id === '200'));
      assert.equal(saved.title, '全新资料游戏'); assert.equal(saved.status, 'want'); assert.equal(saved.year, '2024');
      await closeDetail();
    });

    await check('豆瓣链接识别图书与番剧，非法来源失败后仍能正常使用', async () => {
      let review = await metadataLookup('https://book.douban.com/subject/300/?from=test'); await finishMetadata(review, true); await closeDetail();
      review = await metadataLookup('https://movie.douban.com/subject/400/'); await finishMetadata(review, true); await closeDetail();
      const saved = snapshot();
      assert.equal(saved.items.find(row => row.title === '豆瓣测试图书').category, 'book');
      assert.equal(saved.items.find(row => row.title === '豆瓣测试图书').originalTitle, 'Fixture Book');
      assert.equal(saved.items.find(row => row.title === '豆瓣测试番剧').category, 'screen');
      assert.equal(saved.items.find(row => row.title === '豆瓣测试番剧').subcategory, '番剧');
      await page.getByRole('button', { name: '检索与导入', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '从来源收录', exact: true });
      await dialog.getByLabel('游戏名称或作品链接', { exact: true }).fill('http://127.0.0.1/private');
      await dialog.getByRole('button', { name: '读取资料', exact: true }).click();
      await dialog.getByRole('alert').waitFor();
      await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
      await page.getByRole('button', { name: '收录作品', exact: true }).first().click();
      await page.getByRole('dialog', { name: '收录新作品', exact: true }).getByRole('button', { name: '取消', exact: true }).click();
      await navigate('书籍');
      assert.deepEqual((await galleryTitles()).sort(), ['查看标签很多的书详情', '查看豆瓣测试图书详情'].sort());
      await captureEvidence('features-books.png');
      await navigate('影视');
      assert.deepEqual(await galleryTitles(), ['查看豆瓣测试番剧详情']);
      await captureEvidence('features-screen.png');
      await navigate('音乐');
      assert.equal(await page.locator('.media-gallery .media-card').count(), 0);
      await page.getByRole('heading', { name: '这个空间还是空的', exact: true }).waitFor();
      await navigate('游戏');
      assert.equal(await page.locator('.media-gallery .media-card').count(), 4);
      const exported = await exportSnapshot(); assert.deepEqual(exported.futureRoot, fixtures.futureRoot);
      assert.equal(exported.items.length, 7);
      await captureEvidence('features-games.png');
    });
    requests.push(...await app.evaluate(() => globalThis.__qiyuFeatureRequests));
    assert.ok(requests.length >= 10);
    assert.ok(requests.every(request => request.credentials === 'omit' && request.redirect === 'manual'));
    assert.ok(requests.every(request => !request.url.includes('127.0.0.1')));
    assert.deepEqual(pageErrors, []);
  } catch (error) {
    failure = { stage, message: error.message, stack: error.stack };
    console.error(error);
    if (page && !page.isClosed()) {
      await captureEvidence('features-failure.png');
      try { fs.writeFileSync(path.join(evidence, prefix + 'features-failure.html'), await page.content()); } catch { /* Retain the original failure. */ }
    }
    if (app) try { requests.push(...await app.evaluate(() => globalThis.__qiyuFeatureRequests ?? [])); } catch { /* Process may have failed. */ }
    process.exitCode = 1;
  } finally {
    if (conflictRestorationRaw !== undefined) fs.writeFileSync(dataFile, conflictRestorationRaw);
    if (app) {
      if (failure) try { await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }); } catch { /* This test process may already have exited. */ }
      try { await app.close(); } catch { /* Only this isolated launched instance is closed. */ }
    }
    const report = { passed: !failure, packaged, executablePath, checks, failure, pageErrors, requests, screenshots, screenshotErrors, dataDirectory, timestamp: new Date().toISOString() };
    fs.writeFileSync(path.join(evidence, prefix + 'features-validation.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    // Keep fixtures and backups in the isolated temporary directory for diagnosis.
  }
})();
