import { useState, type DragEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, GripVertical } from 'lucide-react';
import { groupRankedGames, type RankMode } from '../../../domain/gamePlanning.ts';
import { gamePlayStateFor } from '../../../domain/library.ts';
import type { MediaItem } from '../../../domain/types.ts';
import type { SortDirection } from '../../../domain/librarySort.ts';
import './ranked-gallery.css';

type Props = { items: MediaItem[]; mode: RankMode; view: 'grid' | 'list'; manualOrder: boolean; rankDirection?: SortDirection; reorderEnabled: boolean; renderItem: (item: MediaItem) => ReactNode; onMove: (sourceId: string, targetId: string) => boolean };
const dragType = 'application/x-qiyu-ranked-game';
export function RankedGallery({ items, mode, view, manualOrder, rankDirection = 'desc', reorderEnabled, renderItem, onMove }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<string | null>(null), [over, setOver] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const groups = groupRankedGames(items, mode, manualOrder, rankDirection).filter(group => group.items.length);
  function move(sourceId: string, targetId: string) {
    if (!reorderEnabled) return;
    const title = items.find(item => item.id === sourceId)?.title ?? '作品';
    const saved = onMove(sourceId, targetId);
    setNotice(saved ? `已调整《${title}》的同档顺序` : '顺序未能保存，请重试');
    setDragging(null); setOver(null);
  }
  function allowed(sourceId: string, target: MediaItem, groupItems: MediaItem[]) {
    const source = groupItems.find(item => item.id === sourceId);
    return reorderEnabled && source !== undefined && sourceId !== target.id && gamePlayStateFor(source) === gamePlayStateFor(target);
  }
  function start(event: DragEvent<HTMLDivElement>, item: MediaItem) {
    if (!reorderEnabled || (event.target instanceof Element && event.target.closest('[data-rank-controls] button,.card-menu-button'))) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(dragType, item.id); setDragging(item.id);
  }
  return <div className={`ranked-gallery ranked-gallery--${view}`} data-rank-mode={mode} data-reorder-enabled={reorderEnabled}>
    <p className="ranked-gallery__hint">{reorderEnabled ? '可在同档内拖动封面排序，也可用封面左上角的上移／下移按钮。' : `分档展示当前结果；选择“${mode === 'priority' ? '优先级' : '评级'}”并退出多选后可调整同档顺序。`}</p>
    <span className="ranked-gallery__notice" role="status" aria-live="polite">{notice}</span>
    {groups.map(group => <details key={`${mode}-${group.id}`} className={`ranked-gallery__group ${group.id === 'paused' ? 'ranked-gallery__group--paused' : ''}`} open={!collapsed.has(`${mode}-${group.id}`)} onToggle={event => {
      const closed = !event.currentTarget.open, key = `${mode}-${group.id}`;
      setCollapsed(previous => { if (previous.has(key) === closed) return previous; const next = new Set(previous); if (closed) next.add(key); else next.delete(key); return next; });
    }}>
      <summary className={group.id === 'paused' ? 'plan-divider' : undefined}>
        <span className={`ranked-gallery__badge ${group.id === 'unranked' || group.id === 'paused' ? 'ranked-gallery__badge--plain' : ''}`}>{group.id === 'paused' ? 'Ⅱ' : group.id === 'unranked' ? '—' : group.label}</span>
        <strong>{group.id === 'paused' || group.id === 'unranked' ? group.label : `${mode === 'priority' ? '优先级' : '个人评级'} ${group.label}`}</strong><small>{group.items.length} 款</small><ChevronDown size={16} />
      </summary>
      <div className={`media-gallery media-gallery--${view} ranked-gallery__items`}>
        {group.items.map(item => {
          const peers = group.items.filter(peer => gamePlayStateFor(peer) === gamePlayStateFor(item)), position = peers.findIndex(peer => peer.id === item.id);
          return <div key={item.id} className={`ranked-gallery__entry ${dragging === item.id ? 'is-dragging' : ''} ${over === item.id ? 'is-drop-target' : ''}`} data-rank-item={item.id} draggable={reorderEnabled} onDragStart={event => start(event, item)} onDragEnd={() => { setDragging(null); setOver(null); }} onDragOver={event => {
            if (dragging && allowed(dragging, item, group.items)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(item.id); }
          }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null); }} onDrop={event => {
            const source = event.dataTransfer.getData(dragType);
            if (source && allowed(source, item, group.items)) { event.preventDefault(); move(source, item.id); }
            else { setDragging(null); setOver(null); }
          }}>
            {renderItem(item)}
            {reorderEnabled && <div className="ranked-gallery__tools" data-rank-controls="true"><GripVertical size={14} aria-hidden="true" /><button type="button" aria-label={`上移《${item.title}》`} title="上移" disabled={position === 0} onClick={() => move(item.id, peers[position - 1].id)}><ArrowUp size={14} /></button><button type="button" aria-label={`下移《${item.title}》`} title="下移" disabled={position === peers.length - 1} onClick={() => move(item.id, peers[position + 1].id)}><ArrowDown size={14} /></button></div>}
          </div>;
        })}
      </div>
    </details>)}
  </div>;
}
