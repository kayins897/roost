import { t } from '../../i18n/index.ts';
import { BookOpen, ChevronDown, Heart, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isScreenSeries, screenHasWatched, screenProgressLabel, screenRounds, type ScreenAction } from '../../../domain/screens.ts';
import { screenArrangementOptions, screenDisplayArrangement, screenKind } from '../../../domain/screenConsumption.ts';
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
export function ScreenDetail(props: ScreenDetailProps) {
  const { item, onAction, onPatch, onClose, guardRef } = props;
  const [editing, setEditing] = useState<Edit>(null), [reviewOpen, setReviewOpen] = useState(false), [statesOpen, setStatesOpen] = useState(false), [error, setError] = useState('');
  const writing = usePersonalWriting(item, onPatch), score = useRef<InlineScoreControlHandle>(null), scoreScope = useRef<HTMLElement>(null);
  const locked = Boolean(item.removedAt), rounds = screenRounds(item), arrangement = screenDisplayArrangement(item);
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
  function remove(action: ScreenAction) { if (flush() && window.confirm(t('删除这条记录？其他观看记录与当前安排会保留。'))) onAction(action); }
  return <Modal title={item.title} onClose={close} wide className="books-dialog screen-detail" headingActions={!locked && <button className="icon-button" aria-label={item.favorite ? t('取消喜欢') : t('喜欢这部作品')} onClick={() => onPatch({ favorite: !item.favorite })}><Heart size={18} fill={item.favorite ? 'currentColor' : 'none'}/></button>}>
    <div className="screen-detail-grid">
      <section className="screen-detail-cover books-surface"><Poster item={item} large/></section>
      <section className="screen-detail-arrangement books-surface" data-screen-state={arrangement}><h3>{t("我的观看")}</h3><button className="screen-current-arrangement" aria-label={t("更改观看安排")} aria-expanded={statesOpen} disabled={locked} onClick={() => setStatesOpen(value => !value)}><strong>{t(viewingLabel(item))}</strong><ChevronDown size={16}/></button>{screenHasWatched(item) && arrangement !== 'none' && <p className="books-muted">{t("已看过，当前仍可安排重看。")}</p>}
        {statesOpen && <div className="screen-arrangements" role="group" aria-label={t("观看安排")}>{screenArrangementOptions(item).map(({ value, label }) => <button key={value} data-screen-state={value} disabled={locked} aria-pressed={value === arrangement && (value !== 'none' || screenHasWatched(item))} onClick={() => arrange(value)}>{t(label)}</button>)}</div>}
        {isScreenSeries(item) && <div className="screen-progress"><span>{t(screenProgressLabel(item))}</span>{!locked && <button className="icon-button" aria-label={t("编辑观看进度")} onClick={() => edit({ kind: 'progress' })}><Pencil size={14}/></button>}</div>}
        {error && <p className="books-danger" role="alert">{t(error)}</p>}
      </section>
      <section ref={scoreScope} className="screen-detail-score books-surface"><h3>{t("我的评分")}</h3><strong className="screen-score-value"><Star size={18}/>{item.personalScore === undefined ? t('未评分') : item.personalScore.toFixed(1)}{item.personalScore !== undefined && <small>/ 10</small>}</strong>{!locked && <InlineScoreControl ref={score} value={item.personalScore} onSave={personalScore => onPatch({ personalScore })} label={t("影视个人评分")} deferUntilDismiss commitScope={scoreScope}/>}</section>
      <section className="screen-detail-writing books-surface"><h3>{t("一句话印象")}</h3><textarea rows={3} aria-label={t("影视一句话印象")} disabled={locked} maxLength={80} placeholder={t("留下这部作品带给你的感受。")} value={writing.draft.impression} onChange={event => writing.edit('impression', event.target.value)} onBlur={writing.save}/><footer><span>{writing.draft.impression.length} / 80</span><span>{writing.dirty ? t('待保存') : t('已保存 · 本地')}</span></footer>{(writing.validation || writing.saveError) && <p className="books-danger" role="alert">{writing.validation || writing.saveError}</p>}</section>
      <section className="screen-detail-facts books-surface"><header><h3>{t("作品资料")}</h3>{!locked && <button className="icon-button" aria-label={t("编辑影视资料")} onClick={() => edit('facts')}><Pencil size={14}/></button>}</header><dl><dt>{t("导演")}</dt><dd>{item.creator || t('未记录')}</dd><dt>{t("类型")}</dt><dd>{(item.subcategory ? (['电影', '连续剧', '番剧', '动漫'].includes(item.subcategory) ? t(item.subcategory) : item.subcategory) : t('未记录'))}</dd><dt>{t("发行年份")}</dt><dd>{item.year || t('未记录')}</dd><dt>{t("演员")}</dt><dd>{item.screenDetails?.actors?.join(' · ') || t('未记录')}</dd><dt>{t("地区")}</dt><dd>{item.screenDetails?.regions?.join(' · ') || t('未记录')}</dd><dt>{t("片长")}</dt><dd>{item.screenDetails?.durationMinutes === undefined ? t('未记录') : t("{0} 分钟", [item.screenDetails.durationMinutes])}</dd>{isScreenSeries(item) && <><dt>{t("总集数")}</dt><dd>{item.screenDetails?.episodeCount === undefined ? t('未记录') : t("{0} 集", [item.screenDetails.episodeCount])}</dd></>}<dt>{t("豆瓣评分")}</dt><dd>{item.screenDetails?.doubanScore === undefined ? t('未评分') : t("{0} 分", [item.screenDetails.doubanScore.toFixed(1)])}</dd><dt>{t("观看来源")}</dt><dd>{item.screenDetails?.viewingSources?.join(' · ') || t('未记录')}</dd><dt>{t("资料来源")}</dt><dd>{facetValues(item, 'metadata')[0]}</dd></dl>{item.screenDetails?.description && <details><summary>{t("简介")}</summary><p>{item.screenDetails.description}</p></details>}{!locked && <button className="text-button" onClick={() => { if (flush()) props.onEdit(); }}>{t("编辑封面及完整资料")}</button>}</section>
      <section className="screen-detail-tags books-surface"><header><h3>{t("标签")}</h3>{!locked && <button className="icon-button" aria-label={t("编辑影视标签")} onClick={() => edit('tags')}><Pencil size={14}/></button>}</header><div className="books-tag-chips">{item.tags.length ? item.tags.map(tag => <button key={tag} className="tag-filter" onClick={() => { if (flush()) props.onFilterTag(tag); }}>{tag}</button>) : <span className="books-muted">{t("还没有标签")}</span>}</div></section>
      <section className="screen-detail-history books-surface"><header><h3>{screenKind(item) === 'movie' ? t('观影与多刷') : t('看过的记录')}</h3>{!locked && <button className="icon-button" aria-label={t("补录看过")} onClick={() => edit({ kind: 'round' })}><Plus size={16}/></button>}</header>{!rounds.length && <p className="books-muted">{screenHasWatched(item) ? t('历史数据已标记看过，实际看完日期未记录。') : t('每次看完可以留一份感想，重看会保留以前的记录。')}</p>}<div className="books-timeline">{[...rounds].reverse().map(round => <article key={round.id}><header><strong>{round.finishedOn || t('看完日期未记录')}</strong>{!locked && <div><button className="icon-button" aria-label={t("编辑这次看过记录")} onClick={() => edit({ kind: 'round', round })}><Pencil size={13}/></button><button className="icon-button books-danger" aria-label={t("删除这次看过记录")} onClick={() => remove({ type: 'remove-round', id: round.id })}><Trash2 size={13}/></button></div>}</header><p>{round.impression || t('未填写感想')}</p>{round.review && <details><summary>{t("这次的观后感")}</summary><p>{round.review}</p></details>}</article>)}</div></section>
      <section className="screen-detail-entries books-surface"><header><div><h3>{t("观看足迹")}</h3><span className="books-muted">{t("累计")}{" "}{t(formatMinutes(viewingMinutes(item)))}</span></div>{!locked && <button className="icon-button" aria-label={t("添加观看记录")} onClick={() => edit({ kind: 'entry' })}><Plus size={16}/></button>}</header>{!item.experienceEntries?.length && <p className="books-muted">{t("还没有日常观看记录。")}</p>}<div className="books-timeline">{[...(item.experienceEntries ?? [])].sort((a, b) => b.date.localeCompare(a.date)).map(entry => <article key={entry.id}><header><strong>{entry.date}</strong><span>{t(formatMinutes(entry.minutes))}</span>{!locked && <div><button className="icon-button" aria-label={t("编辑这条观看记录")} onClick={() => edit({ kind: 'entry', entry })}><Pencil size={13}/></button><button className="icon-button books-danger" aria-label={t("删除这条观看记录")} onClick={() => remove({ type: 'remove-entry', id: entry.id })}><Trash2 size={13}/></button></div>}</header>{entry.note && <p>{entry.note}</p>}</article>)}</div></section>
      <section className="screen-detail-review books-surface"><button className="books-review-toggle" aria-expanded={reviewOpen} onClick={() => setReviewOpen(value => !value)}><BookOpen size={15}/><strong>{t("长文观后感")}</strong><small>{writing.draft.review.length} {" "}{t("字")}</small><span>{reviewOpen ? '−' : '+'}</span></button>{reviewOpen && <textarea rows={7} aria-label={t("长文观后感")} disabled={locked} placeholder={t("写下完整的观后感……")} value={writing.draft.review} onChange={event => writing.edit('review', event.target.value)} onBlur={writing.save}/>}</section>
    </div>
    <footer className="books-detail-manage">{locked ? <><button className="button button--secondary" onClick={props.onRestore}>{t("恢复作品")}</button><button className="text-button books-danger" onClick={props.onDeletePermanently}>{t("永久删除")}</button></> : <button className="text-button books-danger" onClick={() => { if (flush()) props.onDelete(); }}><Trash2 size={14}/>{t("移到回收站")}</button>}</footer>
    {editing === 'facts' && <ScreenFactsForm item={item} onClose={() => setEditing(null)} onSave={onPatch}/>}
    {editing === 'tags' && <QuickEditor mode="tags" item={item} availableItems={props.availableItems} catalogTags={props.catalogTags} onClose={() => setEditing(null)} onSave={onPatch}/>}
    {editing && typeof editing === 'object' && <ScreenActionForm key={`${editing.kind}-${editing.round?.id ?? editing.entry?.id ?? 'new'}`} kind={editing.kind} item={item} initialRound={editing.round} initialEntry={editing.entry} onClose={() => setEditing(null)} onSave={onAction}/>}
  </Modal>;
}
