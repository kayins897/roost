import {
Bookmark,
CheckCircle2,
CircleX,
Infinity as InfinityIcon,
PauseCircle,
PlayCircle,
X
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useRef } from 'react';
import { MEDIA_LABELS,STATUS_LABELS } from '../../domain/library.ts';
import type { GamePlayState,MediaItem,ProgressStatus } from '../../domain/types.ts';
import { useDialogKeyboard } from '../useDialogKeyboard.ts';

export function Poster({ item, large = false }: { item: MediaItem; large?: boolean }) {
  return (
    <div className={`poster poster--${item.artwork} ${large ? 'poster--large' : ''}`}>
      {item.coverUrl ? <img className="poster-image" src={item.coverUrl} alt={`${item.title}封面`} /> : <>
        <div className="poster-aura" aria-hidden="true" />
        <div className="poster-lettermark" aria-hidden="true">{item.title.slice(0, 1)}</div>
        <div className="poster-copy"><span>{MEDIA_LABELS[item.category]}</span><strong>{item.title}</strong><small>{item.creator || '栖域收藏'}</small></div>
      </>}
    </div>
  );
}

export function StatusMark({ status }: { status: ProgressStatus }) {
  return <span className={`status-mark status--${status}`}><span className="status-dot" />{STATUS_LABELS[status]}</span>;
}

export function GameStateIcon({ state, size = 16 }: { state: GamePlayState; size?: number }) {
  if (state === 'cleared') return <CheckCircle2 size={size} strokeWidth={2.2} />;
  if (state === 'replaying' || state === 'ongoing') return <InfinityIcon size={size} strokeWidth={2.2} />;
  if (state === 'playing') return <PlayCircle size={size} strokeWidth={2.2} />;
  if (state === 'paused') return <PauseCircle size={size} strokeWidth={2.2} />;
  if (state === 'abandoned') return <CircleX size={size} strokeWidth={2.2} />;
  return <Bookmark size={size} strokeWidth={2.2} />;
}

export function Modal({ title, description, onClose, children, wide = false, className = '', headingActions }: { title: string; description?: string; onClose: () => void; children: ReactNode; wide?: boolean; className?: string; headingActions?: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  useDialogKeyboard(panel, onClose, { filterVisible: true });
  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panel} className={`modal ${wide ? 'modal--wide' : ''} ${className}`} data-glass="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{headingActions}<button className="icon-button" onClick={onClose} aria-label="关闭"><X size={19} /></button></div>
        {children}
      </section>
    </div>
  );
}

