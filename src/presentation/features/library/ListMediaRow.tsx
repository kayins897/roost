import { Bookmark, Check, Clock3, MoreHorizontal, Star } from 'lucide-react';
import { useState, type RefObject } from 'react';
import { gradeEditable, priorityEditable } from '../../../domain/gameProgress.ts';
import { formatPlaytime, platformsFor } from '../../../domain/library.ts';
import type { MediaItem } from '../../../domain/types.ts';
import { Poster } from '../../components/MediaPrimitives.tsx';
import { GlassLayers } from '../glass/GlassLayers.tsx';
import { classificationFor, CLASSIFICATION_LABELS } from './experienceOptions.ts';
import { InlineImpression } from './InlineImpression.tsx';
import type { ListWritingGuard } from './useListWritingGuard.ts';

export function ListMediaRow({ item, selecting, chosen, onOpen, onMenu, onPatch, writingGuard, readOnly }: {
  item: MediaItem; selecting: boolean; chosen: boolean; readOnly: boolean;
  onOpen: (id: string) => void; onMenu: (id: string, x: number, y: number) => void;
  onPatch: (id: string, patch: Partial<MediaItem>) => boolean; writingGuard: RefObject<ListWritingGuard | null>;
}) {
  // The lens is attached only while interacting, avoiding hundreds of idle SVG filters.
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  const active = hovered || focused;
  const classification = classificationFor(item);
  function menu(target: HTMLElement) { const rect = target.getBoundingClientRect(); onMenu(item.id, rect.left, rect.bottom + 4); }
  return <article className={`list-media-row ${chosen ? 'is-chosen' : ''}`} data-game-state={classification} data-material-glass={active ? 'pane' : undefined}
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    onContextMenu={event => { if ((event.target as HTMLElement).closest('.list-impression')) return; event.preventDefault(); onMenu(item.id, event.clientX, event.clientY); }}>
    <GlassLayers />
    <div className="list-ranks" aria-label="优先级与评级">
      {priorityEditable(item) && <span title="游玩优先级"><Bookmark size={13} /><b>{item.playPriority ?? '—'}</b><small>优先级</small></span>}
      {gradeEditable(item) && <span title="通关评分"><Star size={13} /><b>{item.personalScore !== undefined ? item.personalScore.toFixed(1) : item.personalGrade ?? '—'}</b><small>{item.personalScore === undefined && item.personalGrade ? '历史评级' : '评分'}</small></span>}
    </div>
    <button className="list-cover-button" aria-label={selecting ? `${chosen ? '取消选择' : '选择'}${item.title}` : `查看${item.title}详情`} aria-pressed={selecting ? chosen : undefined} onClick={() => onOpen(item.id)} onKeyDown={event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); menu(event.currentTarget); } }}>
      <Poster item={item} />{selecting && <span className="list-selection">{chosen ? <Check size={18} /> : '○'}</span>}
    </button>
    <div className="list-work-info"><button onClick={() => onOpen(item.id)} className="list-work-title">{item.title}</button><small>{platformsFor(item).join(' · ') || '未标注平台'} · {item.year || '年份未记录'}</small><span className="list-playtime"><Clock3 size={13} /><strong>{item.playtimeMinutes === undefined ? '时长未记录' : formatPlaytime(item.playtimeMinutes)}</strong></span><span className={`list-classification experience-color--${classification}`}>{CLASSIFICATION_LABELS[classification]}</span></div>
    <InlineImpression item={item} locked={selecting || readOnly} onPatch={onPatch} guard={writingGuard} />
    <button className="list-menu-button icon-button" aria-label={`${item.title}更多操作`} onClick={event => menu(event.currentTarget)}><MoreHorizontal size={19} /></button>
  </article>;
}
