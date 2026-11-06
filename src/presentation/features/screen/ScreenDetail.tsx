import { t } from '../../i18n/index.ts';
import { ChevronDown, Clock3, Film, Heart, Tags, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isScreenSeries, screenHasWatched, screenProgressLabel, screenRounds, type ScreenAction } from '../../../domain/screens.ts';
import { screenArrangementOptions, screenDisplayArrangement, screenKind } from '../../../domain/screenConsumption.ts';
import type { ExperienceEntry, ScreenArrangement, ScreenViewingRound } from '../../../domain/types.ts';
import { QuickEditor } from '../../RecordEditors.tsx';
import { InlineScoreControl, type InlineScoreControlHandle } from '../../components/InlineScoreControl.tsx';
import { Modal } from '../../components/MediaPrimitives.tsx';
import { useDialogKeyboard } from '../../useDialogKeyboard.ts';
import { BentoCoverEditor } from '../detail/BentoContentEditors.tsx';
import { BentoArtwork } from '../detail/BentoReadCards.tsx';
import type { DetailPanelProps } from '../detail/DetailPanel.tsx';
import { usePersonalWriting } from '../detail/usePersonalWriting.ts';
import { ScreenActionForm, type ScreenFormKind } from './ScreenActionForm.tsx';
import { CardEdit, ScreenDetailCard, ScreenMetadataCard } from './ScreenDetailCards.tsx';
import { ScreenFactsForm, type ScreenFactsScope } from './ScreenFactsForm.tsx';
import { formatMinutes, viewingLabel, viewingMinutes } from './screenView.ts';
import '../books/books.css';
import '../detail/bento.css';
import './screen.css';

export interface ScreenDetailProps extends DetailPanelProps { onAction: (action: ScreenAction) => boolean; catalogTags?: string[] }
type Edit = { kind: ScreenFormKind; round?: ScreenViewingRound; entry?: ExperienceEntry } | { facts: ScreenFactsScope } | 'cover' | 'score' | 'impression' | 'review' | 'tags' | null;

export function ScreenDetail(props: ScreenDetailProps) {
  const { item, onAction, onPatch, onClose, guardRef } = props;
  const [editing, setEditing] = useState<Edit>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [statesOpen, setStatesOpen] = useState(false);
  const [error, setError] = useState('');
  const writing = usePersonalWriting(item, onPatch);
  const panel = useRef<HTMLElement>(null);
  const score = useRef<InlineScoreControlHandle>(null);
  const scoreScope = useRef<HTMLElement>(null);
  const locked = Boolean(item.removedAt);
  const rounds = screenRounds(item), arrangement = screenDisplayArrangement(item);
  const hasWatched = screenHasWatched(item), personalScore = item.personalScore;
  const kind = screenKind(item);
  const historyTitle = kind === 'movie' ? t('观影与多刷') : t('看过的记录');

  function flush() { return (!score.current || score.current.commit()) && writing.save(); }
  useEffect(() => { guardRef.current = flush; return () => { guardRef.current = null; }; });
  const close = () => { if (flush()) onClose(); };
  useDialogKeyboard(panel, close, {
    filterVisible: true,
    selector: 'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), textarea, select, a[href], summary, [tabindex="0"]',
    initialFocus: element => element.querySelector('.game-bento-close'),
  });
  function edit(value: Edit) { if (!locked && flush()) setEditing(value); }
  function closeEditing() { if (flush()) setEditing(null); }
  function toggleArrangement() { if (!locked && flush()) setStatesOpen(value => !value); }
  function arrange(value: ScreenArrangement) {
    if (locked || !flush()) return;
    if (value === 'none' && !hasWatched) { setStatesOpen(false); setEditing({ kind: 'round' }); return; }
    if (onAction({ type: 'arrangement', value })) { setStatesOpen(false); setError(''); }
    else setError('观看安排未能保存，请重试。');
  }
  function remove(action: ScreenAction) {
    if (flush() && window.confirm(t('删除这条记录？其他观看记录与当前安排会保留。'))) onAction(action);
  }
  const openCover = () => edit('cover');
  const openScore = () => edit('score');
  const openImpression = () => edit('impression');
  const openReview = () => edit('review');
  const editFacts = (facts: ScreenFactsScope) => locked ? undefined : () => edit({ facts });
  const openTags = () => edit('tags');
  const addRound = () => edit({ kind: 'round' });
  const addEntry = () => edit({ kind: 'entry' });

  return <div className="detail-shell detail-dialog-backdrop game-bento-backdrop screen-detail-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section ref={panel} className="game-bento-dialog screen-detail" role="dialog" aria-modal="true" aria-label={item.title}>
      <button type="button" className="icon-button game-bento-close detail-close" aria-label={t('关闭')} onClick={close}><X size={21} /></button>
      <div className="game-bento-grid screen-detail-grid">
        <ScreenDetailCard card="cover" tone="cover" edit={locked ? undefined : openCover}>
          <BentoArtwork item={item} />
          {!locked && <CardEdit label="编辑封面" onClick={openCover} />}
        </ScreenDetailCard>

        <ScreenDetailCard card="score" tone="grade" edit={locked ? undefined : openScore}>
          <div className="bento-heading"><h3>{t('我的评分')}</h3>{!locked && <CardEdit label="影视个人评分" onClick={openScore} />}</div>
          <div className="bento-score-display"><strong>{personalScore === undefined ? '—' : personalScore.toFixed(1)}</strong>{personalScore !== undefined && <span>/ 10</span>}</div>
          <p className="bento-score-caption">{t(personalScore === undefined ? '尚未评分' : '我的个人评价')}</p>
        </ScreenDetailCard>

        <ScreenDetailCard card="arrangement" edit={editFacts('identity')}>
          <div className="bento-heading">
            <span className="screen-detail-kind"><Film size={15} />{t(item.subcategory || (kind === 'movie' ? '电影' : kind === 'anime' ? '番剧' : '连续剧'))}</span>
            {!locked && <div className="screen-identity-actions">
              <CardEdit label="编辑作品名称与类型" onClick={() => edit({ facts: 'identity' })} />
              <button type="button" className="bento-favorite" aria-pressed={item.favorite} aria-label={item.favorite ? t('取消喜欢') : t('喜欢这部作品')} onClick={() => onPatch({ favorite: !item.favorite })}><Heart size={16} fill={item.favorite ? 'currentColor' : 'none'} /></button>
            </div>}
          </div>
          <div className="screen-identity-body">
            <div className="screen-identity-name"><h2>{item.title}</h2>
              {item.originalTitle && item.originalTitle !== item.title && <p className="screen-original-title">{item.originalTitle}</p>}
            </div>
            <div className="screen-arrangement-body" data-screen-state={arrangement}>
              <button type="button" className="screen-current-arrangement" aria-label={t('更改观看安排')} aria-expanded={statesOpen} disabled={locked} onClick={toggleArrangement}><strong>{t(viewingLabel(item))}</strong>{!locked && <ChevronDown size={15} />}</button>
              {hasWatched && arrangement !== 'none' && <p className="bento-muted">{t('已看过，当前仍可安排重看。')}</p>}
              {statesOpen && <div className="screen-arrangements" role="group" aria-label={t('观看安排')}>{screenArrangementOptions(item).map(({ value, label }) => <button type="button" key={value} data-screen-state={value} aria-pressed={value === arrangement && (value !== 'none' || hasWatched)} onClick={() => arrange(value)}>{t(label)}</button>)}</div>}
            </div>
          </div>
          {isScreenSeries(item) && <div className="screen-progress"><span>{t(screenProgressLabel(item))}</span>{!locked && <CardEdit label="编辑观看进度" onClick={() => edit({ kind: 'progress' })} />}</div>}
          {error && <p className="bento-context-error" role="alert">{t(error)}</p>}
        </ScreenDetailCard>

        <ScreenMetadataCard card="runtime" item={item} edit={editFacts('runtime')} />
        <ScreenMetadataCard card="release" item={item} edit={editFacts('release')} />
        <ScreenMetadataCard card="credits" item={item} edit={editFacts('credits')} />
        <ScreenMetadataCard card="sources" item={item} edit={editFacts('sources')} />

        <ScreenDetailCard card="impression" tone="impression" edit={locked ? undefined : openImpression}>
          <div className="bento-heading"><h3>{t('一句话印象')}</h3>{!locked && <CardEdit label="编辑一句话印象" onClick={openImpression} />}</div>
          <p className="bento-impression-text">{writing.draft.impression || <span className="bento-muted">{t('还没有一句话印象')}</span>}</p>
        </ScreenDetailCard>

        <ScreenDetailCard card="tags" tone="tags" edit={locked ? undefined : openTags}>
          <div className="bento-heading"><h3>{t('标签')}</h3>{locked ? <Tags size={16} /> : <CardEdit label="编辑影视标签" onClick={openTags} />}</div>
          <div className="bento-tag-row"><div>{item.tags.length ? item.tags.map(tag => <button type="button" key={tag} onClick={() => { if (flush()) props.onFilterTag(tag); }}>{tag}</button>) : <span className="bento-muted">{t('还没有标签')}</span>}</div></div>
        </ScreenDetailCard>

        <ScreenMetadataCard card="synopsis" item={item} edit={editFacts('synopsis')} />

        <ScreenDetailCard card="history" edit={locked ? undefined : addRound}>
          <div className="bento-heading"><h3>{historyTitle}</h3>{!locked && <CardEdit label="补录看过" onClick={addRound} add />}</div>
          {!rounds.length && <p className="bento-muted">{hasWatched ? t('历史数据已标记看过，实际看完日期未记录。') : t('每次看完可以留一份感想，重看会保留以前的记录。')}</p>}
          <ol className="bento-footprints">{[...rounds].reverse().map(round => <li key={round.id}>
            <header><strong>{round.finishedOn || t('看完日期未记录')}</strong>{!locked && <div>
              <CardEdit label="编辑这次看过记录" onClick={() => edit({ kind: 'round', round })} />
              <button type="button" className="screen-card-edit" aria-label={t('删除这次看过记录')} onClick={() => remove({ type: 'remove-round', id: round.id })}><Trash2 size={13} /></button>
            </div>}</header>
            <p>{round.impression || t('未填写感想')}</p>
            {round.review && <details><summary>{t('这次的观后感')}</summary><p>{round.review}</p></details>}
          </li>)}</ol>
        </ScreenDetailCard>

        <ScreenDetailCard card="entries" tone="footprint" edit={locked ? undefined : addEntry}>
          <div className="bento-heading"><h3>{t('观看足迹')}</h3>{!locked && <CardEdit label="添加观看记录" onClick={addEntry} add />}</div>
          <div className="screen-watch-total"><strong className="bento-stat-number">{t(formatMinutes(viewingMinutes(item)))}</strong><span>{t('累计')}{' '}<Clock3 size={13} /></span></div>
          {!item.experienceEntries?.length && <p className="bento-muted">{t('还没有日常观看记录。')}</p>}
          <ol className="bento-footprints">{[...(item.experienceEntries ?? [])].sort((a, b) => b.date.localeCompare(a.date)).map(entry => <li key={entry.id}>
            <header><strong>{entry.date}</strong><span>{t(formatMinutes(entry.minutes))}</span>{!locked && <div>
              <CardEdit label="编辑这条观看记录" onClick={() => edit({ kind: 'entry', entry })} />
              <button type="button" className="screen-card-edit" aria-label={t('删除这条观看记录')} onClick={() => remove({ type: 'remove-entry', id: entry.id })}><Trash2 size={13} /></button>
            </div>}</header>
            {entry.note && <p>{entry.note}</p>}
          </li>)}</ol>
        </ScreenDetailCard>

        <ScreenDetailCard card="review" tone="review" edit={locked ? undefined : openReview}>
          <div className="screen-review-header">
            <button type="button" className="bento-review-toggle" aria-expanded={reviewOpen} onClick={() => setReviewOpen(value => !value)}>
              <h3>{t('长文观后感')}</h3><span>{Array.from(writing.draft.review).length} {t('字')}</span><ChevronDown size={16} />
            </button>
            {!locked && <CardEdit label="编辑长文观后感" onClick={openReview} />}
          </div>
          {reviewOpen && <div className="bento-review-body">{writing.draft.review || <span className="bento-muted">{t('还没有长文测评')}</span>}</div>}
        </ScreenDetailCard>
      </div>
      <footer className="bento-recycle-actions screen-detail-manage">{locked ? <><span>{t('回收站 · 只读')}</span><button type="button" onClick={props.onRestore}>{t('恢复作品')}</button><button type="button" onClick={props.onDeletePermanently}>{t('永久删除')}</button></> : <button type="button" onClick={() => { if (flush()) props.onDelete(); }}><Trash2 size={13} />{t('移到回收站')}</button>}</footer>
    </section>
    {editing === 'cover' && <Modal title={t('编辑封面')} onClose={closeEditing}><div className="screen-cover-form"><BentoCoverEditor item={item} save={onPatch} close={closeEditing} /><button type="button" className="text-button" onClick={() => { setEditing(null); props.onEdit(); }}>{t('编辑封面及完整资料')}</button></div></Modal>}
    {editing === 'score' && <Modal title={t('我的评分')} onClose={closeEditing} panelRef={scoreScope} initialFocus={element => element.querySelector('[role="spinbutton"]')}><InlineScoreControl ref={score} value={personalScore} onSave={value => onPatch({ personalScore: value })} label={t('影视个人评分')} deferUntilDismiss commitScope={scoreScope} /></Modal>}
    {(editing === 'impression' || editing === 'review') && <Modal title={t(editing === 'impression' ? '一句话印象' : '长文观后感')} onClose={closeEditing} className="books-dialog">
      <textarea className="screen-writing-input" rows={editing === 'impression' ? 3 : 9} aria-label={t(editing === 'impression' ? '影视一句话印象' : '长文观后感')} maxLength={editing === 'impression' ? 80 : undefined} value={writing.draft[editing]} onChange={event => writing.edit(editing, event.target.value)} onBlur={writing.save} />
      {(writing.validation || writing.saveError) && <p className="books-danger" role="alert">{t(writing.validation || writing.saveError)}</p>}
    </Modal>}
    {editing && typeof editing === 'object' && 'facts' in editing && <ScreenFactsForm key={editing.facts} scope={editing.facts} item={item} onClose={() => setEditing(null)} onSave={onPatch} />}
    {editing === 'tags' && <QuickEditor mode="tags" item={item} availableItems={props.availableItems} catalogTags={props.catalogTags} onClose={() => setEditing(null)} onSave={onPatch} />}
    {editing && typeof editing === 'object' && 'kind' in editing && <ScreenActionForm key={editing.kind + '-' + (editing.round?.id ?? editing.entry?.id ?? 'new')} kind={editing.kind} item={item} initialRound={editing.round} initialEntry={editing.entry} onClose={() => setEditing(null)} onSave={onAction} />}
  </div>;
}
