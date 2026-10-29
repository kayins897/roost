import { ARRANGEMENT_LABELS, arrangementOf, type Arrangement } from './book-classification';
import type { DeskProps } from './types';

export function BookArrangement({ state, dispatch, open, workId }: Pick<DeskProps, 'state' | 'dispatch' | 'open'> & { workId: string }) {
  const current = arrangementOf(state, workId);
  const hasRead = state.rounds.some(round => round.workId === workId);
  function choose(value: Arrangement) {
    if (value === current) return;
    if (value === 'read' && !hasRead) {
      open({ kind: 'round', workId, finishPlan: true });
      return;
    }
    dispatch({ type: 'arrangement', workId, value });
  }
  return <section className="rd-arrangement" aria-label="当前阅读安排">
    <header><span>当前安排</span><strong data-status={current}>{ARRANGEMENT_LABELS[current]}</strong></header>
    <div role="group" aria-label="修改阅读安排">
      {(Object.keys(ARRANGEMENT_LABELS) as Arrangement[]).map(value => <button
        key={value} data-status={value} aria-pressed={current === value}
        onClick={() => choose(value)}>{ARRANGEMENT_LABELS[value]}</button>)}
    </div>
    {current === 'idle' && <p>先放一放，之后随时可以继续。</p>}
    {current === 'abandoned' && <p>不再继续这次阅读。已有记录与感想仍会保留。</p>}
    {hasRead && current !== 'read' && <p>曾经读完 · 读后记录仍保留在「已读」中。</p>}
  </section>;
}
