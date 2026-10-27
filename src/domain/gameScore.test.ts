import assert from 'node:assert/strict';
import test from 'node:test';
import { isLastPlayedAt, isPersonalScore } from './gameAssets.ts';
import { coverFinishFor, scoreFinishFor } from './gameRating.ts';
import { bulkScorePatch } from './gameScore.ts';
import { groupRankedGames, moveGameWithinRank } from './gamePlanning.ts';
import { isValidSnapshot } from './library.ts';
import { sortLibraryItems } from './librarySort.ts';
import type { MediaItem } from './types.ts';
const game = (id: string, extra: Partial<MediaItem> = {}): MediaItem => ({ id, title: id, category: 'game', subcategory: 'Steam', creator: '', year: '', status: 'finished', experienceStatus: 'experienced', experienceCategory: 'completed', personalGrade: 'A', playPriority: 'SS', tags: [], impression: '', favorite: false, artwork: 'default', createdAt: '2026-01-01', updatedAt: '2026-01-01', ...extra });
test('数值评分的全部边界、真实零与未设置，不覆盖历史评级', () => {
  for (const [score, finish] of [[0, 'standard'], [7.9, 'standard'], [8, 'foil'], [8.9, 'foil'], [9, 'holographic'], [9.4, 'holographic'], [9.5, 'prismatic'], [10, 'prismatic']] as const) {
    const item = Object.freeze(game('a', { personalScore: score })); const before = JSON.stringify(item);
    assert.equal(scoreFinishFor(score), finish); assert.equal(coverFinishFor(item), finish);
    assert.equal(JSON.stringify(item), before); assert.equal(isValidSnapshot({ schemaVersion: 1, items: [item] }), true);
  }
  for (const value of [-1, 10.1, NaN, Infinity, 9.45, '9', null]) assert.equal(isPersonalScore(value), false);
  assert.equal(coverFinishFor(game('a', { personalGrade: 'SS' })), 'holographic');
  assert.equal(coverFinishFor(game('a', { personalScore: 0, personalGrade: 'SSS' })), 'standard');
});
test('评分按数值分组并支持同分手动顺序，历史字母独立保存', () => {
  const items = [game('a', { personalScore: 9.4 }), game('b', { personalScore: 9.5 }), game('c', { personalScore: 9.4 }), game('d')];
  assert.deepEqual(groupRankedGames(items, 'rating').filter(g => g.items.length).map(g => g.id), ['score-9.5', 'score-9.4', 'A']);
  const moved = moveGameWithinRank(items, 'c', 'a', 'rating');
  assert.equal(moved.changedCount, 2); assert.equal(moveGameWithinRank(items, 'a', 'b', 'rating').changedCount, 0);
  assert.deepEqual(sortLibraryItems(items, { sort: 'rank', direction: 'desc', rankMode: 'rating' }).map(i => i.id), ['b', 'a', 'c', 'd']);
});
test('批量评分资格与字段保护，0分不是清除，变分才清同档顺序', () => {
  const items = [game('a', { ratingOrder: 3, completionCount: 7, playtimeMinutes: 0 }), game('b')];
  const patch = bulkScorePatch(items, new Set(['a']), 0); const changed = patch.items[0];
  assert.equal(changed.personalScore, 0); assert.equal(changed.ratingOrder, undefined); assert.equal(changed.personalGrade, 'A'); assert.equal(changed.completionCount, 7); assert.equal(changed.playtimeMinutes, 0); assert.equal(changed.playPriority, 'SS');
  assert.equal(bulkScorePatch(patch.items, new Set(['a']), 0).items, patch.items);
  assert.throws(() => bulkScorePatch([game('a', { experienceCategory: 'continue' })], new Set(['a']), 9));
  assert.throws(() => bulkScorePatch(items, new Set(['missing']), 9));
});
test('旧数据读写不补字段，最后游玩时间不从日志推断，日期校验', () => {
  const original = { schemaVersion: 1, items: [game('a', { completionCount: 0, experienceEntries: [] })], future: { retained: true } };
  const raw = JSON.stringify(original); assert.equal(isValidSnapshot(original), true); assert.equal(JSON.stringify(original), raw);
  assert.equal(Object.hasOwn(original.items[0], 'personalScore'), false); assert.equal(Object.hasOwn(original.items[0], 'lastPlayedAt'), false);
  assert.equal(isLastPlayedAt('2026-02-30'), false); assert.equal(isLastPlayedAt('2026-02-28'), true); assert.equal(isLastPlayedAt('2026-10-26T08:10:00.000Z'), true);
});
