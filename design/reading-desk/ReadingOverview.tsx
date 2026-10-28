import { Heatmap } from '../reading-workspace/Heatmap';
import { MoveHorizontal } from 'lucide-react';
import { useRef } from 'react';
import { PREVIEW_TODAY } from '../reading-workspace/seed';
import { durationLabel, readingSummary } from './catalog';
import type { DeskProps } from './types';

export function ReadingOverview({ state, open }: Pick<DeskProps, 'state' | 'open'>) {
  const summary = readingSummary(state);
  const ref = useRef<HTMLDivElement>(null);
  return <div className="rd-reading-overview" ref={ref}>
    <div className="rd-overview-totals"><span>读过 <strong>{summary.books}</strong> 本</span><span>累计阅读 <strong>{durationLabel(summary.minutes)}</strong></span></div>
    <Heatmap state={state} today={PREVIEW_TODAY} openDay={date => open({ kind: 'day', date })} logReading={(workId, date) => open({ kind: 'log', workId, date })}/>
    <div className="rd-heat-navigation"><span><MoveHorizontal size={13}/>横向查看全年</span><button onClick={() => ref.current?.querySelector('.bk-heat-scroll')?.scrollTo({ left: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}>回到年初</button></div>
  </div>;
}
