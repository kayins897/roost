import { Pencil, Plus } from 'lucide-react';
import { readingDate } from '../reading-workspace/BookForms';
import { Dialog } from '../reading-workspace/ui';
import { BookCover } from './BookCover';
import { BookArrangement } from './BookArrangement';
import { arrangementOf } from './book-classification';
import { metadataOf } from './book-metadata';
import type { DeskProps } from './types';

export function BookPanel({ state, dispatch, open, tags, workId, onClose }: Pick<DeskProps, 'state' | 'dispatch' | 'open' | 'tags'> & { workId: string; onClose: () => void }) {
  const work = state.works.find(work => work.id === workId)!;
  const metadata = metadataOf(work);
  const plan = state.plans.find(plan => plan.workId === workId);
  const current = arrangementOf(state, workId);
  const rounds = state.rounds.filter(round => round.workId === workId).sort((a, b) => (b.finishedOn ?? '').localeCompare(a.finishedOn ?? ''));
  const score = (value?: number) => value === undefined ? '未评分' : `${value.toFixed(1)} 分`;
  return <Dialog title={work.title} wide onClose={onClose}>
    <div className="rd-detail">
      <aside>
        <BookCover id={work.id} title={work.title} author={work.subtitle}/>
        <p className="rd-author">{work.subtitle} · {work.year}</p>
        <p className="rd-detail-description">{work.description}</p>
        <dl className="rd-book-facts">
          <dt>出版社</dt><dd>{metadata.publisher || '未记录'}</dd>
          <dt>书籍类型</dt><dd>{metadata.bookType || '未记录'}</dd>
          <dt>我的评分</dt><dd>{score(metadata.personalScore)}</dd>
          <dt>豆瓣评分</dt><dd>{score(metadata.doubanScore)}</dd>
          <dt>阅读来源</dt><dd>{metadata.readingSource.join('、') || '未记录'}</dd>
          <dt>资料来源</dt><dd>{metadata.metadataSource.join('、') || '未记录'}</dd>
        </dl>
        <div className="rd-detail-tags">
          {(tags.byBook[work.id] ?? []).map(tag => <span key={tag}>{tag}</span>)}
          <button className="rd-text-button" onClick={() => open({ kind: 'tags', workId })}>编辑标签</button>
        </div>
      </aside>
      <div>
        <BookArrangement state={state} dispatch={dispatch} open={open} workId={workId}/>
        {plan && <section className="rd-detail-plan"><span className="rd-reading-status">想读的理由</span><p>{plan.reason || '还没有写下想读的理由。'}</p></section>}
        <div className="rd-detail-actions">
          <button className="rd-button" onClick={() => open({ kind: 'plan', workId })}>{plan ? '调整计划' : '加入计划'}</button>
          <button className="rd-button" onClick={() => open({ kind: 'log', workId })}><Pencil size={14}/>记一次阅读</button>
          {current === 'reading' && <button className="rd-button" onClick={() => open({ kind: 'round', workId, finishPlan: true })}>记录读完</button>}
        </div>
        <header className="rd-section-head"><h3>我的阅读与感想</h3><button className="rd-text-button" onClick={() => open({ kind: 'round', workId })}><Plus size={14}/>补录</button></header>
        {rounds.length ? rounds.map(round => <article className="rd-round" key={round.id}>
          <header><span>{readingDate(round.finishedOn)}</span><button className="rd-icon" aria-label={`编辑${readingDate(round.finishedOn)}的阅读感想`} onClick={() => open({ kind: 'round', workId, round })}><Pencil size={15}/></button></header>
          <blockquote>{round.impression || '这次阅读还没有留下一句话。'}</blockquote>
          {round.review && <details><summary>读后感</summary><p>{round.review}</p></details>}
        </article>) : <p className="rd-empty">还没有读后记录，感想可以以后慢慢补。</p>}
      </div>
    </div>
  </Dialog>;
}
