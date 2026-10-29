import { t } from '../../i18n/index.ts';
import { useUnsavedChanges } from '../../RecordEditors.tsx';
import { BookOpen, Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { LibrarySnapshot, MediaItem } from '../../../domain/types.ts';
import { Modal } from '../../components/MediaPrimitives.tsx';
import { bookId } from './bookView.ts';

type Collection = NonNullable<LibrarySnapshot['bookCollections']>[number];
export type BookCommit = (transform: (current: LibrarySnapshot) => LibrarySnapshot, message?: string) => boolean;
export function BookCollections({ snapshot, books, selected, onSelect, onCommit, disabled }: {
  snapshot: LibrarySnapshot; books: MediaItem[]; selected: string | null; onSelect: (id: string | null) => void; onCommit: BookCommit; disabled: boolean;
}) {
  const [editing, setEditing] = useState<Collection | 'new' | null>(null);
  return <aside className="books-collections books-surface" aria-label={t("主题书单")}><header><div><BookOpen size={17}/><strong>{t("主题书单")}</strong></div><button className="icon-button" disabled={disabled} aria-label={t("新建主题书单")} onClick={() => setEditing('new')}><Plus size={16}/></button></header>
    {selected && <button className="text-button books-clear-collection" onClick={() => onSelect(null)}>{t("查看所有书单")}<X size={13}/></button>}
    <div className="books-collection-items">{(snapshot.bookCollections ?? []).map(collection => {
      const count = books.filter(book => collection.bookIds.includes(book.id)).length;
      return <div key={collection.id} className={`books-collection ${selected === collection.id ? 'is-selected' : ''}`}><button className="books-collection-open" aria-pressed={selected === collection.id} onClick={() => onSelect(selected === collection.id ? null : collection.id)}><strong>{collection.title}</strong>{collection.description && <p>{collection.description}</p>}<small>{count} {" "}{t("本书")}</small></button><button className="icon-button" aria-label={t("编辑书单{0}", [collection.title])} disabled={disabled} onClick={() => setEditing(collection)}><Pencil size={13}/></button></div>;
    })}{!snapshot.bookCollections?.length && <p className="books-muted">{t("用书单串起一个主题，安排想读的书，也收下读过的收获。")}</p>}</div>
    {editing && <CollectionEditor initial={editing === 'new' ? undefined : editing} books={books} onClose={() => setEditing(null)} onSave={value => onCommit(current => { const existing = current.bookCollections ?? []; return { ...current, bookCollections: existing.some(collection => collection.id === value.id) ? existing.map(collection => collection.id === value.id ? { ...collection, ...value } : collection) : [...existing, value] }; }, '主题书单已保存')} onDelete={id => {
      if (!window.confirm(t('删除这个主题书单？书籍与阅读记录都会保留。'))) return false;
      const saved = onCommit(current => ({ ...current, bookCollections: (current.bookCollections ?? []).filter(value => value.id !== id) }), '主题书单已删除');
      if (saved && selected === id) onSelect(null); return saved;
    }}/ >}
  </aside>;
}
function CollectionEditor({ initial, books, onClose, onSave, onDelete }: { initial?: Collection; books: MediaItem[]; onClose: () => void; onSave: (value: Collection) => boolean; onDelete: (id: string) => boolean }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [chosen, setChosen] = useState(initial?.bookIds ?? []);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  function save() {
    if (!title.trim()) { setError('请填写书单名称。'); return; }
    if (onSave({ ...initial, id: initial?.id ?? bookId(), title: title.trim(), description: description.trim(), bookIds: chosen })) onClose();
    else setError('保存失败，内容仍保留，请重试。');
  }
  const dirty = title !== (initial?.title ?? '') || description !== (initial?.description ?? '') || chosen.join() !== (initial?.bookIds ?? []).join();
  useUnsavedChanges(dirty);
  const close = () => { if (!dirty || window.confirm(t('放弃尚未保存的书单修改？'))) onClose(); };
  return <Modal title={initial ? t('编辑主题书单') : t('新建主题书单')} onClose={close} className="books-dialog"><form onSubmit={event => { event.preventDefault(); save(); }}><label className="form-field">{t("书单名称")}<input value={title} onChange={event => setTitle(event.target.value)} maxLength={80} required/></label><label className="form-field">{t("主题与想法")}<textarea value={description} onChange={event => setDescription(event.target.value)} rows={2}/></label><label className="form-field">{t("分配书籍")}<input placeholder={t("搜索书名或作者")} value={query} onChange={event => setQuery(event.target.value)}/></label><div className="books-checklist">{books.filter(book => `${book.title} ${book.creator}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(book => <label key={book.id}><input type="checkbox" checked={chosen.includes(book.id)} onChange={() => setChosen(values => values.includes(book.id) ? values.filter(id => id !== book.id) : [...values, book.id])}/><span>{book.title}<small>{book.creator}</small></span></label>)}</div><p className="books-muted">{t("已选")}{" "}{chosen.length} {" "}{t("本")}</p>{error && <p role="alert" className="books-danger">{t(error)}</p>}<footer className="books-dialog-actions">{initial && <button type="button" className="text-button books-danger" onClick={() => { if (onDelete(initial.id)) onClose(); }}>{t("删除书单")}</button>}<button type="button" className="button button--secondary" onClick={close}>{t("取消")}</button><button className="button button--primary" type="submit">{t("保存书单")}</button></footer></form></Modal>;
}
