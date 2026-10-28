import assert from 'node:assert/strict';
import test from 'node:test';
import { applyBookAction, bookArrangement, bookDailyMinutes, bookDuration, bookHasRead, bookPlanFor, bookReadingSummary, bookRounds } from './books.ts';
import { isValidSnapshot } from './library.ts';
import type { BookAction, BookArrangement } from './books.ts';
import type { ExperienceEntry, LibrarySnapshot, MediaItem } from './types.ts';

const now = '2026-10-28T10:00:00.000Z';
const make = (extra: Partial<MediaItem> = {}): MediaItem => ({
  id: 'book', title: '合成书籍', category: 'book', subcategory: '小说', creator: '合成作者', year: '', status: 'want',
  tags: [], impression: '旧版感想', review: '旧版长评', favorite: false, artwork: 'default', createdAt: '', updatedAt: '', ...extra,
});
const entry = (id: string, minutes?: number, date = '2026-10-28'): ExperienceEntry => ({ id, date, minutes, kind: 'progress', note: '' });
const snapshot = (item: MediaItem): LibrarySnapshot => ({ schemaVersion: 1, items: [item] });

test('book legacy states are read-only fallbacks; finished has unknown-date history, paused means idle', () => {
  for (const [status, arrangement, read] of [['want', 'want', false], ['active', 'reading', false], ['paused', 'idle', false], ['finished', 'none', true]] as const) {
    const item = make({ status }), raw = JSON.stringify(item);
    assert.equal(bookArrangement(item), arrangement);
    assert.equal(bookHasRead(item), read);
    assert.deepEqual(bookRounds(item), []);
    assert.equal(bookPlanFor(item), undefined);
    assert.equal(JSON.stringify(item), raw, 'selectors never migrate or fabricate a round');
  }
  const item = make({ status: 'finished', bookReading: { arrangement: 'want' } });
  assert.equal(bookArrangement(item), 'want', 'explicit arrangement wins over old status');
  assert.equal(bookHasRead(item), true, 'future plans and reading history coexist');
  const other = make({ category: 'game', status: 'finished' });
  assert.equal(bookArrangement(other), 'none');
  assert.equal(bookHasRead(other), false);
  assert.equal(bookDuration(other), undefined);
});

test('all five explicit arrangements change only the requested dimension and same values are no-ops', () => {
  const item = make({ status: 'finished', personalScore: 0, experienceEntries: [entry('old', 0)],
    bookReading: { plan: { reason: '未来重读' }, rounds: [{ id: 'r', impression: '旧轮感想', review: '' }] } });
  for (const value of ['want', 'reading', 'idle', 'abandoned', 'none'] as BookArrangement[]) {
    const next = applyBookAction(item, { type: 'arrangement', value }, now);
    assert.equal(bookArrangement(next), value);
    assert.equal(bookHasRead(next), true);
    assert.equal(next.status, 'finished');
    assert.equal(next.impression, item.impression);
    assert.equal(next.review, item.review);
    assert.equal(next.personalScore, 0);
    assert.equal(next.experienceEntries, item.experienceEntries);
    assert.equal(next.bookReading?.plan, item.bookReading?.plan);
    assert.equal(next.bookReading?.rounds, item.bookReading?.rounds);
    assert.equal(applyBookAction(next, { type: 'arrangement', value }, 'later'), next);
  }
  const oldWant = make();
  assert.equal(applyBookAction(oldWant, { type: 'arrangement', value: 'want' }, now), oldWant, 'do not normalize legacy fallback');
});

test('new plans queue a book, but editing retained plans never resumes idle or abandoned books', () => {
  const source = make({ status: 'finished' });
  const planned = applyBookAction(source, { type: 'plan', reason: '再读一次', targetDate: '2027', order: 0 }, now);
  assert.equal(bookArrangement(planned), 'want');
  assert.equal(bookHasRead(planned), true);
  assert.deepEqual(bookPlanFor(planned), { reason: '再读一次', targetDate: '2027', order: 0 });
  for (const value of ['idle', 'abandoned', 'none', 'reading'] as const) {
    const paused = applyBookAction(planned, { type: 'arrangement', value }, now);
    const edited = applyBookAction(paused, { type: 'plan', reason: '保留新理由' }, now);
    assert.equal(bookArrangement(edited), value);
    assert.equal(bookPlanFor(edited)?.order, 0, 'editing a reason does not discard manual order');
    assert.equal(bookPlanFor(edited)?.targetDate, undefined, 'an explicitly cleared optional intention stays unknown');
    assert.equal(applyBookAction(edited, { type: 'plan', reason: '保留新理由' }, 'later'), edited);
  }
});

test('first plan reasons preserve active, idle and abandoned arrangements even without an existing plan', () => {
  for (const value of ['reading', 'idle', 'abandoned'] as const) {
    const source = make({ bookReading: { arrangement: value } });
    const next = applyBookAction(source, { type: 'plan', reason: '先记下阅读理由' }, now);
    assert.equal(bookArrangement(next), value);
    assert.equal(bookPlanFor(next)?.reason, '先记下阅读理由');
    assert.equal(next.status, source.status);
  }
  for (const status of ['active', 'paused'] as const) {
    const source = make({ status });
    const next = applyBookAction(source, { type: 'plan', reason: '保留旧版安排' }, now);
    assert.equal(bookArrangement(next), bookArrangement(source));
    assert.equal(next.bookReading?.arrangement, undefined, 'do not materialize or change legacy fallback');
  }
});

test('reading rounds accept unknown/year/month/day dates without inventing daily time or logs', () => {
  for (const finishedOn of [undefined, '2024', '2024-02', '2024-02-29']) {
    const source = make({ bookReading: { arrangement: 'reading', plan: { reason: '原计划' } } });
    const action: BookAction = { type: 'round', round: { id: 'r', finishedOn, impression: '感想', review: '长评' }, finishPlan: true };
    const next = applyBookAction(source, action, now);
    assert.equal(bookHasRead(next), true);
    assert.equal(bookArrangement(next), 'none');
    assert.equal(bookPlanFor(next)?.reason, '原计划', 'finish leaves the reason available for future rereading');
    assert.equal(bookRounds(next)[0].finishedOn, finishedOn);
    assert.equal(next.experienceEntries, undefined);
    assert.equal(next.playtimeMinutes, undefined);
    assert.equal(next.impression, '旧版感想', 'new round comments do not replace legacy book-level feelings');
    assert.equal(applyBookAction(next, action, 'later'), next, 'same-ID retries are idempotent');
    assert.ok(isValidSnapshot(snapshot(next)));
  }
});

test('editing/removing a round preserves its position and unrelated history; legacy evidence is not erased', () => {
  const first = { id: 'a', finishedOn: '2023', impression: 'a', review: '' }, second = { id: 'b', impression: 'b', review: '' };
  const source = make({ bookReading: { arrangement: 'abandoned', rounds: [first, second] } });
  const edited = applyBookAction(source, { type: 'round', round: { ...first, finishedOn: undefined, review: '补写' } }, now);
  assert.deepEqual(bookRounds(edited).map(round => round.id), ['a', 'b']);
  assert.equal(bookRounds(edited)[1], second);
  assert.equal(bookRounds(edited)[0].finishedOn, undefined);
  assert.equal(bookArrangement(edited), 'abandoned');
  const one = applyBookAction(edited, { type: 'remove-round', id: 'a' }, now);
  const empty = applyBookAction(one, { type: 'remove-round', id: 'b' }, now);
  assert.equal(bookHasRead(empty), false);
  assert.equal(bookArrangement(empty), 'abandoned');
  assert.equal(applyBookAction(empty, { type: 'remove-round', id: 'absent' }, now), empty);
  assert.equal(bookHasRead({ ...empty, status: 'finished' }), true, 'old finished fact survives removing a new round');
});

test('ordinary completed/progress/note logs do not create a finished round or resume a shelved book', () => {
  let item = make({ bookReading: { arrangement: 'idle', plan: { reason: '以后读' } } });
  for (const kind of ['started', 'progress', 'completed', 'note'] as const) {
    const action: BookAction = { type: 'entry', entry: { ...entry(kind, 0), kind } };
    item = applyBookAction(item, action, now);
    assert.equal(bookHasRead(item), false);
    assert.equal(bookArrangement(item), 'idle');
    assert.equal(applyBookAction(item, action, 'later'), item);
  }
  assert.equal(bookDuration(item), 0, 'real zero minutes is not unknown');
  const removed = applyBookAction(item, { type: 'remove-entry', id: 'note' }, now);
  assert.deepEqual(removed.experienceEntries?.map(value => value.id), ['started', 'progress', 'completed']);
  assert.equal(applyBookAction(removed, { type: 'remove-entry', id: 'absent' }, now), removed);
});

test('durations distinguish no record, unknown duration, zero, and partially known totals', () => {
  assert.equal(bookDuration(make()), undefined);
  assert.equal(bookDuration(make({ experienceEntries: [entry('unknown')] })), undefined);
  const item = make({ playtimeMinutes: 8000, experienceEntries: [entry('unknown'), entry('zero', 0), entry('known', 15)] });
  assert.equal(bookDuration(item), 15, 'never add unrelated legacy cumulative minutes');
  assert.deepEqual(bookDailyMinutes([item], '2026-10-28'), { minutes: 15, hasRecords: true, unknown: true });
  assert.deepEqual(bookDailyMinutes([make({ experienceEntries: [entry('zero', 0)] })], '2026-10-28'), { minutes: 0, hasRecords: true, unknown: false });
  assert.deepEqual(bookDailyMinutes([make({ experienceEntries: [entry('unknown')] })], '2026-10-28'), { minutes: undefined, hasRecords: true, unknown: true });
  assert.deepEqual(bookDailyMinutes([item], '2026-10-27'), { minutes: undefined, hasRecords: false, unknown: false });
});

test('day heatmap excludes month precision and finish-only dates while summary retains known monthly sessions', () => {
  const item = make({ experienceEntries: [entry('month', 60, '2026-10'), entry('day', 10)],
    bookReading: { rounds: [{ id: 'year', finishedOn: '2026', impression: '', review: '' }, { id: 'month', finishedOn: '2026-10', impression: '', review: '' }] } });
  assert.deepEqual(bookDailyMinutes([item], '2026-10'), { minutes: undefined, hasRecords: false, unknown: false });
  assert.deepEqual(bookDailyMinutes([item], '2026-10-01'), { minutes: undefined, hasRecords: false, unknown: false });
  assert.equal(bookDailyMinutes([item], '2026-10-28').minutes, 10);
  assert.deepEqual(bookReadingSummary([item]), { books: 1, minutes: 70, unknownCount: 0 });
});

test('summary counts read books once, known minutes and missing-duration logs; trash excluded, visibility is caller scoped', () => {
  const books = [make({ status: 'finished', experienceEntries: [entry('unknown'), entry('zero', 0)] }),
    make({ id: 'repeat', bookReading: { arrangement: 'want', rounds: [{ id: 'r1', impression: '', review: '' }, { id: 'r2', impression: '', review: '' }] }, experienceEntries: [entry('known', 30), entry('unknown2')] }),
    make({ id: 'trash', status: 'finished', removedAt: now, experienceEntries: [entry('trash', 100)] }),
    make({ id: 'hidden', hiddenAt: now, experienceEntries: [entry('hidden', 5)] }),
    make({ id: 'game', category: 'game', status: 'finished', experienceEntries: [entry('game', 999)] })];
  assert.deepEqual(bookReadingSummary(books), { books: 2, minutes: 35, unknownCount: 2 });
  assert.equal(bookDailyMinutes(books, '2026-10-28').minutes, 35);
  assert.equal(bookReadingSummary(books.filter(item => !item.hiddenAt)).minutes, 30);
  assert.deepEqual(bookReadingSummary([]), { books: 0, minutes: undefined, unknownCount: 0 });
});

test('book actions preserve unknown nested extensions, raw legacy values and other media', () => {
  const extension = { preserved: ['opaque'] };
  const source = { ...make({ bookReading: { arrangement: 'idle', plan: { reason: 'old', order: 3 }, rounds: [{ id: 'r', impression: 'old', review: '' }] }, experienceEntries: [entry('e', 10)] }), futureItem: extension };
  Object.assign(source.bookReading!, { futureReading: extension });
  Object.assign(source.bookReading!.plan!, { futurePlan: extension });
  Object.assign(source.bookReading!.rounds![0], { futureRound: extension });
  Object.assign(source.experienceEntries![0], { futureEntry: extension });
  let next = applyBookAction(source, { type: 'plan', reason: 'new' }, now);
  next = applyBookAction(next, { type: 'round', round: { id: 'r', impression: 'new', review: '' } }, now);
  next = applyBookAction(next, { type: 'entry', entry: entry('e') }, now);
  assert.equal((next as typeof source).futureItem, extension);
  assert.equal((next.bookReading as unknown as Record<string, unknown>).futureReading, extension);
  assert.equal((next.bookReading!.plan as unknown as Record<string, unknown>).futurePlan, extension);
  assert.equal((bookRounds(next)[0] as unknown as Record<string, unknown>).futureRound, extension);
  assert.equal((next.experienceEntries![0] as unknown as Record<string, unknown>).futureEntry, extension);
  assert.equal(next.experienceEntries![0].minutes, undefined, 'clearing known minutes preserves explicit unknown');
  assert.equal(next.status, source.status);
  const game = make({ category: 'game' }), removed = make({ removedAt: now });
  for (const action of [{ type: 'arrangement', value: 'reading' }, { type: 'plan', reason: 'x' }, { type: 'round', round: { id: 'r', impression: '', review: '' } }, { type: 'entry', entry: entry('e', 1) }] as BookAction[]) {
    assert.equal(applyBookAction(game, action, now), game);
    assert.equal(applyBookAction(removed, action, now), removed);
  }
});

test('snapshot round trip preserves book extensions, collection dangling IDs, empty tags and separate public/personal scores', () => {
  const source = { ...snapshot(make({ personalScore: 0, bookDetails: { translator: '译者', publisher: '出版社', isbn: '合成ISBN', description: '简介', doubanScore: 8.8, readingSources: ['纸书', '汉王'], metadataSource: '手动录入' },
    bookReading: { arrangement: 'abandoned', plan: { reason: '未来也许重读', targetDate: '2027-04', order: 0 }, rounds: [{ id: 'r', impression: '', review: '' }] } })),
    bookCollections: [{ id: 'c', title: '主题书单', description: '合成数据', bookIds: ['book', 'purged-id'], futureCollection: { preserved: true } }],
    bookTagCatalog: ['空标签'], futureRoot: { retained: true } };
  Object.assign(source.items[0].bookDetails!, { futureDetails: { preserved: true } });
  const raw = JSON.stringify(source), parsed: unknown = JSON.parse(raw);
  assert.ok(isValidSnapshot(parsed));
  assert.equal(JSON.stringify(parsed), raw, 'validation never strips unknown fields or migrates on load');
  assert.equal(parsed.items[0].personalScore, 0);
  assert.equal(parsed.items[0].bookDetails?.doubanScore, 8.8);
});

test('strict optional book validation rejects malformed fields, duplicate IDs and invalid calendar dates', () => {
  const invalid: unknown[] = [
    { bookReading: null }, { bookReading: [] }, { bookReading: { arrangement: 'read' } },
    { bookReading: { plan: { reason: 1 } } }, { bookReading: { plan: { reason: '', targetDate: '2023-02-29' } } },
    { bookReading: { plan: { reason: '', order: -1 } } }, { bookReading: { plan: { reason: '', order: 0.5 } } },
    { bookReading: { rounds: [{ id: ' ', impression: '', review: '' }] } },
    { bookReading: { rounds: [{ id: 'a', impression: '', review: '', finishedOn: '0000' }] } },
    { bookReading: { rounds: [{ id: 'a', impression: '', review: '' }, { id: 'a', impression: '', review: '' }] } },
    { bookDetails: { publisher: 1 } }, { bookDetails: { readingSources: [''] } }, { bookDetails: { readingSources: '纸书' } },
    { bookDetails: { doubanScore: null } }, { bookDetails: { doubanScore: -1 } }, { bookDetails: { doubanScore: 10.1 } }, { bookDetails: { doubanScore: 8.88 } },
  ];
  for (const extra of invalid) assert.equal(isValidSnapshot(snapshot({ ...make(), ...extra as object })), false, JSON.stringify(extra));
  for (const extra of [{ bookCollections: null }, { bookCollections: [{ id: 'c', title: '', description: '', bookIds: [] }] },
    { bookCollections: [{ id: 'c', title: 'c', description: '', bookIds: ['a', 'a'] }] },
    { bookCollections: [{ id: 'c', title: 'c', description: '', bookIds: [] }, { id: 'c', title: 'd', description: '', bookIds: [] }] },
    { bookTagCatalog: [' '] }, { bookTagCatalog: ['A', 'a'] }]) assert.equal(isValidSnapshot({ ...snapshot(make()), ...extra }), false, JSON.stringify(extra));
  assert.ok(isValidSnapshot(snapshot(make({ bookReading: {}, bookDetails: { doubanScore: 0 } }))));
  assert.ok(isValidSnapshot({ ...snapshot(make()), bookCollections: [], bookTagCatalog: [] }));
});

test('invalid book actions are zero-write; months remain valid logs while year-only logs are rejected', () => {
  const source = make();
  for (const action of [
    { type: 'arrangement', value: 'read' }, { type: 'plan', reason: '', targetDate: '2024-13' },
    { type: 'round', round: { id: 'r', finishedOn: '2023-02-29', impression: '', review: '' } },
    { type: 'entry', entry: entry('bad', -1) }, { type: 'entry', entry: entry('bad', 1.2) },
    { type: 'entry', entry: entry('bad', Number.NaN) }, { type: 'entry', entry: entry('bad', 1, '2026') },
  ] as BookAction[]) assert.equal(applyBookAction(source, action, now), source);
  const month = applyBookAction(source, { type: 'entry', entry: entry('month', 0, '2026-10') }, now);
  assert.notEqual(month, source);
  assert.ok(isValidSnapshot(snapshot(month)));
});
