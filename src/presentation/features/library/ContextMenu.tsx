import { Bookmark, Clock3, EyeOff, Heart, Pencil, Star, Tag, Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GAME_GRADES } from '../../../domain/gameRating.ts';
import { gradeEditable, priorityEditable } from '../../../domain/gameProgress.ts';
import type { MediaItem, PersonalGrade } from '../../../domain/types.ts';
import type { GameExperienceClassification } from '../../../domain/gameExperience.ts';
import { CLASSIFICATIONS, CLASSIFICATION_LABELS, classificationFor } from './experienceOptions.ts';
import './library.css';

export interface ItemMenu { id: string; x: number; y: number }
interface Props { menu: ItemMenu; item: MediaItem; onClose: () => void; onClassification: (value: GameExperienceClassification) => boolean; onGrade: (mode: 'priority' | 'rating', value: PersonalGrade | undefined) => boolean; onQuick: (mode: 'time' | 'tags') => void; onEdit: () => void; onFavorite: () => void; onHide: () => void; onTrash: () => void; onRestore: () => void; onDelete: () => void }

// 待体验/已通关在菜单内附等级行。保存失败时菜单留在原位供重试，成功按约定关闭或就地展示等级行，
// 避免"菜单已关、误以为已保存"。
export function ContextMenu(props: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const { item, onClose } = props;
  const closeRef = useRef(onClose); closeRef.current = onClose;
  // 实测自适配：渲染后按真实高度钳制，保证整菜单在视口内（矮窗口依赖自身滚动）。
  const [position, setPosition] = useState({ left: Math.max(8, Math.min(props.menu.x, window.innerWidth - 248)), top: Math.max(8, Math.min(props.menu.y, window.innerHeight - 200)) });
  useLayoutEffect(() => {
    const node = panel.current; if (!node) return;
    const height = node.getBoundingClientRect().height;
    const width = node.getBoundingClientRect().width;
    setPosition({
      left: Math.max(8, Math.min(props.menu.x, window.innerWidth - width - 8)),
      top: Math.max(8, props.menu.y + height > window.innerHeight - 8 ? window.innerHeight - height - 8 : props.menu.y),
    });
  }, [props.menu.x, props.menu.y]);
  useEffect(() => {
    const oldFocus = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node)) closeRef.current(); };
    const host = document.querySelector('.main-scroll');
    // 区分用户主动滚动与布局调整：只有带用户滚动信号（滚轮/触摸/滚动键）的 scroll 才关闭菜单；
    // 保存导致的作品移出、列表缩短、scrollTop 钳制或排序重排触发的 scroll 一律保持菜单，
    // 修复「无钳制的列表缩短后第一次主动滚动被误判为布局滚动」的审查问题。
    let userScrolled = false;
    const markUser = () => { userScrolled = true; };
    const markKeys = (event: KeyboardEvent) => {
      // 菜单内方向键只移动焦点，不能污染随后由保存引起的主区布局滚动。
      if (panel.current?.contains(event.target as Node)) return;
      if (['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' '].includes(event.key) && !(event.target as HTMLElement)?.closest('input, textarea, select')) userScrolled = true;
    };
    const scroll = () => {
      if (userScrolled) { userScrolled = false; closeRef.current(); }
    };
    const resize = () => closeRef.current();
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('wheel', markUser, { passive: true, capture: true });
    window.addEventListener('touchmove', markUser, { passive: true, capture: true });
    window.addEventListener('keydown', markKeys, true);
    window.addEventListener('resize', resize); host?.addEventListener('scroll', scroll);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('wheel', markUser, { capture: true } as EventListenerOptions);
      window.removeEventListener('touchmove', markUser, { capture: true } as EventListenerOptions);
      window.removeEventListener('keydown', markKeys, true);
      window.removeEventListener('resize', resize); host?.removeEventListener('scroll', scroll);
      if (oldFocus?.isConnected) oldFocus.focus();
    };
  }, []);
  const run = (action: () => void) => { onClose(); action(); };
  // 双维度保存统一按结果处理：失败留在原位可重试，成功保持打开（等级行随资格重算出现/消失）。
  // 同值幂等按有效值比较——已是该关系/进度时点击不写库。
  const pickClassification = (value: GameExperienceClassification) => {
    if ((classificationFor(item) !== value || item.experienceStatus === undefined) && !props.onClassification(value)) return;
  };
  const pickGrade = (mode: 'priority' | 'rating', value: PersonalGrade | undefined) => { if (props.onGrade(mode, value)) onClose(); };
  const isGame = item.category === 'game' && !item.removedAt;
  const classification = isGame ? classificationFor(item) : null;
  const canPriority = isGame && priorityEditable(item);
  const canGrade = isGame && gradeEditable(item);
  return <div ref={panel} className="item-context-menu" role="menu" aria-label={`${item.title}快捷编辑`} style={{ left: position.left, top: position.top }} onKeyDown={event => {
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
      {isGame && <><span className="menu-section-label">体验分类</span><div className="context-states" role="group" aria-label="体验分类">{CLASSIFICATIONS.map(value => <button className={`experience-color--${value}`} role="menuitemradio" aria-checked={classification === value} key={value} onClick={() => pickClassification(value)}>{CLASSIFICATION_LABELS[value]}</button>)}</div>
        {canPriority && <div className="context-rank" role="group" aria-label="游玩优先级"><span className="menu-section-label"><Bookmark size={11} />游玩优先级</span><div className="context-grades">{GAME_GRADES.map(grade => <button role="menuitemradio" aria-checked={item.playPriority === grade} key={grade} onClick={() => pickGrade('priority', grade)}>{grade}</button>)}<button role="menuitemradio" aria-checked={item.playPriority === undefined} onClick={() => pickGrade('priority', undefined)}>未设置</button></div></div>}
        {canGrade && <div className="context-rank" role="group" aria-label="通关评级"><span className="menu-section-label"><Star size={11} />通关评级</span><div className="context-grades">{GAME_GRADES.map(grade => <button role="menuitemradio" aria-checked={item.personalGrade === grade} key={grade} onClick={() => pickGrade('rating', grade)}>{grade}</button>)}<button role="menuitemradio" aria-checked={item.personalGrade === undefined} onClick={() => pickGrade('rating', undefined)}>未设置</button></div></div>}
        <button role="menuitem" onClick={() => run(() => props.onQuick('time'))}><Clock3 size={14} />修改时长</button></>}
      <button role="menuitem" onClick={() => run(() => props.onQuick('tags'))}><Tag size={14} />编辑标签</button><button role="menuitem" onClick={() => run(props.onEdit)}><Pencil size={14} />编辑作品资料</button><button role="menuitem" onClick={() => run(props.onFavorite)}><Heart size={14} />{item.favorite ? '取消喜欢' : '标为喜欢'}</button><button role="menuitem" onClick={() => run(props.onHide)}><EyeOff size={14} />{item.hiddenAt ? '取消隐藏' : '隐藏作品'}</button><button role="menuitem" className="is-danger" onClick={() => run(props.onTrash)}><Trash2 size={14} />移到回收站</button>
    </>}
  </div>;
}
