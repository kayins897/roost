import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarPeriod, categoryStats, inPeriod, shiftPeriod } from './periods.ts';
import { createSeed } from './seed.ts';

test('week is Monday to Sunday, including year boundary', () => {
  assert.deepEqual(calendarPeriod('2026-10-27', 'week'), { start: '2026-10-26', end: '2026-11-01', label: '2026.10.26 — 2026.11.01' });
  assert.equal(calendarPeriod('2027-01-01', 'week').start, '2026-12-28');
  assert.equal(calendarPeriod('2027-01-01', 'week').end, '2027-01-03');
});
test('month and year retain leap-day coverage', () => {
  assert.equal(calendarPeriod('2028-02-15', 'month').end, '2028-02-29');
  assert.equal(calendarPeriod('2027-02-15', 'month').end, '2027-02-28');
  assert.equal(calendarPeriod('2028-02-29', 'year').end, '2028-12-31');
});
test('period navigation clamps month/year dates without skipping a period', () => {
  assert.equal(shiftPeriod('2026-01-31', 'month', 1), '2026-02-28');
  assert.equal(shiftPeriod('2028-02-29', 'year', 1), '2029-02-28');
  assert.equal(shiftPeriod('2026-10-27', 'week', -1), '2026-10-20');
});
test('coarse dates contribute only at a truthful scale; unknown dates stay unplaced', () => {
  const week = calendarPeriod('2026-10-27', 'week'), month = calendarPeriod('2026-10-27', 'month'), year = calendarPeriod('2026-10-27', 'year');
  assert.equal(inPeriod('2026-10', week, 'week'), false);
  assert.equal(inPeriod('2026-10', month, 'month'), true);
  assert.equal(inPeriod('2026', month, 'month'), false);
  assert.equal(inPeriod('2026', year, 'year'), true);
  assert.equal(inPeriod(undefined, year, 'year'), false);
  assert.equal(inPeriod('2026-11-01', week, 'week'), true);
  assert.equal(inPeriod('2026-11-02', week, 'week'), false);
});
test('weekly summaries count known minutes only, preserve unknown and zero, isolate media', () => {
  const state = createSeed(), week = calendarPeriod('2026-10-20', 'week');
  const activities = state.activities.filter(a => inPeriod(a.date, week, 'week'));
  assert.deepEqual(categoryStats(activities, state.works, 'book'), { works: 1, records: 1, minutes: 0, unknown: 0 });
  assert.deepEqual(categoryStats(activities, state.works, 'game'), { works: 1, records: 1, minutes: undefined, unknown: 1 });
  assert.deepEqual(categoryStats(activities, state.works, 'screen'), { works: 1, records: 1, minutes: 102, unknown: 0 });
  assert.deepEqual(categoryStats(activities, state.works, 'music'), { works: 0, records: 0, minutes: undefined, unknown: 0 });
});
test('same-book multiple sessions add minutes, while plans and completions add none', () => {
  const state = createSeed(), week = calendarPeriod('2026-10-27', 'week');
  const actual = state.activities.filter(a => inPeriod(a.date, week, 'week'));
  assert.equal(categoryStats(actual, state.works, 'book').minutes, 70);
  actual.push({ id: 'derived-round', workId: 'b1', kind: 'reading', date: '2026-10-27', note: '读完' });
  const stats = categoryStats(actual, state.works, 'book');
  assert.equal(stats.minutes, 70); assert.equal(stats.unknown, 1); assert.equal(stats.works, 2);
});
