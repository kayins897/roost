import { BookOpen, ChevronDown, Clock3, Heart, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { bookArrangement, bookDuration, bookHasRead, bookPlanFor, type BookAction } from '../../../domain/books.ts';
import type { BookReadingRound, ExperienceEntry } from '../../../domain/types.ts';
import { Modal } from '../../components/MediaPrimitives.tsx';
import { t } from '../../i18n/index.ts';
import { QuickEditor } from '../../RecordEditors.tsx';
import { useDialogKeyboard } from '../../useDialogKeyboard.ts';
import { BentoCardAction } from '../detail/BentoDetailCard.tsx';
import { BentoArtwork } from '../detail/BentoReadCards.tsx';
import { BentoCoverEditor } from '../detail/BentoContentEditors.tsx';
import type { DetailPanelProps } from '../detail/DetailPanel.tsx';
import { usePersonalWriting } from '../detail/usePersonalWriting.ts';
import { BookActionForm, type BookFormKind } from './BookActionForm.tsx';
import { BookDetailCard, BookDetailFacts, BookDetailSynopsis, BookReadingCards } from './BookDetailCards.tsx';
import { BookFactsForm, type BookFactsScope } from './BookFactsForm.tsx';
import { BOOK_VIEWS, facetValues, formatMinutes, readingLabel } from './bookView.ts';
import '../detail/bento.css';
import './books.css';

type Edit =
  | { kind: BookFormKind; round?: BookReadingRound; entry?: ExperienceEntry }
  | { facts: BookFactsScope }
  | 'cover' | 'tags' | 'impression' | 'review' | null;

export interface BookDetailProps extends DetailPanelProps { onAction: (action: BookAction) => boolean; catalogTags?: string[] }

export function BookDetail(props: BookDetailProps) {
  const { item, onAction, onPatch, onClose, guardRef } = props;
  const [editing, setEditing] = useState<Edit>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [statesOpen, setStatesOpen] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const arrangementButton = useRef<HTMLButtonElement>(null);
  const writing = usePersonalWriting(item, onPatch);
  const locked = Boolean(item.removedAt);
  const arrangement = bookArrangement(item);
  const hasRead = bookHasRead(item);
  const plan = bookPlanFor(item);
  const facts = item.bookDetails;
  const metadataSource = facetValues(item, 'metadataSource')[0];
  const personalScore = item.personalScore;

  useEffect(() => { guardRef.current = writing.save; return () => { guardRef.current = null; }; });
  const close = () => { if (writing.save()) onClose(); };
  useDialogKeyboard(panel, close, {
    filterVisible: true,
    selector: 'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), textarea, select, a[href], summary, [tabindex="0"]',
    initialFocus: element => element.querySelector('.game-bento-close'),
  });
  const closeEditor = () => { if (writing.save()) setEditing(null); };

  function editor(next: Exclude<Edit, null>) {
    return locked ? undefined : () => { if (writing.save()) setEditing(next); };
  }
  function editAction(label: string, next: Exclude<Edit, null>) {
    const open = editor(next);
    return open && <BentoCardAction label={label} onClick={open} />;
  }
  function arrange(value: Exclude<typeof BOOK_VIEWS[number]['id'], 'all'>) {
    if (!writing.save() || locked) return;
    if (value === 'records' && !hasRead) {
      arrangementButton.current?.focus();
      setStatesOpen(false);
      setEditing({ kind: 'round' });
    } else if (onAction({ type: 'arrangement', value: value === 'records' ? 'none' : value })) {
      arrangementButton.current?.focus();
      setStatesOpen(false);
    }
  }
  function remove(action: BookAction) {
    if (writing.save() && window.confirm(t('删除这条记录？其他阅读记录与安排不会改变。'))) onAction(action);
  }
  const activeState = arrangement === 'none' && hasRead ? 'records' : arrangement;
  const writingEditor = editing === 'impression' || editing === 'review' ? editing : null;

  return <div className="detail-shell detail-dialog-backdrop game-bento-backdrop books-detail-backdrop"
    onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section ref={panel} className="game-bento-dialog books-detail" role="dialog" aria-modal="true" aria-label={item.title}>
      <button type="button" className="icon-button game-bento-close detail-close" aria-label={t('关闭')} onClick={close}><X size={21} /></button>
      <div className="game-bento-grid books-detail-grid">
        <BookDetailCard name="cover" tone="cover" onEdit={editor('cover')}>
          <BentoArtwork item={item} />
          {editAction('编辑封面', 'cover')}
        </BookDetailCard>

        <BookDetailCard name="score" tone="grade" title="我的评分" onEdit={editor({ facts: 'score' })}
          action={editAction('编辑书籍评分', { facts: 'score' })}>
          <div className="bento-score-display"><strong>{personalScore === undefined ? '—' : personalScore.toFixed(1)}</strong>
            {personalScore !== undefined && <span>/ 10</span>}</div>
          <p className="bento-score-caption">{t(personalScore === undefined ? '尚未评分' : '我的个人评价')}</p>
        </BookDetailCard>

        <BookDetailCard name="duration" title="累计阅读" action={<Clock3 size={16} />}>
          <strong className="bento-stat-number">{t(formatMinutes(bookDuration(item)))}</strong>
        </BookDetailCard>

        <BookDetailCard name="edition" title="出版信息" onEdit={editor({ facts: 'edition' })}
          action={editAction('编辑出版信息', { facts: 'edition' })}>
          <BookDetailFacts fields={[
            { label: '出版社', value: facts?.publisher }, { label: '出版年份', value: item.year },
            { label: '译者', value: facts?.translator }, { label: 'ISBN', value: facts?.isbn },
          ]} />
        </BookDetailCard>

        <BookDetailCard name="identity" onEdit={editor({ facts: 'identity' })}>
          <div className="bento-heading">
            <span className="books-detail-kind"><BookOpen size={15} />{t(item.subcategory || '书籍')}</span>
            {!locked && <div className="books-identity-actions">
              {editAction('编辑书籍资料', { facts: 'identity' })}
              <button type="button" className="bento-favorite" aria-pressed={item.favorite}
                aria-label={t(item.favorite ? '取消喜欢' : '喜欢这本书')}
                onClick={() => { if (writing.save()) onPatch({ favorite: !item.favorite }); }}>
                <Heart size={16} fill={item.favorite ? 'currentColor' : 'none'} />
              </button>
            </div>}
          </div>
          <div className="books-identity-body">
            <div className="books-identity-title">
              <h2>{item.title}</h2>
              {item.originalTitle && item.originalTitle !== item.title && <p>{item.originalTitle}</p>}
              {item.creator && <p>{item.creator}</p>}
            </div>
            <div className="books-identity-actions">
              <button ref={arrangementButton} type="button" className="books-current-arrangement" data-book-arrangement={activeState}
                aria-label={t('更改阅读安排')} aria-expanded={statesOpen} disabled={locked}
                onClick={() => { if (writing.save()) setStatesOpen(value => !value); }}>
                <strong>{t(readingLabel(item))}</strong>{!locked && <ChevronDown size={15} />}
              </button>
              {!locked && <button type="button" className="books-detail-quick-log" onClick={editor({ kind: 'entry' })}>
                <Plus size={14} />{t('记录阅读')}
              </button>}
            </div>
          </div>
          {statesOpen && !locked && <div className="books-detail-statuses" role="group" aria-label={t('当前阅读安排')}>
            {BOOK_VIEWS.filter(view => view.id !== 'all').map(view => <button type="button" key={view.id}
              aria-pressed={activeState === view.id} onClick={() => arrange(view.id)}>{t(view.label)}</button>)}
          </div>}
          {hasRead && arrangement !== 'none' && <p className="books-detail-hint bento-muted">{t('保留已读历史，当前仍可安排下一次阅读。')}</p>}
        </BookDetailCard>

        <BookDetailCard name="plan" tone="facts" title="阅读计划" onEdit={editor({ kind: 'plan' })}
          action={editAction('编辑阅读计划', { kind: 'plan' })}>
          {plan?.reason ? <p className="books-detail-prose">{plan.reason}</p> : <p className="bento-muted">{t('还没有写下想读的理由')}</p>}
          {plan?.targetDate && <p className="bento-muted">{t('计划于')} {plan.targetDate}</p>}
        </BookDetailCard>
        <BookDetailCard name="sources" title="来源与评分" onEdit={editor({ facts: 'sources' })}
          action={editAction('编辑书籍来源', { facts: 'sources' })}>
          <BookDetailFacts fields={[
            { label: '阅读来源', value: facts?.readingSources?.join(' · ') || t('未记录') },
            { label: '资料来源', value: t(metadataSource) },
            { label: '豆瓣评分', value: facts?.doubanScore === undefined ? t('未评分') : t('{0} 分', [facts.doubanScore.toFixed(1)]) },
          ]} />
          {item.sourceUrl && <a className="bento-source-link" href={item.sourceUrl} target="_blank" rel="noreferrer">{t('查看来源页面 ↗')}</a>}
        </BookDetailCard>

        <BookDetailCard name="writing" tone="impression" title="一句话感想" onEdit={editor('impression')}
          action={editAction('编辑一句话感想', 'impression')}>
          <p className="bento-impression-text">{writing.draft.impression ||
            <span className="bento-muted">{t('还没有一句话印象')}</span>}</p>
        </BookDetailCard>
        <BookDetailCard name="tags" tone="tags" title="标签" onEdit={editor('tags')} action={editAction('编辑书籍标签', 'tags')}>
          <div className="bento-tag-row"><div>{item.tags.length
            ? item.tags.map(tag => <span className="books-detail-tag" key={tag}>{tag}</span>)
            : <span className="bento-muted">{t('还没有标签')}</span>}</div></div>
        </BookDetailCard>

        <BookDetailSynopsis description={facts?.description} onEdit={editor({ facts: 'synopsis' })} />
        <BookReadingCards item={item} onRemove={remove}
          onEntry={locked ? undefined : entry => editor({ kind: 'entry', entry })?.()}
          onRound={locked ? undefined : round => editor({ kind: 'round', round })?.()} />

        <BookDetailCard name="review" tone="review" onEdit={editor('review')}>
          <div className="books-review-header">
            <button type="button" className="bento-review-toggle" aria-expanded={reviewOpen} onClick={() => setReviewOpen(value => !value)}>
              <h3>{t('长文读后感')}</h3><span>{Array.from(writing.draft.review).length} {t('字')}</span><ChevronDown size={16} />
            </button>
            {editAction('编辑长文读后感', 'review')}
          </div>
          {reviewOpen && <div className="bento-review-body">{writing.draft.review ||
            <span className="bento-muted">{t('留下完整的阅读感受……')}</span>}</div>}
        </BookDetailCard>
      </div>
      <footer className="bento-recycle-actions books-detail-manage">{locked
        ? <><span>{t('回收站 · 只读')}</span><button type="button" onClick={props.onRestore}>{t('恢复书籍')}</button>
          <button type="button" onClick={props.onDeletePermanently}>{t('永久删除')}</button></>
        : <button type="button" onClick={() => { if (writing.save()) props.onDelete(); }}><Trash2 size={14} />{t('移到回收站')}</button>}
      </footer>
    </section>

    {editing === 'cover' && <Modal title={t('编辑封面')} onClose={closeEditor} className="books-dialog">
      <BentoCoverEditor item={item} save={onPatch} close={closeEditor} />
      <button type="button" className="text-button books-detail-full-edit" onClick={() => { setEditing(null); props.onEdit(); }}>
        {t('编辑封面及完整资料')}
      </button>
    </Modal>}
    {writingEditor && <Modal title={t(writingEditor === 'impression' ? '一句话感想' : '长文读后感')}
      onClose={closeEditor} className="books-dialog">
      <textarea className="books-detail-writing-input" rows={writingEditor === 'impression' ? 3 : 9}
        aria-label={t(writingEditor === 'impression' ? '一句话感想' : '长文读后感')}
        maxLength={writingEditor === 'impression' ? 80 : undefined}
        placeholder={t(writingEditor === 'impression' ? '读过之后，留下属于自己的感受。' : '留下完整的阅读感受……')}
        value={writing.draft[writingEditor]} onChange={event => writing.edit(writingEditor, event.target.value)} />
      <footer className="books-dialog-actions">
        {writingEditor === 'impression' && <span className="books-muted">{Array.from(writing.draft.impression).length} / 80</span>}
        <button type="button" className="button button--primary" onClick={closeEditor}>{t('保存')}</button>
      </footer>
      {(writing.validation || writing.saveError) && <p className="books-danger" role="alert">{t(writing.validation || writing.saveError)}</p>}
    </Modal>}
    {editing && typeof editing === 'object' && 'facts' in editing && <BookFactsForm key={editing.facts} scope={editing.facts}
      item={item} onClose={() => setEditing(null)} onSave={onPatch} />}
    {editing === 'tags' && <QuickEditor mode="tags" item={item} availableItems={props.availableItems} catalogTags={props.catalogTags}
      onClose={() => setEditing(null)} onSave={onPatch} />}
    {editing && typeof editing === 'object' && 'kind' in editing && <BookActionForm key={editing.kind + '-' + (editing.round?.id ?? editing.entry?.id ?? 'new')}
      kind={editing.kind} item={item} initialRound={editing.round} initialEntry={editing.entry} onClose={() => setEditing(null)} onSave={onAction} />}
  </div>;
}
