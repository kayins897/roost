import assert from 'node:assert/strict';
import test from 'node:test';
import { bookArrangement, bookHasRead } from './books.ts';
import { isValidSnapshot } from './library.ts';
import { createSteamImportItems, parseSteamImport, previewSteamImport, STEAM_IMPORT_MAX_GAMES } from './steamImport.ts';

test('书名清单保持书籍板块，不把缺失资料或阅读经历当作已知值', () => {
  const parsed = parseSteamImport('\uFEFF山海之间\n\n下一次远行\n', 'book');
  assert.deepEqual(parsed.games, [{ title: '山海之间', category: 'book' }, { title: '下一次远行', category: 'book' }]);
  const items = createSteamImportItems(parsed.games);
  assert.equal(items[0].category, 'book'); assert.equal(bookArrangement(items[0]), 'want');
  assert.equal(bookHasRead(items[0]), false); assert.equal(items[0].experienceEntries, undefined);
  assert.equal(items[0].bookDetails, undefined); assert.equal(items[0].personalScore, undefined);
});

test('中文表头 CSV 导入已有书籍资料字段、两种评分与两种来源，保留实际零分', () => {
  const result = parseSteamImport('书名,作者,出版社,译者,ISBN,出版年份,简介,书籍类型,标签,我的评分,豆瓣评分,阅读来源,资料来源,豆瓣链接\r\n示例书,合成作者,合成出版社,合成译者,000123,2026,简介,文学,旅行；城市,0,8.6,纸质书；汉王,手动整理,https://book.douban.com/subject/00123/?from=demo', 'book');
  assert.deepEqual(result.skipped, []);
  const [item] = createSteamImportItems(result.games);
  assert.equal(item.creator, '合成作者'); assert.equal(item.year, '2026'); assert.equal(item.personalScore, 0);
  assert.deepEqual(item.tags, ['旅行', '城市']);
  assert.deepEqual(item.bookDetails, { publisher: '合成出版社', translator: '合成译者', isbn: '000123', description: '简介', doubanScore: 8.6, readingSources: ['纸质书', '汉王'], metadataSource: '手动整理' });
  assert.deepEqual(item.externalIds, [{ provider: 'douban', id: '123', url: 'https://book.douban.com/subject/123/' }]);
  assert.ok(isValidSnapshot({ schemaVersion: 1, items: [item] }));
});

test('表格正确处理逗号、双引号、多行简介、CRLF 与物理行号', () => {
  const result = parseSteamImport('书名,作者,简介\r\n"书名,续篇","作者""甲","第一行\r\n第二行"\r\n,作者乙,空书名\r\n末本,作者丙,正常', 'book');
  assert.equal(result.games[0].title, '书名,续篇'); assert.equal(result.games[0].creator, '作者"甲');
  assert.equal(result.games[0].bookDetails?.description, '第一行\n第二行');
  assert.equal(result.games[1].title, '末本'); assert.equal(result.skipped[0].row, 4);
});

test('TSV 可直接接受复制的表格，未知列明确提示且不会推断读完日期或时长', () => {
  const result = parseSteamImport('title\tauthor\tpublisher\t已读日期\t阅读分钟\n表格书\t作者\t出版社\t2026-10-28\t60', 'book');
  assert.equal(result.games[0].creator, '作者'); assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /已读日期.*阅读分钟/);
  const [item] = createSteamImportItems(result.games);
  assert.equal(item.experienceEntries, undefined); assert.equal(item.bookReading, undefined);
  assert.equal(bookHasRead(item), false);
});

test('书籍数组和 books 包装保留资料，不再落入游戏解析器', () => {
  const records = [{ title: 'JSON 书', creator: '作者', personalScore: 8.5, bookDetails: { publisher: '出版社' }, password: '不保存' }];
  for (const payload of [records, { books: records }]) {
    const result = parseSteamImport(JSON.stringify(payload), 'book');
    const [item] = createSteamImportItems(result.games);
    assert.equal(item.category, 'book'); assert.equal(item.creator, '作者');
    assert.equal(item.personalScore, 8.5); assert.equal(item.bookDetails?.publisher, '出版社');
    assert.equal((item as unknown as Record<string, unknown>).password, undefined);
  }
  assert.equal(parseSteamImport('[{"name":"备用名称"}]', 'book').games[0].title, '备用名称');
  const flat = parseSteamImport('[{"title":"书甲","author":"作者甲","publisher":"出版社甲","isbn":"9781234567897"}]', 'book').games[0];
  assert.equal(flat.creator, '作者甲'); assert.equal(flat.bookDetails?.publisher, '出版社甲');
  assert.equal(flat.bookDetails?.isbn, '9781234567897');
  assert.equal(parseSteamImport('[{"title":"坏资料","bookDetails":[]}]', 'book').skipped.length, 1);
});

test('书籍模式拒绝 Steam 包装和混入游戏的数组，原 GetOwnedGames 功能不变', () => {
  const payload = JSON.stringify({ response: { games: [{ appid: 123, name: '游戏', playtime_forever: 0 }] } });
  assert.throws(() => parseSteamImport(payload, 'book'), /Steam 库存/);
  assert.deepEqual(parseSteamImport(payload).games, [{ appId: '123', title: '游戏', playtimeMinutes: 0 }]);
  const mixed = parseSteamImport('[{"name":"正常书"},{"name":"游戏","appid":123},{"title":"电影","category":"screen"}]', 'book');
  assert.equal(mixed.games.length, 1); assert.equal(mixed.skipped.length, 2);
});

test('书籍表格逐行拒绝错误评分、列数与链接，不丢失其他有效记录', () => {
  const result = parseSteamImport('书名,我的评分,豆瓣评分,链接\n正常,8,0,https://example.com/book\n错评分,11,,\n错豆瓣,,8.55,\n错链接,,,javascript:alert(1)\n多列,,,,extra\n最后一本,0,,', 'book');
  assert.deepEqual(result.games.map(item => item.title), ['正常', '最后一本']);
  assert.deepEqual(result.skipped.map(item => item.row).sort(), [3, 4, 5, 6]);
  assert.throws(() => parseSteamImport('书名,名称\n一,二', 'book'), /重复字段/);
  assert.throws(() => parseSteamImport('书名,作者\n"未闭合,作者', 'book'), /未闭合/);
  assert.throws(() => parseSteamImport('作者\t出版社\n一\t二', 'book'), /书名.*表头/);
  assert.equal(parseSteamImport('书,与世界', 'book').games[0].title, '书,与世界');
  assert.deepEqual(parseSteamImport('A "Quoted" Life, 书名\n普通书', 'book').games.map(item => item.title), ['A "Quoted" Life, 书名', '普通书']);
  assert.deepEqual(parseSteamImport('书名\n小王子\n局外人', 'book').games.map(item => item.title), ['小王子', '局外人']);
  assert.equal(parseSteamImport('Author, Author\n普通书', 'book').games[0].title, 'Author, Author');
});

test('书籍去重沿用来源编号和保守同名规则，预览与再次导入都不覆盖旧书', () => {
  const [existing] = createSteamImportItems(parseSteamImport('书名,豆瓣链接\n原书,https://book.douban.com/subject/123/', 'book').games);
  existing.impression = '我的感想'; existing.review = '不可覆盖'; existing.personalScore = 0;
  const before = structuredClone(existing);
  const incoming = parseSteamImport('书名,作者,豆瓣链接\n其他译名,新作者,https://book.douban.com/subject/123/?from=list\n原书,不同作者,\n新书,,\n新书,,', 'book').games;
  const preview = previewSteamImport(incoming, [existing]);
  assert.deepEqual(preview.map(row => row.duplicate), ['existing-id', 'existing-name', null, 'source-name']);
  assert.deepEqual(existing, before);
  assert.equal(previewSteamImport(incoming, [existing], [{ provider: 'douban', id: '123' }])[0].duplicate, 'excluded');
});

test('批量 JSON 保留明确的板块，完整备份不会被当作追加清单', () => {
  const manifest = { format: 'qiyu.batch.v1', items: [{ title: '书', category: 'book', bookDetails: { publisher: '出版商' }, personalScore: 0 }, { title: '游戏', category: 'game' }] };
  const result = parseSteamImport(JSON.stringify(manifest), 'book');
  assert.deepEqual(result.games.map(item => item.category), ['book', 'game']);
  assert.equal(createSteamImportItems(result.games)[0].bookDetails?.publisher, '出版商');
  assert.throws(() => parseSteamImport('{"schemaVersion":1,"items":[]}', 'book'), /完整收藏备份/);
  assert.throws(() => parseSteamImport('书名,作者\n' + Array.from({ length: STEAM_IMPORT_MAX_GAMES + 1 }, (_, i) => `书${i},作者`).join('\n'), 'book'), /最多导入 2000/);
  const mismatch = parseSteamImport(JSON.stringify([{ title: '冲突', sourceUrl: 'https://book.douban.com/subject/123/', externalIds: [{ provider: 'douban', id: '456' }] }]), 'book');
  assert.match(mismatch.skipped[0].reason, /不一致/);
});
