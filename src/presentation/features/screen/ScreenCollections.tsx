import { useUnsavedChanges } from '../../RecordEditors.tsx';
import { Clapperboard, Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { LibrarySnapshot, MediaItem } from '../../../domain/types.ts';
import { screenKind } from '../../../domain/screenConsumption.ts';
import { Modal } from '../../components/MediaPrimitives.tsx';
import { screenId } from './screenView.ts';

type Collection = NonNullable<LibrarySnapshot['screenCollections']>[number];
export type ScreenCommit = (transform: (current: LibrarySnapshot) => LibrarySnapshot, message?: string) => boolean;
export function ScreenCollections({ snapshot, screens, selected, onSelect, onCommit, disabled }: {
  snapshot: LibrarySnapshot; screens: MediaItem[]; selected: string | null; onSelect: (id: string | null) => void; onCommit: ScreenCommit; disabled: boolean;
}) {
  const [editing, setEditing] = useState<Collection | 'new' | null>(null);
  const movies = screens.filter(screen => screenKind(screen) === 'movie');
  return <aside className="books-collections books-surface" aria-label="主题片单"><header><div><Clapperboard size={17}/><strong>主题片单</strong></div><button className="icon-button" disabled={disabled} aria-label="新建主题片单" onClick={() => setEditing('new')}><Plus size={16}/></button></header>
    {selected && <button className="text-button books-clear-collection" onClick={() => onSelect(null)}>查看所有片单<X size={13}/></button>}
    <div className="books-collection-items">{(snapshot.screenCollections ?? []).map(collection => {
      const count = movies.filter(screen => collection.screenIds.includes(screen.id)).length;
      return <div key={collection.id} className={`books-collection ${selected === collection.id ? 'is-selected' : ''}`}><button className="books-collection-open" aria-pressed={selected === collection.id} onClick={() => onSelect(selected === collection.id ? null : collection.id)}><strong>{collection.title}</strong>{collection.description && <p>{collection.description}</p>}<small>{count} 部作品</small></button><button className="icon-button" aria-label={`编辑片单${collection.title}`} disabled={disabled} onClick={() => setEditing(collection)}><Pencil size={13}/></button></div>;
    })}{!snapshot.screenCollections?.length && <p className="books-muted">把想看的作品和看过的回忆，收进自己的主题片单。</p>}</div>
    {editing && <CollectionEditor initial={editing === 'new' ? undefined : editing} screens={movies} onClose={() => setEditing(null)} onSave={value => onCommit(current => {
      const existing = current.screenCollections ?? [], previous = existing.find(collection => collection.id === value.id);
      // Editing movie membership never removes old mixed-list or unavailable members.
      const activeIds = new Set(current.items.filter(item => item.category === 'screen' && screenKind(item) === 'movie' && !item.hiddenAt && !item.removedAt).map(item => item.id));
      const screenIds = [...new Set([...value.screenIds.filter(id => activeIds.has(id)), ...(previous?.screenIds ?? []).filter(id => !activeIds.has(id))])];
      const saved = { ...previous, ...value, screenIds };
      return { ...current, screenCollections: previous ? existing.map(collection => collection.id === value.id ? saved : collection) : [...existing, saved] };
    }, '主题片单已保存')} onDelete={id => {
      if (!window.confirm('删除这个主题片单？作品与观看记录都会保留。')) return false;
      const saved = onCommit(current => ({ ...current, screenCollections: (current.screenCollections ?? []).filter(value => value.id !== id) }), '主题片单已删除');
      if (saved && selected === id) onSelect(null); return saved;
    }}/ >}
  </aside>;
}
function CollectionEditor({ initial, screens, onClose, onSave, onDelete }: { initial?: Collection; screens: MediaItem[]; onClose: () => void; onSave: (value: Collection) => boolean; onDelete: (id: string) => boolean }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [chosen, setChosen] = useState(initial?.screenIds ?? []);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  function save() {
    if (!title.trim()) { setError('请填写片单名称。'); return; }
    if (onSave({ ...initial, id: initial?.id ?? screenId(), title: title.trim(), description: description.trim(), screenIds: chosen })) onClose();
    else setError('保存失败，内容仍保留，请重试。');
  }
  const dirty = title !== (initial?.title ?? '') || description !== (initial?.description ?? '') || chosen.join() !== (initial?.screenIds ?? []).join();
  useUnsavedChanges(dirty);
  const close = () => { if (!dirty || window.confirm('放弃尚未保存的片单修改？')) onClose(); };
  return <Modal title={initial ? '编辑主题片单' : '新建主题片单'} onClose={close} className="books-dialog"><form onSubmit={event => { event.preventDefault(); save(); }}><label className="form-field">片单名称<input value={title} onChange={event => setTitle(event.target.value)} maxLength={80} required/></label><label className="form-field">主题与想法<textarea value={description} onChange={event => setDescription(event.target.value)} rows={2}/></label><label className="form-field">分配电影<input placeholder="搜索名称或导演" value={query} onChange={event => setQuery(event.target.value)}/></label><div className="books-checklist">{screens.filter(screen => `${screen.title} ${screen.creator}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(screen => <label key={screen.id}><input type="checkbox" checked={chosen.includes(screen.id)} onChange={() => setChosen(values => values.includes(screen.id) ? values.filter(id => id !== screen.id) : [...values, screen.id])}/><span>{screen.title}<small>{screen.creator}</small></span></label>)}</div><p className="books-muted">已选 {chosen.filter(id => screens.some(screen => screen.id === id)).length} 部电影</p>{error && <p role="alert" className="books-danger">{error}</p>}<footer className="books-dialog-actions">{initial && <button type="button" className="text-button books-danger" onClick={() => { if (onDelete(initial.id)) onClose(); }}>删除片单</button>}<button type="button" className="button button--secondary" onClick={close}>取消</button><button className="button button--primary" type="submit">保存片单</button></footer></form></Modal>;
}
