const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '..'), version = require('../package.json').version;
const output = path.join(root, 'evidence', `window-chrome-v${version.replaceAll('.', '')}`);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-chrome-'));
const file = path.join(directory, 'library.json'), initial = JSON.stringify({ schemaVersion: 1, items: [], futureRoot: { keep: true } });
fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(file, initial);
const executablePath = process.argv[2] || path.join(root, 'node_modules/electron/dist/electron.exe');
const env = { ...process.env, QIYU_E2E: '1', QIYU_TEST_DATA_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE;
const report = { passed: false, version, packaged: Boolean(process.argv[2]), isolatedDataOnly: true, checks: [], errors: [], captures: [], notes: ['仅操作本脚本启动的临时Electron窗口；Win32调用逐次核对原生句柄所属PID，不触碰用户实例。', 'PrintWindow截图包含原生窗口控制区；拖动验证WM_NCHITTEST命中HTCAPTION，双击验证真实原生最大化。'] };
let app, page, handle, processId;
const nativeSource = `
$ProgressPreference='SilentlyContinue'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class QiyuChromeProbe {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X,Y; }
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT rect);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT rect);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT point);
 [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
}
'@
$request=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('PAYLOAD')))
$target=[IntPtr]::new([long]$request.handle)
[uint32]$ownerPid=0
[void][QiyuChromeProbe]::GetWindowThreadProcessId($target,[ref]$ownerPid)
if ($ownerPid -ne $request.processId) { throw 'Refusing to operate an unowned window.' }
$client=New-Object QiyuChromeProbe+RECT
[void][QiyuChromeProbe]::GetClientRect($target,[ref]$client)
$scale=($client.Right-$client.Left)/$request.width
function Position($point) {
 $nativePoint=New-Object QiyuChromeProbe+POINT
 $nativePoint.X=[int]($point.x*$scale); $nativePoint.Y=[int]($point.y*$scale)
 [void][QiyuChromeProbe]::ClientToScreen($target,[ref]$nativePoint)
 return [long]((([long]$nativePoint.Y -band 65535) -shl 16) -bor ([long]$nativePoint.X -band 65535))
}
if ($request.operation -eq 'inspect') {
 $hits=@($request.points | ForEach-Object { @{ name=$_.name; hit=[QiyuChromeProbe]::SendMessage($target,0x84,[IntPtr]::Zero,[IntPtr]::new((Position $_))).ToInt64() } })
 @{ hits=$hits; scale=$scale } | ConvertTo-Json -Compress -Depth 4
} elseif ($request.operation -eq 'capture') {
 $rect=New-Object QiyuChromeProbe+RECT; [void][QiyuChromeProbe]::GetWindowRect($target,[ref]$rect)
 $bitmap=New-Object Drawing.Bitmap ($rect.Right-$rect.Left),($rect.Bottom-$rect.Top)
 $graphics=[Drawing.Graphics]::FromImage($bitmap); $dc=$graphics.GetHdc()
 try { $ok=[QiyuChromeProbe]::PrintWindow($target,$dc,2) } finally { $graphics.ReleaseHdc($dc); $graphics.Dispose() }
 try {
  $bitmap.Save($request.output,[Drawing.Imaging.ImageFormat]::Png)
  $color=$bitmap.GetPixel([int]($bitmap.Width/2),[int](12*$scale))
  @{ captured=$ok; width=$bitmap.Width; height=$bitmap.Height; topPixel=@($color.R,$color.G,$color.B) } | ConvertTo-Json -Compress
 } finally { $bitmap.Dispose() }
} elseif ($request.operation -eq 'double') {
 [void][QiyuChromeProbe]::SendMessage($target,0xA3,[IntPtr]::new(2),[IntPtr]::new((Position $request.points[0])))
 @{ action='double' } | ConvertTo-Json -Compress
} else {
 $commands=@{ minimize=0xF020; restore=0xF120; close=0xF060 }
 if (-not $commands.ContainsKey($request.operation)) { throw 'Unsupported probe operation.' }
 [void][QiyuChromeProbe]::SendMessage($target,0x112,[IntPtr]::new($commands[$request.operation]),[IntPtr]::Zero)
 @{ action=$request.operation } | ConvertTo-Json -Compress
}
`;
async function waitMaximized(expected) {
 const deadline=Date.now()+5000;
 while (Date.now()<deadline) {
  if (await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMaximized()) === expected) return;
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMaximized()),expected);
}
async function native(operation, more = {}) {
 const payload = Buffer.from(JSON.stringify({ handle, processId, width: await page.evaluate(() => innerWidth), operation, ...more })).toString('base64');
 const encoded = Buffer.from(nativeSource.replace('PAYLOAD', payload), 'utf16le').toString('base64');
 return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true, encoding: 'utf8', timeout: 20000 }).trim());
}
async function check(name, run) { await run(); report.checks.push(name); console.log('PASS ' + name); }
async function capture(name) { const result = await native('capture', { output: path.join(output, name) }); report.captures.push({ file: name, ...result }); assert.ok(result.captured); assert.ok(Math.max(...result.topPixel) < 190, '原生顶部不应是白色实底'); }
async function geometry() { return page.evaluate(() => {
 const bounds = element => { const r = element.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom }; };
 const overlay = navigator.windowControlsOverlay, chrome = document.querySelector('.window-chrome');
 return { width:innerWidth,height:innerHeight,overlayVisible:overlay?.visible,media:matchMedia('(display-mode: window-controls-overlay)').matches,chrome:bounds(chrome),drag:getComputedStyle(chrome).getPropertyValue('-webkit-app-region'),search:bounds(document.querySelector('.global-search')),main:bounds(document.querySelector('.main-panel')) };
 }); }
(async () => { try {
 app = await electron.launch({ executablePath, args: process.argv[2] ? [] : [root], env, timeout:45000 }); page = await app.firstWindow();
 page.on('pageerror', error => report.errors.push(error.message)); await page.getByRole('heading', {name:'游戏',exact:true}).waitFor();
 ({ handle, processId } = await app.evaluate(({ BrowserWindow, app }) => ({ handle:BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE().toString(), processId:process.pid })));
 await page.evaluate(() => localStorage.setItem('qiyu.background.v1', JSON.stringify({enabled:false,hue:268,paletteHue:268})));
 await page.reload(); await app.evaluate(({BrowserWindow}) => { const w=BrowserWindow.getAllWindows()[0]; w.show(); w.focus(); }); await page.bringToFront();
 await check('透明原生覆盖控件与安全拖动区，顶部搜索和操作不重叠', async () => {
  const g=await geometry(); report.initialGeometry=g; assert.equal(g.overlayVisible,true); assert.equal(g.drag,'drag'); assert.ok(g.chrome.height>=30 && g.chrome.height<=34); assert.ok(g.chrome.width<g.width-80); assert.ok(g.search.y>=g.chrome.bottom); assert.ok(g.main.bottom<=g.height+1);
  const slot=(g.width-g.chrome.width)/3, y=g.chrome.height/2;
  report.nativeHits=await native('inspect',{points:[{name:'drag',x:80,y},{name:'minimize',x:g.chrome.width+slot*.5,y},{name:'maximize',x:g.chrome.width+slot*1.5,y},{name:'close',x:g.chrome.width+slot*2.5,y}]});
  assert.equal(report.nativeHits.hits.find(x=>x.name==='drag').hit,2); await capture('native-transparent-title.png');
 });
 await check('原生标题区双击最大化与还原，安全区跟随尺寸变化', async () => {
  await native('double',{points:[{x:80,y:16}]}); await waitMaximized(true);
  const g=await geometry(); report.maximizedGeometry=g; assert.ok(g.search.y>=g.chrome.bottom); await capture('native-maximized.png');
  await native('double',{points:[{x:80,y:16}]}); await waitMaximized(false);
 });
 await check('原生最小化和还原，窗口仍允许边缘缩放', async () => {
  await native('minimize'); assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMinimized()),true); await native('restore');
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.focus();w.setSize(880,640);});
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isResizable()),true);
  const g=await geometry(); report.minimumGeometry=g; assert.ok(g.search.y>=g.chrome.bottom); assert.ok(g.main.bottom<=g.height+1);
  await page.getByRole('textbox',{name:'搜索收藏',exact:true}).fill('可以输入'); assert.equal(await page.getByRole('textbox',{name:'搜索收藏',exact:true}).inputValue(),'可以输入'); await capture('native-880.png');
 });
 await check('小窗口设置搜索及关闭可点击，弹窗避开系统控制区', async () => {
  await page.getByRole('button',{name:'数据与设置',exact:true}).click(); const d=page.getByRole('dialog',{name:'数据与设置',exact:true}); const search=d.getByRole('textbox',{name:'搜索设置',exact:true});
  const g=await geometry(), b=await search.boundingBox(); assert.ok(b.y>=g.chrome.bottom); await search.fill('粒子'); assert.equal(await search.inputValue(),'粒子'); await page.screenshot({path:path.join(output,'settings-minimum.png')}); await d.getByRole('button',{name:'关闭',exact:true}).click(); await d.waitFor({state:'hidden'});
 });
 await check('窗口交互不改写收藏，原生关闭正常退出', async () => {
  assert.equal(fs.readFileSync(file,'utf8'),initial); const closed=app.waitForEvent('close'); await native('close'); await closed; app=null; assert.equal(fs.readFileSync(file,'utf8'),initial);
 });
 assert.deepEqual(report.errors,[]); report.passed=true;
} catch(error) { report.failure={message:error.message,stack:error.stack}; process.exitCode=1; console.error(error.stack);
} finally { if(app) await app.close().catch(()=>{}); const html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8'); report.distAssets=[...html.matchAll(/(?:src|href)="((?:\.\/|\/)?assets\/[^\"]+\.(?:js|css))"/g)].map(m=>({path:m[1],sha256:createHash('sha256').update(fs.readFileSync(path.join(root,'dist',m[1]))).digest('hex')})); report.timestamp=new Date().toISOString(); fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,failure:report.failure})); }
})();
