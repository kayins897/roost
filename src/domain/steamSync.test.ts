import assert from 'node:assert/strict';
import test from 'node:test';
import { applySteamSync, planSteamSync } from './steamSync.ts';
import { isValidSnapshot } from './library.ts';
import type { SteamLibraryGame } from './steamSync.ts';
import type { MediaItem } from './types.ts';

const item = (extra: Partial<MediaItem> = {}): MediaItem => ({
  id: 'original', title: '我的标题', category: 'game', subcategory: 'Switch', creator: '', year: '',
  status: 'paused', gamePlayState: 'paused', playtimeMinutes: 1020, tags: ['自定义'],
  impression: '自己的印象', favorite: true, artwork: 'default', createdAt: '2020-01-01', updatedAt: '2020-01-02',
  externalIds: [{ provider: 'steam', id: '123' }], ...extra,
});
const game = (extra: Partial<SteamLibraryGame> = {}): SteamLibraryGame => ({ appId: '123', title: 'API 标题', creator: '开发商', year: '2022', playtimeMinutes: 785, ...extra });
const options = { updatePlaytime: true };

test('按确切 Steam 编号补缺资料、保留较高个人分钟和所有个人及未知字段', () => {
  const original = { ...item(), future: { nested: ['不可丢'] }, experienceEntries: [{ id: 'experience', date: '2020-01', kind: 'note' as const, note: '亲手填写' }] };
  const games = [game({ originalTitle: 'Original', coverUrl: 'data:image/jpeg;base64,YQ==' })];
  const before = JSON.stringify({ original, games });
  const [row] = planSteamSync(games, [original], options);
  assert.equal(row.kind, 'update');
  assert.equal(row.existingId, original.id);
  assert.equal(row.retainedHigherMinutes, true);
  assert.deepEqual(row.fields.sort(), ['coverUrl', 'creator', 'originalTitle', 'platforms', 'sourceUrl', 'year'].sort());
  const result = applySteamSync(games, [original], ['123'], options);
  assert.equal(result.added, 0); assert.equal(result.updated, 1); assert.equal(result.unchanged, 0);
  const updated = result.items[0] as typeof original;
  assert.equal(updated.creator, '开发商'); assert.equal(updated.year, '2022'); assert.equal(updated.playtimeMinutes, 1020);
  assert.deepEqual(updated.platforms, ['Switch', 'Steam']);
  for (const key of ['id', 'title', 'createdAt', 'status', 'gamePlayState', 'tags', 'impression', 'favorite', 'experienceEntries', 'future'] as const) assert.deepEqual(updated[key], original[key]);
  assert.equal(JSON.stringify({ original, games }), before);
});

test('Steam再次补资料或更新时长保留本人已放弃状态，不采信来源的游玩状态', () => {
  const original = { ...item({ gamePlayState: 'abandoned' }), future: { keep: true } };
  const originalRaw = JSON.stringify(original);
  const incoming = { ...game({ playtimeMinutes: 2000 }), gamePlayState: 'playing' as const, status: 'active' as const };
  for (const updatePlaytime of [true, false]) {
    const result = applySteamSync([incoming], [original], ['123'], { updatePlaytime });
    assert.equal(result.updated, 1);
    const updated = result.items[0] as typeof original;
    assert.equal(updated.gamePlayState, 'abandoned'); assert.equal(updated.status, 'paused');
    assert.equal(updated.playtimeMinutes, updatePlaytime ? 2000 : original.playtimeMinutes);
    assert.equal(updated.creator, '开发商'); assert.equal(updated.year, '2022');
    assert.deepEqual(updated.future, original.future); assert.deepEqual(updated.tags, original.tags);
    assert.equal(updated.impression, original.impression); assert.equal(updated.favorite, original.favorite);
    assert.equal(isValidSnapshot({ schemaVersion: 1, items: result.items }), true);
    assert.equal(JSON.stringify(original), originalRaw);
    const repeated = applySteamSync([incoming], result.items, ['123'], { updatePlaytime });
    assert.equal(repeated.updated, 0); assert.equal(repeated.items[0], updated);
  }
});

test('Steam补全和时长更新保留旧replaying与ongoing原值，不主动规范化个人状态', () => {
  for (const gamePlayState of ['replaying', 'ongoing'] as const) {
    const original = item({ gamePlayState, status: 'active' }); const before = JSON.stringify(original);
    const result = applySteamSync([game({ playtimeMinutes: 2000 })], [original], ['123'], options);
    assert.equal(result.updated, 1); assert.equal(result.items[0].creator, '开发商');
    assert.equal(result.items[0].playtimeMinutes, 2000); assert.equal(result.items[0].gamePlayState, gamePlayState);
    assert.equal(result.items[0].status, 'active'); assert.equal(result.items[0].impression, original.impression);
    assert.equal(isValidSnapshot({ schemaVersion: 1, items: result.items }), true);
    assert.equal(JSON.parse(JSON.stringify(result.items[0])).gamePlayState, gamePlayState);
    assert.equal(JSON.stringify(original), before);
  }
});

test('新增保留明确零分钟和未知分钟，默认待体验且不采信外来个人字段', () => {
  const injected = { ...game({ appId: '456', playtimeMinutes: 0 }), favorite: true, status: 'finished', impression: '外来字段', tags: ['不采信'], experienceEntries: [{ date: '2000' }] };
  const result = applySteamSync([injected, game({ appId: '789', title: '第二款', playtimeMinutes: undefined })], [], new Set(['456', '789']), options);
  assert.equal(result.added, 2); assert.equal(result.updated, 0);
  assert.equal(result.items[0].playtimeMinutes, 0); assert.equal(result.items[1].playtimeMinutes, undefined);
  for (const added of result.items) {
    assert.equal(added.status, 'want'); assert.equal(added.gamePlayState, 'want');
    assert.equal(added.favorite, false); assert.equal(added.impression, ''); assert.deepEqual(added.tags, []);
    assert.equal(added.experienceEntries, undefined); assert.deepEqual(added.platforms, ['Steam']);
  }
});

test('只有同名无编号、多个已有编号匹配或记录内编号冲突都要求人工确认', () => {
  const sameName = item({ title: 'ＡPI   标题', externalIds: undefined });
  const duplicate = item({ id: 'second' });
  const contradictory = item({ sourceUrl: 'https://store.steampowered.com/app/456/' });
  for (const existing of [[sameName], [item(), duplicate], [contradictory]]) {
    assert.equal(planSteamSync([game()], existing, options)[0].kind, 'ambiguous');
    const result = applySteamSync([game()], existing, ['123'], options);
    assert.equal(result.added, 0); assert.equal(result.updated, 0); assert.equal(result.unchanged, 1);
    assert.deepEqual(result.items, existing);
  }
});

test('旧商店链接可确切匹配；相同名称的书籍不阻止游戏新增', () => {
  const legacy = item({ externalIds: undefined, sourceUrl: 'http://store.steampowered.com/app/000123/old/' });
  const result = applySteamSync([game()], [legacy], ['123'], options);
  assert.equal(result.updated, 1); assert.equal(result.items[0].externalIds?.[0].id, '123');
  assert.equal(result.items[0].sourceUrl, legacy.sourceUrl);
  assert.equal(planSteamSync([game()], [item({ category: 'book', title: 'API 标题', externalIds: undefined })], options)[0].kind, 'new');
});

test('仅更新较高明确时长，关闭时长更新保持现值，不清空缺失值', () => {
  for (const incoming of [undefined, 0, 784, 1020]) {
    const result = applySteamSync([game({ playtimeMinutes: incoming })], [item()], ['123'], options);
    assert.equal(result.items[0].playtimeMinutes, 1020);
  }
  assert.equal(applySteamSync([game({ playtimeMinutes: 2000 })], [item()], ['123'], options).items[0].playtimeMinutes, 2000);
  assert.equal(applySteamSync([game({ playtimeMinutes: 2000 })], [item()], ['123'], { updatePlaytime: false }).items[0].playtimeMinutes, 1020);
  assert.equal(applySteamSync([game({ playtimeMinutes: 0 })], [item({ playtimeMinutes: undefined })], ['123'], options).items[0].playtimeMinutes, 0);
});

test('重复同步幂等、未选记录不变，已有非空元数据和封面均保留', () => {
  const original = item({ creator: '自己的开发商', year: '1999', originalTitle: '自己的原名', coverUrl: 'data:image/png;base64,Yg==', platforms: ['Steam'], sourceUrl: 'https://example.org/personal' });
  const games = [game({ coverUrl: 'data:image/jpeg;base64,YQ==' }), game({ appId: '456', title: '新作品' })];
  const first = applySteamSync(games, [original], ['123'], options);
  assert.equal(first.unchanged, 1); assert.strictEqual(first.items[0], original);
  assert.equal(first.items.length, 1);
  const second = applySteamSync(games, first.items, ['456'], options);
  assert.equal(second.added, 1);
  const third = applySteamSync(games, second.items, ['123', '456'], options);
  assert.equal(third.added, 0); assert.equal(third.updated, 0); assert.equal(third.unchanged, 2);
  assert.deepEqual(third.items, second.items);
});

test('来源重复或不合法资料整体拒绝，旧选择不能跨读取结果误用', () => {
  assert.throws(() => planSteamSync([game(), game({ appId: '000123' })], [], options), /重复 AppID/);
  assert.throws(() => planSteamSync([game({ appId: '123/evil' })], [], options), /AppID 无效/);
  for (const playtimeMinutes of [-1, 1.2, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => planSteamSync([game({ playtimeMinutes })], [], options), /资料无效/);
  assert.throws(() => planSteamSync([game({ coverUrl: 'https://evil.example/a.png' })], [], options), /资料无效/);
  assert.throws(() => applySteamSync([game()], [], ['456'], options), /重新读取/);
});

test('批内不同编号的同名与交叉原名全部拦截，先后顺序或只选其中一款也不能重复新增', () => {
  const cases = [
    [game({ appId: '123', title: 'Ｒｏｏｍ：　１' }), game({ appId: '456', title: ' room:\t1 ' })],
    [game({ appId: '123', title: '中文作品', originalTitle: 'Shared Name' }), game({ appId: '456', title: ' shared   name ', originalTitle: '另一原名' })],
    [game({ appId: '123', title: '作品甲', originalTitle: '原名' }), game({ appId: '456', title: '作品乙', originalTitle: '原名' })],
  ];
  for (const games of cases) {
    const original = JSON.stringify(games);
    for (const ordered of [games, [...games].reverse()]) {
      assert.deepEqual(planSteamSync(ordered, [], options).map(row => row.kind), ['ambiguous', 'ambiguous']);
      for (const selected of [['123'], ['456'], ['123', '456']]) {
        const result = applySteamSync(ordered, [], selected, options);
        assert.equal(result.added, 0); assert.equal(result.updated, 0); assert.deepEqual(result.items, []);
      }
    }
    assert.equal(JSON.stringify(games), original);
  }
  // Keep meaningful punctuation: normalization must not invent a match.
  assert.deepEqual(planSteamSync([game({ title: 'Room 1' }), game({ appId: '456', title: 'Room: 1' })], [], options).map(row => row.kind), ['new', 'new']);
});

test('同名的两个已确切绑定编号仍分别更新并保持幂等，不按名称强行合并', () => {
  const originals = [item({ id: 'first', title: '同名作品' }), item({ id: 'second', title: '同名作品', externalIds: [{ provider: 'steam', id: '456' }] })];
  const games = [game({ title: '来源同名', creator: '开发商甲', playtimeMinutes: 2000 }), game({ appId: '456', title: '来源同名', creator: '开发商乙', playtimeMinutes: 3000 })];
  for (const ordered of [games, [...games].reverse()]) {
    const rows = planSteamSync(ordered, originals, options);
    assert.ok(rows.every(row => row.kind === 'update'));
    assert.deepEqual(Object.fromEntries(rows.map(row => [row.appId, row.existingId])), { '123': 'first', '456': 'second' });
    const result = applySteamSync(ordered, originals, ['123', '456'], options);
    assert.equal(result.added, 0); assert.equal(result.updated, 2); assert.equal(result.items.length, 2);
    assert.deepEqual(result.items.map(row => [row.id, row.title, row.creator, row.playtimeMinutes]), [
      ['first', '同名作品', '开发商甲', 2000], ['second', '同名作品', '开发商乙', 3000],
    ]);
    const repeated = applySteamSync(ordered, result.items, ['123', '456'], options);
    assert.equal(repeated.added, 0); assert.equal(repeated.updated, 0); assert.equal(repeated.unchanged, 2);
  }
});

test('来源同名中只放行已确切绑定的记录，不将新编号误加到已改名的旧作品旁', () => {
  const original = item({ title: '我自己的标题', originalTitle: undefined });
  const games = [game({ title: '来源同名' }), game({ appId: '456', title: '来源同名' })];
  for (const ordered of [games, [...games].reverse()]) {
    const rows = planSteamSync(ordered, [original], options);
    assert.equal(rows.find(row => row.appId === '123')?.kind, 'update');
    assert.equal(rows.find(row => row.appId === '456')?.kind, 'ambiguous');
    const result = applySteamSync(ordered, [original], ['123', '456'], options);
    assert.equal(result.added, 0); assert.equal(result.updated, 1); assert.equal(result.items.length, 1);
    assert.equal(result.items[0].id, original.id); assert.equal(result.items[0].title, original.title);
  }
});
