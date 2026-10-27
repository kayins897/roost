import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyMinutes, heatLevel, reducer, validDay } from './model.ts';
import { createSeed } from './seed.ts';

test('同书同日多次与不同书独立分钟累加，影视时长不混入', () => {
  const state = createSeed();
  state.activities.push({ id: 'extra', workId: 'b3', date: '2026-10-27', kind: 'reading', minutes: 10, note: '' }, { id: 'film', workId: 's1', date: '2026-10-27', kind: 'watched', minutes: 100, note: '' });
  assert.equal(dailyMinutes(state, '2026-10-27'), 60);
});
test('修改同一记录不重复，改日与删除同步影响汇总', () => {
  const state = createSeed(), initial = state.activities.find(a => a.id === 'a1')!;
  const updated = reducer(state, { type: 'activity', activity: { ...initial, date: '2026-10-26', minutes: 25 } });
  assert.equal(updated.activities.length, state.activities.length);
  assert.equal(dailyMinutes(updated, '2026-10-27'), 15);
  assert.equal(dailyMinutes(updated, '2026-10-26'), 45);
  assert.equal(dailyMinutes(reducer(updated, { type: 'remove-activity', id: initial.id }), '2026-10-26'), 20);
  assert.equal(dailyMinutes(state, '2026-10-27'), 50);
});
test('未知和明确零不混为一谈，年月不分摊到第一日', () => {
  const state = createSeed();
  state.activities = [{ id: 'u', workId: 'b1', date: '2026-10-01', kind: 'reading', note: '' }, { id: 'z', workId: 'b1', date: '2026-10-02', kind: 'reading', minutes: 0, note: '' }, { id: 'm', workId: 'b1', date: '2026-10', kind: 'reading', minutes: 900, note: '' }];
  assert.equal(dailyMinutes(state, '2026-10-01'), undefined);
  assert.equal(dailyMinutes(state, '2026-10-02'), 0);
  assert.equal(dailyMinutes(state, '2026-10-03'), undefined);
});
test('未来计划不会染亮热力表，同一书目加入计划不重复', () => {
  const state = createSeed(), plan = state.plans.find(p => p.id === 'p3')!;
  const updated = reducer(state, { type: 'plan', plan: { ...plan, id: 'another', reason: '改计划' } });
  assert.equal(updated.plans.length, state.plans.length);
  assert.equal(updated.plans.find(p => p.workId === 'b2')!.reason, '改计划');
  assert.equal(dailyMinutes(updated, '2026-10-30'), undefined);
  assert.deepEqual(updated.rounds, state.rounds);
});
test('新增重读记录保留历史，明确完成计划才移除计划', () => {
  const state = createSeed(), round = { id: 'r-new', workId: 'b2', finishedOn: undefined, impression: '第二次', review: '新的感想' };
  const updated = reducer(state, { type: 'round', round, finishPlan: true });
  assert.equal(updated.rounds.filter(r => r.workId === 'b2').length, 2);
  assert.equal(updated.rounds.find(r => r.id === 'r1')!.impression, state.rounds.find(r => r.id === 'r1')!.impression);
  assert.equal(updated.plans.some(p => p.workId === 'b2'), false);
  const edited = reducer(state, { type: 'round', round: { ...state.rounds[0], review: '修订' } });
  assert.deepEqual(edited.plans, state.plans);
});
test('书籍手动顺序不受影视/游戏计划干扰，在读组独立', () => {
  const state = createSeed(), other = state.plans.filter(p => ['p5', 'p6'].includes(p.id));
  const updated = reducer(state, { type: 'move', id: 'p3', direction: 1 });
  assert.deepEqual(updated.plans.filter(p => ['p5', 'p6'].includes(p.id)), other);
  assert.ok(updated.plans.find(p => p.id === 'p4')!.order < updated.plans.find(p => p.id === 'p3')!.order);
  assert.deepEqual(updated.plans.filter(p => p.state === 'reading'), state.plans.filter(p => p.state === 'reading'));
});
test('开始与取消计划保留阅读史与分钟，删除活动不删书', () => {
  const state = createSeed(), updated = reducer(reducer(state, { type: 'start', id: 'p3' }), { type: 'unplan', id: 'p3' });
  assert.deepEqual(updated.rounds, state.rounds);
  assert.deepEqual(updated.activities, state.activities);
  const removed = reducer(state, { type: 'remove-activity', id: 'a1' });
  assert.deepEqual(removed.works, state.works);
});
test('日历日期严格验证闰日和月份边界', () => {
  for (const date of ['2024-02-29', '2026-10-27', '2000-02-29']) assert.equal(validDay(date), true);
  for (const date of ['2026-02-29', '1900-02-29', '2026-13-01', '2026-02-30', '2026-10', '2026-1-1']) assert.equal(validDay(date), false);
});
test('热力表档位边界与未知无正热度', () => {
  assert.deepEqual([undefined, 0, 1, 14, 15, 29, 30, 59, 60].map(heatLevel), [0, 0, 1, 1, 2, 2, 3, 3, 4]);
});
