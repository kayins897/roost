import type { BentoLayoutController } from './useBentoLayout.ts';
import { FIELD_LABELS, WIDGET_LABELS } from './bentoWidgets.ts';

export function BentoLayoutTools({ controller }: { controller: BentoLayoutController }) {
  if (!controller.editing) return null;
  return <>
    {controller.manager && <aside className="bento-widget-manager" aria-label="管理卡片与显示内容">
      <h3>卡片与显示内容</h3><div className="bento-manager-options">{controller.layout.cards.map(card => <label key={card.id}><input type="checkbox" checked={card.visible} onChange={event => controller.updateCard(card.id, { visible: event.target.checked })} />{WIDGET_LABELS[card.id]}</label>)}</div>
      <details><summary>作品资料与标签分组</summary><div className="bento-manager-options">{Object.entries(FIELD_LABELS).map(([key, label]) => <label key={key}><input type="checkbox" checked={controller.layout.fields[key] !== false} onChange={event => controller.setField(key, event.target.checked)} />{label}</label>)}</div></details>
    </aside>}
    <div className="bento-layout-tools" role="toolbar" aria-label="调整详情布局">
      <strong>调整布局</strong><button type="button" aria-expanded={controller.manager} onClick={controller.showManager}>管理卡片</button><button type="button" onClick={controller.reset}>恢复默认</button><button type="button" onClick={controller.cancel}>取消</button><button type="button" className="bento-menu-primary" onClick={controller.finish}>完成</button>
    </div>
  </>;
}
