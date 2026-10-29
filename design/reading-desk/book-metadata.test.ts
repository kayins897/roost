import test from 'node:test';
import assert from 'node:assert/strict';
import { facetOptions, facetValueLabel, matchesFacets, metadataOf, UNKNOWN_FACET_VALUE } from './book-metadata.ts';
import type { Work } from '../reading-workspace/model.ts';

const book = (id: string, subtitle = '作者甲', format?: string): Work => ({
  id, title: id, subtitle, format, category: 'book', tone: '#000', accent: '#fff', year: '', description: '',
});
const works = [book('b1', '甲'), book('b2', '乙'), book('b3', '丙'), book('b4', '丁'), book('b5', '甲'), book('b6', '乙'), book('b7', ''), book('b8', '丙')];

test('facet metadata remains independent and does not expose shared fixture arrays', () => {
  const before = JSON.stringify(works);
  const first = metadataOf(works[0]);
  assert.equal(first.personalScore, 9.4);
  assert.equal(first.doubanScore, 9.1);
  assert.deepEqual(first.readingSource, ['汉王电纸书', '纸质书']);
  assert.deepEqual(first.metadataSource, ['豆瓣']);
  first.readingSource.push('不应污染');
  assert.ok(!metadataOf(works[0]).readingSource.includes('不应污染'));
  assert.equal(JSON.stringify(works), before);
  assert.equal(metadataOf(book('new', ' 作者 ', '专业')).bookType, '专业');
  assert.equal(metadataOf(book('new', ' 作者 ')).author, '作者');
});

test('OR within facets and AND across facets, with skip counting independent of active choices', () => {
  const selected = { author: ['甲', '乙'], readingSource: ['纸质书'], metadataSource: ['豆瓣'] };
  assert.deepEqual(works.filter(work => matchesFacets(work, selected)).map(work => work.id), ['b1', 'b2', 'b6']);
  assert.ok(matchesFacets(works[2], { author: ['甲'], readingSource: ['汉王电纸书'] }, 'author'));
  assert.ok(matchesFacets(works[0], { author: [] }));
  assert.ok(!matchesFacets(works[2], selected));
});

test('unknown scores differ from recorded zero and personal scores never borrow external ratings', () => {
  assert.equal(metadataOf(works[3]).personalScore, 0);
  assert.equal(metadataOf(works[5]).personalScore, undefined);
  assert.equal(metadataOf(works[5]).doubanScore, 9);
  assert.ok(matchesFacets(works[3], { personalScore: ['score:0'] }));
  assert.ok(!matchesFacets(works[3], { personalScore: [UNKNOWN_FACET_VALUE] }));
  assert.ok(matchesFacets(works[5], { personalScore: [UNKNOWN_FACET_VALUE], doubanScore: ['score:9'] }));
});

test('score bands include both nine and ten, assign decimal boundaries, and sort descending', () => {
  assert.deepEqual(facetOptions(works, 'personalScore').map(option => [option.value, option.count]), [
    ['score:9', 2], ['score:8', 2], ['score:7', 1], ['score:0', 1], [UNKNOWN_FACET_VALUE, 2],
  ]);
  assert.deepEqual(facetOptions(works, 'doubanScore').map(option => [option.value, option.count]), [
    ['score:9', 3], ['score:8', 3], [UNKNOWN_FACET_VALUE, 2],
  ]);
  assert.equal(facetValueLabel('personalScore', 'score:9'), '9–10 分');
  assert.equal(facetValueLabel('personalScore', 'score:8'), '8–8.9 分');
});

test('unknown and empty scope remain recoverable and counts represent books rather than source entries', () => {
  assert.deepEqual(facetOptions([], 'publisher'), [{ value: UNKNOWN_FACET_VALUE, label: '未记录', count: 0 }]);
  assert.equal(facetOptions([works[0], works[0]], 'readingSource').find(option => option.value === '纸质书')?.count, 1);
  assert.equal(facetOptions(works, 'author').find(option => option.value === UNKNOWN_FACET_VALUE)?.count, 1);
  assert.ok(matchesFacets(works[6], { author: [UNKNOWN_FACET_VALUE], publisher: [UNKNOWN_FACET_VALUE] }));
  assert.equal(facetValueLabel('personalScore', UNKNOWN_FACET_VALUE), '未评分');
  assert.equal(facetValueLabel('doubanScore', UNKNOWN_FACET_VALUE), '未记录');
});
