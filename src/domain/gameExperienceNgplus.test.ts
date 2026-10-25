import assert from 'node:assert/strict';
import test from 'node:test';
import { createBulkGradePatch, createGameBatchEditPlan } from './batchEdit.ts';
import {
  EXPERIENCE_CATEGORIES, createExperiencePatch, experienceCategoryFor, experienceCategoryPatch,
  experienceClassificationPatch, isGameExperienceCategory, planExperienceBatchChange,
} from './gameExperience.ts';
import { groupRankedGames, moveGameWithinRank } from './gamePlanning.ts';
import { completionFor, gradeEditable, inPlanView, priorityEditable, recordCompletion, undoCompletionRecord } from './gameProgress.ts';
import { coverFinishFor } from './gameRating.ts';
import { filterLibrary, isValidSnapshot } from './library.ts';
import { applySteamSync } from './steamSync.ts';
import type { GameExperienceClassification } from './gameExperience.ts';
import type { MediaItem } from './types.ts';
import { LocalStorageRepository } from '../infrastructure/localStorageRepository.ts';

const now = '2026-10-25T18:00:00.000Z';
const cases: { value: GameExperienceClassification; priority: boolean; rating: boolean }[] = [
  { value: 'unplayed', priority: true, rating: false },
  { value: 'unclassified', priority: false, rating: false },
  { value: 'continue', priority: true, rating: false },
  { value: 'replayable', priority: true, rating: true },
  { value: 'long-term', priority: true, rating: true },
  { value: 'completed', priority: false, rating: true },
  { value: 'put-aside', priority: false, rating: false },
];
const make = (id: string, value: GameExperienceClassification, extra: Partial<MediaItem> = {}): MediaItem => ({
  id, title: id, category: 'game', subcategory: 'Steam', platforms: ['Steam'], creator: '', year: '',
  status: 'finished', gamePlayState: 'cleared', playEngagement: 'playing', completion: 'not-cleared', completionCount: 0,
  playtimeMinutes: 73, personalGrade: 'SS', playPriority: 'A', priorityOrder: 4, ratingOrder: 7,
  tags: ['原标签'], impression: '原印象', review: '原长文', favorite: true, artwork: 'default', createdAt: '2026-01-01', updatedAt: '2026-01-02',
  experienceEntries: [{ id: 'log', date: '2025-04', kind: 'completed', note: '普通完成日志', minutes: 20 }],
  completionEvents: [{ id: 'event', occurredAt: '2024', recordedAt: now, note: '明确完成事件' }],
  experienceStatus: value === 'unplayed' ? 'unplayed' : 'experienced',
  ...(value === 'unplayed' || value === 'unclassified' ? {} : { experienceCategory: value }),
  ...extra,
});
const withUnknown = (item: MediaItem) => ({ ...item, futureItem: { keep: ['未知扩展'] } });
const ids = (items: MediaItem[]) => items.map(item => item.id);
function preserve(before: MediaItem, after: MediaItem, allowed: readonly string[]) {
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!allowed.includes(key)) assert.deepEqual(Reflect.get(after, key), Reflect.get(before, key), before.id + '.' + key);
  }
}

test('long-term只读合并且新旧筛选同义；加载、普通保存和Steam同步不偷偷改写旧分类', () => {
  assert.deepEqual(EXPERIENCE_CATEGORIES, ['continue', 'replayable', 'completed', 'put-aside']);
  assert.equal(isGameExperienceCategory('long-term'), true);
  const legacy = withUnknown(make('legacy', 'long-term'));
  const canonical = make('canonical', 'replayable'), unrelated = make('unrelated', 'put-aside');
  const original = { schemaVersion: 1 as const, futureRoot: { keep: ['原文'] }, items: [legacy, canonical, unrelated] };
  const raw = JSON.stringify(original, null, 2), values = new Map([['qiyu.library.v1', raw]]), writes: string[] = [];
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { writes.push(key); values.set(key, value); } };
  const repository = new LocalStorageRepository(storage), loaded = repository.load();
  assert.equal(isValidSnapshot(loaded), true); assert.equal(experienceCategoryFor(Object.freeze(loaded.items[0])), 'replayable');
  for (const filter of ['replayable', 'long-term'] as const) assert.deepEqual(ids(filterLibrary(loaded.items, { gameExperienceCategories: [filter] })), ['legacy', 'canonical']);
  groupRankedGames(loaded.items, 'priority'); groupRankedGames(loaded.items, 'rating'); coverFinishFor(loaded.items[0]);
  assert.deepEqual(writes, []); assert.equal(storage.getItem('qiyu.library.v1'), raw); assert.equal(loaded.items[0].experienceCategory, 'long-term');
  repository.save({ ...loaded, items: [{ ...loaded.items[0], impression: '明确修改感受' }, ...loaded.items.slice(1)] });
  const reopened = new LocalStorageRepository(storage).load();
  assert.equal(reopened.items[0].experienceCategory, 'long-term'); preserve(legacy, reopened.items[0], ['impression']);
  assert.deepEqual(reopened.items.slice(1), original.items.slice(1)); assert.deepEqual(Reflect.get(reopened, 'futureRoot'), original.futureRoot);
  const synced = applySteamSync([{ appId: '123', title: 'legacy', playtimeMinutes: 100 }], [{ ...legacy, externalIds: [{ provider: 'steam', id: '123' }] }], ['123'], { updatePlaytime: true });
  assert.equal(synced.items[0].experienceCategory, 'long-term'); assert.equal(experienceCategoryFor(synced.items[0]), 'replayable');
  preserve({ ...legacy, externalIds: [{ provider: 'steam', id: '123' }] }, synced.items[0], ['playtimeMinutes', 'sourceUrl', 'updatedAt']);
  assert.equal(JSON.stringify(original, null, 2), raw);
});

test('显式重新分类只写canonical，旧long-term输入也不再产生legacy新值', () => {
  const original = withUnknown(make('legacy', 'long-term')), raw = JSON.stringify(original);
  for (const value of ['long-term', 'replayable'] as const) {
    assert.deepEqual(experienceCategoryPatch(value), { experienceCategory: 'replayable' });
    assert.deepEqual(experienceClassificationPatch(value), { experienceStatus: 'experienced', experienceCategory: 'replayable' });
    for (const kind of ['category', 'classification'] as const) {
      const patch = createExperiencePatch(original, { kind, value });
      assert.ok(patch); assert.equal(patch.experienceCategory, 'replayable');
      const plan = planExperienceBatchChange([original], ['legacy'], { kind, value }, now);
      assert.equal(plan.changedCount, 1); assert.equal(plan.items[0].experienceCategory, 'replayable');
      preserve(original, plan.items[0], ['experienceStatus', 'experienceCategory', 'updatedAt']);
      const noChange = planExperienceBatchChange(plan.items, ['legacy'], { kind, value }, now);
      assert.equal(noChange.changedCount, 0); assert.equal(noChange.items, plan.items);
      const roundtrip = JSON.parse(JSON.stringify({ schemaVersion: 1, items: plan.items }));
      assert.equal(isValidSnapshot(roundtrip), true); assert.equal(roundtrip.items[0].experienceCategory, 'replayable');
    }
  }
  assert.equal(JSON.stringify(original), raw);
});

test('全部分类资格矩阵独立于完成事实、旧状态、历史评级和时长；无资格历史值原样保留', () => {
  for (const row of cases) for (const completion of ['unknown', 'not-cleared', 'cleared', 'not-applicable'] as const) {
    for (const gamePlayState of ['want', 'playing', 'cleared', 'paused', 'abandoned'] as const) for (const personalGrade of [undefined, 'SSS'] as const) {
      const item = Object.freeze(make(row.value, row.value, { completion, gamePlayState, personalGrade })), raw = JSON.stringify(item);
      assert.equal(priorityEditable(item), row.priority, row.value); assert.equal(inPlanView(item), row.priority);
      assert.equal(gradeEditable(item), row.rating, row.value);
      assert.equal(coverFinishFor(item), row.rating && personalGrade === 'SSS' ? 'prismatic' : 'standard');
      assert.equal(JSON.stringify(item), raw);
    }
  }
  for (const category of ['book', 'screen', 'music'] as const) for (const row of cases) {
    const item = make(category, row.value, { category }), raw = JSON.stringify(item);
    assert.equal(priorityEditable(item), false); assert.equal(gradeEditable(item), false); assert.equal(coverFinishFor(item), 'standard');
    assert.equal(JSON.stringify(item), raw);
  }
});

test('快捷与旧批量等级保存共用资格，只重置对应序号；无资格不能设置或清除历史等级', () => {
  const original = cases.map(row => withUnknown(make(row.value, row.value)));
  const book = make('book', 'replayable', { category: 'book' }), trash = make('trash', 'replayable', { removedAt: now }), unselected = make('unselected', 'replayable');
  const items = [...original, book, trash, unselected], raw = JSON.stringify(items), selected = [...cases.map(row => row.value), 'book', 'trash', 'missing', 'replayable'];
  for (const mode of ['priority', 'rating'] as const) {
    const key = mode === 'priority' ? 'playPriority' : 'personalGrade', order = mode === 'priority' ? 'priorityOrder' : 'ratingOrder';
    const changed = createBulkGradePatch(items, selected, mode, 'SSS', now);
    assert.equal(changed.changedCount, cases.filter(row => row[mode]).length); assert.deepEqual(ids(changed.items), ids(items));
    for (let index = 0; index < items.length; index++) {
      const eligible = index < cases.length && cases[index][mode];
      assert.equal(changed.items[index][key], eligible ? 'SSS' : items[index][key]);
      assert.equal(changed.items[index][order], eligible ? undefined : items[index][order]);
      preserve(items[index], changed.items[index], eligible ? [key, order, 'updatedAt'] : []);
      if (!eligible) assert.equal(changed.items[index], items[index]);
    }
    const same = createBulkGradePatch(changed.items, selected, mode, 'SSS', now);
    assert.equal(same.changedCount, 0); assert.equal(same.items, changed.items);
    const cleared = createBulkGradePatch(changed.items, selected, mode, undefined, now);
    for (let index = 0; index < cases.length; index++) assert.equal(cleared.items[index][key], cases[index][mode] ? undefined : original[index][key]);
    for (let index = 0; index < cases.length; index++) for (const next of ['SSS', null] as const) {
      const plan = createGameBatchEditPlan([original[index]], [original[index].id], { [key]: next }, now);
      assert.equal(plan.changedCount, cases[index][mode] ? 1 : 0);
      preserve(original[index], plan.items[0], cases[index][mode] ? [key, order, 'updatedAt'] : []);
      if (!cases[index][mode]) assert.equal(plan.items[0], original[index]);
    }
  }
  assert.equal(JSON.stringify(items), raw); assert.equal(isValidSnapshot({ schemaVersion: 1, items }), true);
});

test('两套等级组不遗漏新游戏+和legacy长线，同级排序仅改当前序号，排除生命周期与非目标分类', () => {
  const items = [...cases.map(row => make(row.value, row.value)), make('hidden', 'replayable', { hiddenAt: now }), make('trash', 'replayable', { removedAt: now }), make('book', 'replayable', { category: 'book' })];
  const raw = JSON.stringify(items);
  for (const mode of ['priority', 'rating'] as const) for (const direction of ['asc', 'desc'] as const) {
    const actual = groupRankedGames(items, mode, true, direction).flatMap(group => ids(group.items));
    const expected = cases.filter(row => row[mode]).map(row => row.value);
    assert.deepEqual([...actual].sort(), [...expected].sort()); assert.equal(new Set(actual).size, expected.length);
  }
  const legacy = withUnknown(make('legacy', 'long-term')), canonical = withUnknown(make('canonical', 'replayable'));
  const source = [legacy, canonical, make('outside', 'put-aside')];
  for (const mode of ['priority', 'rating'] as const) {
    const moved = moveGameWithinRank(source, 'canonical', 'legacy', mode), order = mode === 'priority' ? 'priorityOrder' : 'ratingOrder';
    assert.equal(moved.changedCount, 2); assert.deepEqual(groupRankedGames(moved.items, mode).flatMap(group => ids(group.items)), ['canonical', 'legacy']);
    for (let index = 0; index < source.length; index++) preserve(source[index], moved.items[index], [order]);
    assert.equal(moved.items[2], source[2]); assert.equal(moved.items[0].experienceCategory, 'long-term');
    const blocked = moveGameWithinRank(source, 'outside', 'legacy', mode);
    assert.equal(blocked.changedCount, 0); assert.equal(blocked.items, source);
  }
  assert.equal(JSON.stringify(items), raw);
});

test('保留旧明确完成API，事实与次数更新及撤销不改变新分类、等级、排序、时长或普通日志', () => {
  for (const row of cases) {
    const original = withUnknown(make(row.value, row.value)), raw = JSON.stringify(original);
    const result = recordCompletion(original, { eventId: 'new-event', occurredAt: '2023-05', countChoice: 'increment', markCleared: true }, now);
    assert.ok(result); const after = { ...original, ...result.patch };
    assert.equal(after.completionCount, 1); assert.equal(completionFor(after), 'cleared');
    assert.ok(after.completionEvents); assert.equal(after.completionEvents.length, 2); assert.equal(after.completionEvents[1].occurredAt, '2023-05');
    preserve(original, after, ['completion', 'completionCount', 'completionEvents']);
    assert.equal(priorityEditable(after), row.priority); assert.equal(gradeEditable(after), row.rating);
    const undo = undoCompletionRecord(after, result.undo); assert.ok(undo);
    assert.deepEqual({ ...after, ...undo }, original); assert.equal(JSON.stringify(original), raw);
  }
});
