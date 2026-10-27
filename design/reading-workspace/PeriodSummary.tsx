import { BookOpen, Clapperboard, Gamepad2 } from 'lucide-react';
import { CATEGORY_LABELS, type Activity, type Category, type Work } from './model';
import { categoryStats, type Period } from './periods';

const icons = { book: BookOpen, game: Gamepad2, screen: Clapperboard };
export function PeriodSummary({ period, activities, works, filter }: { period: Period; activities: Activity[]; works: Work[]; filter: Category | 'all' }) {
  return <section className="cl-stat-ribbon" aria-label={`${period.label}实际体验汇总`}>{(['game', 'book', 'screen'] as const).filter(category => filter === 'all' || filter === category).map(category => {
    const stats = categoryStats(activities, works, category), Icon = icons[category];
    return <article className={`cl-stat cl-stat--${category}`} key={category} aria-label={`${CATEGORY_LABELS[category]}时长汇总`}><span><Icon size={16}/>{CATEGORY_LABELS[category]}<small>{stats.works} 部</small></span><strong>{stats.minutes === undefined ? '时长未记录' : <>{stats.minutes}<small> 分钟</small></>}</strong><p>{stats.unknown ? `${stats.unknown} 条未记时长` : stats.records ? '已知时长合计' : '尚无体验记录'}</p></article>;
  })}</section>;
}
