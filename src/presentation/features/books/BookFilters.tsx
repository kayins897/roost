import { t } from '../../i18n/index.ts';
import { ChevronDown, LayoutGrid, List, Plus, SlidersHorizontal } from 'lucide-react';
import { useRef, useState } from 'react';
import { BOOK_VIEWS, viewMatches, type BookFacets, type BookView, type FacetKey } from './bookView.ts';
import type { MediaItem } from '../../../domain/types.ts';
import { BookFacetPopover } from './BookFacetPopover.tsx';

interface Props {
  books: MediaItem[]; view: BookView; onView: (view: BookView) => void; count: number;
  layout: 'grid' | 'list'; onLayout: (layout: 'grid' | 'list') => void;
  sort: string; onSort: (sort: string) => void; descending: boolean; onDirection: () => void;
  facets: BookFacets; onFacet: (key: FacetKey, value: string) => void; onClear: () => void;
  expanded: boolean; onExpand: () => void; disabled: boolean;
}
export function BookFilters(props: Props) {
  const filterButton = useRef<HTMLButtonElement>(null);
  const selectedCount = Object.values(props.facets).reduce((total, values) => total + values.length, 0);
  return <>
    <div className="books-toolbar">
      <div className="status-tabs books-views" role="group" aria-label={t("阅读书架")}>
        {BOOK_VIEWS.map(view => <button key={view.id} className={props.view === view.id ? 'is-selected' : ''} aria-pressed={props.view === view.id} onClick={() => props.onView(view.id)}>{t(view.label)}<small>{props.books.filter(book => viewMatches(book, view.id)).length}</small></button>)}
      </div>
      <div className="books-toolbar-tools"><span className="books-muted">{props.count} {" "}{t("本")}</span>
        <button ref={filterButton} className={`button button--secondary ${props.expanded ? 'is-selected' : ''}`} aria-expanded={props.expanded} aria-controls="books-facet-panel" onClick={props.onExpand}><SlidersHorizontal size={14}/>{t("筛选")}{selectedCount ? ` ${selectedCount}` : ''}<ChevronDown size={13}/></button>
        <label className="books-sort-field sort-box"><SlidersHorizontal size={14} aria-hidden="true"/><select aria-label={t("书籍排序")} value={props.sort} onChange={event => props.onSort(event.target.value)}><option value="recent">{t("收录时间")}</option><option value="finished">{t("读完时间")}</option><option value="title">{t("名称")}</option><option value="author">{t("作者")}</option><option value="score">{t("我的评分")}</option><option value="duration">{t("阅读时长")}</option><option value="year">{t("出版年份")}</option></select></label>
        <button className="button button--secondary" onClick={props.onDirection} aria-label={props.descending ? t('改为升序') : t('改为降序')}>{props.descending ? t('↓ 降序') : t('↑ 升序')}</button>
        <div className="view-switch" role="group" aria-label={t("书架视图")}><button className={props.layout === 'grid' ? 'is-active' : ''} aria-pressed={props.layout === 'grid'} aria-label={t("封面视图")} onClick={() => props.onLayout('grid')}><LayoutGrid size={16}/></button><button className={props.layout === 'list' ? 'is-active' : ''} aria-pressed={props.layout === 'list'} aria-label={t("列表视图")} onClick={() => props.onLayout('list')}><List size={16}/></button></div>
      </div>
    </div>
    {props.expanded && <BookFacetPopover books={props.books} facets={props.facets} onFacet={props.onFacet} onClear={props.onClear} onClose={props.onExpand} anchorRef={filterButton}/>}
  </>;
}
export function BookTagFilter({ tags, selected, toggle, manage, disabled }: { tags: string[]; selected: string[]; toggle: (tag: string) => void; manage: () => void; disabled: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? tags : tags.filter((tag, index) => index < 12 || selected.includes(tag));
  return <section className="books-tags" aria-label={t("书籍标签")}><header><button className="text-button" aria-expanded={expanded} aria-controls="books-tag-options" onClick={() => setExpanded(value => !value)}><strong>{t("标签筛选")}</strong><ChevronDown size={13}/></button><button className="icon-button" aria-label={t("管理书籍标签")} title={t("管理书籍标签")} disabled={disabled} onClick={manage}><Plus size={15}/></button></header>{expanded && <div id="books-tag-options">{tags.length ? shown.map(tag => <button key={tag} className={`tag-filter ${selected.includes(tag) ? 'is-selected' : ''}`} aria-pressed={selected.includes(tag)} onClick={() => toggle(tag)}>{tag}</button>) : <span className="books-muted">{t("还没有标签")}</span>}{(showAll || shown.length < tags.length) && <button className="text-button books-muted" onClick={() => setShowAll(value => !value)}>{showAll ? t('收起') : t("+{0} 更多", [tags.length - shown.length])}</button>}</div>}</section>;
}
