import { Heatmap } from '../reading-workspace/Heatmap';
import { ChevronDown, MoveHorizontal, Plus } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { PREVIEW_TODAY } from '../reading-workspace/seed';
import { durationLabel, readingSummary } from './catalog';
import type { DeskProps } from './types';

export function ReadingOverview({ state, open }: Pick<DeskProps, 'state' | 'open'>) {
  const summary = readingSummary(state);
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(true);
  const panelId = useId();
  return <div className="rd-reading-overview" ref={ref}>
    <header className="rd-overview-head">
      <button className="rd-overview-toggle" aria-expanded={expanded} aria-controls={panelId} aria-label={expanded ? '折叠阅读热力表' : '展开阅读热力表'} onClick={() => setExpanded(!expanded)}>
        <span><small>READING DAYS · {PREVIEW_TODAY.slice(0, 4)}</small><strong>阅读的痕迹</strong></span><ChevronDown size={17}/>
      </button>
      <div className="rd-overview-totals"><span>读过 <strong>{summary.books}</strong> 本</span><span>累计阅读 <strong>{durationLabel(summary.minutes)}</strong></span></div>
      <button className="rw-button" onClick={() => open({ kind: 'log', date: PREVIEW_TODAY })}><Plus size={16}/>登记阅读</button>
    </header>
    <div id={panelId} hidden={!expanded} className="rd-overview-content">
      <Heatmap state={state} today={PREVIEW_TODAY} showHeading={false} openDay={date => open({ kind: 'day', date })} logReading={(workId, date) => open({ kind: 'log', workId, date })}/>
      <div className="rd-heat-navigation"><span><MoveHorizontal size={13}/>横向查看全年</span><button onClick={() => ref.current?.querySelector('.bk-heat-scroll')?.scrollTo({ left: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}>回到年初</button></div>
    </div>
  </div>;
}
