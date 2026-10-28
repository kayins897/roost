import { BookOpen, MoreHorizontal, Star } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { bookArrangement, bookDuration, bookHasRead, bookPlanFor } from '../../../domain/books.ts';
import { personalWritingFor } from '../../../domain/personalWriting.ts';
import type { MediaItem } from '../../../domain/types.ts';
import { Poster } from '../../components/MediaPrimitives.tsx';
import { formatMinutes, readingLabel, latestBookRound } from './bookView.ts';

export function BookShelf({ books, layout, onOpen, onEdit, disabled, onCreate, onLifecycle, recycled }: {
  books: MediaItem[]; layout: 'grid' | 'list'; onOpen: (id: string) => void; onEdit: (id: string) => void;
  disabled: boolean; onCreate: () => void; recycled: boolean;
  onLifecycle: (action: 'trash' | 'restore' | 'delete', ids: string[]) => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const controls = () => [...(shell.current?.querySelectorAll<HTMLButtonElement>('.books-book-menu button:not(:disabled)') ?? [])];
    controls()[0]?.focus();
    const pointer = (event: PointerEvent) => { if (!(event.target as Element).closest('.books-book-menu,.books-book-more')) setMenu(null); };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenu(null); shell.current?.querySelector<HTMLButtonElement>(`[data-book-menu-id="${CSS.escape(menu)}"]`)?.focus(); }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); const values = controls(); const index = values.indexOf(document.activeElement as HTMLButtonElement); values[(index + (event.key === 'ArrowDown' ? 1 : values.length - 1)) % values.length]?.focus(); }
    };
    window.addEventListener('pointerdown', pointer); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', pointer); window.removeEventListener('keydown', key); };
  }, [menu]);
  if (!books.length) return <div className="books-empty books-surface"><BookOpen size={29}/><h3>这里还没有书</h3><p>收录一本书，或调整当前筛选。</p><button className="button button--secondary" onClick={onCreate} disabled={disabled}>收录书籍</button></div>;
  const reading = books.filter(book => bookArrangement(book) === 'reading');
  const rest = books.filter(book => bookArrangement(book) !== 'reading');
  const groups = reading.length && rest.length && !recycled ? [{ title: '正在阅读', books: reading }, { title: '书架', books: rest }] : [{ title: '', books }];
  return <div className="books-shelf" ref={shell}>{groups.map(group => <section key={group.title}>{group.title && <h3 className="books-section-label">{group.title}<small>{group.books.length}</small></h3>}<div className={layout === 'grid' ? 'media-gallery media-gallery--grid books-gallery' : 'books-list'}>{group.books.map(item => <article key={item.id} className={`books-book books-book--${layout}`}>
    <button className={`media-card media-card--${layout} books-book-open`} onClick={() => onOpen(item.id)} onContextMenu={event => { event.preventDefault(); setMenu(menu === item.id ? null : item.id); }} aria-label={`查看${item.title}详情`}>
      <div className="card-cover"><Poster item={item}/><span className="card-cover-shine" aria-hidden="true"/></div>
      <div className="books-book-info"><strong>{item.title}</strong><span className="books-muted">{item.creator || '作者未记录'}{item.year ? ` · ${item.year}` : ''}</span><span className="books-reading-state" data-arrangement={bookArrangement(item)}>{readingLabel(item)}{bookHasRead(item) && bookArrangement(item) !== 'none' && ' · 有已读记录'}</span><span className="books-book-metrics">{formatMinutes(bookDuration(item))}{item.personalScore !== undefined && <span><Star size={12}/>{item.personalScore.toFixed(1)}</span>}</span></div>
      {layout === 'list' && <p className="books-book-impression">{latestBookRound(item)?.impression || personalWritingFor(item).impression || bookPlanFor(item)?.reason || '还没有留下感想'}</p>}
    </button>
    <button className="icon-button books-book-more" data-book-menu-id={item.id} aria-label={`${item.title}更多操作`} aria-haspopup="menu" aria-expanded={menu === item.id} onClick={() => setMenu(menu === item.id ? null : item.id)}><MoreHorizontal size={17}/></button>
    {menu === item.id && <div className="books-book-menu books-surface" role="menu" aria-label={`${item.title}操作`}><button role="menuitem" className="text-button" disabled={disabled || recycled} onClick={() => { setMenu(null); onEdit(item.id); }}>编辑书籍资料</button>{recycled ? <><button role="menuitem" className="text-button" disabled={disabled} onClick={() => { onLifecycle('restore', [item.id]); setMenu(null); }}>恢复书籍</button><button role="menuitem" className="text-button books-danger" disabled={disabled} onClick={() => { onLifecycle('delete', [item.id]); setMenu(null); }}>永久删除</button></> : <button role="menuitem" className="text-button books-danger" disabled={disabled} onClick={() => { onLifecycle('trash', [item.id]); setMenu(null); }}>移到回收站</button>}</div>}
  </article>)}</div></section>)}</div>;
}
