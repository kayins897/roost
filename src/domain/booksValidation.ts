import { isPersonalScore } from './gameAssets.ts';
import { isCompletionDate } from './gameProgress.ts';
import type { BookArrangement, BookCollection, BookDetails, BookReading, BookReadingPlan, BookReadingRound, ExperienceEntry } from './types.ts';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function nonempty(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function optionalText(value: unknown): boolean { return value === undefined || typeof value === 'string'; }
function uniqueIds(values: { id: string }[]): boolean { return new Set(values.map(value => value.id)).size === values.length; }

export function isBookArrangement(value: unknown): value is BookArrangement {
  return typeof value === 'string' && ['want', 'reading', 'idle', 'abandoned', 'none'].includes(value);
}
export function isBookReadingPlan(value: unknown): value is BookReadingPlan {
  return record(value) && typeof value.reason === 'string' &&
    (value.targetDate === undefined || (typeof value.targetDate === 'string' && isCompletionDate(value.targetDate))) &&
    (value.order === undefined || (Number.isSafeInteger(value.order) && (value.order as number) >= 0));
}
export function isBookReadingRound(value: unknown): value is BookReadingRound {
  return record(value) && nonempty(value.id) && typeof value.impression === 'string' && typeof value.review === 'string' &&
    (value.finishedOn === undefined || (typeof value.finishedOn === 'string' && isCompletionDate(value.finishedOn)));
}
export function isBookReading(value: unknown): value is BookReading {
  return record(value) && (value.arrangement === undefined || isBookArrangement(value.arrangement)) &&
    (value.plan === undefined || isBookReadingPlan(value.plan)) &&
    (value.rounds === undefined || (Array.isArray(value.rounds) && value.rounds.every(isBookReadingRound) && uniqueIds(value.rounds)));
}
export function isBookDetails(value: unknown): value is BookDetails {
  return record(value) && ['translator', 'publisher', 'isbn', 'description', 'metadataSource'].every(key => optionalText(value[key])) &&
    (value.doubanScore === undefined || isPersonalScore(value.doubanScore)) &&
    (value.readingSources === undefined || (Array.isArray(value.readingSources) && value.readingSources.every(nonempty)));
}
export function isBookCollections(value: unknown): value is BookCollection[] {
  return Array.isArray(value) && value.every(collection => record(collection) && nonempty(collection.id) && nonempty(collection.title) &&
    typeof collection.description === 'string' && Array.isArray(collection.bookIds) && collection.bookIds.every(nonempty) &&
    new Set(collection.bookIds).size === collection.bookIds.length) && uniqueIds(value);
}
export function isBookTagCatalog(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonempty) && new Set(value.map(tag => tag.trim().toLocaleLowerCase())).size === value.length;
}
/** Keeps the existing month/day log contract; reading rounds alone allow year-only dates. */
export function isBookExperienceEntry(value: unknown): value is ExperienceEntry {
  return record(value) && nonempty(value.id) && typeof value.date === 'string' && /^\d{4}-\d{2}(?:-\d{2})?$/.test(value.date) &&
    isCompletionDate(value.date) && ['started', 'progress', 'completed', 'note'].includes(value.kind as string) && typeof value.note === 'string' &&
    (value.minutes === undefined || (Number.isSafeInteger(value.minutes) && (value.minutes as number) >= 0));
}
