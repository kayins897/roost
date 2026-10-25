import {
ArrowUpRight,
Check,
Clock3,
Heart, Star, Bookmark
} from 'lucide-react';
import { memo } from 'react';
import { gamePlayStateFor } from '../../../domain/library.ts';
import { coverFinishFor } from '../../../domain/gameRating.ts';
import { COVER_FINISH_LABELS } from '../../components/libraryOptions.ts';
import { formatPlaytime,MEDIA_LABELS,platformsFor,tagsFor } from '../../../domain/library.ts';
import { completionFor, ENGAGEMENT_SHORT, engagementFor } from '../../../domain/gameProgress.ts';
import type { PlayEngagement } from '../../../domain/types.ts';
import type { MediaItem } from '../../../domain/types.ts';

import { GameStateIcon,Poster,StatusMark } from '../../components/MediaPrimitives.tsx';
/** 关系徽标图标沿用旧六态图形（语义近似）；通关用独立小标，不重做材质。 */
const ENGAGEMENT_ICON: Record<PlayEngagement, 'want' | 'playing' | 'paused' | 'abandoned'> = {
  planned: 'want', playing: 'playing', paused: 'paused', inactive: 'paused', abandoned: 'abandoned',
};
export const MediaCard = memo(function MediaCard({ item, onOpen, onMenu, variant, selecting = false, chosen = false }: { item: MediaItem; onOpen: (id: string) => void; onMenu: (id: string, x: number, y: number) => void; variant: 'grid' | 'list'; selecting?: boolean; chosen?: boolean }) {
  const gameState = item.category === 'game' ? gamePlayStateFor(item) : null;
  const engagement = item.category === 'game' ? engagementFor(item) : null;
  const completion = item.category === 'game' ? completionFor(item) : null;
  const finish = coverFinishFor(item);
  return <div className="media-card-shell" onContextMenu={event => { event.preventDefault(); onMenu(item.id, event.clientX, event.clientY); }}><button onKeyDown={event => { if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); onMenu(item.id, bounds.left + 20, bounds.top + 30); } }} className={`media-card media-card--${variant} ${chosen ? 'is-chosen' : ''}`} data-game-state={gameState ?? undefined} data-selecting={selecting || undefined} onClick={() => onOpen(item.id)} aria-pressed={selecting ? chosen : undefined} aria-label={selecting ? `${chosen ? '取消选择' : '选择'}${item.title}` : `查看${item.title}详情`}>
    {selecting && <span className="selection-indicator" aria-hidden="true">{chosen && <Check size={16} />}</span>}
    <div className="card-cover" data-finish={finish}><Poster item={item} />{finish !== 'standard' && <span className={`cover-foil cover-foil--${finish}`} aria-hidden="true" />}<span className="card-cover-shine" aria-hidden="true" />{item.favorite && <span className="card-favorite"><Heart size={14} fill="currentColor" /></span>}</div>
    <div className="card-info"><div className="card-name">{item.title}</div><div className="card-meta"><span>{item.category === 'game' ? platformsFor(item).join(' · ') || '未标注平台' : item.subcategory || MEDIA_LABELS[item.category]}</span><span className="meta-separator" /><span>{item.year || '未标注年份'}</span></div>
      <div className="card-foot">{gameState ? <div className="card-game-meta">
        <span className="card-playtime"><Clock3 size={14} /><strong>{item.playtimeMinutes === undefined ? '时长未记录' : formatPlaytime(item.playtimeMinutes)}</strong></span>
        {engagement && engagement !== 'unrecorded' && <span className={`card-game-state game-state--${ENGAGEMENT_ICON[engagement]}`}><GameStateIcon state={ENGAGEMENT_ICON[engagement]} size={12} />{ENGAGEMENT_SHORT[engagement]}</span>}
        {completion === 'cleared' && <span className="card-completion-mark">已通关</span>}
      </div> : <StatusMark status={item.status} />}<span className="card-arrow"><ArrowUpRight size={16} /></span></div>
      {item.category === 'game' && item.personalGrade !== undefined && <div className="card-personal-rating"><Star size={11} /><strong>{item.personalGrade}</strong>{finish !== 'standard' && <span>{COVER_FINISH_LABELS[finish]}</span>}</div>}
      {engagement !== null && (engagement === 'planned' || engagement === 'paused') && item.playPriority !== undefined && <div className="card-personal-rating"><Bookmark size={11} /><strong>{item.playPriority}</strong><span>待体验优先级</span></div>}
      {variant === 'list' && <div className="card-tags">{tagsFor(item).slice(0, 4).map(tag => <span key={tag}>{tag}</span>)}</div>}
    </div>
  </button>{!selecting && <button className="card-menu-button" aria-label={`${item.title}更多操作`} onClick={event => { const bounds = event.currentTarget.getBoundingClientRect(); onMenu(item.id, bounds.left, bounds.bottom + 5); }}>···</button>}</div>;
});

