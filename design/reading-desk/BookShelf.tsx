import { BookOpen, Pencil } from 'lucide-react';
import { readingDate } from '../reading-workspace/BookForms';
import type { Work } from '../reading-workspace/model';
import { BookCover } from './BookCover';
import { latestRound } from './catalog';
import { ARRANGEMENT_LABELS, arrangementOf } from './book-classification';
import { FACES, type DeskProps, type Face, type Layout } from './types';

export function BookShelf({ state, open, works, face, layout, clearFilters }: Pick<DeskProps, 'state' | 'open'> & { works: Work[]; face: Face; layout: Layout; clearFilters: () => void }) {
  return <section className="rd-library-shelf" aria-label={`${FACES.find(value => value.id === face)?.label}的书`} data-face={face}>
    {works.length ? <div className={`rd-shelf rd-shelf--${layout} ${face === 'records' ? 'rd-history' : 'rd-plans'}`} data-layout={layout}>
      {works.map(work => {
        const plan = state.plans.find(plan => plan.workId === work.id);
        const latest = latestRound(state, work.id);
        const rounds = state.rounds.filter(round => round.workId === work.id);
        const current = arrangementOf(state, work.id);
        const reading = current === 'reading';
        return <article className={`rd-book ${reading ? 'is-reading' : ''}`} key={work.id} data-work-id={work.id} data-status={current} onContextMenu={event => { event.preventDefault(); open({ kind: 'tags', workId: work.id }); }}>
          <button className="rd-cover-link" aria-label={`查看《${work.title}》详情`} onClick={() => open({ kind: 'book', workId: work.id })}>
            <BookCover id={work.id} title={work.title} author={work.subtitle}/>
            {reading && <span className="rd-cover-status"><BookOpen size={11}/>{latest ? '重读中' : '在读'}</span>}
          </button>
          <div className="rd-book-copy"><div className="rd-book-meta">
            <button className="rd-title" onClick={() => open({ kind: 'book', workId: work.id })}><h3>{work.title}</h3></button>
            <p className="rd-author">{work.subtitle}</p>
            <p className={`rd-book-state ${reading ? 'is-reading' : ''}`} data-status={current}>{reading && latest ? '重读中' : ARRANGEMENT_LABELS[current]}</p>
            {face === 'records' && latest && <p className="rd-record-date">{readingDate(latest.finishedOn)}{rounds.length > 1 && <span> · {rounds.length} 次阅读</span>}</p>}
          </div>
          {face === 'records' || (!plan && latest) ? <blockquote>{latest?.impression || '还没有留下一句话。'}</blockquote> : <p className="rd-book-reason">{plan?.reason || (current === 'idle' ? '先收进书架，想读时再安排。' : '还没有写下想读的理由。')}</p>}
          </div>
          {reading && <button className="rd-book-log rd-icon" aria-label={`为《${work.title}》记一次阅读`} title="记一次阅读" onClick={() => open({ kind: 'log', workId: work.id })}><Pencil size={14}/></button>}
        </article>;
      })}
    </div> : <div className="rd-empty"><p>没有符合筛选的书籍</p><button className="rd-text-button" onClick={clearFilters}>清除搜索与筛选</button></div>}
  </section>;
}
