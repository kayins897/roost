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
  const instructions = `栖域 ${version} · Windows x64 免安装版\r\n\r\n` +
    '1. 将整个 ZIP 解压到一个普通文件夹。\r\n' +
    '2. 进入 QIYU-' + version + ' 文件夹，双击“栖域.exe”运行。\r\n' +
    '3. 请保留 DLL、locales、resources 等全部文件；不要只单独复制 EXE，也不要在压缩包预览中直接运行。\r\n\r\n' +
    '本包包含完整桌面功能：多平台收藏、Steam/豆瓣资料导入、标签、封面、时长、体验记录、筛选和备份恢复。\r\n' +
    '数据仍保存在本机 %APPDATA%\\QIYU\\，与同一 Windows 账户下的安装版共用。\r\n' +
    '切换两个版本前先退出已运行的栖域；应用使用单实例保护收藏数据。\r\n' +
    '删除或移动程序文件夹不会删除收藏。换电脑时，请先导出 JSON，再在新电脑上导入。\r\n' +
    '本版本不会自动创建桌面/开始菜单快捷方式，也没有自动更新功能。\r\n' +
    '更新时退出栖域，将新版本完整解压到新文件夹再运行；同一账户下的收藏会继续保留。\r\n\r\n' +
    '旧网页迁移：在原来使用的网页中导出 JSON，再在应用“数据与设置”导入。\r\n' +
    '当前程序尚未进行数字签名。\r\n';
  fs.writeFileSync(path.join(bundle, '先读我-免安装版.txt'), '\ufeff' + instructions, 'utf8');
  fs.copyFileSync(path.join(root, 'CHANGELOG.md'), path.join(bundle, '更新说明.md'));
  const command = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory(${quote(staging)}, ${quote(output)}, [System.IO.Compression.CompressionLevel]::Optimal, $false)`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, stdio: 'inherit' });
  const sha256 = createHash('sha256').update(fs.readFileSync(output)).digest('hex').toUpperCase();
  console.log(JSON.stringify({ artifact: output, bytes: fs.statSync(output).size, sha256, version }));
} finally {
  const resolved = path.resolve(staging);
  if (path.dirname(resolved) === release && path.basename(resolved).startsWith('noinstall-stage-') && !fs.lstatSync(resolved).isSymbolicLink()) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
