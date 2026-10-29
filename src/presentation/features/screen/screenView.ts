import { screenRounds } from '../../../domain/screens.ts';
import { screenDisplayArrangement, type ScreenShelfView } from '../../../domain/screenConsumption.ts';
import { personalWritingFor } from '../../../domain/personalWriting.ts';
import type { MediaItem } from '../../../domain/types.ts';

export type ScreenView = ScreenShelfView;
export const FACETS = [{ id: 'director', label: '导演' }, { id: 'year', label: '年份' }, { id: 'score', label: '我的评分' }, { id: 'douban', label: '豆瓣评分' }, { id: 'source', label: '观看来源' }, { id: 'metadata', label: '资料来源' }, { id: 'favorite', label: '喜欢' }] as const;
export type FacetKey = typeof FACETS[number]['id'];
export type ScreenFacets = Partial<Record<FacetKey, string[]>>;
export type ScreenCommit = (transform: (current: import('../../../domain/types.ts').LibrarySnapshot) => import('../../../domain/types.ts').LibrarySnapshot, message?: string) => boolean;
export function screenId() { return crypto.randomUUID(); }
export function viewingLabel(item: MediaItem) {
  const arrangement = screenDisplayArrangement(item);
  return arrangement === 'none' ? '看过' : arrangement === 'watching' ? '在看' : '想看';
}
export function facetValues(item: MediaItem, key: FacetKey): string[] {
  if (key === 'director') return item.creator.trim() ? item.creator.split(/\s*\/\s*|[、，；;]/).filter(Boolean) : ['未记录'];
  if (key === 'year') return [item.year || '未记录'];
  if (key === 'score' || key === 'douban') { const score = key === 'score' ? item.personalScore : item.screenDetails?.doubanScore; return [score === undefined ? '未评分' : score >= 9 ? '9–10 分' : `${Math.floor(score)}–${Math.floor(score)}.9 分`]; }
  if (key === 'source') return item.screenDetails?.viewingSources?.length ? item.screenDetails.viewingSources : ['未记录'];
  if (key === 'favorite') return [item.favorite ? '已喜欢' : '未喜欢'];
  return [item.screenDetails?.metadataSource || (item.externalIds?.some(ref => ref.provider === 'douban') || item.sourceUrl?.includes('movie.douban.com') ? '豆瓣' : '手动收录')];
}
export function matchesScreen(item: MediaItem, query: string, tags: string[], facets: ScreenFacets) {
  const text = [item.title, item.originalTitle, item.creator, ...item.tags, personalWritingFor(item).impression, personalWritingFor(item).review, ...screenRounds(item).flatMap(round => [round.impression, round.review])].join(' ').toLocaleLowerCase();
  return text.includes(query.trim().toLocaleLowerCase()) && tags.every(tag => item.tags.some(value => value.toLocaleLowerCase() === tag.toLocaleLowerCase())) && FACETS.every(({ id }) => !facets[id]?.length || facets[id]!.some(value => facetValues(item, id).includes(value)));
}
export function latestFinishedOn(item: MediaItem) { return screenRounds(item).map(round => round.finishedOn ?? '').sort().at(-1) ?? ''; }
export function viewingMinutes(item: MediaItem): number | undefined { const entries = (item.experienceEntries ?? []).filter(entry => entry.minutes !== undefined); return entries.length ? entries.reduce((sum, entry) => sum + entry.minutes!, 0) : undefined; }
export function formatMinutes(value?: number) { return value === undefined ? '时长未记录' : value >= 60 ? `${Math.floor(value / 60)} 小时 ${value % 60} 分` : `${value} 分钟`; }
export function localDate() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
