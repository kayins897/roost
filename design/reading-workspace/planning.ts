import type { Plan, PlanPlacement } from './model';
import { calendarPeriod, type CalendarScale, type Period } from './periods.ts';

export type PlanningMode = 'seasons' | 'months' | 'stages' | 'weeks';
export interface PlanningSlot extends PlanPlacement { caption: string }
const iso = (date: Date) => date.toISOString().slice(0, 10);
const endOfMonth = (year: number, month: number) => iso(new Date(Date.UTC(year, month, 0)));
export const windowsOf = (placement: PlanPlacement) => placement.windows ?? [{ start: placement.start, end: placement.end }];
const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start <= b.end && a.end >= b.start;

export function planningSlots(date: string, scale: CalendarScale, mode: PlanningMode): PlanningSlot[] {
  const year = Number(date.slice(0, 4)), month = date.slice(0, 7), period = calendarPeriod(date, scale);
  if (scale === 'week') return [{ id: `week:${period.start}`, kind: 'week', ...period, caption: '先挑几部想体验的作品，哪天开始都可以。' }];
  if (scale === 'year' && mode === 'months') return Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`;
    return { id: `month:${m}`, kind: 'month', start: `${m}-01`, end: endOfMonth(year, i + 1), label: `${i + 1} 月`, caption: `${year} 年` };
  });
  if (scale === 'year') return [
    { id: `season:${year}:spring`, kind: 'season', start: `${year}-03-01`, end: `${year}-05-31`, label: '春季', caption: '3—5 月' },
    { id: `season:${year}:summer`, kind: 'season', start: `${year}-06-01`, end: `${year}-08-31`, label: '夏季', caption: '6—8 月' },
    { id: `season:${year}:autumn`, kind: 'season', start: `${year}-09-01`, end: `${year}-11-30`, label: '秋季', caption: '9—11 月' },
    { id: `season:${year}:winter`, kind: 'season', start: `${year}-01-01`, end: `${year}-12-31`, label: '冬季', caption: '本年 1—2 月、12 月', windows: [{ start: `${year}-01-01`, end: endOfMonth(year, 2) }, { start: `${year}-12-01`, end: `${year}-12-31` }] },
  ];
  if (mode === 'weeks') {
    const first = calendarPeriod(period.start, 'week');
    const slots: PlanningSlot[] = [];
    for (let start = first.start; start <= period.end;) {
      const week = calendarPeriod(start, 'week');
      slots.push({ id: `week:${week.start}`, kind: 'week', ...week, caption: `第 ${slots.length + 1} 周 · 自然周` });
      start = iso(new Date(new Date(`${start}T00:00:00Z`).getTime() + 7 * 86400000));
    }
    return slots;
  }
  return [['early', '月初', '01', '10'], ['middle', '月中', '11', '20'], ['late', '月末', '21', period.end.slice(8)]].map(([key, label, from, to]) => ({ id: `stage:${month}:${key}`, kind: 'stage', start: `${month}-${from}`, end: `${month}-${to}`, label, caption: `${Number(month.slice(5))} 月 ${Number(from)}—${Number(to)} 日` }));
}

// One active candidate per work. Earlier ranges are provenance, not duplicate tasks.
export function effectivePlacement(plan: Plan): PlanPlacement | undefined {
  if (plan.date) return { id: `day:${plan.date}`, kind: 'week', start: plan.date, end: plan.date, label: plan.date.replaceAll('-', '.') };
  return plan.placements?.at(-1);
}
export function placeCandidate(plan: Plan, slot: PlanPlacement): Plan {
  const previous = plan.placements ?? [];
  return { ...plan, date: undefined, placements: [...previous.filter(p => p.id !== slot.id), slot] };
}
export function candidateLocation(plan: Plan): string {
  const placement = effectivePlacement(plan);
  return placement ? plan.date ? placement.label : `${placement.start.slice(0, 4)} · ${placement.label}` : '未定时间';
}
export function partitionCandidates(plans: Plan[], period: Period, slots: PlanningSlot[]) {
  const buckets = new Map(slots.map(slot => [slot.id, [] as Plan[]]));
  const context: Plan[] = [], loose: Plan[] = [];
  for (const plan of plans) {
    const placement = effectivePlacement(plan);
    if (!placement) { loose.push(plan); continue; }
    const windows = windowsOf(placement);
    if (!windows.some(window => overlaps(window, period))) continue;
    const fits = windows.every(window => window.start >= period.start && window.end <= period.end);
    // A week straddling a month still belongs to a visible natural-week lane.
    const exactSlot = slots.find(slot => slot.id === placement.id);
    if (!fits && !exactSlot) { context.push(plan); continue; }
    const slot = exactSlot ?? slots.find(slot => windows.every(value => windowsOf(slot).some(window => window.start <= value.start && window.end >= value.end)));
    if (slot) buckets.get(slot.id)!.push(plan);
    else context.push(plan);
  }
  return { buckets, context, loose };
}
