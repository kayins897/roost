const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');

// Serve an actual production build. The optional override lets an isolated test
// worktree inspect the UI author's build without copying source or private data.
const root = path.resolve(__dirname, '..');
const dist = path.resolve(process.env.QIYU_DETAIL_DIST || path.join(root, 'dist'));
const output = path.join(root, 'evidence', 'library-refinement');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const sha = value => createHash('sha256').update(value).digest('hex');
const report = {
  passed: false, version, isolatedDataOnly: true, realUserDataAccessed: false,
  checks: [], screenshots: [], layouts: [], covers: [], integrity: [], errors: [], blockedRequests: [],
  notes: [
    '全新无持久化浏览器上下文，仅 loopback dist 和现场生成的合成 PNG；不读取 AppData、旧收藏或外部图片。',
    'browser 运行真实 LocalStorageRepository；bridge 运行真实 DesktopRepository 加内存桥接，不替代 Electron 原生文件保存测试。',
    '图片完整性以天然比例、contain、内容边界及四角色块截图共同验证；截图仍需目视审查。',
  ],
};
const work = (id, title, extra = {}) => ({
  id, title, category: 'game', subcategory: 'Steam', platforms: ['Steam'], creator: '合成作者', year: '2026',
  status: 'want', gamePlayState: 'want', playEngagement: 'planned', completion: 'cleared',
  experienceStatus: 'unplayed', playtimeMinutes: 73, completionCount: 2, playPriority: 'A', personalGrade: 'S',
  tags: [], gameTags: { gameplay: [], theme: [], scenario: [], other: [] },
  impression: '保留一句话印象', review: '合成长文第一段\n第二段保留尾空格  ', favorite: false, artwork: 'outer',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', futureItem: { keep: id }, ...extra,
});
const fixture = { schemaVersion: 1, futureRoot: { keep: true }, items: [
  work('portrait', '便当纵图', { fixtureSize: [240, 360] }),
  work('landscape', '便当横图', { fixtureSize: [480, 270], completion: 'not-applicable', experienceStatus: 'experienced', experienceCategory: 'long-term' }),
  work('zero', '便当方图零值', { fixtureSize: [320, 320], playtimeMinutes: 0, completionCount: 0, completion: 'not-cleared' }),
  work('unknown', '便当无封面未知值', { playtimeMinutes: undefined, completionCount: undefined, completion: 'unknown', experienceStatus: 'experienced' }),
] };
const cards = ['.bento-cover', '.bento-experience', '.bento-stats', '.bento-impression', '.bento-footprint', '.bento-review'];
fixture.items.push(...['B','A','S','SS','SSS'].map(grade => work('grade-'+grade, '反光'+grade, {fixtureSize:[240,360], experienceStatus:'experienced',experienceCategory:'replayable',personalGrade:grade,completion:'unknown'})),work('hidden','隐藏样例',{hiddenAt:'2026-01-01T00:00:00.000Z'}),work('trash','回收样例',{removedAt:'2026-01-01T00:00:00.000Z'}));
let browser, context, page, server, base, mode, stage;
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const key = () => mode === 'bridge' ? 'qiyu.test.detail-bento' : 'qiyu.library.v1';
const raw = () => page.evaluate(key => localStorage.getItem(key), key());
const data = async () => JSON.parse(await raw());
const item = async id => (await data()).items.find(value => value.id === id);
const saves = () => page.evaluate(() => window.__bentoAttempts.length);
const fail = value => page.evaluate(value => { window.__bentoFail = value; }, value);
async function check(name, run) { stage = `${mode}: ${name}`; await run(); report.checks.push(stage); console.log(`PASS ${stage}`); }
async function capture(name, target = page) {
  await page.evaluate(() => document.fonts.ready);
  const file = `${mode}-${name}.png`;
  await target.screenshot({ path: path.join(output, file), animations: 'disabled', caret: 'hide' });
  report.screenshots.push(file);
}
async function unchanged(name, before, attempts) {
  const after = await raw();
  report.integrity.push({ mode, name, unchanged: before === after, beforeSha256: sha(before), afterSha256: sha(after) });
  assert.equal(after, before, name);
  if (attempts !== undefined) assert.equal(await saves(), attempts, `${name}：不得尝试保存`);
}
function preserve(before, after, changedId, fields) {
  assert.deepEqual(after.futureRoot, before.futureRoot);
  for (const original of before.items) {
    const updated = after.items.find(value => value.id === original.id);
    assert.ok(updated, original.id);
    for (const field of new Set([...Object.keys(original), ...Object.keys(updated)])) {
      if (original.id !== changedId || !fields.includes(field)) assert.deepEqual(updated[field], original[field], `${original.id}.${field} 必须保留`);
    }
  }
}
async function open(id) {
  const title = fixture.items.find(value => value.id === id).title;
  await button(`查看${title}详情`).click();
  const detail = page.getByRole('dialog', { name: `${title}详情`, exact: true });
  await detail.waitFor(); return detail;
}
async function close(detail) { await button('关闭详情', detail).click(); await detail.waitFor({ state: 'hidden' }); }
async function expand(detail, axis) {
  const toggle = button(axis === 'engagement' ? '更改体验分类' : '更改通关进度', detail);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await toggle.click(); assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  const options = detail.locator(axis === 'engagement' ? '.game-state-options' : '.completion-options');
  assert.equal(await options.isVisible(), true); return options;
}
async function layout(detail, name) {
  const geometry = await detail.evaluate(element => {
    const box = element.getBoundingClientRect();
    return {
      width: innerWidth, height: innerHeight, pageWidth: document.documentElement.scrollWidth,
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
      containers: [element, ...element.querySelectorAll('.detail-bento,.bento-cover,.bento-experience,.bento-stats,.bento-impression,.bento-footprint,.bento-review')]
        .filter(node => node.clientWidth).map(node => ({ name: node.className, width: node.clientWidth, scroll: node.scrollWidth })),
    };
  });
  report.layouts.push({ mode, name, ...geometry });
  const box = geometry.box;
  assert.ok(geometry.pageWidth <= geometry.width + 1, `${name}：页面不得横向溢出`);
  assert.ok(box.x >= -1 && box.x + box.width <= geometry.width + 1 && box.y >= -1 && box.y + box.height <= geometry.height + 1, `${name}：弹窗保持可视区内`);
  assert.ok(Math.abs(box.x + box.width / 2 - geometry.width / 2) < 3 && Math.abs(box.y + box.height / 2 - geometry.height / 2) < 3, `${name}：弹窗居中`);
  for (const value of geometry.containers) assert.ok(value.scroll <= value.width + 1, `${name}：${value.name} 横向溢出 ${JSON.stringify(value)}`);
}
async function verifyCover(detail, id) {
  const expected = fixture.items.find(value => value.id === id).fixtureSize;
  const cover = detail.locator('.bento-cover');
  if (!expected) {
    assert.equal(await cover.locator('img').count(), 0, '未知封面不请求图片');
    assert.equal(await cover.locator('.poster-aura,.poster-lettermark,.poster-copy').count(), 0, '无封面使用简洁占位');
    assert.match(await cover.innerText(), /封面|暂无|未添加/);
    return;
  }
  const img = cover.getByRole('img'); await img.waitFor();
  await img.evaluate(image => image.decode());
  const value = await img.evaluate(image => {
    const rect = image.getBoundingClientRect(), parent = image.closest('.bento-cover').getBoundingClientRect();
    const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
    return {
      natural: [image.naturalWidth, image.naturalHeight], fit: getComputedStyle(image).objectFit,
      width: rect.width, height: rect.height, paintedWidth: image.naturalWidth * scale, paintedHeight: image.naturalHeight * scale,
      inside: rect.x >= parent.x - 1 && rect.right <= parent.right + 1 && rect.y >= parent.y - 1 && rect.bottom <= parent.bottom + 1,
    };
  });
  report.covers.push({ mode, id, ...value });
  assert.deepEqual(value.natural, expected); assert.equal(value.fit, 'contain'); assert.equal(value.inside, true);
  assert.ok(value.paintedWidth <= value.width + 1 && value.paintedHeight <= value.height + 1);
  assert.ok(Math.abs(value.paintedWidth / value.paintedHeight - expected[0] / expected[1]) < .001, '完整保留图像比例');
}
async function prepare(currentMode, viewport = { width: 1440, height: 1100 }) {
  mode = currentMode;
  context = await browser.newContext({ viewport, colorScheme: 'dark', reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.addInitScript(({ fixture, mode, version }) => {
    const key = mode === 'bridge' ? 'qiyu.test.detail-bento' : 'qiyu.library.v1';
    const set = Storage.prototype.setItem;
    if (!localStorage.getItem(key)) {
      for (const item of fixture.items) {
        if (!item.fixtureSize) continue;
        const [width, height] = item.fixtureSize, canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height; const paint = canvas.getContext('2d');
        const sky = paint.createLinearGradient(0, 0, width, height);
        sky.addColorStop(0, '#10273e'); sky.addColorStop(.55, '#416576'); sky.addColorStop(1, '#9c8f83');
        paint.fillStyle = sky; paint.fillRect(0, 0, width, height);
        paint.fillStyle = '#edcba2'; paint.beginPath(); paint.arc(width * .72, height * .27, Math.min(width, height) * .15, 0, Math.PI * 2); paint.fill();
        for (let layer = 0; layer < 3; layer++) {
          paint.fillStyle = ['#2c5360', '#193c4b', '#102d3a'][layer]; paint.beginPath();
          paint.moveTo(0, height); paint.lineTo(0, height * (.6 + layer * .09));
          for (let point = 0; point <= 12; point++) paint.lineTo(width * point / 12, height * (.55 + layer * .12 + Math.sin(point * .69 + layer) * .065));
          paint.lineTo(width, height); paint.closePath(); paint.fill();
        }
        paint.strokeStyle = '#e1cfac'; paint.lineWidth = Math.max(1, width / 180); paint.beginPath();
        paint.moveTo(width * .24, height * .83); paint.bezierCurveTo(width * .7, height * .65, width * .36, height * .7, width * .66, height * .59); paint.stroke();
        paint.fillStyle = '#f1e9d8'; paint.font = `${Math.round(Math.min(width, height) * .07)}px serif`; paint.fillText('THE QUIET HORIZON', width * .09, height * .13);
        paint.font = `${Math.round(Math.min(width, height) * .032)}px sans-serif`; paint.fillText('QIYU  /  SYNTHETIC ORIGINAL ART', width * .09, height * .92);
        paint.strokeStyle = '#e6d6b2'; paint.lineWidth = 2; paint.strokeRect(7, 7, width - 14, height - 14);
        // Four tiny distinct corner markers make cropping visible in evidence.
        [['#ee7670', 0, 0], ['#8bbd9d', width - 10, 0], ['#7aabcf', 0, height - 10], ['#e9cf8b', width - 10, height - 10]].forEach(([color, x, y]) => { paint.fillStyle = color; paint.fillRect(x, y, 10, 10); });
        item.coverUrl = canvas.toDataURL('image/png');
      }
      set.call(localStorage, key, JSON.stringify(fixture));
    }
    set.call(localStorage, 'qiyu.background.v1', JSON.stringify({ enabled: false, fluidEnabled: false, starsEnabled: false }));
    set.call(localStorage, 'qiyu.appearance.v1', JSON.stringify({ mode: 'dark' }));
    window.__bentoFail = false; window.__bentoAttempts = [];
    if (mode === 'bridge') {
      let revision = 'bento-isolated-0', count = 0;
      window.qiyuDesktop = {
        getInfo: () => ({ version, dataDirectory: 'ISOLATED_MEMORY_ONLY', windowVisible: true }),
        loadLibrary: () => ({ ok: true, value: { snapshot: JSON.parse(localStorage.getItem(key)), revision } }),
        saveLibrary: (snapshot, expected) => {
          window.__bentoAttempts.push(JSON.parse(JSON.stringify(snapshot)));
          if (window.__bentoFail) return { ok: false, error: '合成保存失败' };
          if (expected !== revision) return { ok: false, error: '隔离修订冲突' };
          set.call(localStorage, key, JSON.stringify(snapshot)); revision = `bento-isolated-${++count}`;
          return { ok: true, value: { revision } };
        },
        onWindowVisibility: () => () => {},
      };
    } else Storage.prototype.setItem = function(name, value) {
      if (name === key) { window.__bentoAttempts.push(JSON.parse(value)); if (window.__bentoFail) throw new DOMException('合成保存失败', 'QuotaExceededError'); }
      return set.call(this, name, value);
    };
  }, { fixture, mode, version });
  page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.errors.push({ stage, message: error.message }));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (new URL(url).origin === base || url.startsWith('data:')) return route.continue();
    report.blockedRequests.push(url); return route.abort();
  });
  await page.goto(base); await showAll();
}
async function showAll(){const group=page.getByRole('group',{name:'按体验分类筛选',exact:true});for(const label of ['新作开荒','已体验']){const target=button(label,group);if(await target.getAttribute('aria-pressed')!=='true')await target.click();}}
async function suite(value){await prepare(value);
 await check('分类入口、三个主类组合与旧库浏览零写',async()=>{
 const before=await raw(),attempts=await saves(),group=page.getByRole('group',{name:'按体验分类筛选',exact:true});
 assert.equal(await group.getByRole('button').count(),2);assert.equal(await page.getByText('同时选中显示全部',{exact:true}).count(),0);assert.equal(await button('已隐藏').count(),0);assert.equal(await page.locator('.topbar-actions button').count(),0);
 await button('已体验',group).click();assert.equal(await button('新作开荒',group).getAttribute('aria-pressed'),'true');assert.equal(await button('已体验',group).getAttribute('aria-pressed'),'false');
 await button('新作开荒',group).click();assert.equal(await button('新作开荒',group).getAttribute('aria-pressed'),'true');await button('已体验',group).click();await button('新作开荒',group).click();assert.equal(await button('已体验',group).getAttribute('aria-pressed'),'true');
 assert.equal(await button('游玩中',page.getByRole('group',{name:'已体验二级筛选',exact:true})).count(),1);await showAll();await unchanged('浏览与筛选不得规范化旧 long-term',before,attempts);
 });
 await check('详情全分类资格矩阵、无通关进度、事实保留及保存失败',async()=>{
 const detail=await open('landscape');assert.equal(await button('更改通关进度',detail).count(),0);
 const rows=[['playing','游玩中',true,false],['continue','未完待续',true,false],['replayable','新游戏+',true,true],['completed','收官完结',false,true],['put-aside','暂时搁置',false,false],['unclassified','已体验 · 未分类',false,false],['unplayed','新作开荒',true,false]];
 for(const [category,label,priority,rating] of rows){const before=await data();await button('更改体验分类',detail).click();const options=detail.locator('.game-state-options');assert.equal(await options.getByRole('button').count(),7);await button(label,options).click();assert.equal(await detail.getByRole('combobox',{name:'游玩优先级',exact:true}).count(),priority?1:0);assert.equal(await detail.getByRole('combobox',{name:'通关评级',exact:true}).count(),rating?1:0);preserve(before,await data(),'landscape',['experienceStatus','experienceCategory','updatedAt']);}
 await button('更改体验分类',detail).click();await fail(true);await button('新游戏+',detail.locator('.game-state-options')).click();assert.equal((await item('landscape')).experienceStatus,'unplayed');assert.equal(await detail.locator('.game-state-options').isVisible(),true);await fail(false);await button('新游戏+',detail.locator('.game-state-options')).click();await detail.getByRole('combobox',{name:'通关评级',exact:true}).selectOption('SS');assert.equal((await item('landscape')).personalGrade,'SS');assert.equal((await item('landscape')).completion,'not-applicable');await close(detail);
 });
 await check('右键直接游玩中与新游戏+双等级，同值零写',async()=>{
 await button('查看便当纵图详情').click({button:'right'});let menu=page.getByRole('menu',{name:'便当纵图快捷编辑',exact:true});await menu.getByRole('menuitemradio',{name:'游玩中',exact:true}).click();assert.equal((await item('portrait')).experienceCategory,'playing');const before=await raw(),attempts=await saves();await menu.getByRole('menuitemradio',{name:'游玩中',exact:true}).click();await unchanged('同分类点击',before,attempts);await menu.getByRole('menuitemradio',{name:'新游戏+',exact:true}).click();assert.equal(await menu.getByRole('group',{name:'游玩优先级',exact:true}).count(),1);assert.equal(await menu.getByRole('group',{name:'通关评级',exact:true}).count(),1);await menu.getByRole('group',{name:'通关评级',exact:true}).getByRole('menuitemradio',{name:'SSS',exact:true}).click();assert.equal((await item('portrait')).personalGrade,'SSS');
 });
 await check('Dock 收录三入口与标签整理，取消不写',async()=>{
 const before=await raw(),attempts=await saves();for(const [label,title,closeLabel] of [['手动收录','收录新作品','关闭'],['检索与导入','从来源收录','关闭'],['批量收录','批量导入作品','关闭批量导入'],['整理标签','管理标签','关闭']]){await button('收录作品').click();const hub=page.getByRole('dialog',{name:'收录作品',exact:true});assert.equal(await button('手动收录',hub).evaluate(n=>n===document.activeElement),true);await button(label,hub).click();const dialog=page.getByRole('dialog',{name:title,exact:true});await dialog.waitFor();assert.equal(await dialog.getByText('通关进度',{exact:true}).count(),0);await button(closeLabel,dialog).first().click();}await unchanged('收录入口浏览取消',before,attempts);
 });
 await check('新建最终分类资格与隐藏等级草稿保护',async()=>{
 await button('收录作品').click();await button('手动收录').click();const editor=page.getByRole('dialog',{name:'收录新作品',exact:true});await editor.getByRole('textbox',{name:'作品名称',exact:false}).fill('新建搁置样例');await editor.getByRole('combobox',{name:'体验分类',exact:true}).selectOption('replayable');await editor.getByRole('combobox',{name:'通关评级',exact:true}).selectOption('SS');await editor.getByRole('combobox',{name:'游玩优先级',exact:true}).selectOption('SSS');await editor.getByRole('combobox',{name:'体验分类',exact:true}).selectOption('put-aside');await button('加入收藏',editor).click();const created=page.getByRole('dialog',{name:'新建搁置样例详情',exact:true});await created.waitFor();const saved=(await data()).items.find(i=>i.title==='新建搁置样例');assert.equal(saved.personalGrade,undefined);assert.equal(saved.playPriority,undefined);assert.equal(saved.completion,'unknown');await close(created);
 });
 await check('列表直接编辑印象，失败草稿阻止视图切换，重试与80字限制',async()=>{
 await showAll();await button('列表视图').click();assert.equal(await page.locator('.list-impression label > span,.list-impression > small').count(),0,'印象上下无常驻注释');const input=page.getByRole('textbox',{name:'便当纵图的一句话印象',exact:true});const before=await data();await input.fill('列表内快速记下印象');await input.press('Enter');assert.equal((await item('portrait')).impression,'列表内快速记下印象');preserve(before,await data(),'portrait',['impression','updatedAt']);
 await input.fill('失败后保留我的草稿');await fail(true);await button('卡片视图').click();assert.equal(await input.inputValue(),'失败后保留我的草稿');assert.equal(await button('列表视图').getAttribute('aria-pressed'),'true');assert.match(await page.locator('.list-impression-error').innerText(),/保存失败/);await fail(false);await input.press('Enter');assert.equal((await item('portrait')).impression,'失败后保留我的草稿');await input.fill('字'.repeat(81));await input.press('Enter');assert.match(await page.locator('.list-impression-error').innerText(),/80/);assert.equal((await item('portrait')).impression,'失败后保留我的草稿');await input.press('Escape');assert.equal(await input.inputValue(),'失败后保留我的草稿');await capture('list-impressions');
 await page.reload();await showAll();await button('列表视图').click();assert.equal(await page.getByRole('textbox',{name:'便当纵图的一句话印象',exact:true}).inputValue(),'失败后保留我的草稿');
 });
 await check('多选分类与双等级、列表只读不误写',async()=>{
 await button('批量编辑游戏').click();await button('选择便当纵图').click();const bar=page.locator('.selection-actionbar');const before=await raw();assert.equal(await page.getByRole('textbox',{name:'便当纵图的一句话印象',exact:true}).getAttribute('readonly'),'');await bar.getByRole('combobox',{name:'批量体验分类',exact:true}).selectOption('playing');assert.equal((await item('portrait')).experienceCategory,'playing');assert.equal(await bar.getByRole('combobox',{name:'统一游玩优先级',exact:true}).count(),1);await bar.getByRole('combobox',{name:'批量体验分类',exact:true}).selectOption('replayable');await bar.getByRole('combobox',{name:'批量等级维度',exact:true}).selectOption('rating');await bar.getByRole('combobox',{name:'统一通关评级',exact:true}).selectOption('A');await button('应用等级',bar).click();assert.equal((await item('portrait')).personalGrade,'A');assert.equal((await item('portrait')).playPriority,'A');await button('退出多选',bar).click();assert.notEqual(await raw(),before);
 });
 await check('回收站独立圆形 Dock 按钮与隐藏恢复入口',async()=>{
 const before=await raw(),attempts=await saves();await button('回收站').click();assert.equal(await button('回收站').getAttribute('aria-pressed'),'true');assert.equal(await button('回收站').getAttribute('data-tooltip'),'退出回收站');assert.equal(await page.getByRole('textbox',{name:'回收样例的一句话印象',exact:true}).count(),1);assert.equal(await page.getByRole('textbox',{name:'回收样例的一句话印象',exact:true}).getAttribute('readonly'),'');await button('回收站').click();assert.equal(await button('回收站').getAttribute('aria-pressed'),'false');assert.equal(await page.getByRole('textbox',{name:'回收样例的一句话印象',exact:true}).count(),0);await button('回收站').click();await button('返回收藏库').click();await unchanged('回收站往返不写入',before,attempts);await button('数据与设置').click();const settings=page.getByRole('dialog',{name:'数据与设置',exact:true});await button('数据与备份',settings).click();await button('查看',settings.locator('.settings-card').filter({hasText:'已隐藏作品'})).click();assert.equal(await page.getByRole('textbox',{name:'隐藏样例的一句话印象',exact:true}).count(),1);await button('返回收藏库').click();
 });
 await context.close();context=null;
}
async function visual(){await prepare('browser');
 await check('顶部滚动渐隐、本地状态邻近版本、设置导出入口',async()=>{
 const before=await raw(),attempts=await saves();assert.equal(await page.locator('.topbar .storage-marker,.topbar .top-icon').count(),0);assert.match(await page.locator('.sidebar-bottom').innerText(),new RegExp(`本地保存[\\s\\S]*v${version.replaceAll('.','\\.')}`));
 await button('列表视图').click();await page.setViewportSize({width:1440,height:820});const scroll=page.locator('.main-scroll');assert.equal(await scroll.evaluate(n=>getComputedStyle(n).maskImage),'none');await scroll.evaluate(n=>n.scrollTop=230);await page.waitForFunction(()=>document.querySelector('.main-scroll').hasAttribute('data-scrolled'));assert.equal(await scroll.evaluate(n=>getComputedStyle(n).maskImage),'none','不遮罩滚动祖先，保留内部玻璃采样');assert.equal(await page.locator('.topbar').evaluate(n=>getComputedStyle(n,'::after').height),'40px');await capture('scroll-fade');await scroll.evaluate(n=>n.scrollTop=0);await page.waitForFunction(()=>!document.querySelector('.main-scroll').hasAttribute('data-scrolled'));assert.equal(await page.locator('.topbar').evaluate(n=>getComputedStyle(n,'::after').content),'none');
 await button('数据与设置').click();const settings=page.getByRole('dialog',{name:'数据与设置',exact:true});assert.match(await settings.evaluate(n=>getComputedStyle(n).backdropFilter),/blur\(20px\)/);const search=settings.getByRole('textbox',{name:'搜索设置',exact:true});await search.focus();assert.equal(await search.evaluate(n=>getComputedStyle(n).outlineStyle),'none');assert.equal(await settings.locator('.settings-search').evaluate(n=>getComputedStyle(n).outlineStyle),'solid');await button('数据与备份',settings).click();await capture('frosted-settings');const download=page.waitForEvent('download');await button('导出',settings.locator('.settings-card').filter({hasText:'导出收藏备份'})).click();const backup=await download;const exported=JSON.parse(fs.readFileSync(await backup.path(),'utf8'));assert.ok(Number.isFinite(Date.parse(exported.exportedAt)));delete exported.exportedAt;assert.deepEqual(exported,JSON.parse(before));await button('关闭',settings).click();await button('卡片视图').click();await page.setViewportSize({width:1440,height:1100});await unchanged('调整导航与导出不改收藏',before,attempts);
 });
 await check('多选/筛选/排序/收录统一磨砂、清晰选中和透明度降级',async()=>{
 const before=await raw(),attempts=await saves();
 await button('批量编辑游戏').click();await button('筛选').click();
 const inspect=async()=>page.evaluate(()=>{
   const paint=document.createElement('canvas').getContext('2d');paint.canvas.width=paint.canvas.height=1;
   function rgba(value){paint.clearRect(0,0,1,1);paint.fillStyle=value;paint.fillRect(0,0,1,1);return [...paint.getImageData(0,0,1,1).data].map((n,i)=>i===3?n/255:n);}
   const values=[['selection','.selection-actionbar'],['filters','#library-advanced-filters'],['hub','.collection-hub']].filter(([,selector])=>document.querySelector(selector)).map(([name,selector])=>{
     const node=document.querySelector(selector),style=getComputedStyle(node);return {name,filter:style.backdropFilter,background:rgba(style.backgroundColor),ink:rgba(style.color),muted:rgba(style.getPropertyValue('--library-overlay-muted'))};
   });
   const select=document.querySelector('.sort-controls select'),picker=getComputedStyle(select,'::picker(select)'),selected=getComputedStyle(select.selectedOptions[0]);
   return {values,picker:{filter:picker.backdropFilter,background:rgba(picker.backgroundColor),ink:rgba(picker.color),selectedBackground:rgba(selected.backgroundColor),selectedInk:rgba(selected.color)}};
 });
 function contrast(ink,bg){const light=rgb=>rgb.slice(0,3).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);const [a,b]=[light(ink),light(bg)].sort((a,b)=>b-a);return (a+.05)/(b+.05);}
 function readable(values){for(const value of values){for(const floor of [0,255]){const bg=value.background.slice(0,3).map(n=>n*value.background[3]+floor*(1-value.background[3]));for(const ink of [value.ink,value.muted].filter(Boolean))assert.ok(contrast(ink,bg)>=4.5,`${value.name}: contrast ${contrast(ink,bg)}`);}}}
 const dark=await inspect();for(const value of [...dark.values,dark.picker])assert.match(value.filter,/blur\(20px\)/);readable(dark.values);readable([{name:'picker',...dark.picker}]);assert.ok(contrast(dark.picker.selectedInk,dark.picker.selectedBackground)>=4.5);
 const sort=page.getByRole('combobox',{name:'排序方式',exact:true});await sort.click();assert.equal(await sort.evaluate(n=>n.matches(':open')),true);await capture('frosted-library-menus');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await sort.evaluate(n=>n.matches(':open')),false);await button('退出多选').click();await button('收录作品').click();const hub=page.getByRole('dialog',{name:'收录作品',exact:true});const opened=await inspect();assert.match(opened.values.find(v=>v.name==='hub').filter,/blur/);readable(opened.values);await capture('frosted-collection-hub');
 await page.evaluate(()=>document.documentElement.dataset.theme='light');const light=await inspect();readable(light.values);readable([{name:'light-picker',...light.picker}]);assert.ok(contrast(light.picker.selectedInk,light.picker.selectedBackground)>=4.5);await page.evaluate(()=>document.documentElement.dataset.theme='dark');
 await page.evaluate(()=>document.documentElement.dataset.actionGlass='off');let plain=await inspect();for(const value of [...plain.values,plain.picker]){assert.equal(value.filter,'none');assert.equal(value.background[3],1);}
 await page.evaluate(()=>document.documentElement.dataset.actionGlass='on');const session=await context.newCDPSession(page);await session.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});plain=await inspect();for(const value of [...plain.values,plain.picker]){assert.equal(value.filter,'none');assert.equal(value.background[3],1);}await session.send('Emulation.setEmulatedMedia',{features:[]});await session.detach();await page.emulateMedia({reducedMotion:'reduce'});await button('关闭',hub).click();await button('筛选').click();await unchanged('磨砂和菜单浏览零收藏写入',before,attempts);
 });
 await check('响应布局与完整封面、统计零值、长文折叠',async()=>{
 for(const viewport of [{width:1440,height:1000},{width:1000,height:800},{width:390,height:844}]){await page.setViewportSize(viewport);await button('列表视图').click();await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));for(const row of await page.locator('.list-media-row').all())assert.ok(await row.evaluate(n=>n.scrollWidth<=n.clientWidth+1));await capture(viewport.width+'-list');await button('查看便当方图零值详情').click();const detail=page.getByRole('dialog',{name:'便当方图零值详情',exact:true});await layout(detail,viewport.width+'-detail');await verifyCover(detail,'zero');assert.match(await detail.locator('.bento-stats').innerText(),/0\s*h/);assert.equal(await detail.getByRole('textbox',{name:'长文测评',exact:true}).isVisible(),false);await capture(viewport.width+'-detail');await close(detail);}
 });
 await check('列表材质按需挂载与释放，无闲置透镜累积',async()=>{
 await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:1440,height:1000});await button('列表视图').click();const row=page.locator('.list-media-row').first();for(let n=0;n<3;n++){await row.hover();await page.waitForTimeout(180);assert.equal(await row.getAttribute('data-glass-effective'),'liquid');assert.match(await row.locator(':scope > .glass-material__effect').evaluate(n=>n.style.backdropFilter),/url/);await page.locator('h1').hover();await page.waitForTimeout(80);assert.equal(await row.getAttribute('data-material-glass'),null);assert.equal(await row.getAttribute('data-glass-effective'),null);} });
 await check('同图 B银 A金 S闪箔 SS镭射 SSS多彩，倾斜方向与无网点网格',async()=>{
 await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:1440,height:1000});await button('卡片视图').click();const finishes={B:'silver',A:'gold',S:'foil',SS:'holographic',SSS:'prismatic'};const images=[];
 for(const [grade,finish] of Object.entries(finishes)){const target=button('查看反光'+grade+'详情'),cover=target.locator('.card-cover');await page.getByRole('textbox',{name:'搜索收藏',exact:true}).fill('反光'+grade);images.push(await cover.locator('img').getAttribute('src'));assert.equal(await cover.getAttribute('data-finish'),finish);await target.hover({position:{x:100,y:70}});await page.waitForTimeout(550);assert.equal(await cover.getAttribute('data-depth'),'active');assert.ok(Number(await cover.locator('.cover-foil').evaluate(n=>getComputedStyle(n).opacity))>.4);const angle=await cover.evaluate(n=>parseFloat(n.style.getPropertyValue('--cover-angle')));assert.ok(angle>=38&&angle<=52);await capture('foil-'+grade,cover);assert.equal(await cover.getAttribute('data-depth'),'active');}
 assert.equal(new Set(images).size,1);const css=fs.readFileSync(path.join(root,'src/presentation/features/library/cover-material.css'),'utf8');assert.doesNotMatch(css,/repeating-|url\(|dotted/);await page.getByRole('textbox',{name:'搜索收藏',exact:true}).fill('');await capture('grid-graded');await context.close();context=null;
 });
}
async function serve() {
  const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  report.distAssets = [...index.matchAll(/(?:src|href)="((?:\.\/|\/)?assets\/[^\"]+\.(?:js|css))"/g)].map(match => ({ path: match[1], sha256: sha(fs.readFileSync(path.resolve(dist, match[1].replace(/^\//, '')))) }));
  assert.ok(report.distAssets.some(asset => asset.path.endsWith('.js')), '必须加载真实 dist JS 资源');
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname === '/favicon.ico') { response.writeHead(204); return response.end(); }
    let file; try { file = path.resolve(dist, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname)); } catch { response.writeHead(400); return response.end(); }
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); return response.end(); }
    response.writeHead(200, { 'content-type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return `http://127.0.0.1:${server.address().port}`;
}

(async()=>{fs.mkdirSync(output,{recursive:true});try{base=await serve();browser=await chromium.launch({channel:'msedge',headless:true});for(const value of ['browser','bridge'])await suite(value);await visual();assert.deepEqual(report.errors,[]);assert.deepEqual(report.blockedRequests,[]);report.passed=true;}catch(error){report.failure={stage,message:error.message,stack:error.stack};process.exitCode=1;console.error(error.stack);if(page&&!page.isClosed())await capture('failure').catch(()=>{});}finally{await context?.close().catch(()=>{});await browser?.close().catch(()=>{});if(server)await new Promise(resolve=>server.close(resolve));report.timestamp=new Date().toISOString();fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,screenshots:report.screenshots.length,failure:report.failure}));}})();
