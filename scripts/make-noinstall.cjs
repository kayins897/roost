const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { acceptanceDocFor } = require('./release-docs.cjs');

const root = path.resolve(__dirname, '..');
const version = require(path.join(root, 'package.json')).version;
const releaseRoot = path.join(root, 'release');
const release = process.argv[2] ? path.resolve(root, process.argv[2]) : releaseRoot;
const allowDirty = process.argv.includes('--allow-dirty');
if (release !== releaseRoot && !release.startsWith(releaseRoot + path.sep)) throw new Error('输出目录必须位于项目 release 内。');
const source = path.join(release, 'win-unpacked');
const output = path.join(release, `Qiyu-NoInstall-${version}-x64.zip`);
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
if (process.platform !== 'win32') throw new Error('此脚本使用 Windows 自带的压缩库。');
if (!fs.existsSync(path.join(source, '栖域.exe')) || !fs.existsSync(path.join(source, 'resources', 'app.asar'))) throw new Error('请先运行 npm run pack，生成完整的桌面程序。');
if (fs.existsSync(output)) throw new Error(`输出文件已存在，未覆盖：${output}`);
const gitStatus = git('status', '--porcelain', '--untracked-files=no');
if (gitStatus && !allowDirty) throw new Error('工作区有未提交的已跟踪改动，发行包会与提交不对应；请先提交，或显式加 --allow-dirty。');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const commit = git('rev-parse', 'HEAD');
const builtAt = git('show', '-s', '--format=%cI', 'HEAD');
const acceptanceDoc = acceptanceDocFor(version);
const staging = fs.mkdtempSync(path.join(release, 'noinstall-stage-'));
if (!path.resolve(staging).startsWith(release + path.sep)) throw new Error('临时打包路径无效。');
try {
  const bundle = path.join(staging, `QIYU-${version}`);
  fs.cpSync(source, bundle, { recursive: true, force: false, errorOnExist: true });
  fs.copyFileSync(path.join(root, 'build', 'demo-library.json'), path.join(bundle, 'demo-library.json'));
  // PowerShell 5.1 需要 BOM 才能正确显示中文；CMD 本身只含 ASCII。
  fs.writeFileSync(path.join(bundle, 'launch-demo.ps1'), '\ufeff' + fs.readFileSync(path.join(root, 'build', 'launch-demo.ps1'), 'utf8').replace(/^\ufeff/, ''), 'utf8');
  fs.writeFileSync(path.join(bundle, '启动演示.cmd'), '@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-demo.ps1" %*\r\n', 'ascii');
  const instructions = `栖域 ${version} · Windows x64 免安装预发行候选\r\n\r\n` +
    '这是待体验验收的候选版本，未替换稳定版；完整解压并保留全部文件后再启动。\r\n\r\n' +
    '先体验：双击「启动演示.cmd」。窗口标题标明演示数据与本版版本号，使用合成收藏。\r\n' +
    '同一入口再次启动会打开同一演示目录，演示中的修改会保留；可与正式版并行运行。\r\n' +
    '演示目录定位记录为 qiyu-demo-profile.json。目录丢失或损坏会直接报错停止，绝不静默重置或回退正式收藏。\r\n' +
    '若想新建演示，请重新解压到另一个新文件夹；不要删除现有定位记录或收藏。\r\n\r\n' +
    '正式使用：先在原版本导出完整备份，退出原程序，再双击本目录「栖域.exe」。\r\n' +
    '正常模式沿用本机 %APPDATA%\\QIYU；启动不会迁移或补写旧数据，本次发布流程未读写真实收藏。\r\n' +
    '如旧版仍在运行，正常 EXE 可能只唤醒旧版，请核对界面左下角版本号。\r\n' +
    `收藏格式仍为 schemaVersion 1，新版可含扩展分类、数值评分与外置截图。旧版程序不理解全部字段，` +
    '请勿用旧版与本版交替编辑同一份收藏；含截图时请导出 .roost 完整备份，并保留截图目录。\r\n' +
    '回退前保留升级前备份与新版完整导出，回退时用旧版打开备份副本，不要直接覆盖原定位目录。\r\n\r\n' +
    '五分钟验收见「验收步骤.md」，功能与已知限制见「更新说明.md」。仅供本地验收，未正式发布。\r\n';
  fs.writeFileSync(path.join(bundle, '先读我-免安装版.txt'), '\ufeff' + instructions, 'utf8');
  fs.copyFileSync(path.join(root, 'CHANGELOG.md'), path.join(bundle, '更新说明.md'));
  fs.copyFileSync(acceptanceDoc, path.join(bundle, '验收步骤.md'));
  const manifest = {
    version,
    branch,
    commit,
    dirty: Boolean(gitStatus),
    builtAt,
    acceptanceDoc: path.relative(root, acceptanceDoc).split(path.sep).join('/'),
    demoData: 'build/demo-library.json',
  };
  fs.writeFileSync(path.join(bundle, 'SOURCE.json'), JSON.stringify(manifest, null, 2) + '\n');
  const command = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory(${quote(staging)}, ${quote(output)}, [System.IO.Compression.CompressionLevel]::Optimal, $false)`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, stdio: 'inherit' });
  const sha256 = createHash('sha256').update(fs.readFileSync(output)).digest('hex').toUpperCase();
  fs.writeFileSync(path.join(release, 'SHA256SUMS.txt'), `${sha256}  ${path.basename(output)}\r\n`);
  console.log(JSON.stringify({ artifact: output, bytes: fs.statSync(output).size, sha256, version, branch, commit }));
} finally {
  const resolved = path.resolve(staging);
  if (path.dirname(resolved) === release && path.basename(resolved).startsWith('noinstall-stage-') && !fs.lstatSync(resolved).isSymbolicLink()) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
