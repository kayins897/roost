import assert from 'node:assert/strict';
import test from 'node:test';
import { completionFor, completionPatch, editCompletionEvent, engagementFor, engagementPatch, gradeEditable, isCompletionDate, isValidCompletionEvent, newGameProjection, priorityEditable, recordCompletion, removeCompletionEvent, undoCompletionRecord } from './gameProgress.ts';
import { isValidSnapshot } from './library.ts';
import type { MediaItem } from './types.ts';

const now = '2026-10-25T00:00:00.000Z';

const make = (extra: Partial<MediaItem> = {}): MediaItem => ({
  id: 'a', title: '游戏', category: 'game', subcategory: 'Steam', creator: '', year: '', status: 'want',
  tags: [], impression: '', favorite: false, artwork: 'default', createdAt: '', updatedAt: '', ...extra,
});

test('旧七种存储值与 status-only 的双维度只读推导', () => {
  assert.equal(engagementFor(make({ gamePlayState: 'want' })), 'planned');
  assert.equal(engagementFor(make({ gamePlayState: 'playing' })), 'playing');
  assert.equal(engagementFor(make({ gamePlayState: 'ongoing' })), 'playing');
  assert.equal(engagementFor(make({ gamePlayState: 'replaying' })), 'playing', '旧别名归一为游玩中');
  assert.equal(engagementFor(make({ gamePlayState: 'paused' })), 'paused');
  assert.equal(engagementFor(make({ gamePlayState: 'abandoned' })), 'abandoned');
  assert.equal(engagementFor(make({ gamePlayState: 'cleared' })), 'unrecorded', '旧已通关不推断当前关系');
  assert.equal(engagementFor(make({ status: 'finished' })), 'unrecorded', 'status-only 不推断关系');
  assert.equal(engagementFor(make({ status: 'want' })), 'planned');
  for (const state of ['want', 'playing', 'ongoing', 'replaying', 'paused', 'abandoned'] as const) {
    assert.equal(completionFor(make({ gamePlayState: state })), 'unknown', state + ' 不推断曾通关');
  }
  assert.equal(completionFor(make({ gamePlayState: 'cleared' })), 'cleared');
  assert.equal(completionFor(make({ status: 'finished' })), 'cleared', '无 gamePlayState 时 status=finished 推导已通关');
  assert.equal(completionFor(make({ gamePlayState: 'playing', status: 'finished' })), 'unknown', '明确旧轴优先于 status');
});

test('新字段优先与显式未确定覆盖推导；改一维不动另一维', () => {
  const legacyCleared = make({ gamePlayState: 'cleared', personalGrade: 'S' });
  // 改当前关系为游玩中：通关进度仍为已通关（旧轴冻结推导保留），不写旧轴。
  const playing = { ...legacyCleared, ...engagementPatch('playing') };
  assert.equal(engagementFor(playing), 'playing');
  assert.equal(completionFor(playing), 'cleared', '改关系不清通关事实');
  assert.equal(playing.gamePlayState, 'cleared', '旧轴冻结不反投影');
  assert.equal(playing.personalGrade, 'S');
  // 显式未确定覆盖旧已通关推导。
  const unsure = { ...legacyCleared, ...completionPatch('unknown') };
  assert.equal(completionFor(unsure), 'unknown');
  // 明确未通关与不适用。
  assert.equal(completionFor({ ...legacyCleared, ...completionPatch('not-cleared') }), 'not-cleared');
  assert.equal(completionFor({ ...legacyCleared, ...completionPatch('not-applicable') }), 'not-applicable');
});

test('评级与优先级资格：通关/不适用/历史评级可评；仅计划/搁置可排', () => {
  assert.equal(gradeEditable(make({ gamePlayState: 'cleared' })), true);
  assert.equal(gradeEditable(make({ playEngagement: 'planned', completion: 'not-applicable' })), true, '不适用可评级');
  assert.equal(gradeEditable(make({ gamePlayState: 'want' })), false, '无历史评级的未通关不开放');
  assert.equal(gradeEditable(make({ gamePlayState: 'playing', personalGrade: 'S' })), true, '历史评级保留编辑');
  assert.equal(priorityEditable(make({ gamePlayState: 'want' })), true);
  assert.equal(priorityEditable(make({ gamePlayState: 'paused' })), true);
  assert.equal(priorityEditable(make({ gamePlayState: 'playing' })), false);
  const playing = make({ gamePlayState: 'playing', playPriority: 'B' });
  assert.equal(priorityEditable(playing), false, '历史优先级保留值，但非计划关系不开放规划入口');
  assert.equal(playing.playPriority, 'B');
});

test('完成日期精度与日历合法（年/月/日/闰年），不补精度', () => {
  assert.equal(isCompletionDate('2023'), true);
  assert.equal(isCompletionDate('2023-05'), true);
  assert.equal(isCompletionDate('2024-02-29'), true);
  assert.equal(isCompletionDate('2023-02-29'), false);
  assert.equal(isCompletionDate('2023-13'), false);
  assert.equal(isCompletionDate('2023-00-10'), false);
  assert.equal(isCompletionDate('2023-5-1'), false);
  assert.equal(isCompletionDate(''), false);
  assert.equal(isCompletionDate('0000'), false);
  assert.equal(isCompletionDate('0001'), true);
});

test('记录一次完成：原子补丁、次数选择、进度标记与幂等', () => {
  const item = make({ gamePlayState: 'cleared', completionCount: 3 });
  const first = recordCompletion(item, { eventId: 'e1', occurredAt: '2023', note: '二周目', countChoice: 'increment', markCleared: false }, '2026-10-25T00:00:00Z');
  assert.ok(first);
  assert.equal(first.patch.completionCount, 4);
  assert.equal(first.patch.completion, undefined, '进度未变不写');
  assert.equal(first.patch.completionEvents!.length, 1);
  assert.equal(first.patch.completionEvents![0].occurredAt, '2023');
  // 双击/重试同 ID 幂等。
  assert.equal(recordCompletion({ ...item, ...first.patch }, { eventId: 'e1', countChoice: 'keep', markCleared: false }, '2026-10-25T00:00:00Z'), null);
  // 未知累计不得隐式 +1。
  const unknown = make({ gamePlayState: 'want' });
  assert.equal(recordCompletion(unknown, { eventId: 'e2', countChoice: 'increment', markCleared: true }, now), null);
  const startAtOne = recordCompletion(unknown, { eventId: 'e3', countChoice: 'start-at-one', markCleared: true }, now);
  assert.ok(startAtOne && startAtOne.patch.completionCount === 1 && startAtOne.patch.completion === 'cleared');
  // keep-unknown 只记事件。
  const keepUnknown = recordCompletion(unknown, { eventId: 'e4', countChoice: 'keep-unknown', markCleared: false }, now);
  assert.ok(keepUnknown && keepUnknown.patch.completionCount === undefined && keepUnknown.patch.completion === undefined);
  // 不适用默认保留：markCleared=false 不强改。
  const nA = make({ completion: 'not-applicable' });
  const kept = recordCompletion(nA, { eventId: 'e5', countChoice: 'keep', markCleared: false }, now);
  assert.ok(kept && kept.patch.completion === undefined);
  // 非法日期拒绝。
  assert.equal(recordCompletion(item, { eventId: 'e6', occurredAt: '2023-02-30', countChoice: 'keep', markCleared: false }, now), null);
});

test('编辑不计数、删除不隐减、撤销一次有效且字段已变时不覆盖', () => {
  const item = make({ gamePlayState: 'cleared', completionCount: 3, completionEvents: [{ id: 'e1', occurredAt: '2023', recordedAt: now }] });
  const edited = editCompletionEvent(item, 'e1', { occurredAt: '2023-06', note: '改备注' });
  assert.ok(edited && edited.completionCount === undefined && (edited.completionEvents![0] as { occurredAt: string }).occurredAt === '2023-06');
  const removed = removeCompletionEvent(item, 'e1');
  assert.ok(removed && removed.completionEvents!.length === 0 && removed.completionCount === undefined, '删除默认不动累计');
  const corrected = removeCompletionEvent(item, 'e1', 2);
  assert.ok(corrected && corrected.completionCount === 2, '显式修正同笔提交');
  // 撤销：start-at-one → 1 还原为未记录。
  const operation = recordCompletion(item, { eventId: 'e2', countChoice: 'increment', markCleared: true }, now)!;
  const recorded = { ...item, ...operation.patch };
  assert.equal(recorded.completionCount, 4);
  const undone = undoCompletionRecord(recorded, operation.undo);
  assert.ok(undone && undone.completionCount === 3 && undone.completionEvents!.length === 1, '撤销还原次数与事件');
  // 相关字段被后续修改：拒绝覆盖。
  const changed = { ...recorded, completion: 'not-applicable' as const };
  const changedUndo = undoCompletionRecord(changed, operation.undo);
  assert.ok(changedUndo && !Object.hasOwn(changedUndo, 'completion'), '本次未拥有进度字段，撤销保留后来的进度决定');
  const countChanged = { ...recorded, completionCount: 9 };
  assert.equal(undoCompletionRecord(countChanged, operation.undo), null);
  // 推导保留：completion 未显式写入（推导 cleared）时撤销不写 unknown，推导仍生效。
  const derived = make({ gamePlayState: 'cleared', completionEvents: [{ id: 'e3', recordedAt: now }] });
  const rec2 = recordCompletion(derived, { eventId: 'e4', countChoice: 'keep', markCleared: true }, now)!;
  const after2 = { ...derived, ...rec2.patch };
  assert.equal(after2.completion, undefined, '推导已通关时 markCleared 不必写显式值');
  const undone2 = undoCompletionRecord(after2, rec2.undo);
  assert.ok(undone2 && undone2.completion === undefined, '撤销不破坏推导');
});

test('新建投影构造旧校验可接受的初值', () => {
  const projection = newGameProjection('playing', 'cleared');
  const item = make(projection);
  assert.equal(item.gamePlayState, 'playing');
  assert.equal(item.status, 'active');
  assert.equal(item.playEngagement, 'playing');
  assert.equal(item.completion, 'cleared');
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [item] }), true);
  const inactive = make(newGameProjection('inactive', 'unknown'));
  assert.equal(inactive.gamePlayState, 'paused', 'inactive 投影 paused');
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [inactive] }), true);
});

test('快照校验拒绝非法新字段；未知扩展仍可往返', () => {
  for (const bad of [
    { playEngagement: 'sometimes' },
    { completion: 'maybe' },
    { completionCount: -1 },
    { completionCount: 1.5 },
    { completionEvents: [{ id: '', recordedAt: now }] },
    { completionEvents: [{ id: 'a', recordedAt: now, occurredAt: '2023-13' }] },
    { completionEvents: [{ id: 'a', recordedAt: now }, { id: 'a', recordedAt: now }] },
    { completionEvents: [{ id: 'a', recordedAt: 'invalid' }] },
    { completionEvents: [{ id: 'a', recordedAt: '2023-02-30T00:00:00Z' }] },
  ]) assert.equal(isValidSnapshot({ schemaVersion: 1, items: [make(bad as Partial<MediaItem>)] }), false, JSON.stringify(bad));
  const good = make({ playEngagement: 'playing', completion: 'cleared', completionCount: 2, completionEvents: [{ id: 'a', occurredAt: '2023', recordedAt: now, note: 'n' }] });
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [good] }), true);
  assert.equal(isValidCompletionEvent({ id: 'x', recordedAt: now }), true);
});

test('精确累计值和零值可保存，拒绝溢出、分数和非法录入时间', () => {
  const item = make();
  for (const countValue of [0, 1, 5, Number.MAX_SAFE_INTEGER]) {
    const result = recordCompletion(item, { eventId: 'set', countChoice: 'set', countValue, markCleared: false }, now);
    assert.ok(result);
    assert.equal(result.patch.completionCount, countValue);
    assert.equal(result.preview.countAfter, countValue);
  }
  for (const countValue of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, undefined]) {
    assert.equal(recordCompletion(item, { eventId: 'bad', countChoice: 'set', countValue, markCleared: false }, now), null);
    if (countValue !== undefined) assert.equal(removeCompletionEvent(make({ completionEvents: [{ id: 'a', recordedAt: now }] }), 'a', countValue), null);
  }
  assert.equal(recordCompletion(make({ completionCount: Number.MAX_SAFE_INTEGER }), { eventId: 'overflow', countChoice: 'increment', markCleared: false }, now), null);
  assert.equal(recordCompletion(item, { eventId: 'date', countChoice: 'keep', markCleared: false }, 'bad'), null);
});

test('清空事件日期和备注是真正删除字段，保留未知扩展且不影响累计', () => {
  const original = { id: 'e', recordedAt: now, occurredAt: '2023', note: '二周目', future: { keep: true } };
  const item = make({ completionCount: 5, completionEvents: [original] });
  const patch = editCompletionEvent(item, 'e', { occurredAt: '', note: '  ' })!;
  assert.deepEqual(patch.completionEvents, [{ id: 'e', recordedAt: now, future: { keep: true } }]);
  assert.equal(Object.hasOwn(patch, 'completionCount'), false);
  assert.deepEqual(item.completionEvents, [original], '不修改调用前快照');
});

test('精确撤销还原零/未知/任意设值与原进度，仅守卫本次所属字段和事件', () => {
  for (const completionCount of [undefined, 0, 3]) {
    for (const completion of [undefined, 'unknown', 'not-cleared', 'not-applicable'] as const) {
      const before = make({ completionCount, completion, review: 'original' });
      const result = recordCompletion(before, { eventId: 'e', countChoice: completionCount === undefined ? 'set' : 'increment', countValue: 7, markCleared: true }, now)!;
      const after = { ...before, ...result.patch, review: 'later review', playtimeMinutes: 99 };
      const patch = undoCompletionRecord(after, result.undo)!;
      assert.ok(patch);
      const undone = { ...after, ...patch };
      assert.equal(undone.completionCount, completionCount);
      assert.equal(undone.completion, completion);
      assert.equal(undone.review, 'later review');
      assert.equal(undone.playtimeMinutes, 99);
      assert.equal(undoCompletionRecord(undone, result.undo), null, '同一撤销不能再减');
      assert.equal(undoCompletionRecord({ ...after, id: 'other' }, result.undo), null, '不能撤销到另一作品');
      assert.equal(undoCompletionRecord({ ...after, completionCount: 9 }, result.undo), null);
      assert.equal(undoCompletionRecord({ ...after, completion: 'unknown' }, result.undo), null);
      const edited = { ...after, ...editCompletionEvent(after, 'e', { note: '后来修改' }) };
      assert.equal(undoCompletionRecord(edited, result.undo), null, '不能删除后来修改过的事件');
    }
  }
  const before = make({ completionCount: 4, completion: 'cleared' });
  const result = recordCompletion(before, { eventId: 'keep', countChoice: 'keep', markCleared: true }, now)!;
  const after = { ...before, ...result.patch, completionCount: 8, completion: 'not-applicable' as const };
  const undo = undoCompletionRecord(after, result.undo)!;
  assert.ok(undo);
  assert.equal(Object.hasOwn(undo, 'completionCount'), false);
  assert.equal(Object.hasOwn(undo, 'completion'), false);
});
