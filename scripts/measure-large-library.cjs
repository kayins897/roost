// 525 款规模隔离性能测量：合成数据 + 独立临时目录，绝不读写真实 %APPDATA%\QIYU。
// 输出 evidence/perf-large-library-<时间戳>.json，用于优化前后对比（0.4.15 起纳入大库实测记录）。
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { _electron: electron } = require('playwright');

const root = path.resolve(__dirname, '..');
const executablePath = process.argv[2] || path.join(root, 'node_modules/electron/dist/electron.exe');
const TOTAL = 525;
// 封面用 build/icon.png（~11KB）base64：贴近大规模收藏的封面字节规模（大库 JSON 可达十余 MB），
// 让首次渲染覆盖真实的图片解码成本；纯 1x1 像素会掩盖该成本。
const COVER = `data:image/png;base64,${fs.readFileSync(path.join(root, 'build/icon.png')).toString('base64')}`;
const GAMEPLAY = ['动作角色扮演', '开放世界', '肉鸽', '卡牌构筑', '即时战略', '平台跳跃'];
const THEME = ['科幻', '奇幻', '末日', '悬疑', '历史', '日常'];
const SCENARIO = ['碎片时间', '深夜长线', '朋友同乐', '独处沉浸'];
const OTHER = ['值得重玩', '叙事出色', '音乐出色'];
const PLATFORMS = ['Steam', 'Switch', 'PS5', 'TapTap', '本地收藏'];
const STATES = ['playing', 'cleared', 'ongoing', 'paused', 'abandoned', 'want'];

function buildLibrary() {
  const items = [];
  for (let index = 0; index < TOTAL; index++) {
    const state = STATES[index % STATES.length];
    const minutes = [undefined, 0, 45, 320, 1275, 4380][index % 6];
    items.push({
      id: `perf-game-${String(index).padStart(4, '0')}`,
      category: 'game',
      title: `性能测试游戏 ${index} ${['Aurora', 'Basalt', 'Cascade', 'Drift', 'Ember'][index % 5]}`,
      subcategory: PLATFORMS[index % PLATFORMS.length],
      creator: `工作室 ${index % 40}`,
      year: String(2005 + (index % 20)),
      status: state === 'abandoned' ? 'paused' : 'finished',
      gamePlayState: state,
      playtimeMinutes: minutes,
      tags: [],
      gameTags: {
        gameplay: [GAMEPLAY[index % GAMEPLAY.length]],
        theme: [THEME[(index + 2) % THEME.length]],
        scenario: index % 3 === 0 ? [SCENARIO[index % SCENARIO.length]] : [],
        other: index % 4 === 0 ? [OTHER[index % OTHER.length]] : [],
      },
      favorite: index % 9 === 0,
      impression: index % 5 === 0 ? `第 ${index} 款的印象记录，用于搜索路径覆盖。` : '',
      // coverUrl 为空字符串不合法，半数作品省略该字段。
      ...(index % 2 === 0 ? { coverUrl: COVER } : {}),
      artwork: 'default',
      createdAt: new Date(Date.UTC(2025, 0, 1 + (index % 28), index % 24)).toISOString(),
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  }
  return { schemaVersion: 1, items };
}

async function main() {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-perf-'));
  fs.writeFileSync(path.join(dataDirectory, 'library.json'), JSON.stringify(buildLibrary()));
  const env = { ...process.env, QIYU_E2E: '1', QIYU_TEST_DATA_DIR: dataDirectory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath, args: [root], env, timeout: 45000 });
  const page = await app.firstWindow();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.locator('.media-card').first().waitFor({ timeout: 30000 });
  await page.waitForFunction(count => document.querySelectorAll('.media-card').length >= count, TOTAL);

  const metrics = await page.evaluate(total => new Promise(resolve => {
    // E2E 窗口不 show，rAF 被节流；改用 MutationObserver 捕获提交后的首个 DOM 变化，
    // 并用 longtask 记录交互期间的主线程阻塞。
    const results = { total, cardsInitial: document.querySelectorAll('.media-card').length };
    const run = async () => {
      const measure = async trigger => {
        const gallery = document.querySelector('.media-gallery');
        const start = performance.now();
        let mutated = false;
        const mutation = new Promise(done => {
          const observer = new MutationObserver(() => { mutated = true; observer.disconnect(); done(); });
          observer.observe(gallery, { subtree: true, childList: true, attributes: true, characterData: true });
        });
        // 结果集不变时 DOM 可能零变化（memo 生效的标志），超时即按"无提交"处理，以 longtask 为准。
        const timeout = new Promise(done => setTimeout(done, 300));
        trigger();
        await Promise.race([mutation, timeout]);
        const tasks = performance.getEntriesByType('longtask').filter(entry => entry.startTime >= start).map(entry => Math.round(entry.duration));
        return { latency: Math.round((performance.now() - start) * 10) / 10, longestTask: tasks.length ? Math.max(...tasks) : 0, mutated };
      };
      // 1) 搜索输入：单字符输入到 DOM 提交。
      const search = document.querySelector('input[aria-label="搜索收藏"]');
      const setNative = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      const searchLatencies = [];
      for (const character of ['测', '性', '5']) {
        searchLatencies.push(await measure(() => {
          setNative.call(search, character);
          search.dispatchEvent(new Event('input', { bubbles: true }));
        }));
        await measure(() => {
          setNative.call(search, '');
          search.dispatchEvent(new Event('input', { bubbles: true }));
        });
      }
      results.searchInput = searchLatencies;
      // 2) 游戏状态筛签切换（前三个状态），测完回到「全部」。
      const tabs = [...document.querySelectorAll('.game-status-tabs button')];
      const tabLatencies = [];
      for (const tab of tabs.slice(1, 4)) tabLatencies.push(await measure(() => tab.click()));
      results.statusTab = tabLatencies;
      await measure(() => tabs[0].click());
      // 3) 视图切换（网格↔列表）覆盖另一条全量重渲路径；先切列表再切回网格。
      const toList = document.querySelector('.view-switch button[aria-label="列表视图"]');
      const toGrid = document.querySelector('.view-switch button[aria-label="卡片视图"]');
      results.viewToggle = toList && toGrid
        ? [await measure(() => toList.click()), await measure(() => toGrid.click())]
        : null;
      resolve(results);
    };
    void run();
  }), TOTAL);

  // 页内计时无法跨越 reload：首次全量渲染用外部墙钟「reload 开始 → 525 张卡全部出现」。
  const reloadStart = Date.now();
  await page.reload();
  await page.locator('.media-card').first().waitFor({ timeout: 30000 });
  await page.waitForFunction(count => document.querySelectorAll('.media-card').length >= count, TOTAL);
  const fullRenderWallMs = Date.now() - reloadStart;

  const finalCards = await page.evaluate(() => document.querySelectorAll('.media-card').length);
  const report = {
    timestamp: new Date().toISOString(),
    version: require('../package.json').version,
    fixture: { games: TOTAL, coverBytes: COVER.length },
    metrics: { ...metrics, fullRenderWallMs, finalCards },
    pageErrors,
  };
  await app.close().catch(() => {});
  // Electron 完全退出可能稍晚于 close() 返回，清理失败不吞掉测量结果。
  try { fs.rmSync(dataDirectory, { recursive: true, force: true }); } catch { /* 临时目录留给系统清理 */ }
  const evidence = path.join(root, 'evidence');
  fs.mkdirSync(evidence, { recursive: true });
  const file = path.join(evidence, `perf-large-library-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`报告：${file}`);
  if (pageErrors.length || finalCards < TOTAL) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exit(1); });
