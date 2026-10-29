import { t } from '../../i18n/index.ts';
import { CheckCircle2, ListPlus, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { applyScreenAction, screenHasWatched, type ScreenAction } from '../../../domain/screens.ts';
import { normalizeTags } from '../../../domain/library.ts';
import { SCREEN_KINDS, matchesScreenShelf, screenArrangementOptions, screenKind, type ScreenKind, type ScreenShelfView } from '../../../domain/screenConsumption.ts';
import type { LibrarySnapshot, MediaItem, ScreenArrangement } from '../../../domain/types.ts';
import { QuickEditor } from '../../RecordEditors.tsx';
import { SelectionBar } from '../library/SelectionBar.tsx';
import { ScreenActionForm, type ScreenFormKind } from './ScreenActionForm.tsx';
import { ScreenCollections } from './ScreenCollections.tsx';
import { ScreenFilters, ScreenTags } from './ScreenFilters.tsx';
import { ScreenMenu, type ScreenMenuTarget } from './ScreenMenu.tsx';
import { ScreenShelf } from './ScreenShelf.tsx';
import { ScreenTagsDialog } from './ScreenTagDialog.tsx';
import { latestFinishedOn, matchesScreen, screenId, type ScreenCommit, type ScreenFacets, type FacetKey } from './screenView.ts';
import '../books/books.css';
import './screen.css';

export interface ScreensWorkspaceProps {
  snapshot: LibrarySnapshot; query: string; libraryView: 'library' | 'trash' | 'hidden'; disabled: boolean;
  onBatch: (kind: ScreenKind) => void; onCommit: ScreenCommit; onOpen: (id: string) => void; onCreate: (kind: ScreenKind) => void; onEdit: (id: string) => void;
  initialKind?: ScreenKind;
  onKindChange?: (kind: ScreenKind) => void;
  onLifecycle: (action: 'trash' | 'restore' | 'delete', ids: string[]) => void; onNotice: (message: string) => void;
}
type UI = { view: ScreenShelfView; kind: ScreenKind; layout: 'grid' | 'list'; sort: string; descending: boolean; facetsOpen: boolean; facets: ScreenFacets; tags: string[]; collection: string | null; selecting: boolean; selected: string[] };
type Dialog = 'tags' | { kind: ScreenFormKind | 'tags'; id: string } | null;
const INITIAL: UI = { view: 'want', kind: 'movie', layout: 'grid', sort: 'recent', descending: true, facetsOpen: false, facets: {}, tags: [], collection: null, selecting: false, selected: [] };
export function ScreensWorkspace(props: ScreensWorkspaceProps) {
  const { snapshot, libraryView, disabled, onCommit } = props;
  const [ui, setUi] = useState<UI>(() => ({ ...INITIAL, kind: props.initialKind ?? 'movie' })), [dialog, setDialog] = useState<Dialog>(null), [menu, setMenu] = useState<ScreenMenuTarget | null>(null);
  const screens = useMemo(() => snapshot.items.filter(item => item.category === 'screen' && !item.removedAt && !item.hiddenAt), [snapshot]);
  const kindScreens = screens.filter(item => screenKind(item) === ui.kind);
  const kindLabel = SCREEN_KINDS.find(kind => kind.id === ui.kind)!.label;
  const scope = libraryView === 'library' ? kindScreens : snapshot.items.filter(item => item.category === 'screen' && (libraryView === 'trash' ? Boolean(item.removedAt) : !item.removedAt && Boolean(item.hiddenAt)));
  const tags = normalizeTags([...(snapshot.screenTagCatalog ?? []), ...kindScreens.flatMap(item => item.tags)]).sort((a, b) => a.localeCompare(b, 'zh'));
  const selectedTags = ui.tags.filter(tag => tags.includes(tag)), selectedIds = ui.selected.filter(id => scope.some(item => item.id === id));
  const collection = ui.kind === 'movie' ? snapshot.screenCollections?.find(value => value.id === ui.collection) : undefined;
  const candidates = scope.filter(item => (libraryView !== 'library' || matchesScreenShelf(item, ui.kind, ui.view) && (!collection || collection.screenIds.includes(item.id))) && matchesScreen(item, props.query, [], {}));
  const visible = candidates.filter(item => libraryView !== 'library' || matchesScreen(item, '', selectedTags, ui.facets)).sort((a, b) => {
    let left: number | string | undefined, right: number | string | undefined;
    if (ui.sort === 'title') { left = a.title; right = b.title; }
    else if (ui.sort === 'year') { left = a.year || undefined; right = b.year || undefined; }
    else if (ui.sort === 'score') { left = a.personalScore; right = b.personalScore; }
    else if (ui.sort === 'douban') { left = a.screenDetails?.doubanScore; right = b.screenDetails?.doubanScore; }
    else if (ui.sort === 'finished') { left = latestFinishedOn(a) || undefined; right = latestFinishedOn(b) || undefined; }
    else { left = a.createdAt; right = b.createdAt; }
    if (left === undefined || right === undefined) return left === right ? a.title.localeCompare(b.title, 'zh') : left === undefined ? 1 : -1;
    const order = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'zh', { numeric: true });
    return (ui.descending ? -order : order) || a.title.localeCompare(b.title, 'zh');
  });
  function update(values: Partial<UI>) { setUi(current => ({ ...current, ...values })); }
  function changeKind(kind: ScreenKind) {
    update({ kind, view: 'want', sort: 'recent', descending: true, facetsOpen: false, facets: {}, tags: [], collection: null, selecting: false, selected: [] });
    setMenu(null); setDialog(null);
    props.onKindChange?.(kind);
  }
  function patch(id: string, value: Partial<MediaItem>) {
    return onCommit(current => ({ ...current, items: current.items.map(item => item.id === id && item.category === 'screen' && !item.removedAt && !item.hiddenAt ? { ...item, ...value, updatedAt: new Date().toISOString() } : item) }), '影视资料已保存');
  }
  function action(id: string, value: ScreenAction) {
    return onCommit(current => ({ ...current, items: current.items.map(item => item.id === id && item.category === 'screen' && !item.removedAt && !item.hiddenAt ? applyScreenAction(item, value, new Date().toISOString()) : item) }), '观看记录已保存');
  }
  function toggleFacet(key: FacetKey, value: string) { setUi(current => ({ ...current, facets: { ...current.facets, [key]: current.facets[key]?.includes(value) ? current.facets[key]!.filter(item => item !== value) : [...(current.facets[key] ?? []), value] } })); }
  function classifyMany(value: ScreenArrangement) {
    if (!selectedIds.length || disabled || !screenArrangementOptions({ subcategory: kindLabel }).some(option => option.value === value)) return;
    onCommit(current => ({ ...current, items: current.items.map(item => {
      if (!selectedIds.includes(item.id) || item.category !== 'screen' || screenKind(item) !== ui.kind || item.removedAt || item.hiddenAt) return item;
      const next: ScreenAction = value === 'none' && !screenHasWatched(item) ? { type: 'round', round: { id: screenId(), impression: '', review: '' }, finishPlan: true } : { type: 'arrangement', value };
      return applyScreenAction(item, next, new Date().toISOString());
    }) }), '已更新所选影视，保留原有观看历史');
  }
  function toggle(id: string) { setUi(current => ({ ...current, selected: current.selected.includes(id) ? current.selected.filter(value => value !== id) : [...current.selected, id] })); }
  const dialogItem = dialog && typeof dialog === 'object' ? screens.find(item => item.id === dialog.id) : undefined;
  const menuItem = menu ? scope.find(item => item.id === menu.id) : undefined;
  // Close after a successful lifecycle edit actually removes the target. A failed
  // write leaves it in scope and keeps its menu available for another attempt.
  useEffect(() => { if (menu && !menuItem) setMenu(null); }, [menu, menuItem]);
  useEffect(() => { setMenu(null); }, [libraryView]);
  return <div className="books-workspace screen-workspace">
    {libraryView === 'library' && <>
      <div className="screen-primary-row"><nav className="status-tabs books-views screen-kind-tabs" aria-label={t("影视类型")}>{SCREEN_KINDS.map(kind => <button key={kind.id} className={ui.kind === kind.id ? 'is-selected' : ''} aria-pressed={ui.kind === kind.id} onClick={() => changeKind(kind.id)}>{t(kind.label)}<small>{screens.filter(item => screenKind(item) === kind.id).length}</small></button>)}</nav><div className="books-primary-actions"><button className="button button--secondary" disabled={disabled} onClick={() => update({ selecting: !ui.selecting, selected: [] })}><CheckCircle2 size={14}/>{t("多选整理")}</button><button className="button button--secondary" disabled={disabled} onClick={() => props.onBatch(ui.kind)}><ListPlus size={15}/>{t("批量收录")}</button><button className="button button--primary" disabled={disabled} onClick={() => props.onCreate(ui.kind)}><Plus size={15}/>{t("收录")}{t(kindLabel)}</button></div></div>
      <ScreenFilters items={kindScreens} kind={ui.kind} view={ui.view} onView={view => update({ view, sort: view === 'watched' ? 'finished' : 'recent', descending: true })} count={visible.length} layout={ui.layout} onLayout={layout => update({ layout })} sort={ui.sort} onSort={sort => update({ sort })} descending={ui.descending} onDirection={() => update({ descending: !ui.descending })} expanded={ui.facetsOpen} onExpand={() => update({ facetsOpen: !ui.facetsOpen })} facets={ui.facets} onFacet={toggleFacet} onClear={() => update({ facets: {} })}/>
    </>}
    <div className={libraryView === 'library' && ui.kind === 'movie' ? 'books-content' : 'screen-content-single'}><main className="books-main">
      {libraryView === 'library' && <><ScreenTags tags={tags} selected={selectedTags} toggle={tag => update({ tags: selectedTags.includes(tag) ? selectedTags.filter(value => value !== tag) : [...selectedTags, tag] })} manage={() => setDialog('tags')} disabled={disabled}/>{collection && <div className="books-collection-filter"><strong>{collection.title}</strong><button className="text-button" onClick={() => update({ collection: null })}>{t("清除片单筛选")}</button></div>}{!visible.length && kindScreens.length > 0 && <button className="text-button" onClick={() => update({ view: 'all', tags: [], facets: {}, collection: null })}>{t("查看全部")}{t(kindLabel)}</button>}</>}
      <ScreenShelf items={visible} layout={ui.layout} onOpen={props.onOpen} onMenu={setMenu} disabled={disabled} onCreate={() => props.onCreate(ui.kind)} recycled={libraryView === 'trash'} selecting={ui.selecting && libraryView === 'library'} selected={selectedIds} onSelect={toggle}/>
    </main>{libraryView === 'library' && ui.kind === 'movie' && <ScreenCollections snapshot={snapshot} screens={kindScreens} selected={collection?.id ?? null} onSelect={id => update({ collection: id })} onCommit={onCommit} disabled={disabled}/>}</div>
    {ui.selecting && libraryView === 'library' && <SelectionBar count={selectedIds.length} canSelectAll={visible.some(item => !selectedIds.includes(item.id))} onSelectAll={() => update({ selected: [...new Set([...selectedIds, ...visible.map(item => item.id)])] })} onClear={() => update({ selected: [] })} onExit={() => update({ selecting: false, selected: [] })}><label className="screen-bulk-status">{t("观看安排")}<select aria-label={t("批量观看安排")} value="" disabled={disabled || !selectedIds.length} onChange={event => classifyMany(event.target.value as ScreenArrangement)}><option value="" disabled>{t("设置分类…")}</option>{screenArrangementOptions({ subcategory: kindLabel }).map(option => <option key={option.value} value={option.value}>{t(option.label)}{option.value === 'none' ? t('（日期未知）') : ''}</option>)}</select></label><button className="button button--secondary" disabled={disabled || !selectedIds.length} onClick={() => props.onLifecycle('trash', selectedIds)}>{t("移到回收站")}</button><span className="books-muted">{selectedIds.filter(id => !visible.some(item => item.id === id)).length} {" "}{t("部在当前结果之外")}</span></SelectionBar>}
    {menu && menuItem && <ScreenMenu key={menu.id} item={menuItem} target={menu} disabled={disabled} recycled={libraryView === 'trash'} onClose={() => setMenu(null)} onAction={value => action(menu.id, value)} onScore={personalScore => patch(menu.id, { personalScore })} onEdit={() => props.onEdit(menu.id)} onTags={() => setDialog({ kind: 'tags', id: menu.id })} onRound={() => setDialog({ kind: 'round', id: menu.id })} onLifecycle={props.onLifecycle}/>}
    {dialog === 'tags' && <ScreenTagsDialog snapshot={snapshot} onCommit={onCommit} onClose={() => setDialog(null)} onDeleted={tag => update({ tags: ui.tags.filter(value => value !== tag) })}/>}
    {dialog && typeof dialog === 'object' && dialogItem && (dialog.kind === 'tags' ? <QuickEditor mode="tags" item={dialogItem} availableItems={screens} catalogTags={snapshot.screenTagCatalog} onClose={() => setDialog(null)} onSave={value => patch(dialog.id, value)}/> : <ScreenActionForm kind={dialog.kind} item={dialogItem} onClose={() => setDialog(null)} onSave={value => action(dialog.id, value)}/>)}
  </div>;
}
