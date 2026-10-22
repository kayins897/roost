import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameBatchEditPlan } from './batchEdit.ts';
import { applyMetadataCandidate } from './catalog.ts';
import { coverFinishFor, GAME_GRADE_TIERS, GAME_GRADES, isValidPersonalGrade } from './gameRating.ts';
import { GAME_PLAY_STATES, isValidSnapshot } from './library.ts';
import { restoreItems, setItemsHidden, trashItems } from './lifecycle.ts';
import { applySteamSync, planSteamSync } from './steamSync.ts';
import type { LibrarySnapshot, MediaItem } from './types.ts';

const item = (extra: Partial<MediaItem> = {}): MediaItem => ({
  id: 'original', title: '自己的游戏', category: 'game', subcategory: 'Steam', creator: '', year: '',
  status: 'finished', gamePlayState: 'cleared', playtimeMinutes: 120, tags: ['自己的标签'],
  impression: '自己的测评', favorite: false, artwork: 'default', createdAt: '2020-01-01', updatedAt: '2020-01-02',
  externalIds: [{ provider: 'steam', id: '123' }], ...extra,
});
const snapshot = (work = item()): LibrarySnapshot => ({ schemaVersion: 1, items: [work] });

test('个人评级只接受六个精确枚举，未评级不等于最低评级', () => {
  assert.deepEqual(GAME_GRADES, ['SSS', 'SS', 'S', 'A', 'B', 'C']);
  for (const personalGrade of GAME_GRADES) {
    assert.equal(isValidPersonalGrade(personalGrade), true);
    assert.equal(isValidSnapshot(snapshot(item({ personalGrade }))), true);
  }
  for (const value of ['SSSS', 'D', 's', 'ss', 'sss', ' S ', '', 0, 10, NaN, Infinity, null, true, {}, []]) {
    assert.equal(isValidPersonalGrade(value), false, String(value));
    assert.equal(isValidSnapshot(snapshot({ ...item(), personalGrade: value } as MediaItem)), false);
  }
  assert.equal(isValidPersonalGrade(undefined), false);
  assert.equal(isValidSnapshot(snapshot(item())), true);
  assert.equal(Object.hasOwn(item(), 'personalGrade'), false);
});

test('旧库读取、材质派生及JSON往返不补评级，保留根与作品未知字段', () => {
  const original = { ...snapshot({ ...item(), futureItem: { note: ['保留'] } } as MediaItem), futureLibrary: { revision: 8 } };
  const raw = JSON.stringify(original);
  assert.equal(isValidSnapshot(original), true);
  assert.equal(coverFinishFor(original.items[0]), 'standard');
  const reloaded = JSON.parse(JSON.stringify(original));
  assert.equal(isValidSnapshot(reloaded), true);
  assert.equal(JSON.stringify(reloaded), raw);
  assert.equal(Object.hasOwn(reloaded.items[0], 'personalGrade'), false);
  for (const personalGrade of GAME_GRADES) {
    const rated = { ...original, items: [{ ...original.items[0], personalGrade }] };
    const restored = JSON.parse(JSON.stringify(rated));
    assert.equal(isValidSnapshot(restored), true);
    assert.deepEqual(restored, rated);
  }
  assert.equal(JSON.stringify(original), raw);
});

test('六个评级明确映射标准、银箔、金箔、镭射全息与棱彩星辉，派生不改记录', () => {
  const expected = { SSS: 'prismatic', SS: 'holographic', S: 'gold', A: 'silver', B: 'standard', C: 'standard' };
  for (const personalGrade of GAME_GRADES) {
    const work = Object.freeze(item({ personalGrade }));
    const raw = JSON.stringify(work);
    assert.equal(coverFinishFor(work), expected[personalGrade]);
    assert.equal(GAME_GRADE_TIERS[personalGrade].finish, expected[personalGrade]);
    assert.equal(JSON.stringify(work), raw);
  }
  assert.equal(coverFinishFor({ ...item(), personalGrade: 'D' } as unknown as MediaItem), 'standard');
});

test('只有当前已通关的游戏使用评级材质，兼容旧finished且不展示其他板块遗留评级', () => {
  for (const gamePlayState of GAME_PLAY_STATES) {
    const work = item({ gamePlayState, personalGrade: 'SS' });
    assert.equal(coverFinishFor(work), gamePlayState === 'cleared' ? 'holographic' : 'standard');
    assert.equal(work.personalGrade, 'SS');
  }
  assert.equal(coverFinishFor(item({ gamePlayState: 'replaying', personalGrade: 'S' })), 'standard');
  assert.equal(coverFinishFor(item({ gamePlayState: undefined, status: 'finished', personalGrade: 'S' })), 'gold');
  for (const category of ['book', 'screen', 'music'] as const) {
    const work = item({ category, personalGrade: 'SSS' });
    assert.equal(isValidSnapshot(snapshot(work)), true);
    assert.equal(coverFinishFor(work), 'standard');
    assert.equal(JSON.parse(JSON.stringify(work)).personalGrade, 'SSS');
  }
});

test('状态切换与批量标签编辑保留评级，切回已通关恢复原材质且原对象不变', () => {
  const original = item({ personalGrade: 'SSS' });
  const raw = JSON.stringify(original);
  const paused = createGameBatchEditPlan([original], [original.id], { gamePlayState: 'paused' }).items[0];
  assert.equal(paused.personalGrade, 'SSS');
  assert.equal(coverFinishFor(paused), 'standard');
  const tagged = createGameBatchEditPlan([paused], [paused.id], { tags: { mode: 'add', groups: { theme: ['科幻'] } } }).items[0];
  assert.equal(tagged.personalGrade, 'SSS');
  const cleared = createGameBatchEditPlan([tagged], [tagged.id], { gamePlayState: 'cleared' }).items[0];
  assert.equal(cleared.personalGrade, 'SSS');
  assert.equal(coverFinishFor(cleared), 'prismatic');
  assert.equal(JSON.stringify(original), raw);
});

test('隐藏、回收与恢复保留所有已有评级', () => {
  for (const personalGrade of GAME_GRADES) {
    const original = snapshot(item({ personalGrade }));
    const raw = JSON.stringify(original);
    const hidden = setItemsHidden(original, ['original'], true);
    const removed = trashItems(hidden, ['original']);
    const restored = restoreItems(removed, ['original']);
    for (const current of [hidden, removed, restored]) {
      assert.equal(current.items[0].personalGrade, personalGrade);
      assert.equal(isValidSnapshot(current), true);
    }
    assert.equal(JSON.stringify(original), raw);
  }
});

test('资料补全不采信来源评级，保留用户评级与未知字段', () => {
  const original = { ...item({ personalGrade: 'C' }), future: { keep: true } };
  const candidate = { provider: 'steam' as const, externalId: '123', category: 'game' as const, title: '来源标题', sourceUrl: 'https://store.steampowered.com/app/123/', year: '2024', personalGrade: 'SSS' as const };
  const raw = JSON.stringify({ original, candidate });
  const updated = applyMetadataCandidate(original, candidate) as typeof original;
  assert.equal(updated.personalGrade, 'C');
  assert.equal(updated.year, '2024');
  assert.deepEqual(updated.future, original.future);
  assert.equal(applyMetadataCandidate(undefined, candidate).personalGrade, undefined);
  assert.equal(JSON.stringify({ original, candidate }), raw);
});

test('Steam资料及时长同步保留个人评级，不采信来源附带评级或给新游戏评级', () => {
  for (const personalGrade of GAME_GRADES) {
    const original = item({ personalGrade });
    const incoming = { appId: '123', title: 'Steam标题', year: '2024', playtimeMinutes: 600, personalGrade: 'C' as const };
    const raw = JSON.stringify({ original, incoming });
    const options = { updatePlaytime: true };
    const row = planSteamSync([incoming], [original], options)[0];
    assert.equal(row.fields.includes('personalGrade'), false);
    const updated = applySteamSync([incoming], [original], ['123'], options).items[0];
    assert.equal(updated.personalGrade, personalGrade);
    assert.equal(updated.playtimeMinutes, 600);
    assert.equal(updated.year, '2024');
    assert.equal(JSON.stringify({ original, incoming }), raw);
    assert.equal(applySteamSync([incoming], [], ['123'], options).items[0].personalGrade, undefined);
  }
});
