import {
ArrowUpRight,
Check,
Clock3,
Heart, Star
} from 'lucide-react';
import { memo, type RefObject } from 'react';
import { gameVisualState } from './gameVisualState.ts';
import { useCoverFinish } from '../materials/useCoverFinish.ts';
import { formatPlaytime,MEDIA_LABELS,tagsFor } from '../../../domain/library.ts';
import type { MediaItem } from '../../../domain/types.ts';

import { ListMediaRow } from './ListMediaRow.tsx';
import type { ListWritingGuard } from './useListWritingGuard.ts';
import { Poster,StatusMark } from '../../components/MediaPrimitives.tsx';
export const MediaCard = memo(function MediaCard({ item, onOpen, onMenu, variant, selecting = false, chosen = false, onPatch, writingGuard, readOnly = false }: { item: MediaItem; onOpen: (id: string) => void; onMenu: (id: string, x: number, y: number) => void; variant: 'grid' | 'list'; selecting?: boolean; chosen?: boolean; readOnly?: boolean; onPatch: (id: string, patch: Partial<MediaItem>) => boolean; writingGuard: RefObject<ListWritingGuard | null> }) {
  const finish = useCoverFinish(item);
  if (variant === 'list' && item.category === 'game') return <ListMediaRow {...{item, onOpen, onMenu, selecting, chosen, onPatch, writingGuard, readOnly}} />;
  const gameState = gameVisualState(item);
  return <div className="media-card-shell" onContextMenu={event => { event.preventDefault(); onMenu(item.id, event.clientX, event.clientY); }}><button onKeyDown={event => { if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); onMenu(item.id, bounds.left + 20, bounds.top + 30); } }} className={`media-card media-card--${variant} ${chosen ? 'is-chosen' : ''}`} data-game-state={gameState ?? undefined} data-selecting={selecting || undefined} onClick={() => onOpen(item.id)} aria-pressed={selecting ? chosen : undefined} aria-label={selecting ? `${chosen ? '取消选择' : '选择'}${item.title}` : `查看${item.title}详情`}>
    {selecting && <span className="selection-indicator" aria-hidden="true">{chosen && <Check size={16} />}</span>}
    <div className="card-cover" data-finish={finish}><Poster item={item} />{finish !== 'standard' && <span className={`cover-foil cover-foil--${finish}`} aria-hidden="true" />}<span className="card-cover-shine" aria-hidden="true" />{item.favorite && <span className="card-favorite"><Heart size={14} fill="currentColor" /></span>}</div>
    <div className="card-info"><div className="card-name" title={item.title}>{item.title}</div>
      {item.category === 'game' ? <div className="card-game-summary">
        <span className="card-playtime"><Clock3 size={13} /><strong>{item.playtimeMinutes === undefined ? '时长未记录' : formatPlaytime(item.playtimeMinutes)}</strong></span>
        <span className={`card-personal-rating card-score${item.personalScore === undefined ? ' is-unrated' : ''}`} aria-label={item.personalScore !== undefined ? `个人评分 ${item.personalScore.toFixed(1)} 分` : item.personalGrade ? `历史评级 ${item.personalGrade}，尚未评分` : '尚未评分'}><Star size={13}/><strong>{item.personalScore !== undefined ? item.personalScore.toFixed(1) : item.personalGrade ?? '未评分'}</strong>{item.personalScore !== undefined && <small>分</small>}{item.personalScore === undefined && item.personalGrade && <small>历史</small>}</span>
      </div> : <><div className="card-meta"><span>{item.subcategory || MEDIA_LABELS[item.category]}</span><span className="meta-separator"/><span>{item.year || '未标注年份'}</span></div><div className="card-foot"><StatusMark status={item.status}/><span className="card-arrow"><ArrowUpRight size={16}/></span></div></>}
      {variant === 'list' && <div className="card-tags">{tagsFor(item).slice(0, 4).map(tag => <span key={tag}>{tag}</span>)}</div>}
    </div>
  </button>{!selecting && <button className="card-menu-button" aria-label={`${item.title}更多操作`} onClick={event => { const bounds = event.currentTarget.getBoundingClientRect(); onMenu(item.id, bounds.left, bounds.bottom + 5); }}>···</button>}</div>;
});

