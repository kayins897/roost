import { t } from '../../i18n/index.ts';
import { ChevronDown, LayoutGrid, List, Plus, SlidersHorizontal, Tags } from 'lucide-react';
import { useRef, useState } from 'react';
import type { MediaItem } from '../../../domain/types.ts';
import { matchesScreenShelf, screenShelves, type ScreenKind, type ScreenShelfView } from '../../../domain/screenConsumption.ts';
import { type ScreenFacets, type FacetKey } from './screenView.ts';
import { ScreenFacetPopover } from './ScreenFacetPopover.tsx';

interface Props {
  items: MediaItem[]; kind: ScreenKind; view: ScreenShelfView; onView: (value: ScreenShelfView) => void; count: number;
  layout: 'grid' | 'list'; onLayout: (value: 'grid' | 'list') => void; sort: string; onSort: (value: string) => void;
  descending: boolean; onDirection: () => void; expanded: boolean; onExpand: () => void;
  facets: ScreenFacets; onFacet: (key: FacetKey, value: string) => void; onClear: () => void;
}
export function ScreenFilters(props: Props) {
  const anchor = useRef<HTMLButtonElement>(null);
  const count = Object.values(props.facets).reduce((sum, values) => sum + values.length, 0);
  return <>
    <div className="books-toolbar screen-toolbar">
      <div className="status-tabs books-views" role="group" aria-label={t("观影分类")}>{screenShelves(props.kind).map(view => <button key={view.id} className={props.view === view.id ? 'is-selected' : ''} aria-pressed={props.view === view.id} onClick={() => props.onView(view.id)}>{t(view.label)}<small>{props.items.filter(item => matchesScreenShelf(item, props.kind, view.id)).length}</small></button>)}</div>
      <div className="books-toolbar-tools"><span className="books-muted">{props.count} {" "}{t("部")}</span><button ref={anchor} className={`button button--secondary ${props.expanded ? 'is-selected' : ''}`} onClick={props.onExpand} aria-expanded={props.expanded} aria-controls="screen-facet-panel"><SlidersHorizontal size={14}/>{t("筛选")}{count ? ` ${count}` : ''}<ChevronDown size={13}/></button>
        <label className="books-sort-field sort-box"><SlidersHorizontal size={14}/><select aria-label={t("影视排序")} value={props.sort} onChange={event => props.onSort(event.target.value)}><option value="recent">{t("收录时间")}</option><option value="finished">{t("看完时间")}</option><option value="title">{t("名称")}</option><option value="year">{t("发行年份")}</option><option value="score">{t("我的评分")}</option><option value="douban">{t("豆瓣评分")}</option></select></label>
        <button className="button button--secondary" aria-label={props.descending ? t('改为升序') : t('改为降序')} onClick={props.onDirection}>{props.descending ? t('↓ 降序') : t('↑ 升序')}</button>
        <div className="view-switch" role="group" aria-label={t("影视视图")}><button className={props.layout === 'grid' ? 'is-active' : ''} aria-label={t("封面视图")} aria-pressed={props.layout === 'grid'} onClick={() => props.onLayout('grid')}><LayoutGrid size={16}/></button><button className={props.layout === 'list' ? 'is-active' : ''} aria-label={t("列表视图")} aria-pressed={props.layout === 'list'} onClick={() => props.onLayout('list')}><List size={16}/></button></div>
      </div>
    </div>
    {props.expanded && <ScreenFacetPopover screens={props.items} facets={props.facets} onFacet={props.onFacet} onClear={props.onClear} onClose={props.onExpand} anchorRef={anchor}/>}
  </>;
}
export function ScreenTags({ tags, selected, toggle, manage, disabled }: { tags: string[]; selected: string[]; toggle: (value: string) => void; manage: () => void; disabled: boolean }) {
  const [open, setOpen] = useState(true), [all, setAll] = useState(false);
  const shown = all ? tags : tags.filter((tag, index) => index < 12 || selected.includes(tag));
  return <section className="books-tags" aria-label={t("影视标签")}><header><button className="text-button" aria-expanded={open} onClick={() => setOpen(value => !value)}><Tags size={14}/><strong>{t("标签筛选")}</strong><ChevronDown size={13}/></button><button className="icon-button" aria-label={t("管理影视标签")} disabled={disabled} onClick={manage}><Plus size={15}/></button></header>{open && <div>{shown.map(tag => <button className={`tag-filter ${selected.includes(tag) ? 'is-selected' : ''}`} key={tag} aria-pressed={selected.includes(tag)} onClick={() => toggle(tag)}>{tag}</button>)}{!tags.length && <span className="books-muted">{t("还没有标签")}</span>}{(all || tags.length > shown.length) && <button className="text-button books-muted" onClick={() => setAll(value => !value)}>{all ? t('收起') : t("+{0} 更多", [tags.length - shown.length])}</button>}</div>}</section>;
}
