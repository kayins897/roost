import test from 'node:test';
import assert from 'node:assert/strict';
import { fillIntakeMetadata, intakeSubject } from './intakeMetadata.ts';
import type { MetadataCandidate } from './catalog.ts';
import { parseSteamImport, type SteamImportGame } from './steamImport.ts';

test('CSV/JSON 解析不能把豆瓣子页面规范为可读取作品链接', () => {
  for (const category of ['book', 'screen'] as const) {
    const host = category === 'book' ? 'book' : 'movie';
    const url = `https://${host}.douban.com/subject/123/other`;
    const csv = parseSteamImport(`${category === 'book' ? '书名' : '片名'},豆瓣链接\n合成名称,${url}`, category);
    const json = parseSteamImport(JSON.stringify({ format: 'qiyu.batch.v1', items: [{ title: '合成名称', category, sourceUrl: url }] }));
    for (const result of [csv, json]) {
      assert.equal(result.games.length, 1);
      assert.equal(result.games[0].sourceUrl, url);
      assert.equal(result.games[0].externalIds, undefined);
      assert.equal(intakeSubject(result.games[0]), undefined);
    }
    const ref = parseSteamImport(JSON.stringify({ format: 'qiyu.batch.v1', items: [{ title: '合成名称', category, externalIds: [{ provider: 'douban', id: '123', url }] }] }));
    assert.equal(ref.games.length, 0);
    assert.equal(ref.skipped.length, 1);
  }
});

const source = 'https://book.douban.com/subject/123/';
const candidate: MetadataCandidate = { title: '来源书名', category: 'book', provider: 'douban', externalId: '123', sourceUrl: source, creator: '来源作者', year: '2025', bookDetails: { publisher: '来源出版社', translator: '来源译者', isbn: '9787300000000', doubanScore: 8.1, description: '来源简介' } };

test('导入补资料只接受同板块确切豆瓣作品页，不以书名或ISBN搜索', () => {
  for (const url of ['https://example.com/subject/123/', 'https://book.douban.com/subject/123/other', 'https://me@book.douban.com/subject/123/', 'https://book.douban.com:8080/subject/123/', 'javascript:alert(1)']) assert.equal(intakeSubject({ title: '书', category: 'book', sourceUrl: url }), undefined);
  assert.equal(intakeSubject({ title: '书', category: 'book', sourceUrl: source + '?from=list#x' }), source);
  assert.equal(intakeSubject({ title: '书', category: 'book', sourceUrl: source, externalIds: [{ provider: 'douban', id: '456' }] }), undefined);
  assert.equal(intakeSubject({ title: '书', category: 'book', bookDetails: { isbn: '9787300000000' } }), undefined);
});

test('补齐预览保留人工名称作者、原有资料、零分及阅读来源，不添加个人经历', () => {
  const draft: SteamImportGame = { title: '我的书名', category: 'book', creator: '我的作者', sourceUrl: source, personalScore: 0, tags: ['收藏'], bookDetails: { doubanScore: 0, readingSources: ['纸质书'] } };
  const before = structuredClone(draft), next = fillIntakeMetadata(draft, candidate);
  assert.deepEqual(draft, before); assert.equal(next.title, draft.title); assert.equal(next.creator, draft.creator);
  assert.equal(next.personalScore, 0); assert.equal(next.bookDetails?.doubanScore, 0);
  assert.equal(next.bookDetails?.publisher, '来源出版社'); assert.deepEqual(next.bookDetails?.readingSources, ['纸质书']);
  assert.equal(next.year, '2025'); assert.deepEqual(next.tags, ['收藏']);
  assert.equal('bookReading' in next, false); assert.equal('experienceEntries' in next, false);
});

test('来源编号、板块或返回链接不符时不应用；影视片长0和个人评分不被覆盖', () => {
  const draft: SteamImportGame = { title: '书', category: 'book', sourceUrl: source };
  for (const changed of [{ externalId: '124' }, { category: 'screen' as const }, { sourceUrl: source.replace('123', '124') }]) assert.throws(() => fillIntakeMetadata(draft, { ...candidate, ...changed }), /不一致/);
  const film: SteamImportGame = { title: '电影', category: 'screen', sourceUrl: 'https://movie.douban.com/subject/456/', personalScore: 0, screenDetails: { durationMinutes: 0 } };
  const next = fillIntakeMetadata(film, { title: '来源片名', provider: 'douban', category: 'screen', externalId: '456', sourceUrl: film.sourceUrl!, screenDetails: { durationMinutes: 120, episodeCount: 0, actors: ['合成演员'] } });
  assert.equal(next.screenDetails?.durationMinutes, 0); assert.equal(next.screenDetails?.episodeCount, 0); assert.equal(next.personalScore, 0);
});
