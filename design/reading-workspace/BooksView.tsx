import { candidateLocation } from './planning';
import { useId, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, BookOpen, Check, Pencil, Plus } from 'lucide-react';
import type { WorkspaceProps } from './contracts';
import type { Plan, Work } from './model';
import { Cover } from './ui';
import { PlanForm, RoundForm, readingDate } from './BookForms';
import { Heatmap } from './Heatmap';

export function BooksView(props: WorkspaceProps) {
  const { state, dispatch, query, today, openWork } = props;
  const [face, setFace] = useState<'plan' | 'records'>('plan');
  const [form, setForm] = useState<'plan' | 'round' | null>(null);
  const switchId = useId();
  const books = state.works.filter(work => work.category === 'book');
  const search = query.trim().toLocaleLowerCase();
  const matches = (work: Work) => !search || [work.title, work.subtitle, work.format, work.description, ...state.plans.filter(plan => plan.workId === work.id).map(plan => plan.reason), ...state.rounds.filter(round => round.workId === work.id).flatMap(round => [round.impression, round.review])].join(' ').toLocaleLowerCase().includes(search);
  const bookPlans = state.plans.filter(plan => books.some(work => work.id === plan.workId));
  const reading = bookPlans.filter(plan => plan.state === 'reading').sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const queued = bookPlans.filter(plan => plan.state === 'queued').sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const history = books.filter(work => state.rounds.some(round => round.workId === work.id) && matches(work));
  const visibleReading = reading.filter(plan => matches(books.find(work => work.id === plan.workId)!));
  const visibleQueued = queued.filter(plan => matches(books.find(work => work.id === plan.workId)!));
  function readingCard(plan: Plan, index: number) {
    const work = books.find(book => book.id === plan.workId)!;
    const hasHistory = state.rounds.some(round => round.workId === work.id);
    return <article className={`rw-card bk-reading-card ${index === 0 ? 'bk-reading-card--first' : ''}`} key={plan.id}>
      <button className="bk-cover-link" onClick={() => openWork(work.id)} aria-label={`查看《${work.title}》详情`}><Cover work={work}/></button>
      <div className="bk-reading-copy"><span className="rw-chip bk-reading-chip"><span className="bk-reading-dot"/>{hasHistory ? '正在重读' : '正在阅读'}</span>
        <button className="bk-title-button" onClick={() => openWork(work.id)}><h3>{work.title}</h3></button><p className="bk-author rw-muted">{work.subtitle}</p>
        <p className="bk-plan-reason">{plan.reason || '把时间留给正在读的这一本。'}</p>
        <div className="bk-card-actions"><button className="rw-button rw-button--primary" onClick={() => props.logReading(work.id, today)}><Pencil size={15}/>记阅读</button><button className="bk-text-button" onClick={() => openWork(work.id)}>打开书页<ArrowRight size={15}/></button></div>
      </div>
    </article>;
  }
  return <div className="bk-view">
    <header className="bk-page-heading"><div className="bk-heading-title"><p className="bk-eyebrow">THE READING ROOM</p><h1>书籍<span className="bk-heading-mark" aria-hidden="true"> / </span></h1></div>
      <fieldset className="bk-view-switch"><legend className="bk-sr-only">书籍视图</legend>{(['plan', 'records'] as const).map(value => <label key={value} className={face === value ? 'is-active' : ''}><input type="radio" name={switchId} checked={face === value} onChange={() => setFace(value)}/><span>{value === 'plan' ? '阅读计划' : '阅读记录'}</span></label>)}</fieldset>
      <button className="rw-button bk-add-button" onClick={() => setForm(face === 'plan' ? 'plan' : 'round')}><Plus size={17}/>{face === 'plan' ? '加入计划' : '补录已读'}</button>
    </header>
    <Heatmap state={state} today={today} openDay={props.openDay} logReading={props.logReading}/>
    {face === 'plan' ? <div className="bk-plan-face" data-view="plan">
      <section aria-labelledby="bk-reading-title"><header className="bk-list-heading"><h2 id="bk-reading-title">正在阅读<span>{visibleReading.length}</span></h2><span className="rw-muted">留在手边的书</span></header>
        {visibleReading.length ? <div className="bk-reading-grid">{visibleReading.map(readingCard)}</div> : <div className="rw-empty bk-empty"><BookOpen size={24}/><p>{search ? '没有符合搜索的在读书籍。' : '还没有在读的书，从待读清单里挑一本吧。'}</p></div>}
      </section>
      <section aria-labelledby="bk-queue-title"><header className="bk-list-heading"><h2 id="bk-queue-title">接下来读<span>{visibleQueued.length}</span></h2><span className="rw-muted">{search ? '搜索时暂停排序，清除搜索后可调整。' : '按自己的节奏，调整先后。'}</span></header>
        {visibleQueued.length ? <div className="bk-queue-list">{visibleQueued.map(plan => {
          const work = books.find(book => book.id === plan.workId)!, index = queued.findIndex(item => item.id === plan.id), reread = state.rounds.some(round => round.workId === work.id);
          return <article className="rw-card bk-queue-card" key={plan.id}><span className="bk-order" aria-label={`待读第 ${index + 1} 本`}>{String(index + 1).padStart(2, '0')}</span>
            <button className="bk-cover-link bk-queue-cover" onClick={() => openWork(work.id)} aria-label={`查看《${work.title}》详情`}><Cover work={work} small/></button>
            <div className="bk-queue-copy"><div className="bk-queue-title"><button className="bk-title-button" onClick={() => openWork(work.id)}><h3>{work.title}</h3></button>{reread && <span className="rw-chip bk-reread-chip">重读</span>}</div><p className="bk-author rw-muted">{work.subtitle}<span> · {work.format}</span></p><p className="bk-queue-reason">{plan.reason || '还没写想读的理由。'}</p>{(plan.date || plan.placements?.length) && <span className="bk-plan-date">计划 {candidateLocation(plan)}</span>}</div>
            <div className="bk-queue-actions"><div className="bk-reorder" aria-label={`调整《${work.title}》顺序`}><button className="bk-icon-button" aria-label={`上移《${work.title}》`} title={search ? '清除搜索后可调整顺序' : '上移'} disabled={Boolean(search) || index === 0} onClick={() => dispatch({ type: 'move', id: plan.id, direction: -1 })}><ArrowUp size={16}/></button><button className="bk-icon-button" aria-label={`下移《${work.title}》`} title={search ? '清除搜索后可调整顺序' : '下移'} disabled={Boolean(search) || index === queued.length - 1} onClick={() => dispatch({ type: 'move', id: plan.id, direction: 1 })}><ArrowDown size={16}/></button></div><button className="rw-button" onClick={() => dispatch({ type: 'start', id: plan.id })}><BookOpen size={15}/>开始阅读</button></div>
          </article>;
        })}</div> : <div className="rw-empty bk-empty"><p>{search ? '没有符合搜索的待读计划。' : '待读清单是空的，给下一本书留个位置。'}</p>{!search && <button className="rw-button" onClick={() => setForm('plan')}><Plus size={16}/>加入计划</button>}</div>}
      </section>
    </div> : <section data-view="records" aria-labelledby="bk-history-title"><header className="bk-list-heading"><h2 id="bk-history-title">读过，留下的<span>{history.length}</span></h2><span className="rw-muted">每次阅读，都有不同的回声。</span></header>
      {history.length ? <div className="bk-history-grid">{history.map(work => {
        const rounds = state.rounds.filter(round => round.workId === work.id).sort((a, b) => (b.finishedOn ?? '').localeCompare(a.finishedOn ?? ''));
        const latest = rounds[0], plan = bookPlans.find(plan => plan.workId === work.id);
        return <article className="rw-card bk-history-card" key={work.id}><button className="bk-cover-link" onClick={() => openWork(work.id)} aria-label={`查看《${work.title}》阅读记录`}><Cover work={work}/></button><div className="bk-history-copy"><span className="bk-history-date"><Check size={14}/>{readingDate(latest.finishedOn)}</span><button className="bk-title-button" onClick={() => openWork(work.id)}><h3>{work.title}</h3></button><p className="bk-author rw-muted">{work.subtitle}</p><blockquote>{latest.impression || '这次阅读，还没有留下一句话。'}</blockquote>{latest.review && <details className="bk-review-preview"><summary>读后感</summary><p>{latest.review}</p></details>}<div className="bk-history-bottom">{plan ? <span className="rw-chip bk-reread-chip">{plan.state === 'reading' ? '正在重读' : '已安排重读'}</span> : <span className="rw-muted">{rounds.length} 次阅读</span>}<button className="bk-text-button" onClick={() => openWork(work.id)}>全部感想<ArrowUpRight size={15}/></button></div></div></article>;
      })}</div> : <div className="rw-empty bk-empty"><BookOpen size={25}/><p>{search ? '没有符合搜索的阅读记录。' : '把读过的书，和属于你的感想留在这里。'}</p>{!search && <button className="rw-button" onClick={() => setForm('round')}>补录已读</button>}</div>}
    </section>}
    {form === 'plan' && <PlanForm state={state} dispatch={dispatch} onClose={() => setForm(null)}/>}
    {form === 'round' && <RoundForm state={state} dispatch={dispatch} today={today} onClose={() => setForm(null)}/>}
  </div>;
}
