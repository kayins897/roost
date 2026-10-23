const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { _electron: electron } = require('playwright');

const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const executablePath = process.argv[2] || path.join(root, 'node_modules/electron/dist/electron.exe');
const packaged = Boolean(process.argv[2]);
const prefix = (process.argv[3] || (packaged ? 'packaged' : 'source')).replace(/[^a-z0-9-]/gi, '') + '-';
const evidence = path.join(root, 'evidence', `state-v${version.replaceAll('.', '')}`);
const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-abandoned-'));
const dataFile = path.join(dataDirectory, 'library.json');
const previousFile = path.join(dataDirectory, 'library.previous.json');
const env = { ...process.env, QIYU_E2E: '1', QIYU_TEST_DATA_DIR: dataDirectory };
delete env.ELECTRON_RUN_AS_NODE;

const item = (id, title, extra = {}) => ({
  id, title, originalTitle: `Original ${id}`, category: 'game', subcategory: 'Steam', platforms: ['Steam'],
  creator: '隔离验证开发者', year: '2025', status: 'active', gamePlayState: 'playing', playtimeMinutes: 157,
  tags: ['探索', '太空', '私人标签'], gameTags: { gameplay: ['探索'], theme: ['太空'], scenario: [], other: ['私人标签'], futureGroup: ['未知标签分组'] },
  impression: `保留 ${title} 的印象`, favorite: true, artwork: 'outer',
  sourceUrl: `https://store.steampowered.com/app/${id === 'direct' ? '1000' : '1001'}/`,
  externalIds: [{ provider: 'steam', id: `fixture-${id}` }],
  experienceEntries: [{ id: `entry-${id}`, date: '2025-06', kind: 'note', note: '不可覆盖的个人体验', minutes: 17, futureEntry: { untouched: true } }],
  futureItem: { untouched: id }, createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
  ...extra,
});
// Normalise omitted optional fields exactly as the on-disk fixture will represent them.
const fixture = JSON.parse(JSON.stringify({ schemaVersion: 1, futureRoot: { untouched: '保留根扩展' }, items: [
  item('direct', '独立状态样例'),
  item('batch-a', '批量样例 A', { status: 'finished', gamePlayState: 'cleared', playtimeMinutes: 937, artwork: 'hades' }),
  item('batch-b', '批量样例 B', { gamePlayState: 'ongoing', playtimeMinutes: 820, artwork: 'dave' }),
  item('paused', '原有暂时搁置', { status: 'paused', gamePlayState: undefined, playtimeMinutes: 601, artwork: 'hollow' }),
  item('want', '原有待体验', { status: 'want', gamePlayState: 'want', playtimeMinutes: 0, artwork: 'nier' }),
  item('legacy-replaying', '旧反复游玩记录', { gamePlayState: 'replaying', playtimeMinutes: 333, artwork: 'outer' }),
  item('legacy-ongoing', '旧长期游玩记录', { gamePlayState: 'ongoing', playtimeMinutes: 444, artwork: 'dave' }),
  item('book', '非游戏样例', { category: 'book', subcategory: '严肃文学', status: 'paused', gamePlayState: undefined, platforms: undefined, gameTags: undefined }),
] }));
const baseline = JSON.stringify(fixture, null, 2);
fs.mkdirSync(evidence, { recursive: true });
fs.writeFileSync(dataFile, baseline);
const report = { passed: false, version, executablePath, packaged, isolatedDataOnly: true, dataDirectory, checks: [], screenshots: [], pageErrors: [], rendererRemoteRequests: [], integrity: [], processes: [], cardPresentation: [], notes: [
  '只读写 QIYU_E2E + QIYU_TEST_DATA_DIR 指向的 mkdtemp 独立目录；不访问真实 APPDATA、用户收藏或已打开的用户窗口。',
  '真实 Electron、真实本机存储和真实导出下载；只关闭本脚本启动的实例。',
  '本测试专注新增已放弃状态；完整写入失败、重复导入和 Steam 同步保护由既有维护脚本覆盖。',
  '持续游玩合并入口兼容旧 replaying / ongoing；只读展示、筛选和编辑无关字段不得暗中迁移旧状态。',
] };
const raw = () => fs.readFileSync(dataFile, 'utf8');
const snapshot = () => JSON.parse(raw());
const byId = (value, id) => value.items.find(entry => entry.id === id);
const digest = value => createHash('sha256').update(value).digest('hex');
let app, page, stage = '初始化', failure;

async function check(name, work) { stage = name; await work(); report.checks.push(name); console.log(`PASS ${name}`); }
function unchanged(name, expected) {
  const actual = raw();
  report.integrity.push({ name, same: actual === expected, beforeSha256: digest(expected), afterSha256: digest(actual) });
  assert.equal(actual, expected, name);
}
function preserve(before, after, ids) {
  const withoutItems = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'items'));
  assert.deepEqual(withoutItems(after), withoutItems(before), '未知根字段与 schema 不变');
  assert.deepEqual(after.items.map(entry => entry.id), before.items.map(entry => entry.id), '不新增、删除或重排收藏');
  for (const original of before.items) {
    const next = byId(after, original.id);
    if (!ids.includes(original.id)) { assert.deepEqual(next, original, `未选择 ${original.id} 逐字段保留`); continue; }
    const stable = value => Object.fromEntries(Object.entries(value).filter(([key]) => !['status', 'gamePlayState', 'updatedAt'].includes(key)));
    assert.deepEqual(stable(next), stable(original), `${original.id} 的时长、印象、历史与未知字段全部保留`);
    assert.notEqual(next.updatedAt, original.updatedAt, '状态变更刷新更新时间');
  }
}
async function launch() {
  app = await electron.launch({ executablePath, args: packaged ? [] : [root], env, timeout: 45000 });
  const processId = app.process().pid;
  report.processes.push({ processId, closed: false });
  page = await app.firstWindow(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('request', request => { if (/^https?:/i.test(request.url())) report.rendererRemoteRequests.push(request.url()); });
  page.on('dialog', dialog => { void dialog.accept().catch(error => { if (!error.message.includes('No dialog is showing')) report.pageErrors.push(error.message); }); });
  await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
  const info = await page.evaluate(() => window.qiyuDesktop.getInfo());
  assert.equal(info.dataDirectory, dataDirectory, '必须连接独立测试库');
  assert.equal(info.version, version);
  // Keep this hidden fixture's compositor current; the native visibility signal still pauses its ambient scene.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
}
async function close() {
  if (!app) return;
  const processId = app.process().pid;
  await app.close(); app = undefined;
  report.processes.find(entry => entry.processId === processId).closed = true;
}
const card = title => page.getByRole('button', { name: `查看${title}详情`, exact: true });
const detail = () => page.locator('.detail-panel');
const tabs = () => page.locator('.game-status-tabs');
const toolbar = () => page.getByRole('region', { name: '批量选择游戏', exact: true });
const batch = () => page.getByRole('dialog', { name: '批量编辑游戏', exact: true });
async function openWork(title) { await card(title).click(); await detail().getByRole('heading', { name: title, exact: true }).waitFor(); }
async function closeDetail() { await detail().locator('.detail-toolbar').getByRole('button', { name: '关闭', exact: true }).click(); }
async function titles() { return page.locator('.media-gallery .media-card .card-name').allTextContents(); }
async function capture(name) {
  await page.evaluate(() => document.fonts.ready);
  const filename = `${prefix}${name}.png`;
  // Hidden Electron captures can retain a preceding frame. Show only this isolated
  // fixture without taking focus, then hide it again after the native capture.
  const wasVisible = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const visible = window.isVisible();
    if (!visible) window.showInactive();
    return visible;
  });
  try {
    await page.waitForTimeout(350);
    const png = await app.evaluate(async ({ BrowserWindow }) => {
      const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage();
      if (image.isEmpty()) throw new Error('独立测试窗口截图为空');
      return image.toPNG().toString('base64');
    });
    fs.writeFileSync(path.join(evidence, filename), Buffer.from(png, 'base64'));
  } finally {
    if (!wasVisible) await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
  }
  report.screenshots.push(filename);
}
async function expectAbandonedCard(title) {
  const value = await card(title).evaluate(element => {
    const time = element.querySelector('.card-playtime');
    const state = element.querySelector('.card-game-state');
    const icon = state?.querySelector('svg');
    const color = state && getComputedStyle(state).color;
    const probe = document.createElement('span'); probe.style.color = 'var(--danger)'; element.appendChild(probe);
    const semanticRose = getComputedStyle(probe).color; probe.remove();
    return { time: time?.textContent, state: state?.textContent, stateClass: state?.className, iconClass: icon?.getAttribute('class'), color, semanticRose,
      timeFirst: !!(time && state && (time.compareDocumentPosition(state) & Node.DOCUMENT_POSITION_FOLLOWING)), timeColor: time && getComputedStyle(time).color };
  });
  assert.equal(value.state, '已放弃'); assert.match(value.stateClass, /game-state--abandoned/);
  assert.match(value.iconClass, /lucide-circle-x/);
  assert.equal(value.color, value.semanticRose, '卡片文字和图标使用玫瑰语义色');
  const channels = value.color.match(/[\d.]+/g).map(Number);
  assert.ok(channels[0] > channels[1] && channels[0] > channels[2], '已放弃不是灰白色');
  assert.notEqual(value.color, value.timeColor); assert.equal(value.timeFirst, true, '时长在状态之前');
  report.cardPresentation.push({ title, ...value });
}
async function exportSnapshot() {
  const destination = path.join(dataDirectory, 'abandoned-export.json');
  await app.evaluate(({ BrowserWindow }, file) => { BrowserWindow.getAllWindows()[0].webContents.session.once('will-download', (_event, item) => item.setSavePath(file)); }, destination);
  await page.getByRole('button', { name: '导出备份', exact: true }).click();
  for (let index = 0; index < 150; index++) {
    try { return JSON.parse(fs.readFileSync(destination, 'utf8')); } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  throw new Error('原生备份下载未完成');
}

(async () => {
  let beforeBatchRaw;
  try {
    await launch();
    await check('新增独立状态入口，首次读取和原有暂停/待体验不改库', async () => {
      await tabs().getByRole('button', { name: '已放弃', exact: true }).waitFor();
      assert.equal(await page.locator('.media-gallery .media-card').count(), 7);
      assert.equal(await card('原有暂时搁置').locator('.card-game-state').innerText(), '暂时搁置');
      assert.equal(await card('原有待体验').locator('.card-game-state').innerText(), '待体验');
      unchanged('启动浏览原始字节不变', baseline);
      assert.equal(fs.existsSync(previousFile), false);
    });
    await check('详情设已放弃，玫瑰图标与时长优先，个人资料和首次备份完整', async () => {
      const before = snapshot();
      await openWork('独立状态样例');
      await detail().locator('.game-state-options').getByRole('button', { name: '已放弃', exact: true }).click();
      assert.equal(byId(snapshot(), 'direct').gamePlayState, 'abandoned');
      assert.equal(byId(snapshot(), 'direct').status, 'paused', '旧通用状态只作回退，独立游戏状态保存 abandoned');
      preserve(before, snapshot(), ['direct']);
      assert.equal(fs.readFileSync(previousFile, 'utf8'), baseline);
      const daily = fs.readdirSync(path.join(dataDirectory, 'backups')).filter(name => /^daily-\d{4}-\d{2}-\d{2}\.json$/.test(name));
      assert.equal(daily.length, 1); assert.equal(fs.readFileSync(path.join(dataDirectory, 'backups', daily[0]), 'utf8'), baseline);
      await closeDetail(); await expectAbandonedCard('独立状态样例');
      assert.equal(await card('独立状态样例').locator('.card-playtime strong').innerText(), '2.6 h');
      await capture('single-abandoned');
    });
    await check('已放弃与暂时搁置筛选互斥，待体验继续保留', async () => {
      const before = raw();
      await tabs().getByRole('button', { name: '已放弃', exact: true }).click();
      assert.deepEqual(await titles(), ['独立状态样例']);
      await tabs().getByRole('button', { name: '暂时搁置', exact: true }).click();
      assert.deepEqual(await titles(), ['原有暂时搁置']);
      await tabs().getByRole('button', { name: '待体验', exact: true }).click();
      assert.deepEqual(await titles(), ['原有待体验']);
      await tabs().getByRole('button', { name: '全部游戏', exact: true }).click();
      unchanged('仅状态筛选不写入库', before);
    });
    await check('作品编辑器可选已放弃并随时恢复其他状态，不丢分钟与记录', async () => {
      let before = snapshot();
      await openWork('独立状态样例');
      await detail().getByRole('button', { name: '编辑作品', exact: true }).click();
      let editor = page.getByRole('dialog', { name: '编辑作品', exact: true });
      assert.equal(await editor.getByLabel(/游玩状态/).inputValue(), 'abandoned');
      assert.equal(await editor.getByRole('option', { name: '已放弃', exact: true }).count(), 1);
      await editor.getByLabel(/游玩状态/).selectOption('playing');
      await editor.getByRole('button', { name: '保存修改', exact: true }).click();
      assert.equal(byId(snapshot(), 'direct').gamePlayState, 'playing');
      assert.equal(byId(snapshot(), 'direct').status, 'active');
      preserve(before, snapshot(), ['direct']);
      before = snapshot();
      await detail().getByRole('button', { name: '编辑作品', exact: true }).click();
      editor = page.getByRole('dialog', { name: '编辑作品', exact: true });
      await editor.getByLabel(/游玩状态/).selectOption('abandoned');
      await editor.getByRole('button', { name: '保存修改', exact: true }).click();
      assert.equal(byId(snapshot(), 'direct').gamePlayState, 'abandoned');
      preserve(before, snapshot(), ['direct']);
      await closeDetail(); await expectAbandonedCard('独立状态样例');
    });
    await check('批量两件已放弃预览不写，确认仅修改选择并精确保留 previous', async () => {
      beforeBatchRaw = raw(); const before = snapshot(); const previousBefore = fs.readFileSync(previousFile, 'utf8');
      await page.getByRole('button', { name: '批量编辑游戏', exact: true }).click();
      await page.getByRole('button', { name: '选择批量样例 A', exact: true }).click();
      await page.getByRole('button', { name: '选择批量样例 B', exact: true }).click();
      await toolbar().getByRole('button', { name: '编辑所选', exact: true }).click();
      await batch().getByRole('combobox', { name: '批量游玩状态', exact: true }).selectOption('abandoned');
      await batch().getByRole('button', { name: '预览修改', exact: true }).click();
      assert.equal(await batch().locator('.batch-preview-item').count(), 2);
      assert.equal(await batch().locator('.batch-state-summary').filter({ hasText: '→ 已放弃' }).count(), 2);
      unchanged('两件已放弃预览不写库', beforeBatchRaw);
      assert.equal(fs.readFileSync(previousFile, 'utf8'), previousBefore);
      await capture('batch-abandoned-preview');
      await batch().getByRole('button', { name: '确认更新 2 款', exact: true }).click();
      await batch().waitFor({ state: 'detached' });
      const after = snapshot(); preserve(before, after, ['batch-a', 'batch-b']);
      for (const id of ['batch-a', 'batch-b']) { assert.equal(byId(after, id).gamePlayState, 'abandoned'); assert.equal(byId(after, id).status, 'paused'); }
      assert.equal(fs.readFileSync(previousFile, 'utf8'), beforeBatchRaw);
      assert.deepEqual(byId(after, 'paused'), byId(fixture, 'paused'));
      assert.deepEqual(byId(after, 'want'), byId(fixture, 'want'));
      assert.deepEqual(byId(after, 'book'), byId(fixture, 'book'));
    });
    await check('关闭重开持久化，独立状态筛选、原生导出和备份结构完整', async () => {
      const before = raw(); const expected = snapshot();
      await close(); await launch();
      unchanged('真实新进程重开不改收藏字节', before);
      await tabs().getByRole('button', { name: '已放弃', exact: true }).click();
      assert.deepEqual((await titles()).sort(), ['独立状态样例', '批量样例 A', '批量样例 B'].sort());
      await tabs().getByRole('button', { name: '暂时搁置', exact: true }).click();
      assert.deepEqual(await titles(), ['原有暂时搁置']);
      await tabs().getByRole('button', { name: '全部游戏', exact: true }).click();
      for (const title of ['独立状态样例', '批量样例 A', '批量样例 B']) await expectAbandonedCard(title);
      const exported = await exportSnapshot();
      assert.equal(exported.schemaVersion, 1); assert.deepEqual(exported.items, expected.items); assert.deepEqual(exported.futureRoot, expected.futureRoot);
      assert.equal(typeof exported.exportedAt, 'string');
      unchanged('备份导出不改库', before);
      assert.equal(fs.readFileSync(previousFile, 'utf8'), beforeBatchRaw);
      await capture('reopened-abandoned-cards');
      assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.rendererRemoteRequests, []);
    });
    await check('持续游玩统一入口兼容两种旧值，筛选不写库且仅改标题保留 replaying', async () => {
      const beforeRaw = raw(); const before = snapshot();
      const expectedTabs = ['全部游戏', '待体验', '游玩中', '已通关', '持续游玩', '暂时搁置', '已放弃'];
      assert.deepEqual(await tabs().getByRole('button').allTextContents(), expectedTabs, '只有六个独立游戏状态');
      for (const oldLabel of ['反复游玩', '长期游玩']) assert.equal(await tabs().getByRole('button', { name: oldLabel, exact: true }).count(), 0);
      assert.equal(await tabs().getByRole('button', { name: '持续游玩', exact: true }).count(), 1);
      await tabs().getByRole('button', { name: '持续游玩', exact: true }).click();
      assert.deepEqual((await titles()).sort(), ['旧反复游玩记录', '旧长期游玩记录'].sort());
      for (const title of ['旧反复游玩记录', '旧长期游玩记录']) assert.equal(await card(title).locator('.card-game-state').innerText(), '持续游玩');
      unchanged('持续游玩筛选同时命中旧值且原始字节不变', beforeRaw);
      assert.equal(byId(snapshot(), 'legacy-replaying').gamePlayState, 'replaying');
      assert.equal(byId(snapshot(), 'legacy-ongoing').gamePlayState, 'ongoing');

      await openWork('旧反复游玩记录');
      const options = detail().locator('.game-state-options');
      assert.equal(await options.getByRole('button').count(), 6);
      assert.equal(await options.getByRole('button', { name: '持续游玩', exact: true }).count(), 1);
      assert.match(await options.getByRole('button', { name: '持续游玩', exact: true }).getAttribute('class'), /is-selected/);
      for (const oldLabel of ['反复游玩', '长期游玩']) assert.equal(await options.getByRole('button', { name: oldLabel, exact: true }).count(), 0);
      await detail().getByRole('button', { name: '编辑作品', exact: true }).click();
      const editor = page.getByRole('dialog', { name: '编辑作品', exact: true });
      assert.equal(await editor.getByLabel(/游玩状态/).inputValue(), 'ongoing', '编辑器显示合并后的规范选项');
      assert.equal(await editor.getByRole('option', { name: '持续游玩', exact: true }).count(), 1);
      for (const oldLabel of ['反复游玩', '长期游玩']) assert.equal(await editor.getByRole('option', { name: oldLabel, exact: true }).count(), 0);
      unchanged('打开旧 replaying 编辑器不暗中迁移库', beforeRaw);
      const renamedTitle = '旧反复游玩记录（仅改标题）';
      await editor.getByLabel(/作品名称/).fill(renamedTitle);
      await editor.getByRole('button', { name: '保存修改', exact: true }).click();
      await detail().getByRole('heading', { name: renamedTitle, exact: true }).waitFor();
      const after = snapshot(); const edited = byId(after, 'legacy-replaying');
      assert.equal(edited.gamePlayState, 'replaying', '未触碰状态时必须保留原始 replaying');
      assert.equal(edited.status, 'active'); assert.notEqual(edited.updatedAt, byId(before, 'legacy-replaying').updatedAt);
      const expected = JSON.parse(JSON.stringify(before));
      Object.assign(byId(expected, 'legacy-replaying'), { title: renamedTitle, updatedAt: edited.updatedAt });
      assert.deepEqual(after, expected, '仅标题与更新时间变化，所有状态、分钟、历史、个人与未知字段完整保留');
      assert.equal(fs.readFileSync(previousFile, 'utf8'), beforeRaw, '改标题前完整旧版本进入 previous');
      await closeDetail();
      const afterRaw = raw();
      await tabs().getByRole('button', { name: '持续游玩', exact: true }).click();
      assert.deepEqual((await titles()).sort(), [renamedTitle, '旧长期游玩记录'].sort(), '改标题后仍同时出现在持续游玩筛选');
      await tabs().getByRole('button', { name: '全部游戏', exact: true }).click();
      unchanged('标题保存后的展示与筛选不再次写库', afterRaw);
    });
    report.passed = true;
  } catch (error) { failure = error; report.failure = { stage, message: error.message, stack: error.stack }; console.error(error); }
  finally {
    if (app) {
      if (failure) try { await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }); } catch { /* Only this isolated test instance may have exited. */ }
      await close().catch(error => { report.passed = false; report.cleanupError = error.message; });
    }
    if (report.pageErrors.length || report.rendererRemoteRequests.length || report.processes.some(entry => !entry.closed)) report.passed = false;
    report.stage = stage; report.timestamp = new Date().toISOString();
    fs.writeFileSync(path.join(evidence, `${prefix}validation.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, version, checks: report.checks.length, screenshots: report.screenshots.length, report: path.join(evidence, `${prefix}validation.json`), failure: report.failure }));
    if (!report.passed) process.exitCode = 1;
  }
})();
