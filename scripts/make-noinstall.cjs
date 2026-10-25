const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const version = require(path.join(root, 'package.json')).version;
const releaseRoot = path.join(root, 'release');
const release = process.argv[2] ? path.resolve(root, process.argv[2]) : releaseRoot;
if (release !== releaseRoot && !release.startsWith(releaseRoot + path.sep)) throw new Error('输出目录必须位于项目 release 内。');
const source = path.join(release, 'win-unpacked');
const output = path.join(release, `Qiyu-NoInstall-${version}-x64.zip`);
const quote = value => "'" + value.replaceAll("'", "''") + "'";
if (process.platform !== 'win32') throw new Error('此脚本使用 Windows 自带的压缩库。');
if (!fs.existsSync(path.join(source, '栖域.exe')) || !fs.existsSync(path.join(source, 'resources', 'app.asar'))) throw new Error('请先运行 npm run pack，生成完整的桌面程序。');
if (fs.existsSync(output)) throw new Error(`输出文件已存在，未覆盖：${output}`);
const staging = fs.mkdtempSync(path.join(release, 'noinstall-stage-'));
if (!path.resolve(staging).startsWith(release + path.sep)) throw new Error('临时打包路径无效。');
try {
  const bundle = path.join(staging, `QIYU-${version}`);
  fs.cpSync(source, bundle, { recursive: true, force: false, errorOnExist: true });
  fs.copyFileSync(path.join(root, 'build', 'demo-library.json'), path.join(bundle, 'demo-library.json'));
  // PowerShell 5.1 needs a BOM for Chinese literals. CMD itself only contains ASCII.
  fs.writeFileSync(path.join(bundle, 'launch-demo.ps1'), '\ufeff' + fs.readFileSync(path.join(root, 'build', 'launch-demo.ps1'), 'utf8').replace(/^\ufeff/, ''), 'utf8');
  fs.writeFileSync(path.join(bundle, '启动演示.cmd'), '@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-demo.ps1" %*\r\n', 'ascii');
  const instructions = `栖域 ${version} · Windows x64 免安装待验收版\r\n\r\n` +
    '请先完整解压 ZIP，保留全部文件。\r\n\r\n' +
    '先体验：双击“启动演示.cmd”。窗口可见并标明演示数据与实际版本，使用合成收藏。\r\n' +
    '同一入口再次启动会打开同一演示目录，修改保留；可以与原正式版并行。\r\n' +
    '演示目录定位记录为 qiyu-demo-profile.json。目录丢失或损坏会报错，绝不静默重置或回退正式收藏。\r\n' +
    '若想新建演示，请重新解压到另一新文件夹；不要删除现有定位记录或收藏。\r\n\r\n' +
    '正式使用：先在原版本导出备份，自行退出原程序，再双击本目录“栖域.exe”。\r\n' +
    '正常模式沿用本机 %APPDATA%\\QIYU；启动不会迁移或补写旧数据。代理未操作真实收藏。\r\n' +
    '如旧版仍在运行，正常 EXE 可能只唤醒旧版，请核对界面左下角版本。\r\n' +
    '新版读取旧库安全；旧版不能理解新增独立状态与完成记录，勿交替编辑。回退前保留升级前备份与新版完整导出。\r\n\r\n' +
    '五分钟验收见“验收步骤.md”，功能与已知限制见“更新说明.md”。仅供本地验收，未正式发布。\r\n';
  fs.writeFileSync(path.join(bundle, '先读我-免安装版.txt'), '\ufeff' + instructions, 'utf8');
  fs.copyFileSync(path.join(root, 'CHANGELOG.md'), path.join(bundle, '更新说明.md'));
  fs.copyFileSync(path.join(root, 'docs', 'tasks', 'v0424-preview', '验收步骤.md'), path.join(bundle, '验收步骤.md'));
  fs.writeFileSync(path.join(bundle, 'SOURCE.json'), JSON.stringify({ version, commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() }, null, 2));
  const command = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory(${quote(staging)}, ${quote(output)}, [System.IO.Compression.CompressionLevel]::Optimal, $false)`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, stdio: 'inherit' });
  const sha256 = createHash('sha256').update(fs.readFileSync(output)).digest('hex').toUpperCase();
  fs.writeFileSync(path.join(release, 'SHA256SUMS.txt'), `${sha256}  ${path.basename(output)}\r\n`);
  console.log(JSON.stringify({ artifact: output, bytes: fs.statSync(output).size, sha256, version }));
} finally {
  const resolved = path.resolve(staging);
  if (path.dirname(resolved) === release && path.basename(resolved).startsWith('noinstall-stage-') && !fs.lstatSync(resolved).isSymbolicLink()) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
