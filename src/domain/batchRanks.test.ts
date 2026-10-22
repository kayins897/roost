import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameBatchEditPlan } from './batchEdit.ts';
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
