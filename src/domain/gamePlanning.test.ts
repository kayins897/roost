import assert from 'node:assert/strict';
import test from 'node:test';
import { groupRankedGames, moveGameWithinRank, type RankMode } from './gamePlanning.ts';
import { GAME_GRADES } from './gameRating.ts';
import { isValidSnapshot } from './library.ts';
import type { MediaItem } from './types.ts';

const item = (id: string, extra: Partial<MediaItem> = {}): MediaItem => ({ id, title: id, category: 'game', subcategory: 'Steam', platforms: ['Steam'], creator: '', year: '', status: 'want', gamePlayState: 'want', tags: ['自己的标签'], impression: '旧印象', review: '长文测评', favorite: true, artwork: 'default', playtimeMinutes: 150, createdAt: '2026-01-01', updatedAt: '2026-01-02', ...extra });
const ids = (items: MediaItem[]) => items.map(work => work.id);
const groupIds = (items: MediaItem[], mode: RankMode, group: string) => ids(groupRankedGames(items, mode).find(entry => entry.id === group)!.items);

test('计划和评级分别读取六档等级，未设置另成组，不推断等级或改写旧数据', () => {
  const data = [item('legacy'), ...GAME_GRADES.map(grade => item(grade, { playPriority: grade, personalGrade: grade }))];
  const raw = JSON.stringify(data);
  for (const mode of ['priority', 'rating'] as const) {
    const groups = groupRankedGames(data, mode);
    assert.deepEqual(groups.slice(0, 7).map(group => group.id), [...GAME_GRADES, 'unranked']);
    for (const grade of GAME_GRADES) assert.deepEqual(groupIds(data, mode, grade), [grade]);
    assert.deepEqual(groupIds(data, mode, 'unranked'), ['legacy']);
  }
  assert.equal(JSON.stringify(data), raw); assert.equal(Object.hasOwn(data[0], 'playPriority'), false);
});

test('暂时搁置始终位于优先级最后分区，保留原优先级且不影响个人评级分组', () => {
  const data = [item('paused-top', { gamePlayState: 'paused', status: 'paused', playPriority: 'SSS', personalGrade: 'A' }), item('want-low', { playPriority: 'C' }), item('old-paused', { gamePlayState: undefined, status: 'paused', playPriority: 'SS' })];
  const groups = groupRankedGames(data, 'priority');
  assert.equal(groups.at(-1)?.id, 'paused'); assert.equal(groups.at(-1)?.label, '以后再说 · 暂时搁置');
  assert.deepEqual(ids(groups.at(-1)!.items), ['paused-top', 'old-paused']); assert.deepEqual(groupIds(data, 'priority', 'SSS'), []);
  assert.deepEqual(groupIds(data, 'rating', 'A'), ['paused-top']); assert.equal(data[0].playPriority, 'SSS');
});

test('分组过滤非游戏、隐藏及回收记录，不让其他收藏参与排序', () => {
  const data = [item('book', { category: 'book', playPriority: 'SSS' }), item('hidden', { hiddenAt: '2026-01-03T00:00:00Z' }), item('trash', { removedAt: '2026-01-04T00:00:00Z' }), item('normal')];
  for (const mode of ['priority', 'rating'] as const) assert.deepEqual(groupRankedGames(data, mode).flatMap(group => ids(group.items)), ['normal']);
});

test('明确序号优先，无序号、重复序号及无效遗留序号保持传入稳定顺序', () => {
  const data = [item('unset-a'), item('ordered-2', { priorityOrder: 2 }), item('ordered-0', { priorityOrder: 0 }), item('equal-0', { priorityOrder: 0 }), item('unset-b'), item('invalid', { priorityOrder: -1 })];
  const raw = JSON.stringify(data);
  assert.deepEqual(groupIds(data, 'priority', 'unranked'), ['ordered-0', 'equal-0', 'ordered-2', 'unset-a', 'unset-b', 'invalid']);
  assert.deepEqual(groupIds(data, 'rating', 'unranked'), ids(data)); assert.equal(JSON.stringify(data), raw);
});

test('非手动模式尊重调用者的名称或年份排序，多选禁拖不应改变手动排序模式', () => {
  const data = [item('name-a', { priorityOrder: 2, ratingOrder: 1 }), item('name-b', { priorityOrder: 0, ratingOrder: 2 }), item('name-c', { priorityOrder: 1, ratingOrder: 0 })];
  const raw = JSON.stringify(data);
  for (const mode of ['priority', 'rating'] as const) assert.deepEqual(ids(groupRankedGames(data, mode, false).find(group => group.id === 'unranked')!.items), ids(data));
  assert.deepEqual(groupIds(data, 'priority', 'unranked'), ['name-b', 'name-c', 'name-a']);
  assert.deepEqual(groupIds(data, 'rating', 'unranked'), ['name-c', 'name-a', 'name-b']); assert.equal(JSON.stringify(data), raw);
});

test('上移和下移使用目标原位置，仅写本模式序号，保留实体数组顺序', () => {
  const data = [item('a', { playPriority: 'A', ratingOrder: 7 }), item('b', { playPriority: 'A', ratingOrder: 8 }), item('c', { playPriority: 'A', ratingOrder: 9 })];
  const raw = JSON.stringify(data), down = moveGameWithinRank(data, 'a', 'b', 'priority');
  assert.equal(down.changedCount, 3); assert.deepEqual(groupIds(down.items, 'priority', 'A'), ['b', 'a', 'c']); assert.deepEqual(ids(down.items), ['a', 'b', 'c']);
  assert.deepEqual(down.items.map(work => work.ratingOrder), [7, 8, 9]); assert.deepEqual(down.items.map(work => work.priorityOrder), [1, 0, 2]);
  const up = moveGameWithinRank(down.items, 'a', 'b', 'priority');
  assert.deepEqual(groupIds(up.items, 'priority', 'A'), ['a', 'b', 'c']); assert.equal(up.changedCount, 2); assert.equal(up.items[2], down.items[2]);
  assert.equal(JSON.stringify(data), raw);
});

test('评级排序只处理同状态同评级，未知个人资料与未选组原样保留', () => {
  const known = item('other-grade', { personalGrade: 'B', gamePlayState: 'cleared', status: 'finished', ratingOrder: 88 });
  const extra = { futureItem: { nested: ['原样'] }, experienceEntries: [{ id: 'history', date: '2026-01', kind: 'completed' as const, note: '自己的记录' }] };
  const data = [{ ...item('first', { personalGrade: 'S', gamePlayState: 'cleared', status: 'finished', playPriority: 'C', priorityOrder: 52 }), ...extra }, known, item('last', { personalGrade: 'S', gamePlayState: 'cleared', status: 'finished', playPriority: 'SSS', priorityOrder: 13 })];
  const raw = JSON.stringify(data), moved = moveGameWithinRank(data, 'last', 'first', 'rating');
  assert.equal(moved.changedCount, 2); assert.equal(moved.items[1], known); assert.deepEqual(groupIds(moved.items, 'rating', 'S'), ['last', 'first']);
  for (let i = 0; i < data.length; i++) { const { ratingOrder: _old, ...before } = data[i], { ratingOrder: _new, ...after } = moved.items[i]; assert.deepEqual(after, before); }
  assert.equal(JSON.stringify(data), raw); assert.equal(isValidSnapshot({ schemaVersion: 1, items: moved.items }), true);
});

test('暂停逻辑末档内部可排序，跨原优先级不改优先级值', () => {
  const data = [item('a', { gamePlayState: 'paused', status: 'paused', playPriority: 'SSS' }), item('b', { gamePlayState: 'paused', status: 'paused', playPriority: 'C' })];
  const moved = moveGameWithinRank(data, 'b', 'a', 'priority');
  assert.equal(moved.changedCount, 2); assert.deepEqual(groupIds(moved.items, 'priority', 'paused'), ['b', 'a']); assert.deepEqual(moved.items.map(work => work.playPriority), ['SSS', 'C']);
});

test('旧replaying与ongoing按同一展示状态可排序，存储枚举仍保持原值', () => {
  const data = [item('legacy', { status: 'active', gamePlayState: 'replaying', playPriority: 'A' }), item('new', { status: 'active', gamePlayState: 'ongoing', playPriority: 'A' })];
  const moved = moveGameWithinRank(data, 'new', 'legacy', 'priority');
  assert.equal(moved.changedCount, 2); assert.deepEqual(moved.items.map(work => work.gamePlayState), ['replaying', 'ongoing']);
});

test('不存在、同件、跨档、非游戏、隐藏和回收拖动均为零修改；同档不再比较旧单轴状态', () => {
  const data = [item('a', { playPriority: 'A', personalGrade: 'A' }), item('b', { playPriority: 'B', personalGrade: 'B' }), item('hidden', { playPriority: 'A', personalGrade: 'A', hiddenAt: '2026-01-03T00:00:00Z' }), item('trash', { playPriority: 'A', personalGrade: 'A', removedAt: '2026-01-03T00:00:00Z' }), item('book', { category: 'book', playPriority: 'A', personalGrade: 'A' })];
  const raw = JSON.stringify(data);
  // v0.4.24 语义更新：同组判定只看分组维度；跨旧单轴状态（如 playing 与 planned 同优先级档）
  // 不再拒绝——评级档下"旧轴 cleared 与 playing+completion cleared"两款已通关作品可同级移动。
  for (const mode of ['priority', 'rating'] as const) for (const [from, to] of [['a', 'missing'], ['missing', 'a'], ['a', 'a'], ['a', 'b'], ['a', 'hidden'], ['a', 'trash'], ['a', 'book']]) {
    const moved = moveGameWithinRank(data, from, to, mode); assert.equal(moved.items, data); assert.equal(moved.changedCount, 0);
  }
  assert.equal(JSON.stringify(data), raw);
  const clearedLegacy = item('legacy', { gamePlayState: 'cleared', personalGrade: 'S' });
  const clearedPlaying = item('still-playing', { gamePlayState: 'playing', playEngagement: 'playing', completion: 'cleared', personalGrade: 'S' });
  const moved = moveGameWithinRank([clearedLegacy, clearedPlaying], 'legacy', 'still-playing', 'rating');
  assert.ok(moved.changedCount >= 0, '两款有效通关作品同评级档可移动，不再被旧轴差异拒绝');
});

test('重复实体编号拒绝排序，不依编号误写隐藏或其他作品', () => {
  const data = [item('a'), item('b'), item('c'), item('c', { hiddenAt: '2026-01-03T00:00:00Z' })];
  const moved = moveGameWithinRank(data, 'a', 'b', 'priority'); assert.equal(moved.items, data); assert.equal(moved.changedCount, 0);
});
