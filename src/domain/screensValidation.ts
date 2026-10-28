import { isPersonalScore } from './gameAssets.ts';
import { isCompletionDate } from './gameProgress.ts';
import type { ExperienceEntry, ScreenArrangement, ScreenCollection, ScreenDetails, ScreenProgress, ScreenViewing, ScreenViewingRound } from './types.ts';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const texts = (value: unknown): value is string[] => Array.isArray(value) && value.every(nonempty);
const integer = (value: unknown, min: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
const uniqueIds = (values: { id: string }[]) => new Set(values.map(value => value.id)).size === values.length;

export function isScreenArrangement(value: unknown): value is ScreenArrangement {
  return typeof value === 'string' && ['want', 'watching', 'idle', 'abandoned', 'none'].includes(value);
}
export function isScreenProgress(value: unknown): value is ScreenProgress {
  return record(value) && (value.season === undefined || integer(value.season, 1)) &&
    (value.episode === undefined || integer(value.episode, 0));
}
export function isScreenViewingRound(value: unknown): value is ScreenViewingRound {
  return record(value) && nonempty(value.id) && typeof value.impression === 'string' && typeof value.review === 'string' &&
    (value.finishedOn === undefined || (typeof value.finishedOn === 'string' && isCompletionDate(value.finishedOn)));
}
export function isScreenViewing(value: unknown): value is ScreenViewing {
  return record(value) && (value.arrangement === undefined || isScreenArrangement(value.arrangement)) &&
    (value.progress === undefined || isScreenProgress(value.progress)) &&
    (value.rounds === undefined || (Array.isArray(value.rounds) && value.rounds.every(isScreenViewingRound) && uniqueIds(value.rounds)));
}
export function isScreenDetails(value: unknown): value is ScreenDetails {
  return record(value) && ['actors', 'regions', 'viewingSources'].every(key => value[key] === undefined || texts(value[key])) &&
    ['description', 'metadataSource'].every(key => value[key] === undefined || typeof value[key] === 'string') &&
    (value.durationMinutes === undefined || integer(value.durationMinutes, 0)) &&
    (value.episodeCount === undefined || integer(value.episodeCount, 0)) &&
    (value.doubanScore === undefined || isPersonalScore(value.doubanScore));
}
export function isScreenCollections(value: unknown): value is ScreenCollection[] {
  return Array.isArray(value) && value.every(collection => record(collection) && nonempty(collection.id) && nonempty(collection.title) &&
    typeof collection.description === 'string' && texts(collection.screenIds) && new Set(collection.screenIds).size === collection.screenIds.length) && uniqueIds(value);
}
export function isScreenTagCatalog(value: unknown): value is string[] {
  return texts(value) && new Set(value.map(tag => tag.trim().toLocaleLowerCase())).size === value.length;
}
/** Logs retain the existing month/day contract; only completed viewings permit year-only dates. */
export function isScreenExperienceEntry(value: unknown): value is ExperienceEntry {
  return record(value) && nonempty(value.id) && typeof value.date === 'string' && /^\d{4}-\d{2}(?:-\d{2})?$/.test(value.date) &&
    isCompletionDate(value.date) && ['started', 'progress', 'completed', 'note'].includes(value.kind as string) && typeof value.note === 'string' &&
    (value.minutes === undefined || integer(value.minutes, 0));
}
