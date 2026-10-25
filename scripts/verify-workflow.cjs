const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const evidence = path.join(root, 'evidence', `workflow-v${version.replaceAll('.', '')}`);
const startedAt = new Date().toISOString();
const runDirectory = path.join(evidence, `${startedAt.replace(/[:.]/g, '-')}-${process.pid}`);
const stages = [
  { id: 'unit', label: '单元测试', npm: 'test' },
  { id: 'desktop-build', label: '桌面构建', npm: 'build' },
  { id: 'workspace', label: '收藏工作区、详情与批量操作', script: 'verify-workspace.cjs' },
  { id: 'sort-controls', label: '双向排序、标签筛选与单行布局', script: 'verify-sort-controls.cjs' },
  { id: 'cover-finishes', label: '同图封面反光、方向与动态降级', script: 'verify-cover-finishes.cjs' },
  { id: 'ranks', label: '优先级与通关评级分组、折叠及手动排序', script: 'verify-ranks.cjs' },
  { id: 'rank-controls', label: '详情、右键、表单与批量等级入口', script: 'verify-rank-controls.cjs' },
  { id: 'game-progress', label: '独立游玩关系、完成记录与精确撤销', script: 'verify-game-progress.cjs' },
  { id: 'tag-move', label: '标签跨组移动与原文保护', script: 'verify-tag-move.cjs' },
  { id: 'import-preview', label: '导入预览选择与去重说明', script: 'verify-import-preview.cjs' },
  { id: 'settings', label: '设置分区与独立材质参数', script: 'verify-settings.cjs' },
  { id: 'theme-motion', label: '主题联动、过渡与动画降级', script: 'verify-theme-motion.cjs' },
  { id: 'desktop', label: '桌面基础验收', script: 'verify-desktop.cjs', desktop: true },
  { id: 'window-chrome', label: 'Windows透明标题区与原生窗口控件', script: 'verify-window-chrome.cjs', desktop: true },
  { id: 'ambient-desktop', label: '原生窗口背景停帧、恢复与偏好记忆', script: 'verify-ambient-desktop.cjs', desktop: true },
  { id: 'steam-batch', label: 'Edge 批量导入验收', script: 'verify-steam-batch.cjs' },
  { id: 'batch-desktop', label: 'Electron 批量导入验收', script: 'verify-batch-desktop.cjs', desktop: true },
  { id: 'steam-connect', label: 'Steam 官方接口连接与重复同步验收', script: 'verify-steam-connect.cjs', desktop: true },
].map(stage => ({ ...stage, status: 'pending' }));
const report = { startedAt, status: 'running', packaged: null, runDirectory, stages };

function writeReport() {
  const json = JSON.stringify(report, null, 2);
  fs.writeFileSync(path.join(runDirectory, 'validation.json'), json);
  fs.writeFileSync(path.join(evidence, 'validation.json'), json);
}
function packagedArgument() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--list') return null;
  if (!args.length) return null;
  if (args.length !== 2 || args[0] !== '--packaged') {
    throw new Error('用法：node scripts/verify-workflow.cjs [--list | --packaged <release 内已存在的 EXE>]');
  }
  const release = fs.realpathSync(path.join(root, 'release'));
  const executable = fs.realpathSync(path.resolve(root, args[1]));
  const relative = path.relative(release, executable);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
    || path.extname(executable).toLowerCase() !== '.exe' || !fs.statSync(executable).isFile()) {
    throw new Error('--packaged 必须指向本项目 release 目录内已存在的 EXE');
  }
  return executable;
}
function commandFor(stage) {
  if (stage.npm) {
    // Only these fixed npm commands reach cmd.exe; executable paths remain separate Node arguments.
    const args = stage.npm === 'test' ? ['test'] : ['run', 'desktop:build'];
    return process.platform === 'win32'
      ? [process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', stage.npm === 'test' ? 'npm test' : 'npm run desktop:build']]
      : ['npm', args];
  }
  return [process.execPath, [path.join(root, 'scripts', stage.script),
    ...(stage.desktop && report.packaged ? [report.packaged, 'workflow'] : [])]];
}
async function runStage(stage, index) {
  stage.startedAt = new Date().toISOString();
  stage.status = 'running';
  const basename = `${String(index + 1).padStart(2, '0')}-${stage.id}`;
  stage.log = path.join(runDirectory, `${basename}.log`);
  const statusFile = path.join(runDirectory, `${basename}.json`);
  const saveStatus = () => { fs.writeFileSync(statusFile, JSON.stringify(stage, null, 2)); writeReport(); };
  const [command, args] = commandFor(stage);
  stage.command = [command, ...args];
  saveStatus();
  console.log(`[开始 ${index + 1}/${stages.length}] ${stage.label}`);
  const log = fs.createWriteStream(stage.log);
  log.write(`${stage.startedAt} ${JSON.stringify(stage.command)}\n`);
  const result = await new Promise(resolve => {
    const child = spawn(command, args, { cwd: root, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let error;
    const output = chunk => { log.write(chunk); process.stdout.write(chunk); };
    child.stdout.on('data', output);
    child.stderr.on('data', output);
    child.once('error', failure => { error = failure.message; output(Buffer.from(`${error}\n`)); });
    child.once('close', (code, signal) => log.end(() => resolve({ code, signal, ...(error ? { error } : {}) })));
  });
  Object.assign(stage, result, { finishedAt: new Date().toISOString(), status: result.code === 0 && !result.error ? 'passed' : 'failed' });
  saveStatus();
  console.log(`[${stage.status === 'passed' ? '完成' : '失败'} ${index + 1}/${stages.length}] ${stage.label}；日志：${stage.log}`);
  return stage.status === 'passed';
}

(async () => {
  if (process.argv.length === 3 && process.argv[2] === '--list') {
    console.log(stages.map((stage, index) => `${String(index + 1).padStart(2, '0')} ${stage.id}: ${stage.label}`).join('\n'));
    return;
  }
  fs.mkdirSync(runDirectory, { recursive: true });
  try {
    report.packaged = packagedArgument();
    writeReport();
    for (const [index, stage] of stages.entries()) {
      if (!await runStage(stage, index)) {
        report.status = 'failed'; report.failedStage = stage.id;
        process.exitCode = 1;
        return;
      }
    }
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.failedStage = stages.find(stage => stage.status === 'running')?.id || 'initialization';
    report.error = error.stack || String(error);
    console.error(`[失败] ${report.failedStage}：${error.message}`);
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    writeReport();
    console.log(`验收${report.status === 'passed' ? '通过' : '停止'}；报告：${path.join(runDirectory, 'validation.json')}`);
  }
})();
