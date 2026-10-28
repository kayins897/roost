import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMetadataCandidate } from './catalog.ts';
import { createSteamImportItems, parseSteamImport, previewSteamImport } from './steamImport.ts';
import { isValidSnapshot } from './library.ts';
import type { MediaItem } from './types.ts';

const sourceUrl = 'https://movie.douban.com/subject/42/';
const candidate = { provider: 'douban' as const, externalId: '42', category: 'screen' as const, title: '合成电影', sourceUrl, screenDetails: { actors: ['来源演员'], regions: ['甲地'], durationMinutes: 120, doubanScore: 9, description: '来源简介', metadataSource: '豆瓣' } };
const make = (): MediaItem => ({ id: 's', title: '私人名称', category: 'screen', subcategory: '电影', creator: '私人导演', year: '', status: 'paused', tags: ['私签'], impression: '私人感想', review: '私人长评', favorite: false, artwork: 'default', createdAt: '', updatedAt: '', personalScore: 0, screenViewing: { arrangement: 'abandoned', rounds: [{ id: 'r', impression: '第一遍', review: '' }] } });

test('豆瓣影视仅补缺，个人评分、零片长、原感想与未知资料均不覆盖', () => {
  const existing = { ...make(), screenDetails: { actors: ['私人演员'], regions: [], durationMinutes: 0, doubanScore: 0, description: '私人简介', future: 8 }, future: 9 };
  const before = JSON.stringify(existing), merged = applyMetadataCandidate(existing, candidate);
  assert.equal(merged.personalScore, 0); assert.equal(merged.title, existing.title); assert.equal(merged.creator, existing.creator);
  assert.equal(merged.screenViewing, existing.screenViewing); assert.equal(merged.impression, existing.impression); assert.equal(merged.review, existing.review);
  assert.deepEqual(merged.screenDetails?.actors, ['私人演员']); assert.deepEqual(merged.screenDetails?.regions, ['甲地']);
  assert.equal(merged.screenDetails?.durationMinutes, 0); assert.equal(merged.screenDetails?.doubanScore, 0); assert.equal(merged.screenDetails?.description, '私人简介');
  assert.equal((merged.screenDetails as typeof existing.screenDetails).future, 8); assert.equal((merged as typeof existing).future, 9);
  assert.equal(JSON.stringify(existing), before); assert.equal(isValidSnapshot({ schemaVersion: 1, items: [merged] }), true);
  const added = applyMetadataCandidate(undefined, candidate);
  assert.equal(added.status, 'want'); assert.equal(added.personalScore, undefined); assert.equal(added.screenViewing, undefined);
  assert.deepEqual(added.screenDetails, candidate.screenDetails);
  assert.throws(() => applyMetadataCandidate(undefined, { ...candidate, screenDetails: { doubanScore: 12 } }), /影视资料/);
});

test('影视数组与带资料清单可导入，来源编号去重，拒绝跨媒体和非法评分', () => {
  const input = { screens: [{ name: '合成作品', subcategory: '番剧', sourceUrl: `${sourceUrl}?from=example`, personalScore: 0, screenDetails: { durationMinutes: 24, episodeCount: 12, doubanScore: 8.2, actors: ['甲'], future: 99 } }, { title: '错板块', category: 'game' }, { title: '坏评分', personalScore: 11 }] };
  const parsed = parseSteamImport(JSON.stringify(input), 'screen');
  assert.equal(parsed.games.length, 1); assert.equal(parsed.skipped.length, 2);
  assert.equal(parsed.games[0].sourceUrl, sourceUrl); assert.equal(parsed.games[0].screenDetails?.metadataSource, '豆瓣');
  assert.equal((parsed.games[0].screenDetails as Record<string, unknown>).future, undefined, 'untrusted imports use an explicit allowlist');
  const items = createSteamImportItems(parsed.games, 'want');
  assert.equal(items[0].personalScore, 0); assert.equal(items[0].screenDetails?.episodeCount, 12); assert.equal(items[0].screenViewing, undefined);
  assert.equal(previewSteamImport(parsed.games, items)[0].duplicate, 'existing-id');
  const mixed = parseSteamImport(JSON.stringify({ format: 'qiyu.batch.v1', items: [{ title: '混合电影', category: 'screen', screenDetails: { durationMinutes: 90 } }, { title: '混合游戏', category: 'game' }] }));
  assert.deepEqual(createSteamImportItems(mixed.games).map(item => item.category), ['screen', 'game']);
  const names = parseSteamImport('合成电影甲\n合成电影乙', 'screen'); assert.equal(names.games.length, 2);
  assert.equal(createSteamImportItems(names.games)[0].experienceEntries, undefined);
});
