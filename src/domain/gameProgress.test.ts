import assert from 'node:assert/strict';
import test from 'node:test';
import { completionFor, completionPatch, editCompletionEvent, engagementFor, engagementPatch, gradeEditable, isCompletionDate, isValidCompletionEvent, newGameProjection, priorityEditable, recordCompletion, removeCompletionEvent, undoCompletionRecord } from './gameProgress.ts';
import { isValidSnapshot } from './library.ts';
import type { MediaItem } from './types.ts';

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

test('评级与优先级资格：通关/不适用/历史评级可评；计划/搁置/历史优先级可排', () => {
  assert.equal(gradeEditable(make({ gamePlayState: 'cleared' })), true);
  assert.equal(gradeEditable(make({ playEngagement: 'planned', completion: 'not-applicable' })), true, '不适用可评级');
  assert.equal(gradeEditable(make({ gamePlayState: 'want' })), false, '无历史评级的未通关不开放');
  assert.equal(gradeEditable(make({ gamePlayState: 'playing', personalGrade: 'S' })), true, '历史评级保留编辑');
  assert.equal(priorityEditable(make({ gamePlayState: 'want' })), true);
  assert.equal(priorityEditable(make({ gamePlayState: 'paused' })), true);
  assert.equal(priorityEditable(make({ gamePlayState: 'playing' })), false);
  assert.equal(priorityEditable(make({ gamePlayState: 'playing', playPriority: 'B' })), true, '历史优先级保留编辑');
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
  assert.equal(recordCompletion(unknown, { eventId: 'e2', countChoice: 'increment', markCleared: true }, 'now'), null);
  const startAtOne = recordCompletion(unknown, { eventId: 'e3', countChoice: 'start-at-one', markCleared: true }, 'now');
  assert.ok(startAtOne && startAtOne.patch.completionCount === 1 && startAtOne.patch.completion === 'cleared');
  // keep-unknown 只记事件。
  const keepUnknown = recordCompletion(unknown, { eventId: 'e4', countChoice: 'keep-unknown', markCleared: false }, 'now');
  assert.ok(keepUnknown && keepUnknown.patch.completionCount === undefined && keepUnknown.patch.completion === undefined);
  // 不适用默认保留：markCleared=false 不强改。
  const nA = make({ completion: 'not-applicable' });
  const kept = recordCompletion(nA, { eventId: 'e5', countChoice: 'keep', markCleared: false }, 'now');
  assert.ok(kept && kept.patch.completion === undefined);
  // 非法日期拒绝。
  assert.equal(recordCompletion(item, { eventId: 'e6', occurredAt: '2023-02-30', countChoice: 'keep', markCleared: false }, 'now'), null);
});

test('编辑不计数、删除不隐减、撤销一次有效且字段已变时不覆盖', () => {
  const item = make({ gamePlayState: 'cleared', completionCount: 3, completionEvents: [{ id: 'e1', occurredAt: '2023', recordedAt: 'r' }] });
  const edited = editCompletionEvent(item, 'e1', { occurredAt: '2023-06', note: '改备注' });
  assert.ok(edited && edited.completionCount === undefined && (edited.completionEvents![0] as { occurredAt: string }).occurredAt === '2023-06');
  const removed = removeCompletionEvent(item, 'e1');
  assert.ok(removed && removed.completionEvents!.length === 0 && removed.completionCount === undefined, '删除默认不动累计');
  const corrected = removeCompletionEvent(item, 'e1', 2);
  assert.ok(corrected && corrected.completionCount === 2, '显式修正同笔提交');
  // 撤销：start-at-one → 1 还原为未记录。
  const recorded = { ...item, ...(recordCompletion(item, { eventId: 'e2', countChoice: 'increment', markCleared: true }, 'now')!.patch) };
  assert.equal(recorded.completionCount, 4);
  const undone = undoCompletionRecord(recorded, 'e2', { countAfter: 4, completionAfter: 'cleared' });
  assert.ok(undone && undone.completionCount === 3 && undone.completionEvents!.length === 1, '撤销还原次数与事件');
  // 相关字段被后续修改：拒绝覆盖。
  const changed = { ...recorded, completion: 'not-applicable' };
  assert.equal(undoCompletionRecord(changed, 'e2', { countAfter: 4, completionAfter: 'cleared' }), null);
  const countChanged = { ...recorded, completionCount: 9 };
  assert.equal(undoCompletionRecord(countChanged, 'e2', { countAfter: 4 }), null);
  // 推导保留：completion 未显式写入（推导 cleared）时撤销不写 unknown，推导仍生效。
  const derived = make({ gamePlayState: 'cleared', completionEvents: [{ id: 'e3', recordedAt: 'r' }] });
  const rec2 = recordCompletion(derived, { eventId: 'e4', countChoice: 'keep', markCleared: true }, 'now')!;
  const after2 = { ...derived, ...rec2.patch };
  assert.equal(after2.completion, undefined, '推导已通关时 markCleared 不必写显式值');
  const undone2 = undoCompletionRecord(after2, 'e4', { completionAfter: rec2.preview.completionAfter });
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
    { completionEvents: [{ id: '', recordedAt: 'r' }] },
    { completionEvents: [{ id: 'a', recordedAt: 'r', occurredAt: '2023-13' }] },
    { completionEvents: [{ id: 'a', recordedAt: 'r' }, { id: 'a', recordedAt: 'r' }] },
  ]) assert.equal(isValidSnapshot({ schemaVersion: 1, items: [make(bad as Partial<MediaItem>)] }), false, JSON.stringify(bad));
  const good = make({ playEngagement: 'playing', completion: 'cleared', completionCount: 2, completionEvents: [{ id: 'a', occurredAt: '2023', recordedAt: 'r', note: 'n' }] });
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [good] }), true);
  assert.equal(isValidCompletionEvent({ id: 'x', recordedAt: 'r' }), true);
});
