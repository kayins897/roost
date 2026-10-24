import assert from 'node:assert/strict';
import test from 'node:test';
import { createBulkGradePatch, createGameBatchEditPlan } from './batchEdit.ts';
import { isValidSnapshot } from './library.ts';
import type { MediaItem } from './types.ts';
const item = (extra: Partial<MediaItem> = {}): MediaItem => ({ id: 'a', title: '游戏', category: 'game', subcategory: 'Steam', creator: '', year: '', status: 'want', gamePlayState: 'want', tags: [], impression: '自己的印象', review: '自己的测评', playPriority: 'S', personalGrade: 'A', priorityOrder: 3, ratingOrder: 2, favorite: false, artwork: 'default', createdAt: '', updatedAt: '', ...extra });
test('优先级和两个手动序号为可选合法值，启动不补写', () => {
  for (const grade of ['SSS','SS','S','A','B','C'] as const) assert.ok(isValidSnapshot({ schemaVersion: 1, items: [item({ playPriority: grade })] }));
  for (const value of ['D', 1, null]) assert.equal(isValidSnapshot({ schemaVersion: 1, items: [{ ...item(), playPriority: value }] }), false);
  for (const key of ['priorityOrder','ratingOrder']) for (const value of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, null, '2']) assert.equal(isValidSnapshot({ schemaVersion: 1, items: [{ ...item(), [key]: value }] }), false);
});
test('批量待体验顺带优先级，只重置本模式序号，保留通关评级和全文', () => {
  const before = item(); const raw = JSON.stringify(before);
  const after = createGameBatchEditPlan([before], ['a'], { gamePlayState: 'want', playPriority: 'SSS' }).items[0];
  assert.equal(after.playPriority, 'SSS'); assert.equal(after.priorityOrder, undefined); assert.equal(after.ratingOrder, 2); assert.equal(after.personalGrade, 'A'); assert.equal(after.review, before.review); assert.equal(after.impression, before.impression); assert.equal(JSON.stringify(before), raw);
  assert.equal(createGameBatchEditPlan([after], ['a'], { gamePlayState: 'want', playPriority: 'SSS' }).changedCount, 0);
});
test('批量通关可顺带评分或显式清除，默认不覆盖原评级或优先级', () => {
  const before = item();
  const after = createGameBatchEditPlan([before], ['a'], { gamePlayState: 'cleared', personalGrade: 'SS' }).items[0];
  assert.equal(after.personalGrade, 'SS'); assert.equal(after.ratingOrder, undefined); assert.equal(after.playPriority, 'S'); assert.equal(after.priorityOrder, 3);
  const cleared = createGameBatchEditPlan([after], ['a'], { gamePlayState: 'cleared', personalGrade: null }).items[0]; assert.equal(cleared.personalGrade, undefined);
  const preserved = createGameBatchEditPlan([before], ['a'], { gamePlayState: 'cleared' }).items[0]; assert.equal(preserved.personalGrade, before.personalGrade); assert.equal(preserved.ratingOrder, before.ratingOrder);
  assert.throws(() => createGameBatchEditPlan([before], ['a'], { gamePlayState: 'paused', playPriority: 'S' }), /不匹配/);
});

test('纯等级补丁只对状态匹配的所选游戏生效，不重写状态或旧别名', () => {
  const want = item({ id: 'w', playPriority: 'A', priorityOrder: 7, personalGrade: 'S', ratingOrder: 9 });
  const paused = item({ id: 'p', gamePlayState: 'paused', status: 'paused', playPriority: 'A', priorityOrder: 7 });
  const legacy = item({ id: 'l', gamePlayState: 'replaying', status: 'active', playPriority: 'B' });
  const patch = createBulkGradePatch([want, paused, legacy], ['w', 'p', 'l'], 'priority', 'SSS', '2026-10-25T00:00:00Z');
  assert.equal(patch.changedCount, 1, '仅 want 作品变化');
  assert.equal(patch.items[0].playPriority, 'SSS'); assert.equal(patch.items[0].priorityOrder, undefined);
  assert.equal(patch.items[0].personalGrade, 'S'); assert.equal(patch.items[0].ratingOrder, 9);
  assert.equal(patch.items[0].gamePlayState, 'want'); assert.equal(patch.items[0].status, 'want');
  assert.equal(patch.items[1], paused, '非匹配状态引用不变');
  assert.equal(patch.items[2], legacy, '旧别名 replaying 不被规范化');
});
test('纯等级补丁同值零变化、清除、另一维度与非选中作品保留', () => {
  const a = item({ id: 'a', playPriority: 'S', priorityOrder: 2, personalGrade: 'A', ratingOrder: 4 });
  const b = item({ id: 'b', playPriority: 'S' });
  assert.equal(createBulkGradePatch([a, b], ['a'], 'priority', 'S').changedCount, 0);
  const cleared = createBulkGradePatch([a, b], ['a'], 'priority', undefined);
  assert.equal(cleared.changedCount, 1); assert.equal(cleared.items[0].playPriority, undefined);
  assert.equal(cleared.items[0].personalGrade, 'A', '另一维度保留');
  assert.equal(cleared.items[1], b, '未选中作品引用不变');
});
