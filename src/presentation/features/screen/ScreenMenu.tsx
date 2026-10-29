import { t } from '../../i18n/index.ts';
import { Check, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { screenHasWatched, type ScreenAction } from '../../../domain/screens.ts';
import { screenArrangementOptions, screenDisplayArrangement } from '../../../domain/screenConsumption.ts';
import type { MediaItem, ScreenArrangement } from '../../../domain/types.ts';
import { InlineScoreControl, type InlineScoreControlHandle } from '../../components/InlineScoreControl.tsx';

export interface ScreenMenuTarget { id: string; x: number; y: number; trigger: HTMLElement }
interface Props {
  item: MediaItem; target: ScreenMenuTarget; disabled: boolean; recycled: boolean; onClose: () => void;
  onAction: (action: ScreenAction) => boolean; onScore: (value?: number) => boolean;
  onEdit: () => void; onTags: () => void; onRound: () => void;
  onLifecycle: (action: 'trash' | 'restore' | 'delete', ids: string[]) => void;
}
export function ScreenMenu(props: Props) {
  const panel = useRef<HTMLDivElement>(null), score = useRef<InlineScoreControlHandle>(null);
  const [position, setPosition] = useState({ left: props.target.x, top: props.target.y });
  const [error, setError] = useState('');
  const closeRef = useRef<() => boolean>(() => false);
  function close(restore = false) {
    if (score.current && !score.current.commit()) return false;
    props.onClose(); if (restore) props.target.trigger.focus(); return true;
  }
  closeRef.current = close;
  useLayoutEffect(() => {
    const place = () => { const rect = panel.current?.getBoundingClientRect(); if (rect) setPosition({ left: Math.max(12, Math.min(props.target.x, window.innerWidth - rect.width - 12)), top: Math.max(12, Math.min(props.target.y, window.innerHeight - rect.height - 12)) }); };
    place(); const observer = new ResizeObserver(place); if (panel.current) observer.observe(panel.current);
    window.addEventListener('resize', place); return () => { observer.disconnect(); window.removeEventListener('resize', place); };
  }, [props.target.x, props.target.y]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !panel.current?.contains(event.target)) closeRef.current(); };
    const focus = (event: FocusEvent) => { if (event.target instanceof Node && !panel.current?.contains(event.target)) closeRef.current(); };
    window.addEventListener('pointerdown', outside); window.addEventListener('focusin', focus);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('pointerdown', outside); window.removeEventListener('focusin', focus); };
  }, []);
  function arrange(value: ScreenArrangement) {
    if (score.current && !score.current.commit()) return;
    if (value === 'none' && !screenHasWatched(props.item)) { props.onRound(); props.onClose(); return; }
    if (props.onAction({ type: 'arrangement', value })) props.onClose(); else setError('分类未能保存，请重试。');
  }
  function open(action: () => void) { if (close()) action(); }
  return createPortal(<div ref={panel} className="screen-menu" role="menu" aria-label={t("{0}快捷编辑", [props.item.title])} data-glass="filters" style={position} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      const buttons = [...panel.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault(); buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
    }
  }}>
    <strong className="screen-menu-title">{props.item.title}</strong>
    {!props.recycled && <><div className="screen-menu-arrangements" role="group" aria-label={t("观看安排")}>{screenArrangementOptions(props.item).map(({ value, label }) => <button key={value} role="menuitemradio" aria-checked={screenDisplayArrangement(props.item) === value && (value !== 'none' || screenHasWatched(props.item))} disabled={props.disabled} data-screen-state={value} onClick={() => arrange(value)}>{label}{screenDisplayArrangement(props.item) === value && (value !== 'none' || screenHasWatched(props.item)) && <Check size={13}/>}</button>)}</div>
      <div className="screen-menu-score"><span>{t("我的评分")}</span>{props.disabled ? <p>{props.item.personalScore === undefined ? t('未评分') : props.item.personalScore.toFixed(1)}</p> : <InlineScoreControl ref={score} value={props.item.personalScore} onSave={props.onScore} label={t("影视个人评分")} deferUntilDismiss commitScope={panel}/>}</div>
      <button role="menuitem" disabled={props.disabled} onClick={() => open(props.onTags)}><Tags size={14}/>{t("编辑标签")}</button><button role="menuitem" disabled={props.disabled} onClick={() => open(props.onRound)}><Plus size={14}/>{t("补录看过")}</button><button role="menuitem" disabled={props.disabled} onClick={() => open(props.onEdit)}><Pencil size={14}/>{t("编辑作品资料")}</button>
    </>}
    {props.recycled ? <><button role="menuitem" disabled={props.disabled} onClick={() => props.onLifecycle('restore', [props.item.id])}>{t("恢复作品")}</button><button role="menuitem" className="books-danger" disabled={props.disabled} onClick={() => props.onLifecycle('delete', [props.item.id])}><Trash2 size={14}/>{t("永久删除")}</button></> : <button role="menuitem" className="books-danger" disabled={props.disabled} onClick={() => { if (score.current?.commit()) props.onLifecycle('trash', [props.item.id]); }}><Trash2 size={14}/>{t("移到回收站")}</button>}
    {error && <p className="books-danger" role="alert">{t(error)}</p>}
  </div>, document.body);
}
