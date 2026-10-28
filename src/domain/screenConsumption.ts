import { screenArrangement, screenHasWatched } from './screens.ts';
import type { MediaItem, ScreenArrangement } from './types.ts';

export const SCREEN_KINDS = [{ id: 'movie', label: '电影' }, { id: 'anime', label: '番剧' }, { id: 'series', label: '连续剧' }] as const;
export type ScreenKind = typeof SCREEN_KINDS[number]['id'];
export type ScreenShelfView = 'all' | 'want' | 'watching' | 'watched';
export type VisibleScreenArrangement = 'want' | 'watching' | 'none';

/** A read-only grouping: unknown legacy subtypes remain accessible in Movies. */
export function screenKind(item: Pick<MediaItem, 'subcategory'>): ScreenKind {
  if (/番剧|动漫|anime/i.test(item.subcategory)) return 'anime';
  if (/连续剧|剧集|电视剧|电视|series|\btv\b/i.test(item.subcategory)) return 'series';
  return 'movie';
}

export function screenShelves(kind: ScreenKind): { id: ScreenShelfView; label: string }[] {
  return [{ id: 'all', label: '全部' }, { id: 'want', label: '想看' }, ...(kind === 'movie' ? [] : [{ id: 'watching' as const, label: '在看' }]), { id: 'watched', label: '看过' }];
}

/** Legacy idle/abandoned values are retained on disk, never silently rewritten. */
export function screenDisplayArrangement(item: MediaItem): VisibleScreenArrangement {
  const arrangement = screenArrangement(item);
  if (arrangement === 'want') return 'want';
  if (screenKind(item) !== 'movie' && arrangement === 'watching') return 'watching';
  return screenHasWatched(item) ? 'none' : 'want';
}

export function matchesScreenShelf(item: MediaItem, kind: ScreenKind, view: ScreenShelfView): boolean {
  if (item.category !== 'screen' || screenKind(item) !== kind) return false;
  if (view === 'all') return true;
  if (view === 'watched') return screenHasWatched(item);
  return (view !== 'watching' || kind !== 'movie') && screenDisplayArrangement(item) === view;
}

export function screenArrangementOptions(item: Pick<MediaItem, 'subcategory'>): { value: ScreenArrangement; label: string }[] {
  return [{ value: 'want', label: '想看' }, ...(screenKind(item) === 'movie' ? [] : [{ value: 'watching' as const, label: '在看' }]), { value: 'none', label: '看过' }];
}
