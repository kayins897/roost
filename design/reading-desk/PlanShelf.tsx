import { ArrowUpRight, Pencil } from 'lucide-react';
import type { Work } from '../reading-workspace/model';
import { BookCover } from './BookCover';
import { COLLECTIONS, matchesBook } from './catalog';
import type { DeskProps, Layout } from './types';
import { ViewToggle } from './ViewToggle';

export function CollectionCards({ state, open }: Pick<DeskProps, 'state' | 'open'>) {
  return <section className="rd-collections" aria-labelledby="rd-collections-title">
    <header className="rd-section-head"><h2 id="rd-collections-title">主题书单</h2><button className="rd-icon" aria-label="查看全部主题书单" onClick={() => open({ kind: 'collection' })}><ArrowUpRight size={17}/></button></header>
    {COLLECTIONS.map(collection => <button className="rd-collection" key={collection.id} onClick={() => open({ kind: 'collection', id: collection.id })}>
      <span><strong>{collection.title}</strong><small>{collection.bookIds.length} 本书</small></span>
      <span className="rd-collection-covers" aria-hidden="true">{collection.bookIds.slice(0, 3).map(id => {
        const work = state.works.find(work => work.id === id)!;
        return <BookCover key={id} id={id} title={work.title} author={work.subtitle}/>;
      })}</span>
    </button>)}
  </section>;
}

function CoverLink({ work, open }: { work: Work; open: DeskProps['open'] }) {
  return <button className="rd-cover-link" aria-label={`查看《${work.title}》详情`} onClick={() => open({ kind: 'book', workId: work.id })}><BookCover id={work.id} title={work.title} author={work.subtitle}/></button>;
}

export function PlanShelf({ state, open, query, layout, setLayout }: DeskProps & { query: string; layout: Layout; setLayout: (layout: Layout) => void }) {
  const ordered = [...state.plans].sort((a, b) => a.order - b.order);
  const visible = ordered.filter(plan => { const work = state.works.find(work => work.id === plan.workId); return work && matchesBook(state, work, query); });
  const reading = visible.filter(plan => plan.state === 'reading');
  const queued = visible.filter(plan => plan.state === 'queued');
  return <div data-face="plan">
    <section className="rd-reading" aria-labelledby="rd-reading-title">
      <header className="rd-section-head"><h2 id="rd-reading-title">正在阅读 <span>{reading.length}</span></h2></header>
      {reading.length ? <div className="rd-reading-grid">{reading.map((plan, index) => {
        const work = state.works.find(work => work.id === plan.workId)!;
        const reread = state.rounds.some(round => round.workId === work.id);
        return <article className={`rd-current ${index === 0 ? 'rd-current--lead' : ''}`} key={plan.id} data-work-id={work.id}>
          <CoverLink work={work} open={open}/>
          <div className="rd-current-copy"><span className="rd-reading-status"><i/>{reread ? '正在重读' : '正在阅读'}</span>
            <button className="rd-title" onClick={() => open({ kind: 'book', workId: work.id })}><h3>{work.title}</h3></button>
            <p className="rd-author">{work.subtitle}</p><p className="rd-current-reason">{plan.reason || '还没有写下想读的理由。'}</p>
            <button className={`rd-button ${index === 0 ? 'rd-button--primary' : ''}`} onClick={() => open({ kind: 'log', workId: work.id })}><Pencil size={15}/>记一次阅读</button>
          </div>
        </article>;
      })}</div> : <div className="rd-empty">{query ? '没有符合搜索的在读书籍' : '还没有在读的书'}</div>}
    </section>
    <div className="rd-plan-lower">
      <section className="rd-queue" aria-labelledby="rd-queue-title">
        <header className="rd-section-head"><h2 id="rd-queue-title">接下来读 <span>{queued.length}</span></h2><ViewToggle label="接下来读" value={layout} onChange={setLayout}/></header>
        {queued.length ? <div className={`rd-shelf rd-shelf--${layout}`} data-layout={layout}>{queued.map(plan => {
          const work = state.works.find(work => work.id === plan.workId)!;
          return <article className="rd-book" key={plan.id} data-work-id={work.id}>
            <CoverLink work={work} open={open}/>
            <div className="rd-book-copy"><button className="rd-title" onClick={() => open({ kind: 'book', workId: work.id })}><h3>{work.title}</h3></button><p className="rd-author">{work.subtitle}</p><p className="rd-book-reason">{plan.reason || '还没有写下想读的理由。'}</p></div>
          </article>;
        })}</div> : <div className="rd-empty">{query ? '没有符合搜索的待读书籍' : '待读清单还是空的'}</div>}
      </section>
      <CollectionCards state={state} open={open}/>
    </div>
  </div>;
}
