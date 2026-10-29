import assert from 'node:assert/strict';
import test from 'node:test';
import { createSteamImportItems, parseSteamImport, previewSteamImport, steamAppIdFromUrl, STEAM_IMPORT_MAX_BYTES, STEAM_IMPORT_MAX_GAMES } from './steamImport.ts';
import { isValidSnapshot, platformsFor } from './library.ts';
import type { MediaItem } from './types.ts';

const existing = (id: string, extra: Partial<MediaItem> = {}): MediaItem => ({
  id, title: id, category: 'game', subcategory: 'Switch', creator: '自定义', year: '2020',
  status: 'paused', gamePlayState: 'paused', playtimeMinutes: 7, tags: ['我的标签'],
  impression: '已有印象不可覆盖', favorite: true, artwork: 'default', createdAt: '2020-01-01', updatedAt: '2020-01-01', ...extra,
});

test('接受官方 GetOwnedGames 三种 JSON 包装，保留零分钟而不发明缺失时长', () => {
  const games = [{ appid: 123, name: ' 游戏A ', playtime_forever: 0 }, { appid: '00456', name: '游戏B' }];
  for (const data of [{ response: { games, game_count: 2 } }, { games }, games]) {
    const result = parseSteamImport(JSON.stringify(data));
    assert.deepEqual(result, { games: [{ appId: '123', title: '游戏A', playtimeMinutes: 0 }, { appId: '456', title: '游戏B' }], skipped: [] });
  }
});

test('纯名称、链接与分钟文本混合导入，错误行单独指出且不丢弃其他行', () => {
  const result = parseSteamImport('\uFEFF游戏A\n游戏B | https://store.steampowered.com/app/456/Game/?l=schinese | 120\n游戏C\thttps://store.steampowered.com/app/789/\t0\n错误链接 | https://evil.example/app/123/\n错误分钟 | | -1\nhttps://store.steampowered.com/app/123/\n太多列 | | | extra');
  assert.deepEqual(result.games, [{ title: '游戏A' }, { title: '游戏B', appId: '456', playtimeMinutes: 120 }, { title: '游戏C', appId: '789', playtimeMinutes: 0 }]);
  assert.deepEqual(result.skipped.map(w => w.row), [4, 5, 6, 7]);
  assert.equal(parseSteamImport('有效名称\n\n错误行 | https://evil.example/').skipped[0].row, 3);
  assert.equal(parseSteamImport('\n有效名称\n\n错误行 | https://evil.example/\n').skipped[0].row, 4);
});

test('JSON 逐行校验 AppID、分钟、名称与对象，未知字段不进入结果', () => {
  const result = parseSteamImport(JSON.stringify({ games: [
    { appid: 123, name: '有效', playtime_forever: 42, password: '不应保存', coverUrl: 'https://evil.example/a.png' },
    { appid: 0, name: '零编号' }, { appid: 4294967296, name: '越界' }, { appid: 1.5, name: '小数' },
    { name: '负数时长', playtime_forever: -1 }, { name: '小数时长', playtime_forever: 0.1 },
    { appid: 321 }, { name: ' ' }, { name: '长'.repeat(201) }, null, [],
  ] }));
  assert.deepEqual(result.games, [{ title: '有效', appId: '123', playtimeMinutes: 42 }]);
  assert.equal(result.skipped.length, 10);
});

test('原型字段、未知 JSON 结构及无名称 API 结果不能冒充游戏', () => {
  assert.throws(() => parseSteamImport('{"__proto__":{"games":[{"name":"不可继承"}]}}'), /没有找到 games/);
  assert.throws(() => parseSteamImport('{"response":{}}'), /没有找到 games/);
  assert.throws(() => parseSteamImport('{bad json'), /JSON 格式不完整/);
  assert.throws(() => parseSteamImport('   '), /请粘贴/);
  assert.deepEqual(parseSteamImport('{"response":{"games":[]}}'), { games: [], skipped: [] });
  assert.equal(parseSteamImport('[{"appid":123}]').skipped.length, 1);
  assert.equal(({} as Record<string, unknown>).games, undefined);
});

test('输入量上限在解析/生成记录前执行', () => {
  assert.throws(() => parseSteamImport('a'.repeat(STEAM_IMPORT_MAX_BYTES + 1)), /2 MB/);
  assert.throws(() => parseSteamImport('中'.repeat(Math.floor(STEAM_IMPORT_MAX_BYTES / 3) + 1)), /2 MB/);
  assert.throws(() => parseSteamImport(Array.from({ length: STEAM_IMPORT_MAX_GAMES + 1 }, (_, n) => `游戏${n}`).join('\n')), /最多导入 2000/);
});

test('只提取合法 Steam 商店游戏编号，拒绝仿域名、凭据、端口与其他协议', () => {
  assert.equal(steamAppIdFromUrl('https://store.steampowered.com/app/000123/name/?x=1'), '123');
  for (const url of ['https://store.steampowered.com.evil.example/app/123/', 'https://evil@store.steampowered.com/app/123/', 'https://store.steampowered.com:1234/app/123/', 'file://store.steampowered.com/app/123/', 'https://store.steampowered.com/app/0/', 'https://store.steampowered.com/app/123abc/', 'https://steamcommunity.com/profiles/123/']) assert.equal(steamAppIdFromUrl(url), undefined);
});

test('已有外部编号和旧来源链接判定重复，同名兼容原名与全角大小写但不跨板块', () => {
  const items = [
    existing('编号记录', { externalIds: [{ provider: 'steam', id: '123' }] }),
    existing('旧链接记录', { sourceUrl: 'http://store.steampowered.com/app/456/old/' }),
    existing('中文名', { originalTitle: 'Ａ Game' }),
    existing('仅书籍同名', { title: '新游戏', category: 'book' }),
  ];
  const rows = previewSteamImport([{ title: '新标题', appId: '123' }, { title: '另一标题', appId: '456' }, { title: 'a   game' }, { title: '新游戏' }], items);
  assert.deepEqual(rows.map(row => row.duplicate), ['existing-id', 'existing-id', 'existing-name', null]);
  assert.equal(rows[0].matchedTitle, '编号记录');
});

test('同一清单按 appid 与名称去重，保留首条供选择', () => {
  const rows = previewSteamImport([{ title: '游戏一', appId: '123' }, { title: '不同译名', appId: '123' }, { title: '游戏一', appId: '456' }, { title: '新游戏' }, { title: '新游戏' }], []);
  assert.deepEqual(rows.map(row => row.duplicate), [null, 'source-id', 'source-name', null, 'source-name']);
  assert.equal(new Set(rows.map(row => row.key)).size, 5);
});

test('创建记录保留明确时长，默认待体验，不生成游玩经历或远程封面', () => {
  const items = createSteamImportItems([{ title: '有时长', appId: '123', playtimeMinutes: 1234 }, { title: '零时长', playtimeMinutes: 0 }, { title: '无时长' }]);
  assert.equal(isValidSnapshot({ schemaVersion: 1, items }), true);
  assert.equal(new Set(items.map(item => item.id)).size, 3);
  for (const item of items) {
    assert.equal(item.status, 'want'); assert.equal(item.gamePlayState, 'want'); assert.equal(item.impression, ''); assert.equal(item.favorite, false);
    assert.equal(item.experienceEntries, undefined); assert.equal(item.coverUrl, undefined); assert.equal(item.creator, ''); assert.equal(item.year, '');
    assert.deepEqual(item.platforms, ['Steam']);
  }
  assert.equal(items[0].playtimeMinutes, 1234); assert.equal(items[1].playtimeMinutes, 0); assert.equal(items[2].playtimeMinutes, undefined);
  assert.equal(items[0].externalIds?.[0].id, '123'); assert.equal(items[0].sourceUrl, 'https://store.steampowered.com/app/123/');
  assert.equal(items[2].externalIds, undefined); assert.equal(items[2].sourceUrl, undefined);
});

test('批量预览与追加流程保留已有个人数据、未知字段和输入，不发生隐式合并', () => {
  const item = { ...existing('不能动', { externalIds: [{ provider: 'steam', id: '123' }], experienceEntries: [{ id: 'e', date: '2021-03', kind: 'note' as const, note: '真实记录' }] }), future: { data: 7 } };
  const parsed = parseSteamImport('[{"name":"另一名字","appid":123,"playtime_forever":9999},{"name":"新作品","appid":456}]');
  const before = JSON.stringify({ item, parsed });
  const rows = previewSteamImport(parsed.games, [item]);
  const updated = [item, ...createSteamImportItems(rows.filter(row => !row.duplicate).map(row => row.game))];
  assert.equal(JSON.stringify({ item, parsed }), before);
  assert.strictEqual(updated[0], item);
  assert.equal(updated.length, 2);
  assert.equal(updated[0].playtimeMinutes, 7);
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: updated }), true);
});

test('影视书籍音乐纯文本按所选板块解析，不推断影视类型或把名称解析成游戏', () => {
  for (const category of ['screen', 'book', 'music'] as const) {
    const parsed = parseSteamImport('作品甲\n作品乙', category);
    const items = createSteamImportItems(parsed.games);
    assert.equal(items.length, 2);
    items.forEach(item => { assert.equal(item.category, category); assert.equal(item.status, 'want'); assert.equal(item.gamePlayState, undefined); assert.equal(item.platforms, undefined); });
    assert.equal(items[0].subcategory, '');
  }
});

test('显式 qiyu.batch.v1 清单只应用白名单元数据，拒绝完整备份误作批量新增', () => {
  const parsed = parseSteamImport(JSON.stringify({ format: 'qiyu.batch.v1', items: [{
    title: ' 星际穿越 ', originalTitle: 'Interstellar', category: 'screen', subcategory: '电影', creator: '克里斯托弗·诺兰', year: '2014',
    sourceUrl: 'https://movie.douban.com/subject/1889243/', externalIds: [{ provider: 'douban', id: '1889243', url: 'https://movie.douban.com/subject/1889243/' }],
    tags: ['科幻', ' 科幻 ', '亲情'], coverUrl: 'data:image/jpeg;base64,AAAA',
    status: 'finished', favorite: true, impression: '从外部清单偷带', experienceEntries: [{ date: '2026-01-01' }], future: '不进入新项',
  }] }));
  assert.equal(parsed.skipped.length, 0);
  const [added] = createSteamImportItems(parsed.games);
  assert.equal(added.title, '星际穿越'); assert.equal(added.originalTitle, 'Interstellar'); assert.equal(added.category, 'screen'); assert.equal(added.subcategory, '电影');
  assert.equal(added.creator, '克里斯托弗·诺兰'); assert.equal(added.year, '2014'); assert.deepEqual(added.tags, ['科幻', '亲情']);
  assert.equal(added.externalIds?.[0].id, '1889243'); assert.equal(added.coverUrl, 'data:image/jpeg;base64,AAAA');
  assert.equal(added.status, 'want'); assert.equal(added.favorite, false); assert.equal(added.impression, ''); assert.equal(added.experienceEntries, undefined);
  assert.equal((added as unknown as Record<string, unknown>).future, undefined);
  assert.throws(() => parseSteamImport(JSON.stringify({ schemaVersion: 1, items: [added] })), /完整收藏备份/);
  assert.throws(() => parseSteamImport('{"format":"qiyu.batch.v9","items":[]}'), /不受支持/);
});

test('初始状态由用户显式指定，已完成作品不伪造完成日期', () => {
  const games = parseSteamImport('电影甲', 'screen').games;
  const [added] = createSteamImportItems(games, 'finished');
  assert.equal(added.status, 'finished'); assert.equal(added.experienceEntries, undefined);
  assert.equal(createSteamImportItems([{ title: '游戏甲' }], 'finished')[0].gamePlayState, 'cleared');
  assert.equal(createSteamImportItems([{ title: '游戏乙' }], 'active')[0].gamePlayState, 'playing');
});

test('通用游戏清单精确保留明确分钟与零值，缺失时长和个人经历仍不猜测', () => {
  const result = parseSteamImport(JSON.stringify({ format: 'qiyu.batch.v1', items: [
    { title: 'Steam 作品', category: 'game', playtimeMinutes: 12345, externalIds: [{ provider: 'steam', id: '123' }],
      status: 'finished', gamePlayState: 'cleared', favorite: true, impression: '不可带入', experienceEntries: [{ id: 'outside', date: '2020-01-01' }] },
    { title: '零分钟', category: 'game', playtimeMinutes: 0 },
    { title: '没有时长', category: 'game' },
    { title: '最大安全分钟', category: 'game', playtimeMinutes: Number.MAX_SAFE_INTEGER },
  ] }));
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(result.games.map(game => game.playtimeMinutes), [12345, 0, undefined, Number.MAX_SAFE_INTEGER]);
  const items = createSteamImportItems(result.games);
  assert.deepEqual(items.map(item => item.playtimeMinutes), [12345, 0, undefined, Number.MAX_SAFE_INTEGER]);
  assert.equal(Object.hasOwn(items[2], 'playtimeMinutes'), false);
  assert.equal(items[0].externalIds?.[0].id, '123');
  for (const item of items) {
    assert.equal(item.status, 'want'); assert.equal(item.gamePlayState, 'want');
    assert.equal(item.favorite, false); assert.equal(item.impression, ''); assert.equal(item.experienceEntries, undefined);
  }
});

test('通用清单逐行拒绝非法分钟和非游戏时长，继续保留其他有效作品', () => {
  const invalid = [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '120', '', null, true, {}, []];
  const rows = [
    { title: '有效游戏', category: 'game', playtimeMinutes: 60 },
    ...invalid.map((playtimeMinutes, index) => ({ title: `错误分钟${index}`, category: 'game', playtimeMinutes })),
    ...['book', 'screen', 'music'].map(category => ({ title: `错误板块${category}`, category, playtimeMinutes: 0 })),
    { title: '无时长的电影', category: 'screen' },
  ];
  const result = parseSteamImport(JSON.stringify({ format: 'qiyu.batch.v1', items: rows }));
  assert.deepEqual(result.games, [
    { title: '有效游戏', category: 'game', playtimeMinutes: 60 },
    { title: '无时长的电影', category: 'screen' },
  ]);
  assert.deepEqual(result.skipped.map(warning => warning.row), Array.from({ length: invalid.length + 3 }, (_, index) => index + 2));
  assert.ok(result.skipped.slice(0, invalid.length).every(warning => /非负安全整数/.test(warning.reason)));
  assert.ok(result.skipped.slice(invalid.length).every(warning => /仅适用于游戏/.test(warning.reason)));
});

test('清单逐项拒绝错误板块、远程图片、危险链接及不对应的豆瓣身份', () => {
  const base = { title: '电影', category: 'screen' };
  const invalid = [
    { ...base, category: 'other' }, { ...base, sourceUrl: 'javascript:alert(1)' }, { ...base, sourceUrl: 'https://user:secret@example.com/' },
    { ...base, coverUrl: 'https://img1.doubanio.com/poster.jpg' }, { ...base, coverUrl: 'data:image/svg+xml;base64,AAAA' },
    { ...base, externalIds: [{ provider: 'steam', id: '123' }] },
    { ...base, externalIds: [{ provider: 'douban', id: '123', url: 'https://movie.douban.com/subject/456/' }] },
    { ...base, externalIds: [{ provider: 'douban', id: '123', url: 'https://book.douban.com/subject/123/' }] },
    { ...base, tags: ['标签', 3] }, { ...base, year: 2014 },
  ];
  const result = parseSteamImport(JSON.stringify({ format: 'qiyu.batch.v1', items: [{ ...base, title: '有效作品' }, ...invalid] }));
  assert.equal(result.games.length, 1); assert.equal(result.skipped.length, invalid.length);
});

test('影视优先按豆瓣编号去重，同板块同名同年份跳过，同名不同年份允许，跨板块不误判', () => {
  const works = [
    existing('Interstellar', { category: 'screen', title: '星际穿越', originalTitle: 'Interstellar', year: '2014', externalIds: [{ provider: 'douban', id: '1889243' }] }),
    existing('旧链接', { category: 'screen', sourceUrl: 'https://movie.douban.com/subject/42/' }),
  ];
  const rows = previewSteamImport([
    { title: '另一个译名', category: 'screen', externalIds: [{ provider: 'douban', id: '1889243' }] },
    { title: '星际穿越', category: 'screen', year: '2014' },
    { title: '星际穿越', category: 'screen', year: '2026' },
    { title: '星际穿越', category: 'book', year: '2014' },
    { title: '其他名', category: 'screen', externalIds: [{ provider: 'douban', id: '42' }] },
  ], works);
  assert.deepEqual(rows.map(row => row.duplicate), ['existing-id', 'existing-name', null, null, 'existing-id']);
});

test('通用游戏清单保留平台与四组标签，未给平台时不猜Steam', () => {
  const result = parseSteamImport(JSON.stringify({ format: 'qiyu.batch.v1', items: [
    { title: '多平台作品', category: 'game', subcategory: 'Switch', platforms: ['Switch', 'PS5', ' switch '],
      tags: ['额外印象', '动作'], gameTags: { gameplay: ['动作'], theme: ['奇幻'], scenario: ['需要沉浸'], other: ['其他'] } },
    { title: '未知平台', category: 'game' },
    { title: '旧分类格式', category: 'game', subcategory: 'Switch' },
    { title: 'Steam身份', category: 'game', externalIds: [{ provider: 'steam', id: '123' }] },
    { title: '不合法分组', category: 'game', gameTags: { gameplay: [] } },
    { title: '不合法平台', category: 'book', platforms: ['Switch'] },
  ] }));
  assert.equal(result.skipped.length, 2);
  const [multi, unknown, legacy, steam] = createSteamImportItems(result.games);
  assert.deepEqual(multi.platforms, ['Switch', 'PS5']); assert.equal(multi.subcategory, 'Switch');
  assert.deepEqual(multi.gameTags, { gameplay: ['动作'], theme: ['奇幻'], scenario: ['需要沉浸'], other: ['其他', '额外印象'] });
  assert.deepEqual(multi.tags, ['动作', '奇幻', '需要沉浸', '其他', '额外印象']);
  assert.equal(unknown.platforms, undefined); assert.equal(unknown.subcategory, '');
  assert.equal(legacy.platforms, undefined); assert.deepEqual(platformsFor(legacy), ['Switch']);
  assert.deepEqual(steam.platforms, ['Steam']);
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [multi, unknown, legacy, steam] }), true);
});

test('候选原名和现有名称双向参与去重，同时保留年份与板块区别', () => {
  const english = existing('en', { category: 'screen', title: 'Interstellar', year: '2014' });
  const chinese = existing('zh', { category: 'screen', title: '星际穿越', originalTitle: 'Interstellar', year: '2014' });
  const incomingChinese = { title: '星际穿越', originalTitle: ' Ｉｎｔｅｒｓｔｅｌｌａｒ ', category: 'screen' as const, year: '2014' };
  const incomingEnglish = { title: 'Interstellar', category: 'screen' as const, year: '2014' };
  assert.equal(previewSteamImport([incomingChinese], [english])[0].duplicate, 'existing-name');
  assert.equal(previewSteamImport([incomingEnglish], [chinese])[0].duplicate, 'existing-name');
  assert.equal(previewSteamImport([{ ...incomingChinese, title: '不同译名' }], [chinese])[0].duplicate, 'existing-name');
  assert.equal(previewSteamImport([{ ...incomingChinese, year: '2026' }], [english])[0].duplicate, null);
  assert.equal(previewSteamImport([{ ...incomingChinese, category: 'book' }], [english])[0].duplicate, null);
  assert.equal(previewSteamImport([{ ...incomingChinese, year: undefined }], [english])[0].duplicate, 'existing-name');
});

test('同清单原名别名去重不受先后顺序影响，年份与板块仍独立', () => {
  const english = { title: 'Interstellar', category: 'screen' as const, year: '2014' };
  const chinese = { title: '星际穿越', originalTitle: 'Interstellar', category: 'screen' as const, year: '2014' };
  for (const records of [[english, chinese], [chinese, english]]) {
    assert.deepEqual(previewSteamImport(records, []).map(row => row.duplicate), [null, 'source-name']);
    assert.deepEqual(previewSteamImport([records[0], { ...records[1], year: '2026' }], []).map(row => row.duplicate), [null, null]);
    assert.deepEqual(previewSteamImport([records[0], { ...records[1], category: 'book' }], []).map(row => row.duplicate), [null, null]);
  }
  assert.deepEqual(previewSteamImport([chinese, { title: '另一译名', originalTitle: 'Interstellar', category: 'screen', year: '2014' }], []).map(row => row.duplicate), [null, 'source-name']);
});

test('候选来源链接与已有外部编号对称匹配，清单内同链接不同译名也只保留首件', () => {
  for (const source of [
    { category: 'game', provider: 'steam', url: 'https://store.steampowered.com/app/000123/a-name/?l=schinese' },
    { category: 'screen', provider: 'douban', url: 'https://movie.douban.com/subject/123/?from=search' },
    { category: 'book', provider: 'douban', url: 'http://book.douban.com/subject/123/' },
  ] as const) {
    const withId = { title: '编号译名', category: source.category, year: '2020', externalIds: [{ provider: source.provider, id: '123' }] };
    const withUrl = { title: '来源译名', category: source.category, year: '2026', sourceUrl: source.url };
    const libraryById = existing('known-id', withId);
    const libraryByUrl = existing('known-url', withUrl);
    assert.equal(previewSteamImport([withUrl], [libraryById])[0].duplicate, 'existing-id');
    assert.equal(previewSteamImport([withId], [libraryByUrl])[0].duplicate, 'existing-id');
    for (const records of [[withId, withUrl], [withUrl, withId]]) assert.deepEqual(previewSteamImport(records, []).map(row => row.duplicate), [null, 'source-id']);
    const anotherUrlName = { ...withUrl, title: '又一译名' };
    assert.deepEqual(previewSteamImport([withUrl, anotherUrlName], []).map(row => row.duplicate), [null, 'source-id']);
    assert.deepEqual(previewSteamImport([anotherUrlName, withUrl], []).map(row => row.duplicate), [null, 'source-id']);
  }
});

test('来源身份严格限制协议主机板块与路径，仿域或无效链接双向都不误判', () => {
  for (const source of [
    { category: 'game', provider: 'steam', host: 'store.steampowered.com', path: 'app' },
    { category: 'screen', provider: 'douban', host: 'movie.douban.com', path: 'subject' },
    { category: 'book', provider: 'douban', host: 'book.douban.com', path: 'subject' },
  ] as const) {
    const withId = { title: '编号作品', category: source.category, externalIds: [{ provider: source.provider, id: '123' }] };
    const invalidUrls = [
      `https://${source.host}.evil.example/${source.path}/123/`, `file://${source.host}/${source.path}/123/`,
      `https://user:secret@${source.host}/${source.path}/123/`, `https://${source.host}:1234/${source.path}/123/`,
      `https://${source.host}/${source.path}/123abc/`, `https://${source.host}/other/${source.path}/123/`,
      `https://${source.host}/${source.path}/0/`,
      ...(source.provider === 'douban' ? [`https://${source.category === 'book' ? 'movie' : 'book'}.douban.com/subject/123/`] : []),
    ];
    for (const url of invalidUrls) {
      const withUrl = { title: '来源作品', category: source.category, sourceUrl: url };
      assert.equal(previewSteamImport([withUrl], [existing('known-id', withId)])[0].duplicate, null, url);
      assert.equal(previewSteamImport([withId], [existing('known-url', withUrl)])[0].duplicate, null, url);
      assert.deepEqual(previewSteamImport([withId, withUrl], []).map(row => row.duplicate), [null, null], url);
    }
  }
});


test('游戏导入明确设置独立关系与通关进度，不推算次数、日期或评级；非游戏不带游戏字段', () => {
  const items = createSteamImportItems([{ title: '重玩合成样例', appId: '1234' }, { title: '合成电影', category: 'screen' }], 'want', 'playing', 'cleared');
  assert.equal(items[0].playEngagement, 'playing'); assert.equal(items[0].completion, 'cleared');
  assert.equal(items[0].completionCount, undefined); assert.equal(items[0].completionEvents, undefined);
  assert.equal(items[0].personalGrade, undefined); assert.equal(items[0].experienceEntries, undefined);
  assert.equal(items[1].playEngagement, undefined); assert.equal(items[1].completion, undefined); assert.equal(items[1].status, 'want');
});
