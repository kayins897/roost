import { t } from '../../i18n/index.ts';
import { ArrowDown, ArrowUp, GripVertical, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DetailWidgetId, DetailWidgetPreference } from '../../../infrastructure/detailLayout.ts';
import { SIZE_LABELS, WIDGET_LABELS, widgetStyle } from './bentoWidgets.ts';
import type { BentoLayoutController } from './useBentoLayout.ts';

export function BentoWidget({ card, controller, children, menuOpen, onMenu, onDrop, onDragStart }: {
  card: DetailWidgetPreference; controller: BentoLayoutController; children: ReactNode; menuOpen: boolean;
  onMenu: (id: DetailWidgetId, x: number, y: number, origin: HTMLElement) => void;
  onDrop: (id: DetailWidgetId, after: boolean) => void; onDragStart: (id: DetailWidgetId | null) => void;
}) {
  const label = WIDGET_LABELS[card.id];
  return <section className={`bento-widget bento-widget--${card.id} ${menuOpen ? 'bento-widget--menu-open' : ''}`}
    style={widgetStyle(card)} data-widget={card.id} data-size={card.size} tabIndex={0} aria-label={label}
    onContextMenu={event => { event.preventDefault(); event.stopPropagation(); onMenu(card.id, event.clientX, event.clientY, event.currentTarget); }}
    onKeyDown={event => { if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') { event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); onMenu(card.id, box.left + 20, box.top + 20, event.currentTarget); } }}
    onDragOver={event => { if (controller.editing) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}
    onDrop={event => { if (!controller.editing) return; event.preventDefault(); onDrop(card.id, event.clientY > event.currentTarget.getBoundingClientRect().top + event.currentTarget.offsetHeight / 2); }}>
    {controller.editing && <div className="bento-widget-tools">
      <button type="button" draggable aria-label={t("拖动{0}", [label])} onDragStart={event => { onDragStart(card.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', card.id); }} onDragEnd={() => onDragStart(null)} onKeyDown={event => { if (['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); controller.step(card.id, event.key === 'ArrowUp' ? -1 : 1); } }}><GripVertical size={15} /></button>
      <button type="button" aria-label={t("上移{0}", [label])} onClick={() => controller.step(card.id, -1)}><ArrowUp size={13} /></button>
      <button type="button" aria-label={t("下移{0}", [label])} onClick={() => controller.step(card.id, 1)}><ArrowDown size={13} /></button>
      <span>{t(SIZE_LABELS[card.size])}</span><button type="button" aria-label={t("隐藏{0}卡片", [label])} onClick={() => controller.updateCard(card.id, { visible: false })}><Minus size={15} /></button>
    </div>}
    <div className="bento-widget-body" inert={controller.editing}>{children}</div>
  </section>;
}
