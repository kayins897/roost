import { GAME_GRADES } from './gameRating.ts';
import { engagementFor } from './gameProgress.ts';
import { isPersonalScore } from './gameAssets.ts';
import type { RankMode } from './gamePlanning.ts';
import type { MediaItem } from './types.ts';

export type LibrarySort = 'rank' | 'recent' | 'title' | 'year' | 'playtime';
export type SortDirection = 'asc' | 'desc';
export const defaultSortDirection = (sort: LibrarySort): SortDirection => sort === 'title' ? 'asc' : 'desc';
const finite = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
function numberFor(item: MediaItem, sort: LibrarySort, rankMode: RankMode) {
  if (sort === 'playtime') return finite(item.playtimeMinutes);
  if (sort === 'year') return /^\d{1,4}$/.test(item.year.trim()) && Number(item.year) > 0 ? Number(item.year) : undefined;
  if (sort === 'recent') return item.createdAt.trim() && Number.isFinite(Date.parse(item.createdAt)) ? Date.parse(item.createdAt) : undefined;
  if (rankMode === 'rating' && isPersonalScore(item.personalScore)) return item.personalScore;
  const grade = rankMode === 'rating' ? item.personalGrade : item.playPriority;
  const index = GAME_GRADES.findIndex(value => value === grade);
  // Historical letters remain a separate tail; they are never converted into numeric ratings.
  return index < 0 ? undefined : (rankMode === 'rating' ? -100 : 0) + GAME_GRADES.length - index;
}
function compareKnown(first: number | undefined, second: number | undefined, direction: SortDirection): number {
  if (first === undefined || second === undefined) return first === second ? 0 : first === undefined ? 1 : -1;
  return direction === 'asc' ? first - second : second - first;
}
/** Read-only derivation: missing values stay last in both directions; equal values retain input order. */
export function sortLibraryItems(items: readonly MediaItem[], { sort, direction, rankMode = 'priority', pausedLast = false }: { sort: LibrarySort; direction: SortDirection; rankMode?: RankMode; pausedLast?: boolean }): MediaItem[] {
  return items.map((item, index) => ({ item, index })).sort((a, b) => {
    const firstPaused = engagementFor(a.item) === 'paused', secondPaused = engagementFor(b.item) === 'paused';
    if (pausedLast && firstPaused !== secondPaused) return firstPaused ? 1 : -1;
    let difference: number;
    if (sort === 'title') {
      const first = a.item.title.trim(), second = b.item.title.trim();
      difference = !first || !second ? first === second ? 0 : !first ? 1 : -1 : first.localeCompare(second, 'zh-CN', { numeric: true, sensitivity: 'base' }) * (direction === 'asc' ? 1 : -1);
    } else difference = compareKnown(numberFor(a.item, sort, rankMode), numberFor(b.item, sort, rankMode), direction);
    return difference || a.index - b.index;
  }).map(entry => entry.item);
}
