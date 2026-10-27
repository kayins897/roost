import assert from 'node:assert/strict';
import test from 'node:test';
import { groupRankedGames, moveGameWithinRank, type RankMode } from './gamePlanning.ts';
import { GAME_GRADES } from './gameRating.ts';
import { isValidSnapshot } from './library.ts';
import type { MediaItem } from './types.ts';

// 新游戏+同时具备两套排序资格；客观已通关与正时长独立保留，不用于授予等级资格。
const item = (id: string, extra: Partial<MediaItem> = {}): MediaItem => ({ id, title: id, category: 'game', subcategory: 'Steam', platforms: ['Steam'], creator: '', year: '', status: 'want', gamePlayState: 'want', experienceStatus: 'experienced', experienceCategory: 'replayable', completion: 'cleared', tags: ['自己的标签'], impression: '旧印象', review: '长文测评', favorite: true, artwork: 'default', playtimeMinutes: 150, createdAt: '2026-01-01', updatedAt: '2026-01-02', ...extra });
const ids = (items: MediaItem[]) => items.map(work => work.id);
const groupIds = (items: MediaItem[], mode: RankMode, group: string) => ids(groupRankedGames(items, mode).find(entry => entry.id === group)!.items);

test('计划按六档等级分组，评级按十个分数区间分组，未设置另成组，不推断等级或改写旧数据', () => {
  const data = [item('legacy'), ...GAME_GRADES.map(grade => item(grade, { playPriority: grade, personalGrade: grade }))];
  const raw = JSON.stringify(data);
  const plan = groupRankedGames(data, 'priority');
  assert.deepEqual(plan.map(group => group.id), [...GAME_GRADES, 'unranked']);
  for (const grade of GAME_GRADES) assert.deepEqual(groupIds(data, 'priority', grade), [grade]);
  assert.deepEqual(groupIds(data, 'priority', 'unranked'), ['legacy']);
  const rating = groupRankedGames(data, 'rating');
  assert.deepEqual(rating.map(group => group.id), ['score-9', 'score-8', 'score-7', 'score-6', 'score-5', 'score-4', 'score-3', 'score-2', 'score-1', 'score-0', ...GAME_GRADES, 'unranked']);
  for (const grade of GAME_GRADES) assert.deepEqual(groupIds(data, 'rating', grade), [grade], '没有数值评分的旧字母评级只进入历史分组');
  assert.equal(rating.find(group => group.id === 'S')?.label, '历史 S');
  assert.equal(rating.find(group => group.id === 'score-9')?.label, '9–10 分');
  assert.deepEqual(groupIds(data, 'rating', 'unranked'), ['legacy']);
  assert.equal(JSON.stringify(data), raw); assert.equal(Object.hasOwn(data[0], 'playPriority'), false);
});

test('旧搁置按原优先级分组，不另设末档，保留原等级且不影响个人评级分组', () => {
  const data = [item('paused-top', { gamePlayState: 'paused', status: 'paused', playPriority: 'SSS', personalGrade: 'A' }), item('want-low', { playPriority: 'C' }), item('old-paused', { gamePlayState: undefined, status: 'paused', playPriority: 'SS' })];
  const raw = JSON.stringify(data), groups = groupRankedGames(data, 'priority');
  assert.equal(groups.at(-1)?.id, 'unranked'); assert.equal(groups.some(group => group.id === 'paused'), false);
  assert.deepEqual(groupIds(data, 'priority', 'SSS'), ['paused-top']); assert.deepEqual(groupIds(data, 'priority', 'SS'), ['old-paused']); assert.deepEqual(groupIds(data, 'priority', 'C'), ['want-low']);
  assert.deepEqual(groupIds(data, 'rating', 'A'), ['paused-top']); assert.equal(data[0].playPriority, 'SSS'); assert.equal(JSON.stringify(data), raw);
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

test('旧搁置按原优先级同档可排序，跨档零修改且保留未知字段与旧轴', () => {
  const data = [item('a', { gamePlayState: 'paused', status: 'paused', playPriority: 'SSS' }), { ...item('b', { gamePlayState: 'paused', status: 'paused', playPriority: 'C' }), futureItem: { keep: true } }, item('c', { gamePlayState: 'paused', status: 'paused', playPriority: 'C' })];
  const raw = JSON.stringify(data), crossRank = moveGameWithinRank(data, 'b', 'a', 'priority');
  assert.equal(crossRank.changedCount, 0); assert.equal(crossRank.items, data);
  const moved = moveGameWithinRank(data, 'c', 'b', 'priority');
  assert.equal(moved.changedCount, 2); assert.deepEqual(groupIds(moved.items, 'priority', 'C'), ['c', 'b']); assert.deepEqual(groupIds(moved.items, 'priority', 'SSS'), ['a']);
  assert.deepEqual(moved.items.map(work => work.playPriority), ['SSS', 'C', 'C']); assert.equal(moved.items[0], data[0]);
  for (let index = 0; index < data.length; index++) { const { priorityOrder: _old, ...before } = data[index], { priorityOrder: _new, ...after } = moved.items[index]; assert.deepEqual(after, before); }
  assert.equal(JSON.stringify(data), raw);
});

test('旧replaying与ongoing显式新游戏+后可排序，存储枚举仍保持原值', () => {
  const data = [item('legacy', { status: 'active', gamePlayState: 'replaying', playEngagement: 'planned', playPriority: 'A' }), item('new', { status: 'active', gamePlayState: 'ongoing', playEngagement: 'planned', playPriority: 'A' })];
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
  assert.equal(moved.changedCount, 2, '两款有效通关作品同评级档确实移动，不再被旧轴差异拒绝');
  assert.deepEqual(groupIds(moved.items, 'rating', 'S'), ['still-playing', 'legacy']);
});

test('重复实体编号拒绝排序，不依编号误写隐藏或其他作品', () => {
  const data = [item('a'), item('b'), item('c'), item('c', { hiddenAt: '2026-01-03T00:00:00Z' })];
  const moved = moveGameWithinRank(data, 'a', 'b', 'priority'); assert.equal(moved.items, data); assert.equal(moved.changedCount, 0);
});

test('拖动只写当前分档视图成员，不改同档但不在视图中的历史等级作品', () => {
  const rating = [
    item('first', { personalGrade: 'S' }),
    item('outside-unknown', { experienceCategory: 'continue', personalGrade: 'S', completion: 'unknown', ratingOrder: 55 }),
    item('outside-na', { experienceCategory: 'put-aside', personalGrade: 'S', completion: 'not-applicable', ratingOrder: 66 }),
    item('last', { personalGrade: 'S', playEngagement: 'playing' }),
  ];
  const changed = moveGameWithinRank(rating, 'last', 'first', 'rating');
  assert.equal(changed.changedCount, 2);
  assert.equal(changed.items[1], rating[1]);
  assert.equal(changed.items[2], rating[2]);
  assert.deepEqual(groupIds(changed.items, 'rating', 'S'), ['last', 'first']);
  assert.equal(moveGameWithinRank(rating, 'outside-na', 'first', 'rating').changedCount, 0);
  const priority = [
    item('first', { playPriority: 'A' }),
    item('outside', { playPriority: 'A', experienceStatus: 'experienced', experienceCategory: 'completed', playEngagement: 'playing', priorityOrder: 55 }),
    item('last', { playPriority: 'A' }),
  ];
  const reordered = moveGameWithinRank(priority, 'last', 'first', 'priority');
  assert.equal(reordered.changedCount, 2);
  assert.equal(reordered.items[1], priority[1]);
  assert.deepEqual(groupIds(reordered.items, 'priority', 'A'), ['last', 'first']);
  assert.equal(moveGameWithinRank(priority, 'outside', 'first', 'priority').changedCount, 0);
});
