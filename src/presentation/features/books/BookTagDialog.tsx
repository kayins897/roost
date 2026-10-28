import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { LibrarySnapshot, MediaItem } from '../../../domain/types.ts';
import { normalizeTags } from '../../../domain/library.ts';
import { Modal } from '../../components/MediaPrimitives.tsx';
import type { BookCommit } from './BookCollections.tsx';

export function BookTagsDialog({ snapshot, onCommit, onClose, onDeleted = () => undefined }: { snapshot: LibrarySnapshot; onCommit: BookCommit; onClose: () => void; onDeleted?: (tag: string) => void }) {
  const books = snapshot.items.filter(item => item.category === 'book' && !item.removedAt && !item.hiddenAt);
  const tags = normalizeTags([...(snapshot.bookTagCatalog ?? []), ...books.flatMap(book => book.tags)]).sort((a, b) => a.localeCompare(b, 'zh'));
  return <BookTagDialog tags={tags} books={books} onCommit={onCommit} onClose={onClose} onDeleted={onDeleted}/>;
}

export function BookTagDialog({ tags, books, onCommit, onClose, onDeleted }: { tags: string[]; books: MediaItem[]; onCommit: BookCommit; onClose: () => void; onDeleted: (tag: string) => void }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  function reset() { setCurrent(null); setName(''); setChosen([]); setDirty(false); setError(''); }
  function select(tag: string | null) {
    if (dirty && !window.confirm('放弃当前标签尚未保存的分配？')) return;
    setCurrent(tag); setName(tag ?? ''); setChosen(tag ? books.filter(book => book.tags.some(value => value.toLocaleLowerCase() === tag.toLocaleLowerCase())).map(book => book.id) : []); setDirty(false); setError('');
  }
  const close = () => { if (!dirty || window.confirm('放弃尚未保存的标签修改？')) onClose(); };
  function save() {
    const next = name.trim();
    if (!next) { setError('请填写标签名称。'); return; }
    if (tags.some(tag => tag.toLocaleLowerCase() === next.toLocaleLowerCase() && tag !== current)) { setError('已有同名标签，请选择该标签进行分配。'); return; }
    const visibleIds = new Set(books.map(book => book.id));
    const saved = onCommit(snapshot => ({ ...snapshot, bookTagCatalog: normalizeTags([...(snapshot.bookTagCatalog ?? []).filter(tag => tag.toLocaleLowerCase() !== current?.toLocaleLowerCase()), next]), items: snapshot.items.map(item => {
      if (item.category !== 'book' || !visibleIds.has(item.id) || item.removedAt) return item;
      const existing = item.tags.filter(tag => tag.toLocaleLowerCase() !== current?.toLocaleLowerCase() && tag.toLocaleLowerCase() !== next.toLocaleLowerCase());
      const values = chosen.includes(item.id) ? [...existing, next] : existing;
      return values.join('\0') === item.tags.join('\0') ? item : { ...item, tags: values, updatedAt: new Date().toISOString() };
    }) }), '书籍标签已保存');
    if (saved) { if (current && current !== next) onDeleted(current); setCurrent(next); setDirty(false); setError(''); }
    else setError('保存失败，当前标签和分配仍保留，请重试。');
  }
  function remove(tag: string) {
    if (!window.confirm(`删除标签「${tag}」及当前书架中的书籍关联？隐藏和回收站内的记录保留。`)) return;
    if (onCommit(snapshot => ({ ...snapshot, bookTagCatalog: (snapshot.bookTagCatalog ?? []).filter(value => value.toLocaleLowerCase() !== tag.toLocaleLowerCase()), items: snapshot.items.map(item => item.category === 'book' && !item.removedAt && !item.hiddenAt && item.tags.some(value => value.toLocaleLowerCase() === tag.toLocaleLowerCase()) ? { ...item, tags: item.tags.filter(value => value.toLocaleLowerCase() !== tag.toLocaleLowerCase()), updatedAt: new Date().toISOString() } : item) }), '书籍标签已删除')) { onDeleted(tag); reset(); }
    else setError('删除失败，请重试。');
  }
  return <Modal title="管理书籍标签" onClose={close} className="books-dialog"><div className="books-tag-manager"><nav aria-label="已有书籍标签"><button className="button button--secondary" onClick={() => select(null)}><Plus size={14}/>新增标签</button>{tags.map(tag => <button key={tag} className={`tag-filter ${current === tag ? 'is-selected' : ''}`} aria-pressed={current === tag} onClick={() => select(tag)}>{tag}</button>)}</nav><div><label className="form-field">标签名称<input value={name} maxLength={60} onChange={event => { setName(event.target.value); setDirty(true); }}/></label><p className="books-muted">选择要使用这个标签的书籍</p><div className="books-checklist">{books.map(book => <label key={book.id}><input type="checkbox" checked={chosen.includes(book.id)} onChange={() => { setChosen(values => values.includes(book.id) ? values.filter(id => id !== book.id) : [...values, book.id]); setDirty(true); }}/><span>{book.title}</span></label>)}</div></div></div>{error && <p role="alert" className="books-danger">{error}</p>}<footer className="books-dialog-actions">{current && <button className="text-button books-danger" onClick={() => remove(current)}><Trash2 size={14}/>删除标签</button>}<button className="button button--secondary" onClick={close}>完成</button><button className="button button--primary" onClick={save}>保存标签</button></footer></Modal>;
}
