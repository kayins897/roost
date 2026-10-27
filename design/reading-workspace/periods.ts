import type { Activity, Category, Work } from './model';

export type CalendarScale = 'year' | 'month' | 'week';
export interface Period { start: string; end: string; label: string }
const iso = (value: Date) => value.toISOString().slice(0, 10);
export function calendarPeriod(date: string, scale: CalendarScale): Period {
  const [year, month, day] = date.split('-').map(Number);
  if (scale === 'year') return { start: `${year}-01-01`, end: `${year}-12-31`, label: `${year} 年` };
  if (scale === 'month') return { start: `${date.slice(0, 7)}-01`, end: iso(new Date(Date.UTC(year, month, 0))), label: `${year} 年 ${month} 月` };
  const start = new Date(Date.UTC(year, month - 1, day));
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
  return { start: iso(start), end: iso(end), label: `${iso(start).replaceAll('-', '.')} — ${iso(end).replaceAll('-', '.')}` };
}
export function shiftPeriod(date: string, scale: CalendarScale, delta: number): string {
  const [year, month, day] = date.split('-').map(Number);
  if (scale === 'week') return iso(new Date(Date.UTC(year, month - 1, day + 7 * delta)));
  const first = new Date(Date.UTC(year + (scale === 'year' ? delta : 0), month - 1 + (scale === 'month' ? delta : 0), 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return iso(first);
}
// Coarse dates belong only to ranges that can honestly contain their precision.
export function inPeriod(date: string | undefined, period: Period, scale: CalendarScale): boolean {
  if (!date) return false;
  if (date.length === 4) return scale === 'year' && date === period.start.slice(0, 4);
  if (date.length === 7) return scale !== 'week' && date >= period.start.slice(0, 7) && date <= period.end.slice(0, 7);
  return date.length === 10 && date >= period.start && date <= period.end;
}
export function categoryStats(activities: Activity[], works: Work[], category: Category) {
  const ids = new Set(works.filter(work => work.category === category).map(work => work.id));
  const records = activities.filter(activity => ids.has(activity.workId));
  const known = records.filter(activity => activity.minutes !== undefined);
  return { works: new Set(records.map(activity => activity.workId)).size, records: records.length, minutes: known.length ? known.reduce((sum, activity) => sum + activity.minutes!, 0) : undefined, unknown: records.length - known.length };
}
