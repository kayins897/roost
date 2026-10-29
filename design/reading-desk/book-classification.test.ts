import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangementOf, deskReducer } from './book-classification.ts';
import { createDeskSeed, shelfBooks } from './catalog.ts';
import { createBookTags } from './book-tags.ts';
import { INITIAL_VIEW, viewReducer } from './library-view.ts';

const ids = (state = createDeskSeed(), face = INITIAL_VIEW.face) => shelfBooks(state, createBookTags(), { ...INITIAL_VIEW, face }).map(work => work.id);

test('all six shelves cover the catalogue, with unique books and independent read history', () => {
  assert.equal(ids().length, 8);
  assert.equal(new Set(ids()).size, 8);
  assert.deepEqual(ids().slice(0, 2), ['b1', 'b3']);
  assert.deepEqual(new Set(ids(undefined, 'plan')), new Set(['b2', 'b4', 'b6']));
  assert.deepEqual(new Set(ids(undefined, 'reading')), new Set(['b1', 'b3']));
  assert.equal(ids(undefined, 'records').length, 5);
  assert.deepEqual(ids(undefined, 'idle'), ['b7']);
  assert.deepEqual(ids(undefined, 'abandoned'), ['b5']);
});

test('shelving and abandoning preserve past rounds, minutes, plans and reasons; explicit resumption works', () => {
  const before = createDeskSeed();
  const idle = deskReducer(before, { type: 'arrangement', workId: 'b1', value: 'idle' });
  const abandoned = deskReducer(idle, { type: 'arrangement', workId: 'b1', value: 'abandoned' });
  assert.strictEqual(abandoned.plans, before.plans);
  assert.strictEqual(abandoned.rounds, before.rounds);
  assert.strictEqual(abandoned.activities, before.activities);
  assert.ok(ids(abandoned, 'records').includes('b1'));
  assert.ok(!ids(abandoned, 'reading').includes('b1'));
  const logged = deskReducer(abandoned, { type: 'activity', activity: { id: 'new', workId: 'b1', date: '2026-10-27', kind: 'reading', minutes: 1, note: '' } });
  assert.equal(arrangementOf(logged, 'b1'), 'abandoned');
  const resumed = deskReducer(logged, { type: 'arrangement', workId: 'b1', value: 'reading' });
  assert.equal(arrangementOf(resumed, 'b1'), 'reading');
  assert.deepEqual(resumed.plans, before.plans);
});

test('marking unread books read requires a round; unknown completion date stays unknown', () => {
  const before = createDeskSeed();
  assert.strictEqual(deskReducer(before, { type: 'arrangement', workId: 'b7', value: 'read' }), before);
  const after = deskReducer(before, { type: 'round', round: { id: 'r-new', workId: 'b7', impression: '一次新的阅读', review: '' }, finishPlan: true });
  assert.equal(arrangementOf(after, 'b7'), 'read');
  assert.ok(ids(after, 'records').includes('b7'));
  assert.equal(after.rounds.at(-1)?.finishedOn, undefined);
  assert.strictEqual(after.activities, before.activities);
  const paused = deskReducer(after, { type: 'arrangement', workId: 'b7', value: 'idle' });
  const edited = deskReducer(paused, { type: 'round', round: { ...after.rounds.at(-1)!, impression: '补充感想' } });
  assert.equal(arrangementOf(edited, 'b7'), 'idle');
});

test('editing a saved reason preserves idle status; resuming requires an explicit arrangement choice', () => {
  const before = createDeskSeed();
  const paused = deskReducer(before, { type: 'arrangement', workId: 'b1', value: 'idle' });
  const originalPlan = paused.plans.find(plan => plan.workId === 'b1')!;
  const planned = deskReducer(paused, { type: 'plan', plan: { ...originalPlan, reason: '以后重读' } });
  assert.equal(arrangementOf(planned, 'b1'), 'idle');
  assert.ok(!ids(planned, 'plan').includes('b1'));
  assert.ok(ids(planned, 'records').includes('b1'));
  assert.equal(planned.rounds.length, before.rounds.length);
  const resumed = deskReducer(planned, { type: 'arrangement', workId: 'b1', value: 'want' });
  assert.equal(arrangementOf(resumed, 'b1'), 'want');
  assert.ok(ids(resumed, 'plan').includes('b1'));
});

test('tags, independent scores and sources compose; clearing filters preserves the selected shelf', () => {
  const state = createDeskSeed(), tags = createBookTags();
  let view = viewReducer(INITIAL_VIEW, { type: 'facet', key: 'personalScore', value: 'score:9' });
  assert.deepEqual(new Set(shelfBooks(state, tags, view).map(work => work.id)), new Set(['b1', 'b2']));
  view = viewReducer(view, { type: 'facet', key: 'doubanScore', value: 'score:8' });
  assert.deepEqual(shelfBooks(state, tags, view).map(work => work.id), ['b2']);
  view = viewReducer(view, { type: 'facet', key: 'readingSource', value: '汉王电纸书' });
  assert.equal(shelfBooks(state, tags, view).length, 0);
  view = viewReducer(view, { type: 'face', face: 'records' });
  view = viewReducer(view, { type: 'clear-filters' });
  assert.equal(view.face, 'records');
  assert.equal(shelfBooks(state, tags, view).length, 5);
});
