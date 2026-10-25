import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXPERIENCE_CATEGORIES, EXPERIENCE_CATEGORY_LABELS, EXPERIENCE_STATUSES, EXPERIENCE_STATUS_LABELS,
  createExperiencePatch, experienceCategoryFor, experienceCategoryPatch, experienceClassificationPatch,
  experienceStatusFor, experienceStatusPatch, isGameExperienceCategory, isGameExperienceStatus, planExperienceBatchChange,
} from './gameExperience.ts';
import type { ExperienceBatchChange, GameExperienceClassification } from './gameExperience.ts';
import { groupRankedGames, moveGameWithinRank } from './gamePlanning.ts';
import { inPlanView, priorityEditable } from './gameProgress.ts';
import { filterLibrary, isValidSnapshot } from './library.ts';
import { applySteamSync, planSteamSync } from './steamSync.ts';
import type { GameExperienceCategory, LibrarySnapshot, MediaItem } from './types.ts';
import { LocalStorageRepository } from '../infrastructure/localStorageRepository.ts';

const now = '2026-10-25T12:00:00.000Z';
const make = (id: string, extra: Partial<MediaItem> = {}): MediaItem => ({
  id, title: `合成游戏 ${id}`, category: 'game', subcategory: 'Steam', platforms: ['Steam'],
  creator: '', year: '', status: 'want', tags: [], impression: '自己的印象', review: '自己的长文',
  favorite: false, artwork: 'default', createdAt: '2026-01-01', updatedAt: '2026-01-02', ...extra,
});
const ids = (items: MediaItem[]) => items.map(item => item.id);
const categories: GameExperienceCategory[] = ['continue', 'replayable', 'completed', 'put-aside'];
const classifications: GameExperienceClassification[] = ['unplayed', 'unclassified', ...categories];
function preserveExcept(before: MediaItem, after: MediaItem, allowed: readonly string[]) {
  for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!allowed.includes(field)) assert.deepEqual(Reflect.get(after, field), Reflect.get(before, field), `${before.id}.${field} 必须原样保留`);
  }
}
const withFacts = (id: string, extra: Partial<MediaItem> = {}) => ({
  ...make(id, {
    status: 'finished', gamePlayState: 'cleared', playEngagement: 'playing', completion: 'not-cleared',
    playtimeMinutes: 73, completionCount: 0, personalGrade: 'SS', playPriority: 'A', priorityOrder: 4, ratingOrder: 7,
    experienceEntries: [{ id: 'log', date: '2025-04', kind: 'completed', note: '普通日志', minutes: 20 }],
    completionEvents: [{ id: 'event', occurredAt: '2024', recordedAt: now, note: '明确完成事件' }],
    ...extra,
  }),
  futureItem: { keep: ['未知扩展字段'] },
});

test('体验一级两值、二级四个单选与空值严格校验，旧long-term仍可读取', () => {
  assert.deepEqual(EXPERIENCE_STATUSES, ['unplayed', 'experienced']);
  assert.deepEqual(EXPERIENCE_STATUS_LABELS, { unplayed: '新作开荒', experienced: '已体验' });
  assert.deepEqual(EXPERIENCE_CATEGORIES, categories);
  assert.deepEqual(EXPERIENCE_CATEGORY_LABELS, { continue: '未完待续', replayable: '新游戏+', 'long-term': '新游戏+', completed: '收官完结', 'put-aside': '暂时搁置' });
  assert.equal(isGameExperienceCategory('long-term'), true);
  for (const value of ['unplayed', 'experienced']) assert.equal(isGameExperienceStatus(value), true);
  for (const value of categories) assert.equal(isGameExperienceCategory(value), true);
  for (const value of [undefined, null, true, 1, {}, [], '', 'playing', 'cleared', 'Experienced']) {
    assert.equal(isGameExperienceStatus(value), false);
    assert.equal(isGameExperienceCategory(value), false);
  }
  assert.deepEqual(experienceCategoryPatch(undefined), { experienceCategory: undefined }, '可明确清空二级');
  assert.throws(() => experienceStatusPatch('invalid' as never), /不支持/);
  assert.throws(() => experienceCategoryPatch('cleared' as never), /不支持/);
  assert.throws(() => experienceClassificationPatch('playing' as never), /不支持/);
});

test('显式一级始终优先于正时长、通关、次数、新旧活动证据；阅读不改原文', () => {
  const evidence: Partial<MediaItem>[] = [
    { playtimeMinutes: 1 }, { completion: 'cleared' }, { completionCount: 1 }, { playEngagement: 'playing' },
    { gamePlayState: 'playing' }, { gamePlayState: 'ongoing' }, { gamePlayState: 'replaying' }, { gamePlayState: 'cleared' },
    { status: 'active' }, { status: 'finished' },
  ];
  for (const source of evidence) {
    const legacy = make('legacy', source), raw = JSON.stringify(legacy);
    assert.equal(experienceStatusFor(legacy), 'experienced', JSON.stringify(source));
    assert.equal(experienceCategoryFor(legacy), undefined, '旧证据不推算二级');
    const explicit = { ...legacy, experienceStatus: 'unplayed' as const, experienceCategory: 'completed' as const };
    const explicitRaw = JSON.stringify(explicit);
    assert.equal(experienceStatusFor(explicit), 'unplayed'); assert.equal(experienceCategoryFor(explicit), undefined);
    assert.equal(priorityEditable(explicit), true); assert.equal(inPlanView(explicit), true);
    assert.equal(JSON.stringify(legacy), raw); assert.equal(JSON.stringify(explicit), explicitRaw);
    assert.equal(Object.hasOwn(legacy, 'experienceStatus'), false);
  }
  const noFacts = make('explicit', { experienceStatus: 'experienced', playtimeMinutes: 0, completionCount: 0 });
  assert.equal(experienceStatusFor(noFacts), 'experienced'); assert.equal(experienceCategoryFor(noFacts), undefined);
  assert.equal(priorityEditable(noFacts), false); assert.equal(inPlanView(noFacts), false);
});

test('旧搁置/放弃/计划不单独证明已体验；零、日志及完成事件不猜分类', () => {
  for (const gamePlayState of ['paused', 'abandoned', 'want'] as const) {
    const legacy = make(gamePlayState, { gamePlayState, status: 'finished', playtimeMinutes: 0, completionCount: 0 });
    const before = JSON.stringify(legacy);
    assert.equal(experienceStatusFor(legacy), 'unplayed', '明确旧轴优先于通用 status');
    assert.equal(experienceCategoryFor(legacy), undefined); assert.equal(JSON.stringify(legacy), before);
    assert.equal(experienceStatusFor({ ...legacy, playtimeMinutes: 1 }), 'experienced', '正时长是独立证据');
    assert.equal(experienceCategoryFor({ ...legacy, playtimeMinutes: 1 }), undefined, '有时长仍不猜已放下或待续');
  }
  for (const extra of [
    {}, { playEngagement: 'planned' }, { playEngagement: 'paused' }, { playEngagement: 'inactive' }, { playEngagement: 'abandoned' },
    { status: 'paused' }, { completion: 'unknown' }, { completion: 'not-cleared' }, { completion: 'not-applicable' },
    { playtimeMinutes: 0, completionCount: 0 },
    { experienceEntries: [{ id: 'log', date: '2025-01', kind: 'completed', note: '普通完成日志', minutes: 30 }] },
    { completionEvents: [{ id: 'event', recordedAt: now }] },
  ] as Partial<MediaItem>[]) {
    assert.equal(experienceStatusFor(make('no-proof', extra)), 'unplayed', JSON.stringify(extra));
    assert.equal(experienceCategoryFor(make('no-proof', extra)), undefined);
  }
});

test('主类三种勾选组合采用OR，二级与主类/搜索/标签/平台采用AND', () => {
  const items = [
    make('u', { experienceStatus: 'unplayed', experienceCategory: 'continue', playtimeMinutes: 99 }),
    make('uncategorized', { experienceStatus: 'experienced' }),
    ...categories.map(experienceCategory => make(experienceCategory, {
      experienceStatus: 'experienced', experienceCategory, tags: ['动作'], favorite: true,
      title: `筛选词 ${experienceCategory}`, gameTags: { gameplay: ['动作'], theme: [], scenario: [], other: [] },
    })),
  ];
  const raw = JSON.stringify(items);
  assert.deepEqual(ids(filterLibrary(items, { gameExperienceStatuses: ['unplayed'] })), ['u']);
  assert.deepEqual(ids(filterLibrary(items, { gameExperienceStatuses: ['experienced'] })), ['uncategorized', ...categories]);
  assert.deepEqual(ids(filterLibrary(items, { gameExperienceStatuses: ['unplayed', 'experienced'] })), ids(items));
  assert.deepEqual(filterLibrary(items, { gameExperienceStatuses: [] }), [], '领域明确全空；界面负责防全不选');
  assert.deepEqual(ids(filterLibrary(items, { gameExperienceStatuses: ['experienced'], gameExperienceCategories: undefined })), ['uncategorized', ...categories]);
  assert.deepEqual(filterLibrary(items, { gameExperienceStatuses: ['experienced'], gameExperienceCategories: [] }), [], '空二级数组不同于未筛选');
  for (const category of categories) {
    assert.deepEqual(ids(filterLibrary(items, { gameExperienceStatuses: ['experienced'], gameExperienceCategories: [category] })), [category]);
    assert.deepEqual(filterLibrary(items, { gameExperienceStatuses: ['unplayed'], gameExperienceCategories: [category] }), [], '待体验残存二级不参与筛选');
  }
  assert.deepEqual(ids(filterLibrary(items, { gameExperienceStatuses: ['unplayed', 'experienced'], gameExperienceCategories: ['continue', 'replayable'] })), ['continue', 'replayable']);
  assert.deepEqual(ids(filterLibrary(items, { gameExperienceStatuses: ['experienced'], gameExperienceCategories: ['completed'], search: '筛选词', tags: ['动作'], subcategory: 'Steam', favoriteOnly: true })), ['completed']);
  assert.deepEqual(filterLibrary(items, { gameExperienceStatuses: ['experienced'], gameExperienceCategories: ['completed'], tags: ['不存在'] }), []);
  assert.deepEqual(filterLibrary(items, { gameExperienceStatuses: ['experienced'], subcategory: 'Switch' }), []);
  assert.equal(JSON.stringify(items), raw);
});

test('已体验可无二级或四选一；设待体验清二级，分类与通关事实完全分离', () => {
  const original = withFacts('a', { experienceStatus: 'unplayed', experienceCategory: 'put-aside' });
  const before = JSON.stringify(original);
  for (const classification of classifications) {
    const patch = experienceClassificationPatch(classification);
    assert.deepEqual(patch, { experienceStatus: classification === 'unplayed' ? 'unplayed' : 'experienced', experienceCategory: categories.includes(classification as GameExperienceCategory) ? classification : undefined });
    assert.deepEqual(createExperiencePatch(original, { kind: 'classification', value: classification }), patch);
    const after = { ...original, ...patch };
    assert.equal(experienceStatusFor(after), classification === 'unplayed' ? 'unplayed' : 'experienced');
    assert.equal(experienceCategoryFor(after), categories.includes(classification as GameExperienceCategory) ? classification : undefined);
    preserveExcept(original, after, ['experienceStatus', 'experienceCategory']);
    assert.equal(after.completion, 'not-cleared', '整理分类已通关不改客观通关事实');
    assert.equal(after.completionCount, 0, '分类不增加累计完成次数');
  }
  assert.deepEqual(experienceStatusPatch('unplayed'), { experienceStatus: 'unplayed', experienceCategory: undefined });
  assert.deepEqual(experienceStatusPatch('experienced'), { experienceStatus: 'experienced' });
  assert.equal(createExperiencePatch(make('unplayed'), { kind: 'category', value: 'continue' }), null);
  assert.deepEqual(createExperiencePatch(make('experienced', { experienceStatus: 'experienced' }), { kind: 'category', value: undefined }), { experienceStatus: 'experienced', experienceCategory: undefined });
  for (const category of categories) assert.deepEqual(createExperiencePatch(make('inferred', { playtimeMinutes: 1 }), { kind: 'category', value: category }), { experienceStatus: 'experienced', experienceCategory: category });
  assert.equal(JSON.stringify(original), before);
});

test('classification批量一次提交完整分类，仅改分类与时间；事实/日志/次数/时长/旧轴不变', () => {
  const first = withFacts('first', { experienceStatus: 'unplayed' });
  const second = withFacts('second', { experienceStatus: 'experienced', experienceCategory: 'continue', hiddenAt: '2026-01-03T00:00:00.000Z' });
  const other = withFacts('unselected', { experienceStatus: 'experienced' });
  const book = make('book', { category: 'book' }), trash = withFacts('trash', { removedAt: '2026-01-04T00:00:00.000Z' });
  const items = [first, second, other, book, trash], raw = JSON.stringify(items);
  for (const classification of classifications) {
    const plan = planExperienceBatchChange(items, ['first', 'second', 'first', 'book', 'trash', 'missing'], { kind: 'classification', value: classification }, now);
    assert.deepEqual(plan.selectedIds, ['first', 'second', 'book', 'trash', 'missing']);
    assert.equal(plan.selectedCount, 2); assert.equal(plan.skippedCount, 3);
    const expected = experienceClassificationPatch(classification);
    assert.equal(plan.changedCount, classification === 'unplayed' || classification === 'continue' ? 1 : 2);
    assert.equal(plan.changes.length, plan.changedCount);
    assert.deepEqual(ids(plan.items), ids(items));
    for (const index of [0, 1]) {
      assert.equal(plan.items[index].experienceStatus, expected.experienceStatus);
      assert.equal(plan.items[index].experienceCategory, expected.experienceCategory);
      preserveExcept(items[index], plan.items[index], ['experienceStatus', 'experienceCategory', 'updatedAt']);
    }
    for (const index of [2, 3, 4]) assert.equal(plan.items[index], items[index]);
    for (const change of plan.changes) {
      assert.equal(change.before, items.find(item => item.id === change.id));
      assert.equal(change.after, plan.items.find(item => item.id === change.id));
      assert.equal(change.after.updatedAt, now);
    }
    assert.equal(isValidSnapshot({ schemaVersion: 1, items: plan.items }), true);
  }
  assert.equal(JSON.stringify(items), raw);
});

test('批量同值零修改，二级资格跳过待体验；预览后按最新库重建保留无关编辑', () => {
  const experienced = withFacts('e', { experienceStatus: 'experienced', experienceCategory: 'continue' });
  const unplayed = make('u', { experienceStatus: 'unplayed', completionCount: 0 });
  const items = [experienced, unplayed];
  const noChange = planExperienceBatchChange(items, ['e'], { kind: 'classification', value: 'continue' }, now);
  assert.equal(noChange.changedCount, 0); assert.equal(noChange.items, items); assert.deepEqual(noChange.changes, []);
  const secondary = planExperienceBatchChange(items, ['e', 'u'], { kind: 'category', value: 'put-aside' }, now);
  assert.equal(secondary.selectedCount, 1); assert.equal(secondary.skippedCount, 1); assert.equal(secondary.changedCount, 1);
  assert.equal(secondary.items[1], unplayed); assert.equal(secondary.items[0].experienceStatus, 'experienced');
  const latest = [{ ...experienced, impression: '预览后另一次明确编辑' }, unplayed];
  const rebuilt = planExperienceBatchChange(latest, ['e'], { kind: 'classification', value: 'completed' }, now);
  assert.equal(rebuilt.items[0].impression, '预览后另一次明确编辑');
  preserveExcept(latest[0], rebuilt.items[0], ['experienceStatus', 'experienceCategory', 'updatedAt']);
  for (const change of [
    { kind: 'status', value: 'invalid' }, { kind: 'category', value: 'invalid' },
    { kind: 'classification', value: 'invalid' }, { kind: 'invalid', value: 'unplayed' },
  ]) assert.throws(() => planExperienceBatchChange(items, [], change as ExperienceBatchChange, now), /不支持/, '空选择同样拒绝非法操作');
});

test('schemaVersion1接受可选分类与未知扩展，拒绝未知分类枚举而非静默归一', () => {
  const legacy = make('legacy');
  assert.equal(isValidSnapshot({ schemaVersion: 1, futureRoot: { keep: true }, items: [{ ...legacy, futureItem: { experienceStatus: 'future' } }] }), true);
  for (const experienceStatus of [undefined, 'unplayed', 'experienced'] as const) {
    for (const experienceCategory of [undefined, ...categories, 'long-term'] as const) assert.equal(isValidSnapshot({ schemaVersion: 1, items: [make('valid', { experienceStatus, experienceCategory })] }), true, '残存二级兼容读取，不自动清理');
  }
  for (const value of [null, true, 1, {}, [], '', 'playing', 'cleared', 'future']) {
    for (const field of ['experienceStatus', 'experienceCategory']) assert.equal(isValidSnapshot({ schemaVersion: 1, items: [{ ...legacy, [field]: value }] }), false, `${field}=${JSON.stringify(value)}`);
  }
});

test('真实存储适配器以内存夹具加载零写入；分类保存往返保留未知根/条目和全部事实', () => {
  const original = { schemaVersion: 1 as const, futureRoot: { keep: ['原文扩展'] }, items: [withFacts('a'), make('unselected', { category: 'music' })] };
  const initial = JSON.stringify(original, null, 2), values = new Map([['qiyu.library.v1', initial]]), writes: string[] = [];
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { writes.push(key); values.set(key, value); } };
  const repository = new LocalStorageRepository(storage), loaded = repository.load();
  assert.equal(experienceStatusFor(loaded.items[0]), 'experienced');
  assert.equal(experienceCategoryFor(loaded.items[0]), undefined);
  assert.deepEqual(writes, []); assert.equal(storage.getItem('qiyu.library.v1'), initial);
  assert.equal(Object.hasOwn(loaded.items[0], 'experienceStatus'), false);
  const plan = planExperienceBatchChange(loaded.items, ['a'], { kind: 'classification', value: 'replayable' }, now);
  repository.save({ ...loaded, items: plan.items });
  const reopened = new LocalStorageRepository(storage).load() as typeof original;
  assert.equal(reopened.schemaVersion, 1); assert.deepEqual(reopened.futureRoot, original.futureRoot);
  assert.equal(reopened.items[0].experienceStatus, 'experienced'); assert.equal(reopened.items[0].experienceCategory, 'replayable');
  assert.deepEqual(Reflect.get(reopened.items[0], 'futureItem'), Reflect.get(original.items[0], 'futureItem'));
  preserveExcept(original.items[0], reopened.items[0], ['experienceStatus', 'experienceCategory', 'updatedAt']);
  assert.deepEqual(reopened.items[1], original.items[1]);
  const clear = planExperienceBatchChange(reopened.items, ['a'], { kind: 'classification', value: 'unplayed' }, now);
  repository.save({ ...reopened, items: clear.items });
  const cleared = new LocalStorageRepository(storage).load();
  assert.equal(cleared.items[0].experienceStatus, 'unplayed'); assert.equal(Object.hasOwn(cleared.items[0], 'experienceCategory'), false, 'undefined二级在JSON往返后确实清空');
  preserveExcept(original.items[0], cleared.items[0], ['experienceStatus', 'experienceCategory', 'updatedAt']);
  const saved = storage.getItem('qiyu.library.v1');
  const invalid = { ...cleared, items: [{ ...cleared.items[0], experienceStatus: 'future' }] } as unknown as LibrarySnapshot;
  assert.throws(() => repository.save(invalid), /校验失败/); assert.equal(storage.getItem('qiyu.library.v1'), saved);
});

test('Steam补资料或累计时长不覆盖手动一级/四种二级，也不采信来源分类', () => {
  for (const classification of classifications) {
    const original = { ...withFacts('a', { ...experienceClassificationPatch(classification), playtimeMinutes: 0 }), externalIds: [{ provider: 'steam' as const, id: '123' }] };
    const before = JSON.stringify(original), unselected = make('unselected');
    const incoming = { appId: '123', title: '来源标题', creator: '来源开发者', year: '2025', playtimeMinutes: 100,
      experienceStatus: 'experienced', experienceCategory: 'completed', completion: 'cleared', completionCount: 99,
      experienceEntries: [{ id: 'injected', kind: 'completed' }], gamePlayState: 'playing', status: 'active' };
    for (const updatePlaytime of [true, false]) {
      const rows = planSteamSync([incoming], [original, unselected], { updatePlaytime });
      assert.equal(rows[0].fields.includes('experienceStatus'), false); assert.equal(rows[0].fields.includes('experienceCategory'), false);
      const result = applySteamSync([incoming], [original, unselected], ['123'], { updatePlaytime });
      const updated = result.items[0]; assert.equal(result.updated, 1); assert.equal(result.added, 0);
      assert.equal(updated.experienceStatus, original.experienceStatus); assert.equal(updated.experienceCategory, original.experienceCategory);
      assert.equal(experienceStatusFor(updated), classification === 'unplayed' ? 'unplayed' : 'experienced');
      assert.equal(updated.playtimeMinutes, updatePlaytime ? 100 : 0);
      preserveExcept(original, updated, ['creator', 'year', 'sourceUrl', 'playtimeMinutes', 'updatedAt']);
      assert.equal(result.items[1], unselected); assert.equal(isValidSnapshot({ schemaVersion: 1, items: result.items }), true);
    }
    assert.equal(JSON.stringify(original), before);
  }
  const injected = { appId: '456', title: '新增合成游戏', playtimeMinutes: 0, experienceStatus: 'experienced', experienceCategory: 'completed' };
  const added = applySteamSync([injected], [], ['456'], { updatePlaytime: true });
  assert.equal(added.items[0].experienceStatus, undefined); assert.equal(added.items[0].experienceCategory, undefined);
  assert.equal(experienceStatusFor(added.items[0]), 'unplayed', '新收录不信来源手动分类');
});

test('优先级按有效待体验分组，旧搁置/放弃和显式重置作品不漏项、不另设末档', () => {
  const grades = ['SSS', 'SS', 'S', 'A', 'B', 'C'] as const;
  const items = [
    ...grades.map(playPriority => make(playPriority, { experienceStatus: 'unplayed', gamePlayState: 'cleared', playtimeMinutes: 120, completion: 'cleared', playPriority })),
    make('paused', { gamePlayState: 'paused', status: 'paused', playPriority: 'SSS', playtimeMinutes: 0 }),
    make('abandoned', { gamePlayState: 'abandoned', playPriority: 'B' }), make('unknown'),
    make('experienced', { experienceStatus: 'experienced', playtimeMinutes: 0, playPriority: 'S' }),
    make('playing', { gamePlayState: 'playing', playPriority: 'S' }), make('book', { category: 'book', playPriority: 'SSS' }),
    make('hidden', { hiddenAt: '2026-01-03' }), make('removed', { removedAt: '2026-01-04' }),
  ];
  const raw = JSON.stringify(items), expected = [...grades, 'paused', 'abandoned', 'unknown'];
  for (const direction of ['asc', 'desc'] as const) {
    const groups = groupRankedGames(items, 'priority', true, direction), grouped = groups.flatMap(group => ids(group.items));
    assert.deepEqual(groups.map(group => group.id), [...(direction === 'asc' ? [...grades].reverse() : grades), 'unranked']);
    assert.equal(new Set(grouped).size, expected.length); assert.deepEqual([...grouped].sort(), [...expected].sort());
    assert.deepEqual(ids(groups.find(group => group.id === 'SSS')!.items), ['SSS', 'paused']);
    assert.deepEqual(ids(groups.find(group => group.id === 'B')!.items), ['B', 'abandoned']);
    assert.deepEqual(ids(groups.find(group => group.id === 'unranked')!.items), ['unknown']);
  }
  assert.equal(JSON.stringify(items), raw);
});

test('游戏分类筛选、单件/批量分类与优先级资格不影响书籍影视音乐', () => {
  const otherMedia = (['book', 'screen', 'music'] as const).map(category => make(category, { category, status: 'finished', playtimeMinutes: 20, experienceStatus: 'experienced', experienceCategory: 'completed' }));
  const raw = JSON.stringify(otherMedia);
  for (const change of [{ kind: 'status', value: 'unplayed' }, { kind: 'category', value: 'continue' }, { kind: 'classification', value: 'replayable' }] as const) {
    for (const item of otherMedia) { assert.equal(createExperiencePatch(item, change), null); assert.equal(priorityEditable(item), false); assert.equal(inPlanView(item), false); }
    const plan = planExperienceBatchChange(otherMedia, ids(otherMedia), change, now);
    assert.equal(plan.selectedCount, 0); assert.equal(plan.skippedCount, 3); assert.equal(plan.changedCount, 0); assert.equal(plan.items, otherMedia);
  }
  for (const category of ['book', 'screen', 'music'] as const) {
    assert.deepEqual(ids(filterLibrary(otherMedia, { category, gameExperienceStatuses: [], gameExperienceCategories: [] })), [category]);
    assert.deepEqual(ids(filterLibrary(otherMedia, { category, status: 'finished', search: '合成游戏' })), [category]);
  }
  assert.equal(JSON.stringify(otherMedia), raw);
});

test('收官完结与新游戏+都保留评级组成员，仅客观已通关不再授予资格', () => {
  const items = [
    withFacts('classified', { experienceStatus: 'experienced', experienceCategory: 'completed', completion: 'unknown', playtimeMinutes: 0, personalGrade: 'S' }),
    withFacts('new-game-plus', { experienceStatus: 'experienced', experienceCategory: 'replayable', completion: 'unknown', personalGrade: 'S' }),
    withFacts('factual', { experienceStatus: 'experienced', completion: 'cleared', personalGrade: 'S' }),
    withFacts('uncategorized', { experienceStatus: 'experienced', completion: 'unknown', personalGrade: 'S' }),
    withFacts('other-category', { experienceStatus: 'experienced', experienceCategory: 'continue', completion: 'unknown', personalGrade: 'S' }),
    withFacts('stale', { experienceStatus: 'unplayed', experienceCategory: 'completed', completion: 'unknown', personalGrade: 'S' }),
    withFacts('hidden', { experienceStatus: 'experienced', experienceCategory: 'completed', hiddenAt: '2026-01-03T00:00:00.000Z' }),
    withFacts('book', { category: 'book', experienceStatus: 'experienced', experienceCategory: 'completed' }),
  ];
  const raw = JSON.stringify(items), groups = groupRankedGames(items, 'rating');
  assert.deepEqual(groups.flatMap(group => ids(group.items)), ['classified', 'new-game-plus']);
  assert.deepEqual(ids(groups.find(group => group.id === 'S')!.items), ['classified', 'new-game-plus']);
  const moved = moveGameWithinRank(items, 'new-game-plus', 'classified', 'rating');
  assert.equal(moved.changedCount, 2);
  assert.deepEqual(ids(groupRankedGames(moved.items, 'rating').find(group => group.id === 'S')!.items), ['new-game-plus', 'classified']);
  assert.equal(moved.items[0].completion, 'unknown'); assert.equal(moved.items[0].completionCount, 0);
  for (let index = 0; index < items.length; index++) {
    preserveExcept(items[index], moved.items[index], ['ratingOrder']);
    if (index >= 2) assert.equal(moved.items[index], items[index]);
  }
  assert.equal(moveGameWithinRank(items, 'uncategorized', 'classified', 'rating').changedCount, 0);
  assert.equal(moveGameWithinRank(items, 'factual', 'classified', 'rating').changedCount, 0, '历史完成与评级值保留但不开放排序');
  assert.equal(JSON.stringify(items), raw);
});

test('非游戏同名历史扩展不按游戏枚举拒读，加载与保存往返完整保留', () => {
  const items = [
    { ...make('book', { category: 'book' }), experienceStatus: '外部状态', experienceCategory: ['未知数组'] },
    { ...make('screen', { category: 'screen' }), experienceStatus: { nested: true }, experienceCategory: null },
    { ...make('music', { category: 'music' }), experienceStatus: false, experienceCategory: '外部分类' },
  ];
  const original = { schemaVersion: 1, futureRoot: { keep: true }, items };
  assert.equal(isValidSnapshot(original), true);
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [{ ...items[0], category: 'game' }] }), false, '游戏仍严格校验新枚举');
  const initial = JSON.stringify(original, null, 2), values = new Map([['qiyu.library.v1', initial]]), writes: string[] = [];
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { writes.push(key); values.set(key, value); } };
  const repository = new LocalStorageRepository(storage), loaded = repository.load();
  assert.deepEqual(writes, []); assert.equal(storage.getItem('qiyu.library.v1'), initial);
  assert.deepEqual(ids(filterLibrary(loaded.items, { gameExperienceStatuses: [], gameExperienceCategories: [] })), ['book', 'screen', 'music']);
  const plan = planExperienceBatchChange(loaded.items, ['book', 'screen', 'music'], { kind: 'classification', value: 'completed' }, now);
  assert.equal(plan.changedCount, 0); assert.equal(plan.items, loaded.items);
  repository.save(loaded);
  assert.deepEqual(new LocalStorageRepository(storage).load(), original);
});
