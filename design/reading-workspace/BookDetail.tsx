import { useState } from 'react';
import { ArrowUpRight, BookOpen, CalendarDays, Check, Pencil, Plus } from 'lucide-react';
import type { BookDetailProps } from './contracts';
import type { ReadingRound } from './model';
import { Cover, Dialog } from './ui';
import { PlanForm, RoundForm, readingDate } from './BookForms';

type DetailEditor = { kind: 'plan' } | { kind: 'round'; round?: ReadingRound; finishPlan?: boolean } | null;

export function BookDetail({ work, state, dispatch, today, logReading, openDay, onClose }: BookDetailProps) {
  const [editor, setEditor] = useState<DetailEditor>(null);
  const plan = state.plans.find(item => item.workId === work.id);
  const rounds = state.rounds.filter(round => round.workId === work.id).sort((a, b) => (b.finishedOn ?? '').localeCompare(a.finishedOn ?? ''));
  const sessions = state.activities.filter(activity => activity.kind === 'reading' && activity.workId === work.id).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const closeEditor = () => setEditor(null);
  return <Dialog title={work.title} onClose={onClose} wide>
    <div className="bk-detail">
      <aside className="bk-detail-shelf"><Cover work={work}/><div className="bk-detail-byline"><span>{work.subtitle}</span><span className="rw-muted">{work.format} · {work.year}</span></div>
        <div className="bk-detail-actions">
          {plan?.state === 'reading' ? <button className="rw-button rw-button--primary" onClick={() => setEditor({ kind: 'round', finishPlan: true })}><Check size={16}/>完成本次阅读</button> : plan ? <button className="rw-button rw-button--primary" onClick={() => dispatch({ type: 'start', id: plan.id })}><BookOpen size={16}/>开始阅读</button> : <button className="rw-button rw-button--primary" onClick={() => setEditor({ kind: 'plan' })}><Plus size={16}/>{rounds.length ? '加入重读计划' : '加入阅读计划'}</button>}
          <button className="rw-button" onClick={() => logReading(work.id, today)}><Pencil size={16}/>登记阅读时长</button>
        </div>
        <section className="bk-detail-facts" aria-labelledby="bk-facts-title"><p className="bk-eyebrow">ABOUT THE BOOK</p><h3 id="bk-facts-title">作品资料</h3><dl><div><dt>作者</dt><dd>{work.subtitle}</dd></div><div><dt>初版年份</dt><dd>{work.year || '未记录'}</dd></div><div><dt>书籍类型</dt><dd>{work.format || '未记录'}</dd></div><div><dt>译者 / 出版社</dt><dd className="rw-muted">未记录</dd></div><div><dt>ISBN</dt><dd className="rw-muted">未记录</dd></div></dl><p className="bk-description">{work.description}</p><small className="rw-muted">合成书目资料 · 示意封面</small></section>
      </aside>
      <div className="bk-detail-personal">
        {plan && <section className="rw-card bk-detail-plan"><div className="bk-section-heading"><span className="rw-chip bk-reading-chip">{plan.state === 'reading' ? rounds.length ? '正在重读' : '正在阅读' : rounds.length ? '重读计划' : '阅读计划'}</span><button className="bk-text-button" onClick={() => setEditor({ kind: 'plan' })}><Pencil size={14}/>调整计划</button></div><p>{plan.reason || '还没有写下想读的理由。'}</p>{plan.date && <span className="bk-plan-date"><CalendarDays size={14}/>计划 {plan.date.replaceAll('-', '.')}</span>}</section>}
        <section className="bk-detail-history" aria-labelledby="bk-detail-history-title"><header className="bk-list-heading"><div><p className="bk-eyebrow">MY READING</p><h3 id="bk-detail-history-title">我的阅读与感想</h3></div><button className="bk-text-button" onClick={() => setEditor({ kind: 'round' })}><Plus size={15}/>补录已读</button></header>
          {rounds.length ? rounds.map((round, index) => <article className="rw-card bk-round-card" key={round.id}><header><div><span className="bk-round-number">READING {String(rounds.length - index).padStart(2, '0')}</span><p>{readingDate(round.finishedOn)}</p></div><button className="bk-icon-button" onClick={() => setEditor({ kind: 'round', round })} aria-label={`编辑《${work.title}》${readingDate(round.finishedOn)}的阅读记录`}><Pencil size={16}/></button></header><p className="bk-impression-label">一句话印象</p><blockquote>{round.impression || '还没有记录印象。'}</blockquote>{round.review ? <details className="bk-round-review" open={rounds.length === 1}><summary>读后感</summary><p>{round.review}</p></details> : <p className="bk-no-review rw-muted">读后感还空着，可以以后慢慢写。</p>}</article>) : <div className="rw-empty bk-empty"><BookOpen size={25}/><p>每次阅读，都可以留下自己的感想。</p><button className="rw-button" onClick={() => setEditor({ kind: 'round', finishPlan: plan?.state === 'reading' })}>{plan?.state === 'reading' ? '完成本次阅读' : '补录已读'}</button></div>}
        </section>
        {sessions.length > 0 && <section className="bk-detail-sessions" aria-labelledby="bk-sessions-title"><header className="bk-list-heading"><h3 id="bk-sessions-title">最近的阅读片刻</h3><span className="rw-muted">{sessions.length > 3 ? `最近 3 条 · 共 ${sessions.length} 条` : `${sessions.length} 条`}</span></header><div>{sessions.slice(0, 3).map(session => <article key={session.id}><div><span className="bk-session-date">{session.date ? session.date.replaceAll('-', '.') : '日期未知'}</span><strong>{session.minutes === undefined ? '时长未记录' : `${session.minutes} 分钟`}</strong>{session.note && <p>{session.note}</p>}</div>{session.date?.length === 10 && <button className="bk-icon-button" onClick={() => { openDay(session.date!); onClose(); }} aria-label={`在日历查看 ${session.date}`}><ArrowUpRight size={17}/></button>}</article>)}</div></section>}
      </div>
    </div>
    {editor?.kind === 'plan' && <PlanForm state={state} dispatch={dispatch} workId={work.id} onClose={closeEditor}/>}
    {editor?.kind === 'round' && <RoundForm state={state} dispatch={dispatch} workId={work.id} today={today} round={editor.round} finishPlan={editor.finishPlan} onClose={closeEditor}/>}
  </Dialog>;
}
