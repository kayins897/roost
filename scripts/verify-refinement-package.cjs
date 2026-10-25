// Run ONLY against a freshly extracted acceptance bundle. Never launches normal mode.
const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict'), net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const bundle = path.resolve(process.argv[2] || 'MISSING-BUNDLE');
const executable = path.join(bundle, '栖域.exe'), entry = path.join(bundle, '启动演示.cmd');
const output = path.join(root, 'evidence', 'refinement-package', new Date().toISOString().replace(/[:.]/g, '-'));
const report = { passed: false, version, userDataAccessed: false, actualLauncher: true, checks: [], errors: [], screenshots: [] };
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.QIYU_E2E; delete env.QIYU_TEST_DATA_DIR;
let browser, page, profile, file;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const read = () => JSON.parse(fs.readFileSync(file, 'utf8'));
const item = id => read().items.find(value => value.id === id);
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
async function check(name, action) { await action(); report.checks.push({ name, passed: true }); console.log(`通过：${name}`); }
async function poll(fn, expected, timeout = 15000) { const deadline = Date.now() + timeout; while (Date.now() < deadline) { try { if (await fn() === expected) return; } catch {} await sleep(100); } assert.equal(await fn(), expected); }
async function freePort() { const server = net.createServer(); await require('./test-loopback.cjs').listenLoopback(server); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }
async function launchEntry() {
  const port = await freePort();
  const launcher = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${entry}" -VerifyPort ${port}"`], { cwd: bundle, env, windowsHide: true, windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; launcher.stderr.on('data', data => log += data);
  await poll(async () => { try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { return false; } }, true, 45000).catch(error => { throw new Error(`${error.message}\n启动器：${log}`); });
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0]; page = context.pages()[0] || await context.waitForEvent('page');
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.errors.push(error.message));
  await page.getByRole('heading', { name: '游戏', exact: true }).waitFor();
  await poll(() => page.evaluate(() => window.qiyuDesktop.getInfo().windowVisible), true);
  const info = await page.evaluate(() => window.qiyuDesktop.getInfo());
  const locator = JSON.parse(fs.readFileSync(path.join(bundle, 'qiyu-demo-profile.json'), 'utf8'));
  assert.equal(info.demo, true); assert.equal(info.version, version);
  assert.equal(path.resolve(info.dataDirectory), path.resolve(locator.directory));
  if (profile) assert.equal(info.dataDirectory, profile, 'same entry must reuse its directory');
  profile = info.dataDirectory; file = path.join(profile, 'library.json');
  assert.ok(path.basename(profile).startsWith('qiyu-demo-'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'qiyu-demo.json'))).format, 'qiyu.demo.v1');
  await page.locator('.demo-mode-banner').waitFor(); assert.match(await page.locator('.demo-mode-banner').innerText(), new RegExp(`演示数据.*${version.replaceAll('.','\\.')}`));
  const layout = await page.evaluate(() => ({ banner: document.querySelector('.demo-mode-banner').getBoundingClientRect().toJSON(), main: document.querySelector('.main-panel').getBoundingClientRect().toJSON(), width: innerWidth }));
  assert.ok(layout.banner.height < 80 && layout.main.width > layout.width * .8, 'demo notice must be a compact row, not a sidebar or an overlay');
  return info;
}
async function closeEntry() {
  await page.close(); await browser.close().catch(() => {}); browser = null; page = null;
  await sleep(1200); // allow Chromium to release the independently scoped demo lock
}
async function showAll() {
  const group = page.getByRole('group', { name: '按体验分类筛选', exact: true });
  for (const name of ['新作开荒','已体验']) { const target = button(name, group); if (await target.getAttribute('aria-pressed') !== 'true') await target.click(); }
}
async function open(title) { await showAll(); await button(`查看${title}详情`).click(); return page.getByRole('dialog', { name: `${title}详情`, exact: true }); }
async function screenshot(name) { const target = path.join(output, name); await page.screenshot({ path: target }); report.screenshots.push(name); }

(async()=>{fs.mkdirSync(output,{recursive:true});assert.ok(fs.existsSync(executable)&&fs.existsSync(entry));assert.equal(fs.existsSync(path.join(bundle,'qiyu-demo-profile.json')),false,'仅使用从未启动的隔离验收副本');const seed=fs.readFileSync(path.join(bundle,'demo-library.json'),'utf8');
 await check('实际CMD入口、独立演示目录、窗口可见与启动零写',async()=>{await launchEntry();assert.equal(fs.readFileSync(file,'utf8'),seed);assert.equal(await page.locator('.window-caption-button,.window-caption-actions').count(),0);assert.equal((await page.evaluate(()=>window.qiyuDesktop.getInfo())).customWindowControls,undefined);await screenshot('01-start.png');});
 await check('右键恢复游玩中/新游戏+双等级，原始事实保留',async()=>{await showAll();await button('查看星海旅人详情').click({button:'right'});let menu=page.getByRole('menu',{name:'星海旅人快捷编辑',exact:true});const before=JSON.parse(JSON.stringify(item('demo-a')));await menu.getByRole('menuitemradio',{name:'游玩中',exact:true}).click();assert.equal(item('demo-a').experienceCategory,'playing');assert.equal(await menu.getByRole('group',{name:'通关评级',exact:true}).count(),0);await menu.getByRole('menuitemradio',{name:'新游戏+',exact:true}).click();assert.equal(await menu.getByRole('group',{name:'游玩优先级',exact:true}).count(),1);await menu.getByRole('group',{name:'通关评级',exact:true}).getByRole('menuitemradio',{name:'A',exact:true}).click();for(const field of ['completion','completionCount','gamePlayState','playEngagement','playtimeMinutes'])assert.equal(item('demo-a')[field],before[field]);assert.equal(item('demo-a').personalGrade,'A');});
 await check('实际列表印象保存落盘并保留测评',async()=>{await button('列表视图').click();assert.equal(await page.locator('.list-impression label > span,.list-impression > small').count(),0);const input=page.getByRole('textbox',{name:'星海旅人的一句话印象',exact:true});const review=item('demo-a').review;await input.fill('真实免安装程序中的列表印象');await input.press('Enter');assert.equal(item('demo-a').impression,'真实免安装程序中的列表印象');assert.equal(item('demo-a').review,review);await screenshot('02-list.png');});
 await check('实际Dock收录导航与垃圾桶再次点击退出',async()=>{await button('收录作品').click();const hub=page.getByRole('dialog',{name:'收录作品',exact:true});await hub.waitFor();assert.equal(await button('手动收录',hub).evaluate(n=>n===document.activeElement),true);assert.match(await hub.evaluate(n=>getComputedStyle(n).backdropFilter),/blur\(20px\)/);await screenshot('05-collection-hub.png');await button('检索与导入',hub).click();const dialog=page.getByRole('dialog',{name:'从来源收录',exact:true});await button('关闭',dialog).first().click();const before=fs.readFileSync(file,'utf8');await button('回收站').click();assert.equal(await button('回收站').getAttribute('aria-pressed'),'true');await button('回收站').click();assert.equal(await button('回收站').getAttribute('aria-pressed'),'false');assert.equal(fs.readFileSync(file,'utf8'),before);});
 await check('实际磨砂菜单与居中悬浮搜索，周围内容不遮挡',async()=>{const before=fs.readFileSync(file,'utf8');assert.equal(await page.locator('.topbar .storage-marker,.topbar .top-icon').count(),0);assert.match(await page.locator('.sidebar-bottom').innerText(),/本地保存/);await button('批量编辑游戏').click();await button('筛选').click();for(const selector of ['.selection-actionbar','#library-advanced-filters'])assert.match(await page.locator(selector).evaluate(n=>getComputedStyle(n).backdropFilter),/blur\(20px\)/);const sort=page.getByRole('combobox',{name:'排序方式',exact:true});await sort.click();assert.equal(await sort.evaluate(n=>n.matches(':open')),true);assert.match(await sort.evaluate(n=>getComputedStyle(n,'::picker(select)').backdropFilter),/blur\(20px\)/);await screenshot('06-frosted-menus.png');await page.keyboard.press('Escape');await button('退出多选').click();await button('筛选').click();const scroll=page.locator('.main-scroll');await scroll.evaluate(n=>n.scrollTop=230);assert.equal(await scroll.evaluate(n=>getComputedStyle(n).maskImage),'none');assert.equal(await page.locator('.topbar').evaluate(n=>getComputedStyle(n,'::after').content),'none');const header=await page.locator('.topbar').boundingBox(),search=await page.locator('.global-search').boundingBox(),main=await page.locator('.main-panel').boundingBox(),content=await scroll.boundingBox();assert.ok(Math.abs(search.x+search.width/2-main.x-main.width/2)<2);assert.ok(Math.abs(header.y-content.y)<1);assert.equal(await page.locator('.topbar').evaluate(n=>getComputedStyle(n).pointerEvents),'none');await screenshot('07-floating-search.png');await scroll.evaluate(n=>n.scrollTop=0);assert.equal(fs.readFileSync(file,'utf8'),before);});
 await check('实际设置磨砂、搜索框无内方框',async()=>{const before=fs.readFileSync(file,'utf8');await button('数据与设置').click();const settings=page.getByRole('dialog',{name:'数据与设置',exact:true});assert.match(await settings.evaluate(n=>getComputedStyle(n).backdropFilter),/blur\(20px\)/);const search=settings.getByRole('textbox',{name:'搜索设置',exact:true});await search.focus();assert.equal(await search.evaluate(n=>getComputedStyle(n).outlineStyle),'none');assert.equal(await settings.locator('.settings-search').evaluate(n=>getComputedStyle(n).outlineStyle),'solid');await button('数据与备份',settings).click();await search.focus();await screenshot('08-settings.png');await button('关闭',settings).click();assert.equal(fs.readFileSync(file,'utf8'),before);});
 await check('实际Bento、完成计数与显式记录撤销，不改分类事实',async()=>{const d=await open('潮汐协议');assert.equal(await button('更改通关进度',d).count(),0);assert.equal(await d.getByRole('combobox',{name:'通关评级',exact:true}).count(),1);const before=item('demo-d').experienceCategory;await button('记录一次完成',d).click();await d.getByRole('combobox',{name:'累计次数处理',exact:true}).selectOption('increment');await button('保存这条完成记录',d).click();assert.equal(item('demo-d').completionCount,4);await button('撤销本次',d).click();assert.equal(item('demo-d').completionCount,3);assert.equal(item('demo-d').experienceCategory,before);await screenshot('03-detail.png');await button('关闭详情',d).click();});
 await check('同一CMD关闭重启磁盘逐字读回，playing枚举不重写',async()=>{await button('查看远界编年史详情').click({button:'right'});const menu=page.getByRole('menu',{name:'远界编年史快捷编辑',exact:true});await menu.getByRole('menuitemradio',{name:'游玩中',exact:true}).click();await page.keyboard.press('Escape');assert.equal(item('demo-b').experienceCategory,'playing');const final=fs.readFileSync(file,'utf8');await closeEntry();await launchEntry();assert.equal(fs.readFileSync(file,'utf8'),final);assert.equal(item('demo-a').impression,'真实免安装程序中的列表印象');assert.equal(item('demo-a').personalGrade,'A');await screenshot('04-restart.png');await closeEntry();});
 assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(error=>{report.error=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{if(page&&!page.isClosed())await page.close().catch(()=>{});await browser?.close().catch(()=>{});fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,report:output,error:report.error}));});
