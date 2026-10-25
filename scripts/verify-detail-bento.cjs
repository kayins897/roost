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
const output = path.join(root, 'evidence', 'detail-bento');
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
  playtimeMinutes: 73, completionCount: 2, playPriority: 'A', personalGrade: 'S',
  tags: [], gameTags: { gameplay: [], theme: [], scenario: [], other: [] },
  impression: '保留一句话印象', review: '合成长文第一段\n第二段保留尾空格  ', favorite: false, artwork: 'outer',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', futureItem: { keep: id }, ...extra,
});
const fixture = { schemaVersion: 1, futureRoot: { keep: true }, items: [
  work('portrait', '便当纵图', { fixtureSize: [240, 360] }),
  work('landscape', '便当横图', { fixtureSize: [480, 270], completion: 'not-applicable' }),
  work('zero', '便当方图零值', { fixtureSize: [320, 320], playtimeMinutes: 0, completionCount: 0, completion: 'not-cleared' }),
  work('unknown', '便当无封面未知值', { playtimeMinutes: undefined, completionCount: undefined, completion: 'unknown' }),
] };
const cards = ['.bento-cover', '.bento-experience', '.bento-stats', '.bento-impression', '.bento-footprint', '.bento-review'];
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
  const toggle = button(axis === 'engagement' ? '更改当前游玩关系' : '更改通关进度', detail);
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
  await page.goto(base); await button('全部游戏', page.locator('.library-views')).click();
}
async function visualSuite(viewport) {
  await prepare('browser', viewport);
  await check(`${viewport.width}×${viewport.height} 便当网格、全图比例、占位与印象保存不跳高`, async () => {
    const before = await raw(), attempts = await saves();
    for (const { id } of fixture.items) {
      const detail = await open(id);
      assert.equal(await detail.locator('.detail-bento').evaluate(node => getComputedStyle(node).display), 'grid');
      for (const selector of cards) assert.equal(await detail.locator(selector).count(), 1, selector);
      await layout(detail, `${viewport.width}-${id}`); await verifyCover(detail, id);
      assert.equal(await detail.getByRole('textbox', { name: '长文测评', exact: true }).isVisible(), false);
      assert.equal(await detail.locator('.game-state-options').isVisible(), false);
      assert.equal(await detail.locator('.completion-options').isVisible(), false);
      await capture(`${viewport.width}-${id}`);
      if (id === 'portrait') {
        const impression = detail.locator('.bento-impression'), footprint = detail.locator('.bento-footprint');
        const a = await impression.boundingBox(), aFoot = await footprint.boundingBox();
        const input = detail.getByRole('textbox', { name: '一句话印象', exact: true });
        await input.fill('输入后出现保存按钮'); await button('保存感受', detail).waitFor();
        const b = await impression.boundingBox(), bFoot = await footprint.boundingBox();
        // Filling an off-screen mobile input scrolls the dialog. Compare relative
        // card positions so that scrolling cannot be mistaken for layout shift.
        assert.ok(Math.abs(a.height - b.height) <= 1 && Math.abs((aFoot.y - a.y) - (bFoot.y - b.y)) <= 1, '显示保存感受按钮不得改变卡片高度或推移足迹');
        await layout(detail, `${viewport.width}-dirty`); await capture(`${viewport.width}-impression-dirty`);
        await input.fill((await item(id)).impression);
      }
      await close(detail);
    }
    await unchanged('仅浏览布局、图片与还原输入不写库', before, attempts);
  });
  await context.close(); context = null;
}
async function behaviorSuite(currentMode) {
  await prepare(currentMode);
  await check('状态原地展开，同值零写入；两轴失败保留原状态与展开，重试成功收起', async () => {
    const detail = await open('portrait'), before = await raw(), attempts = await saves();
    assert.equal(await detail.getByRole('combobox', { name: '待体验优先级', exact: true }).inputValue(), 'A');
    assert.equal(await detail.getByRole('combobox', { name: '我的评级', exact: true }).inputValue(), 'S');
    for (const [axis, label] of [['engagement', '计划游玩'], ['completion', '已通关']]) {
      const options = await expand(detail, axis); await button(label, options).click();
    }
    await unchanged('两轴同值点击', before, attempts);
    for (const [axis, label, field, value] of [['engagement', '游玩中', 'playEngagement', 'playing'], ['completion', '明确未通关', 'completion', 'not-cleared']]) {
      const original = await data(), options = await expand(detail, axis), oldValue = original.items.find(value => value.id === 'portrait')[field];
      await fail(true); await button(label, options).click();
      assert.equal(await options.isVisible(), true); assert.equal((await item('portrait'))[field], oldValue);
      assert.equal(await button(label, options).getAttribute('aria-pressed'), 'false');
      await unchanged(`${axis}失败不改收藏`, JSON.stringify(original)); await capture(`${axis}-failed`);
      await fail(false); await button(label, options).click();
      assert.equal((await item('portrait'))[field], value); assert.equal(await options.isVisible(), false);
      preserve(original, await data(), 'portrait', [field, 'updatedAt']);
    }
    await close(detail);
  });
  await check('未知与0的时长/次数分别显示，编辑取消不补值', async () => {
    const before = await raw(), attempts = await saves();
    for (const id of ['unknown', 'zero']) {
      const detail = await open(id), stats = detail.locator('.bento-stats');
      if (id === 'unknown') assert.match(await stats.innerText(), /未记录/);
      else { assert.match(await stats.innerText(), /0\s*h/); assert.match(await stats.innerText(), /0\s*次/); }
      await button('编辑次数', detail).click();
      assert.equal(await detail.getByRole('textbox', { name: '累计完成次数', exact: true }).inputValue(), id === 'zero' ? '0' : '');
      await button('取消修改次数', detail).click(); await button('修改时长', detail).click();
      const editor = page.getByRole('dialog', { name: '修改累计游玩时长', exact: true });
      assert.equal(await editor.getByLabel('累计时长（小时）', { exact: true }).inputValue(), id === 'zero' ? '0' : '');
      await button('取消', editor).click(); await close(detail);
    }
    await unchanged('未知与0的只读浏览/编辑取消', before, attempts);
  });
  await check('长文默认折叠，折叠保持草稿；保存失败阻止关闭，重试完整保留', async () => {
    const detail = await open('portrait'), before = await data();
    const short = detail.getByRole('textbox', { name: '一句话印象', exact: true });
    const review = detail.getByRole('textbox', { name: '长文测评', exact: true });
    assert.equal(await review.isVisible(), false); await button('展开长文测评', detail).click();
    assert.equal(await review.inputValue(), before.items.find(value => value.id === 'portrait').review);
    const text = '折叠后仍保留\n长文草稿尾空格  ';
    await short.fill('短印象草稿'); await review.fill(text); await button('收起长文测评', detail).click();
    assert.equal(await review.isVisible(), false); await button('展开长文测评', detail).click(); assert.equal(await review.inputValue(), text);
    await button('收起长文测评', detail).click(); await fail(true); await button('保存感受', detail).click();
    await button('关闭详情', detail).click(); assert.equal(await detail.isVisible(), true);
    await unchanged('两份感受保存失败', JSON.stringify(before));
    await button('展开长文测评', detail).click(); assert.equal(await short.inputValue(), '短印象草稿'); assert.equal(await review.inputValue(), text);
    await capture('writing-close-guard'); await fail(false); await close(detail);
    assert.equal((await item('portrait')).impression, '短印象草稿'); assert.equal((await item('portrait')).review, text);
    preserve(before, await data(), 'portrait', ['impression', 'review', 'updatedAt']);
    const reopened = await open('portrait'); assert.equal(await reopened.getByRole('textbox', { name: '长文测评', exact: true }).isVisible(), false);
    await button('展开长文测评', reopened).click(); assert.equal(await reopened.getByRole('textbox', { name: '长文测评', exact: true }).inputValue(), text); await close(reopened);
  });
  await check('普通完成体验日志只增加足迹，不改变通关/累计次数/累计时长/完成事件', async () => {
    const before = await data(), detail = await open('zero'); await button('添加记录', detail).click();
    const editor = page.getByRole('dialog', { name: '添加体验记录', exact: true });
    await editor.getByLabel('实际体验日期', { exact: true }).fill('2026-10-25');
    await editor.getByRole('combobox', { name: '记录类型', exact: true }).selectOption('completed');
    await editor.getByLabel('体验内容', { exact: true }).fill('普通完成日志，独立于明确完成事件。');
    await editor.getByLabel('本次时长（分钟，可留空）', { exact: true }).fill('20');
    await button('保存记录', editor).click(); await editor.waitFor({ state: 'hidden' });
    const saved = await item('zero'); assert.equal(saved.experienceEntries.length, 1); assert.equal(saved.experienceEntries[0].kind, 'completed'); assert.equal(saved.experienceEntries[0].minutes, 20);
    preserve(before, await data(), 'zero', ['experienceEntries', 'updatedAt']);
    assert.match(await detail.locator('.bento-footprint').innerText(), /普通完成日志/); await capture('ordinary-completed-log'); await close(detail);
  });
  await check('库封面悬浮倾斜，文字位置稳定，点击仍打开详情', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const before = await raw(), attempts = await saves(), target = button('查看便当纵图详情');
    const name = target.locator('.card-name'), original = await name.boundingBox();
    await target.scrollIntoViewIfNeeded(); const cover = target.locator('.card-cover'), box = await cover.boundingBox();
    await page.mouse.move(box.x + box.width * .82, box.y + box.height * .2);
    await page.waitForFunction(() => document.querySelector('[aria-label="查看便当纵图详情"] .card-cover')?.dataset.depth === 'active');
    assert.notEqual(await cover.evaluate(node => getComputedStyle(node).transform), 'none');
    const moved = await name.boundingBox(); assert.ok(Math.abs(original.x - moved.x) <= 1 && Math.abs(original.y - moved.y) <= 1, '倾斜不移动卡片文字');
    await capture('library-hover', target); await target.click();
    const detail = page.getByRole('dialog', { name: '便当纵图详情', exact: true }); await detail.waitFor(); await close(detail);
    await unchanged('封面悬浮与点击浏览', before, attempts);
  });
  await context.close(); context = null;
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
(async () => {
  fs.mkdirSync(output, { recursive: true });
  try {
    base = await serve(); browser = await chromium.launch({ channel: 'msedge', headless: true });
    for (const viewport of [{ width: 1440, height: 1100 }, { width: 1000, height: 800 }, { width: 390, height: 844 }]) await visualSuite(viewport);
    await behaviorSuite('browser'); await behaviorSuite('bridge');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.blockedRequests, []); report.passed = true;
  } catch (error) {
    report.failure = { stage, message: error.message, stack: error.stack }; process.exitCode = 1; console.error(error.stack);
    if (page && !page.isClosed()) await capture('failure').catch(() => {});
  } finally {
    await context?.close().catch(() => {}); await browser?.close().catch(() => {});
    if (server) await new Promise(resolve => server.close(resolve));
    report.timestamp = new Date().toISOString(); fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, screenshots: report.screenshots.length, failure: report.failure }));
  }
})();
