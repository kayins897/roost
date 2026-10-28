import { bookArrangement, bookHasRead } from '../../../domain/books.ts';
import type { MediaItem } from '../../../domain/types.ts';

export const BOOK_VIEWS = [
  { id: 'all', label: '全部' }, { id: 'want', label: '想读' }, { id: 'reading', label: '在读' },
  { id: 'records', label: '已读' }, { id: 'idle', label: '闲置' }, { id: 'abandoned', label: '弃读' },
] as const;
export type BookView = typeof BOOK_VIEWS[number]['id'];
export type FacetKey = 'author' | 'publisher' | 'personal' | 'douban' | 'type' | 'readingSource' | 'metadataSource';
export type BookFacets = Partial<Record<FacetKey, string[]>>;
export const FACETS: { id: FacetKey; label: string }[] = [
  { id: 'author', label: '作者' }, { id: 'publisher', label: '出版社' },
  { id: 'personal', label: '我的评分' }, { id: 'douban', label: '豆瓣评分' },
  { id: 'type', label: '书籍类型' }, { id: 'readingSource', label: '阅读来源' }, { id: 'metadataSource', label: '资料来源' },
];
export function viewMatches(item: MediaItem, view: BookView) {
  return view === 'all' || (view === 'records' ? bookHasRead(item) : bookArrangement(item) === view);
}
export function readingLabel(item: MediaItem) {
  const value = bookArrangement(item);
  if (value === 'none') return bookHasRead(item) ? '已读' : '未安排';
  return BOOK_VIEWS.find(view => view.id === value)?.label ?? '想读';
}
function scoreFacet(value?: number) { return value === undefined ? '未评分' : `${Math.min(9, Math.floor(value))}–${Math.min(9, Math.floor(value)) === 9 ? '10' : Math.floor(value) + .9} 分`; }
export function facetValues(item: MediaItem, key: FacetKey): string[] {
  const details = item.bookDetails;
  switch (key) {
    case 'author': return [item.creator.trim() || '未记录'];
    case 'publisher': return [details?.publisher?.trim() || '未记录'];
    case 'personal': return [scoreFacet(item.personalScore)];
    case 'douban': return [scoreFacet(details?.doubanScore)];
    case 'type': return [item.subcategory.trim() || '未分类'];
    case 'readingSource': return details?.readingSources?.length ? details.readingSources : ['未记录'];
    case 'metadataSource': return [details?.metadataSource?.trim() || (item.externalIds?.some(id => id.provider === 'douban') ? '豆瓣' : '未记录')];
  }
}
export function matchesBook(item: MediaItem, query: string, tags: string[], facets: BookFacets) {
  const text = [item.title, item.originalTitle, item.creator, item.impression, item.review, ...item.tags, item.bookDetails?.publisher, item.bookDetails?.translator, item.bookReading?.plan?.reason, ...(item.bookReading?.rounds ?? []).flatMap(round => [round.impression, round.review])].join(' ').toLocaleLowerCase();
  return (!query.trim() || text.includes(query.trim().toLocaleLowerCase())) && tags.every(tag => item.tags.some(value => value.toLocaleLowerCase() === tag.toLocaleLowerCase())) &&
    FACETS.every(({ id }) => !facets[id]?.length || facets[id]!.some(value => facetValues(item, id).includes(value)));
}
export function formatMinutes(value?: number) {
  if (value === undefined) return '未记录';
  if (value < 60) return `${value} 分钟`;
  return `${Math.floor(value / 60)} 小时${value % 60 ? ` ${value % 60} 分钟` : ''}`;
}
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function bookId() { return crypto.randomUUID(); }
