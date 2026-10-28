import { ChevronDown, LayoutGrid, List, Plus, SlidersHorizontal } from 'lucide-react';
import { BOOK_VIEWS, FACETS, facetValues, viewMatches, type BookFacets, type BookView, type FacetKey } from './bookView.ts';
import type { MediaItem } from '../../../domain/types.ts';

interface Props {
  books: MediaItem[]; view: BookView; onView: (view: BookView) => void; count: number;
  layout: 'grid' | 'list'; onLayout: (layout: 'grid' | 'list') => void;
  sort: string; onSort: (sort: string) => void; descending: boolean; onDirection: () => void;
  facets: BookFacets; onFacet: (key: FacetKey, value: string) => void; onClear: () => void;
  expanded: boolean; onExpand: () => void; disabled: boolean;
}
export function BookFilters(props: Props) {
  const selectedCount = Object.values(props.facets).reduce((total, values) => total + values.length, 0);
  return <>
    <div className="books-toolbar">
      <div className="status-tabs books-views" role="group" aria-label="阅读书架">
        {BOOK_VIEWS.map(view => <button key={view.id} className={props.view === view.id ? 'is-active' : ''} aria-pressed={props.view === view.id} onClick={() => props.onView(view.id)}>{view.label}<small>{props.books.filter(book => viewMatches(book, view.id)).length}</small></button>)}
      </div>
      <div className="books-toolbar-tools"><span className="books-muted">{props.count} 本</span>
        <button className={`button button--secondary ${props.expanded ? 'is-selected' : ''}`} aria-expanded={props.expanded} aria-controls="books-facet-panel" onClick={props.onExpand}><SlidersHorizontal size={14}/>筛选{selectedCount ? ` ${selectedCount}` : ''}<ChevronDown size={13}/></button>
        <select aria-label="书籍排序" value={props.sort} onChange={event => props.onSort(event.target.value)}><option value="recent">收录时间</option><option value="title">名称</option><option value="author">作者</option><option value="score">我的评分</option><option value="year">出版年份</option></select>
        <button className="button button--secondary" onClick={props.onDirection} aria-label={props.descending ? '改为升序' : '改为降序'}>{props.descending ? '↓ 降序' : '↑ 升序'}</button>
        <div className="view-switch" role="group" aria-label="书架视图"><button className={props.layout === 'grid' ? 'is-active' : ''} aria-pressed={props.layout === 'grid'} aria-label="封面视图" onClick={() => props.onLayout('grid')}><LayoutGrid size={16}/></button><button className={props.layout === 'list' ? 'is-active' : ''} aria-pressed={props.layout === 'list'} aria-label="列表视图" onClick={() => props.onLayout('list')}><List size={16}/></button></div>
      </div>
    </div>
    {props.expanded && <section id="books-facet-panel" className="books-facets books-surface" aria-label="书籍筛选">
      <header><strong>筛选书籍</strong>{selectedCount > 0 && <button className="text-button" onClick={props.onClear}>清空筛选</button>}</header>
      {FACETS.map(({ id, label }) => {
        const counts = new Map<string, number>();
        props.books.forEach(book => facetValues(book, id).forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1)));
        return <div className="books-facet" key={id}><span>{label}</span><div>{[...counts].sort(([a], [b]) => a.localeCompare(b, 'zh')).map(([value, count]) => <button key={value} className={`tag-filter ${props.facets[id]?.includes(value) ? 'is-selected' : ''}`} aria-pressed={Boolean(props.facets[id]?.includes(value))} onClick={() => props.onFacet(id, value)}>{value}<small>{count}</small></button>)}</div></div>;
      })}
    </section>}
  </>;
}
export function BookTagFilter({ tags, selected, toggle, manage, disabled }: { tags: string[]; selected: string[]; toggle: (tag: string) => void; manage: () => void; disabled: boolean }) {
  return <section className="books-tags" aria-label="书籍标签"><header><strong>标签筛选</strong><button className="icon-button" aria-label="管理书籍标签" title="管理书籍标签" disabled={disabled} onClick={manage}><Plus size={15}/></button></header><div>{tags.length ? tags.map(tag => <button key={tag} className={`tag-filter ${selected.includes(tag) ? 'is-selected' : ''}`} aria-pressed={selected.includes(tag)} onClick={() => toggle(tag)}>{tag}</button>) : <span className="books-muted">还没有标签</span>}</div></section>;
}
