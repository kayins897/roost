import { t } from '../../i18n/index.ts';
import {
ArrowRightLeft,
Check,
Pencil,
Tag,Trash2,
X
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { availableTags,GAME_TAG_KEYS,GAME_TAG_LABELS,gameTagCounts,MEDIA_LABELS } from '../../../domain/library.ts';
import type { GameTagGroupKey,MediaItem,MediaType } from '../../../domain/types.ts';

import { Modal } from '../../components/MediaPrimitives.tsx';
export type TagScope = { category?: MediaType; group?: GameTagGroupKey };
export function TagManager({ items, section, onClose, onRename, onDelete, onAssign, onMove, creating = false }: { items: MediaItem[]; section: MediaType; onClose: () => void; onRename: (oldName: string, newName: string, scope: TagScope) => boolean; onDelete: (name: string, scope: TagScope) => boolean; onAssign: (group: GameTagGroupKey, name: string) => void; onMove: (name: string, from: GameTagGroupKey, to: GameTagGroupKey) => boolean; creating?: boolean }) {
  const scopedItems = items.filter(item => item.category === section);
  const tags = availableTags(scopedItems);
  const grouped = gameTagCounts(scopedItems);
  const [editing, setEditing] = useState('');
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newGroup, setNewGroup] = useState<GameTagGroupKey>('other');
  const newTagInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (creating) newTagInput.current?.focus(); }, [creating]);
  const categoryScope: TagScope = { category: section };
  const scopeLabel = `当前${MEDIA_LABELS[section]}板块`;
  function renderRow(tag: { name: string; count: number }, rowKey: string, group?: GameTagGroupKey) {
    if (search && !tag.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) return null;
    const operationScope = { ...categoryScope, group };
    const affected = `${scopeLabel}${group ? ` / ${GAME_TAG_LABELS[group]}` : ''}的 ${tag.count} 件作品`;
    return <div className="manage-tag-row" key={rowKey}>
      {editing === rowKey ? <form className="tag-rename" onSubmit={e => { e.preventDefault(); if (draft.trim() && window.confirm(t(`将${affected}中的「${tag.name}」重命名为「${draft.trim()}」？同名标签将合并。`)) && onRename(tag.name, draft, operationScope)) setEditing(''); }}><input aria-label={t("标签新名称")} autoFocus value={draft} onChange={e => setDraft(e.target.value)} /><button className="icon-button icon-button--positive" type="submit" aria-label={t("确认")}><Check size={16} /></button><button type="button" className="icon-button" onClick={() => setEditing('')} aria-label={t("取消")}><X size={16} /></button></form> : <><div className="tag-info"><Tag size={14} /><span>{tag.name}</span><small>{tag.count} {" "}{t("件作品")}</small></div>{group && <label className="text-button tag-move-control"><ArrowRightLeft size={13} /><span>{t("移动到")}</span><select aria-label={t("移动{0}到分组", [tag.name])} value="" onChange={event => { const to = event.target.value as GameTagGroupKey; if (to) onMove(tag.name, group, to); }}><option value="">{t("选择分组…")}</option>{GAME_TAG_KEYS.filter(key => key !== group).map(key => <option key={key} value={key}>{t(GAME_TAG_LABELS[key])}</option>)}</select></label>}{group && <button className="text-button" onClick={() => onAssign(group, tag.name)}>{t("分配作品")}</button>}<button className="icon-button" onClick={() => { setEditing(rowKey); setDraft(tag.name); }} aria-label={t("重命名{0}", [tag.name])}><Pencil size={15} /></button><button className="icon-button icon-button--danger" onClick={() => { if (window.confirm(t(`从${affected}中删除「${tag.name}」标签？作品本身不会被删除。`))) onDelete(tag.name, operationScope); }} aria-label={t("删除{0}", [tag.name])}><Trash2 size={15} /></button></>}
    </div>;
  }
  const creation = section === 'game' && <section className="tag-assignment"><h3>{t("创建并分配标签")}</h3><label className="form-field">{t("分组")}<select value={newGroup} onChange={event => setNewGroup(event.target.value as GameTagGroupKey)}>{GAME_TAG_KEYS.map(group => <option key={group} value={group}>{t(GAME_TAG_LABELS[group])}</option>)}</select></label><label className="form-field">{t("新标签")}<input ref={newTagInput} value={newTag} maxLength={80} onChange={event => setNewTag(event.target.value)} placeholder={t("例如：下次和朋友玩")} /></label><button className="button button--secondary" disabled={!newTag.trim()} onClick={() => onAssign(newGroup, newTag.trim())}>{t("选择要添加的作品")}</button><p className="feature-help">{t("选择作品并应用后创建标签。")}</p></section>;
  return <Modal title={creating ? t('新增标签') : t('管理标签')} description={t("操作范围：{0}。{1}", [scopeLabel, section === 'game' ? '游戏仅修改当前标签分组，同名的其他分组保持原样。' : '每次操作会确认受影响的作品数量。'])} onClose={onClose}>
    {creating && creation}
    <label className="form-field feature-tag-search">{t("查找标签")}<input value={search} onChange={event => setSearch(event.target.value)} placeholder={t("输入标签名称")} /></label>
    <div className="tag-manager-list">{section === 'game' ? GAME_TAG_KEYS.map(key => <section className={`manager-tag-group tag-type--${key}`} key={key}><div className="manager-tag-group-title"><span>{t(GAME_TAG_LABELS[key])}</span><small>{grouped[key].length} {" "}{t("个标签")}</small></div>{grouped[key].length ? grouped[key].map(tag => renderRow(tag, `${key}:${tag.name}`, key)) : <p>{t("暂无此类标签")}</p>}</section>) : tags.length ? tags.map(tag => renderRow(tag, tag.name)) : <div className="empty-small">{t("还没有标签。在作品详情或新建作品时添加吧。")}</div>}</div>
    {!creating && creation}
    <div className="modal-actions"><button className="button button--primary" onClick={onClose}>{t("完成")}</button></div>
  </Modal>;
}

