import { ACTIVITY_LABELS, CATEGORY_LABELS, validDay, type Activity, type Plan, type Work } from './model';

export interface CalendarPeriodProps {
  date: string;
  activities: Activity[];
  plans: Plan[];
  works: Work[];
  onSelect: (day: string) => void;
  onMonth: (month: string) => void;
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

function groupByDay<T extends { date?: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  items.forEach(item => {
    if (item.date && validDay(item.date)) {
      groups.set(item.date, [...(groups.get(item.date) ?? []), item]);
    }
  });
  return groups;
}

function monthDays(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    offset,
    days: Array.from({ length: count }, (_, index) =>
      new Date(Date.UTC(year, month - 1, index + 1)).toISOString().slice(0, 10)),
  };
}

function activityName(activity: Activity, work?: Work) {
  return activity.kind === 'completed' && work?.category === 'book'
    ? '读完' : ACTIVITY_LABELS[activity.kind];
}

export function CalendarYearPanel({ date, activities, plans, onSelect, onMonth }: CalendarPeriodProps) {
  const year = Number(date.slice(0, 4));
  const recordsByDay = groupByDay(activities);
  const plansByDay = groupByDay(plans);

  return <section className="cal-period-year" aria-label={`${year} 年年度日历`}>
    <div className="cal-period-year-grid">
      {Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const { offset, days } = monthDays(year, month);
        const recordsCount = days.reduce((sum, day) => sum + (recordsByDay.get(day)?.length ?? 0), 0);
        const coarseCount = activities.filter(entry => entry.date === monthKey).length;
        const plansCount = days.reduce((sum, day) => sum + (plansByDay.get(day)?.length ?? 0), 0);

        return <article className="rw-card cal-period-mini-month cal-year-month" key={monthKey}>
          <header className="cal-period-mini-heading">
            <button type="button" onClick={() => onMonth(monthKey)} aria-label={`打开 ${year} 年 ${month} 月`}>
              <strong>{month}</strong><span>月</span><span aria-hidden="true">↗</span>
            </button>
            <span className="cal-period-mini-count">{recordsCount ? `${recordsCount} 条日级记录` : '无日级记录'}{coarseCount > 0 && ` · ${coarseCount} 条月份记录`}{plansCount > 0 && ` · ${plansCount} 项计划`}</span>
          </header>
          <div className="cal-period-mini-weekdays" aria-hidden="true">
            {WEEKDAYS.map(day => <span key={day}>{day}</span>)}
          </div>
          <div className="cal-period-mini-days" role="group" aria-label={`${month} 月日期`}>
            {Array.from({ length: offset }, (_, pad) => <span key={`pad-${pad}`} aria-hidden="true"/>)}
            {days.map(day => {
              const entries = recordsByDay.get(day) ?? [];
              const scheduled = plansByDay.get(day) ?? [];
              const label = `${year} 年 ${month} 月 ${Number(day.slice(8))} 日，${entries.length} 条记录，${scheduled.length} 项计划`;
              return <button type="button" key={day} data-period-day={day} data-year-day={day}
                className={day === date ? 'is-selected' : ''}
                tabIndex={day === date ? 0 : -1}
                aria-label={label} title={label} aria-pressed={day === date}
                onKeyDown={event => {
                  const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -7 : event.key === 'ArrowDown' ? 7 : 0;
                  if (!delta) return;
                  event.preventDefault();
                  const next = new Date(`${day}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + delta);
                  const nextDay = next.toISOString().slice(0, 10), calendar = event.currentTarget.closest('.cal-period-year');
                  onSelect(nextDay);
                  requestAnimationFrame(() => calendar?.querySelector<HTMLButtonElement>(`[data-year-day="${nextDay}"]`)?.focus());
                }}
                onClick={() => onSelect(day)}>
                <span>{Number(day.slice(8))}</span>
                <span className="cal-period-day-marks" aria-hidden="true">
                  {entries.length > 0 && <i className="cal-period-record-mark"/>}
                  {scheduled.length > 0 && <i className="cal-period-plan-mark"/>}
                </span>
              </button>;
            })}
          </div>
        </article>;
      })}
    </div>
    <footer className="cal-period-legend" aria-label="年度日期标记说明">
      <span><i className="cal-period-record-mark"/>实际记录</span>
      <span><i className="cal-period-plan-mark"/>计划</span>
      <span className="rw-muted">点日期查看当天，点月份展开月历。</span>
    </footer>
  </section>;
}

export function CalendarWeekPanel({ date, activities, plans, works, onSelect }: CalendarPeriodProps) {
  const selected = new Date(`${date}T00:00:00Z`);
  const mondayOffset = (selected.getUTCDay() + 6) % 7;
  const days = Array.from({ length: 7 }, (_, index) =>
    new Date(selected.getTime() + (index - mondayOffset) * 86400000).toISOString().slice(0, 10));
  const recordsByDay = groupByDay(activities);
  const plansByDay = groupByDay(plans);
  const workById = new Map(works.map(work => [work.id, work]));

  return <section className="cal-period-week" aria-label={`${days[0]} 至 ${days[6]} 每周日历`}>
    {days.map((day, index) => {
      const entries = recordsByDay.get(day) ?? [];
      const scheduled = plansByDay.get(day) ?? [];
      const empty = !entries.length && !scheduled.length;

      return <article className={`rw-card cal-period-week-day ${day === date ? 'is-selected' : ''}`} key={day}>
        <button type="button" className="cal-period-week-heading" data-period-day={day}
          onClick={() => onSelect(day)} aria-pressed={day === date}
          aria-label={`${day}，星期${WEEKDAYS[index]}，${entries.length} 条记录，${scheduled.length} 项计划，查看当天详情`}>
          <span>星期{WEEKDAYS[index]}</span>
          <strong>{Number(day.slice(8))}<small>{Number(day.slice(5, 7))} 月</small></strong>
          <span className="cal-period-week-open">查看这天 <span aria-hidden="true">↗</span></span>
        </button>
        {empty ? <p className="cal-period-week-empty">这一天<br/>暂未记录</p> : <div className="cal-period-week-content">
          {entries.length > 0 && <ul className="cal-period-entry-list" aria-label="实际记录">
            {entries.map(entry => {
              const work = workById.get(entry.workId);
              return <li className={`cal-period-week-entry cal-period-week-entry--${work?.category ?? 'other'}`} key={entry.id}>
                <span className="cal-period-entry-kind"><i className="cal-period-record-mark"/>{work ? `${CATEGORY_LABELS[work.category]} · ` : ''}{activityName(entry, work)}</span>
                <strong>{work?.title ?? '未关联作品'}</strong>
                <span className="cal-period-entry-duration">{entry.minutes === undefined ? '时长未记录' : `${entry.minutes} 分钟`}</span>
              </li>;
            })}
          </ul>}
          {scheduled.length > 0 && <ul className="cal-period-entry-list cal-period-entry-list--plans" aria-label="计划">
            {scheduled.map(plan => {
              const work = workById.get(plan.workId);
              return <li className="cal-period-week-plan" key={plan.id}>
                <span className="cal-period-entry-kind"><i className="cal-period-plan-mark"/>计划{work ? ` · ${CATEGORY_LABELS[work.category]}` : ''}</span>
                <strong>{work?.title ?? '未关联作品'}</strong>
                {plan.reason && <p>{plan.reason}</p>}
              </li>;
            })}
          </ul>}
        </div>}
      </article>;
    })}
  </section>;
}
