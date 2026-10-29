import { isBookArrangement, isBookExperienceEntry, isBookReadingPlan, isBookReadingRound } from './booksValidation.ts';
import type { BookArrangement, BookReading, BookReadingPlan, BookReadingRound, ExperienceEntry, MediaItem } from './types.ts';

export type { BookArrangement, BookReadingPlan, BookReadingRound } from './types.ts';
export type BookAction =
  | { type: 'arrangement'; value: BookArrangement }
  | { type: 'plan'; reason: string; targetDate?: string; order?: number }
  | { type: 'round'; round: BookReadingRound; finishPlan?: boolean }
  | { type: 'remove-round'; id: string }
  | { type: 'entry'; entry: ExperienceEntry }
  | { type: 'remove-entry'; id: string };

/** Read-only legacy fallback. A finished book says nothing about the next reading plan. */
export function bookArrangement(item: MediaItem): BookArrangement {
  if (item.category !== 'book') return 'none';
  if (item.bookReading?.arrangement !== undefined) return item.bookReading.arrangement;
  if (item.status === 'want') return 'want';
  if (item.status === 'active') return 'reading';
  if (item.status === 'paused') return 'idle';
  return 'none';
}
export function bookHasRead(item: MediaItem): boolean {
  return item.category === 'book' && (item.status === 'finished' || bookRounds(item).length > 0);
}
export function bookRounds(item: MediaItem): BookReadingRound[] {
  return item.category === 'book' ? item.bookReading?.rounds ?? [] : [];
}
export function bookPlanFor(item: MediaItem): BookReadingPlan | undefined {
  return item.category === 'book' ? item.bookReading?.plan : undefined;
}

/** Known session durations only: never spread cumulative hours across calendar days. */
export function bookDuration(item: MediaItem): number | undefined {
  if (item.category !== 'book') return undefined;
  const known = (item.experienceEntries ?? []).filter(entry => entry.minutes !== undefined);
  return known.length ? known.reduce((sum, entry) => sum + entry.minutes!, 0) : undefined;
}
/** Callers choose visibility scope; trash is always excluded, hidden history is not destroyed. */
function readingBooks(items: MediaItem[]): MediaItem[] { return items.filter(item => item.category === 'book' && !item.removedAt); }
export function bookDailyMinutes(items: MediaItem[], date: string): { minutes?: number; hasRecords: boolean; unknown: boolean } {
  const entries = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? readingBooks(items).flatMap(item => item.experienceEntries ?? []).filter(entry => entry.date === date) : [];
  const known = entries.filter(entry => entry.minutes !== undefined);
  return { minutes: known.length ? known.reduce((sum, entry) => sum + entry.minutes!, 0) : undefined,
    hasRecords: entries.length > 0, unknown: entries.some(entry => entry.minutes === undefined) };
}
export function bookReadingSummary(items: MediaItem[]): { books: number; minutes?: number; unknownCount: number } {
  const books = readingBooks(items);
  const entries = books.flatMap(item => item.experienceEntries ?? []);
  const known = entries.filter(entry => entry.minutes !== undefined);
  return { books: new Set(books.filter(bookHasRead).map(item => item.id)).size,
    minutes: known.length ? known.reduce((sum, entry) => sum + entry.minutes!, 0) : undefined,
    unknownCount: entries.filter(entry => entry.minutes === undefined).length };
}

function shallowEqual(left: object, right: object): boolean {
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.every(key => a[key] === b[key]);
}
function withReading(item: MediaItem, reading: BookReading, now: string): MediaItem {
  return { ...item, bookReading: reading, updatedAt: now };
}

/** Explicit edits only. Old four-state values, reviews, scores and unrelated extensions are frozen. */
export function applyBookAction(item: MediaItem, action: BookAction, now: string): MediaItem {
  if (item.category !== 'book' || item.removedAt) return item;
  const reading = item.bookReading ?? {};
  if (action.type === 'arrangement') {
    if (!isBookArrangement(action.value) || bookArrangement(item) === action.value) return item;
    return withReading(item, { ...reading, arrangement: action.value }, now);
  }
  if (action.type === 'plan') {
    const plan = { ...reading.plan, reason: action.reason, targetDate: action.targetDate,
      ...(action.order === undefined ? {} : { order: action.order }) };
    if (!isBookReadingPlan(plan)) return item;
    if (reading.plan && shallowEqual(reading.plan, plan)) return item;
    // A first intention queues an unarranged book; writing reasons must not resume
    // an idle/abandoned book or downgrade an already active reading arrangement.
    const queue = !reading.plan && bookArrangement(item) === 'none';
    return withReading(item, { ...reading, plan, ...(queue ? { arrangement: 'want' } : {}) }, now);
  }
  if (action.type === 'round') {
    if (!isBookReadingRound(action.round)) return item;
    const rounds = bookRounds(item), previous = rounds.find(round => round.id === action.round.id);
    const round = { ...previous, ...action.round, finishedOn: action.round.finishedOn };
    const changed = !previous || !shallowEqual(previous, round);
    const finish = action.finishPlan && bookArrangement(item) !== 'none';
    if (!changed && !finish) return item;
    const next = previous ? rounds.map(value => value.id === round.id ? round : value) : [...rounds, round];
    return withReading(item, { ...reading, rounds: changed ? next : rounds, ...(finish ? { arrangement: 'none' } : {}) }, now);
  }
  if (action.type === 'remove-round') {
    const rounds = bookRounds(item);
    if (!rounds.some(round => round.id === action.id)) return item;
    return withReading(item, { ...reading, rounds: rounds.filter(round => round.id !== action.id) }, now);
  }
  const entries = item.experienceEntries ?? [];
  if (action.type === 'remove-entry') {
    if (!entries.some(entry => entry.id === action.id)) return item;
    return { ...item, experienceEntries: entries.filter(entry => entry.id !== action.id), updatedAt: now };
  }
  if (!isBookExperienceEntry(action.entry)) return item;
  const previous = entries.find(entry => entry.id === action.entry.id);
  const entry = { ...previous, ...action.entry, minutes: action.entry.minutes };
  if (previous && shallowEqual(previous, entry)) return item;
  return { ...item, experienceEntries: previous ? entries.map(value => value.id === entry.id ? entry : value) : [...entries, entry], updatedAt: now };
}
