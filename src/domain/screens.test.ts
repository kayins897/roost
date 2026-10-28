import assert from 'node:assert/strict';
import test from 'node:test';
import { applyScreenAction, isScreenSeries, screenArrangement, screenHasWatched, screenProgressLabel, screenRounds, validateScreenAction } from './screens.ts';
import { isValidSnapshot } from './library.ts';
import { isScreenCollections, isScreenDetails, isScreenTagCatalog } from './screensValidation.ts';
import type { ExperienceEntry, MediaItem, ScreenArrangement } from './types.ts';

const now = '2026-10-28T10:00:00.000Z';
const make = (extra: Partial<MediaItem> = {}): MediaItem => ({ id: 'screen', title: '合成剧集', category: 'screen', subcategory: '连续剧', creator: '合成导演', year: '', status: 'want', tags: [], impression: '旧印象', review: '旧长评', favorite: false, artwork: 'default', createdAt: '', updatedAt: '', ...extra });
const entry = (minutes?: number): ExperienceEntry => ({ id: 'log', date: '2026-10-28', kind: 'completed', note: '普通观影随记', minutes });

test('影视旧四态只读派生，不自动补写轮次、进度或日期', () => {
  for (const [status, arrangement, watched] of [['want', 'want', false], ['active', 'watching', false], ['paused', 'idle', false], ['finished', 'none', true]] as const) {
    const item = make({ status }), raw = JSON.stringify(item);
    assert.equal(screenArrangement(item), arrangement); assert.equal(screenHasWatched(item), watched);
    assert.deepEqual(screenRounds(item), []); assert.equal(screenProgressLabel(item), '进度未记录');
    assert.equal(JSON.stringify(item), raw);
    assert.equal(applyScreenAction(item, { type: 'arrangement', value: arrangement }, now), item);
  }
  assert.equal(screenHasWatched(make({ category: 'game', status: 'finished' })), false);
  assert.equal(screenArrangement(make({ category: 'book', status: 'active' })), 'none');
});

test('重看安排与曾看过独立，五种安排不修改原状态、评分和历史', () => {
  const item = { ...make({ status: 'finished', personalScore: 0, experienceEntries: [entry(0)], screenViewing: { rounds: [{ id: 'r', finishedOn: '2020', impression: '首看', review: '' }], progress: { season: 1, episode: 0 } } }), future: { keep: 1 } };
  const raw = JSON.stringify(item);
  for (const value of ['want', 'watching', 'idle', 'abandoned', 'none'] as ScreenArrangement[]) {
    const next = applyScreenAction(item, { type: 'arrangement', value }, now);
    assert.equal(screenArrangement(next), value); assert.equal(screenHasWatched(next), true);
    assert.equal(next.personalScore, 0); assert.equal(next.status, 'finished');
    assert.equal(next.impression, item.impression); assert.equal(next.review, item.review);
    assert.equal(next.experienceEntries, item.experienceEntries); assert.equal(next.screenViewing?.rounds, item.screenViewing.rounds);
    assert.equal(next.screenViewing?.progress, item.screenViewing.progress);
    assert.equal((next as typeof item).future, item.future);
    assert.equal(applyScreenAction(next, { type: 'arrangement', value }, now), next);
  }
  assert.equal(JSON.stringify(item), raw);
});

test('剧集季集进度不推算看完、日志或实际观看分钟，电影拒绝季集操作', () => {
  const item = make({ screenDetails: { durationMinutes: 45, episodeCount: 12 } });
  const next = applyScreenAction(item, { type: 'progress', season: 2, episode: 12 }, now);
  assert.equal(screenProgressLabel(next), '第 2 季 · 第 12 集');
  assert.equal(screenHasWatched(next), false); assert.equal(screenArrangement(next), 'want');
  assert.equal(next.experienceEntries, undefined); assert.equal(next.playtimeMinutes, undefined); assert.equal(next.screenViewing?.rounds, undefined);
  assert.equal(applyScreenAction(next, { type: 'progress', season: 2, episode: 12 }, now), next);
  const reset = applyScreenAction(next, { type: 'progress', episode: 0 }, now);
  assert.equal(screenProgressLabel(reset), '尚未开始'); assert.equal(reset.screenViewing?.progress?.season, undefined);
  const movie = make({ subcategory: '电影' });
  assert.equal(applyScreenAction(movie, { type: 'progress', episode: 2 }, now), movie); assert.equal(screenProgressLabel(movie), '');
  assert.equal(isScreenSeries(make({ subcategory: '番剧' })), true);
});

test('看过记录保留日期精度，每轮感想独立，明确结束才改变当前安排', () => {
  let item = make({ screenViewing: { arrangement: 'watching' } });
  for (const [index, finishedOn] of [undefined, '2023', '2024-02', '2024-02-29'].entries()) {
    item = applyScreenAction(item, { type: 'round', round: { id: String(index), finishedOn, impression: `第${index}次`, review: '长评' } }, now);
    assert.equal(screenHasWatched(item), true); assert.equal(screenArrangement(item), 'watching');
  }
  assert.deepEqual(screenRounds(item).map(round => round.finishedOn), [undefined, '2023', '2024-02', '2024-02-29']);
  const first = screenRounds(item)[0], finished = applyScreenAction(item, { type: 'round', round: first, finishPlan: true }, now);
  assert.equal(screenArrangement(finished), 'none'); assert.equal(finished.status, 'want'); assert.equal(finished.impression, '旧印象');
  assert.equal(finished.experienceEntries, undefined); assert.equal(finished.completionCount, undefined);
  assert.equal(applyScreenAction(finished, { type: 'round', round: first }, now), finished);
  const removed = applyScreenAction(finished, { type: 'remove-round', id: '0' }, now);
  assert.equal(screenRounds(removed).length, 3); assert.equal(screenRounds(removed)[0].impression, '第1次');
  assert.equal(applyScreenAction(removed, { type: 'remove-round', id: 'missing' }, now), removed);
});

test('普通完成日志不是一次看完，零分钟和未记录独立，更新删除保持未知扩展', () => {
  const base = make();
  const logged = applyScreenAction(base, { type: 'entry', entry: entry(0) }, now);
  assert.equal(screenHasWatched(logged), false); assert.deepEqual(screenRounds(logged), []); assert.equal(logged.experienceEntries?.[0].minutes, 0);
  assert.equal(applyScreenAction(logged, { type: 'entry', entry: entry(0) }, now), logged);
  const unknown = applyScreenAction(logged, { type: 'entry', entry: entry() }, now);
  assert.equal(unknown.experienceEntries?.length, 1); assert.equal(unknown.experienceEntries?.[0].minutes, undefined);
  assert.equal(applyScreenAction(unknown, { type: 'remove-entry', id: 'log' }, now).experienceEntries?.length, 0);
  const extended = { ...make(), screenViewing: { arrangement: 'watching' as const, future: 9, progress: { season: 1, episode: 2, future: 8 }, rounds: [{ id: 'r', impression: '', review: '', future: 7 }] } };
  const edited = applyScreenAction(extended, { type: 'progress', episode: 3 }, now) as typeof extended;
  assert.equal(edited.screenViewing.future, 9); assert.equal(edited.screenViewing.progress.future, 8);
  const round = applyScreenAction(edited, { type: 'round', round: { id: 'r', impression: '新', review: '' } }, now) as typeof extended;
  assert.equal(round.screenViewing.rounds[0].future, 7);
});

test('非法动作拒绝保存，回收作品及其他媒体原样返回', () => {
  const item = make();
  const invalid = [{ type: 'progress', season: 0 }, { type: 'progress', episode: -1 }, { type: 'progress', episode: 1.5 }, { type: 'arrangement', value: 'finished' }, { type: 'round', round: { id: 'r', impression: '', review: '', finishedOn: '2023-02-29' } }, { type: 'round', round: { id: 'r', impression: '', review: '' }, finishPlan: 'yes' }, { type: 'entry', entry: { ...entry(), date: '2023' } }];
  for (const action of invalid) { assert.equal(validateScreenAction(action), false); assert.equal(applyScreenAction(item, action as never, now), item); }
  const trash = make({ removedAt: now }); assert.equal(applyScreenAction(trash, { type: 'arrangement', value: 'watching' }, now), trash);
  const book = make({ category: 'book' }); assert.equal(applyScreenAction(book, { type: 'arrangement', value: 'watching' }, now), book);
});

test('影视扩展校验保留未知字段，不接受重复轮次、非法日期与冲突标签目录', () => {
  const item = make({ screenViewing: { progress: { episode: 0 }, rounds: [{ id: 'r', impression: '', review: '' }] }, screenDetails: { durationMinutes: 0, episodeCount: 0, doubanScore: 0 } });
  const snapshot = { schemaVersion: 1, items: [item], screenCollections: [{ id: 'c', title: '科幻', description: '', screenIds: ['screen', 'missing'] }], screenTagCatalog: ['科幻'], future: {} };
  assert.equal(isValidSnapshot(snapshot), true); assert.equal(isScreenDetails({ actors: ['甲'], future: true }), true);
  assert.equal(isValidSnapshot({ ...snapshot, items: [{ ...item, screenViewing: { rounds: [...item.screenViewing!.rounds!, ...item.screenViewing!.rounds!] } }] }), false);
  assert.equal(isScreenDetails({ doubanScore: 10.1 }), false); assert.equal(isScreenDetails({ durationMinutes: -1 }), false);
  assert.equal(isScreenCollections([{ id: 'c', title: '片单', description: '', screenIds: ['screen', 'screen'] }]), false);
  assert.equal(isScreenTagCatalog(['科幻', ' 科幻 ']), false); assert.equal(isScreenTagCatalog([]), true);
});
