import { Bookmark, Clock3, EyeOff, Heart, Pencil, Star, Tag, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { GAME_GRADES } from '../../../domain/gameRating.ts';
import { GAME_PLAY_LABELS, GAME_PLAY_STATES, gamePlayStateFor } from '../../../domain/library.ts';
import type { GamePlayState, MediaItem, PersonalGrade } from '../../../domain/types.ts';
import { GameStateIcon } from '../../components/MediaPrimitives.tsx';
import './library.css';

export interface ItemMenu { id: string; x: number; y: number }
interface Props { menu: ItemMenu; item: MediaItem; onClose: () => void; onState: (value: GamePlayState) => boolean; onGrade: (mode: 'priority' | 'rating', value: PersonalGrade | undefined) => boolean; onQuick: (mode: 'time' | 'tags') => void; onEdit: () => void; onFavorite: () => void; onHide: () => void; onTrash: () => void; onRestore: () => void; onDelete: () => void }

// 待体验/已通关在菜单内附等级行：状态或等级保存失败时菜单留在原位供重试，
// 只有等级保存成功或选择其他状态才关闭，避免"菜单已关、误以为已保存"。
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
  // 待体验/已通关保存后菜单保持打开（item 随快照更新，等级行随之出现）；
  // 保存失败同样保持打开，由 toast 反馈错误，可在原位重试。
  const pickState = (value: GamePlayState) => { if (value === 'want' || value === 'cleared') { props.onState(value); return; } run(() => props.onState(value)); };
  const pickGrade = (mode: 'priority' | 'rating', value: PersonalGrade | undefined) => { if (props.onGrade(mode, value)) onClose(); };
  const state = item.category === 'game' ? gamePlayStateFor(item) : null;
  const planned = state === 'want', completed = state === 'cleared';
  return <div ref={panel} className="item-context-menu" role="menu" aria-label={`${item.title}快捷编辑`} style={{ left: Math.max(8, Math.min(props.menu.x, window.innerWidth - 248)), top: Math.max(8, Math.min(props.menu.y, window.innerHeight - (item.removedAt ? 170 : item.category === 'game' ? 545 : 290))) }} onKeyDown={event => {
    const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const row = (document.activeElement as HTMLElement | null)?.closest('.context-grades');
      if (!row) return;
      event.preventDefault();
      const grades = [...row.querySelectorAll<HTMLButtonElement>('button')];
      const at = grades.indexOf(document.activeElement as HTMLButtonElement);
      grades[(at + (event.key === 'ArrowRight' ? 1 : -1) + grades.length) % grades.length]?.focus();
    }
  }}>
    <strong>{item.title}</strong>
    {item.removedAt ? <><button role="menuitem" onClick={() => run(props.onRestore)}>恢复作品</button><button role="menuitem" className="is-danger" onClick={() => run(props.onDelete)}><Trash2 size={14} />永久删除</button></> : <>
      {item.category === 'game' && <><span className="menu-section-label">游玩状态</span><div className="context-states">{GAME_PLAY_STATES.map(value => <button role="menuitem" data-game-state={value} key={value} onClick={() => pickState(value)}><GameStateIcon state={value} size={14} />{GAME_PLAY_LABELS[value]}</button>)}</div>
        {planned && <div className="context-rank" role="group" aria-label="待体验优先级"><span className="menu-section-label"><Bookmark size={11} />待体验优先级</span><div className="context-grades">{GAME_GRADES.map(grade => <button role="menuitemradio" aria-checked={item.playPriority === grade} key={grade} onClick={() => pickGrade('priority', grade)}>{grade}</button>)}<button role="menuitemradio" aria-checked={item.playPriority === undefined} onClick={() => pickGrade('priority', undefined)}>未设置</button></div></div>}
        {completed && <div className="context-rank" role="group" aria-label="通关评级"><span className="menu-section-label"><Star size={11} />通关评级</span><div className="context-grades">{GAME_GRADES.map(grade => <button role="menuitemradio" aria-checked={item.personalGrade === grade} key={grade} onClick={() => pickGrade('rating', grade)}>{grade}</button>)}<button role="menuitemradio" aria-checked={item.personalGrade === undefined} onClick={() => pickGrade('rating', undefined)}>未设置</button></div></div>}
        <button role="menuitem" onClick={() => run(() => props.onQuick('time'))}><Clock3 size={14} />修改时长</button></>}
      <button role="menuitem" onClick={() => run(() => props.onQuick('tags'))}><Tag size={14} />编辑标签</button><button role="menuitem" onClick={() => run(props.onEdit)}><Pencil size={14} />编辑作品资料</button><button role="menuitem" onClick={() => run(props.onFavorite)}><Heart size={14} />{item.favorite ? '取消喜欢' : '标为喜欢'}</button><button role="menuitem" onClick={() => run(props.onHide)}><EyeOff size={14} />{item.hiddenAt ? '取消隐藏' : '隐藏作品'}</button><button role="menuitem" className="is-danger" onClick={() => run(props.onTrash)}><Trash2 size={14} />移到回收站</button>
    </>}
  </div>;
}
