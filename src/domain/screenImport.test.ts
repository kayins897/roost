import assert from 'node:assert/strict';
import test from 'node:test';
import { createSteamImportItems, parseSteamImport, previewSteamImport, validateImportWork } from './steamImport.ts';
import { isValidSnapshot } from './library.ts';

test('影视 CSV 保留每行明确类型、完整资料及真实零值，不推断观看经历', () => {
  const parsed = parseSteamImport('\uFEFF片名,导演,年份,类型,演员,地区,片长,集数,标签,我的评分,豆瓣评分,观看来源,资料来源,链接\r\n合成电影,导演甲,2026,电影,演员甲；演员乙,甲地；乙地,0,0,科幻；探索,0,0,蓝光；影院,手动整理,https://movie.douban.com/subject/00042/?from=demo\r\n合成番剧,,,番剧,,,,,,,,,,\r\n合成剧集,,,连续剧,,,,,,,,,,', 'screen');
  assert.deepEqual(parsed.skipped, []);
  const items = createSteamImportItems(parsed.games);
  assert.deepEqual(items.map(item => item.subcategory), ['电影', '番剧', '连续剧']);
  assert.deepEqual(items[0].screenDetails, { actors: ['演员甲', '演员乙'], regions: ['甲地', '乙地'], durationMinutes: 0, episodeCount: 0, doubanScore: 0, viewingSources: ['蓝光', '影院'], metadataSource: '手动整理' });
  assert.equal(items[0].personalScore, 0); assert.equal(items[0].creator, '导演甲');
  assert.equal(items[0].sourceUrl, 'https://movie.douban.com/subject/42/');
  assert.equal(items[0].status, 'want'); assert.equal(items[0].screenViewing, undefined);
  assert.equal(items[0].experienceEntries, undefined); assert.equal(items[0].playtimeMinutes, undefined);
  assert.equal(items[1].screenDetails, undefined); assert.equal(items[1].personalScore, undefined);
  assert.equal(isValidSnapshot({ schemaVersion: 1, items }), true);
});

test('影视 TSV 允许表格复制与多行简介，提示未知列，不将看完日期和观看分钟当作历史', () => {
  const parsed = parseSteamImport('片名\t导演\t简介\t已看日期\t观看分钟\n"作品,续集"\t"导演""甲"\t"首行\n次行"\t2026-10-29\t120\n\t导演乙\t空片名\t\t\n末部\t导演丙\t简介\t\t', 'screen');
  assert.deepEqual(parsed.games.map(row => row.title), ['作品,续集', '末部']);
  assert.equal(parsed.games[0].creator, '导演"甲'); assert.equal(parsed.games[0].screenDetails?.description, '首行\n次行');
  assert.match(parsed.skipped[0].reason, /已看日期.*观看分钟.*不会/);
  assert.equal(parsed.skipped[1].row, 4);
  assert.equal(createSteamImportItems(parsed.games)[0].screenViewing, undefined);
});

test('影视表格逐行拒绝非法数字、带单位片长和题材误作类型，其余行可继续', () => {
  const parsed = parseSteamImport('片名,类型,片长,集数,我的评分,豆瓣评分\n有效,电影,120,1,8.5,9\n分钟文本,电影,120分钟,,,\n小数片长,电影,1.5,,,\n负数集数,连续剧,,-1,,\n非十进制,电影,0x10,,,\n非法评分,电影,,,11,\n多位小数,电影,,,,8.55\n错类型,动作,,,,\n未知资料,,,,,\n多列,,,,,,extra', 'screen');
  assert.deepEqual(parsed.games.map(row => row.title), ['有效', '未知资料']);
  assert.equal(parsed.skipped.length, 8);
  assert.ok(parsed.skipped.some(row => /影视类型/.test(row.reason)));
  assert.equal(parsed.games[1].screenDetails, undefined); assert.equal(parsed.games[1].subcategory, undefined);
  assert.throws(() => parseSteamImport('片名,名称\n甲,乙', 'screen'), /重复字段/);
  assert.throws(() => parseSteamImport('片名,导演\n"坏引号,甲', 'screen'), /未闭合/);
  assert.throws(() => parseSteamImport('导演\t地区\n甲\t乙', 'screen'), /片名.*表头/);
  assert.equal(parseSteamImport('Film, with a comma\nNext Film', 'screen').games[0].title, 'Film, with a comma');
  assert.throws(() => parseSteamImport('片名\n' + Array.from({ length: 2001 }, (_, i) => `作品${i}`).join('\n'), 'screen'), /2000/);
});

test('预览修正共用导入校验，清除未知输入并重新识别重复，不接受个人日志', () => {
  const draft = { category: 'screen', title: '初稿', subcategory: '番剧', personalScore: 0, screenDetails: { episodeCount: 12, future: 'ignore' }, review: '不接收', status: 'finished', experienceEntries: [] };
  const valid = validateImportWork(draft);
  assert.notEqual(typeof valid, 'string');
  if (typeof valid === 'string') throw new Error(valid);
  assert.equal((valid as unknown as Record<string, unknown>).review, undefined);
  assert.equal((valid as unknown as Record<string, unknown>).experienceEntries, undefined);
  assert.equal((valid.screenDetails as Record<string, unknown>).future, undefined);
  const existing = createSteamImportItems([{ title: '既有作品', category: 'screen' }]);
  const correction = validateImportWork({ ...valid, title: '既有作品' });
  assert.notEqual(typeof correction, 'string');
  if (typeof correction === 'string') throw new Error(correction);
  assert.equal(previewSteamImport([correction], existing)[0].duplicate, 'existing-name');
  assert.equal(typeof validateImportWork({ ...valid, screenDetails: { durationMinutes: -1 } }), 'string');
  assert.equal(typeof validateImportWork({ ...valid, sourceUrl: 'javascript:alert(1)' }), 'string');
  assert.equal(validateImportWork(null), '作品记录需要是对象');
});

test('影视普通 JSON 可使用导演与平铺资料，嵌套资料优先并拒绝非法对象', () => {
  const parsed = parseSteamImport(JSON.stringify({ screens: [{ title: 'JSON 电影', director: '导演甲', durationMinutes: 0, doubanScore: 8.5, actors: ['演员甲'], screenDetails: { actors: ['嵌套演员'] } }, { title: '错误资料', screenDetails: [] }] }), 'screen');
  assert.equal(parsed.games.length, 1); assert.equal(parsed.skipped.length, 1);
  assert.equal(parsed.games[0].creator, '导演甲');
  assert.deepEqual(parsed.games[0].screenDetails, { actors: ['嵌套演员'], durationMinutes: 0, doubanScore: 8.5 });
});
