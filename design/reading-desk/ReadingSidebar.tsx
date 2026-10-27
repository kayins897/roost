import { ArrowUpRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import { dailyMinutes, heatLevel, type Work } from '../reading-workspace/model';
import { PREVIEW_TODAY } from '../reading-workspace/seed';
import { durationLabel, readingSummary, tagCounts } from './catalog';
import type { DeskProps } from './types';

const DAY = 86400000;
const YEAR = Number(PREVIEW_TODAY.slice(0, 4));
const START = Date.UTC(YEAR, 0, 1);
const OFFSET = (new Date(START).getUTCDay() + 6) % 7;
const DAYS = Array.from({ length: (Date.UTC(YEAR + 1, 0, 1) - START) / DAY }, (_, index) => new Date(START + index * DAY).toISOString().slice(0, 10));

export function ReadingSidebar({ state, open, works, tag, setTag }: Pick<DeskProps, 'state' | 'open'> & { works: Work[]; tag: string; setTag: (tag: string) => void }) {
  const summary = readingSummary(state);
  const tags = tagCounts(works);
  const max = Math.max(1, ...tags.map(entry => entry.count));
  return <aside className="rd-record-sidebar">
    <section className="rd-footprints" aria-labelledby="rd-footprints-title">
      <header className="rd-section-head"><h2 id="rd-footprints-title">阅读足迹</h2><button className="rd-icon" aria-label="展开阅读足迹" onClick={() => open({ kind: 'heatmap' })}><ArrowUpRight size={17}/></button></header>
      <div className="rd-reading-totals"><span>读过 <strong>{summary.books}</strong> 本</span><span title={`${summary.unknown} 条阅读记录未填写时长；累计只包含已知分钟。`}>{durationLabel(summary.minutes)}</span></div>
      <button className="rd-mini-heatmap" aria-label={`查看 ${YEAR} 年每日阅读时长`} onClick={() => open({ kind: 'heatmap' })}>
        <span className="rd-heat-months" aria-hidden="true">{[1, 3, 5, 7, 9, 11].map(month => <span key={month}>{month}月</span>)}</span>
        <span className="rd-heat-days" style={{ '--columns': Math.ceil((OFFSET + DAYS.length) / 7) } as CSSProperties} aria-hidden="true">
          {Array.from({ length: OFFSET }, (_, index) => <span className="rd-heat-padding" key={`pad${index}`}/>)}
          {DAYS.map(date => {
            const minutes = dailyMinutes(state, date);
            return <span key={date} data-date={date} data-level={heatLevel(minutes)} data-known={minutes !== undefined} data-future={date > PREVIEW_TODAY} data-today={date === PREVIEW_TODAY}/>;
          })}
        </span>
      </button>
      <div className="rd-heat-legend"><span>{YEAR} 年</span><span>少 <i/><i/><i/><i/> 多</span></div>
    </section>
    <section className="rd-tag-panel" aria-labelledby="rd-tag-title">
      <header className="rd-section-head"><h2 id="rd-tag-title">标签词云</h2>{tag && <button className="rd-text-button" onClick={() => setTag('')}>清除</button>}</header>
      {tags.length ? <div className="rd-tag-cloud" aria-label="按已读书籍数量统计的标签">{tags.map(({ tag: value, count }, index) => <button
        key={value} className={tag === value ? 'is-active' : ''} aria-pressed={tag === value}
        aria-label={`${value}，${count} 本书`} title={`${value} · ${count} 本书，点击筛选`}
        style={{ '--tag-size': `${17 + 19 * count / max}px`, '--tag-color': ['#e7e9de', '#c1d5b4', '#d8bd85', '#90b6ad', '#bcb5ce'][index % 5] } as CSSProperties}
        onClick={() => setTag(tag === value ? '' : value)}>{value}</button>)}</div> : <p className="rd-empty">当前结果没有标签</p>}
      <span className="rd-cloud-caption">按当前搜索中的已读书籍数量</span>
    </section>
  </aside>;
}
