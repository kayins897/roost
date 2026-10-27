import { ACTIVITY_LABELS, type Activity, type GameTagGroupKey, type Work } from './model.ts';
import { calendarPeriod, type CalendarScale } from './periods.ts';

export interface TimelineEntry {
  id: string; date?: string; work: Work; records: Activity[];
  minutes?: number; unknown: number; labels: string[];
}
export interface TimelineGroup { id: string; label: string; entries: TimelineEntry[] }

export function dateLabel(date?: string): string {
  if (!date) return '日期未知';
  if (date.length === 4) return `${date} 年 · 日期未详`;
  if (date.length === 7) return `${Number(date.slice(5))} 月 · 日期未详`;
  return `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8))} 日`;
}

export function activityLabel(record: Activity, work: Work): string {
  return record.kind === 'completed' && work.category === 'book' ? '读完' : ACTIVITY_LABELS[record.kind];
}

function uniqueActivities(activities: Activity[]) {
  return [...new Map(activities.map(activity => [activity.id, activity])).values()];
}

export function timelineGroups(activities: Activity[], works: Work[], scale: CalendarScale): TimelineGroup[] {
  const workMap = new Map(works.map(work => [work.id, work]));
  const entries = new Map<string, TimelineEntry>();
  for (const record of uniqueActivities(activities)) {
    const work = workMap.get(record.workId);
    if (!work || work.category === 'music') continue;
    const id = `${record.date ?? 'unknown'}:${work.id}`;
    const entry = entries.get(id) ?? { id, date: record.date, work, records: [], minutes: undefined, unknown: 0, labels: [] };
    entry.records.push(record);
    if (record.minutes === undefined) entry.unknown++;
    else entry.minutes = (entry.minutes ?? 0) + record.minutes;
    const label = activityLabel(record, work);
    if (!entry.labels.includes(label)) entry.labels.push(label);
    entries.set(id, entry);
  }
  const groups = new Map<string, TimelineGroup>();
  const sorted = [...entries.values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.work.title.localeCompare(b.work.title, 'zh-CN'));
  for (const entry of sorted) {
    const date = entry.date;
    let id = date ?? 'unknown', label = dateLabel(date);
    if (date && scale === 'year' && date.length >= 7) { id = date.slice(0, 7); label = `${Number(date.slice(0, 4))} 年 ${Number(date.slice(5, 7))} 月`; }
    if (date?.length === 10 && scale === 'month') {
      const week = calendarPeriod(date, 'week');
      id = week.start; label = `${dateLabel(week.start)} — ${dateLabel(week.end)}`;
    }
    const group = groups.get(id) ?? { id, label, entries: [] };
    group.entries.push(entry); groups.set(id, group);
  }
  return [...groups.values()];
}

export interface TaggedGame { work: Work; minutes?: number; unknown: number; records: number }
export interface TagStat { id: string; label: string; games: TaggedGame[]; count: number; minutes?: number; unknown: number }
export interface TagSummary { tags: TagStat[]; games: TaggedGame[]; untagged: number }

export function gameTagStats(activities: Activity[], works: Work[], group: GameTagGroupKey): TagSummary {
  const gameMap = new Map(works.filter(work => work.category === 'game').map(work => [work.id, work]));
  const played = new Map<string, TaggedGame>();
  for (const record of uniqueActivities(activities)) {
    const work = gameMap.get(record.workId);
    if (!work) continue;
    const game = played.get(work.id) ?? { work, minutes: undefined, unknown: 0, records: 0 };
    game.records++;
    if (record.minutes === undefined) game.unknown++;
    else game.minutes = (game.minutes ?? 0) + record.minutes;
    played.set(work.id, game);
  }
  const tags = new Map<string, TagStat>();
  let untagged = 0;
  for (const game of played.values()) {
    const unique = new Map((game.work.gameTags?.[group] ?? []).map(label => [label.trim().toLocaleLowerCase(), label.trim()] as const).filter(([id]) => id));
    if (!unique.size) untagged++;
    for (const [id, label] of unique) {
      const stat: TagStat = tags.get(id) ?? { id, label, games: [], count: 0, minutes: undefined, unknown: 0 };
      stat.games.push(game); stat.count++;
      if (game.minutes !== undefined) stat.minutes = (stat.minutes ?? 0) + game.minutes;
      stat.unknown += game.unknown;
      tags.set(id, stat);
    }
  }
  return { tags: [...tags.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN')), games: [...played.values()], untagged };
}

export function minutesLabel(minutes?: number, unknown = 0): string {
  if (minutes === undefined) return '时长未记录';
  return `${minutes} 分钟${unknown ? ' · 部分未记录' : ''}`;
}
