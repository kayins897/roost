import { Check, Search, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { MediaItem } from '../../../domain/types.ts';
import { FACETS, facetValues, type BookFacets, type FacetKey } from './bookView.ts';

interface Props {
  books: MediaItem[];
  facets: BookFacets;
  onFacet: (key: FacetKey, value: string) => void;
  onClear: () => void;
  onClose: () => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
}

/** Anchored outside the scrolling library so opening filters never moves the shelf. */
export function BookFacetPopover({ books, facets, onFacet, onClear, onClose, anchorRef }: Props) {
  const [dimension, setDimension] = useState<FacetKey>('author');
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 0, transform: 'none' });
  const panel = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const closing = useRef(false);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  function requestClose() { if (closing.current) return; closing.current = true; closeRef.current(); }
  const selectedCount = Object.values(facets).reduce((total, values) => total + values.length, 0);
  const label = FACETS.find(facet => facet.id === dimension)!.label;
  const candidates = useMemo(() => {
    const counts = new Map<string, number>();
    books.forEach(book => new Set(facetValues(book, dimension)).forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1)));
    // Keep stale selections removable when the last matching book was removed or edited.
    (facets[dimension] ?? []).forEach(value => { if (!counts.has(value)) counts.set(value, 0); });
    return [...counts].sort(([a], [b]) => a.localeCompare(b, 'zh', { numeric: true }));
  }, [books, dimension, facets]);
  const visible = candidates.filter(([value]) => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  useLayoutEffect(() => {
    function place() {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      if (anchor.bottom < 0 || anchor.top > window.innerHeight) { requestClose(); return; }
      const width = Math.min(520, Math.max(0, window.innerWidth - 24));
      const below = window.innerHeight - anchor.bottom - 20;
      const above = anchor.top - 20;
      const useBelow = below >= Math.min(300, window.innerHeight - 24) || below >= above;
      const maxHeight = Math.max(0, Math.min(420, useBelow ? below : above));
      setPosition({ width, maxHeight, left: Math.max(12, Math.min(anchor.right - width, window.innerWidth - width - 12)), top: useBelow ? anchor.bottom + 8 : anchor.top - 8, transform: useBelow ? 'none' : 'translateY(-100%)' });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchorRef]);
  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => (search.current ?? panel.current?.querySelector<HTMLButtonElement>('button'))?.focus());
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !anchorRef.current?.contains(event.target)) requestClose();
    }
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); requestClose(); anchorRef.current?.focus(); }
    }
    function focus(event: FocusEvent) {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !anchorRef.current?.contains(event.target)) requestClose();
    }
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', key, true);
    window.addEventListener('focusin', focus);
    return () => { window.cancelAnimationFrame(focusFrame); window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', key, true); window.removeEventListener('focusin', focus); };
  }, [anchorRef]);
  function close() { requestClose(); anchorRef.current?.focus(); }
  return createPortal(<section ref={panel} id="books-facet-panel" className="books-facet-popover" role="region" aria-label="书籍筛选" data-glass="filters" style={{ ...position, visibility: position.width ? 'visible' : 'hidden' }}>
    <header><strong>筛选书籍</strong><span className="books-facet-total">已选 {selectedCount} 项</span>{selectedCount > 0 && <button className="text-button" onClick={onClear}>清空筛选</button>}<button className="icon-button" aria-label="关闭书籍筛选" onClick={close}><X size={16}/></button></header>
    {!books.length ? <p className="books-facet-empty">书架还没有书，收录后即可按作者、评分和来源筛选。</p> : <div className="books-facet-body">
      <nav aria-label="筛选维度">{FACETS.map(facet => <button key={facet.id} aria-pressed={dimension === facet.id} className={dimension === facet.id ? 'is-selected' : ''} onClick={() => { setDimension(facet.id); setQuery(''); }}>{facet.label}{Boolean(facets[facet.id]?.length) && <small>{facets[facet.id]!.length}</small>}</button>)}</nav>
      <div className="books-facet-values"><label className="books-facet-search"><Search size={14} aria-hidden="true"/><input ref={search} aria-label={`搜索${label}候选`} placeholder={`搜索${label}`} value={query} onChange={event => setQuery(event.target.value)}/>{query && <button className="icon-button" aria-label="清除候选搜索" onClick={() => { setQuery(''); search.current?.focus(); }}><X size={13}/></button>}</label>
        <div className="books-facet-current"><strong>{label}</strong><small>{visible.length} 个选项</small></div>
        <div className="books-facet-options" aria-label={`${label}选项`}>{visible.map(([value, count]) => { const selected = Boolean(facets[dimension]?.includes(value)); return <button key={value} aria-pressed={selected} className={`books-facet-option ${selected ? 'is-selected' : ''}`} onClick={() => onFacet(dimension, value)}><span>{value}</span><small>{count}</small>{selected && <Check size={13} aria-hidden="true"/>}</button>; })}{!visible.length && <p className="books-facet-empty">没有匹配的选项</p>}</div>
      </div>
    </div>}
  </section>, document.body);
}
