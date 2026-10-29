import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesScreenShelf, screenArrangementOptions, screenDisplayArrangement, screenKind, screenShelves } from './screenConsumption.ts';
import { applyScreenAction } from './screens.ts';
import type { MediaItem, ScreenArrangement } from './types.ts';

const film = (extra: Partial<MediaItem> = {}): MediaItem => ({ id: 'film', category: 'screen', subcategory: '电影', title: '合成电影', creator: '', year: '', status: 'want', tags: [], impression: '', favorite: false, artwork: 'default', createdAt: '', updatedAt: '', ...extra });

test('影视一级类型兼容旧子类，未知类型仍可从电影找回', () => {
  for (const subtype of ['电影', 'Movie', '', '旧自定类型', '动画电影']) assert.equal(screenKind(film({ subcategory: subtype })), 'movie');
  for (const subtype of ['番剧', 'Anime', '动漫']) assert.equal(screenKind(film({ subcategory: subtype })), 'anime');
  for (const subtype of ['连续剧', '电视剧', 'TV Series', '剧集']) assert.equal(screenKind(film({ subcategory: subtype })), 'series');
  assert.equal(matchesScreenShelf(film({ category: 'book' }), 'movie', 'all'), false);
});

test('电影不提供在看搁置弃看，剧集仅多一个在看入口', () => {
  assert.deepEqual(screenShelves('movie').map(view => view.id), ['all', 'want', 'watched']);
  for (const kind of ['anime', 'series'] as const) assert.deepEqual(screenShelves(kind).map(view => view.id), ['all', 'want', 'watching', 'watched']);
  assert.deepEqual(screenArrangementOptions(film()).map(option => option.value), ['want', 'none']);
  assert.deepEqual(screenArrangementOptions(film({ subcategory: '番剧' })).map(option => option.value), ['want', 'watching', 'none']);
});

test('旧观看安排只读归入新菜单，原始信息、未知字段及真实0不改写', () => {
  for (const subcategory of ['电影', '番剧', '连续剧']) for (const arrangement of ['want', 'watching', 'none', 'idle', 'abandoned'] as ScreenArrangement[]) {
    const item = { ...film({ subcategory, personalScore: 0, screenViewing: { arrangement } }), future: { keep: true } };
    const before = JSON.stringify(item), kind = screenKind(item);
    assert.ok(screenShelves(kind).some(view => view.id !== 'all' && matchesScreenShelf(item, kind, view.id)));
    assert.equal(screenDisplayArrangement(item), kind !== 'movie' && arrangement === 'watching' ? 'watching' : 'want');
    assert.equal(matchesScreenShelf(item, kind, 'watched'), false);
    assert.equal(matchesScreenShelf(item, kind === 'movie' ? 'anime' : 'movie', 'all'), false);
    assert.equal(JSON.stringify(item), before);
  }
});

test('电影多刷保留原感想与看过事实，想看表示下一次计划', () => {
  const item = film({ status: 'finished', screenViewing: { rounds: [{ id: 'first', finishedOn: '2024-03', impression: '首看感想', review: '' }] } });
  const replay = applyScreenAction(item, { type: 'arrangement', value: 'want' }, 'now');
  assert.equal(matchesScreenShelf(replay, 'movie', 'want'), true);
  assert.equal(matchesScreenShelf(replay, 'movie', 'watched'), true);
  assert.equal(matchesScreenShelf(replay, 'movie', 'watching'), false);
  const twice = applyScreenAction(replay, { type: 'round', round: { id: 'second', impression: '再看感想', review: '' }, finishPlan: true }, 'later');
  assert.equal(screenDisplayArrangement(twice), 'none');
  assert.equal(twice.screenViewing?.rounds?.length, 2);
  assert.equal(twice.screenViewing?.rounds?.[0].impression, '首看感想');
  assert.equal(twice.screenViewing?.rounds?.[1].finishedOn, undefined);
});

test('多季进度不推断看过，重看剧集仍可从历史看过中找到', () => {
  const series = film({ subcategory: '番剧', screenViewing: { arrangement: 'watching', progress: { season: 3, episode: 12 } } });
  assert.equal(matchesScreenShelf(series, 'anime', 'watching'), true);
  assert.equal(matchesScreenShelf(series, 'anime', 'watched'), false);
  const rewatch = { ...series, status: 'finished' as const };
  assert.equal(matchesScreenShelf(rewatch, 'anime', 'watching'), true);
  assert.equal(matchesScreenShelf(rewatch, 'anime', 'watched'), true);
});
