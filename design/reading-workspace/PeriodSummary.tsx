import { ArrowUpRight, BookOpen, Clapperboard, Gamepad2, Music2 } from 'lucide-react';
import { CATEGORY_LABELS, type Activity, type Category, type Plan, type Work } from './model';
import { categoryStats, type Period } from './periods';

const icons = { book: BookOpen, game: Gamepad2, screen: Clapperboard, music: Music2 };
export function PeriodSummary({ period, activities, plans, works, filter, editPlan }: { period: Period; activities: Activity[]; plans: Plan[]; works: Work[]; filter: Category | 'all'; editPlan: (plan: Plan) => void }) {
  return <section className="cal-period-summary" aria-label="当前范围的记录与计划">
    <header><div><p className="rw-eyebrow">{period.label}</p><h2>这一段时间</h2></div><span className="rw-muted">实际记录与计划分别展示</span></header>
    <div className="cal-period-stats">{(['game', 'book', 'screen', 'music'] as const).filter(category => filter === 'all' || filter === category).map(category => {
      const stats = categoryStats(activities, works, category), Icon = icons[category];
      return <article className={`rw-card cal-period-stat cal-period-stat--${category}`} key={category} aria-label={`${CATEGORY_LABELS[category]}时长汇总`}><span><Icon size={17}/>{CATEGORY_LABELS[category]}<small>{stats.works} 部 · {stats.records} 条</small></span><strong>{stats.minutes === undefined ? '时长未记录' : <>{stats.minutes}<small> 分钟</small></>}</strong><p>{stats.unknown ? `另有 ${stats.unknown} 条未记时长` : stats.records ? '已知时长合计' : '尚无体验记录'}</p></article>;
    })}</div>
    <div className="rw-card cal-period-plans"><header><h3>这段时间的计划 <span>{plans.length}</span></h3><small className="rw-muted">不计入已体验时长</small></header>{plans.length ? <div>{plans.map(plan => <button key={plan.id} onClick={() => editPlan(plan)}><time>{plan.date?.slice(5).replace('-', '.')}</time><span>{works.find(work => work.id === plan.workId)?.title}<small>{plan.reason || '未填写计划说明'}</small></span><ArrowUpRight size={15}/></button>)}</div> : <p className="rw-muted">暂未安排，可以从日历选一天开始。</p>}</div>
  </section>;
}
