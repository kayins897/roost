import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { applyBookAction, bookArrangement, bookDuration, type BookAction } from '../../../domain/books.ts';
import { normalizeTags } from '../../../domain/library.ts';
import type { ExperienceEntry, LibrarySnapshot } from '../../../domain/types.ts';
import { BookActionForm, type BookFormKind } from './BookActionForm.tsx';
import { BookCollections, type BookCommit } from './BookCollections.tsx';
import { BookFilters, BookTagFilter } from './BookFilters.tsx';
import { BookHeatmap } from './BookHeatmap.tsx';
import { BookShelf } from './BookShelf.tsx';
import { BookTagsDialog } from './BookTagDialog.tsx';
import { lastFinishedOn, matchesBook, viewMatches, type BookFacets, type BookView, type FacetKey } from './bookView.ts';
import './books.css';

export interface BooksWorkspaceProps {
  snapshot: LibrarySnapshot; query: string; libraryView: 'library' | 'trash' | 'hidden'; disabled: boolean;
  onCommit: BookCommit; onOpen: (id: string) => void; onCreate: () => void; onEdit: (id: string) => void;
  onLifecycle: (action: 'trash' | 'restore' | 'delete', ids: string[]) => void; onNotice: (message: string) => void;
}
type WorkspaceView = { view: BookView; layout: 'grid' | 'list'; sort: string; descending: boolean; facetsOpen: boolean; facets: BookFacets; tags: string[]; collection: string | null };
type WorkspaceDialog = { kind: BookFormKind; id: string; date?: string; entry?: ExperienceEntry } | 'tags' | null;
const INITIAL: WorkspaceView = { view: 'want', layout: 'grid', sort: 'recent', descending: true, facetsOpen: false, facets: {}, tags: [], collection: null };
export function BooksWorkspace(props: BooksWorkspaceProps) {
  const { snapshot, libraryView, disabled, onCommit } = props;
  const [ui, setUi] = useState<WorkspaceView>(INITIAL);
  const [dialog, setDialog] = useState<WorkspaceDialog>(null);
  const books = useMemo(() => snapshot.items.filter(item => item.category === 'book' && !item.removedAt && !item.hiddenAt), [snapshot]);
  const tags = normalizeTags([...(snapshot.bookTagCatalog ?? []), ...books.flatMap(book => book.tags)]).sort((a, b) => a.localeCompare(b, 'zh'));
  const selectedTags = ui.tags.filter(tag => tags.includes(tag));
  const collection = snapshot.bookCollections?.find(value => value.id === ui.collection);
  const candidates = books.filter(item => viewMatches(item, ui.view) && (!collection || collection.bookIds.includes(item.id)) && matchesBook(item, props.query, [], {}));
  const visible = candidates.filter(item => matchesBook(item, '', selectedTags, ui.facets)).sort((a, b) => {
    let comparison = 0;
    if (ui.sort === 'title') comparison = a.title.localeCompare(b.title, 'zh');
    else if (ui.sort === 'finished') { const aDate = lastFinishedOn(a), bDate = lastFinishedOn(b); if (!aDate || !bDate) return aDate === bDate ? 0 : !aDate ? 1 : -1; comparison = aDate.localeCompare(bDate); }
    else if (ui.sort === 'author') comparison = a.creator.localeCompare(b.creator, 'zh');
    else if (ui.sort === 'score') { if (a.personalScore === undefined || b.personalScore === undefined) return a.personalScore === b.personalScore ? 0 : a.personalScore === undefined ? 1 : -1; comparison = a.personalScore - b.personalScore; }
    else if (ui.sort === 'duration') { const left = bookDuration(a), right = bookDuration(b); if (left === undefined || right === undefined) return left === right ? 0 : left === undefined ? 1 : -1; comparison = left - right; }
    else if (ui.sort === 'year') comparison = a.year.localeCompare(b.year, 'zh', { numeric: true });
    else comparison = a.createdAt.localeCompare(b.createdAt);
    return (ui.descending ? -comparison : comparison) || a.title.localeCompare(b.title, 'zh');
  });
  function update(values: Partial<WorkspaceView>) { setUi(current => ({ ...current, ...values })); }
  function toggleFacet(key: FacetKey, value: string) { setUi(current => ({ ...current, facets: { ...current.facets, [key]: current.facets[key]?.includes(value) ? current.facets[key]!.filter(item => item !== value) : [...(current.facets[key] ?? []), value] } })); }
  function openForm(kind: BookFormKind, date?: string) {
    const item = books.find(book => bookArrangement(book) === 'reading') ?? books[0];
    if (!item) { props.onNotice('请先收录一本书，再添加阅读记录或计划。'); return; }
    setDialog({ kind, id: item.id, date });
  }
  function action(id: string, value: BookAction) { return onCommit(current => ({ ...current, items: current.items.map(item => item.id === id && item.category === 'book' && !item.removedAt ? applyBookAction(item, value, new Date().toISOString()) : item) }), '阅读记录已保存'); }
  const dialogBook = typeof dialog === 'object' && dialog ? books.find(item => item.id === dialog.id) : undefined;
  if (libraryView !== 'library') {
    const scope = snapshot.items.filter(item => item.category === 'book' && (libraryView === 'trash' ? Boolean(item.removedAt) : !item.removedAt && Boolean(item.hiddenAt)) && matchesBook(item, props.query, [], {}));
    return <div className="books-workspace"><BookShelf books={scope} layout={ui.layout} onOpen={props.onOpen} onEdit={props.onEdit} disabled={disabled} onCreate={props.onCreate} onLifecycle={props.onLifecycle} recycled={libraryView === 'trash'}/></div>;
  }
  return <div className="books-workspace">
    <BookHeatmap books={books} disabled={disabled} onRecord={date => openForm('entry', date)} onEditEntry={(id, entry) => setDialog({ kind: 'entry', id, entry })}/>
    <div className="books-primary-actions"><button className="button button--secondary" disabled={disabled || !books.length} onClick={() => openForm('round')}><Plus size={14}/>补录已读</button><button className="button button--secondary" disabled={disabled || !books.length} onClick={() => openForm('plan')}><Plus size={14}/>阅读计划</button><button className="button button--primary" disabled={disabled} onClick={props.onCreate}><Plus size={15}/>收录书籍</button></div>
    <BookFilters books={books} view={ui.view} onView={view => update({ view, sort: view === 'records' ? 'finished' : 'recent', descending: true })} count={visible.length} layout={ui.layout} onLayout={layout => update({ layout })} sort={ui.sort} onSort={sort => update({ sort })} descending={ui.descending} onDirection={() => update({ descending: !ui.descending })} facets={ui.facets} onFacet={toggleFacet} onClear={() => update({ facets: {} })} expanded={ui.facetsOpen} onExpand={() => update({ facetsOpen: !ui.facetsOpen })} disabled={disabled}/>
    <div className="books-content"><main className="books-main"><BookTagFilter tags={tags} selected={selectedTags} toggle={tag => update({ tags: selectedTags.includes(tag) ? selectedTags.filter(value => value !== tag) : [...selectedTags, tag] })} manage={() => setDialog('tags')} disabled={disabled}/>{collection && <div className="books-collection-filter"><strong>{collection.title}</strong><button className="text-button" onClick={() => update({ collection: null })}>清除书单筛选</button></div>}{visible.length === 0 && books.length > 0 && <button className="text-button" onClick={() => update({ tags: [], facets: {}, collection: null, view: 'all' })}>查看全部书籍</button>}<BookShelf books={visible} layout={ui.layout} onOpen={props.onOpen} onEdit={props.onEdit} disabled={disabled} onCreate={props.onCreate} onLifecycle={props.onLifecycle} recycled={false}/></main><BookCollections snapshot={snapshot} books={books} selected={collection?.id ?? null} onSelect={id => update({ collection: id })} onCommit={onCommit} disabled={disabled}/></div>
    {dialog === 'tags' && <BookTagsDialog snapshot={snapshot} onCommit={onCommit} onClose={() => setDialog(null)} onDeleted={tag => update({ tags: ui.tags.filter(value => value !== tag) })}/>}
    {typeof dialog === 'object' && dialog && dialogBook && <BookActionForm key={`${dialog.id}-${dialog.kind}-${dialog.entry?.id ?? 'new'}`} kind={dialog.kind} item={dialogBook} date={dialog.date} initialEntry={dialog.entry} books={dialog.entry ? undefined : books} onBook={id => setDialog({ ...dialog, id, entry: undefined })} onClose={() => setDialog(null)} onSave={value => action(dialog.id, value)}/>}
  </div>;
}
