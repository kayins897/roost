import { useId, useReducer, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen, HelpCircle, LibraryBig, Plus, RotateCcw, Search, X } from 'lucide-react';
import { arrangementOf, deskReducer } from './book-classification';
import { createDeskSeed } from './catalog';
import { shelfBooks } from './catalog';
import { createBookTags, tagReducer, type TagAction } from './book-tags';
import { INITIAL_VIEW, viewReducer } from './library-view';
import { DeskDialogs } from './DeskDialogs';
import { BookShelf } from './BookShelf';
import { LibraryToolbar } from './LibraryToolbar';
import { ReadingOverview } from './ReadingOverview';
import { TagFilter } from './TagFilter';
import { BookFacets, BookFacetTrigger } from './BookFacets';
import { FACES, type DeskDialog, type Face } from './types';
import './desk.css';
import './classification.css';

function ReadingDesk() {
  const [state, dispatch] = useReducer(deskReducer, undefined, createDeskSeed);
  const [tags, dispatchTags] = useReducer(tagReducer, undefined, createBookTags);
  const [view, changeView] = useReducer(viewReducer, INITIAL_VIEW);
  const [dialog, setDialog] = useState<DeskDialog | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const filterControl = { expanded: filtersOpen, setExpanded: setFiltersOpen, trigger: filterTrigger, panelId };
  const trigger = useRef<HTMLElement | null>(null);
  const open = (next: DeskDialog) => {
    if (!dialog) trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDialog(next);
  };
  const close = () => { setDialog(null); requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus()); };
  const changeTags = (action: TagAction) => {
    dispatchTags(action);
    if (action.type === 'delete') changeView({ type: 'remove-tag', name: action.name });
  };
  const props = { state, dispatch, open, tags, changeTags };
  const works = shelfBooks(state, tags, view);
  const candidates = shelfBooks(state, tags, view, false);
  const facetCandidates = shelfBooks(state, tags, view, true, false);
  const counts = Object.fromEntries(FACES.map(({ id }) => [id, shelfBooks(state, tags, { ...view, face: id, query: '', selectedTags: [], facets: {} }).length])) as Record<Face, number>;
  const { face, query } = view;
  return <div className="rd-app">
    <a className="rd-skip" href="#reading-content">跳到书架</a>
    <div className="rd-brand" aria-label="栖域"><span>栖</span><strong>栖域<small>ROOST</small></strong></div>
    <nav className="rd-dock" aria-label="独立预览导航"><button className="is-active" aria-label="书籍首页" title="书籍首页" onClick={() => { changeView({ type: 'home' }); document.querySelector('.rd-shell')?.scrollTo({ top: 0, behavior: 'smooth' }); }}><BookOpen size={21}/></button><button aria-label="主题书单" title="主题书单" onClick={() => open({ kind: 'collection' })}><LibraryBig size={21}/></button><span/><button aria-label="预览说明" title="预览说明" onClick={() => open({ kind: 'info' })}><HelpCircle size={20}/></button></nav>
    <div className="rd-version">v0.4.30<span><i/>独立预览</span></div>
    <div className="rd-shell">
      <header className="rd-topbar"><label className="rd-search"><Search size={17}/><input aria-label="搜索书名、作者、标签或感想" placeholder="搜索书名、作者、标签或感想" value={query} onChange={event => changeView({ type: 'query', query: event.target.value })}/>{query && <button aria-label="清空搜索" onClick={() => changeView({ type: 'query', query: '' })}><X size={15}/></button>}</label><button className="rd-icon rd-reset" aria-label="重置预览" title="重置预览" onClick={() => {
        if (window.confirm('恢复全部示例？本页中的修改将清除，正式收藏不受影响。')) { dispatch({ type: 'reset', state: createDeskSeed() }); dispatchTags({ type: 'reset' }); changeView({ type: 'reset' }); setDialog(null); setFiltersOpen(false); }
      }}><RotateCcw size={17}/></button></header>
      <main id="reading-content" tabIndex={-1}>
        <header className="rd-page-head"><div><h1>书籍</h1><span className="rd-library-summary">{state.works.length} 本藏书 · {state.works.filter(work => arrangementOf(state, work.id) === 'reading').length} 本在读</span></div><button className="rd-button rd-button--primary rd-add" onClick={() => open({ kind: face === 'records' ? 'round' : 'plan' })}><Plus size={17}/>{face === 'records' ? '补录已读' : '加入计划'}</button></header>
        {face === 'records' && <ReadingOverview state={state} open={open}/>}
        <LibraryToolbar view={view} change={changeView} count={works.length} counts={counts} filters={<BookFacetTrigger selected={view.facets} control={filterControl}/>}/>
        <BookFacets works={facetCandidates} selected={view.facets} toggle={(key, value) => changeView({ type: 'facet', key, value })} clear={() => changeView({ type: 'clear-facets' })} control={filterControl}/>
        <TagFilter tags={tags} works={candidates} selected={view.selectedTags} toggle={name => changeView({ type: 'tag', name })} clear={() => changeView({ type: 'clear-tags' })} manage={() => open({ kind: 'tags' })}/>
        <BookShelf state={state} open={open} works={works} face={face} layout={view.layouts[face]} clearFilters={() => changeView({ type: 'clear-filters' })}/>
      </main>
    </div>
    {dialog && <DeskDialogs {...props} key={dialog.kind} dialog={dialog} onClose={close}/>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<ReadingDesk/>);
