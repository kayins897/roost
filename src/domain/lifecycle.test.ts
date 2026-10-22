import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidSnapshot } from './library.ts';
import { addImportExclusions, externalIdentitiesFor, isImportExcluded } from './importExclusions.ts';
import { permanentlyDeleteItems, restoreItems, setItemsHidden, trashItems, visibleLibraryItems } from './lifecycle.ts';
import { previewSteamImport } from './steamImport.ts';
import { applySteamSync, planSteamSync } from './steamSync.ts';
import type { LibrarySnapshot, MediaItem } from './types.ts';

const item = (extra: Partial<MediaItem> = {}): MediaItem => ({
  id: 'one', title: '我的标题', category: 'game', subcategory: 'Steam', creator: '开发商', year: '2024',
  status: 'paused', gamePlayState: 'abandoned', playtimeMinutes: 3300, tags: ['值得回顾'], impression: '自己的测评',
  favorite: true, artwork: 'default', createdAt: '2020-01-01', updatedAt: '2020-01-02',
  externalIds: [{ provider: 'steam', id: '123' }],
  experienceEntries: [{ id: 'note', date: '2020-01', kind: 'note', note: '亲手记录' }], ...extra,
});
const snapshot = (items: MediaItem[] = [item()]): LibrarySnapshot => ({ schemaVersion: 1, items });

test('旧库只读及所有无变化操作不补新字段、不更改原文或对象', () => {
  const original = snapshot(); const raw = JSON.stringify(original);
  assert.equal(isValidSnapshot(original), true);
  assert.deepEqual(visibleLibraryItems(original), original.items);
  assert.deepEqual(visibleLibraryItems(original, 'hidden'), []);
  assert.deepEqual(visibleLibraryItems(original, 'trash'), []);
  assert.equal(setItemsHidden(original, ['one'], false), original);
  assert.equal(setItemsHidden(original, [], true), original);
  assert.equal(trashItems(original, []), original);
  assert.equal(restoreItems(original, ['one']), original);
  assert.equal(permanentlyDeleteItems(original, []), original);
  assert.equal(JSON.stringify(original), raw);
  assert.equal(Object.hasOwn(original, 'importExclusions'), false);
  assert.equal(Object.hasOwn(original.items[0], 'hiddenAt'), false);
});

test('隐藏／取消隐藏独立于状态、个人时长和印象，未选作品及未知字段保留', () => {
  const first = { ...item(), future: { keep: ['作品扩展'] } };
  const other = item({ id: 'two', title: '另一款', externalIds: undefined });
  const original = { ...snapshot([first, other]), futureLibrary: { keep: true } };
  const raw = JSON.stringify(original);
  const hidden = setItemsHidden(original, ['one'], true) as typeof original;
  assert.equal(hidden.schemaVersion, 1); assert.equal(isValidSnapshot(hidden), true);
  assert.equal(visibleLibraryItems(hidden)[0], other);
  assert.deepEqual(visibleLibraryItems(hidden, 'hidden').map(work => work.id), ['one']);
  assert.equal(hidden.items[1], other); assert.deepEqual(hidden.futureLibrary, original.futureLibrary);
  for (const key of ['gamePlayState', 'status', 'playtimeMinutes', 'impression', 'favorite', 'experienceEntries', 'tags', 'future'] as const) {
    assert.deepEqual(hidden.items[0][key as keyof MediaItem], first[key]);
  }
  assert.equal(setItemsHidden(hidden, ['one'], true), hidden);
  assert.equal(hidden.importExclusions, undefined);
  const unhidden = setItemsHidden(hidden, ['one'], false);
  assert.deepEqual(visibleLibraryItems(unhidden).map(work => work.id), ['one', 'two']);
  assert.equal(Object.hasOwn(unhidden.items[0], 'hiddenAt'), false);
  assert.equal(JSON.stringify(original), raw);
});

test('回收站保留完整记录、建立来源排除，恢复返回原隐藏状态并解除排除', () => {
  const original = setItemsHidden(snapshot(), ['one'], true);
  const raw = JSON.stringify(original);
  const trashed = trashItems(original, new Set(['one']));
  assert.equal(isValidSnapshot(trashed), true);
  assert.deepEqual(visibleLibraryItems(trashed), []);
  assert.deepEqual(visibleLibraryItems(trashed, 'hidden'), []);
  assert.equal(visibleLibraryItems(trashed, 'trash')[0], trashed.items[0]);
  assert.equal(trashed.items[0].hiddenAt, original.items[0].hiddenAt);
  assert.equal(trashed.items[0].playtimeMinutes, 3300);
  assert.deepEqual(trashed.items[0].experienceEntries, original.items[0].experienceEntries);
  assert.deepEqual(trashed.importExclusions, [{ provider: 'steam', id: '123', url: 'https://store.steampowered.com/app/123/' }]);
  assert.equal(trashItems(trashed, ['one']), trashed);
  const restored = restoreItems(trashed, ['one']);
  assert.equal(isValidSnapshot(restored), true);
  assert.equal(Object.hasOwn(restored.items[0], 'removedAt'), false);
  assert.deepEqual(restored.importExclusions, []);
  assert.equal(visibleLibraryItems(restored, 'hidden')[0].id, 'one');
  assert.equal(JSON.stringify(original), raw);
});

test('永久删除必须先回收，删除只移除所选记录且保留排除与全库未知字段', () => {
  const first = { ...item(), future: { keep: true } };
  const other = item({ id: 'two', title: '第二款', externalIds: [{ provider: 'steam', id: '456' }] });
  const original = { ...snapshot([first, other]), futureLibrary: ['仍保留'] };
  assert.throws(() => permanentlyDeleteItems(original, ['one']), /先将作品移入回收站/);
  const trashed = trashItems(original, ['one']);
  const raw = JSON.stringify(trashed);
  const deleted = permanentlyDeleteItems(trashed, ['one']) as typeof original;
  assert.deepEqual(deleted.items, [other]); assert.equal(deleted.items[0], other);
  assert.deepEqual(deleted.futureLibrary, original.futureLibrary);
  assert.equal(deleted.importExclusions?.[0].id, '123');
  assert.equal(isValidSnapshot(deleted), true);
  assert.equal(JSON.stringify(trashed), raw);
  for (const operation of [trashItems, restoreItems, permanentlyDeleteItems]) assert.throws(() => operation(original, ['missing']), /已不存在/);
  assert.throws(() => setItemsHidden(original, ['missing'], true), /已不存在/);
});

test('读写扩展校验拒绝坏时间、坏排除编号和伪造来源链接', () => {
  for (const key of ['hiddenAt', 'removedAt']) {
    for (const value of ['', null, 1, true, [], {}, '2026-02-30T00:00:00.000Z', '2026-01-01', '2026-10-24T25:00:00.000Z']) {
      assert.equal(isValidSnapshot({ ...snapshot(), items: [{ ...item(), [key]: value }] }), false, `${key}: ${String(value)}`);
    }
    for (const value of ['2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00Z']) assert.equal(isValidSnapshot({ ...snapshot(), items: [{ ...item(), [key]: value }] }), true);
  }
  for (const importExclusions of [null, {}, '123', [null], [{ provider: 'other', id: '123' }], [{ provider: 'steam', id: '0' }], [{ provider: 'steam', id: '4294967296' }],
    [{ provider: 'steam', id: '123', url: 'https://store.steampowered.com.evil.test/app/123/' }],
    [{ provider: 'steam', id: '123', url: 'https://store.steampowered.com/app/456/' }],
    [{ provider: 'douban', id: '123', url: 'javascript:alert(1)' }],
    [{ provider: 'douban', id: '123', url: 'https://user:pass@movie.douban.com/subject/123/' }],
  ]) assert.equal(isValidSnapshot({ ...snapshot(), importExclusions }), false);
});

test('旧来源链接建立规范编号，豆瓣书籍影视编号即使相同也各自独立', () => {
  const legacy = item({ externalIds: undefined, sourceUrl: 'http://store.steampowered.com/app/000123/old/' });
  assert.deepEqual(externalIdentitiesFor(legacy), [{ provider: 'steam', id: '123', url: 'https://store.steampowered.com/app/123/' }]);
  const book = item({ id: 'book', category: 'book', externalIds: [{ provider: 'douban', id: '123' }], sourceUrl: 'https://book.douban.com/subject/123/' });
  const screen = item({ id: 'screen', category: 'screen', externalIds: [{ provider: 'douban', id: '123' }], sourceUrl: 'https://movie.douban.com/subject/123/' });
  const excluded = trashItems(snapshot([book, screen]), ['book']);
  assert.equal(isImportExcluded(book, excluded.importExclusions), true);
  assert.equal(isImportExcluded(screen, excluded.importExclusions), false);
  assert.equal(isImportExcluded(screen, [{ provider: 'douban', id: '123' }]), true, '无链接的外部排除保守匹配');
  assert.equal(isValidSnapshot(excluded), true);
});

test('隐藏参与离线判重，回收及永久删除后的同 AppID 改名也阻止重新导入', () => {
  const incoming = [{ appId: '000123', title: '完全不同的名称' }];
  const hidden = setItemsHidden(snapshot(), ['one'], true);
  assert.equal(previewSteamImport(incoming, hidden.items, hidden.importExclusions)[0].duplicate, 'existing-id');
  const trashed = trashItems(hidden, ['one']);
  assert.equal(previewSteamImport(incoming, trashed.items, trashed.importExclusions)[0].duplicate, 'excluded');
  const deleted = permanentlyDeleteItems(trashed, ['one']);
  assert.equal(previewSteamImport(incoming, deleted.items, deleted.importExclusions)[0].duplicate, 'excluded');
  assert.equal(previewSteamImport([{ appId: '456', title: '另外的游戏' }], deleted.items, deleted.importExclusions)[0].duplicate, null);
  assert.equal(previewSteamImport([{ title: '我的标题' }], deleted.items, deleted.importExclusions)[0].duplicate, null, '无来源编号不按名称猜测永久屏蔽');
});

test('Steam在线计划与执行都跳过已移除编号，误选也不会重收录或更新回收记录', () => {
  const games = [{ appId: '123', title: '改名后的来源', playtimeMinutes: 9999 }, { appId: '456', title: '新作品' }];
  const trashed = trashItems(snapshot(), ['one']);
  for (const current of [trashed, permanentlyDeleteItems(trashed, ['one'])]) {
    const options = { updatePlaytime: true, exclusions: current.importExclusions };
    const rows = planSteamSync(games, current.items, options);
    assert.deepEqual(rows.map(row => row.kind), ['excluded', 'new']);
    const result = applySteamSync(games, current.items, ['123', '456'], options);
    assert.equal(result.added, 1); assert.equal(result.updated, 0); assert.equal(result.unchanged, 1);
    assert.equal(result.items.filter(work => work.externalIds?.some(ref => ref.id === '123')).length, current.items.length);
    if (current.items[0]) assert.equal(result.items[0], current.items[0]);
  }
  assert.equal(planSteamSync(games, trashed.items, { updatePlaytime: true })[0].kind, 'excluded', '回收站本体也保护未传排除的旧调用');
  const restored = restoreItems(trashed, ['one']);
  assert.equal(planSteamSync(games, restored.items, { updatePlaytime: true, exclusions: restored.importExclusions })[0].kind, 'update');
});

test('恢复一条时不解除另一条仍在回收站的同编号排除，原排除扩展字段保留', () => {
  const original = snapshot([item(), item({ id: 'two' })]);
  const trashed = trashItems(original, ['one', 'two']);
  trashed.importExclusions = [{ provider: 'steam', id: '123', url: 'https://store.steampowered.com/app/123/', future: '保留' } as NonNullable<LibrarySnapshot['importExclusions']>[number]];
  const restored = restoreItems(trashed, ['one']);
  assert.deepEqual(restored.importExclusions, trashed.importExclusions);
  const added = addImportExclusions(trashed.importExclusions, [item()]);
  assert.equal(added[0], trashed.importExclusions[0]); assert.equal(added.length, 1);
  assert.deepEqual(restoreItems(restored, ['two']).importExclusions, []);
});

test('仅手动作品回收与恢复不会凭空增加排除字段，隐藏回收项不改变其数据', () => {
  const original = snapshot([item({ externalIds: undefined, sourceUrl: 'https://example.org/my-note' })]);
  const removed = trashItems(original, ['one']);
  assert.equal(Object.hasOwn(removed, 'importExclusions'), false);
  assert.equal(setItemsHidden(removed, ['one'], true), removed);
  const restored = restoreItems(removed, ['one']);
  assert.equal(Object.hasOwn(restored, 'importExclusions'), false);
  assert.equal(restored.items[0].sourceUrl, original.items[0].sourceUrl);
});
