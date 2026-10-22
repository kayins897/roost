import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMetadataCandidate, findDuplicateCandidates, timelineEntries } from './catalog.ts';
import type { MetadataCandidate } from './catalog.ts';
import { isValidSnapshot } from './library.ts';
import type { MediaItem } from './types.ts';

const make = (id: string, overrides: Partial<MediaItem> = {}): MediaItem => ({
  id, title: id, category: 'game', subcategory: '', creator: '', year: '', status: 'want',
  tags: [], impression: '', favorite: false, artwork: 'default', createdAt: '2026-01-01', updatedAt: '2026-01-01', ...overrides,
});
const candidate: MetadataCandidate = {
  provider: 'steam', externalId: '123', category: 'game', title: '新的中文标题', originalTitle: 'A Game',
  creator: 'Developer', year: '2025', subcategory: 'Steam', platforms: ['Steam'],
  sourceUrl: 'https://store.steampowered.com/app/123/A_Game/?l=schinese',
  coverSourceUrl: 'https://cdn.example.org/cover.jpg',
};

test('外部编号和标准作品链接优先于同名候选，忽略跨板块同名作品', () => {
  const byName = make('name', { title: 'Ａ Ｇａｍｅ！' });
  const byUrl = make('url', { sourceUrl: 'http://store.steampowered.com/app/123/?utm_source=old' });
  const byId = make('id', { externalIds: [{ provider: 'steam', id: '123' }] });
  const crossCategory = make('book', { category: 'book', title: candidate.title });
  const noMatch = make('none', { title: 'A Game 2', sourceUrl: 'https://not-steam.example/app/123/' });
  assert.deepEqual(findDuplicateCandidates([byName, crossCategory, byUrl, noMatch, byId], candidate).map(item => item.id), ['url', 'id', 'name']);
});

test('豆瓣来源标准化忽略跟踪参数和末尾斜杠，但不混淆不同作品', () => {
  const bookCandidate: MetadataCandidate = { provider: 'douban', externalId: '42', category: 'book', title: '一本书', sourceUrl: 'https://book.douban.com/subject/42/?from=search' };
  const same = make('same', { category: 'book', title: '旧名称', sourceUrl: 'https://book.douban.com/subject/42' });
  const other = make('other', { category: 'book', title: '另一作品', sourceUrl: 'https://book.douban.com/subject/420/' });
  assert.deepEqual(findDuplicateCandidates([other, same], bookCandidate).map(item => item.id), ['same']);
});

test('资料合并仅填元数据空值，平台和身份合并且保留个人数据与未知字段', () => {
  const existing = {
    ...make('keep', {
      title: '我习惯的名称', originalTitle: 'Original', creator: '自定义开发商', subcategory: 'Switch',
      status: 'paused', gamePlayState: 'paused', playtimeMinutes: 360, tags: ['我的标签'],
      impression: '不能覆盖', favorite: true, experienceEntries: [{ id: 'session', date: '2024-10', kind: 'note', note: '个人经历' }],
      sourceUrl: 'https://example.org/my-own-link', coverUrl: 'data:image/png;base64,AAAA',
      externalIds: [{ provider: 'douban', id: '55', url: 'https://book.douban.com/subject/55/' }],
    }), futureData: { version: 9 },
  };
  const before = JSON.stringify(existing);
  const merged = applyMetadataCandidate(existing, candidate);
  assert.equal(merged.id, 'keep');
  assert.equal(merged.title, existing.title);
  assert.equal(merged.originalTitle, existing.originalTitle);
  assert.equal(merged.creator, existing.creator);
  assert.equal(merged.year, '2025');
  assert.equal(merged.sourceUrl, existing.sourceUrl);
  assert.equal(merged.coverUrl, existing.coverUrl);
  assert.equal(merged.status, 'paused');
  assert.equal(merged.gamePlayState, 'paused');
  assert.equal(merged.playtimeMinutes, 360);
  assert.equal(merged.impression, '不能覆盖');
  assert.equal(merged.favorite, true);
  assert.deepEqual(merged.tags, ['我的标签']);
  assert.deepEqual(merged.experienceEntries, existing.experienceEntries);
  assert.deepEqual(merged.platforms, ['Switch', 'Steam']);
  assert.deepEqual((merged as typeof existing).futureData, { version: 9 });
  assert.deepEqual(merged.externalIds?.map(ref => `${ref.provider}:${ref.id}`), ['douban:55', 'steam:123']);
  assert.equal(merged.createdAt, existing.createdAt);
  assert.equal(JSON.stringify(existing), before);
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [merged] }), true);
});

test('重复获取同一资料不会重复平台或身份，补全已有身份缺失的URL', () => {
  const existing = make('a', { platforms: ['steam'], externalIds: [{ provider: 'steam', id: '123' }] });
  const merged = applyMetadataCandidate(applyMetadataCandidate(existing, candidate), candidate);
  assert.deepEqual(merged.platforms, ['steam']);
  assert.equal(merged.externalIds?.length, 1);
  assert.equal(merged.externalIds?.[0].url, candidate.sourceUrl);
});

test('新增资料生成可验证的默认作品，不将远程封面当成本地封面保存', () => {
  const added = applyMetadataCandidate(undefined, candidate);
  assert.equal(added.status, 'want');
  assert.equal(added.gamePlayState, 'want');
  assert.equal(added.favorite, false);
  assert.equal(added.impression, '');
  assert.equal(added.coverUrl, undefined);
  assert.equal((added as unknown as Record<string, unknown>).coverSourceUrl, undefined);
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [added] }), true);
  const invalidCover = applyMetadataCandidate(undefined, { ...candidate, coverUrl: 'https://cdn.example.org/image.png' });
  assert.equal(invalidCover.coverUrl, undefined);
  const localCover = applyMetadataCandidate(undefined, { ...candidate, coverUrl: 'data:image/webp;base64,AAAA' });
  assert.equal(localCover.coverUrl, 'data:image/webp;base64,AAAA');
  assert.throws(() => applyMetadataCandidate(make('book', { category: 'book' }), candidate), /不同板块/);
  for (const sourceUrl of ['javascript:alert(1)', 'https://notsteam.example/app/123/', 'https://store.steampowered.com/app/456/']) {
    assert.throws(() => applyMetadataCandidate(undefined, { ...candidate, sourceUrl }), /来源与作品编号/);
  }
  assert.throws(() => applyMetadataCandidate(undefined, { ...candidate, category: 'book' }), /来源与作品编号/);
});

test('回顾只使用明确的实际体验日期，保留月份精度与时长，不凭收录时间生成记录', () => {
  const oldExperience = make('a', { createdAt: '2099-12-31', experienceEntries: [
    { id: 'old', date: '2023-01-05', kind: 'started', note: '开始' },
    { id: 'month', date: '2025-06', kind: 'note', note: '月份不确定哪天' },
  ] });
  const newExperience = make('b', { createdAt: '2020-01-01', experienceEntries: [
    { id: 'new', date: '2025-06-12', kind: 'completed', note: '完成', minutes: 90 },
  ] });
  const noExperience = make('empty', { createdAt: '2099-01-01' });
  const timeline = timelineEntries([oldExperience, noExperience, newExperience]);
  assert.deepEqual(timeline.map(entry => entry.id), ['new', 'month', 'old']);
  assert.equal(timeline[0].item, newExperience);
  assert.equal(timeline[0].minutes, 90);
  assert.equal(timeline[1].date, '2025-06');
});
