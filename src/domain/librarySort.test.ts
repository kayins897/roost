import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSortDirection, sortLibraryItems, type LibrarySort, type SortDirection } from './librarySort.ts';
import { groupRankedGames } from './gamePlanning.ts';
import type { MediaItem } from './types.ts';

const work = (id: string, extra: Partial<MediaItem> = {}): MediaItem => ({ id, title: id, category: 'game', subcategory: '', creator: '', year: '', status: 'want', gamePlayState: 'want', experienceStatus: 'unplayed', tags: [], impression: '原文', review: '长文', favorite: false, artwork: 'default', createdAt: '', updatedAt: '', ...extra });
const ids = (items: MediaItem[]) => items.map(item => item.id);
const sorted = (items: MediaItem[], sort: LibrarySort, direction: SortDirection) => ids(sortLibraryItems(items, { sort, direction }));

test('名称默认升序，优先级、时间、年份和时长默认降序', () => {
  assert.equal(defaultSortDirection('title'), 'asc');
  for (const mode of ['rank','recent','year','playtime'] as const) assert.equal(defaultSortDirection(mode), 'desc');
});

test('收录时间双向排序，未知记录始终置末且相同日期稳定', () => {
  const items = [work('missing'), work('new', { createdAt: '2026-10-01' }), work('invalid', { createdAt: '无日期' }), work('old', { createdAt: '2020-01-01' }), work('same', { createdAt: '2026-10-01' })];
  assert.deepEqual(sorted(items, 'recent', 'asc'), ['old','new','same','missing','invalid']);
  assert.deepEqual(sorted(items, 'recent', 'desc'), ['new','same','old','missing','invalid']);
});

test('年份按数值双向排序，空白与未记录始终置末', () => {
  const items = [work('missing'), work('new', { year: '2025' }), work('unknown', { year: '未知' }), work('old', { year: ' 1999 ' })];
  assert.deepEqual(sorted(items, 'year', 'asc'), ['old','new','missing','unknown']);
  assert.deepEqual(sorted(items, 'year', 'desc'), ['new','old','missing','unknown']);
});

test('游玩时长区分真实零和未记录，两方向均不把未知当零', () => {
  const items = [work('missing'), work('long', { playtimeMinutes: 600 }), work('zero', { playtimeMinutes: 0 }), work('short', { playtimeMinutes: 10 })];
  assert.deepEqual(sorted(items, 'playtime', 'asc'), ['zero','short','long','missing']);
  assert.deepEqual(sorted(items, 'playtime', 'desc'), ['long','short','zero','missing']);
});

test('名称使用自然排序，空名称最后，相同名称保留输入顺序', () => {
  const items = [work('missing', { title: '  ' }), work('ten', { title: 'Game 10' }), work('two', { title: 'Game 2' }), work('same', { title: 'game 2' })];
  assert.deepEqual(sorted(items, 'title', 'asc'), ['two','same','ten','missing']);
  assert.deepEqual(sorted(items, 'title', 'desc'), ['ten','two','same','missing']);
});

test('优先级和评级分别读取，切换方向不改变个人数据或手动序号', () => {
  const items = [work('unranked'), work('top', { playPriority: 'SSS', personalGrade: 'C', priorityOrder: 2 }), work('low', { playPriority: 'C', personalGrade: 'SSS', ratingOrder: 9 })];
  const before = JSON.stringify(items);
  assert.deepEqual(sorted(items, 'rank', 'desc'), ['top','low','unranked']);
  assert.deepEqual(sorted(items, 'rank', 'asc'), ['low','top','unranked']);
  assert.deepEqual(ids(sortLibraryItems(items, { sort: 'rank', direction: 'desc', rankMode: 'rating' })), ['low','top','unranked']);
  assert.equal(JSON.stringify(items), before);
});

test('等级组升降序只改变组顺序，组内手动顺序不反转，旧搁置按原档且未设置末尾', () => {
  const items = [work('top', { playPriority: 'SSS' }), work('b', { playPriority: 'A', priorityOrder: 2 }), work('a', { playPriority: 'A', priorityOrder: 1 }), work('low', { playPriority: 'C' }), work('unranked'), work('paused', { gamePlayState: 'paused', status: 'paused', playPriority: 'SSS' })];
  const before = JSON.stringify(items);
  const asc = groupRankedGames(items, 'priority', true, 'asc').filter(group => group.items.length);
  const desc = groupRankedGames(items, 'priority', true, 'desc').filter(group => group.items.length);
  assert.deepEqual(asc.map(group => group.id), ['C','A','SSS','unranked']);
  assert.deepEqual(desc.map(group => group.id), ['SSS','A','C','unranked']);
  for (const groups of [asc, desc]) { assert.deepEqual(ids(groups.find(group => group.id === 'A')!.items), ['a','b']); assert.deepEqual(ids(groups.find(group => group.id === 'SSS')!.items), ['top','paused']); }
  assert.equal(JSON.stringify(items), before);
});

test('计划暂停作品始终最后，其他字段的升降序不影响原数组和对象', () => {
  const items = [work('paused', { gamePlayState: 'paused', status: 'paused', year: '2026' }), work('old', { year: '2020' }), work('new', { year: '2025' })];
  const before = JSON.stringify(items);
  for (const direction of ['asc','desc'] as const) {
    const result = sortLibraryItems(items, { sort: 'year', direction, pausedLast: true });
    assert.equal(result.at(-1)?.id, 'paused'); assert.ok(result.every(item => items.includes(item)));
  }
  assert.equal(JSON.stringify(items), before);
});
