import { ChevronDown, PenLine, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { bookDuration, bookHasRead, bookRounds, type BookAction } from '../../../domain/books.ts';
import type { BookReadingRound, ExperienceEntry, MediaItem } from '../../../domain/types.ts';
import { Poster } from '../../components/MediaPrimitives.tsx';
import { t } from '../../i18n/index.ts';
import { formatMinutes } from './bookView.ts';

export function BookCardAction({ label, onClick, add = false }: { label: string; onClick: () => void; add?: boolean }) {
  const Icon = add ? Plus : PenLine;
  return <button type="button" className="books-detail-icon" aria-label={t(label)} title={t(label)} onClick={onClick}><Icon size={16} /></button>;
}

export function BookDetailCard({ name, title, action, onEdit, children }: {
  name: string;
  title?: string;
  action?: ReactNode;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return <section className={'books-detail-card books-detail-' + name} onContextMenu={onEdit && (event => {
    event.preventDefault();
    onEdit();
  })}>
    {title && <header className="books-card-heading"><h3>{t(title)}</h3>{action}</header>}
    {children}
  </section>;
}

export function BookDetailCover({ item, onEdit }: { item: MediaItem; onEdit?: () => void }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  return <figure className="books-detail-cover" onContextMenu={onEdit && (event => {
    event.preventDefault();
    onEdit();
  })}>
    {item.coverUrl && item.coverUrl !== failedUrl ? <img src={item.coverUrl} alt={t('{0}封面', [item.title])} onError={() => setFailedUrl(item.coverUrl)} />
      : <Poster item={{ ...item, coverUrl: undefined }} />}
    {onEdit && <BookCardAction label="编辑封面" onClick={onEdit} />}
  </figure>;
}

export function BookDetailFacts({ fields }: { fields: { label: string; value?: string }[] }) {
  const present = fields.filter(field => field.value?.trim());
  if (!present.length) return <p className="books-detail-empty">{t('未记录')}</p>;
  return <dl className="books-detail-fact-list">{present.map(({ label, value }) =>
    <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>
  )}</dl>;
}

export function BookDetailSynopsis({ description, onEdit }: { description?: string; onEdit?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const content = description?.trim() ?? '';
  const excerpt = Array.from(content.split('\n').slice(0, 4).join('\n')).slice(0, 160).join('').trimEnd();
  const long = excerpt !== content;
  return <BookDetailCard name="synopsis" title="简介" onEdit={onEdit}
    action={onEdit && <BookCardAction label="编辑书籍简介" onClick={onEdit} />}>
    {content ? <p className="books-detail-prose">{long && !expanded ? excerpt + '…' : content}</p>
      : <p className="books-detail-empty">{t('暂无简介')}</p>}
    {long && <button type="button" className="books-detail-more" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      {t(expanded ? '收起简介' : '展开简介')}<ChevronDown size={14} />
    </button>}
  </BookDetailCard>;
}

export function BookReadingCards({ item, onEntry, onRound, onRemove }: {
  item: MediaItem;
  onEntry?: (entry?: ExperienceEntry) => void;
  onRound?: (round?: BookReadingRound) => void;
  onRemove: (action: BookAction) => void;
}) {
  const rounds = bookRounds(item);
  const entries = [...(item.experienceEntries ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const total = bookDuration(item);
  return <>
    <BookDetailCard name="entries" title="日常阅读" onEdit={onEntry && (() => onEntry())}
      action={onEntry && <BookCardAction label="添加阅读记录" add onClick={() => onEntry()} />}>
      <div className="books-detail-metric"><strong>{t(formatMinutes(total))}</strong><span>{t('累计阅读')}</span></div>
      {!entries.length && <p className="books-detail-empty">{t('记录每天读了多久，积累到阅读热力表。')}</p>}
      {entries.length > 0 && <div className="books-timeline">{entries.map(entry => <article key={entry.id}>
        <header><strong>{entry.date}</strong><span>{t(formatMinutes(entry.minutes))}</span>{onEntry && <div>
          <BookCardAction label="编辑这条阅读记录" onClick={() => onEntry(entry)} />
          <RemoveRecord label="删除这条阅读记录" onClick={() => onRemove({ type: 'remove-entry', id: entry.id })} />
        </div>}</header>
        {entry.note && <p>{entry.note}</p>}
      </article>)}</div>}
    </BookDetailCard>
    <BookDetailCard name="history" title="读后记录" onEdit={onRound && (() => onRound())}
      action={onRound && <BookCardAction label="补录已读" add onClick={() => onRound()} />}>
      <div className="books-detail-metric"><strong>{t(rounds.length ? '{0} 次' : bookHasRead(item) ? '历史已读' : '尚未读完', rounds.length ? [rounds.length] : undefined)}</strong></div>
      {!rounds.length && <p className="books-detail-empty">{bookHasRead(item)
        ? t('历史数据标记为已读，实际读完日期未记录。') : t('每次读完都可以保留一份感想，重读不会覆盖以前的记录。')}</p>}
      {rounds.length > 0 && <div className="books-timeline">{[...rounds].reverse().map(round => <article key={round.id}>
        <header><strong>{round.finishedOn || t('读完日期未记录')}</strong>{onRound && <div>
          <BookCardAction label="编辑这次读后记录" onClick={() => onRound(round)} />
          <RemoveRecord label="删除这次读后记录" onClick={() => onRemove({ type: 'remove-round', id: round.id })} />
        </div>}</header>
        <p>{round.impression || t('未填写感想')}</p>
        {round.review && <details><summary>{t('长篇读后感')}</summary><p>{round.review}</p></details>}
      </article>)}</div>}
    </BookDetailCard>
  </>;
}

function RemoveRecord({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="books-detail-icon books-danger" aria-label={t(label)} title={t(label)} onClick={onClick}><Trash2 size={14} /></button>;
}
