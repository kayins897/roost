import { ArrowLeft, ArrowRight, CalendarDays, Plus, BookOpen, Gamepad2, Clapperboard, Music2, Pencil, ArrowUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { WorkspaceProps } from './contracts';
import { ACTIVITY_LABELS, CATEGORY_LABELS, type Activity, type Category, type Plan } from './model';

const icons = { book: BookOpen, game: Gamepad2, screen: Clapperboard, music: Music2 };
export function monthCells(month: string): string[] {
  const [year, m] = month.split('-').map(Number), first = new Date(Date.UTC(year, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => new Date(Date.UTC(year, m - 1, index + 1 - offset)).toISOString().slice(0, 10));
}
function changeMonth(month: string, delta: number) {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1 + delta, 1)).toISOString().slice(0, 7);
}
export interface CalendarProps extends WorkspaceProps {
  date: string; setDate: (value: string) => void; filter: Category | 'all'; setFilter: (value: Category | 'all') => void;
  editActivity: (entry?: Activity) => void; editPlan: (plan?: Plan) => void;
}
export function CalendarView(props: CalendarProps) {
  const { state, today, date, setDate, filter, setFilter, query, editActivity, editPlan, openWork } = props;
  const [month, setMonth] = useState(date.slice(0, 7));
  useEffect(() => setMonth(date.slice(0, 7)), [date]);
  const works = new Map(state.works.map(w => [w.id, w]));
  const matches = (workId: string, note = '') => {
    const work = works.get(workId);
    return !!work && (filter === 'all' || work.category === filter) && `${work.title} ${note}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  };
  const activities = state.activities.filter(a => matches(a.workId, a.note));
  const plans = state.plans.filter(p => matches(p.workId, p.reason));
  const dayEntries = activities.filter(a => a.date === date);
  const dayPlans = plans.filter(p => p.date === date);
  const imprecise = activities.filter(a => !a.date || a.date === month || a.date === month.slice(0, 4));
  const undatedPlans = plans.filter(p => !p.date);
  const monthCount = activities.filter(a => a.date?.startsWith(month) && a.date.length === 10).length;
  const [year, monthNumber] = month.split('-');
  const todayReading = state.activities.filter(a => a.date === today && a.kind === 'reading');
  const todayMinutes = todayReading.filter(a => a.minutes !== undefined).reduce((sum, a) => sum + a.minutes!, 0);
  return <>
    <div className="rw-page-heading"><div><p className="rw-eyebrow">你的文娱日常</p><h1>日历</h1><p className="rw-muted">经历留在时间里，喜欢也有下一次。</p></div><div className="rw-heading-actions"><button className="rw-button" onClick={() => editPlan()}><CalendarDays size={16}/>安排计划</button><button className="rw-button rw-button--primary" onClick={() => editActivity()}><Plus size={17}/>记录体验</button></div></div>
    <div className="cal-summary"><span>今天是 10 月 27 日，星期二</span><span>{todayReading.length ? <>已记录阅读 <strong>{todayMinutes} 分钟</strong></> : '今天的故事，等你留下。'}</span></div>
    <section className="cal-layout">
      <div className="rw-card cal-month">
        <header className="cal-month-heading"><h2>{year}<span>年</span> {Number(monthNumber)}<span>月</span></h2><div className="cal-month-buttons"><button className="rw-button" onClick={() => { setMonth(today.slice(0, 7)); setDate(today); }}>今天</button><button className="rw-icon-button" aria-label="上个月" onClick={() => setMonth(changeMonth(month, -1))}><ArrowLeft size={17}/></button><button className="rw-icon-button" aria-label="下个月" onClick={() => setMonth(changeMonth(month, 1))}><ArrowRight size={17}/></button></div></header>
        <div className="cal-filters" aria-label="日历媒体筛选">{(['all', 'game', 'book', 'screen', 'music'] as const).map(value => <button key={value} className={filter === value ? 'is-active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? '全部' : CATEGORY_LABELS[value]}</button>)}<span className="rw-muted">本月 {monthCount} 条经历</span></div>
        <div className="cal-weekdays" aria-hidden="true">{'一二三四五六日'.split('').map(day => <span key={day}>{day}</span>)}</div>
        <div className="cal-grid" role="group" aria-label={`${year}年${Number(monthNumber)}月日历`}>{monthCells(month).map(day => {
          const entries = activities.filter(a => a.date === day), scheduled = plans.filter(p => p.date === day);
          const count = entries.length + scheduled.length;
          return <button key={day} className={`cal-cell ${day.startsWith(month) ? '' : 'cal-cell--outside'} ${date === day ? 'is-selected' : ''} ${day === today ? 'is-today' : ''}`} aria-label={`${day}，${entries.length}条记录，${scheduled.length}项计划`} aria-pressed={date === day} onClick={() => setDate(day)} onKeyDown={event => {
            const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -7 : event.key === 'ArrowDown' ? 7 : 0;
            if (!delta) return;
            event.preventDefault();
            const next = new Date(`${day}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + delta); const nextDay = next.toISOString().slice(0, 10);
            setDate(nextDay); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-cal-day="${nextDay}"]`)?.focus());
          }} data-cal-day={day}><span className="cal-day-number">{Number(day.slice(-2))}</span><span className="cal-cell-events">{entries.slice(0, 2).map(entry => { const work = works.get(entry.workId)!; return <span className={`cal-event cal-event--${work.category}`} key={entry.id}><i/>{work.title}</span>; })}{scheduled.slice(0, Math.max(0, 2 - entries.length)).map(plan => <span className="cal-event cal-event--plan" key={plan.id}><i/>{works.get(plan.workId)!.title}</span>)}{count > 2 && <small>+{count - 2} 条</small>}</span>{count > 0 && <span className="cal-mobile-dots" aria-hidden="true">{entries.slice(0, 3).map(a => <i className={`cal-dot--${works.get(a.workId)!.category}`} key={a.id}/>)}{scheduled.length > 0 && <i className="cal-dot--plan"/>}</span>}</button>;
        })}</div>
        <footer className="cal-legend"><span><i className="cal-dot--book"/>阅读</span><span><i className="cal-dot--game"/>游戏</span><span><i className="cal-dot--screen"/>影视</span><span><i className="cal-dot--plan"/>计划</span></footer>
      </div>
      <aside className="rw-card cal-day-panel" aria-label="选中日期详情"><div className="cal-day-title"><div><p className="rw-eyebrow">{date === today ? '今天' : date > today ? '未来安排' : '这一天'}</p><h2>{Number(date.slice(5, 7))} 月 {Number(date.slice(8))} 日</h2></div><span className="rw-muted">{new Date(`${date}T00:00:00Z`).toLocaleDateString('zh-CN', { weekday: 'long', timeZone: 'UTC' })}</span></div>
        <div className="cal-day-list">{dayEntries.map(entry => { const work = works.get(entry.workId)!, Icon = icons[work.category]; return <article className="cal-day-entry" key={entry.id}><span className={`cal-entry-icon cal-entry-icon--${work.category}`}><Icon size={19}/></span><div><span className="rw-eyebrow">{ACTIVITY_LABELS[entry.kind]}{entry.minutes !== undefined ? ` · ${entry.minutes} 分钟` : ' · 时长未记录'}</span><button className="cal-work-link" onClick={() => openWork(work.id)}>{work.title}<ArrowUpRight size={13}/></button>{entry.note && <p>{entry.note}</p>}</div><button className="rw-icon-button" aria-label={`修改${work.title}的记录`} onClick={() => editActivity(entry)}><Pencil size={14}/></button></article>; })}
        {dayPlans.map(plan => <article className="cal-day-entry cal-day-entry--plan" key={plan.id}><span className="cal-entry-icon"><CalendarDays size={18}/></span><div><span className="rw-eyebrow">{plan.date! < today ? '未执行计划' : '计划'}</span><button className="cal-work-link" onClick={() => openWork(plan.workId)}>{works.get(plan.workId)!.title}</button><p>{plan.reason || '留给下一次体验。'}</p></div><button className="rw-icon-button" aria-label="修改计划" onClick={() => editPlan(plan)}><Pencil size={14}/></button></article>)}
        {!dayEntries.length && !dayPlans.length && <div className="rw-empty"><CalendarDays size={27}/><p>这一天还没有记录</p><span>可以补录经历，也可以留给未来。</span></div>}</div>
        <button className="rw-button cal-day-add" onClick={() => date > today ? editPlan({ id: '', workId: 'b1', date, state: 'queued', reason: '', order: 0 }) : editActivity()}><Plus size={16}/>{date > today ? '安排这一天' : '记下这一天'}</button>
      </aside>
    </section>
    <section className="cal-extra"><div className="rw-card cal-loose"><header><h3>尚未定日</h3><span className="rw-muted">{undatedPlans.length} 项计划</span></header>{undatedPlans.length ? <div className="cal-loose-plans">{undatedPlans.map(plan => <button key={plan.id} onClick={() => editPlan(plan)}><span className={`cal-loose-dot cal-dot--${works.get(plan.workId)!.category}`}/><span>{works.get(plan.workId)!.title}</span><small>{plan.state === 'reading' ? '在读' : '待安排'}</small><ArrowUpRight size={14}/></button>)}</div> : <p className="rw-muted">暂时没有未定日期的计划</p>}</div><div className="rw-card cal-loose"><header><h3>不必记得每一个日期</h3><span className="rw-muted">{imprecise.length} 条</span></header>{imprecise.length ? imprecise.slice(0, 4).map(a => <button className="cal-imprecise" key={a.id} onClick={() => editActivity(a)}><span>{works.get(a.workId)!.title}</span><small>{a.date || '日期未知'}</small></button>) : <p className="rw-muted">年月或日期未知的经历会留在这里。</p>}</div></section>
  </>;
}
