import { BookOpen, ChevronDown, ExternalLink, Heart, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { bookArrangement, bookHasRead, bookPlanFor, type BookAction } from '../../../domain/books.ts';
import type { BookReadingRound, ExperienceEntry } from '../../../domain/types.ts';
import { Modal } from '../../components/MediaPrimitives.tsx';
import { t } from '../../i18n/index.ts';
import { QuickEditor } from '../../RecordEditors.tsx';
import { BentoCoverEditor } from '../detail/BentoContentEditors.tsx';
import type { DetailPanelProps } from '../detail/DetailPanel.tsx';
import { usePersonalWriting } from '../detail/usePersonalWriting.ts';
import { BookActionForm, type BookFormKind } from './BookActionForm.tsx';
import { BookCardAction, BookDetailCard, BookDetailCover, BookDetailFacts, BookDetailSynopsis, BookReadingCards } from './BookDetailCards.tsx';
import { BookFactsForm, type BookFactsScope } from './BookFactsForm.tsx';
import { BOOK_VIEWS, facetValues, readingLabel } from './bookView.ts';
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
  const closeEditor = () => { if (writing.save()) setEditing(null); };

  function editor(next: Exclude<Edit, null>) {
    return locked ? undefined : () => { if (writing.save()) setEditing(next); };
  }
  function editAction(label: string, next: Exclude<Edit, null>) {
    const open = editor(next);
    return open && <BookCardAction label={label} onClick={open} />;
  }
  function arrange(value: Exclude<typeof BOOK_VIEWS[number]['id'], 'all'>) {
    if (!writing.save() || locked) return;
    if (value !== 'records') onAction({ type: 'arrangement', value });
    else if (hasRead) onAction({ type: 'arrangement', value: 'none' });
    else setEditing({ kind: 'round' });
  }
  function remove(action: BookAction) {
    if (writing.save() && window.confirm(t('删除这条记录？其他阅读记录与安排不会改变。'))) onAction(action);
  }
  const activeState = arrangement === 'none' && hasRead ? 'records' : arrangement;
  const writingEditor = editing === 'impression' || editing === 'review' ? editing : null;

  return <Modal title={item.title} displayTitle={t('书籍')} onClose={close} wide className="books-detail"
    initialFocus={panel => panel.querySelector('.modal-heading button')}>
    <div className="books-detail-grid">
      <BookDetailCard name="hero">
        <BookDetailCover item={item} onEdit={editor('cover')} />
        <div className="books-detail-identity" onContextMenu={locked ? undefined : event => {
          event.preventDefault();
          editor({ facts: 'identity' })?.();
        }}>
          <header className="books-identity-header">
            <span><BookOpen size={16} />{t(item.subcategory || '书籍')}</span>
            {!locked && <div className="books-identity-actions">
              {editAction('编辑书籍资料', { facts: 'identity' })}
              <button type="button" className="books-detail-icon books-detail-favorite" aria-pressed={item.favorite}
                aria-label={t(item.favorite ? '取消喜欢' : '喜欢这本书')}
                onClick={() => { if (writing.save()) onPatch({ favorite: !item.favorite }); }}>
                <Heart size={16} fill={item.favorite ? 'currentColor' : 'none'} />
              </button>
            </div>}
          </header>
          <div className="books-identity-title">
            <h2>{item.title}</h2>
            {item.originalTitle && item.originalTitle !== item.title && <p className="books-original-title">{item.originalTitle}</p>}
            {item.creator && <p className="books-detail-author">{item.creator}</p>}
          </div>
          <div className="books-detail-arrangement">
            <div className="books-arrangement-label">
              <span>{t('当前阅读安排')}{activeState === 'none' && <strong>{t(readingLabel(item))}</strong>}</span>
              {!locked && <button type="button" className="books-detail-quick-log" onClick={editor({ kind: 'entry' })}>
                <Plus size={14} />{t('记录阅读')}
              </button>}
            </div>
            <div className="books-detail-statuses" role="group" aria-label={t('当前阅读安排')}>
              {BOOK_VIEWS.filter(view => view.id !== 'all').map(view => <button type="button" key={view.id}
                disabled={locked} aria-pressed={activeState === view.id} onClick={() => arrange(view.id)}>
                {t(view.label)}
              </button>)}
            </div>
            {hasRead && arrangement !== 'none' && <p className="books-detail-hint">{t('保留已读历史，当前仍可安排下一次阅读。')}</p>}
          </div>
        </div>
      </BookDetailCard>

      <BookDetailCard name="score" title="评分" onEdit={editor({ facts: 'score' })} action={editAction('编辑书籍评分', { facts: 'score' })}>
        <dl className="books-detail-scores">
          <div><dt>{t('我的评分')}</dt><dd>{personalScore === undefined
            ? <span>{t('未评分')}</span> : <><strong>{personalScore.toFixed(1)}</strong><small>/ 10</small></>}</dd></div>
          <div><dt>{t('豆瓣评分')}</dt><dd>{facts?.doubanScore === undefined
            ? <span>{t('未评分')}</span> : <strong>{facts.doubanScore.toFixed(1)}</strong>}</dd></div>
        </dl>
      </BookDetailCard>

      <BookDetailCard name="edition" title="出版信息" onEdit={editor({ facts: 'edition' })} action={editAction('编辑出版信息', { facts: 'edition' })}>
        <BookDetailFacts fields={[
          { label: '出版社', value: facts?.publisher }, { label: '出版年份', value: item.year },
          { label: '译者', value: facts?.translator }, { label: 'ISBN', value: facts?.isbn },
        ]} />
      </BookDetailCard>

      <div className="books-detail-editorial">
        <div className="books-detail-editorial-main">
          <BookDetailSynopsis description={facts?.description} onEdit={editor({ facts: 'synopsis' })} />
          <BookDetailCard name="writing" title="一句话感想" onEdit={editor('impression')} action={editAction('编辑一句话感想', 'impression')}>
            <p className={writing.draft.impression ? 'books-detail-quote' : 'books-detail-empty'}>
              {writing.draft.impression || t('读过之后，留下属于自己的感受。')}
            </p>
          </BookDetailCard>
        </div>
        <div className="books-detail-editorial-side">
          <BookDetailCard name="plan" title="阅读计划" onEdit={editor({ kind: 'plan' })} action={editAction('编辑阅读计划', { kind: 'plan' })}>
            {plan?.reason ? <p className="books-detail-prose">{plan.reason}</p> : <p className="books-detail-empty">{t('还没有写下想读的理由')}</p>}
            {plan?.targetDate && <p className="books-detail-date">{t('计划于')} {plan.targetDate}</p>}
          </BookDetailCard>
          <BookDetailCard name="sources" title="来源" onEdit={editor({ facts: 'sources' })} action={editAction('编辑书籍来源', { facts: 'sources' })}>
            <BookDetailFacts fields={[
              { label: '阅读来源', value: facts?.readingSources?.join(' · ') },
              { label: '资料来源', value: metadataSource === '未记录' ? undefined : metadataSource },
            ]} />
            {item.sourceUrl && <a className="books-detail-more" href={item.sourceUrl} target="_blank" rel="noreferrer">
              {t('查看资料来源')}<ExternalLink size={13} />
            </a>}
          </BookDetailCard>
          <BookDetailCard name="tags" title="标签" onEdit={editor('tags')} action={editAction('编辑书籍标签', 'tags')}>
            {item.tags.length ? <div className="books-tag-chips">{item.tags.map(tag => <span className="tag-filter" key={tag}>{tag}</span>)}</div>
              : <p className="books-detail-empty">{t('还没有标签')}</p>}
          </BookDetailCard>
        </div>
      </div>

      <BookReadingCards item={item} onRemove={remove}
        onEntry={locked ? undefined : entry => editor({ kind: 'entry', entry })?.()}
        onRound={locked ? undefined : round => editor({ kind: 'round', round })?.()} />

      <BookDetailCard name="review" onEdit={editor('review')}>
        <header className="books-review-header">
          <button type="button" className="books-review-toggle" aria-expanded={reviewOpen} onClick={() => setReviewOpen(value => !value)}>
            <strong>{t('长文读后感')}</strong><small>{Array.from(writing.draft.review).length} {t('字')}</small><ChevronDown size={16} />
          </button>
          {editAction('编辑长文读后感', 'review')}
        </header>
        {reviewOpen && (writing.draft.review ? <p className="books-detail-prose books-review-body">{writing.draft.review}</p>
          : <p className="books-detail-empty books-review-body">{t('留下完整的阅读感受……')}</p>)}
      </BookDetailCard>
    </div>
    <footer className="books-detail-manage">{locked
      ? <><button type="button" className="button button--secondary" onClick={props.onRestore}>{t('恢复书籍')}</button>
        <button type="button" className="text-button books-danger" onClick={props.onDeletePermanently}>{t('永久删除')}</button></>
      : <button type="button" className="text-button books-danger" onClick={() => { if (writing.save()) props.onDelete(); }}>
        <Trash2 size={14} />{t('移到回收站')}
      </button>}</footer>

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
  </Modal>;
}
