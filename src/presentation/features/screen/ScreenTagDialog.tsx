import { t } from '../../i18n/index.ts';
import { useUnsavedChanges } from '../../RecordEditors.tsx';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { LibrarySnapshot, MediaItem } from '../../../domain/types.ts';
import { normalizeTags } from '../../../domain/library.ts';
import { Modal } from '../../components/MediaPrimitives.tsx';
import type { ScreenCommit } from './ScreenCollections.tsx';

export function ScreenTagsDialog({ snapshot, onCommit, onClose, onDeleted = () => undefined }: { snapshot: LibrarySnapshot; onCommit: ScreenCommit; onClose: () => void; onDeleted?: (tag: string) => void }) {
  const screens = snapshot.items.filter(item => item.category === 'screen' && !item.removedAt && !item.hiddenAt);
  const tags = normalizeTags([...(snapshot.screenTagCatalog ?? []), ...screens.flatMap(screen => screen.tags)]).sort((a, b) => a.localeCompare(b, 'zh'));
  return <ScreenTagDialog tags={tags} screens={screens} onCommit={onCommit} onClose={onClose} onDeleted={onDeleted}/>;
}

export function ScreenTagDialog({ tags, screens, onCommit, onClose, onDeleted }: { tags: string[]; screens: MediaItem[]; onCommit: ScreenCommit; onClose: () => void; onDeleted: (tag: string) => void }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  function reset() { setCurrent(null); setName(''); setChosen([]); setDirty(false); setError(''); }
  function select(tag: string | null) {
    if (dirty && !window.confirm(t('放弃当前标签尚未保存的分配？'))) return;
    setCurrent(tag); setName(tag ?? ''); setChosen(tag ? screens.filter(screen => screen.tags.some(value => value.toLocaleLowerCase() === tag.toLocaleLowerCase())).map(screen => screen.id) : []); setDirty(false); setError('');
  }
  const close = () => { if (!dirty || window.confirm(t('放弃尚未保存的标签修改？'))) onClose(); };
  function save() {
    const next = name.trim();
    if (!next) { setError('请填写标签名称。'); return; }
    if (tags.some(tag => tag.toLocaleLowerCase() === next.toLocaleLowerCase() && tag !== current)) { setError('已有同名标签，请选择该标签进行分配。'); return; }
    const visibleIds = new Set(screens.map(screen => screen.id));
    const saved = onCommit(snapshot => ({ ...snapshot, screenTagCatalog: normalizeTags([...(snapshot.screenTagCatalog ?? []).filter(tag => tag.toLocaleLowerCase() !== current?.toLocaleLowerCase()), next]), items: snapshot.items.map(item => {
      if (item.category !== 'screen' || !visibleIds.has(item.id) || item.removedAt || item.hiddenAt) return item;
      const existing = item.tags.filter(tag => tag.toLocaleLowerCase() !== current?.toLocaleLowerCase() && tag.toLocaleLowerCase() !== next.toLocaleLowerCase());
      const values = chosen.includes(item.id) ? [...existing, next] : existing;
      return values.join('\0') === item.tags.join('\0') ? item : { ...item, tags: values, updatedAt: new Date().toISOString() };
    }) }), '影视标签已保存');
    if (saved) { if (current && current !== next) onDeleted(current); setCurrent(next); setDirty(false); setError(''); }
    else setError('保存失败，当前标签和分配仍保留，请重试。');
  }
  function remove(tag: string) {
    if (!window.confirm(t(`删除标签「${tag}」及当前片库中的关联？隐藏和回收站内的记录保留。`))) return;
    if (onCommit(snapshot => ({ ...snapshot, screenTagCatalog: (snapshot.screenTagCatalog ?? []).filter(value => value.toLocaleLowerCase() !== tag.toLocaleLowerCase()), items: snapshot.items.map(item => item.category === 'screen' && !item.removedAt && !item.hiddenAt && item.tags.some(value => value.toLocaleLowerCase() === tag.toLocaleLowerCase()) ? { ...item, tags: item.tags.filter(value => value.toLocaleLowerCase() !== tag.toLocaleLowerCase()), updatedAt: new Date().toISOString() } : item) }), '影视标签已删除')) { onDeleted(tag); reset(); }
    else setError('删除失败，请重试。');
  }
  return <Modal title={t("管理影视标签")} onClose={close} className="books-dialog"><div className="books-tag-manager"><nav aria-label={t("已有影视标签")}><button className="button button--secondary" onClick={() => select(null)}><Plus size={14}/>{t("新增标签")}</button>{tags.map(tag => <button key={tag} className={`tag-filter ${current === tag ? 'is-selected' : ''}`} aria-pressed={current === tag} onClick={() => select(tag)}>{tag}</button>)}</nav><div><label className="form-field">{t("标签名称")}<input value={name} maxLength={60} onChange={event => { setName(event.target.value); setDirty(true); }}/></label><p className="books-muted">{t("选择要使用这个标签的影视")}</p><div className="books-checklist">{screens.map(screen => <label key={screen.id}><input type="checkbox" checked={chosen.includes(screen.id)} onChange={() => { setChosen(values => values.includes(screen.id) ? values.filter(id => id !== screen.id) : [...values, screen.id]); setDirty(true); }}/><span>{screen.title}</span></label>)}</div></div></div>{error && <p role="alert" className="books-danger">{t(error)}</p>}<footer className="books-dialog-actions">{current && <button className="text-button books-danger" onClick={() => remove(current)}><Trash2 size={14}/>{t("删除标签")}</button>}<button className="button button--secondary" onClick={close}>{t("完成")}</button><button className="button button--primary" onClick={save}>{t("保存标签")}</button></footer></Modal>;
}
