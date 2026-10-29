import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDoubanPage } from './metadata.ts';

const url = 'https://book.douban.com/subject/42/';
function page(fields = '', schema: object = {}, extra = '') { return `<head><meta property="og:title" content="合成书籍"><script type="application/ld+json">${JSON.stringify(schema)}</script></head><h1>合成书籍</h1><div id="info">${fields}</div>${extra}`; }

test('豆瓣图书结构化资料包含作者译者出版社 ISBN 简介与公开评分，不产生私人字段', () => {
  const candidate = parseDoubanPage(page('', { '@type': 'Book', author: [{ name: '作者甲' }, { name: '作者乙' }], translator: { name: '译者甲' }, publisher: { name: '出版社甲' }, isbn: '9780306406157', datePublished: '2025-01', description: '合成 &amp; 简介', aggregateRating: { ratingValue: '8.6' } }), url);
  assert.equal(candidate.creator, '作者甲 / 作者乙'); assert.equal(candidate.year, '2025');
  assert.deepEqual(candidate.bookDetails, { translator: '译者甲', publisher: '出版社甲', isbn: '9780306406157', description: '合成 & 简介', doubanScore: 8.6, metadataSource: '豆瓣' });
  assert.equal(candidate.screenDetails, undefined);
  assert.equal((candidate as unknown as Record<string, unknown>).personalScore, undefined);
  assert.equal(candidate.bookDetails?.readingSources, undefined);
});

test('豆瓣图书 info 与内容简介兜底保留实际零分，空评分及缺失字段不冒充零', () => {
  const candidate = parseDoubanPage(page('<span>作者:</span>作者甲<br><span>译者:</span>译者甲 / 译者乙<br><span>出版社:</span>出版社甲<br><span>ISBN:</span>0-306-40615-2<br>', {}, '<strong property="v:average">0</strong><div id="link-report"><div class="intro"><p>首段内容。</p><p>次段内容。</p></div></div><div class="intro">作者简介不可误取</div>'), url);
  assert.equal(candidate.creator, '作者甲');
  assert.deepEqual(candidate.bookDetails, { translator: '译者甲 / 译者乙', publisher: '出版社甲', isbn: '0-306-40615-2', description: '首段内容。 次段内容。', doubanScore: 0, metadataSource: '豆瓣' });
  for (const rating of ['', '   ', '&nbsp;', 'NaN', '11', '8.55']) {
    const missing = parseDoubanPage(page('', {}, `<strong property="v:average">${rating}</strong><div class="intro">仅作者介绍</div>`), url);
    assert.equal(missing.bookDetails?.doubanScore, undefined); assert.equal(missing.bookDetails?.description, undefined);
    assert.equal(missing.bookDetails?.isbn, undefined);
  }
});

test('图书公开评分不会被影视字段污染，畸形可选 JSON-LD 可使用静态字段', () => {
  const candidate = parseDoubanPage('<head><script type="application/ld+json">{broken}</script></head><h1>合成资料</h1><div id="info"><span>出版社:</span>测试出版社<br></div><span property="v:summary">书籍简介 &amp; 示例</span>', url);
  assert.equal(candidate.bookDetails?.publisher, '测试出版社'); assert.equal(candidate.bookDetails?.description, '书籍简介 & 示例');
  assert.equal(candidate.screenDetails, undefined);
  assert.throws(() => parseDoubanPage('<h1>安全验证</h1>', url), /验证/);
});
