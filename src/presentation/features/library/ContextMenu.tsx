import { Clock3,EyeOff,Heart,Pencil,Tag,Trash2 } from 'lucide-react';
import { useEffect,useRef } from 'react';
import { GAME_PLAY_LABELS,GAME_PLAY_STATES } from '../../../domain/library.ts';
import type { GamePlayState,MediaItem } from '../../../domain/types.ts';
import { GameStateIcon } from '../../components/MediaPrimitives.tsx';
import './library.css';

export interface ItemMenu { id: string; x: number; y: number }
interface Props { menu: ItemMenu; item: MediaItem; onClose: () => void; onState: (value: GamePlayState) => void; onQuick: (mode: 'time' | 'tags') => void; onEdit: () => void; onFavorite: () => void; onHide: () => void; onTrash: () => void; onRestore: () => void; onDelete: () => void }
export function ContextMenu(props: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const { item, onClose } = props;
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const oldFocus = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node)) closeRef.current(); };
    const scroll = () => closeRef.current();
    document.addEventListener('pointerdown', dismiss); window.addEventListener('resize', scroll); document.querySelector('.main-scroll')?.addEventListener('scroll', scroll);
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', scroll); document.querySelector('.main-scroll')?.removeEventListener('scroll', scroll); if (oldFocus?.isConnected) oldFocus.focus(); };
  }, []);
  const run = (action: () => void) => { onClose(); action(); };
  return <div ref={panel} className="item-context-menu" role="menu" aria-label={`${item.title}快捷编辑`} style={{ left: Math.max(8, Math.min(props.menu.x, window.innerWidth - 248)), top: Math.max(8, Math.min(props.menu.y, window.innerHeight - (item.removedAt ? 170 : item.category === 'game' ? 475 : 290))) }} onKeyDown={event => {
    const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
  }}>
    <strong>{item.title}</strong>
    {item.removedAt ? <><button role="menuitem" onClick={() => run(props.onRestore)}>恢复作品</button><button role="menuitem" className="is-danger" onClick={() => run(props.onDelete)}><Trash2 size={14} />永久删除</button></> : <>
      {item.category === 'game' && <><span className="menu-section-label">游玩状态</span><div className="context-states">{GAME_PLAY_STATES.map(value => <button role="menuitem" data-game-state={value} key={value} onClick={() => run(() => props.onState(value))}><GameStateIcon state={value} size={14} />{GAME_PLAY_LABELS[value]}</button>)}</div><button role="menuitem" onClick={() => run(() => props.onQuick('time'))}><Clock3 size={14} />修改时长</button></>}
      <button role="menuitem" onClick={() => run(() => props.onQuick('tags'))}><Tag size={14} />编辑标签</button><button role="menuitem" onClick={() => run(props.onEdit)}><Pencil size={14} />编辑作品资料</button><button role="menuitem" onClick={() => run(props.onFavorite)}><Heart size={14} />{item.favorite ? '取消喜欢' : '标为喜欢'}</button><button role="menuitem" onClick={() => run(props.onHide)}><EyeOff size={14} />{item.hiddenAt ? '取消隐藏' : '隐藏作品'}</button><button role="menuitem" className="is-danger" onClick={() => run(props.onTrash)}><Trash2 size={14} />移到回收站</button>
    </>}
  </div>;
}
