// 对照当前构建核对解压后的免安装包，不启动应用。
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { acceptanceDocFor } = require('./release-docs.cjs');
const root = path.resolve(__dirname, '..');
const bundle = path.resolve(process.argv[2] || 'MISSING-BUNDLE');
const hash = value => createHash('sha256').update(value).digest('hex');
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
(async () => {
  const asar = await import('@electron/asar');
  const archive = path.join(bundle, 'resources', 'app.asar');
  const source = JSON.parse(fs.readFileSync(path.join(bundle, 'SOURCE.json')));
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version;
  const acceptanceDoc = acceptanceDocFor(version);
  const assets = [...files(path.join(root, 'dist')), ...files(path.join(root, 'desktop-build')), path.join(root, 'build', 'icon.png'), path.join(root, 'build', 'demo-library.json')];
  const checks = assets.map(file => {
    const relative = path.relative(root, file);
    const actual = asar.extractFile(archive, relative);
    assert.deepEqual(actual, fs.readFileSync(file), relative);
    return { file: relative.split(path.sep).join('/'), sha256: hash(actual) };
  });
  assert.equal(JSON.parse(asar.extractFile(archive, 'package.json')).version, version);
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
  assert.equal(lock.version, version); assert.equal(lock.packages[''].version, version);
  const external = [
    ['demo-library.json', fs.readFileSync(path.join(root, 'build', 'demo-library.json'))],
    ['launch-demo.ps1', Buffer.from('\ufeff' + fs.readFileSync(path.join(root, 'build', 'launch-demo.ps1'), 'utf8').replace(/^\ufeff/, ''))],
    ['启动演示.cmd', Buffer.from('@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-demo.ps1" %*\r\n', 'ascii')],
    ['更新说明.md', fs.readFileSync(path.join(root, 'CHANGELOG.md'))],
    ['验收步骤.md', fs.readFileSync(acceptanceDoc)],
  ].map(([file, expected]) => {
    const actual = fs.readFileSync(path.join(bundle, file)); assert.deepEqual(actual, expected, file);
    return { file, sha256: hash(actual) };
  });
  assert.equal(source.version, version);
  assert.match(source.commit, /^[a-f0-9]{40}$/);
  assert.match(source.branch, /\S/);
  assert.equal(typeof source.builtAt, 'string');
  assert.equal(source.dirty, false, '发行包必须来自干净提交');
  assert.equal(source.acceptanceDoc, `docs/release/验收步骤-${version}.md`);
  const instructions = fs.readFileSync(path.join(bundle, '先读我-免安装版.txt'), 'utf8');
  assert.match(instructions, new RegExp(`栖域 ${version.replaceAll('.', '\\.')}`), '先读我必须标注当前版本');
  assert.ok(!instructions.includes('旧版不能理解新增独立状态与完成记录'), '先读我不得残留 0.4.24 文案');
  const report = { passed: true, version, source, archivedAssets: checks, externalAssets: external };
  fs.mkdirSync(path.join(root, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(root, 'evidence', `package-assets-v${version.replaceAll('.', '')}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: true, version, archivedAssets: checks.length, externalAssets: external.length, source }));
})().catch(error => { console.error(error); process.exitCode = 1; });
