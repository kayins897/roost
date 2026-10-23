import type { ChangeEvent } from 'react';
import { useCallback,useEffect,useMemo,useRef } from 'react';
import type { GameBatchEditPlan } from '../../domain/batchEdit.ts';
import { createGameBatchEditPlan } from '../../domain/batchEdit.ts';
import type { MetadataCandidate } from '../../domain/catalog.ts';
import { isImportExcluded } from '../../domain/importExclusions.ts';
import { moveGameWithinRank, type RankMode } from '../../domain/gamePlanning.ts';
import { defaultSortDirection, sortLibraryItems, type LibrarySort, type SortDirection } from '../../domain/librarySort.ts';
import { deleteTag,emptyGameTags,filterLibrary,GAME_TAG_KEYS,gamePlayStateFor,isValidSnapshot,normalizeTags,platformsFor,renameTag } from '../../domain/library.ts';
import { permanentlyDeleteItems,restoreItems,setItemsHidden,trashItems,visibleLibraryItems,type LibraryView } from '../../domain/lifecycle.ts';
import { previewSteamImport } from '../../domain/steamImport.ts';
import type { SteamLibraryGame,SteamSyncOptions } from '../../domain/steamSync.ts';
import { applySteamSync } from '../../domain/steamSync.ts';
import type { GamePlayState,GameTagGroupKey,GameTagGroups,LibrarySnapshot,MediaItem,MediaType,ProgressStatus } from '../../domain/types.ts';
import { demoIds } from '../../infrastructure/demoData.ts';
import { createRepository } from '../../infrastructure/repository.ts';
import { useAmbientMotion } from '../AmbientScene.tsx';
import { type BatchAction,type TagAssignment } from '../BatchEdit.tsx';
import { useAppearance } from '../appearance.ts';
import { type ItemMenu } from '../features/library/ContextMenu.tsx';
import { type TagScope } from '../features/tags/TagManager.tsx';
import { useCoverDepth } from '../useCoverDepth.ts';
import { useFieldState } from './useFieldState.ts';
type Section = MediaType;
type SortMode = LibrarySort;
type ViewMode = 'grid' | 'list';
const repo = createRepository();
function initialize(): { snapshot: LibrarySnapshot; error: string } {
  try { return { snapshot: repo.load(), error: '' }; }
  catch (error) { return { snapshot: { schemaVersion: 1, items: [] }, error: error instanceof Error ? error.message : '读取失败' }; }
}

export function useWorkspaceController() {
  const appearance = useAppearance();
  const ambient = useAmbientMotion();
  useCoverDepth();
  const initial = useMemo(initialize, []);
  const fields = useFieldState(() => ({
    snapshot: initial.snapshot,
    loadError: initial.error,
    section: ('game') as Section,
    selecting: false,
    selectionIds: ((() => new Set())()) as Set<string>,
    batchEditOpen: false,
    status: ('all') as ProgressStatus | 'all',
    gameFilter: ('plan') as GamePlayState | 'all' | 'plan',
    libraryView: 'library' as LibraryView,
    batchAction: 'state' as BatchAction,
    assignment: null as TagAssignment | null,
    contextMenu: null as ItemMenu | null,
    quickItem: null as { id: string; mode: 'time' | 'tags' | 'priority' | 'rating' } | null,
    subtypeFilter: 'all',
    query: '',
    selectedTags: ([]) as string[],
    selectedGameTags: emptyGameTags(),
    favoriteOnly: false,
    filtersOpen: false,
    tagsOpen: true,
    sort: ('rank') as SortMode,
    sortDirection: 'desc' as SortDirection,
    view: ('grid') as ViewMode,
    selectedId: (null) as string | null,
    editor: (null) as 'new' | 'edit' | 'import' | null,
    metadataOpen: false,
    batchOpen: false,
    steamOpen: false,
    metadataCandidate: (null) as MetadataCandidate | null,
    importedDraft: (null) as MediaItem | null,
    tagManager: false,
    settings: false,
    menuOpen: false,
    toast: ''
  }));
  const [snapshot, setSnapshot] = fields('snapshot');
  const snapshotRef = useRef(snapshot); snapshotRef.current = snapshot;
  const [loadError, setLoadError] = fields('loadError');
  const [section, setSection] = fields('section');
  const [selecting, setSelecting] = fields('selecting');
  const [selectionIds, setSelectionIds] = fields('selectionIds');
  const [batchEditOpen, setBatchEditOpen] = fields('batchEditOpen');
  useEffect(() => { setSelecting(false); setSelectionIds(new Set()); setBatchEditOpen(false); }, [section]);
  const [status, setStatus] = fields('status');
  const [gameFilter, setGameFilter] = fields('gameFilter');
  const [libraryView, setLibraryView] = fields('libraryView');
  const [batchAction, setBatchAction] = fields('batchAction');
  const [assignment, setAssignment] = fields('assignment');
  const [contextMenu, setContextMenu] = fields('contextMenu');
  const [quickItem, setQuickItem] = fields('quickItem');
  const [subtypeFilter, setSubtypeFilter] = fields('subtypeFilter');
  const [query, setQuery] = fields('query');
  const [selectedTags, setSelectedTags] = fields('selectedTags');
  const [selectedGameTags, setSelectedGameTags] = fields('selectedGameTags');
  const [favoriteOnly, setFavoriteOnly] = fields('favoriteOnly');
  const [filtersOpen, setFiltersOpen] = fields('filtersOpen');
  const [tagsOpen, setTagsOpen] = fields('tagsOpen');
  const [sort, setSortValue] = fields('sort');
  const [sortDirection, setSortDirection] = fields('sortDirection');
  function setSort(next: LibrarySort) { setSortValue(next); setSortDirection(defaultSortDirection(next)); }
  function toggleSortDirection() { setSortDirection(current => current === 'asc' ? 'desc' : 'asc'); }
  const [view, setView] = fields('view');
  const [selectedId, setSelectedId] = fields('selectedId');
  const [editor, setEditor] = fields('editor');
  const [metadataOpen, setMetadataOpen] = fields('metadataOpen');
  const [batchOpen, setBatchOpen] = fields('batchOpen');
  const [steamOpen, setSteamOpen] = fields('steamOpen');
  const [metadataCandidate, setMetadataCandidate] = fields('metadataCandidate');
  const [importedDraft, setImportedDraft] = fields('importedDraft');
  const [tagManager, setTagManager] = fields('tagManager');
  const [settings, setSettings] = fields('settings');
  const [menuOpen, setMenuOpen] = fields('menuOpen');
  const [toast, setToast] = fields('toast');
  const fileInput = useRef<HTMLInputElement>(null);
  const detailGuard = useRef<(() => boolean) | null>(null);
  // MediaCard 经 memo 跳过无关重渲染，需要稳定的 onOpen 标识：经 ref 转发最新行为。
  const selectingRef = useRef(selecting); selectingRef.current = selecting;
  const cardActionsRef = useRef<{ toggle: (id: string) => void; open: (id: string) => void }>({ toggle: () => undefined, open: () => undefined });
  cardActionsRef.current = { toggle: toggleSelection, open: openItem };
  const handleCardOpen = useCallback((id: string) => { if (selectingRef.current) cardActionsRef.current.toggle(id); else cardActionsRef.current.open(id); }, []);

  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 3600); return () => window.clearTimeout(timer); }, [toast]);
  const items = snapshot.items;
  const libraryItems = useMemo(() => visibleLibraryItems(snapshot, libraryView), [snapshot, libraryView]);
  const activeItems = useMemo(() => visibleLibraryItems(snapshot), [snapshot]);
  const contextItem = items.find(item => item.id === contextMenu?.id);
  const quickRecord = items.find(item => item.id === quickItem?.id);
  // 以下派生数组全部收敛进 useMemo：525 款规模下，localeCompare 排序与全量扫描
  // 不应跟随无关 state（toast、菜单、弹层）的每次重渲染执行。
  const selected = useMemo(() => items.find(item => item.id === selectedId) ?? null, [items, selectedId]);
  const scope = useMemo(() => libraryItems.filter(item => item.category === section), [libraryItems, section]);
  const selectedGames = useMemo(() => items.filter(item => item.category === 'game' && selectionIds.has(item.id)), [items, selectionIds]);
  const subtypes = useMemo(() => [...new Set(scope.flatMap(item => section === 'game' ? platformsFor(item) : [item.subcategory.trim()]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')), [scope, section]);
  const visible = useMemo(() => {
    const result = filterLibrary(libraryItems, { category: section, subcategory: subtypeFilter === 'all' ? undefined : subtypeFilter, status: section === 'game' ? 'all' : status, gamePlayState: section === 'game' && gameFilter !== 'plan' ? gameFilter : 'all', search: query, tags: selectedTags, gameTags: selectedGameTags, favoriteOnly });
    const planned = section === 'game' && gameFilter === 'plan' ? result.filter(item => ['want','paused'].includes(gamePlayStateFor(item))) : result;
    const grouped = section === 'game' && libraryView === 'library' && ['plan','want','cleared'].includes(gameFilter);
    // Group direction changes grades, never the fallback/manual order within a grade.
    return sortLibraryItems(planned, { sort: sort === 'rank' && grouped ? 'recent' : sort, direction: sort === 'rank' && grouped ? 'desc' : sortDirection, rankMode: gameFilter === 'cleared' ? 'rating' : 'priority', pausedLast: section === 'game' && gameFilter === 'plan' });
  }, [libraryItems, section, status, gameFilter, subtypeFilter, query, selectedTags, selectedGameTags, favoriteOnly, sort, sortDirection, libraryView]);
  const hasDemos = useMemo(() => items.some(item => demoIds.has(item.id)), [items]);
  const totalGameMinutes = useMemo(() => scope.filter(item => item.category === 'game').reduce((sum, item) => sum + (item.playtimeMinutes ?? 0), 0), [scope]);
  const appliedFilterCount = selectedTags.length + GAME_TAG_KEYS.reduce((sum, key) => sum + selectedGameTags[key].length, 0) + (subtypeFilter === 'all' ? 0 : 1) + (favoriteOnly ? 1 : 0);
  const showCollectionPrompt = visible.length > 0 && visible.length < 3 && visible.length === scope.length && !query.trim() && appliedFilterCount === 0;

  function commit(next: LibrarySnapshot, successMessage?: string, restoringBackup = false, backupBeforeAppend = false): boolean {
    if (loadError && !restoringBackup) {
      setToast('收藏库处于恢复模式，请先在「数据与设置」中导入有效备份。');
      return false;
    }
    try { repo.save(next, { allowRecovery: restoringBackup, backupBeforeAppend }); snapshotRef.current = next; setSnapshot(next); if (restoringBackup) setLoadError(''); if (successMessage) setToast(successMessage); return true; }
    catch (error) { setToast(`保存失败：${error instanceof Error ? error.message : '可能已达到本地存储上限'}`); return false; }
  }
  function updateItems(transform: (items: MediaItem[]) => MediaItem[], successMessage?: string) { const current = snapshotRef.current; return commit({ ...current, items: transform(current.items) }, successMessage); }
  function toggleSelection(id: string) {
    setSelectionIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function startSelection() { guardDetail(() => { detailGuard.current = null; setSelectedId(null); setSelectionIds(new Set()); setAssignment(null); setSelecting(true); }); }
  function applyBatchEdit(plan: GameBatchEditPlan) {
    const current = snapshotRef.current;
    const next = createGameBatchEditPlan(current.items, plan.selectedIds, plan.input);
    if (!next.changedCount) { setToast('所选作品已符合本次设置，请返回调整。'); return false; }
    if (!commit({ ...current, items: next.items }, `已更新 ${next.changedCount} 款游戏`)) return false;
    setSelecting(false); setSelectionIds(new Set());
    return true;
  }
  function changeGameFilter(next: GamePlayState | 'all' | 'plan') { setGameFilter(next); setSort(['want','plan','cleared'].includes(next) ? 'rank' : 'recent'); }
  function reorderGame(sourceId: string, targetId: string, mode: RankMode) {
    const current = snapshotRef.current.items;
    const fallbackOrder = sortLibraryItems(current, { sort: 'recent', direction: 'desc' });
    const moved = moveGameWithinRank(fallbackOrder, sourceId, targetId, mode);
    if (!moved.changedCount) return false;
    const ordered = new Map(moved.items.map(item => [item.id,item]));
    const now = new Date().toISOString();
    return updateItems(items => items.map(item => { const next = ordered.get(item.id); return next && next !== item ? { ...next, updatedAt: now } : item; }), '同等级顺序已保存');
  }
  function patchSelected(patch: Partial<MediaItem>) { if (!selectedId) return false; return updateItems(current => current.map(item => item.id === selectedId ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)); }
  function guardDetail(action: () => void) { if (!selected || !detailGuard.current || detailGuard.current()) action(); }
  function closeDetail() { guardDetail(() => { detailGuard.current = null; setSelectedId(null); }); }
  function openItem(id: string) { guardDetail(() => { detailGuard.current = null; setSelectedId(id); }); }
  function openEditor() { guardDetail(() => setEditor('new')); }
  function navigate(next: Section) { guardDetail(() => { detailGuard.current = null; setSelectedId(null); setSection(next); setSelectedTags([]); setSelectedGameTags(emptyGameTags()); setFavoriteOnly(false); setStatus('all'); setGameFilter(next === 'game' ? 'plan' : 'all'); setLibraryView('library'); setContextMenu(null); setSubtypeFilter('all'); setSort(next === 'game' ? 'rank' : 'recent'); setQuery(''); setFiltersOpen(false); setMenuOpen(false); }); }
  function saveWork(item: MediaItem) {
    if (!items.some(existing => existing.id === item.id) && isImportExcluded(item, snapshotRef.current.importExclusions)) { setToast('这件作品已被移除，导入会跳过。未永久删除的作品可从回收站恢复。'); return; }
    if (updateItems(current => current.some(existing => existing.id === item.id) ? current.map(existing => existing.id === item.id ? item : existing) : [item, ...current], items.some(existing => existing.id === item.id) ? '作品已更新' : '已加入收藏库')) {
      setEditor(null); setImportedDraft(null); setLibraryView('library'); setSection(item.category); setSelectedId(item.id); setStatus('all'); setGameFilter('all'); setSubtypeFilter('all'); setSelectedTags([]); setSelectedGameTags(emptyGameTags()); setFavoriteOnly(false); setQuery(''); setSort('recent');
    }
  }
  function importBatch(additions: MediaItem[]) {
    const current = snapshotRef.current;
    const accepted = previewSteamImport(additions, current.items, current.importExclusions).filter(row => !row.duplicate).map(row => additions[Number(row.key)]);
    if (!accepted.length) { setToast('这些作品已在收藏库中，请重新检查清单。'); return false; }
    if (!commit({ ...current, items: [...accepted, ...current.items] }, `已新增 ${accepted.length} 件作品`, false, true)) return false;
    detailGuard.current = null; setSelectedId(null); setLibraryView('library'); setSelecting(false); setSelectionIds(new Set()); setSection(accepted[0].category);
    setStatus('all'); setGameFilter('all'); setSubtypeFilter('all'); setSelectedTags([]); setSelectedGameTags(emptyGameTags()); setFavoriteOnly(false); setQuery(''); setSort('recent');
    return true;
  }
  function syncSteam(games: SteamLibraryGame[], selectedAppIds: ReadonlySet<string>, options: SteamSyncOptions) {
    const current = snapshotRef.current;
    const result = applySteamSync(games, current.items, selectedAppIds, { ...options, exclusions: current.importExclusions });
    if (!result.added && !result.updated) { setToast('所选游戏无需更新，请重新检查预览。'); return false; }
    if (!commit({ ...current, items: result.items }, `Steam：新增 ${result.added} 款，更新 ${result.updated} 款`, false, true)) return false;
    detailGuard.current = null; setSelectedId(null); setLibraryView('library'); setSelecting(false); setSelectionIds(new Set()); setSection('game');
    setStatus('all'); setGameFilter('all'); setSubtypeFilter('all'); setSelectedTags([]); setSelectedGameTags(emptyGameTags()); setFavoriteOnly(false); setQuery(''); setSort('recent');
    return true;
  }
  function lifecycleAction(action: 'hide' | 'unhide' | 'trash' | 'restore' | 'delete', ids: string[]) {
    if (!ids.length) return;
    if (action === 'trash' && !window.confirm('将选中的 ' + ids.length + ' 件作品移到回收站？可恢复，后续导入会跳过。')) return;
    if (action === 'delete' && !window.confirm('永久删除这 ' + ids.length + ' 件作品及个人记录？无法撤销。导入排除记录仍保留。')) return;
    const current = snapshotRef.current;
    const next = action === 'hide' || action === 'unhide' ? setItemsHidden(current, ids, action === 'hide') : action === 'trash' ? trashItems(current, ids) : action === 'restore' ? restoreItems(current, ids) : permanentlyDeleteItems(current, ids);
    if (commit(next, action === 'hide' ? '已隐藏，可从「已隐藏」找回' : action === 'unhide' ? '已取消隐藏' : action === 'trash' ? '已移到回收站' : action === 'restore' ? '已恢复作品' : '已永久删除')) {
      detailGuard.current = null; setSelectedId(null); setSelecting(false); setSelectionIds(new Set()); setContextMenu(null);
    }
  }
  function changeLibraryView(next: LibraryView, plan = false) {
    guardDetail(() => { setLibraryView(next); setGameFilter(plan ? 'plan' : 'all'); setSort(plan ? 'rank' : 'recent'); setQuery(''); setStatus('all'); setSubtypeFilter('all'); setSelectedTags([]); setSelectedGameTags(emptyGameTags()); setFavoriteOnly(false); setSelecting(false); setSelectionIds(new Set()); setSelectedId(null); setContextMenu(null); });
  }
  function assignTag(group: GameTagGroupKey, name: string) {
    setTagManager(false); changeLibraryView('library'); startSelection(); setAssignment({ group, name }); setToast('请选择需要添加「' + name + '」的作品，再点底部「添加标签」');
  }
  function manageTag(oldName: string, newName: string | undefined, tagScope: TagScope) {
    const saved = updateItems(current => {
      const active = current.filter(item => !item.hiddenAt && !item.removedAt);
      const edited = new Map((newName === undefined ? deleteTag(active, oldName, tagScope) : renameTag(active, oldName, newName, tagScope)).map(item => [item.id, item]));
      return current.map(item => edited.get(item.id) ?? item);
    }, newName === undefined ? '标签已删除' : '标签已更新');
    if (saved) changeTagFilters(oldName, newName, tagScope);
    return saved;
  }
  function openMenu(id: string, x: number, y: number) { guardDetail(() => { setContextMenu({ id, x, y }); }); }
  function patchItem(id: string, patch: Partial<MediaItem>) { return updateItems(current => current.map(item => item.id === id && !item.removedAt ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)); }
  function exportBackup() {
    if (loadError) { setToast('收藏库尚未恢复，无法导出有效备份。请先导入备份恢复。'); return; }
    if (selected && detailGuard.current && !detailGuard.current()) return;
    const payload = JSON.stringify({ ...snapshotRef.current, exportedAt: new Date().toISOString() }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const today = new Date();
    const dateLabel = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `栖域-收藏备份-${dateLabel}.json`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000); setToast('已发起备份导出，请确认文件已保存');
  }
  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (selected && detailGuard.current && !detailGuard.current()) return;
    try {
      if (file.size > 128 * 1024 * 1024) throw new Error('备份文件超过 128 MB，请检查文件');
      const content: unknown = JSON.parse(await file.text());
      if (!isValidSnapshot(content)) throw new Error('文件不是受支持的栖域 v1 备份');
      const confirmation = loadError
        ? `备份包含 ${content.items.length} 件作品。将以此备份恢复收藏库，确定继续吗？`
        : `备份包含 ${content.items.length} 件作品。导入会替换当前 ${items.length} 件作品，确定继续吗？`;
      if (!window.confirm(confirmation)) return;
      if (commit({ ...content, items: content.items }, '备份导入成功', true)) { detailGuard.current = null; setSelectedId(null); setLibraryView('library'); setSelecting(false); setSelectionIds(new Set()); setBatchEditOpen(false); setSelectedTags([]); setSelectedGameTags(emptyGameTags()); setFavoriteOnly(false); setSubtypeFilter('all'); setGameFilter('all'); setStatus('all'); setQuery(''); setSort('recent'); setSection('game'); setSettings(false); }
    } catch (error) { setToast(`导入失败：${error instanceof Error ? error.message : '文件无法读取'}`); }
  }
  function clearDemo() {
    if (!window.confirm('仅移除初次体验用的演示作品，保留你自己添加的内容。确定吗？')) return;
    if (updateItems(current => current.filter(item => !demoIds.has(item.id)), '演示作品已清除') && selectedId && demoIds.has(selectedId)) setSelectedId(null);
  }
  function changeTagFilters(oldName: string, newName: string | undefined, tagScope: TagScope) {
    const replace = (values: string[]) => normalizeTags(values.flatMap(value => value.toLocaleLowerCase() === oldName.toLocaleLowerCase() ? newName ? [newName.trim()] : [] : [value]));
    if (!tagScope.group) setSelectedTags(replace);
    setSelectedGameTags(current => Object.fromEntries(GAME_TAG_KEYS.map(key => [key, !tagScope.group || tagScope.group === key ? replace(current[key]) : current[key]])) as GameTagGroups);
  }

  
  return { reorderGame, changeGameFilter, appearance, ambient, initial, snapshot, loadError, section, setSection, selecting, setSelecting, selectionIds, setSelectionIds, batchEditOpen, setBatchEditOpen, status, setStatus, gameFilter, setGameFilter, libraryView, batchAction, setBatchAction, assignment, setAssignment, contextMenu, setContextMenu, quickItem, setQuickItem, subtypeFilter, setSubtypeFilter, query, setQuery, selectedTags, setSelectedTags, selectedGameTags, setSelectedGameTags, favoriteOnly, setFavoriteOnly, filtersOpen, setFiltersOpen, tagsOpen, setTagsOpen, sort, setSort, sortDirection, toggleSortDirection, view, setView, setSelectedId, editor, setEditor, metadataOpen, setMetadataOpen, batchOpen, setBatchOpen, steamOpen, setSteamOpen, metadataCandidate, setMetadataCandidate, importedDraft, setImportedDraft, tagManager, setTagManager, settings, setSettings, menuOpen, setMenuOpen, toast, setToast, fileInput, detailGuard, handleCardOpen, items, activeItems, contextItem, quickRecord, selected, scope, selectedGames, subtypes, visible, hasDemos, totalGameMinutes, appliedFilterCount, showCollectionPrompt, updateItems, startSelection, applyBatchEdit, patchSelected, guardDetail, closeDetail, openEditor, navigate, saveWork, importBatch, syncSteam, lifecycleAction, changeLibraryView, assignTag, manageTag, openMenu, patchItem, exportBackup, importBackup, clearDemo, changeTagFilters };
}
