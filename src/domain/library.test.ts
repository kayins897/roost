import assert from 'node:assert/strict';
import test from 'node:test';
import { availableTags, deleteTag, filterLibrary, flattenGameTags, formatPlaytime, GAME_PLAY_LABELS, GAME_PLAY_STATES, gamePlayStateFor, gameTagCounts, gameTagsFor, isExperienceDate, isValidSnapshot, legacyStatusForGameState, normalizePlatforms, normalizeTags, platformsFor, renameTag, shouldShowPlaytime } from './library.ts';
import type { MediaItem } from './types.ts';

const make = (id: string, tags: string[]): MediaItem => ({
  id, title: id, category: 'game', subcategory: 'RPG', creator: '', year: '', status: 'want',
  tags, impression: '', favorite: false, artwork: 'blue', createdAt: '', updatedAt: '',
});
test('标签规范化移除重复与空白', () => {
  assert.deepEqual(normalizeTags([' RPG ', 'rpg', '', ' 剧情 ']), ['RPG', '剧情']);
});
test('标签重命名遇到已有标签时自动合并', () => {
  assert.deepEqual(renameTag([make('a', ['RPG', '剧情'])], 'RPG', '剧情')[0].tags, ['剧情']);
});
test('删除标签不会删除作品', () => {
  const items = deleteTag([make('a', ['RPG', '剧情'])], 'RPG');
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].tags, ['剧情']);
});
test('多个标签采用 AND 筛选', () => {
  const items = [make('a', ['RPG', '剧情']), make('b', ['RPG'])];
  assert.deepEqual(filterLibrary(items, { tags: ['RPG', '剧情'] }).map(x => x.id), ['a']);
});
test('子分类支持按平台筛选', () => {
  const steam = { ...make('a', []), subcategory: 'Steam' };
  const switchGame = { ...make('b', []), subcategory: 'Switch' };
  assert.deepEqual(filterLibrary([steam, switchGame], { subcategory: 'Switch' }).map(item => item.id), ['b']);
});
test('标签计数按作品计算', () => {
  assert.deepEqual(availableTags([make('a', ['RPG']), make('b', ['RPG'])]), [{ name: 'RPG', count: 2 }]);
});
test('有效备份可通过校验', () => {
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [make('a', ['RPG'])] }), true);
});
test('导入前拒绝危险来源链接和重复 ID', () => {
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [{ ...make('a', []), sourceUrl: 'javascript:alert(1)' }] }), false);
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [make('a', []), make('a', [])] }), false);
});
test('导入前拒绝远程图片地址', () => {
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [{ ...make('a', []), coverUrl: 'https://example.org/cover.jpg' }] }), false);
});
test('旧版游戏标签不会丢失，归入「其他」', () => {
  assert.deepEqual(gameTagsFor(make('a', ['RPG', '想二刷'])), { gameplay: [], theme: [], scenario: [], other: ['RPG', '想二刷'] });
});
test('游戏标签按四个维度计数，并可跨维度交集筛选', () => {
  const one = {
    ...make('a', []),
    gameTags: { gameplay: ['卡牌构筑'], theme: ['科幻'], scenario: ['碎片时间'], other: ['独立游戏'] },
  };
  const two = {
    ...make('b', []),
    gameTags: { gameplay: ['卡牌构筑'], theme: ['奇幻'], scenario: ['需要沉浸'], other: [] },
  };
  assert.equal(gameTagCounts([one, two]).gameplay.find(x => x.name === '卡牌构筑')?.count, 2);
  assert.deepEqual(filterLibrary([one, two], { tags: ['卡牌构筑', '碎片时间'] }).map(x => x.id), ['a']);
  assert.deepEqual(flattenGameTags(one.gameTags), ['卡牌构筑', '科幻', '碎片时间', '独立游戏']);
});
test('游戏标签重命名与删除不会破坏分类结构', () => {
  const item = {
    ...make('a', ['动作', '独立游戏']),
    gameTags: { gameplay: ['动作'], theme: [], scenario: [], other: ['独立游戏'] },
  };
  const renamed = renameTag([item], '动作', '卡牌构筑')[0];
  assert.deepEqual(gameTagsFor(renamed).gameplay, ['卡牌构筑']);
  assert.deepEqual(gameTagsFor(deleteTag([renamed], '独立游戏')[0]).other, []);
});
test('游玩时长区分未记录与零小时，兼容小数小时', () => {
  assert.equal(formatPlaytime(undefined), '未记录');
  assert.equal(formatPlaytime(0), '0 h');
  assert.equal(formatPlaytime(3), '3 分钟');
  assert.equal(formatPlaytime(2550), '42.5 h');
});
test('旧版备份和新版可选字段都通过校验，非法游玩时长被拒绝', () => {
  const before = make('a', ['旧版标签']);
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [before] }), true);
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [{ ...before, playtimeMinutes: 75, gameTags: gameTagsFor(before) }] }), true);
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [{ ...before, playtimeMinutes: -1 }] }), false);
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [{ ...before, playtimeMinutes: 12.5 }] }), false);
});
test('旧版本状态自动映射为新版游戏状态，不要求重新录入', () => {
  assert.equal(gamePlayStateFor({ ...make('a', []), status: 'active' }), 'playing');
  assert.equal(gamePlayStateFor({ ...make('a', []), status: 'finished' }), 'cleared');
  assert.equal(gamePlayStateFor({ ...make('a', []), status: 'paused' }), 'paused');
  assert.equal(gamePlayStateFor({ ...make('a', []), status: 'want' }), 'want');
});
test('旧反复游玩和长期游玩只读合并为持续游玩，筛选和JSON往返不改原值', () => {
  const replay = { ...make('a', []), status: 'active' as const, gamePlayState: 'replaying' as const };
  const ongoing = { ...make('b', []), status: 'active' as const, gamePlayState: 'ongoing' as const };
  const playing = { ...make('c', []), status: 'active' as const, gamePlayState: 'playing' as const };
  const items = [replay, ongoing, playing];
  const before = JSON.stringify({ schemaVersion: 1, items });
  assert.equal(gamePlayStateFor(replay), 'ongoing');
  assert.equal(gamePlayStateFor(ongoing), 'ongoing');
  assert.equal(GAME_PLAY_LABELS.replaying, '持续游玩'); assert.equal(GAME_PLAY_LABELS.ongoing, '持续游玩');
  assert.deepEqual(GAME_PLAY_STATES, ['want', 'playing', 'cleared', 'ongoing', 'paused', 'abandoned']);
  assert.deepEqual(filterLibrary(items, { gamePlayState: 'replaying' }).map(x => x.id), ['a', 'b']);
  assert.deepEqual(filterLibrary(items, { gamePlayState: 'ongoing' }).map(x => x.id), ['a', 'b']);
  assert.deepEqual(filterLibrary([replay, ongoing, playing], { gamePlayState: 'playing' }).map(x => x.id), ['c']);
  assert.deepEqual(GAME_PLAY_STATES.map(legacyStatusForGameState), ['want', 'active', 'finished', 'active', 'paused', 'paused']);
  assert.equal(legacyStatusForGameState('replaying'), 'active');
  const roundTrip = JSON.parse(before);
  assert.equal(isValidSnapshot(roundTrip), true, '旧replaying仍接受读取及新版导出重载');
  assert.equal(roundTrip.items[0].gamePlayState, 'replaying'); assert.equal(roundTrip.items[1].gamePlayState, 'ongoing');
  assert.equal(JSON.stringify({ schemaVersion: 1, items }), before);
});
test('搁置游戏已记录时长不被清空，卡片仅隐藏时长', () => {
  const paused = { ...make('a', []), status: 'paused' as const, gamePlayState: 'paused' as const, playtimeMinutes: 3300 };
  assert.equal(shouldShowPlaytime(gamePlayStateFor(paused)), false);
  assert.equal(formatPlaytime(paused.playtimeMinutes), '55 h');
  assert.equal(shouldShowPlaytime('want'), false);
  assert.equal(shouldShowPlaytime('playing'), true);
  assert.equal(shouldShowPlaytime('replaying'), true);
  assert.equal(shouldShowPlaytime('ongoing'), true);
});
test('新版备份识别全部游戏状态，并拒绝非法状态', () => {
  for (const gamePlayState of GAME_PLAY_STATES) {
    assert.equal(isValidSnapshot({ schemaVersion: 1, items: [{ ...make('a', []), gamePlayState }] }), true);
  }
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [{ ...make('a', []), gamePlayState: 'invalid' }] }), false);
});

test('已放弃独立于暂时搁置筛选，新版保留schema1并能读取旧库但不隐式升级旧状态', () => {
  const oldPaused = { ...make('old-paused', ['保留标签']), status: 'paused' as const, playtimeMinutes: 90 };
  const paused = { ...make('paused', []), status: 'paused' as const, gamePlayState: 'paused' as const };
  const abandoned = { ...make('abandoned', ['保留标签']), status: 'paused' as const, gamePlayState: 'abandoned' as const, playtimeMinutes: 3300, futureField: { keep: true } };
  const snapshot = { schemaVersion: 1, items: [oldPaused, paused, abandoned], futureSnapshot: true };
  const original = JSON.stringify(snapshot);
  assert.equal(GAME_PLAY_LABELS.abandoned, '已放弃');
  assert.deepEqual(GAME_PLAY_STATES.slice(-2), ['paused', 'abandoned']);
  assert.equal(legacyStatusForGameState('abandoned'), 'paused');
  assert.equal(gamePlayStateFor(oldPaused), 'paused');
  assert.equal(gamePlayStateFor(abandoned), 'abandoned');
  assert.deepEqual(filterLibrary(snapshot.items, { gamePlayState: 'paused' }).map(item => item.id), ['old-paused', 'paused']);
  assert.deepEqual(filterLibrary(snapshot.items, { gamePlayState: 'abandoned' }).map(item => item.id), ['abandoned']);
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [oldPaused] }), true, '新版接受尚无gamePlayState的旧库');
  const exportedAndReloaded = JSON.parse(original);
  assert.equal(isValidSnapshot(exportedAndReloaded), true, '新增状态按schema1保留，供新版加载');
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [{ ...abandoned, status: 'abandoned' }] }), false, '通用status仍只有四个原有值');
  assert.deepEqual(exportedAndReloaded, snapshot);
  assert.equal(JSON.stringify(snapshot), original, '读取、筛选和校验不迁移或改写原快照');
  assert.equal(oldPaused.gamePlayState, undefined);
});

test('多平台规范化、筛选与搜索兼容旧单字符串，读取不修改作品', () => {
  const old = { ...make('old', []), subcategory: 'Steam / Switch' };
  const modern = { ...make('modern', []), subcategory: 'Steam', platforms: ['Steam', ' PS5 ', 'steam'] };
  const oldBefore = JSON.stringify(old);
  assert.deepEqual(normalizePlatforms([' Steam ', 'steam', '', 'PS5']), ['Steam', 'PS5']);
  assert.deepEqual(platformsFor(old), ['Steam / Switch']);
  assert.deepEqual(platformsFor(modern), ['Steam', 'PS5']);
  assert.deepEqual(platformsFor({ ...old, platforms: [] }), []);
  assert.equal(JSON.stringify(old), oldBefore);
  assert.deepEqual(filterLibrary([old, modern], { subcategory: 'ps5' }).map(item => item.id), ['modern']);
  assert.deepEqual(filterLibrary([old, modern], { subcategory: 'Switch' }), []);
  assert.deepEqual(filterLibrary([old, modern], { search: 'PS5' }).map(item => item.id), ['modern']);
});

test('分组标签筛选不会混淆同名题材与游玩场景，并可组合喜欢筛选', () => {
  const one = { ...make('a', []), favorite: true, gameTags: { gameplay: [], theme: ['轻松'], scenario: [], other: [] } };
  const two = { ...make('b', []), gameTags: { gameplay: [], theme: [], scenario: ['轻松'], other: [] } };
  const three = { ...two, id: 'c', favorite: true };
  assert.deepEqual(filterLibrary([one, two, three], { gameTags: { scenario: ['轻松'] }, favoriteOnly: true }).map(x => x.id), ['c']);
});

test('限定分类和分组的标签管理保留其他分组、板块及未知字段', () => {
  const game = {
    ...make('game', ['共同标签']), futureField: { keep: true },
    gameTags: { gameplay: ['共同标签'], theme: ['共同标签'], scenario: [], other: [], futureGroup: ['保留'] },
  };
  const book = { ...make('book', ['共同标签']), category: 'book' as const };
  const renamed = renameTag([game, book], '共同标签', '新名称', { category: 'game', group: 'gameplay' });
  assert.deepEqual(gameTagsFor(renamed[0]).gameplay, ['新名称']);
  assert.deepEqual(gameTagsFor(renamed[0]).theme, ['共同标签']);
  assert.equal(renamed[1], book);
  assert.deepEqual((renamed[0] as typeof game).futureField, { keep: true });
  assert.deepEqual((renamed[0] as typeof game).gameTags.futureGroup, ['保留']);
  const deleted = deleteTag(renamed, '共同标签', { category: 'game', group: 'theme' });
  assert.deepEqual(gameTagsFor(deleted[0]).theme, []);
  assert.deepEqual(deleted[0].tags, ['新名称']);
  assert.deepEqual(deleted[1].tags, ['共同标签']);
});

test('实际体验日期校验公历、闰年、日期精度与格式', () => {
  for (const date of ['2026-10', '2024-02-29', '2000-02-29', '2026-10-01']) assert.equal(isExperienceDate(date), true, date);
  for (const date of ['2026-02-29', '1900-02-29', '2026-04-31', '2026-00', '2026-13', '2026-1', '2026-10-00', '0000-01', '2026-10-01T00:00:00Z']) {
    assert.equal(isExperienceDate(date), false, date);
  }
});

test('可选扩展字段保持schemaVersion 1与未知字段，不接受损坏的体验记录', () => {
  const entry = { id: 'entry', date: '2024-02-29', kind: 'note' as const, note: '这是体验印象', minutes: 0 };
  const item = { ...make('a', []), platforms: ['Steam', 'Switch'], externalIds: [{ provider: 'steam' as const, id: '123', url: 'https://store.steampowered.com/app/123/' }], experienceEntries: [entry], future: { preserve: true } };
  const snapshot = { schemaVersion: 1, items: [item], futureSnapshot: true };
  const before = JSON.stringify(snapshot);
  assert.equal(isValidSnapshot(snapshot), true);
  assert.equal(JSON.stringify(snapshot), before);
  assert.deepEqual(filterLibrary([item], { search: '体验印象' }).map(x => x.id), ['a']);
  for (const invalid of [
    { date: '2025-02-29' }, { id: ' ' }, { kind: 'invalid' }, { note: 3 }, { minutes: -1 }, { minutes: 1.5 }, { minutes: Number.NaN },
  ]) assert.equal(isValidSnapshot({ schemaVersion: 1, items: [{ ...item, experienceEntries: [{ ...entry, ...invalid }] }] }), false);
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [{ ...item, experienceEntries: [entry, entry] }] }), false);
  for (const change of [
    { platforms: [''] }, { platforms: 'Steam' }, { externalIds: [{ provider: 'unknown', id: '1' }] },
    { externalIds: [{ provider: 'steam', id: '' }] }, { externalIds: [{ provider: 'steam', id: '1', url: 'javascript:alert(1)' }] },
  ]) assert.equal(isValidSnapshot({ schemaVersion: 1, items: [{ ...item, ...change }] }), false);
});
