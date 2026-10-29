import { t } from '../../i18n/index.ts';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DetailWidgetId, DetailWidgetPreference } from '../../../infrastructure/detailLayout.ts';
import { useDialogKeyboard } from '../../useDialogKeyboard.ts';
import { SIZE_LABELS, WIDGET_COLORS, WIDGET_LABELS, WIDGET_SIZES } from './bentoWidgets.ts';
import type { BentoLayoutController } from './useBentoLayout.ts';

export interface BentoMenuAnchor { id: DetailWidgetId | null; x: number; y: number }
export function BentoContextMenu({ anchor, controller, close, locked, children }: { anchor: BentoMenuAnchor; controller: BentoLayoutController; close: () => void; locked: boolean; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null), [appearance, setAppearance] = useState(anchor.id === null);
  const title = anchor.id ? WIDGET_LABELS[anchor.id] : '布局与卡片';
  useDialogKeyboard(panel, () => { if (appearance && anchor.id) setAppearance(false); else close(); }, { filterVisible: true, initialFocus: element => element.querySelector('[role="spinbutton"],input,textarea,button') });
  useLayoutEffect(() => {
    const element = panel.current; if (!element) return;
    function position() {
      if (!element) return; const box = element.getBoundingClientRect();
      element.style.left = `${Math.max(10, Math.min(anchor.x, innerWidth - box.width - 10))}px`;
      element.style.top = `${Math.max(10, Math.min(anchor.y, innerHeight - box.height - 10))}px`;
    }
    position(); const observer = new ResizeObserver(position); observer.observe(element);
    return () => observer.disconnect();
  }, [anchor.x, anchor.y]);
  useEffect(() => {
    function outside(event: PointerEvent) { if (!panel.current?.contains(event.target as Node)) close(); }
    function resize() { close(); }
    document.addEventListener('pointerdown', outside, true); window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('resize', resize); };
  }, [close]);
  const card = controller.layout.cards.find(value => value.id === anchor.id);
  return <aside ref={panel} role="dialog" aria-modal="true" aria-label={t("{0}设置", [title])} className="bento-context-menu">
    <header>{appearance && anchor.id && <button type="button" className="bento-menu-back" aria-label={t("返回内容编辑")} onClick={() => setAppearance(false)}><ChevronLeft size={16} /></button>}<strong>{appearance ? t('外观与布局') : title}</strong></header>
    {appearance ? <>
      {card && <BentoAppearance card={card} controller={controller} onResize={close} />}
      <div className="bento-context-divider" /><button type="button" className="bento-context-action" onClick={() => { controller.begin(); close(); }}>{t("整理整体布局")}<ChevronRight size={14} /></button><button type="button" className="bento-context-action" onClick={() => { controller.begin(true); close(); }}>{t("管理卡片与显示内容")}<ChevronRight size={14} /></button>
    </> : <>{locked ? <p className="bento-context-description">{t("回收站中的作品只读，恢复后可编辑。")}</p> : children}<div className="bento-context-divider" /><button className="bento-context-action" type="button" onClick={() => setAppearance(true)}>{t("外观与布局")}<ChevronRight size={14} /></button></>}
  </aside>;
}
function BentoAppearance({ card, controller, onResize }: { card: DetailWidgetPreference; controller: BentoLayoutController; onResize: () => void }) {
  const [hex, setHex] = useState(card.color === 'default' ? '#202124' : card.color);
  const valid = /^#[0-9a-f]{6}$/i.test(hex);
  return <div className="bento-context-form"><p className="bento-context-description">{t("卡片尺寸")}</p><div className="bento-context-options">{(Object.keys(WIDGET_SIZES[card.id]) as DetailWidgetPreference['size'][]).map(size => <button type="button" aria-pressed={card.size === size} key={size} onClick={() => { if (controller.updateCard(card.id, { size })) onResize(); }}>{t(SIZE_LABELS[size])}</button>)}</div>
    <p className="bento-context-description">{t("卡片颜色")}</p><div className="bento-color-options">{WIDGET_COLORS.map(color => <button key={color} type="button" style={{ background: color }} aria-label={t("卡片颜色 {0}", [color])} aria-pressed={card.color === color} onClick={() => { controller.updateCard(card.id, { color }); setHex(color); }} />)}</div>
    <div className="bento-custom-color"><input type="color" aria-label={t("选取卡片颜色")} value={valid ? hex : '#202124'} onChange={event => { setHex(event.target.value); controller.updateCard(card.id, { color: event.target.value }); }} /><input aria-label={t("卡片颜色色号")} value={hex} aria-invalid={!valid} onChange={event => setHex(event.target.value)} /><button type="button" disabled={!valid} onClick={() => controller.updateCard(card.id, { color: hex })}>{t("应用")}</button></div><button type="button" onClick={() => controller.updateCard(card.id, { color: 'default' })}>{t("恢复默认配色")}</button>
  </div>;
}
