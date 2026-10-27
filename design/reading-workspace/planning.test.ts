import test from 'node:test';
import assert from 'node:assert/strict';
import { planningSlots, placeCandidate, partitionCandidates, effectivePlacement, windowsOf } from './planning.ts';
import { calendarPeriod } from './periods.ts';
import { createSeed } from './seed.ts';
import { reducer } from './model.ts';

test('月度阶段覆盖整月；自然周按真实月历生成，跨年周保留边界', () => {
  const stages = planningSlots('2024-02-15', 'month', 'stages');
  assert.deepEqual(stages.map(s => [s.start, s.end]), [['2024-02-01', '2024-02-10'], ['2024-02-11', '2024-02-20'], ['2024-02-21', '2024-02-29']]);
  const weeks = planningSlots('2026-11-15', 'month', 'weeks');
  assert.equal(weeks.length, 6); assert.equal(weeks[0].start, '2026-10-26'); assert.equal(weeks[5].end, '2026-12-06');
  assert.equal(planningSlots('2027-01-01', 'week', 'weeks')[0].start, '2026-12-28');
});
test('四季覆盖本年每一天且互不交叉，冬季不冒充全年范围', () => {
  const slots = planningSlots('2024-01-10', 'year', 'seasons');
  for (let day = new Date('2024-01-01T00:00:00Z'); day <= new Date('2024-12-31T00:00:00Z'); day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    assert.equal(slots.filter(s => windowsOf(s).some(w => date >= w.start && date <= w.end)).length, 1);
  }
  const winter = placeCandidate(createSeed().plans[2], slots[3]);
  assert.equal(partitionCandidates([winter], calendarPeriod('2024-10-15', 'month'), planningSlots('2024-10-15', 'month', 'stages')).context.length, 0);
});
test('按同一作品细化阶段到周，不复制计划或生成实际记录', () => {
  const state = createSeed(), plan = state.plans[2];
  const autumn = planningSlots('2026-10-27', 'year', 'seasons')[2];
  const broad = placeCandidate(plan, autumn);
  const week = planningSlots('2026-10-27', 'week', 'weeks')[0];
  const refined = placeCandidate(broad, week);
  const updated = reducer(state, { type: 'plan', plan: refined });
  assert.equal(updated.plans.length, state.plans.length);
  assert.equal(updated.plans.filter(p => p.workId === plan.workId).length, 1);
  assert.deepEqual(updated.activities, state.activities); assert.deepEqual(updated.rounds, state.rounds);
  assert.equal(refined.placements?.length, 2); assert.equal(effectivePlacement(refined)?.id, week.id);
  const split = partitionCandidates([refined], calendarPeriod('2026-10-27', 'year'), planningSlots('2026-10-27', 'year', 'seasons'));
  assert.equal(split.buckets.get(autumn.id)?.length, 1);
});
test('宽泛候选只在来源区展示，不自动摊派到每一周或月初', () => {
  const plan = placeCandidate(createSeed().plans[2], planningSlots('2026-10-27', 'year', 'seasons')[2]);
  const split = partitionCandidates([plan], calendarPeriod('2026-10-27', 'month'), planningSlots('2026-10-27', 'month', 'stages'));
  assert.equal(split.context.length, 1); assert.equal([...split.buckets.values()].flat().length, 0);
  const months = partitionCandidates([plan], calendarPeriod('2026-10-27', 'year'), planningSlots('2026-10-27', 'year', 'months'));
  assert.equal(months.context.length, 1); assert.equal([...months.buckets.values()].flat().length, 0);
  const month = placeCandidate(plan, planningSlots('2026-10-27', 'year', 'months')[9]);
  const stages = partitionCandidates([month], calendarPeriod('2026-10-27', 'month'), planningSlots('2026-10-27', 'month', 'stages'));
  assert.equal(stages.context.length, 1); assert.equal([...stages.buckets.values()].flat().length, 0);
  const stage = placeCandidate(plan, planningSlots('2026-10-27', 'month', 'stages')[2]);
  const weeks = partitionCandidates([stage], calendarPeriod('2026-10-27', 'month'), planningSlots('2026-10-27', 'month', 'weeks'));
  assert.equal(weeks.context.length, 1); assert.equal([...weeks.buckets.values()].flat().length, 0);
});
test('往期候选不会自动顺延；未定时间与当前期分开；换阶段不改体验', () => {
  const state = createSeed(), slots = planningSlots('2026-11-03', 'week', 'weeks');
  const split = partitionCandidates(state.plans, calendarPeriod('2026-11-03', 'week'), slots);
  assert.equal([...split.buckets.values()].flat().length, 0);
  assert.ok(split.loose.some(p => p.id === 'p4'));
  const reassigned = placeCandidate(placeCandidate(state.plans[2], slots[0]), planningSlots('2026-12-15', 'month', 'stages')[1]);
  assert.equal(effectivePlacement(reassigned)?.id, 'stage:2026-12:middle');
});
test('旧阅读计划编辑保留阶段来源；明确清空范围支持回到未定时间', () => {
  const state = createSeed(), plan = placeCandidate(state.plans[2], planningSlots('2026-10-27', 'week', 'weeks')[0]);
  const updated = reducer(reducer(state, { type: 'plan', plan }), { type: 'plan', plan: { ...state.plans[2], date: undefined, reason: '调整理由' } });
  assert.deepEqual(updated.plans.find(p => p.id === plan.id)?.placements, plan.placements);
  const cleared = reducer(updated, { type: 'plan', plan: { ...plan, placements: [] } });
  assert.equal(effectivePlacement(cleared.plans.find(p => p.id === plan.id)!), undefined);
});
