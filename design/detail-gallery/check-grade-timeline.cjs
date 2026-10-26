// Isolated static preview only. No Electron, collection or persistent browser profile.
// Usage: node design/detail-gallery/check-grade-timeline.cjs <assembled-preview-directory>
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
assert.ok(process.argv[2], 'Provide an assembled static preview directory');
const directory = path.resolve(process.argv[2]), output = path.join(directory, 'screenshots');
const files = ['index.html','preview.css','preview.js','card-menu.js','layout.js','platforms.js','card-content.js'];
const inputs = [...files, 'assets/platform-icons.js'];
const ids = ['cover','grade','hours','platform','facts','impression','footprint','gallery','tags','count','review'];
const report = { passed:false, scope:'isolated-static-grade-timeline-preview', testedFiles:{}, checks:[], errors:[], externalRequests:[], failedLocalRequests:[], localStorageWrites:[], screenshots:[], measurements:[], productionPersistenceValidated:false, contentSnapshot:'Read-only exposed synthetic preview model for full photo collection; all changes use browser controls', unverified:['原生Electron、真实触屏及真实收藏持久化未验证'] };
let temporary, server, browser, context, page, base;
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const widget = id => page.locator('.widget[data-widget="' + id + '"]');
const menu = () => page.locator('#card-context-menu');
async function check(name, run) { await run(); report.checks.push(name); console.log('PASS ' + name); }
async function shot(name) { const file='grade-timeline-'+name+'.png'; await page.screenshot({path:path.join(output,file),animations:'disabled'}); report.screenshots.push(file); }
async function ready() { await page.evaluate(()=>document.fonts.ready); await page.waitForFunction(()=>[...document.querySelectorAll('.cover-card img,.gallery-photo img')].every(n=>n.complete&&n.naturalWidth)); }
async function reload() { await page.setViewportSize({width:1440,height:1060}); await page.reload(); await ready(); }
async function open(id) {
  if (await menu().isVisible()) await page.locator('#context-close').click();
  await widget(id).scrollIntoViewIfNeeded(); await widget(id).click({button:'right',position:{x:12,y:32}});
  assert.equal(await menu().getAttribute('data-widget'),id); assert.equal(await menu().getAttribute('data-page'),'content');
}
async function appearance(id) { await open(id); await page.locator('#context-appearance').click(); assert.equal(await menu().getAttribute('data-page'),'appearance'); }
async function close() { if(await menu().isVisible()) await page.locator('#context-close').click(); }
async function score(value) { await open('grade'); await page.locator('#context-rating').fill(value); await page.locator('[data-content-save=grade]').click(); }
async function photoCount() { return parseInt(await page.locator('#photo-count').innerText()); }
async function photos() { return page.evaluate(()=>previewDetail.photos.map(p=>({src:p.src,caption:p.caption}))); }
async function content() { return page.evaluate(()=>({rating:previewDetail.rating,priority:previewDetail.priority,state:previewDetail.state,photos:previewDetail.photos.map(p=>({src:p.src,caption:p.caption})),notes:previewDetail.footprints.map(n=>({...n})),impression:document.querySelector('#impression').value,review:document.querySelector('#review-body textarea').value,hours:document.querySelector('#hours-value').textContent,count:document.querySelector('#count-value').textContent,lastRun:[document.querySelector('#last-run-value').textContent,document.querySelector('#last-run-value').getAttribute('datetime')]})); }
async function mode(value) { await open('gallery'); await page.locator('#context-gallery-modes [data-gallery-mode="'+value+'"]').click(); assert.equal(await menu().isVisible(),false); assert.equal(await widget('gallery').getAttribute('data-gallery-mode'),value); }
async function indices() { return page.locator('.gallery-photo').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.photoIndex))); }
async function statSnapshot() { return page.evaluate(()=>({count:document.querySelector('#count-value').textContent,hours:document.querySelector('#hours-value').textContent,date:document.querySelector('#last-run-value').getAttribute('datetime'),rating:previewDetail.rating,priority:previewDetail.priority,state:previewDetail.state})); }
async function notes() { await open('footprint'); await page.locator('.context-note-editor summary').click(); }
async function importPhotos(list) {
  const count=await photoCount(); await open('gallery'); const chooser=page.waitForEvent('filechooser'); await page.locator('#context-add-photos').click();
  await (await chooser).setFiles(list); await page.waitForFunction(expected=>parseInt(document.querySelector('#photo-count').textContent)===expected,count+list.length);
}
(async()=>{
  fs.mkdirSync(output,{recursive:true}); for(const file of inputs) report.testedFiles[file]=hash(path.join(directory,file));
  temporary=fs.mkdtempSync(path.join(os.tmpdir(),'qiyu-grade-timeline-')); const fixture=path.join(temporary,'preview'); fs.mkdirSync(fixture);
  for(const file of files) fs.copyFileSync(path.join(directory,file),path.join(fixture,file));
  fs.cpSync(path.join(directory,'assets'),path.join(fixture,'assets'),{recursive:true,dereference:true});
  for(const file of inputs) assert.equal(hash(path.join(fixture,file)),report.testedFiles[file]);
  report.isolation={fixture:'Temporary copy of seven static files and local assets',realApplicationStarted:false,collectionAccess:false,storagePolicy:'Block and record localStorage writes'};
  const inside=(root,file)=>{const rel=path.relative(root,file);return rel&&rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
  server=http.createServer((req,res)=>{try{const pathname=new URL(req.url,'http://127.0.0.1').pathname,file=path.resolve(fixture,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));if(!inside(fixture,file)||!fs.existsSync(file)||!fs.statSync(file).isFile()||!inside(fixture,fs.realpathSync(file))){res.writeHead(404);return res.end();}res.writeHead(200,{'content-type':({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(400);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true}); report.browser='Microsoft Edge '+browser.version();
  context=await browser.newContext({viewport:{width:1440,height:1060},reducedMotion:'reduce',serviceWorkers:'block'});
  await context.exposeBinding('__recordGradeStorage',(_,value)=>report.localStorageWrites.push(value));
  await context.addInitScript(()=>{const storage=localStorage,pending=[],record=(method,key)=>pending.push(Promise.resolve(window.__recordGradeStorage({method,key:String(key??'')})));const proxy=new Proxy(storage,{get(target,key){if(['setItem','removeItem','clear'].includes(key))return(...args)=>record(key,args[0]);const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;},set(target,key){record('assign',key);return true;},deleteProperty(target,key){record('delete',key);return true;},defineProperty(target,key){record('define',key);return true;}});Object.defineProperty(window,'localStorage',{configurable:true,get:()=>proxy});for(const method of ['setItem','removeItem','clear']){const native=Storage.prototype[method];Storage.prototype[method]=function(...args){if(this===storage||this===proxy){record(method,args[0]);return;}return native.apply(this,args);};}window.__flushGradeStorage=()=>Promise.all(pending);});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base||['blob:','data:'].includes(url.protocol))return route.continue();report.externalRequests.push(url.href);return route.abort();});
  page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));page.on('response',response=>{if(response.url().startsWith(base)&&response.status()>=400)report.failedLocalRequests.push({url:response.url(),status:response.status()});});
  await page.goto(base);await ready();
  await check('独立数字评分为视觉中心，分类并入足迹且卡面没有编辑添加入口',async()=>{
    assert.deepEqual(await page.locator('.widget[data-widget]').evaluateAll(nodes=>nodes.map(n=>n.dataset.widget)),ids);
    assert.equal(await page.locator('.widget[data-widget]:not([hidden])').count(),10);assert.equal(await widget('count').isVisible(),false);
    assert.equal(await page.locator('.experience-card,[data-widget=experience]').count(),0);assert.equal(await widget('grade').locator('#grade-value').innerText(),'9.0');
    assert.equal(await widget('footprint').locator('#current-state').innerText(),'新游戏+');assert.equal(await widget('footprint').locator('#priority-value').innerText(),'A');
    const permanent=await page.locator('.widget-body button,.widget-body a').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&/编辑|添加|导入|记录足迹/.test(n.textContent)).map(n=>n.textContent));assert.deepEqual(permanent,[]);
    assert.equal(await page.locator('#impression').evaluate(n=>n.readOnly),true);assert.equal(await page.locator('#review-body textarea').evaluate(n=>n.readOnly),true);
    for(const width of [1440,880,390]){await page.setViewportSize({width,height:width===390?844:1060});const value=await widget('grade').evaluate(n=>{const v=n.querySelector('#grade-value'),t=n.querySelector('h2');return{width:innerWidth,card:n.getBoundingClientRect().toJSON(),value:v.getBoundingClientRect().toJSON(),font:parseFloat(getComputedStyle(v).fontSize),title:parseFloat(getComputedStyle(t).fontSize)};});report.measurements.push({label:'rating-hierarchy',...value});assert.ok(value.font>=72&&value.font>=value.title*4);assert.ok(value.value.x>=value.card.x-1&&value.value.right<=value.card.right+1&&value.value.bottom<=value.card.bottom+1);await widget('grade').scrollIntoViewIfNeeded();await shot('rating-'+width);}
    await reload();const visual=await widget('gallery').evaluate(n=>{const img=n.querySelector('.gallery-photo img'),a=n.getBoundingClientRect(),b=img.getBoundingClientRect();return{card:a.toJSON(),image:b.toJSON(),fit:getComputedStyle(img).objectFit};});report.measurements.push({label:'single-photo-coverage',...visual});assert.ok(visual.image.width>=visual.card.width*.95&&visual.image.height>=visual.card.height*.95);assert.equal(visual.fit,'cover');
  });
  await check('0到10半分评分与未评分区分，越界和非法步进不保存',async()=>{
    await open('grade');for(const id of ['context-rating','context-rating-range']){const input=page.locator('#'+id);assert.equal(await input.getAttribute('min'),'0');assert.equal(await input.getAttribute('max'),'10');assert.equal(await input.getAttribute('step'),'0.5');}await close();
    await score('');assert.equal(await page.locator('#grade-empty').isVisible(),true);assert.equal(await page.locator('#grade-unit').isVisible(),false);
    for(const [value,label]of[['0','0.0'],['7.5','7.5'],['10','10.0']]){await score(value);assert.equal(await page.locator('#grade-value').innerText(),label);assert.equal(await page.locator('#grade-empty').isVisible(),false);assert.equal(await page.locator('#grade-unit').isVisible(),true);}
    await open('grade');await page.locator('#context-rating-range').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#context-rating').inputValue(),'0.5');await page.locator('[data-content-save=grade]').click();assert.equal(await page.locator('#grade-value').innerText(),'0.5');
    await open('grade');await page.locator('#context-clear-rating').click();assert.equal(await page.locator('#grade-empty').isVisible(),true);await score('9');
    for(const invalid of ['-0.5','10.5','0.25']){await open('grade');await page.locator('#context-rating').fill(invalid);await page.locator('[data-content-save=grade]').click();assert.equal(await menu().isVisible(),true);assert.equal(await page.locator('#context-rating').getAttribute('aria-invalid'),'true');assert.equal(await page.locator('#grade-value').innerText(),'9.0');assert.ok((await page.locator('#context-rating-error').innerText()).length>0);await close();}
    await reload();
  });
  await check('10.0评分在320与390窄窗和紧凑卡片中完整显示',async()=>{
    await score('10');
    for(const size of ['small','medium']){
      await page.setViewportSize({width:1440,height:1060});await appearance('grade');await page.locator('[data-menu-size="'+size+'"]').click();
      for(const width of [1440,390,320]){
        await page.setViewportSize({width,height:width<=390?844:1060});
        const measured=await widget('grade').evaluate(n=>({size:n.dataset.size,width:innerWidth,documentWidth:document.documentElement.scrollWidth,card:n.getBoundingClientRect().toJSON(),value:n.querySelector('#grade-value').getBoundingClientRect().toJSON(),font:getComputedStyle(n.querySelector('#grade-value')).fontSize,unit:n.querySelector('#grade-unit').getBoundingClientRect().toJSON(),unitFont:parseFloat(getComputedStyle(n.querySelector('#grade-unit')).fontSize),scrollWidth:n.scrollWidth,clientWidth:n.clientWidth}));
        report.measurements.push({label:'rating-10-boundary',...measured});
        assert.ok(measured.documentWidth<=width+1&&measured.scrollWidth<=measured.clientWidth+1,'10.0不横向撑出卡片 '+size+'/'+width);
        assert.ok(measured.value.x>=measured.card.x-1&&measured.value.right<=measured.card.right+1&&measured.unit.right<=measured.card.right+1,'10.0与单位完整落在卡片内 '+size+'/'+width);
        assert.ok(measured.unit.height<=measured.unitFont*1.6,'/10单位保持单行 '+size+'/'+width);
        await widget('grade').scrollIntoViewIfNeeded();await shot('rating-10-'+size+'-'+width);
      }
    }
    await reload();
  });
  await check('分类资格完整矩阵，SSS到C优先级与既有评分独立保留',async()=>{
    await open('footprint');assert.deepEqual(await page.locator('#context-priority-choices button').evaluateAll(nodes=>nodes.map(n=>n.dataset.contextPriority)),['SSS','SS','S','A','B','C','未设置']);
    for(const rank of ['SSS','SS','S','A','B','C','未设置','SSS']){await page.locator('[data-context-priority="'+rank+'"]').click();assert.equal(await page.locator('#priority-value').innerText(),rank);assert.equal(await menu().isVisible(),true);}await close();
    const stable=await statSnapshot();const matrix=[['新作开荒',true,false],['游玩中',true,false],['未完待续',true,false],['新游戏+',true,true],['收官完结',false,true],['暂时搁置',false,false],['已体验 · 未分类',false,false]];
    for(const [state,priority,rating]of matrix){await open('footprint');await page.locator('[data-context-state="'+state+'"]').click();assert.equal(await menu().isVisible(),true);assert.equal(await page.locator('#current-state').innerText(),state);assert.equal(await page.locator('#priority-field').isVisible(),priority);assert.equal(await page.locator('#context-priority-choices').count(),priority?1:0);await open('grade');assert.equal(await page.locator('#context-rating').count(),rating?1:0);assert.equal(await page.locator('#grade-unavailable').isVisible(),!rating);if(state==='收官完结'){for(const [value,label]of[['0','0.0'],['10','10.0'],['9','9.0']]){await score(value);assert.equal(await page.locator('#grade-value').innerText(),label);}}if(!rating){assert.equal(await page.locator('#context-appearance').evaluate(n=>document.activeElement===n),true,'无评分资格时焦点落在可操作入口');await page.keyboard.press('Escape');assert.equal(await menu().isVisible(),false);}else await close();const actual=await statSnapshot();assert.deepEqual({...actual,state:stable.state},stable,'分类切换不清评分优先级或改统计');}
    await open('footprint');await page.locator('[data-context-state="新游戏+"]').click();await close();assert.equal(await page.locator('#grade-value').innerText(),'9.0');assert.equal(await page.locator('#priority-value').innerText(),'SSS');await reload();
  });
  await check('每卡专用内容主页与外观二级页的键盘返回及换卡复位',async()=>{
    await appearance('cover');await page.locator('#context-manage').click();await page.locator('[data-toggle-widget=count]').setChecked(true);await page.locator('#layout-done').click();
    const primary={cover:'#context-change-cover',grade:'#context-rating',hours:'#context-hours',platform:'#platform-editor',facts:'#context-fact-original',impression:'#context-impression',footprint:'#context-state-choices',gallery:'#context-gallery-modes',tags:'#context-tags-0',count:'#context-count',review:'#context-review'};
    for(const id of ids){await open(id);assert.equal(await page.locator(primary[id]).isVisible(),true);for(const selector of ['#context-sizes','#context-colors','#edit-layout','#context-manage'])assert.equal(await page.locator(selector).isVisible(),false);await page.locator('#context-appearance').focus();await page.keyboard.press('Enter');assert.equal(await menu().getAttribute('data-page'),'appearance');assert.equal(await page.locator(primary[id]).isVisible(),false);assert.equal(await page.locator('#context-back').isVisible(),true);for(let n=0;n<4;n++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>Boolean(document.activeElement.closest('[hidden]'))),false);}await page.keyboard.press('Escape');assert.equal(await menu().getAttribute('data-page'),'content');assert.equal(await page.locator(primary[id]).isVisible(),true);await page.keyboard.press('Escape');assert.equal(await menu().isVisible(),false);assert.equal(await widget(id).evaluate(n=>document.activeElement===n),true);}
    await appearance('hours');await page.locator('#context-close').click();await open('tags');assert.equal(await page.locator('#context-tags-0').isVisible(),true);assert.equal(await page.locator('#context-hours').count(),0);await shot('card-content');await close();await reload();
  });
  await check('移除自定义平台后焦点回到输入，Escape仍可关闭菜单',async()=>{
    await open('platform');const name='焦点合成平台';await page.locator('#custom-platform').fill(name);await page.locator('#add-platform').click();
    const choice=page.locator('#platform-choices button').filter({hasText:name});assert.equal(await choice.count(),1);await choice.click();assert.equal(await choice.count(),0);
    assert.equal(await page.locator('#custom-platform').evaluate(n=>document.activeElement===n),true);assert.equal(await menu().isVisible(),true);await page.keyboard.press('Escape');assert.equal(await menu().isVisible(),false);assert.equal(await widget('platform').evaluate(n=>document.activeElement===n),true);await reload();
  });
  await check('全隐藏空白菜单不残留内容，恢复默认仍隐藏完成次数且保留数据',async()=>{
    const stable=await content();await appearance('grade');await page.locator('#context-manage').click();for(const id of ids)await page.locator('[data-toggle-widget="'+id+'"]').setChecked(false);await page.locator('#layout-done').click();
    await page.locator('.bento-grid').click({button:'right',position:{x:8,y:8}});assert.equal(await menu().getAttribute('data-page'),'appearance');assert.equal(await page.locator('#context-back').isVisible(),false);assert.equal(await page.locator('#context-content').isVisible(),false);assert.equal(await page.locator('#context-content').locator('*').count(),0);
    await page.locator('#context-manage').click();await page.locator('[data-toggle-widget=count]').setChecked(true);await page.locator('#layout-done').click();assert.equal(await widget('count').isVisible(),true);await appearance('count');await page.locator('#context-manage').click();await page.locator('#layout-reset').click();await page.locator('#layout-done').click();assert.equal(await widget('count').isVisible(),false);assert.deepEqual(await content(),stable);await reload();
  });
  await check('足迹新增修改移除不改变评分优先级、完成次数、时长或最后运行',async()=>{
    const stable=await statSnapshot(),original=await page.evaluate(()=>previewDetail.footprints.map(n=>({...n})));
    await notes();await page.locator('#context-note-date').fill('2026-10');await page.locator('#context-note-title').fill('合成足迹');await page.locator('#context-note-text').fill('普通体验记录');await page.locator('#context-note-save').click();assert.equal(await page.locator('#footprints li strong').first().innerText(),'合成足迹');assert.deepEqual(await statSnapshot(),stable);
    await notes();await page.getByRole('button',{name:'修改足迹 1',exact:true}).click();assert.equal(await page.locator('#context-note-title').inputValue(),'合成足迹');await page.locator('#context-note-title').fill('已修改合成足迹');await page.locator('#context-note-text').fill('修改说明');await page.locator('#context-note-save').click();assert.equal(await page.locator('#footprints li strong').first().innerText(),'已修改合成足迹');assert.deepEqual(await statSnapshot(),stable);
    await notes();await page.getByRole('button',{name:'移除足迹 1',exact:true}).click();assert.deepEqual(await page.evaluate(()=>previewDetail.footprints.map(n=>({...n}))),original);assert.deepEqual(await statSnapshot(),stable);await reload();
  });
  await check('单图四宫格九宫格保持照片集合，超量照片按组翻页',async()=>{
    const original=await photos();assert.equal(await photoCount(),4);assert.deepEqual(await indices(),[0]);
    for(const [value,count]of[['quad',4],['nine',4],['single',1]]){await mode(value);assert.equal(await page.locator('.gallery-photo').count(),count);assert.deepEqual(await photos(),original);}
    const imports=[1,2,3,4,1].map(n=>path.join(directory,'assets','shot-'+n+'.jpg'));await importPhotos(imports);assert.equal(await photoCount(),9);const complete=await photos();
    await mode('nine');assert.deepEqual(await indices(),[0,1,2,3,4,5,6,7,8]);const cells=await page.locator('.gallery-photo').evaluateAll(nodes=>nodes.map(n=>({x:n.offsetLeft,y:n.offsetTop})));assert.equal(new Set(cells.map(c=>c.x)).size,3);assert.equal(new Set(cells.map(c=>c.y)).size,3);await widget('gallery').scrollIntoViewIfNeeded();await shot('nine-grid');
    await mode('quad');assert.deepEqual(await indices(),[0,1,2,3]);assert.equal(await page.locator('#gallery-page-count').innerText(),'1 / 3');assert.equal(await page.locator('#gallery-prev-page').isDisabled(),true);await page.locator('#gallery-next-page').click();assert.deepEqual(await indices(),[4,5,6,7]);await page.locator('#gallery-next-page').click();assert.deepEqual(await indices(),[8]);assert.equal(await page.locator('#gallery-next-page').isDisabled(),true);await page.locator('#gallery-prev-page').click();assert.deepEqual(await indices(),[4,5,6,7]);await mode('single');assert.deepEqual(await indices(),[0]);assert.equal(await page.locator('.gallery-pages').isVisible(),false);assert.deepEqual(await photos(),complete);
    await importPhotos([path.join(directory,'assets','shot-2.jpg')]);assert.equal(await photoCount(),10);await mode('nine');assert.deepEqual(await indices(),[0,1,2,3,4,5,6,7,8]);assert.equal(await page.locator('#gallery-page-count').innerText(),'1 / 2');await page.locator('#gallery-next-page').click();assert.deepEqual(await indices(),[9]);assert.equal(await page.locator('#gallery-page-count').innerText(),'2 / 2');assert.equal(await page.locator('#gallery-next-page').isDisabled(),true);await page.locator('#gallery-prev-page').click();assert.deepEqual(await indices(),[0,1,2,3,4,5,6,7,8]);await page.locator('#gallery-next-page').click();await page.locator('.gallery-photo').click();assert.equal(await page.locator('#lightbox-position').innerText(),'10 / 10');await page.locator('#remove-photo').click();await page.locator('#close-lightbox').click();await mode('single');assert.equal(await photoCount(),9);assert.deepEqual(await photos(),complete,'第10张删除后前9张身份与说明完全保留');
  });
  await check('封面图只影响单图，大图说明与删除按照片身份更新',async()=>{
    const original=await photos();await open('gallery');await page.locator('#context-gallery-cover').selectOption('5');await close();assert.deepEqual(await indices(),[5]);assert.deepEqual(await photos(),original);
    await page.locator('.gallery-photo').click();assert.equal(await page.locator('#lightbox-position').innerText(),'6 / 9');await page.locator('#close-lightbox').click();assert.equal(await page.evaluate(()=>document.activeElement?.dataset.photoIndex),'5','未重绘时关闭大图回原缩略图');await page.locator('.gallery-photo').click();await page.locator('#next-photo').click();await page.locator('#photo-caption').fill('第七张唯一合成说明');await page.locator('#set-gallery-cover').click();assert.equal(await page.locator('#set-gallery-cover').isDisabled(),true);await page.locator('#close-lightbox').click();await page.waitForFunction(()=>document.activeElement===document.querySelector('.gallery-card'),{},{timeout:1500});assert.equal(await widget('gallery').evaluate(n=>document.activeElement===n),true,'缩略图重绘后关闭大图回到相册卡');assert.deepEqual(await indices(),[6]);
    await mode('quad');assert.deepEqual(await indices(),[0,1,2,3]);await mode('single');await page.locator('.gallery-photo').click();assert.equal(await page.locator('#photo-caption').inputValue(),'第七张唯一合成说明');for(let n=0;n<4;n++)await page.locator('#next-photo').click();assert.equal(await page.locator('#lightbox-position').innerText(),'2 / 9');await page.locator('#remove-photo').click();await page.locator('#close-lightbox').click();const changed=original.map((photo,index)=>index===6?{...photo,caption:'第七张唯一合成说明'}:photo);assert.deepEqual(await photos(),changed.filter((_,index)=>index!==1),'只移除被选中的第2张，保留其他全部照片身份');assert.deepEqual(await indices(),[5]);assert.equal(await page.locator('.gallery-photo img').getAttribute('src'),original[6].src);
    await page.locator('.gallery-photo').click();assert.equal(await page.locator('#photo-caption').inputValue(),'第七张唯一合成说明');await page.locator('#remove-photo').click();await page.locator('#close-lightbox').click();assert.equal(await photoCount(),7);assert.deepEqual(await photos(),original.filter((_,index)=>index!==1&&index!==6),'第二次只移除原封面照片，其他身份不变');assert.deepEqual(await indices(),[5]);assert.equal(await page.locator('.gallery-photo img').getAttribute('src'),original[7].src);
  });
  await check('全部照片移除后的各布局空态与重新导入可用',async()=>{
    const count=await photoCount();await page.locator('.gallery-photo').click();for(let n=0;n<count;n++)await page.locator('#remove-photo').click();assert.equal(await page.locator('.lightbox').isVisible(),false);await page.waitForFunction(()=>document.activeElement===document.querySelector('.gallery-card'),{},{timeout:1500});assert.equal(await widget('gallery').evaluate(n=>document.activeElement===n),true,'删除最后一张图后焦点回相册卡');assert.equal(await photoCount(),0);
    for(const value of ['quad','nine','single']){await mode(value);assert.equal(await page.locator('.gallery-photo').count(),0);assert.equal(await page.locator('.gallery-empty').isVisible(),true);assert.equal(await page.locator('.gallery-pages').isVisible(),false);}
    await open('gallery');assert.equal(await page.locator('#context-gallery-cover').count(),0);await close();await importPhotos([path.join(directory,'assets','shot-1.jpg')]);assert.equal(await photoCount(),1);await page.locator('.gallery-photo').click();assert.equal(await page.locator('#prev-photo').isDisabled(),true);assert.equal(await page.locator('#next-photo').isDisabled(),true);await page.locator('#close-lightbox').click();await reload();
  });
  await check('封面专用内容操作可选本地图片并恢复示例封面',async()=>{
    const original=await page.locator('.cover-card img').getAttribute('src'),stable=await content();await open('cover');const chooser=page.waitForEvent('filechooser');await page.locator('#context-change-cover').click();await(await chooser).setFiles(path.join(directory,'assets','shot-1.jpg'));await page.waitForFunction(()=>document.querySelector('.cover-card img').getAttribute('src').startsWith('blob:'));await open('cover');await page.getByRole('button',{name:'恢复示例封面',exact:true}).click();assert.equal(await page.locator('.cover-card img').getAttribute('src'),original);assert.deepEqual(await content(),stable);
  });
  await check('八项输入哈希稳定、无外网、无存储写入和页面错误',async()=>{
    await page.evaluate(()=>window.__flushGradeStorage());assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);assert.deepEqual(report.failedLocalRequests,[]);assert.deepEqual(report.localStorageWrites,[]);assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),[]);for(const file of inputs)assert.equal(hash(path.join(directory,file)),report.testedFiles[file]);assert.equal(await page.evaluate(()=>typeof window.qiyuDesktop),'undefined');
  });
  report.passed=true;
})().catch(error=>{report.error=error.stack;process.exitCode=1;console.error(error);}).finally(async()=>{if(page&&!report.passed){try{await shot('failure');}catch{}}await context?.close();await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));if(temporary){const resolved=path.resolve(temporary);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('qiyu-grade-timeline-'));fs.rmSync(resolved,{recursive:true,force:true});}report.finishedAt=new Date().toISOString();if(fs.existsSync(output))fs.writeFileSync(path.join(output,'grade-timeline-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,output}));});
