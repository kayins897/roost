import type { Activity, Work } from './model';
import type { CalendarScale } from './periods';
import { CalendarWeekPanel, CalendarYearPanel } from './CalendarPeriodPanels';
import './calendar-periods.css';

export function monthCells(month: string): string[] {
  const [year, m] = month.split('-').map(Number), first = new Date(Date.UTC(year, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => new Date(Date.UTC(year, m - 1, index + 1 - offset)).toISOString().slice(0, 10));
}
interface Props { date: string; scale: CalendarScale; activities: Activity[]; works: Work[]; setDate: (value: string) => void; setScale: (value: CalendarScale) => void; editActivity: (activity: Activity) => void; openWork: (id: string) => void }
export function CalendarNavigator({ date, scale, activities, works, setDate, setScale, editActivity, openWork }: Props) {
  const common = { date, activities, works, plans: [], onSelect: setDate, onMonth: (value: string) => { setDate(`${value}-01`); setScale('month'); } };
  return <section className="cl-navigator rw-card" aria-label="日期浏览">
    <header><label>跳转日期<input aria-label="跳转日期" type="date" value={date} onChange={event => { if (event.target.value) setDate(event.target.value); }}/></label></header>
    {scale === 'year' ? <CalendarYearPanel {...common}/> : scale === 'week' ? <CalendarWeekPanel {...common}/> : <>
      <div className="cal-weekdays" aria-hidden="true">{'一二三四五六日'.split('').map(day => <span key={day}>{day}</span>)}</div>
      <div className="cal-grid" role="group" aria-label={`${date.slice(0, 7)}月日历`}>{monthCells(date.slice(0, 7)).map(day => {
        const entries = activities.filter(activity => activity.date === day);
        return <button key={day} className={`cal-cell ${date === day ? 'is-selected' : ''} ${day.slice(0, 7) === date.slice(0, 7) ? '' : 'cal-cell--outside'}`} data-cal-day={day} aria-label={`${day}，${entries.length}条记录`} aria-pressed={date === day} onClick={() => setDate(day)} onKeyDown={event => {
          const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -7 : event.key === 'ArrowDown' ? 7 : 0;
          if (!delta) return;
          event.preventDefault(); const next = new Date(`${day}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + delta); const value = next.toISOString().slice(0, 10);
          setDate(value); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-cal-day="${value}"]`)?.focus());
        }}><span className="cal-day-number">{Number(day.slice(8))}</span>{entries.length > 0 && <span className="cl-day-count">{entries.length} 条</span>}</button>;
      })}</div>
    </>}
    <div className="cl-date-records" aria-label="选中日期记录"><h3>{date.replaceAll('-', '.')}</h3>{activities.filter(activity => activity.date === date).map(activity => <button key={activity.id} onClick={() => activity.id.startsWith('round:') ? openWork(activity.workId) : editActivity(activity)}><strong>{works.find(work => work.id === activity.workId)?.title}</strong><span>{activity.minutes === undefined ? '时长未记录' : `${activity.minutes} 分钟`}</span></button>)}</div>
  </section>;
}
