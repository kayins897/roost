import { Bookmark, Clock3, EyeOff, Heart, Pencil, Star, Tag, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { GAME_GRADES } from '../../../domain/gameRating.ts';
import { COMPLETION_LABELS, COMPLETION_STATUSES, completionFor, ENGAGEMENT_LABELS, engagementFor, gradeEditable, PLAY_ENGAGEMENTS, priorityEditable } from '../../../domain/gameProgress.ts';
import type { CompletionStatus, MediaItem, PersonalGrade, PlayEngagement } from '../../../domain/types.ts';
import './library.css';

export interface ItemMenu { id: string; x: number; y: number }
interface Props { menu: ItemMenu; item: MediaItem; onClose: () => void; onEngagement: (value: PlayEngagement) => boolean; onCompletion: (value: CompletionStatus) => boolean; onGrade: (mode: 'priority' | 'rating', value: PersonalGrade | undefined) => boolean; onQuick: (mode: 'time' | 'tags') => void; onEdit: () => void; onFavorite: () => void; onHide: () => void; onTrash: () => void; onRestore: () => void; onDelete: () => void }

// 待体验/已通关在菜单内附等级行。保存失败时菜单留在原位供重试，成功按约定关闭或就地展示等级行，
// 避免"菜单已关、误以为已保存"。
export function ContextMenu(props: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const { item, onClose } = props;
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const oldFocus = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node)) closeRef.current(); };
    const host = document.querySelector('.main-scroll');
    // 菜单打开期间保存可能让作品移出当前列表（如待体验改已通关），内容高度缩短使 scrollTop
    // 被钳制并触发 scroll——这类自身写入引起的布局调整不应中断内联设置。以内容高度为基准区分：
    // 高度变化视为布局调整（更新基准、保持菜单）；高度不变的滚动才是用户主动离开。
    let baseline = host?.scrollHeight ?? 0;
    const scroll = () => {
      const height = host?.scrollHeight ?? 0;
      if (height !== baseline) { baseline = height; return; }
      closeRef.current();
    };
    const resize = () => closeRef.current();
    document.addEventListener('pointerdown', dismiss); window.addEventListener('resize', resize); host?.addEventListener('scroll', scroll);
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', resize); host?.removeEventListener('scroll', scroll); if (oldFocus?.isConnected) oldFocus.focus(); };
  }, []);
  const run = (action: () => void) => { onClose(); action(); };
  // 双维度保存统一按结果处理：失败留在原位可重试，成功保持打开（等级行随资格重算出现/消失）。
  // 同值幂等按有效值比较——已是该关系/进度时点击不写库。
  const pickEngagement = (value: PlayEngagement) => {
    if (engagementFor(item) !== value && !props.onEngagement(value)) return;
  };
  const pickCompletion = (value: CompletionStatus) => {
    if (completionFor(item) !== value && !props.onCompletion(value)) return;
  };
  const pickGrade = (mode: 'priority' | 'rating', value: PersonalGrade | undefined) => { if (props.onGrade(mode, value)) onClose(); };
  const isGame = item.category === 'game' && !item.removedAt;
  const engagement = isGame ? engagementFor(item) : null;
  const completion = isGame ? completionFor(item) : null;
  const canPriority = isGame && priorityEditable(item);
  const canGrade = isGame && gradeEditable(item);
  return <div ref={panel} className="item-context-menu" role="menu" aria-label={`${item.title}快捷编辑`} style={{ left: Math.max(8, Math.min(props.menu.x, window.innerWidth - 248)), top: Math.max(8, Math.min(props.menu.y, window.innerHeight - (item.removedAt ? 170 : item.category === 'game' ? 660 : 290))) }} onKeyDown={event => {
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
      {isGame && <><span className="menu-section-label">当前关系</span><div className="context-states" role="group" aria-label="当前游玩关系">{PLAY_ENGAGEMENTS.map(value => <button role="menuitemradio" aria-checked={engagement === value} key={value} onClick={() => pickEngagement(value)}>{ENGAGEMENT_LABELS[value]}</button>)}</div>
        <span className="menu-section-label">通关进度</span><div className="context-states" role="group" aria-label="通关进度">{COMPLETION_STATUSES.map(value => <button role="menuitemradio" aria-checked={completion === value} key={value} onClick={() => pickCompletion(value)}>{COMPLETION_LABELS[value]}</button>)}</div>
        {canPriority && <div className="context-rank" role="group" aria-label="待体验优先级"><span className="menu-section-label"><Bookmark size={11} />待体验优先级</span><div className="context-grades">{GAME_GRADES.map(grade => <button role="menuitemradio" aria-checked={item.playPriority === grade} key={grade} onClick={() => pickGrade('priority', grade)}>{grade}</button>)}<button role="menuitemradio" aria-checked={item.playPriority === undefined} onClick={() => pickGrade('priority', undefined)}>未设置</button></div></div>}
        {canGrade && <div className="context-rank" role="group" aria-label="通关评级"><span className="menu-section-label"><Star size={11} />通关评级</span><div className="context-grades">{GAME_GRADES.map(grade => <button role="menuitemradio" aria-checked={item.personalGrade === grade} key={grade} onClick={() => pickGrade('rating', grade)}>{grade}</button>)}<button role="menuitemradio" aria-checked={item.personalGrade === undefined} onClick={() => pickGrade('rating', undefined)}>未设置</button></div></div>}
        <button role="menuitem" onClick={() => run(() => props.onQuick('time'))}><Clock3 size={14} />修改时长</button></>}
      <button role="menuitem" onClick={() => run(() => props.onQuick('tags'))}><Tag size={14} />编辑标签</button><button role="menuitem" onClick={() => run(props.onEdit)}><Pencil size={14} />编辑作品资料</button><button role="menuitem" onClick={() => run(props.onFavorite)}><Heart size={14} />{item.favorite ? '取消喜欢' : '标为喜欢'}</button><button role="menuitem" onClick={() => run(props.onHide)}><EyeOff size={14} />{item.hiddenAt ? '取消隐藏' : '隐藏作品'}</button><button role="menuitem" className="is-danger" onClick={() => run(props.onTrash)}><Trash2 size={14} />移到回收站</button>
    </>}
  </div>;
}
