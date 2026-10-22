import assert from 'node:assert/strict';
import test from 'node:test';
import { lookupMetadata, parseDoubanPage, parseSteamDetails, parseSteamSearch } from './metadata.ts';

const bookUrl = 'https://book.douban.com/subject/1007305/';
const movieUrl = 'https://movie.douban.com/subject/1292052/';
const steamUrl = 'https://store.steampowered.com/app/1145360/';
const coverUrl = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1145360/header.jpg';
const bookHtml = `<!doctype html><html><head>
  <meta property="og:title" content="红楼梦" />
  <meta content="https://img3.doubanio.com/view/subject/l/public/s1070959.jpg" property="og:image" />
  <meta property='book:author' content='(清)曹雪芹' /><meta property="book:author" content="(清)无名氏" />
  </head><body><h1>红楼梦</h1><div id="info">
  <span><span class="pl">作者</span>: <a>(清)曹雪芹</a> / <a>(清)无名氏</a></span><br/>
  <span class="pl">出版年:</span> 1982-3<br/><span class="pl">原作名:</span> 石头记<br/>
  </div></body></html>`;
const steamData = { '1145360': { success: true, data: { type: 'game', name: 'Hades', developers: ['Supergiant Games'], release_date: { date: '2020 年 9 月 17 日' }, header_image: coverUrl } } };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cX1sAAAAASUVORK5CYII=', 'base64');
function json(value: unknown): Response { return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json; charset=utf-8' } }); }
function html(value: string): Response { return new Response(value, { headers: { 'content-type': 'text/html; charset=utf-8' } }); }
function fake(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => Promise.resolve(handler(String(input), init))) as typeof fetch;
}

test('Steam 搜索校验条目，最多八个候选，封面保留来源且不冒充本地图', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ type: 'app', id: i + 1, name: `游戏 ${i}`, tiny_image: coverUrl }));
  const result = parseSteamSearch({ items: [{ type: 'bundle', id: 10, name: '合集' }, { type: 'app', id: 'bad', name: '无效' }, null, ...rows] });
  assert.equal(result.length, 8);
  assert.equal(result[0].sourceUrl, 'https://store.steampowered.com/app/1/');
  assert.equal(result[0].coverUrl, undefined);
  assert.equal(result[0].coverSourceUrl, coverUrl);
  assert.deepEqual(result[0].platforms, ['Steam']);
  assert.throws(() => parseSteamSearch({ items: {} }), /搜索结果/);
});
test('Steam 详细资料提取开发商和发行年，拒绝失效作品和不受信封面域名', () => {
  const result = parseSteamDetails(steamData, '1145360');
  assert.equal(result.creator, 'Supergiant Games');
  assert.equal(result.year, '2020');
  assert.equal(result.sourceUrl, steamUrl);
  assert.equal(parseSteamDetails({ '1': { success: true, data: { name: '游戏', header_image: 'https://127.0.0.1/internal' } } }, '1').coverSourceUrl, undefined);
  assert.throws(() => parseSteamDetails({ '1': { success: false } }, '1'), /下架/);
  assert.throws(() => parseSteamDetails({ '1': { success: true, data: { type: 'music', name: 'Soundtrack' } } }, '1'), /不是游戏/);
  assert.throws(() => parseSteamDetails({ '1449560': { success: true, data: { type: 'game', name: 'Metro Exodus', steam_appid: 412020 } } }, '1449560'), /编号不一致/);
});
test('豆瓣图书解析重复 author meta、出版年与原作名', () => {
  const result = parseDoubanPage(bookHtml, bookUrl);
  assert.equal(result.category, 'book');
  assert.equal(result.title, '红楼梦');
  assert.equal(result.creator, '(清)曹雪芹 / (清)无名氏');
  assert.equal(result.year, '1982');
  assert.equal(result.originalTitle, '石头记');
  assert.equal(result.coverSourceUrl, 'https://img3.doubanio.com/view/subject/l/public/s1070959.jpg');
  assert.equal(result.coverUrl, undefined);
});
test('豆瓣影视解析 JSON-LD、原名及剧集分类，不执行页面脚本', () => {
  const source = `<html><head><meta property="og:title" content="示例作品"/><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'TVSeries', name: '示例作品', director: [{ name: '导演甲' }, { name: '导演乙' }], datePublished: '2024-04-01' })}</script></head><body><h1><span property="v:itemreviewed">示例作品 Example</span></h1><div id="info"><span class="pl">类型:</span>动画 / 科幻<br/><span class="pl">集数:</span>12</div></body></html>`;
  const result = parseDoubanPage(source, movieUrl);
  assert.equal(result.category, 'screen');
  assert.equal(result.subcategory, '番剧');
  assert.equal(result.originalTitle, 'Example');
  assert.equal(result.creator, '导演甲 / 导演乙');
  assert.equal(result.year, '2024');
});
test('豆瓣可从 info 兜底提取，解析 HTML 实体并容忍损坏的可选 JSON-LD', () => {
  const source = `<head><script type="application/ld+json">broken</script><meta content='A &amp; B &#x4e66;' property='og:title'></head><h1>A &amp; B 书</h1><div id='info'><span>作者:</span><a>甲 &amp; 乙</a><br><span>出版年:</span>2001<br></div>`;
  const result = parseDoubanPage(source, bookUrl);
  assert.equal(result.title, 'A & B 书');
  assert.equal(result.creator, '甲 & 乙');
  assert.equal(result.year, '2001');
  assert.throws(() => parseDoubanPage('<html><title>安全验证</title></html>', bookUrl), /验证/);
});
test('名称搜索仅发送用户查询，不下载候选封面或批量拉取详细资料', async () => {
  const requests: string[] = [];
  const result = await lookupMetadata('Hades', { fetch: fake((url, init) => {
    requests.push(url);
    assert.equal(new URL(url).searchParams.get('term'), 'Hades');
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.redirect, 'manual');
    assert.equal(init?.body, undefined);
    return json({ items: [{ type: 'app', id: 1145360, name: 'Hades', tiny_image: coverUrl }] });
  }) });
  assert.equal(requests.length, 1);
  assert.equal(result[0].coverUrl, undefined);
});
test('冒号属于游戏名称时保持关键词搜索，不误判为 URL 协议', async () => {
  let searched = '';
  await lookupMetadata('DOOM:Eternal', { fetch: fake(url => { searched = new URL(url).searchParams.get('term') ?? ''; return json({ items: [] }); }) });
  assert.equal(searched, 'DOOM:Eternal');
});
test('Steam 链接转为固定 API 请求；单张封面校验格式并转本地 data URL', async () => {
  const requests: string[] = [];
  const result = await lookupMetadata(steamUrl + 'Hades/?tracking=private#fragment', { fetch: fake(url => {
    requests.push(url);
    if (url.includes('/api/appdetails')) return json(steamData);
    return new Response(png, { headers: { 'content-type': 'image/png' } });
  }) });
  assert.equal(requests.length, 2);
  assert.ok(requests[0].startsWith('https://store.steampowered.com/api/appdetails?appids=1145360&'));
  assert.ok(!requests.join('').includes('private'));
  assert.equal(result[0].coverUrl, `data:image/png;base64,${png.toString('base64')}`);
});
test('豆瓣链接丢弃追踪参数，封面失败仍返回资料，可继续手动补图', async () => {
  const requests: string[] = [];
  const result = await lookupMetadata(bookUrl + '?from=private', { fetch: fake(url => {
    requests.push(url);
    return url === bookUrl ? html(bookHtml) : new Response(null, { status: 403 });
  }) });
  assert.equal(requests[0], bookUrl);
  assert.equal(result[0].title, '红楼梦');
  assert.equal(result[0].coverUrl, undefined);
});
test('拒绝任意域名、用户信息、非标准端口和本机协议，不产生请求', async () => {
  let calls = 0;
  for (const query of ['https://127.0.0.1/admin', 'https://store.steampowered.com.evil.org/app/1/', 'https://name:password@book.douban.com/subject/1/', 'https://book.douban.com:8443/subject/1/', 'file:///etc/passwd', '//localhost/path', 'https://movie.douban.com/search/?q=xx']) {
    await assert.rejects(lookupMetadata(query, { fetch: fake(() => { calls++; return html(''); }) }));
  }
  assert.equal(calls, 0);
});
test('跳转逐次校验，拒绝内网目标且不跟随豆瓣验证页', async () => {
  let calls = 0;
  await assert.rejects(lookupMetadata(bookUrl, { fetch: fake(() => { calls++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }); }) }), /HTTPS/);
  assert.equal(calls, 1);
  await assert.rejects(lookupMetadata(movieUrl, { fetch: fake(() => new Response(null, { status: 302, headers: { location: 'https://sec.douban.com/c?r=subject' } })) }), /要求验证/);
});
test('允许来源内的安全跳转，限制循环跳转次数', async () => {
  let calls = 0;
  const result = await lookupMetadata(bookUrl, { fetch: fake(() => ++calls === 1 ? new Response(null, { status: 301, headers: { location: bookUrl } }) : html(bookHtml.replace(/<meta content="https:[^>]+>/, ''))) });
  assert.equal(result.length, 1);
  calls = 0;
  await assert.rejects(lookupMetadata(bookUrl, { fetch: fake(() => { calls++; return new Response(null, { status: 302, headers: { location: bookUrl } }); }) }), /跳转过多/);
  assert.equal(calls, 4);
});
test('HTTP 限流与验证码显式提示，不尝试绕过', async () => {
  for (const status of [401, 403, 418, 429]) await assert.rejects(lookupMetadata(movieUrl, { fetch: fake(() => new Response(null, { status })) }), /验证或限制/);
  await assert.rejects(lookupMetadata(steamUrl, { fetch: fake(() => new Response(null, { status: 503 })) }), /HTTP 503/);
});
test('JSON/HTML 类型不符合预期、损坏 JSON 和空响应不会生成作品', async () => {
  await assert.rejects(lookupMetadata('Hades', { fetch: fake(() => html('<h1>login</h1>')) }), /无法识别/);
  await assert.rejects(lookupMetadata(bookUrl, { fetch: fake(() => json({ title: 'wrong' })) }), /验证/);
  await assert.rejects(lookupMetadata('Hades', { fetch: fake(() => new Response('broken', { headers: { 'content-type': 'application/json' } })) }), /无法识别/);
  await assert.rejects(lookupMetadata('Hades', { fetch: fake(() => new Response(null, { headers: { 'content-type': 'application/json' } })) }), /空内容/);
});
test('同时按 content-length 和实际流长度限制来源体积', async () => {
  await assert.rejects(lookupMetadata('Hades', { fetch: fake(() => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '999999999' } })) }), /内容过大/);
  await assert.rejects(lookupMetadata('Hades', { fetch: fake(() => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); controller.close(); } }), { headers: { 'content-type': 'application/json' } })) }), /内容过大/);
});
test('连接超时中断请求，网络异常给出可执行的提示', async () => {
  await assert.rejects(lookupMetadata('Hades', { timeoutMs: 5, fetch: fake((_url, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))); })) }), /超时/);
  await assert.rejects(lookupMetadata('Hades', { fetch: fake(() => { throw new TypeError('private internal error'); }) }), /无法连接来源/);
});
test('拒绝 SVG 和图片 MIME/签名不符；原图解码失败不影响元数据', async () => {
  for (const response of [new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }), new Response(png, { headers: { 'content-type': 'image/jpeg' } })]) {
    const [result] = await lookupMetadata(steamUrl, { fetch: fake(url => url.includes('/api/') ? json(steamData) : response) });
    assert.equal(result.coverUrl, undefined);
  }
  const [result] = await lookupMetadata(steamUrl, { fetch: fake(url => url.includes('/api/') ? json(steamData) : new Response(png, { headers: { 'content-type': 'image/png' } })), imageToDataUrl: () => undefined });
  assert.equal(result.coverUrl, undefined);
});
test('参数类型和长度在发请求前校验', async () => {
  for (const query of [null, {}, '', ' '.repeat(5), 'a'.repeat(2049), '游戏'.repeat(81)]) await assert.rejects(lookupMetadata(query));
});
