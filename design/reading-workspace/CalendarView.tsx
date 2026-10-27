import { ArrowLeft, ArrowRight, CalendarDays, Plus } from 'lucide-react';
import { useState } from 'react';
import type { WorkspaceProps } from './contracts';
import { CATEGORY_LABELS, dailyMinutes, type Activity, type Category } from './model';
import { calendarPeriod, inPeriod, shiftPeriod, type CalendarScale } from './periods';
import { PeriodSummary } from './PeriodSummary';
import { PlanningBoard } from './PlanningBoard';
import { CalendarNavigator } from './CalendarNavigator';
import { Timeline } from './Timeline';
import { GameTagCloud } from './GameTagCloud';

export interface CalendarProps extends WorkspaceProps {
  date: string; setDate: (value: string) => void;
  filter: Category | 'all'; setFilter: (value: Category | 'all') => void;
  editActivity: (entry?: Activity) => void;
}
export function CalendarView(props: CalendarProps) {
  const { state, today, date, setDate, filter, setFilter, query, editActivity, openWork } = props;
  const [scale, setScale] = useState<CalendarScale>('month');
  const [face, setFace] = useState<'review' | 'plan'>('review');
  const [navigator, setNavigator] = useState(false);
  const period = calendarPeriod(date, scale), todayMinutes = dailyMinutes(state, today);
  const works = new Map(state.works.map(work => [work.id, work]));
  const matches = (workId: string, note = '') => {
    const work = works.get(workId);
    return !!work && work.category !== 'music' && (filter === 'all' || work.category === filter) && `${work.title} ${note}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  };
  const activities: Activity[] = [
    ...state.activities.filter(activity => matches(activity.workId, activity.note)),
    ...state.rounds.filter(round => matches(round.workId, round.impression)).map(round => ({ id: `round:${round.id}`, workId: round.workId, date: round.finishedOn, kind: 'completed' as const, note: round.impression })),
  ];
  const periodActivities = activities.filter(activity => inPeriod(activity.date, period, scale));
  const undated = activities.filter(activity => !activity.date);
  const changeScale = (value: CalendarScale) => { setScale(value); setNavigator(false); };
  return <>
    <div className="rw-page-heading"><div><p className="rw-eyebrow">你的文娱日常</p><h1>日历</h1></div><div className="cl-face-switch" role="group" aria-label="日历内容"><button aria-pressed={face === 'review'} className={face === 'review' ? 'is-active' : ''} onClick={() => setFace('review')}>回顾</button><button aria-pressed={face === 'plan'} className={face === 'plan' ? 'is-active' : ''} onClick={() => setFace('plan')}>规划</button></div></div>
    <div className="cl-toolbar">
      <div className="cal-scale-switch" role="group" aria-label="日历视图">{([{ id: 'year', label: '年度' }, { id: 'month', label: '月度' }, { id: 'week', label: '每周' }] as const).map(view => <button key={view.id} aria-pressed={scale === view.id} className={scale === view.id ? 'is-active' : ''} onClick={() => changeScale(view.id)}>{view.label}</button>)}</div>
      <div className="cl-period-control"><button className="rw-icon-button" aria-label={scale === 'week' ? '上一周' : scale === 'year' ? '上一年' : '上个月'} onClick={() => setDate(shiftPeriod(date, scale, -1))}><ArrowLeft size={17}/></button><h2>{period.label}</h2><button className="rw-icon-button" aria-label={scale === 'week' ? '下一周' : scale === 'year' ? '下一年' : '下个月'} onClick={() => setDate(shiftPeriod(date, scale, 1))}><ArrowRight size={17}/></button></div>
      <div className="cl-toolbar-actions"><button className="rw-button" onClick={() => setDate(today)}>今天</button>{face === 'review' && <button className="rw-icon-button" aria-label="选择日期" aria-expanded={navigator} onClick={() => setNavigator(!navigator)}><CalendarDays size={18}/></button>}</div>
    </div>
    <div className="cl-filter-row"><div className="cal-filters" aria-label="日历媒体筛选">{(['all', 'game', 'book', 'screen'] as const).map(value => <button key={value} className={filter === value ? 'is-active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? '全部' : CATEGORY_LABELS[value]}</button>)}</div><span className="cl-today">今天阅读 {todayMinutes === undefined ? '时长未记录' : `${todayMinutes} 分钟`}</span></div>
    {face === 'plan' ? <PlanningBoard {...props} scale={scale}/> : <>
      {navigator && <CalendarNavigator date={date} scale={scale} activities={activities} works={state.works} setDate={setDate} setScale={changeScale} editActivity={editActivity} openWork={openWork}/>}
      <PeriodSummary period={period} activities={periodActivities} works={state.works} filter={filter}/>
      <div className="cl-review-layout"><section className="cl-story"><header className="cl-story-heading"><div><p className="rw-eyebrow">留下来的经历</p><h2>体验时间轴</h2></div><button className="rw-button" onClick={() => editActivity()}><Plus size={16}/>记录体验</button></header><Timeline activities={periodActivities} works={state.works} scale={scale} openWork={openWork} editActivity={editActivity}/></section>
      {(filter === 'all' || filter === 'game') && <GameTagCloud activities={periodActivities} works={state.works} periodLabel={period.label} openWork={openWork}/>}</div>
      {undated.length > 0 && <details className="cl-undated"><summary>日期未知的经历 <span>{undated.length}</span></summary><div>{undated.map(activity => <button key={activity.id} onClick={() => activity.id.startsWith('round:') ? openWork(activity.workId) : editActivity(activity)}><span>{works.get(activity.workId)!.title}</span><small>{activity.note || '保留原始记录'}</small></button>)}</div></details>}
    </>}
  </>;
}
