import { BookOpen, ChevronDown, Heart, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isScreenSeries, screenArrangement, screenHasWatched, screenProgressLabel, screenRounds, type ScreenAction } from '../../../domain/screens.ts';
import type { ExperienceEntry, ScreenArrangement, ScreenViewingRound } from '../../../domain/types.ts';
import { QuickEditor } from '../../RecordEditors.tsx';
import { InlineScoreControl, type InlineScoreControlHandle } from '../../components/InlineScoreControl.tsx';
import { Modal, Poster } from '../../components/MediaPrimitives.tsx';
import type { DetailPanelProps } from '../detail/DetailPanel.tsx';
import { usePersonalWriting } from '../detail/usePersonalWriting.ts';
import { ScreenActionForm, type ScreenFormKind } from './ScreenActionForm.tsx';
import { ScreenFactsForm } from './ScreenFactsForm.tsx';
import { facetValues, formatMinutes, viewingLabel, viewingMinutes } from './screenView.ts';
import '../books/books.css';
import './screen.css';

export interface ScreenDetailProps extends DetailPanelProps { onAction: (action: ScreenAction) => boolean; catalogTags?: string[] }
type Edit = { kind: ScreenFormKind; round?: ScreenViewingRound; entry?: ExperienceEntry } | 'facts' | 'tags' | null;
const ARRANGEMENTS: { value: ScreenArrangement; label: string }[] = [{ value: 'want', label: '想看' }, { value: 'watching', label: '在看' }, { value: 'none', label: '看过' }, { value: 'idle', label: '搁置' }, { value: 'abandoned', label: '弃看' }];
export function ScreenDetail(props: ScreenDetailProps) {
  const { item, onAction, onPatch, onClose, guardRef } = props;
  const [editing, setEditing] = useState<Edit>(null), [reviewOpen, setReviewOpen] = useState(false), [statesOpen, setStatesOpen] = useState(false), [error, setError] = useState('');
  const writing = usePersonalWriting(item, onPatch), score = useRef<InlineScoreControlHandle>(null), scoreScope = useRef<HTMLElement>(null);
  const locked = Boolean(item.removedAt), rounds = screenRounds(item), arrangement = screenArrangement(item);
  function flush() { return (!score.current || score.current.commit()) && writing.save(); }
  useEffect(() => { guardRef.current = flush; return () => { guardRef.current = null; }; });
  const close = () => { if (flush()) onClose(); };
  function edit(value: Edit) { if (flush()) setEditing(value); }
  function arrange(value: ScreenArrangement) {
    if (locked || !flush()) return;
    if (value === 'none' && !screenHasWatched(item)) { setEditing({ kind: 'round' }); return; }
    if (onAction({ type: 'arrangement', value })) { setStatesOpen(false); setError(''); }
    else setError('观看安排未能保存，请重试。');
  }
  function remove(action: ScreenAction) { if (flush() && window.confirm('删除这条记录？其他观看记录与当前安排会保留。')) onAction(action); }
  return <Modal title={item.title} onClose={close} wide className="books-dialog screen-detail" headingActions={!locked && <button className="icon-button" aria-label={item.favorite ? '取消喜欢' : '喜欢这部作品'} onClick={() => onPatch({ favorite: !item.favorite })}><Heart size={18} fill={item.favorite ? 'currentColor' : 'none'}/></button>}>
    <div className="screen-detail-grid">
      <section className="screen-detail-cover books-surface"><Poster item={item} large/></section>
      <section className="screen-detail-arrangement books-surface" data-screen-state={arrangement}><h3>我的观看</h3><button className="screen-current-arrangement" aria-label="更改观看安排" aria-expanded={statesOpen} disabled={locked} onClick={() => setStatesOpen(value => !value)}><strong>{viewingLabel(item)}</strong><ChevronDown size={16}/></button>{screenHasWatched(item) && arrangement !== 'none' && <p className="books-muted">已看过，当前仍可安排重看。</p>}
        {statesOpen && <div className="screen-arrangements" role="group" aria-label="观看安排">{ARRANGEMENTS.map(({ value, label }) => <button key={value} data-screen-state={value} disabled={locked} aria-pressed={value === arrangement && (value !== 'none' || screenHasWatched(item))} onClick={() => arrange(value)}>{label}</button>)}</div>}
        {isScreenSeries(item) && <div className="screen-progress"><span>{screenProgressLabel(item)}</span>{!locked && <button className="icon-button" aria-label="编辑观看进度" onClick={() => edit({ kind: 'progress' })}><Pencil size={14}/></button>}</div>}
        {error && <p className="books-danger" role="alert">{error}</p>}
      </section>
      <section ref={scoreScope} className="screen-detail-score books-surface"><h3>我的评分</h3><strong className="screen-score-value"><Star size={18}/>{item.personalScore === undefined ? '未评分' : item.personalScore.toFixed(1)}{item.personalScore !== undefined && <small>/ 10</small>}</strong>{!locked && <InlineScoreControl ref={score} value={item.personalScore} onSave={personalScore => onPatch({ personalScore })} label="影视个人评分" deferUntilDismiss commitScope={scoreScope}/>}</section>
      <section className="screen-detail-writing books-surface"><h3>一句话印象</h3><textarea rows={3} aria-label="影视一句话印象" disabled={locked} maxLength={80} placeholder="留下这部作品带给你的感受。" value={writing.draft.impression} onChange={event => writing.edit('impression', event.target.value)} onBlur={writing.save}/><footer><span>{writing.draft.impression.length} / 80</span><span>{writing.dirty ? '待保存' : '已保存 · 本地'}</span></footer>{(writing.validation || writing.saveError) && <p className="books-danger" role="alert">{writing.validation || writing.saveError}</p>}</section>
      <section className="screen-detail-facts books-surface"><header><h3>作品资料</h3>{!locked && <button className="icon-button" aria-label="编辑影视资料" onClick={() => edit('facts')}><Pencil size={14}/></button>}</header><dl><dt>导演</dt><dd>{item.creator || '未记录'}</dd><dt>类型</dt><dd>{item.subcategory || '未记录'}</dd><dt>发行年份</dt><dd>{item.year || '未记录'}</dd><dt>演员</dt><dd>{item.screenDetails?.actors?.join(' · ') || '未记录'}</dd><dt>地区</dt><dd>{item.screenDetails?.regions?.join(' · ') || '未记录'}</dd><dt>片长</dt><dd>{item.screenDetails?.durationMinutes === undefined ? '未记录' : `${item.screenDetails.durationMinutes} 分钟`}</dd>{isScreenSeries(item) && <><dt>总集数</dt><dd>{item.screenDetails?.episodeCount === undefined ? '未记录' : `${item.screenDetails.episodeCount} 集`}</dd></>}<dt>豆瓣评分</dt><dd>{item.screenDetails?.doubanScore === undefined ? '未评分' : `${item.screenDetails.doubanScore.toFixed(1)} 分`}</dd><dt>观看来源</dt><dd>{item.screenDetails?.viewingSources?.join(' · ') || '未记录'}</dd><dt>资料来源</dt><dd>{facetValues(item, 'metadata')[0]}</dd></dl>{item.screenDetails?.description && <details><summary>简介</summary><p>{item.screenDetails.description}</p></details>}{!locked && <button className="text-button" onClick={() => { if (flush()) props.onEdit(); }}>编辑封面及完整资料</button>}</section>
      <section className="screen-detail-tags books-surface"><header><h3>标签</h3>{!locked && <button className="icon-button" aria-label="编辑影视标签" onClick={() => edit('tags')}><Pencil size={14}/></button>}</header><div className="books-tag-chips">{item.tags.length ? item.tags.map(tag => <button key={tag} className="tag-filter" onClick={() => { if (flush()) props.onFilterTag(tag); }}>{tag}</button>) : <span className="books-muted">还没有标签</span>}</div></section>
      <section className="screen-detail-history books-surface"><header><h3>看过的记录</h3>{!locked && <button className="icon-button" aria-label="补录看过" onClick={() => edit({ kind: 'round' })}><Plus size={16}/></button>}</header>{!rounds.length && <p className="books-muted">{screenHasWatched(item) ? '历史数据已标记看过，实际看完日期未记录。' : '每次看完可以留一份感想，重看会保留以前的记录。'}</p>}<div className="books-timeline">{[...rounds].reverse().map(round => <article key={round.id}><header><strong>{round.finishedOn || '看完日期未记录'}</strong>{!locked && <div><button className="icon-button" aria-label="编辑这次看过记录" onClick={() => edit({ kind: 'round', round })}><Pencil size={13}/></button><button className="icon-button books-danger" aria-label="删除这次看过记录" onClick={() => remove({ type: 'remove-round', id: round.id })}><Trash2 size={13}/></button></div>}</header><p>{round.impression || '未填写感想'}</p>{round.review && <details><summary>这次的观后感</summary><p>{round.review}</p></details>}</article>)}</div></section>
      <section className="screen-detail-entries books-surface"><header><div><h3>观看足迹</h3><span className="books-muted">累计 {formatMinutes(viewingMinutes(item))}</span></div>{!locked && <button className="icon-button" aria-label="添加观看记录" onClick={() => edit({ kind: 'entry' })}><Plus size={16}/></button>}</header>{!item.experienceEntries?.length && <p className="books-muted">还没有日常观看记录。</p>}<div className="books-timeline">{[...(item.experienceEntries ?? [])].sort((a, b) => b.date.localeCompare(a.date)).map(entry => <article key={entry.id}><header><strong>{entry.date}</strong><span>{formatMinutes(entry.minutes)}</span>{!locked && <div><button className="icon-button" aria-label="编辑这条观看记录" onClick={() => edit({ kind: 'entry', entry })}><Pencil size={13}/></button><button className="icon-button books-danger" aria-label="删除这条观看记录" onClick={() => remove({ type: 'remove-entry', id: entry.id })}><Trash2 size={13}/></button></div>}</header>{entry.note && <p>{entry.note}</p>}</article>)}</div></section>
      <section className="screen-detail-review books-surface"><button className="books-review-toggle" aria-expanded={reviewOpen} onClick={() => setReviewOpen(value => !value)}><BookOpen size={15}/><strong>长文观后感</strong><small>{writing.draft.review.length} 字</small><span>{reviewOpen ? '−' : '+'}</span></button>{reviewOpen && <textarea rows={7} aria-label="长文观后感" disabled={locked} placeholder="写下完整的观后感……" value={writing.draft.review} onChange={event => writing.edit('review', event.target.value)} onBlur={writing.save}/>}</section>
    </div>
    <footer className="books-detail-manage">{locked ? <><button className="button button--secondary" onClick={props.onRestore}>恢复作品</button><button className="text-button books-danger" onClick={props.onDeletePermanently}>永久删除</button></> : <button className="text-button books-danger" onClick={() => { if (flush()) props.onDelete(); }}><Trash2 size={14}/>移到回收站</button>}</footer>
    {editing === 'facts' && <ScreenFactsForm item={item} onClose={() => setEditing(null)} onSave={onPatch}/>}
    {editing === 'tags' && <QuickEditor mode="tags" item={item} availableItems={props.availableItems} catalogTags={props.catalogTags} onClose={() => setEditing(null)} onSave={onPatch}/>}
    {editing && typeof editing === 'object' && <ScreenActionForm key={`${editing.kind}-${editing.round?.id ?? editing.entry?.id ?? 'new'}`} kind={editing.kind} item={item} initialRound={editing.round} initialEntry={editing.entry} onClose={() => setEditing(null)} onSave={onAction}/>}
  </Modal>;
}
