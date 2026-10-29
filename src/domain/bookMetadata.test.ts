import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMetadataCandidate, type MetadataCandidate } from './catalog.ts';
import { createSteamImportItems } from './steamImport.ts';
import { isValidSnapshot } from './library.ts';

const candidate: MetadataCandidate = { provider: 'douban', externalId: '42', category: 'book', title: '来源书名', creator: '来源作者', sourceUrl: 'https://book.douban.com/subject/42/', bookDetails: { translator: '来源译者', publisher: '来源出版社', isbn: '9780306406157', description: '来源简介', doubanScore: 8.6, metadataSource: '豆瓣', readingSources: ['不得推断阅读来源'] } };

test('豆瓣图书只补公开资料空缺，保留自定义资料、零分、阅读历史和未知字段', () => {
  const [base] = createSteamImportItems([{ category: 'book', title: '我的书名' }]);
  const existing = { ...base, creator: '自定作者', personalScore: 0, impression: '我的感想', review: '长评保留', bookReading: { arrangement: 'reading' as const }, bookDetails: { publisher: '我的出版社', translator: ' ', description: '我的简介', doubanScore: 0, readingSources: ['纸质书'], future: { version: 2 } }, future: '保留' };
  const before = JSON.stringify(existing);
  const merged = applyMetadataCandidate(existing, candidate);
  assert.equal(JSON.stringify(existing), before); assert.equal(merged.title, existing.title); assert.equal(merged.creator, existing.creator);
  assert.equal(merged.personalScore, 0); assert.equal(merged.impression, existing.impression); assert.equal(merged.review, existing.review);
  assert.equal(merged.bookReading, existing.bookReading); assert.equal(merged.bookDetails?.publisher, '我的出版社');
  assert.equal(merged.bookDetails?.translator, '来源译者'); assert.equal(merged.bookDetails?.isbn, '9780306406157');
  assert.equal(merged.bookDetails?.description, existing.bookDetails.description); assert.equal(merged.bookDetails?.doubanScore, 0);
  assert.deepEqual(merged.bookDetails?.readingSources, ['纸质书']);
  assert.deepEqual((merged.bookDetails as typeof existing.bookDetails).future, { version: 2 });
  assert.equal((merged as typeof existing).future, '保留');
  assert.equal(isValidSnapshot({ schemaVersion: 1, items: [merged] }), true);
});

test('新增书籍导入公开资料不自动生成阅读来源、个人评分、阅读状态或历史', () => {
  const added = applyMetadataCandidate(undefined, candidate);
  assert.equal(added.bookDetails?.publisher, '来源出版社'); assert.equal(added.bookDetails?.doubanScore, 8.6);
  assert.equal(added.bookDetails?.readingSources, undefined); assert.equal(added.personalScore, undefined);
  assert.equal(added.bookReading, undefined); assert.equal(added.experienceEntries, undefined); assert.equal(added.status, 'want');
  assert.throws(() => applyMetadataCandidate(undefined, { ...candidate, bookDetails: { doubanScore: 11 } }), /书籍资料/);
  assert.throws(() => applyMetadataCandidate(undefined, { ...candidate, bookDetails: { publisher: 123 } as never }), /书籍资料/);
});
