import { isScreenArrangement, isScreenExperienceEntry, isScreenProgress, isScreenViewingRound } from './screensValidation.ts';
import type { ExperienceEntry, MediaItem, ScreenArrangement, ScreenViewingRound } from './types.ts';

export type { ScreenArrangement, ScreenViewingRound } from './types.ts';
export type ScreenAction =
  | { type: 'arrangement'; value: ScreenArrangement }
  | { type: 'progress'; season?: number; episode?: number }
  | { type: 'round'; round: ScreenViewingRound; finishPlan?: boolean }
  | { type: 'remove-round'; id: string }
  | { type: 'entry'; entry: ExperienceEntry }
  | { type: 'remove-entry'; id: string };

export function screenArrangement(item: MediaItem): ScreenArrangement {
  if (item.category !== 'screen') return 'none';
  return item.screenViewing?.arrangement ?? (item.status === 'want' ? 'want' : item.status === 'active' ? 'watching' : item.status === 'paused' ? 'idle' : 'none');
}
export function screenHasWatched(item: MediaItem): boolean {
  return item.category === 'screen' && (item.status === 'finished' || screenRounds(item).length > 0);
}
export function screenRounds(item: MediaItem): ScreenViewingRound[] {
  return item.category === 'screen' ? item.screenViewing?.rounds ?? [] : [];
}
export function isScreenSeries(item: MediaItem): boolean {
  return item.category === 'screen' && /连续剧|番剧|剧集|电视剧|电视|series|tv|anime/i.test(item.subcategory);
}
export function screenProgressLabel(item: MediaItem): string {
  if (item.category !== 'screen' || !isScreenSeries(item)) return '';
  const progress = item.screenViewing?.progress;
  if (progress?.season === undefined && progress?.episode === undefined) return '进度未记录';
  return [progress?.season === undefined ? '' : `第 ${progress.season} 季`, progress?.episode === undefined ? '' : progress.episode === 0 ? '尚未开始' : `第 ${progress.episode} 集`].filter(Boolean).join(' · ');
}
export function validateScreenAction(value: unknown): value is ScreenAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const action = value as Record<string, unknown>;
  if (action.type === 'arrangement') return isScreenArrangement(action.value);
  if (action.type === 'progress') return isScreenProgress(action);
  if (action.type === 'round') return isScreenViewingRound(action.round) && (action.finishPlan === undefined || typeof action.finishPlan === 'boolean');
  if (action.type === 'entry') return isScreenExperienceEntry(action.entry);
  return ['remove-round', 'remove-entry'].includes(action.type as string) && typeof action.id === 'string' && action.id.trim().length > 0;
}
function same(left: object, right: object): boolean {
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].every(key => a[key] === b[key]);
}

/** Only explicit edits write extensions. Arrangement, completed viewings and logs never imply one another. */
export function applyScreenAction(item: MediaItem, action: ScreenAction, now: string): MediaItem {
  if (item.category !== 'screen' || item.removedAt || !validateScreenAction(action)) return item;
  const viewing = item.screenViewing ?? {};
  if (action.type === 'arrangement') {
    if (screenArrangement(item) === action.value) return item;
    return { ...item, screenViewing: { ...viewing, arrangement: action.value }, updatedAt: now };
  }
  if (action.type === 'progress') {
    if (!isScreenSeries(item)) return item;
    const progress = { ...viewing.progress, season: action.season, episode: action.episode };
    if (same(viewing.progress ?? {}, progress)) return item;
    return { ...item, screenViewing: { ...viewing, progress }, updatedAt: now };
  }
  if (action.type === 'round') {
    const rounds = screenRounds(item), previous = rounds.find(round => round.id === action.round.id);
    const round = { ...previous, ...action.round, finishedOn: action.round.finishedOn };
    const changed = !previous || !same(previous, round);
    const finish = action.finishPlan && screenArrangement(item) !== 'none';
    if (!changed && !finish) return item;
    const next = previous ? rounds.map(value => value.id === round.id ? round : value) : [...rounds, round];
    return { ...item, screenViewing: { ...viewing, rounds: changed ? next : rounds, ...(finish ? { arrangement: 'none' as const } : {}) }, updatedAt: now };
  }
  if (action.type === 'remove-round') {
    if (!screenRounds(item).some(round => round.id === action.id)) return item;
    return { ...item, screenViewing: { ...viewing, rounds: screenRounds(item).filter(round => round.id !== action.id) }, updatedAt: now };
  }
  const entries = item.experienceEntries ?? [];
  if (action.type === 'remove-entry') {
    if (!entries.some(entry => entry.id === action.id)) return item;
    return { ...item, experienceEntries: entries.filter(entry => entry.id !== action.id), updatedAt: now };
  }
  const previous = entries.find(entry => entry.id === action.entry.id), entry = { ...previous, ...action.entry, minutes: action.entry.minutes };
  if (previous && same(previous, entry)) return item;
  return { ...item, experienceEntries: previous ? entries.map(value => value.id === entry.id ? entry : value) : [...entries, entry], updatedAt: now };
}
