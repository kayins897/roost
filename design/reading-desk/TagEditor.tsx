import { Check, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Dialog } from '../reading-workspace/ui';
import { BookCover } from './BookCover';
import { cleanTags } from './book-tags';
import type { DeskProps } from './types';

export function BookTagEditor({ state, tags, changeTags, workId, onClose }: DeskProps & { workId: string; onClose: () => void }) {
  const work = state.works.find(work => work.id === workId)!;
  const [draft, setDraft] = useState(tags.byBook[workId] ?? []);
  const [created, setCreated] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  function add() {
    const value = name.trim();
    if (!value || value.length > 32) { setError('标签名称为 1–32 个字'); return; }
    const canonical = [...tags.names, ...created].find(tag => tag.toLocaleLowerCase() === value.toLocaleLowerCase()) ?? value;
    setCreated(previous => cleanTags([...previous, canonical]));
    setDraft(previous => cleanTags([...previous, canonical])); setName(''); setError('');
  }
  return <Dialog title={`《${work.title}》的标签`} onClose={onClose}>
    <div className="rd-tag-choices" role="group" aria-label="选择已有标签">{cleanTags([...tags.names, ...created]).map(tag => <button key={tag} className="rd-tag-chip" aria-pressed={draft.includes(tag)} onClick={() => setDraft(previous => previous.includes(tag) ? previous.filter(name => name !== tag) : [...previous, tag])}>{draft.includes(tag) && <Check size={12}/>}<span>{tag}</span></button>)}</div>
    <form className="rd-tag-create" onSubmit={event => { event.preventDefault(); add(); }}><input aria-label="新标签名称" placeholder="新标签名称" maxLength={32} value={name} onChange={event => setName(event.target.value)}/><button className="rd-button" aria-label="添加新标签" type="submit"><Plus size={16}/></button></form>
    {error && <p className="rw-error" role="alert">{error}</p>}
    <div className="rw-dialog-action"><button className="rd-button" onClick={onClose}>取消</button><button className="rd-button rd-button--primary" onClick={() => { changeTags({ type: 'book', workId, names: draft }); onClose(); }}>保存标签</button></div>
  </Dialog>;
}

export function TagManager({ state, tags, changeTags, onClose }: DeskProps & { onClose: () => void }) {
  const [selected, setSelected] = useState(tags.names[0] ?? '');
  const [draft, setDraft] = useState(state.works.filter(work => tags.byBook[work.id]?.includes(selected)).map(work => work.id));
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const current = state.works.filter(work => tags.byBook[work.id]?.includes(selected)).map(work => work.id);
  const changed = state.works.filter(work => current.includes(work.id) !== draft.includes(work.id)).length;
  function select(tag: string) {
    if (changed && !window.confirm('放弃当前尚未应用的标签分配？')) return;
    setSelected(tag); setDraft(state.works.filter(work => tags.byBook[work.id]?.includes(tag)).map(work => work.id)); setSaved('');
  }
  function create() {
    const value = name.trim();
    if (!value || value.length > 32) { setError('标签名称为 1–32 个字'); return; }
    if (tags.names.some(tag => tag.toLocaleLowerCase() === value.toLocaleLowerCase())) { setError('已有这个标签，可直接选中后分配书籍'); return; }
    if (changed && !window.confirm('放弃当前尚未应用的标签分配？')) return;
    changeTags({ type: 'create', name: value }); setSelected(value); setDraft([]); setName(''); setError(''); setSaved('标签已创建，勾选书籍后应用');
  }
  function remove() {
    if (!selected || !window.confirm(`删除“${selected}”标签？将从 ${current.length} 本书移除，书籍和阅读记录保留。`)) return;
    changeTags({ type: 'delete', name: selected });
    const next = tags.names.find(tag => tag !== selected) ?? '';
    setSelected(next); setDraft(state.works.filter(work => tags.byBook[work.id]?.includes(next)).map(work => work.id)); setSaved('标签已删除');
  }
  function close() { if (!changed || window.confirm('放弃当前尚未应用的标签分配？')) onClose(); }
  return <Dialog title="书籍标签" wide onClose={close}>
    <form className="rd-tag-create" onSubmit={event => { event.preventDefault(); create(); }}><input aria-label="新标签名称" placeholder="输入新标签名称" maxLength={32} value={name} onChange={event => setName(event.target.value)}/><button className="rd-button" type="submit"><Plus size={15}/>创建标签</button></form>
    {error && <p className="rw-error" role="alert">{error}</p>}
    <div className="rd-tag-manager"><div className="rd-tag-catalog" role="group" aria-label="已有标签">{tags.names.map(tag => <button key={tag} aria-pressed={selected === tag} onClick={() => select(tag)}>{tag}<small>{Object.values(tags.byBook).filter(names => names.includes(tag)).length}</small></button>)}</div>
      <div className="rd-tag-assignment"><header><h3>{selected || '还没有标签'}</h3>{selected && <button className="rd-icon rd-delete-tag" aria-label={`删除标签：${selected}`} title="删除标签" onClick={remove}><Trash2 size={16}/></button>}</header>
        {selected && <><p className="rw-muted">选择拥有此标签的书籍</p><div className="rd-tag-books">{state.works.map(work => <label key={work.id}><input type="checkbox" aria-label={`将${selected}分配给《${work.title}》`} checked={draft.includes(work.id)} onChange={event => { setDraft(previous => event.target.checked ? [...previous, work.id] : previous.filter(id => id !== work.id)); setSaved(''); }}/><BookCover id={work.id} title={work.title} author={work.subtitle}/><span>{work.title}<small>{work.subtitle}</small></span></label>)}</div></>}
      </div>
    </div>
    <footer className="rd-tag-manager-footer"><span role="status">{changed ? `将更新 ${changed} 本书` : saved || `已分配 ${current.length} 本书`}</span><div><button className="rd-button" onClick={close}>完成</button><button className="rd-button rd-button--primary" disabled={!changed} onClick={() => { changeTags({ type: 'assign', name: selected, workIds: draft }); setSaved('已应用标签分配'); }}>应用分配</button></div></footer>
  </Dialog>;
}
