import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameBatchEditPlan } from './batchEdit.ts';
import { GAME_PLAY_STATES, gameTagsFor, isValidSnapshot, legacyStatusForGameState } from './library.ts';
import type { MediaItem } from './types.ts';

const make = (id: string, patch: Partial<MediaItem> = {}): MediaItem => ({
  id, title: id, category: 'game', subcategory: 'Steam', creator: '', year: '', status: 'want',
  tags: [], impression: '', favorite: false, artwork: 'default', createdAt: '2026-01-01', updatedAt: '2026-01-01', ...patch,
});
const now = '2026-10-23T12:00:00.000Z';

test('批量添加只影响选中的游戏，大小写和空白去重，保留其他分组及原始引用', () => {
  const one = make('one', { tags: ['动作', '太空'], gameTags: { gameplay: ['动作'], theme: ['太空'], scenario: [], other: [] } });
  const two = make('two'); const book = make('book', { category: 'book' });
  const original = [one, two, book]; const before = JSON.stringify(original);
  const plan = createGameBatchEditPlan(original, ['one', 'one', 'book', 'missing'], { tags: { mode: 'add', groups: { gameplay: [' 动作 ', 'RPG', 'rpg', ''], scenario: ['联机'] } } }, now);
  assert.equal(plan.selectedCount, 1); assert.equal(plan.changedCount, 1); assert.equal(plan.skippedCount, 2);
  assert.deepEqual(plan.items[0].gameTags, { gameplay: ['动作', 'RPG'], theme: ['太空'], scenario: ['联机'], other: [] });
  assert.deepEqual(plan.items[0].tags, ['动作', 'RPG', '太空', '联机']);
  assert.deepEqual(plan.changes[0].tagChanges, [{ group: 'gameplay', added: ['RPG'], removed: [] }, { group: 'scenario', added: ['联机'], removed: [] }]);
  assert.equal(plan.items[1], two); assert.equal(plan.items[2], book); assert.equal(JSON.stringify(original), before);
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: plan.items }), true);
});

test('移除仅针对指定分组中的所选标签，不删除其他分组同名标签或旧未分类标签', () => {
  const original = make('one', { tags: ['RPG', '太空', '旧印象'], gameTags: { gameplay: ['RPG'], theme: ['RPG', '太空'], scenario: [], other: [] } });
  const plan = createGameBatchEditPlan([original], ['one'], { tags: { mode: 'remove', groups: { gameplay: [' rpg ', '不存在'] } } }, now);
  assert.deepEqual(gameTagsFor(plan.items[0]), { gameplay: [], theme: ['RPG', '太空'], scenario: [], other: ['旧印象'] });
  assert.deepEqual(plan.items[0].tags, ['RPG', '太空', '旧印象']);
  assert.deepEqual(plan.changes[0].tagChanges, [{ group: 'gameplay', added: [], removed: ['RPG'] }]);
});

test('无变化提交保留数组、作品、updatedAt，旧记录不被隐式迁移', () => {
  const legacy = make('legacy', { tags: ['保留'], playtimeMinutes: 900 });
  const source = [legacy];
  for (const input of [{}, { gamePlayState: 'want' as const }, { tags: { mode: 'add' as const, groups: { other: [' 保留 '] } } }, { tags: { mode: 'remove' as const, groups: { theme: ['不存在'] } } }]) {
    const plan = createGameBatchEditPlan(source, ['legacy'], input, now);
    assert.equal(plan.changedCount, 0); assert.equal(plan.items, source); assert.equal(plan.items[0], legacy);
    assert.equal(plan.items[0].updatedAt, '2026-01-01'); assert.equal(plan.items[0].gameTags, undefined);
  }
});

test('全部游戏状态保持通用状态一致；同次提交共用时间且不影响时长、身份、未知扩展与体验记录', () => {
  const future = { ...make('one', { playtimeMinutes: 55123, tags: ['旧标签'], impression: '个人感受', favorite: true,
    externalIds: [{ provider: 'steam', id: '123' }], experienceEntries: [{ id: 'entry', date: '2026-10', kind: 'note', note: '不能覆盖' }],
    gameTags: { gameplay: [], theme: [], scenario: [], other: ['旧标签'], futureGroup: ['未知分类'] } as MediaItem['gameTags'],
  }), futureField: { keep: true } };
  for (const gamePlayState of GAME_PLAY_STATES) {
    const plan = createGameBatchEditPlan([future, make('two')], ['one', 'two'], { gamePlayState, tags: { mode: 'add', groups: { gameplay: ['动作'] } } }, now);
    assert.equal(plan.changedCount, 2);
    for (const item of plan.items) { assert.equal(item.gamePlayState ?? 'want', gamePlayState); assert.equal(item.status, legacyStatusForGameState(gamePlayState)); assert.equal(item.updatedAt, now); }
    const updated = plan.items[0] as typeof future;
    assert.equal(updated.futureField, future.futureField); assert.equal(updated.experienceEntries, future.experienceEntries);
    assert.equal(updated.externalIds, future.externalIds); assert.equal(updated.playtimeMinutes, 55123);
    assert.equal(updated.impression, '个人感受'); assert.equal(updated.favorite, true); assert.equal(updated.createdAt, future.createdAt);
    assert.deepEqual((updated.gameTags as unknown as Record<string, unknown>).futureGroup, ['未知分类']);
  }
});

test('已放弃可批量明确设置，后续仅编辑标签时仍保留放弃状态与时长', () => {
  const original = make('one', { status: 'paused', gamePlayState: 'paused', playtimeMinutes: 567, tags: ['旧标签'] });
  const first = createGameBatchEditPlan([original], ['one'], { gamePlayState: 'abandoned' }, now);
  assert.equal(first.changedCount, 1);
  assert.deepEqual(first.changes[0].stateChange, { before: 'paused', after: 'abandoned' });
  assert.equal(first.items[0].gamePlayState, 'abandoned'); assert.equal(first.items[0].status, 'paused');
  const second = createGameBatchEditPlan(first.items, ['one'], { tags: { mode: 'add', groups: { gameplay: ['解谜'] } } }, now);
  assert.equal(second.items[0].gamePlayState, 'abandoned'); assert.equal(second.items[0].status, 'paused');
  assert.equal(second.items[0].playtimeMinutes, 567);
  assert.deepEqual(gameTagsFor(second.items[0]).other, ['旧标签']);
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: second.items }), true);
});

test('旧replaying仅在批量明确选择持续游玩时规范化，普通标签修改保留原值', () => {
  const replaying = make('replay', { gamePlayState: 'replaying', status: 'active', playtimeMinutes: 900, tags: ['旧标签'] });
  const ongoing = make('ongoing', { gamePlayState: 'ongoing', status: 'active', playtimeMinutes: 1200 });
  const source = [replaying, ongoing]; const before = JSON.stringify(source);
  const unchanged = createGameBatchEditPlan(source, ['replay', 'ongoing'], {}, now);
  assert.equal(unchanged.items, source); assert.equal(unchanged.changedCount, 0);
  const tagged = createGameBatchEditPlan(source, ['replay'], { tags: { mode: 'add', groups: { gameplay: ['卡牌'] } } }, now);
  assert.equal(tagged.items[0].gamePlayState, 'replaying'); assert.equal(tagged.items[0].status, 'active');
  assert.equal(tagged.items[0].playtimeMinutes, 900); assert.equal(tagged.items[1], ongoing);
  const selected = createGameBatchEditPlan(source, ['replay', 'ongoing'], { gamePlayState: 'ongoing' }, now);
  assert.equal(selected.changedCount, 1); assert.equal(selected.items[0].gamePlayState, 'ongoing');
  assert.equal(selected.items[0].status, 'active'); assert.equal(selected.items[0].playtimeMinutes, 900);
  assert.equal(selected.items[1], ongoing);
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: tagged.items }), true);
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: selected.items }), true);
  assert.equal(JSON.stringify(source), before);
});

test('只修改状态不重写标签；修复状态不一致；非游戏及不存在 ID 被排除', () => {
  const one = make('one', { gamePlayState: 'cleared', status: 'active', tags: ['旧标签'] });
  const book = make('book', { category: 'book' });
  const plan = createGameBatchEditPlan([one, book], ['one', 'book', 'missing'], { gamePlayState: 'cleared' }, now);
  assert.equal(plan.items[0].status, 'finished'); assert.equal(plan.items[0].tags, one.tags); assert.equal(plan.items[0].gameTags, undefined);
  assert.equal(plan.items[1], book); assert.equal(plan.selectedCount, 1); assert.equal(plan.skippedCount, 2);
  const empty = createGameBatchEditPlan([book], ['book', 'missing'], { gamePlayState: 'cleared' }, now);
  assert.equal(empty.changedCount, 0); assert.equal(empty.selectedCount, 0); assert.equal(empty.skippedCount, 2);
});

test('提交时重新构造预览可保留预览之后增加的记录和字段', () => {
  const source = [make('one')];
  const preview = createGameBatchEditPlan(source, ['one'], { gamePlayState: 'paused' }, now);
  const latest = [{ ...source[0], impression: '稍后写入的感受' }, make('new')];
  const applied = createGameBatchEditPlan(latest, preview.selectedIds, preview.input, preview.timestamp);
  assert.equal(applied.items[0].impression, '稍后写入的感受'); assert.equal(applied.items[1], latest[1]); assert.equal(applied.items[0].status, 'paused');
});
