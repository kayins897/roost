import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDoubanPage } from './metadata.ts';

const url = 'https://movie.douban.com/subject/42/';
test('豆瓣空白实体与空 HTML 评分保持未知，真实零分保留', () => {
  for (const ratingValue of ['&nbsp;', '<span></span>', '   ']) {
    assert.equal(parseDoubanPage(page('', { '@type': 'Movie', aggregateRating: { ratingValue } }), url).screenDetails?.doubanScore, undefined);
  }
  assert.equal(parseDoubanPage(page('', { '@type': 'Movie', aggregateRating: { ratingValue: '0' } }), url).screenDetails?.doubanScore, 0);
});
function page(fields: string, schema: object = {}, summary = '') { return `<head><meta property="og:title" content="合成作品"><script type="application/ld+json">${JSON.stringify(schema)}</script></head><h1>合成作品</h1><div id="info">${fields}</div>${summary}`; }

test('豆瓣影视结构化资料解析演员、地区、片长、公开评分和简介，不误作私人记录', () => {
  const result = parseDoubanPage(page('', { '@type': 'Movie', actor: [{ name: '演员甲' }, { name: '演员乙' }], countryOfOrigin: [{ name: '甲地' }, { name: '乙地' }], duration: 'PT2H3M', description: '安全 &amp; 温柔的故事', aggregateRating: { ratingValue: '8.6' } }), url);
  assert.deepEqual(result.screenDetails, { actors: ['演员甲', '演员乙'], regions: ['甲地', '乙地'], durationMinutes: 123, doubanScore: 8.6, description: '安全 & 温柔的故事', metadataSource: '豆瓣' });
  assert.equal(result.category, 'screen'); assert.equal(result.subcategory, '电影');
  assert.equal((result as unknown as Record<string, unknown>).personalScore, undefined);
});

test('豆瓣影视 info 兜底保留番剧和集数，空评分与未知片长不冒充零', () => {
  const fields = '<span>类型:</span> 动画 / 科幻<br><span>主演:</span> 甲 / 乙<br><span>制片国家/地区:</span> 甲地 / 乙地<br><span>集数:</span>12<br><span>单集片长:</span>24分钟<br>';
  const result = parseDoubanPage(page(fields, {}, '<strong property="v:average">9.2</strong><span property="v:summary">一段<br>剧情 &amp; 简介</span>'), url);
  assert.equal(result.subcategory, '番剧'); assert.equal(result.screenDetails?.episodeCount, 12); assert.equal(result.screenDetails?.durationMinutes, 24);
  assert.equal(result.screenDetails?.doubanScore, 9.2); assert.equal(result.screenDetails?.description, '一段 剧情 & 简介');
  const missing = parseDoubanPage(page('<span>片长:</span> 尚未公布<br>', {}, '<strong property="v:average"> </strong>'), url);
  assert.equal(missing.screenDetails?.durationMinutes, undefined); assert.equal(missing.screenDetails?.doubanScore, undefined);
  const book = parseDoubanPage(page(''), 'https://book.douban.com/subject/42/'); assert.equal(book.screenDetails, undefined);
});
