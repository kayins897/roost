import { BookOpen, Heart, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { bookArrangement, bookDuration, bookHasRead, bookPlanFor, bookRounds, type BookAction } from '../../../domain/books.ts';
import type { BookReadingRound, ExperienceEntry } from '../../../domain/types.ts';
import { QuickEditor } from '../../RecordEditors.tsx';
import { Modal, Poster } from '../../components/MediaPrimitives.tsx';
import type { DetailPanelProps } from '../detail/DetailPanel.tsx';
import { usePersonalWriting } from '../detail/usePersonalWriting.ts';
import { BookActionForm, type BookFormKind } from './BookActionForm.tsx';
import { BookFactsForm } from './BookFactsForm.tsx';
import { BOOK_VIEWS, formatMinutes, readingLabel } from './bookView.ts';
import './books.css';

type Edit = { kind: BookFormKind; round?: BookReadingRound; entry?: ExperienceEntry } | 'facts' | 'tags' | null;
export interface BookDetailProps extends DetailPanelProps { onAction: (action: BookAction) => boolean }
export function BookDetail(props: BookDetailProps) {
  const { item, onAction, onPatch, onClose, guardRef } = props;
  const [editing, setEditing] = useState<Edit>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const writing = usePersonalWriting(item, onPatch);
  const locked = Boolean(item.removedAt);
  const rounds = bookRounds(item);
  const plan = bookPlanFor(item);
  useEffect(() => { guardRef.current = writing.save; return () => { guardRef.current = null; }; });
  const close = () => { if (writing.save()) onClose(); };
  function edit(next: Edit) { if (writing.save()) setEditing(next); }
  function arrange(value: typeof BOOK_VIEWS[number]['id']) {
    if (!writing.save() || locked) return;
    if (value === 'records') { if (!bookHasRead(item)) setEditing({ kind: 'round' }); else onAction({ type: 'arrangement', value: 'none' }); }
    else if (value !== 'all') onAction({ type: 'arrangement', value });
  }
  const remove = (action: BookAction) => { if (window.confirm('删除这条记录？其他阅读记录与安排不会改变。')) onAction(action); };
  return <Modal title={item.title} onClose={close} wide className="books-detail books-dialog" headingActions={!locked && <button className="icon-button" aria-label={item.favorite ? '取消喜欢' : '喜欢这本书'} onClick={() => onPatch({ favorite: !item.favorite })}><Heart size={18} fill={item.favorite ? 'currentColor' : 'none'}/></button>}>
    <div className="books-detail-grid">
      <section className="books-detail-cover books-surface"><Poster item={item} large/></section>
      <section className="books-detail-arrangement books-surface"><h3>我的阅读</h3><strong className="books-detail-current">{readingLabel(item)}</strong>{bookHasRead(item) && bookArrangement(item) !== 'none' && <p className="books-muted">保留已读历史，当前仍可安排下一次阅读。</p>}<div className="status-tabs books-detail-statuses" aria-label="当前阅读安排">{BOOK_VIEWS.filter(view => view.id !== 'all').map(view => <button key={view.id} disabled={locked} aria-pressed={view.id === 'records' ? bookArrangement(item) === 'none' && bookHasRead(item) : bookArrangement(item) === view.id} className={(view.id === 'records' ? bookArrangement(item) === 'none' && bookHasRead(item) : bookArrangement(item) === view.id) ? 'is-active' : ''} onClick={() => arrange(view.id)}>{view.label}</button>)}</div>
        <div className="books-detail-stats"><div><span>累计阅读</span><strong>{formatMinutes(bookDuration(item))}</strong></div><div><span>读后记录</span><strong>{rounds.length ? `${rounds.length} 次` : bookHasRead(item) ? '历史已读' : '尚未读完'}</strong></div></div>
        <div className="books-detail-plan"><header><h4>阅读计划</h4>{!locked && <button className="icon-button" aria-label="编辑阅读计划" onClick={() => edit({ kind: 'plan' })}><Pencil size={14}/></button>}</header><p>{plan?.reason || '还没有写下想读的理由'}</p>{plan?.targetDate && <small className="books-muted">计划于 {plan.targetDate}</small>}</div>
      </section>
      <section className="books-detail-writing books-surface"><h3>一句话感想</h3><textarea aria-label="一句话感想" rows={3} maxLength={80} disabled={locked} placeholder="读过之后，留下属于自己的感受。" value={writing.draft.impression} onChange={event => writing.edit('impression', event.target.value)} onBlur={writing.save}/><footer><span className="books-muted">{writing.draft.impression.length} / 80</span><span className="books-muted">{writing.dirty ? '待保存' : '已保存 · 本地'}</span></footer>{(writing.validation || writing.saveError) && <p className="books-danger" role="alert">{writing.validation || writing.saveError}</p>}</section>
      <section className="books-detail-facts books-surface"><header><h3>书籍资料</h3>{!locked && <button className="icon-button" aria-label="编辑书籍资料" onClick={() => edit('facts')}><Pencil size={14}/></button>}</header><dl><dt>作者</dt><dd>{item.creator || '未记录'}</dd><dt>译者</dt><dd>{item.bookDetails?.translator || '未记录'}</dd><dt>出版社</dt><dd>{item.bookDetails?.publisher || '未记录'}</dd><dt>出版年份</dt><dd>{item.year || '未记录'}</dd><dt>我的评分</dt><dd>{item.personalScore === undefined ? '未评分' : `${item.personalScore.toFixed(1)} 分`}</dd><dt>豆瓣评分</dt><dd>{item.bookDetails?.doubanScore === undefined ? '未评分' : `${item.bookDetails.doubanScore.toFixed(1)} 分`}</dd><dt>阅读来源</dt><dd>{item.bookDetails?.readingSources?.join(' · ') || '未记录'}</dd><dt>资料来源</dt><dd>{item.bookDetails?.metadataSource || '未记录'}</dd></dl>{item.bookDetails?.description && <details><summary>简介</summary><p>{item.bookDetails.description}</p></details>}{!locked && <button className="text-button" onClick={() => { if (writing.save()) props.onEdit(); }}>编辑封面及完整资料</button>}</section>
      <section className="books-detail-history books-surface"><header><h3>读后记录</h3>{!locked && <button className="button button--secondary" onClick={() => edit({ kind: 'round' })}><Plus size={14}/>补录已读</button>}</header>{!rounds.length && <p className="books-muted">{bookHasRead(item) ? '历史数据标记为已读，实际读完日期未记录。' : '每次读完都可以保留一份感想，重读不会覆盖以前的记录。'}</p>}<div className="books-timeline">{rounds.map(round => <article key={round.id}><header><strong>{round.finishedOn || '读完日期未记录'}</strong>{!locked && <div><button className="icon-button" aria-label="编辑这次读后记录" onClick={() => edit({ kind: 'round', round })}><Pencil size={13}/></button><button className="icon-button books-danger" aria-label="删除这次读后记录" onClick={() => remove({ type: 'remove-round', id: round.id })}><Trash2 size={13}/></button></div>}</header><p>{round.impression || '未填写感想'}</p>{round.review && <details><summary>长篇读后感</summary><p>{round.review}</p></details>}</article>)}</div></section>
      <section className="books-detail-entries books-surface"><header><h3>日常阅读</h3>{!locked && <button className="icon-button" aria-label="添加阅读记录" onClick={() => edit({ kind: 'entry' })}><Plus size={16}/></button>}</header>{!item.experienceEntries?.length && <p className="books-muted">记录每天读了多久，积累到阅读热力表。</p>}<div className="books-timeline">{[...(item.experienceEntries ?? [])].sort((a, b) => b.date.localeCompare(a.date)).map(entry => <article key={entry.id}><header><strong>{entry.date}</strong><span>{formatMinutes(entry.minutes)}</span>{!locked && <div><button className="icon-button" aria-label="编辑这条阅读记录" onClick={() => edit({ kind: 'entry', entry })}><Pencil size={13}/></button><button className="icon-button books-danger" aria-label="删除这条阅读记录" onClick={() => remove({ type: 'remove-entry', id: entry.id })}><Trash2 size={13}/></button></div>}</header>{entry.note && <p>{entry.note}</p>}</article>)}</div></section>
      <section className="books-detail-tags books-surface"><header><h3>标签</h3>{!locked && <button className="icon-button" aria-label="编辑书籍标签" onClick={() => edit('tags')}><Pencil size={14}/></button>}</header><div className="books-tag-chips">{item.tags.length ? item.tags.map(tag => <span className="tag-filter" key={tag}>{tag}</span>) : <span className="books-muted">还没有标签</span>}</div></section>
      <section className="books-detail-review books-surface"><button className="books-review-toggle" aria-expanded={reviewOpen} onClick={() => setReviewOpen(value => !value)}><BookOpen size={15}/><strong>长文读后感</strong><small>{writing.draft.review.length} 字</small><span>{reviewOpen ? '−' : '+'}</span></button>{reviewOpen && <textarea rows={7} disabled={locked} aria-label="长文读后感" value={writing.draft.review} onChange={event => writing.edit('review', event.target.value)} onBlur={writing.save} placeholder="留下完整的阅读感受……"/>}</section>
    </div>
    <footer className="books-detail-manage">{locked ? <><button className="button button--secondary" onClick={props.onRestore}>恢复书籍</button><button className="text-button books-danger" onClick={props.onDeletePermanently}>永久删除</button></> : <button className="text-button books-danger" onClick={() => { if (writing.save()) props.onDelete(); }}><Trash2 size={14}/>移到回收站</button>}</footer>
    {editing === 'facts' && <BookFactsForm item={item} onClose={() => setEditing(null)} onSave={onPatch}/>}
    {editing === 'tags' && <QuickEditor item={item} availableItems={props.availableItems} mode="tags" onClose={() => setEditing(null)} onSave={onPatch}/>}
    {editing && typeof editing === 'object' && <BookActionForm key={`${editing.kind}-${editing.round?.id ?? editing.entry?.id ?? 'new'}`} kind={editing.kind} item={item} onClose={() => setEditing(null)} onSave={onAction} initialRound={editing.round} initialEntry={editing.entry}/>}
  </Modal>;
}
