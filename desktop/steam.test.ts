import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { enrichSteamLibrary, parseOwnedSteamGames, parseSteamProfile, readSteamLibrary, SteamConnectionStore, validateSteamApiKey, validateSteamEnrichment } from './steam.ts';

// Fixtures only. No actual API key, user directory or network is accessed.
const KEY = 'ABCDEF0123456789ABCDEF0123456789';
// 专用合成测试SteamID：7656119 + 固定占位段，仅用于格式断言，不属于任何真实账号；测试全程不发网络请求。
const PROFILE = '76561198000000001';
const COVER = 'data:image/png;base64,YQ==';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cX1sAAAAASUVORK5CYII=', 'base64');
const readRequest = { profile: PROFILE, includePlayedFreeGames: true };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json; charset=utf-8' } });
const owned = (entries: unknown[]) => ({ response: { game_count: entries.length, games: entries } });
const entry = (appid = 123, playtime_forever = 0) => ({ appid, name: `Game ${appid}`, playtime_forever });
function fake(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => Promise.resolve(handler(String(input), init))) as typeof fetch;
}
function temp(t: TestContext): string {
  const base = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(base, 'qiyu-steam-test-'));
  t.after(() => {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), base);
    assert.ok(path.basename(resolved).startsWith('qiyu-steam-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return directory;
}
function encryption(available = true) {
  const testKey = Buffer.alloc(32, 17);
  return {
    isEncryptionAvailable: () => available,
    encryptString(value: string) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', testKey, iv);
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    },
    decryptString(value: Buffer) {
      const decipher = createDecipheriv('aes-256-gcm', testKey, value.subarray(0, 12));
      decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
    },
  };
}

test('Steam 主页和Key只接受明确格式，拒绝仿域名、凭据、端口和任意地址', () => {
  assert.deepEqual(parseSteamProfile(` ${PROFILE} `), { steamId: PROFILE });
  assert.deepEqual(parseSteamProfile(`https://steamcommunity.com/profiles/${PROFILE}/?tracking=discard#ignored`), { steamId: PROFILE });
  assert.deepEqual(parseSteamProfile('https://steamcommunity.com/id/some-User_1/'), { vanity: 'some-User_1' });
  assert.equal(validateSteamApiKey(` ${KEY.toLowerCase()} `), KEY.toLowerCase());
  for (const value of [null, '', '12345', '765611980000000010', 'https://steamcommunity.com.evil.example/id/name/', 'https://secret@steamcommunity.com/id/name/', 'https://steamcommunity.com:444/id/name/', 'file://steamcommunity.com/id/name/', 'https://steamcommunity.com/profiles/' + PROFILE + '/games/', 'https://127.0.0.1/id/name/']) assert.throws(() => parseSteamProfile(value));
  for (const value of [undefined, '', 'not-a-key', 'g'.repeat(32), KEY + '0', 'a'.repeat(31), 123]) assert.throws(() => validateSteamApiKey(value));
});

test('GetOwnedGames严格验证完整数量、明确0和唯一ID，不把隐私空响应或截断当空库', () => {
  const parsed = parseOwnedSteamGames(owned([entry(123, 0), entry(456, 678)]));
  assert.equal(parsed.reportedCount, 2);
  assert.deepEqual(parsed.games.map(game => [game.appId, game.playtimeMinutes]), [['123', 0], ['456', 678]]);
  assert.equal(parsed.games[0].sourceUrl, 'https://store.steampowered.com/app/123/');
  assert.deepEqual(parseOwnedSteamGames({ response: { game_count: 0 } }), { reportedCount: 0, games: [] });
  for (const value of [{}, { response: {} }, { response: { game_count: 1 } }, { response: { game_count: 2, games: [entry()] } }, { response: { game_count: 0, games: [entry()] } }, { response: { game_count: 1.5, games: [] } }]) assert.throws(() => parseOwnedSteamGames(value));
  assert.throws(() => parseOwnedSteamGames({ response: { game_count: 2001, games: [] } }), /2000/);
  assert.throws(() => parseOwnedSteamGames(owned([entry(), { ...entry(), appid: '000123' }])), /重复/);
  for (const playtime_forever of [undefined, null, '0', -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => parseOwnedSteamGames(owned([{ ...entry(), playtime_forever }])));
  for (const appid of [0, -1, 1.5, 4294967296, '123/evil', null]) assert.throws(() => parseOwnedSteamGames(owned([{ ...entry(), appid }])));
});

test('读取固定官方API，通过input_json发送选项、移除主页附带查询且不使用浏览器凭据', async () => {
  const requests: string[] = [];
  const result = await readSteamLibrary({ profile: `https://steamcommunity.com/profiles/${PROFILE}/?sensitive=do-not-send`, includePlayedFreeGames: false }, KEY, {
    fetch: fake((value, init) => {
      requests.push(value); const url = new URL(value);
      assert.equal(url.origin, 'https://api.steampowered.com');
      assert.equal(url.pathname, '/IPlayerService/GetOwnedGames/v1/');
      assert.equal(url.searchParams.get('key'), KEY);
      assert.deepEqual(JSON.parse(url.searchParams.get('input_json')!), { steamid: PROFILE, include_appinfo: true, include_played_free_games: false });
      assert.equal(init?.redirect, 'manual'); assert.equal(init?.credentials, 'omit');
      assert.equal(init?.body, undefined); assert.ok(!value.includes('do-not-send'));
      assert.deepEqual(Object.keys(init?.headers ?? {}), ['Accept']);
      return json(owned([entry()]));
    }),
  });
  assert.equal(requests.length, 1); assert.equal(result.reportedCount, 1);
  assert.equal(result.steamId, PROFILE); assert.equal(result.includePlayedFreeGames, false);
  assert.equal(JSON.stringify(result).includes(KEY), false);
});

test('自定义主页先解析vanity再读取同一官方账号；失败不会继续库存请求', async () => {
  const calls: string[] = [];
  const result = await readSteamLibrary({ profile: 'https://steamcommunity.com/id/my-vanity/', includePlayedFreeGames: true }, KEY, {
    fetch: fake(value => {
      const url = new URL(value); calls.push(url.pathname);
      assert.equal(url.hostname, 'api.steampowered.com');
      if (url.pathname === '/ISteamUser/ResolveVanityURL/v1/') {
        assert.deepEqual(JSON.parse(url.searchParams.get('input_json')!), { vanityurl: 'my-vanity' });
        return json({ response: { success: 1, steamid: PROFILE } });
      }
      return json(owned([]));
    }),
  });
  assert.equal(result.steamId, PROFILE);
  assert.deepEqual(calls, ['/ISteamUser/ResolveVanityURL/v1/', '/IPlayerService/GetOwnedGames/v1/']);
  let failedCalls = 0;
  await assert.rejects(readSteamLibrary({ profile: 'https://steamcommunity.com/id/unknown/', includePlayedFreeGames: true }, KEY, { fetch: fake(() => { failedCalls++; return json({ response: { success: 42 } }); }) }), /没有找到/);
  assert.equal(failedCalls, 1);
});

test('携带Key的API请求不跟随任何跳转，包括同域跳转', async () => {
  for (const destination of ['https://evil.example/collect?key=' + KEY, 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=' + KEY]) {
    let calls = 0;
    await assert.rejects(readSteamLibrary(readRequest, KEY, { fetch: fake((_url, init) => {
      calls++; assert.equal(init?.redirect, 'manual');
      return new Response(null, { status: 302, headers: { location: destination } });
    }) }), error => error instanceof Error && /不受支持的跳转/.test(error.message) && !error.message.includes(KEY));
    assert.equal(calls, 1);
  }
});

test('网络、HTTP及不可解析响应提供安全错误，绝不回显密钥或源URL', async () => {
  const scenarios = [
    { response: () => { throw new Error(`failure https://api.steampowered.com/?key=${KEY}`); }, expected: /无法连接 Steam/ },
    { response: () => new Response(KEY, { status: 403 }), expected: /拒绝了读取/ },
    { response: () => new Response(KEY, { status: 429 }), expected: /请求次数过多/ },
    { response: () => new Response(`<html>${KEY}</html>`, { headers: { 'content-type': 'text/html' } }), expected: /JSON/ },
    { response: () => new Response(KEY, { headers: { 'content-type': 'application/json' } }), expected: /无法解析/ },
  ];
  for (const scenario of scenarios) await assert.rejects(readSteamLibrary(readRequest, KEY, { fetch: fake(scenario.response) }), error => error instanceof Error && scenario.expected.test(error.message) && !error.message.includes(KEY) && !error.message.includes('https://'));
  let calls = 0;
  const noNetwork = { fetch: fake(() => { calls++; return json(owned([])); }) };
  await assert.rejects(readSteamLibrary({ profile: PROFILE, includePlayedFreeGames: 'true' }, KEY, noNetwork), /请求无效/);
  await assert.rejects(readSteamLibrary(readRequest, 'invalid', noNetwork), /32位/);
  assert.equal(calls, 0);
});

test('API响应有大小上限，超时与取消不暴露请求内容', async () => {
  await assert.rejects(readSteamLibrary(readRequest, KEY, { fetch: fake(() => new Response('a', { headers: { 'content-type': 'application/json', 'content-length': String(4 * 1024 * 1024 + 1) } })) }), /内容过大/);
  const fetchUntilAborted = fake((_url, init) => new Promise<Response>((_resolve, reject) => {
    const abort = () => reject(new Error(`sensitive-url?key=${KEY}`));
    if (init?.signal?.aborted) abort(); else init?.signal?.addEventListener('abort', abort, { once: true });
  }));
  await assert.rejects(readSteamLibrary(readRequest, KEY, { fetch: fetchUntilAborted, timeoutMs: 5 }), error => error instanceof Error && /超时/.test(error.message) && !error.message.includes(KEY));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readSteamLibrary(readRequest, KEY, { fetch: fetchUntilAborted, signal: controller.signal }), /已取消/);
});

test('连接记忆交由加密存储，返回状态不含Key，重新读取解密且清除不触碰收藏', t => {
  const directory = temp(t); const libraryFile = path.join(directory, 'library.json');
  const library = '{"personal":"unchanged"}\n'; fs.writeFileSync(libraryFile, library);
  const crypto = encryption(); const store = new SteamConnectionStore(directory, crypto);
  store.save(PROFILE, KEY, true);
  const raw = fs.readFileSync(path.join(directory, 'steam-connection.json'), 'utf8');
  assert.equal(raw.includes(KEY), false); assert.equal(raw.includes('apiKey'), false);
  assert.equal(store.key(), KEY);
  const state = store.state(); assert.deepEqual(state, { profile: PROFILE, hasApiKey: true, remembered: true, canRemember: true });
  assert.equal(JSON.stringify(state).includes(KEY), false);
  assert.equal(new SteamConnectionStore(directory, crypto).key(), KEY);
  assert.deepEqual(fs.readdirSync(directory).sort(), ['library.json', 'steam-connection.json']);
  assert.deepEqual(store.forget(), { profile: '', hasApiKey: false, remembered: false, canRemember: true });
  assert.equal(store.key(), ''); assert.equal(fs.existsSync(path.join(directory, 'steam-connection.json')), false);
  assert.equal(fs.readFileSync(libraryFile, 'utf8'), library);
});

test('临时连接只留内存，切换取消记忆移除已存连接，安全存储不可用仍可临时使用', t => {
  const directory = temp(t); const crypto = encryption();
  const store = new SteamConnectionStore(directory, crypto);
  store.save(PROFILE, KEY, true); store.save(PROFILE, KEY, false);
  assert.equal(fs.existsSync(path.join(directory, 'steam-connection.json')), false);
  assert.equal(store.state().hasApiKey, true); assert.equal(store.state().remembered, false);
  assert.equal(new SteamConnectionStore(directory, crypto).key(), '');
  const unavailable = new SteamConnectionStore(directory, encryption(false));
  assert.equal(unavailable.state().canRemember, false);
  assert.throws(() => unavailable.save(PROFILE, KEY, true), /安全存储不可用/);
  unavailable.save(PROFILE, KEY, false);
  assert.equal(unavailable.key(), KEY); assert.deepEqual(fs.readdirSync(directory), []);
});

test('损坏、超大、无法解密的连接文件安全失败，forget可恢复而不删除其他文件', t => {
  const directory = temp(t); const connectionFile = path.join(directory, 'steam-connection.json');
  const libraryFile = path.join(directory, 'library.json'); fs.writeFileSync(libraryFile, 'unchanged');
  for (const raw of ['broken-json-' + KEY, 'x'.repeat(16385), JSON.stringify({ version: 2, profile: PROFILE, encryptedKey: 'bogus' }), JSON.stringify({ version: 1, profile: PROFILE, encryptedKey: 'bogus' })]) {
    fs.writeFileSync(connectionFile, raw);
    const store = new SteamConnectionStore(directory, encryption());
    assert.throws(() => store.state(), error => error instanceof Error && /无法读取/.test(error.message) && !error.message.includes(KEY));
    assert.equal(fs.readFileSync(connectionFile, 'utf8'), raw);
    assert.equal(store.forget().hasApiKey, false);
    assert.equal(fs.readFileSync(libraryFile, 'utf8'), 'unchanged');
  }
});

test('加密保存失败只返回安全错误，不回显底层异常里的Key或创建明文文件', t => {
  const directory = temp(t);
  const crypto = { ...encryption(), encryptString() { throw new Error('sensitive encryption failure: ' + KEY); } };
  const store = new SteamConnectionStore(directory, crypto);
  assert.throws(() => store.save(PROFILE, KEY, true), error => error instanceof Error && /保存失败/.test(error.message) && !error.message.includes(KEY));
  assert.deepEqual(fs.readdirSync(directory), []);
  assert.equal(store.state().hasApiKey, false);
});

test('补全输入只保留允许字段，未知时长不变0，拒绝重复ID和非法分钟', () => {
  const result = validateSteamEnrichment([{ appId: 123, title: ' Game ', playtimeMinutes: 0, apiKey: KEY, sourceUrl: 'https://evil.example/', favorite: true, impression: '不要复制' }, { appId: '456', title: 'Unknown' }]);
  assert.equal(result[0].playtimeMinutes, 0); assert.equal(result[1].playtimeMinutes, undefined);
  assert.equal(result[0].sourceUrl, 'https://store.steampowered.com/app/123/');
  assert.equal(JSON.stringify(result).includes(KEY), false); assert.equal(JSON.stringify(result).includes('evil.example'), false);
  assert.throws(() => validateSteamEnrichment([{ appId: 1, title: 'A' }, { appId: '0001', title: 'B' }]), /重复/);
  assert.throws(() => validateSteamEnrichment([{ appId: 1, title: 'A', playtimeMinutes: -1 }]), /分钟/);
  assert.throws(() => validateSteamEnrichment(Array.from({ length: 2001 }, () => ({}))), /2000/);
});

test('补全已有封面不重复下载，保留明确时长和原有开发商，公共请求不携带Key', async () => {
  const urls: string[] = []; const progress: number[] = [];
  const input = [{ appId: '123', title: '自定义标题', playtimeMinutes: 0, creator: '自己保留', originalTitle: '自定义标题', coverUrl: COVER, apiKey: KEY }, { appId: '456', title: '缺图作品', playtimeMinutes: 2345, creator: '开发商', originalTitle: '缺图作品', year: '2020' }];
  const before = JSON.stringify(input);
  const result = await enrichSteamLibrary(input, {
    fetch: fake((value, init) => {
      urls.push(value); const url = new URL(value);
      assert.equal(url.searchParams.has('key'), false); assert.equal(value.includes(KEY), false);
      assert.equal(init?.credentials, 'omit'); assert.equal(init?.redirect, 'manual');
      if (url.hostname === 'store.steampowered.com') return json({ '123': { success: true, data: { type: 'game', name: 'API title', developers: ['外来开发商'], release_date: { date: '2024-01-01' }, header_image: 'https://shared.fastly.steamstatic.com/steam/apps/123/header.jpg', playtimeMinutes: 999999 } } });
      assert.equal(url.hostname, 'shared.fastly.steamstatic.com');
      assert.ok(url.pathname.includes('/456/'));
      return new Response(png, { headers: { 'content-type': 'image/png' } });
    }),
    imageToDataUrl: bytes => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`,
    onProgress: value => { progress.push(value.completed); assert.equal(value.total, 2); },
  });
  assert.equal(JSON.stringify(input), before);
  assert.equal(result.games[0].coverUrl, COVER); assert.equal(result.games[0].creator, '自己保留');
  assert.equal(result.games[0].year, '2024'); assert.equal(result.games[0].playtimeMinutes, 0);
  assert.equal(result.games[1].playtimeMinutes, 2345); assert.ok(result.games[1].coverUrl?.startsWith('data:image/png;base64,'));
  assert.equal(result.missingCovers, 0); assert.equal(result.missingDetails, 0); assert.equal(result.cancelled, false);
  assert.equal(urls.length, 2); assert.deepEqual(progress.sort(), [1, 2]);
});

test('取消补全保留完整原清单和已取得部分资料，不继续排队工作', async () => {
  const controller = new AbortController(); let calls = 0;
  const games = Array.from({ length: 6 }, (_, index) => ({ appId: String(index + 1), title: `Game ${index}`, creator: '已有', originalTitle: `Game ${index}`, year: '2020', playtimeMinutes: index }));
  const result = await enrichSteamLibrary(games, {
    signal: controller.signal,
    fetch: fake(() => { calls++; return new Response(png, { headers: { 'content-type': 'image/png' } }); }),
    imageToDataUrl: () => COVER,
    onProgress: () => controller.abort(),
  });
  assert.equal(result.cancelled, true); assert.equal(result.games.length, games.length);
  assert.ok(calls >= 1 && calls <= 2); assert.ok(result.games.some(game => game.coverUrl === COVER));
  assert.ok(result.games.some(game => !game.coverUrl));
  assert.deepEqual(result.games.map(game => game.playtimeMinutes), [0, 1, 2, 3, 4, 5]);
  const alreadyCancelled = new AbortController(); alreadyCancelled.abort(); let unexpected = 0;
  const untouched = await enrichSteamLibrary(games, { signal: alreadyCancelled.signal, fetch: fake(() => { unexpected++; return json({}); }) });
  assert.equal(untouched.cancelled, true); assert.equal(unexpected, 0);
});

test('元数据429停止后续详细资料请求，保留全部清单、原时长和已有封面', async () => {
  let detailsCalls = 0;
  const games = Array.from({ length: 8 }, (_, index) => ({ appId: String(index + 1), title: `Game ${index}`, playtimeMinutes: index, coverUrl: COVER }));
  const result = await enrichSteamLibrary(games, { fetch: fake(value => {
    assert.equal(new URL(value).hostname, 'store.steampowered.com'); detailsCalls++;
    return new Response('', { status: 429 });
  }) });
  assert.equal(result.detailsRateLimited, true); assert.ok(detailsCalls <= 2); assert.ok(detailsCalls > 0);
  assert.equal(result.games.length, 8); assert.equal(result.missingDetails, 8); assert.equal(result.missingCovers, 0);
  assert.deepEqual(result.games.map(game => game.playtimeMinutes), games.map(game => game.playtimeMinutes));
});

test('仅原名缺失也会读取详情：来源有不同原名则补，相同则保持 (N3-C)', async () => {
  const hosts: string[] = [];
  const result = await enrichSteamLibrary([{ appId: '123', title: '本地标题', creator: '已有', year: '2020', playtimeMinutes: 5 }, { appId: '456', title: 'Same Title', creator: '已有', year: '2021', playtimeMinutes: 6 }], {
    fetch: fake(value => { hosts.push(new URL(value).hostname); if (new URL(value).hostname === 'store.steampowered.com') return json({ '123': { success: true, data: { type: 'game', name: 'API 不同原名', developers: ['d'], release_date: { date: '2024-01-01' } } }, '456': { success: true, data: { type: 'game', name: 'Same Title', developers: ['d'], release_date: { date: '2021-01-01' } } } }); return new Response(png, { headers: { 'content-type': 'image/png' } }); }),
    imageToDataUrl: () => COVER,
  });
  assert.ok(hosts.filter(host => host === 'store.steampowered.com').length >= 1, '原名缺失触发详情请求');
  assert.equal(result.games[0].originalTitle, 'API 不同原名');
  assert.equal(result.games[1].originalTitle, 'Same Title', '来源确认同名也记录，重读幂等');
});

test('公共封面跨域跳转被拦截，HTML冒充图片也不进入本地收藏', async () => {
  const calls: string[] = []; let decoded = 0;
  const result = await enrichSteamLibrary([{ appId: '123', title: 'Game', creator: '已有', year: '2020' }], {
    fetch: fake(value => {
      calls.push(value);
      return calls.length === 1 ? new Response(null, { status: 302, headers: { location: 'https://evil.example/leak' } }) : new Response('<html>not-image</html>', { headers: { 'content-type': 'image/png' } });
    }),
    imageToDataUrl: () => { decoded++; return COVER; },
  });
  assert.equal(calls.some(value => value.includes('evil.example')), false);
  assert.equal(decoded, 0); assert.equal(result.games[0].coverUrl, undefined); assert.equal(result.missingCovers, 1);
});

test('封面来源限流后停止整批继续请求，已有资料和时长仍然保留', async () => {
  let calls = 0;
  const games = Array.from({ length: 8 }, (_, index) => ({ appId: String(index + 1), title: `Game ${index}`, creator: '已有', originalTitle: `Game ${index}`, year: '2020', playtimeMinutes: index }));
  const result = await enrichSteamLibrary(games, { fetch: fake(() => { calls++; return new Response('', { status: 429 }); }) });
  assert.ok(calls > 0 && calls <= 2);
  assert.equal(result.detailsRateLimited, true);
  assert.equal(result.missingCovers, 8);
  assert.deepEqual(result.games.map(game => game.playtimeMinutes), games.map(game => game.playtimeMinutes));
});
