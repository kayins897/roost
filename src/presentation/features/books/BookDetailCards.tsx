import { ChevronDown, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { bookHasRead, bookRounds, type BookAction } from '../../../domain/books.ts';
import type { BookReadingRound, ExperienceEntry, MediaItem } from '../../../domain/types.ts';
import { t } from '../../i18n/index.ts';
import { BentoCardAction, BentoDetailCard } from '../detail/BentoDetailCard.tsx';
import { formatMinutes } from './bookView.ts';

export function BookDetailCard({ name, tone, title, action, onEdit, children }: {
  name: string;
  tone?: string;
  title?: string;
  action?: ReactNode;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return <BentoDetailCard className={'books-detail-' + name} tone={tone} edit={onEdit}>
    {title && <div className="bento-heading"><h3>{t(title)}</h3>{action}</div>}
    {children}
  </BentoDetailCard>;
}

export function BookDetailFacts({ fields }: { fields: { label: string; value?: string }[] }) {
  const present = fields.filter(field => field.value?.trim());
  if (!present.length) return <p className="bento-muted">{t('未记录')}</p>;
  return <dl className="bento-facts">{present.map(({ label, value }) =>
    <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>
  )}</dl>;
}

export function BookDetailSynopsis({ description, onEdit }: { description?: string; onEdit?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const content = description?.trim() ?? '';
  const excerpt = Array.from(content.split('\n').slice(0, 4).join('\n')).slice(0, 160).join('').trimEnd();
  const long = excerpt !== content;
  return <BookDetailCard name="synopsis" tone="facts" title="作品简介" onEdit={onEdit}
    action={onEdit && <BentoCardAction label="编辑书籍简介" onClick={onEdit} />}>
    {content ? <p className="books-detail-prose">{long && !expanded ? excerpt + '…' : content}</p>
      : <p className="bento-muted">{t('暂无简介')}</p>}
    {long && <button type="button" className="bento-source-link books-detail-more" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
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
  return <>
    <BookDetailCard name="history" title="读后记录" onEdit={onRound && (() => onRound())}
      action={onRound && <BentoCardAction label="补录已读" add onClick={() => onRound()} />}>
      {rounds.length > 0 ? <p className="books-detail-rounds">{t('{0} 次', [rounds.length])}</p>
        : <p className="bento-muted">{bookHasRead(item)
          ? t('历史数据标记为已读，实际读完日期未记录。') : t('每次读完都可以保留一份感想，重读不会覆盖以前的记录。')}</p>}
      {rounds.length > 0 && <ol className="bento-footprints">{[...rounds].reverse().map(round => <li key={round.id}>
        <header><strong>{round.finishedOn || t('读完日期未记录')}</strong>{onRound && <div>
          <BentoCardAction label="编辑这次读后记录" onClick={() => onRound(round)} />
          <RemoveRecord label="删除这次读后记录" onClick={() => onRemove({ type: 'remove-round', id: round.id })} />
        </div>}</header>
        <p>{round.impression || t('未填写感想')}</p>
        {round.review && <details><summary>{t('长篇读后感')}</summary><p>{round.review}</p></details>}
      </li>)}</ol>}
    </BookDetailCard>
    <BookDetailCard name="entries" tone="footprint" title="日常阅读" onEdit={onEntry && (() => onEntry())}
      action={onEntry && <BentoCardAction label="添加阅读记录" add onClick={() => onEntry()} />}>
      {!entries.length && <p className="bento-muted">{t('记录每天读了多久，积累到阅读热力表。')}</p>}
      {entries.length > 0 && <ol className="bento-footprints">{entries.map(entry => <li key={entry.id}>
        <header><strong>{entry.date}</strong><span>{t(formatMinutes(entry.minutes))}</span>{onEntry && <div>
          <BentoCardAction label="编辑这条阅读记录" onClick={() => onEntry(entry)} />
          <RemoveRecord label="删除这条阅读记录" onClick={() => onRemove({ type: 'remove-entry', id: entry.id })} />
        </div>}</header>
        {entry.note && <p>{entry.note}</p>}
      </li>)}</ol>}
    </BookDetailCard>
  </>;
}

function RemoveRecord({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="bento-card-action" aria-label={t(label)} title={t(label)} onClick={onClick}><Trash2 size={14} /></button>;
}
