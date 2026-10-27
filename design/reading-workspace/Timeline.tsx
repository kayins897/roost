import { ChevronDown, Pencil, ArrowUpRight, Clock3, CalendarDays } from 'lucide-react';
import type { Activity, Work } from './model';
import type { CalendarScale } from './periods';
import { activityLabel, dateLabel, minutesLabel, timelineGroups, type TimelineEntry } from './retrospective';
import { Cover } from './ui';
import './retrospective.css';

interface TimelineProps {
  activities: Activity[]; works: Work[]; scale: CalendarScale;
  openWork: (id: string) => void; editActivity: (entry: Activity) => void;
}

function EntryCard({ entry, openWork, editActivity }: Pick<TimelineProps, 'openWork' | 'editActivity'> & { entry: TimelineEntry }) {
  const notes = entry.records.map(record => record.note).filter(Boolean);
  return <article className={`rt-entry rt-entry--${entry.work.category}`} data-timeline-work={entry.work.id} data-timeline-date={entry.date ?? 'unknown'}>
    <span className="rt-node" aria-hidden="true"/>
    <div className="rt-card">
      <header className="rt-card-meta"><time>{dateLabel(entry.date)}</time><span>{entry.labels.join(' · ')}</span></header>
      <div className="rt-card-main"><button className="rt-cover-link" aria-label={`打开${entry.work.title}`} onClick={() => openWork(entry.work.id)}><Cover work={entry.work} small/></button>
        <div><button className="rt-title" onClick={() => openWork(entry.work.id)}>{entry.work.title}<ArrowUpRight size={13}/></button>
          <span className="rt-time"><Clock3 size={12}/>{minutesLabel(entry.minutes, entry.unknown)}</span>
          {notes[0] && <p className="rt-note">{notes[0]}</p>}
        </div>
      </div>
      <details className="rt-records"><summary>{entry.records.length > 1 ? `${entry.records.length} 条记录` : '查看记录'}<ChevronDown size={13}/></summary>
        <ul>{entry.records.map(record => <li key={record.id}><div><span>{activityLabel(record, entry.work)} · {minutesLabel(record.minutes)}</span>{record.note && <p>{record.note}</p>}</div>
          <button className="rw-icon-button" aria-label={`修改${entry.work.title}的${activityLabel(record, entry.work)}记录`} onClick={() => record.id.startsWith('round:') ? openWork(entry.work.id) : editActivity(record)}><Pencil size={13}/></button>
        </li>)}</ul>
      </details>
    </div>
  </article>;
}

export function Timeline({ activities, works, scale, openWork, editActivity }: TimelineProps) {
  const groups = timelineGroups(activities, works, scale);
  return <section className="rt-timeline" aria-label="体验时间轴">
    <header className="rt-heading"><div><p className="rw-eyebrow">留下来的片段</p><h2>时间里的作品</h2></div><span>{activities.length} 条经历</span></header>
    {!groups.length && <div className="rw-empty rt-empty"><CalendarDays size={28}/><p>这一段时间还没有记录</p><span>未完成的体验，也可以留下片段。</span></div>}
    {groups.map((group, index) => <details className="rt-group" key={group.id} open={groups.length <= 6 || index < 2}>
      <summary><span>{group.label}</span><small>{group.entries.length} 个片段</small><ChevronDown size={14}/></summary>
      <div className="rt-track">{group.entries.map(entry => <EntryCard key={entry.id} entry={entry} openWork={openWork} editActivity={editActivity}/>)}</div>
    </details>)}
  </section>;
}
