import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameBatchEditPlan } from './batchEdit.ts';
import { applyMetadataCandidate } from './catalog.ts';
import { filterLibrary, isValidSnapshot } from './library.ts';
import { restoreItems, trashItems } from './lifecycle.ts';
import { impressionError, personalWritingFor, personalWritingPatch, writingLength } from './personalWriting.ts';
import { applySteamSync } from './steamSync.ts';
import type { MediaItem } from './types.ts';

const work = (extra: Partial<MediaItem> = {}): MediaItem => ({ id: 'a', title: '游戏', category: 'game', subcategory: 'Steam', creator: '', year: '', status: 'want', tags: [], impression: '原有印象', favorite: false, artwork: 'default', createdAt: '', updatedAt: '', externalIds: [{ provider: 'steam', id: '123' }], ...extra });
test('测评为可选字符串，旧长印象仍可读取且JSON原文不补写字段', () => {
  const original = { schemaVersion: 1, items: [work({ impression: '旧文'.repeat(20000) })], future: { keep: true } };
  const raw = JSON.stringify(original);
  assert.ok(isValidSnapshot(original));
  personalWritingFor(original.items[0]);
  assert.equal(JSON.stringify(original), raw);
  assert.ok(!Object.hasOwn(original.items[0], 'review'));
  for (const review of ['', '  长文\r\n完整保留  ', '测评'.repeat(30000)]) assert.ok(isValidSnapshot({ ...original, items: [work({ review })] }));
  for (const review of [null, 1, {}, []]) assert.equal(isValidSnapshot({ ...original, items: [{ ...work(), review }] }), false);
});
test('旧长文和多行印象完整派生为测评，已有测评另段保留，不改原对象', () => {
  for (const impression of ['旧文'.repeat(60), '第一段\r\n第二段  ']) {
    const original = Object.freeze(work({ impression, review: '已有测评  ' }));
    const draft = personalWritingFor(original);
    assert.deepEqual(draft, { legacy: true, impression: '', review: impression + '\n\n已有测评  ' });
    assert.deepEqual(personalWritingPatch(original, draft), {});
    const patch = personalWritingPatch(original, { ...draft, impression: '新的短印象' });
    assert.deepEqual(patch, { impression: '新的短印象', review: impression + '\n\n已有测评  ' });
    assert.equal(original.impression, impression);
  }
});
test('一句话以Unicode码点计数，80字有效，81字或换行禁止保存且不截断', () => {
  assert.equal(writingLength('😀'.repeat(80)), 80);
  assert.equal(impressionError('😀'.repeat(80)), '');
  const tooLong = '😀'.repeat(81);
  assert.match(impressionError(tooLong), /80/);
  assert.throws(() => personalWritingPatch(work(), { impression: tooLong, review: '' }), /80/);
  for (const value of ['换\n行', '换\r\n行']) assert.match(impressionError(value), /单行/);
  assert.equal(tooLong, '😀'.repeat(81));
});
test('仅提交明确改动的写作字段，缺省与空测评不同，不trim空白', () => {
  const original = work();
  assert.deepEqual(personalWritingPatch(original, personalWritingFor(original)), {});
  assert.deepEqual(personalWritingPatch(original, { impression: ' 新印象 ', review: '' }), { impression: ' 新印象 ' });
  assert.deepEqual(personalWritingPatch(original, { impression: original.impression, review: ' 测评\r\n尾空白  ' }), { review: ' 测评\r\n尾空白  ' });
  assert.deepEqual(personalWritingPatch(work({ review: '旧测评' }), { impression: original.impression, review: '' }), { review: '' });
});
test('长文可以搜索，批量状态、标签、资料补全、Steam、回收恢复都保留写作原文', () => {
  const original = work({ impression: '  短印象 ', review: '长文中独有的星河印记\r\n尾空格  ' });
  assert.equal(filterLibrary([original], { search: '星河印记' }).length, 1);
  const candidate = { provider: 'steam' as const, externalId: '123', category: 'game' as const, title: '来源', sourceUrl: 'https://store.steampowered.com/app/123/', year: '2025' };
  const results = [
    createGameBatchEditPlan([original], ['a'], { gamePlayState: 'cleared' }).items[0],
    createGameBatchEditPlan([original], ['a'], { tags: { mode: 'add', groups: { theme: ['科幻'] } } }).items[0],
    applyMetadataCandidate(original, candidate),
    applySteamSync([{ appId: '123', title: '来源', playtimeMinutes: 200 }], [original], ['123'], { updatePlaytime: true }).items[0],
    restoreItems(trashItems({ schemaVersion: 1, items: [original] }, ['a']), ['a']).items[0],
  ];
  for (const item of results) { assert.equal(item.impression, original.impression); assert.equal(item.review, original.review); }
});
