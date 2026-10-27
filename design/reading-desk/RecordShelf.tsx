import { X } from 'lucide-react';
import { readingDate } from '../reading-workspace/BookForms';
import { BookCover } from './BookCover';
import { BOOK_TAGS, latestRound, matchesBook } from './catalog';
import { ReadingSidebar } from './ReadingSidebar';
import type { DeskProps, Layout } from './types';
import { ViewToggle } from './ViewToggle';

export function RecordShelf({ state, open, query, tag, setTag, layout, setLayout }: DeskProps & { query: string; tag: string; setTag: (tag: string) => void; layout: Layout; setLayout: (layout: Layout) => void }) {
  const all = state.works.filter(work => latestRound(state, work.id) && matchesBook(state, work, query))
    .sort((a, b) => (latestRound(state, b.id)?.finishedOn ?? '').localeCompare(latestRound(state, a.id)?.finishedOn ?? ''));
  const visible = tag ? all.filter(work => BOOK_TAGS[work.id]?.includes(tag)) : all;
  return <div className="rd-record-layout" data-face="records">
    <section className="rd-records" aria-labelledby="rd-records-title">
      <header className="rd-section-head"><h2 id="rd-records-title">读过的书 <span>{visible.length}</span></h2><ViewToggle label="阅读记录" value={layout} onChange={setLayout}/></header>
      {tag && <button className="rd-filter" onClick={() => setTag('')} aria-label={`清除标签筛选：${tag}`}><span>标签：{tag}</span><X size={13}/></button>}
      {visible.length ? <div className={`rd-shelf rd-shelf--${layout} rd-history`} data-layout={layout}>{visible.map(work => {
        const latest = latestRound(state, work.id)!;
        const rounds = state.rounds.filter(round => round.workId === work.id);
        return <article className="rd-book" key={work.id} data-work-id={work.id}>
          <button className="rd-cover-link" aria-label={`查看《${work.title}》阅读记录`} onClick={() => open({ kind: 'book', workId: work.id })}><BookCover id={work.id} title={work.title} author={work.subtitle}/></button>
          <div className="rd-book-copy"><button className="rd-title" onClick={() => open({ kind: 'book', workId: work.id })}><h3>{work.title}</h3></button><p className="rd-author">{work.subtitle}</p><p className="rd-record-date">{readingDate(latest.finishedOn)}{rounds.length > 1 && <span> · {rounds.length} 次阅读</span>}</p><blockquote>{latest.impression || '这次阅读，还没有留下一句话。'}</blockquote></div>
        </article>;
      })}</div> : <div className="rd-empty">{tag || query ? '没有符合筛选的阅读记录' : '还没有读完的书，可以先补录一本。'}</div>}
    </section>
    <ReadingSidebar state={state} open={open} works={all} tag={tag} setTag={setTag}/>
  </div>;
}
