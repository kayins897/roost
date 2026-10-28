import type { ChangeEvent } from 'react';
import { applyBookAction, type BookAction } from '../../domain/books.ts';
import { isBookArrangement, isBookExperienceEntry, isBookReadingPlan, isBookReadingRound } from '../../domain/booksValidation.ts';
import { bulkScorePatch } from '../../domain/gameScore.ts';
import { useCallback,useEffect,useMemo,useRef } from 'react';
import type { GameBatchEditPlan } from '../../domain/batchEdit.ts';
import { createBulkGradePatch, createGameBatchEditPlan } from '../../domain/batchEdit.ts';
import type { MetadataCandidate } from '../../domain/catalog.ts';
import { isImportExcluded } from '../../domain/importExclusions.ts';
import { gradeEditable, priorityEditable } from '../../domain/gameProgress.ts';
import { experienceCategoryFor, experienceClassificationPatch, type GameExperienceClassification } from '../../domain/gameExperience.ts';
import { moveGameWithinRank, type RankMode } from '../../domain/gamePlanning.ts';
import { defaultSortDirection, sortLibraryItems, type LibrarySort, type SortDirection } from '../../domain/librarySort.ts';
import { deleteTag,emptyGameTags,filterLibrary,GAME_TAG_KEYS,GAME_TAG_LABELS,gameTagsFor,isValidSnapshot,moveGameTag,normalizeTags,platformsFor,renameTag } from '../../domain/library.ts';
import { permanentlyDeleteItems,restoreItems,setItemsHidden,trashItems,visibleLibraryItems,type LibraryView } from '../../domain/lifecycle.ts';
import { previewSteamImport } from '../../domain/steamImport.ts';
import type { SteamLibraryGame,SteamSyncOptions } from '../../domain/steamSync.ts';
import { applySteamSync } from '../../domain/steamSync.ts';
import type { GameTagGroupKey,GameTagGroups,LibrarySnapshot,MediaItem,MediaType,ProgressStatus } from '../../domain/types.ts';
import { demoIds } from '../../infrastructure/demoData.ts';
import { createRepository } from '../../infrastructure/repository.ts';
import { chooseFullBackup, desktopGameAssetsAvailable, discardBackup, exportFullBackup, installBackupAssets } from '../../infrastructure/gameAssets.ts';
import { useAmbientMotion } from '../AmbientScene.tsx';
import { type BatchAction,type TagAssignment } from '../BatchEdit.tsx';
import { useAppearance } from '../appearance.ts';
import { classificationRankMode } from '../features/library/experienceOptions.ts';
import { type ItemMenu } from '../features/library/ContextMenu.tsx';
import { type TagScope } from '../features/tags/TagManager.tsx';
import { useCoverDepth } from '../useCoverDepth.ts';
import { useHoloCovers } from '../features/materials/useHoloCovers.ts';
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
  useHoloCovers();
  const initial = useMemo(initialize, []);
  const fields = useFieldState(() => ({
    snapshot: initial.snapshot,
    loadError: initial.error,
    section: ('game') as Section,
    selecting: false,
    selectionIds: ((() => new Set())()) as Set<string>,
    batchEditOpen: false,
    status: ('all') as ProgressStatus | 'all',
    gameFilter: 'unplayed' as 'unplayed' | 'experienced' | 'all',
    experienceCategoryFilter: 'all' as GameExperienceClassification | 'all',
    libraryView: 'library' as LibraryView,
    batchAction: 'add-tags' as BatchAction,
    assignment: null as TagAssignment | null,
    contextMenu: null as ItemMenu | null,
    quickItem: null as { id: string; mode: 'time' | 'tags' } | null,
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
    tagManager: false as boolean | 'create',
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
  useEffect(() => { setSelecting(false); setSelectionIds(new Set()); setBatchEditOpen(false); setAssignment(null); }, [section]);
  const [status, setStatus] = fields('status');
  const [gameFilter, setGameFilterValue] = fields('gameFilter');
  const [experienceCategoryFilter, setExperienceCategoryFilter] = fields('experienceCategoryFilter');
  function setGameFilter(next: 'unplayed' | 'experienced' | 'all') { setGameFilterValue(next); setExperienceCategoryFilter('all'); }
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
    // 主类双选 OR，二级、客观通关事实与其他条件 AND；旧状态仅用于只读兼容。
    let result = filterLibrary(libraryItems, { category: section, subcategory: subtypeFilter === 'all' ? undefined : subtypeFilter, status: section === 'game' ? 'all' : status, gameExperienceStatuses: section === 'game' && gameFilter !== 'all' ? [gameFilter] : undefined, search: query, tags: selectedTags, gameTags: selectedGameTags, favoriteOnly });
    if (section === 'game' && gameFilter === 'experienced' && experienceCategoryFilter !== 'all') result = result.filter(item => experienceCategoryFilter === 'unclassified' ? experienceCategoryFor(item) === undefined : experienceCategoryFor(item) === experienceCategoryFilter);
    const rankMode = classificationRankMode(gameFilter, experienceCategoryFilter);
    const grouped = section === 'game' && libraryView === 'library' && rankMode !== undefined;
    // Group direction changes grades, never the fallback/manual order within a grade.
    return sortLibraryItems(result, { sort: sort === 'rank' && grouped ? 'recent' : sort, direction: sort === 'rank' && grouped ? 'desc' : sortDirection, rankMode, pausedLast: false });
  }, [libraryItems, section, status, gameFilter, experienceCategoryFilter, subtypeFilter, query, selectedTags, selectedGameTags, favoriteOnly, sort, sortDirection, libraryView]);
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
  function updateSnapshot(transform: (current: LibrarySnapshot) => LibrarySnapshot, message?: string): boolean {
    try {
      const current = snapshotRef.current, next = transform(current);
      if (next === current || JSON.stringify(next) === JSON.stringify(current)) return true;
      return commit(next, message);
    } catch (error) { setToast(`保存失败：${error instanceof Error ? error.message : '请重试'}`); return false; }
  }
  function updateItems(transform: (items: MediaItem[]) => MediaItem[], successMessage?: string) { return updateSnapshot(current => ({ ...current, items: transform(current.items) }), successMessage); }
  function bookAction(id: string, action: BookAction): boolean {
    const item = snapshotRef.current.items.find(value => value.id === id && value.category === 'book' && !value.removedAt);
    const valid = action.type === 'arrangement' ? isBookArrangement(action.value) : action.type === 'entry' ? isBookExperienceEntry(action.entry) : action.type === 'round' ? isBookReadingRound(action.round) : action.type === 'plan' ? isBookReadingPlan(action) : true;
    if (!item || !valid) { setToast('书籍或记录已变化，请检查输入后重试。'); return false; }
    return updateItems(items => items.map(value => value.id === id ? applyBookAction(value, action, new Date().toISOString()) : value), '阅读记录已保存');
  }
  function toggleSelection(id: string) {
    setSelectionIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function startSelection() { guardDetail(() => { detailGuard.current = null; setSelectedId(null); setSelectionIds(new Set()); setAssignment(null); setSelecting(true); }); }
  function applyBatchEdit(plan: Pick<GameBatchEditPlan, 'selectedIds' | 'input' | 'changedCount' | 'items'>) {
    const current = snapshotRef.current;
    const requested = new Set(plan.selectedIds);
    const eligible = current.items.filter(item => requested.has(item.id) && item.category === 'game' && !item.removedAt);
    if (!requested.size || eligible.length !== requested.size || (assignment && eligible.some(item => item.hiddenAt))) { setToast('所选作品已变化，请关闭并重新检查选择；未更新任何作品。'); return false; }
    const next = createGameBatchEditPlan(current.items, plan.selectedIds, plan.input);
    if (!next.changedCount) { setToast('所选作品已符合本次设置，请返回调整。'); return false; }
    if (!commit({ ...current, items: next.items }, `已更新 ${next.changedCount} 款游戏`)) return false;
    setSelecting(false); setSelectionIds(new Set()); setAssignment(null);
    return true;
  }
  // 多选快捷定级：只传等级输入（不带状态）的纯等级补丁，不重写状态、不规范化旧别名；
  // 仅作用于当前状态与维度匹配（want→优先级 / cleared→评级）的所选游戏。成功后保持多选便于连续整理。
  function applyBulkClassification(value: GameExperienceClassification) {
    const current = snapshotRef.current;
    const chosen = current.items.filter(item => selectionIds.has(item.id));
    if (!chosen.length || chosen.some(item => item.category !== 'game' || item.removedAt)) { setToast('所选作品已变化，请重新检查选择。'); return false; }
    const patch = experienceClassificationPatch(value);
    const changed = chosen.filter(item => Object.entries(patch).some(([key, value]) => item[key as keyof MediaItem] !== value));
    if (!changed.length) { setToast('所选作品已经是该分类。'); return true; }
    const ids = new Set(changed.map(item => item.id));
    const now = new Date().toISOString();
    return commit({ ...current, items: current.items.map(item => ids.has(item.id) ? { ...item, ...patch, updatedAt: now } : item) }, `已更新 ${changed.length} 款游戏的体验分类`);
  }
  function applyBulkGrade(mode: 'priority' | 'rating', value: NonNullable<MediaItem['playPriority']> | undefined) {
    const current = snapshotRef.current;
    const selected = current.items.filter(item => selectionIds.has(item.id));
    const eligible = selected.filter(item => item.category === 'game' && !item.removedAt && (mode === 'priority' ? priorityEditable(item) : gradeEditable(item))).map(item => item.id);
    if (!eligible.length || eligible.length !== selectionIds.size) { setToast('所选作品并非全部适用该等级；未更新任何作品。'); return false; }
    const patch = createBulkGradePatch(current.items, eligible, mode, value);
    if (!patch.changedCount) { setToast('所选游戏已符合该等级，无需更新。'); return false; }
    return commit({ ...current, items: patch.items }, `已更新 ${patch.changedCount} 款游戏的${mode === 'priority' ? '游玩优先级' : '通关评级'}`);
  }
  function applyBulkScore(value: number | undefined) {
    try {
      const changed = bulkScorePatch(snapshotRef.current.items, selectionIds, value);
      if (!changed.changedCount) { setToast('所选游戏已是该评分'); return false; }
      return commit({ ...snapshotRef.current, items: changed.items }, `已更新 ${changed.changedCount} 款游戏的通关评分`);
    } catch (error) { setToast(error instanceof Error ? error.message : '评分未能保存'); return false; }
  }
  function changeGameFilter(next: 'unplayed' | 'experienced' | 'all') { setGameFilter(next); setSort(next === 'unplayed' ? 'rank' : 'recent'); }
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
  function navigate(next: Section) { guardDetail(() => { detailGuard.current = null; setSelectedId(null); setSection(next); setSelectedTags([]); setSelectedGameTags(emptyGameTags()); setFavoriteOnly(false); setStatus('all'); setGameFilter(next === 'game' ? 'unplayed' : 'all'); setLibraryView('library'); setContextMenu(null); setSubtypeFilter('all'); setSort(next === 'game' ? 'rank' : 'recent'); setQuery(''); setFiltersOpen(false); setMenuOpen(false); }); }
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
    if (commit(next, action === 'hide' ? '已隐藏，可在「数据与设置 → 数据与备份」找回' : action === 'unhide' ? '已取消隐藏' : action === 'trash' ? '已移到回收站' : action === 'restore' ? '已恢复作品' : '已永久删除')) {
      detailGuard.current = null; setSelectedId(null); setSelecting(false); setSelectionIds(new Set()); setAssignment(null); setContextMenu(null);
    }
  }
  function changeLibraryView(next: LibraryView, plan = false) {
    guardDetail(() => { setLibraryView(next); setGameFilter(plan ? 'unplayed' : 'all'); setSort(plan ? 'rank' : 'recent'); setQuery(''); setStatus('all'); setSubtypeFilter('all'); setSelectedTags([]); setSelectedGameTags(emptyGameTags()); setFavoriteOnly(false); setSelecting(false); setSelectionIds(new Set()); setAssignment(null); setSelectedId(null); setContextMenu(null); });
  }
  function assignTag(group: GameTagGroupKey, name: string) {
    setTagManager(false); changeLibraryView('library'); startSelection(); setAssignment({ group, name }); setToast('');
  }
  // 标签跨组移动：确认前展示来源/目标/影响数/合并情况；取消、零关联、同组不写库；
  // 一次构造完整结果一次提交；成功后正在使用该标签的筛选转到目标组，其他筛选保留。
  function moveTagAction(name: string, from: GameTagGroupKey, to: GameTagGroupKey) {
    const label = name.trim(), lower = label.toLocaleLowerCase();
    if (!label || from === to) return false;
    const active = snapshotRef.current.items.filter(item => !item.hiddenAt && !item.removedAt);
    const affected = active.filter(item => item.category === 'game' && gameTagsFor(item)[from].some(tag => tag.toLocaleLowerCase() === lower));
    if (!affected.length) { setToast('该标签当前没有关联作品，无需移动。'); return false; }
    const merges = affected.some(item => gameTagsFor(item)[to].some(tag => tag.toLocaleLowerCase() === lower));
    if (!window.confirm(`将「${label}」从「${GAME_TAG_LABELS[from]}」移动到「${GAME_TAG_LABELS[to]}」？\n${affected.length} 件作品的该标签将移入新分组${merges ? '；部分作品的目标组已有同名标签，将按既有规则合并' : ''}。其他分组的同名标签保持不变。`)) return false;
    const saved = updateItems(items => {
      const scope = items.filter(item => !item.hiddenAt && !item.removedAt);
      const edited = new Map(moveGameTag(scope, label, from, to).map(item => [item.id, item]));
      return items.map(item => edited.get(item.id) ?? item);
    }, `已将「${label}」移动到${GAME_TAG_LABELS[to]}`);
    if (!saved) return false;
    setSelectedGameTags(current => current[from].some(tag => tag.toLocaleLowerCase() === lower)
      ? { ...current, [from]: current[from].filter(tag => tag.toLocaleLowerCase() !== lower), [to]: normalizeTags([...current[to], label]) }
      : current);
    return true;
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
  // v0.4.24 右键/详情双维度保存：只写新字段（domain 补丁），旧轴冻结。
  function patchClassification(id: string, value: GameExperienceClassification) { return patchItem(id, experienceClassificationPatch(value)); }
  function patchItem(id: string, patch: Partial<MediaItem>) { return updateItems(current => current.map(item => item.id === id && !item.removedAt ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)); }
  async function exportBackup() {
    if (loadError) { setToast('收藏库尚未恢复，无法导出有效备份。请先导入备份恢复。'); return; }
    if (selected && detailGuard.current && !detailGuard.current()) return;
    if (desktopGameAssetsAvailable) {
      try { if (await exportFullBackup(snapshotRef.current)) setToast('完整备份已保存，包含收藏与截图原图'); }
      catch (error) { setToast(`导出失败：${error instanceof Error ? error.message : '请重试'}`); }
      return;
    }
    if (snapshotRef.current.items.some(item => item.screenshots?.length)) { setToast('截图原图需要在桌面版中导出完整备份；未导出不完整 JSON'); return; }
    const payload = JSON.stringify({ ...snapshotRef.current, exportedAt: new Date().toISOString() }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const today = new Date();
    const dateLabel = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `栖域-收藏备份-${dateLabel}.json`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000); setToast('已发起备份导出，请确认文件已保存');
  }
  async function importDesktopBackup() {
    if (selected && detailGuard.current && !detailGuard.current()) return;
    let token: string | undefined;
    try {
      const prepared = await chooseFullBackup(); if (!prepared) return;
      token = prepared.token;
      if (!window.confirm(`备份包含 ${prepared.snapshot.items.length} 件作品。将替换当前收藏，并保留操作前备份，确定继续吗？`)) return;
      if (token) await installBackupAssets(token);
      if (commit(prepared.snapshot, '完整备份已恢复', true)) resetAfterBackup();
    } catch (error) { setToast(`恢复失败：${error instanceof Error ? error.message : '请重试'}`); }
    finally { if (token) discardBackup(token); }
  }
  function resetAfterBackup() {
    detailGuard.current = null; setSelectedId(null); setLibraryView('library'); setSelecting(false); setSelectionIds(new Set()); setBatchEditOpen(false); setSelectedTags([]); setSelectedGameTags(emptyGameTags()); setFavoriteOnly(false); setSubtypeFilter('all'); setGameFilter('all'); setStatus('all'); setQuery(''); setSort('recent'); setSection('game'); setSettings(false);
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
      if (commit({ ...content, items: content.items }, '备份导入成功', true)) resetAfterBackup();
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

  
  return { updateSnapshot, bookAction, importDesktopBackup, applyBulkScore, reorderGame, changeGameFilter, appearance, ambient, initial, snapshot, loadError, section, setSection, selecting, setSelecting, selectionIds, setSelectionIds, batchEditOpen, setBatchEditOpen, status, setStatus, gameFilter, setGameFilter, experienceCategoryFilter, setExperienceCategoryFilter, patchClassification, libraryView, batchAction, setBatchAction, assignment, setAssignment, contextMenu, setContextMenu, quickItem, setQuickItem, subtypeFilter, setSubtypeFilter, query, setQuery, selectedTags, setSelectedTags, selectedGameTags, setSelectedGameTags, favoriteOnly, setFavoriteOnly, filtersOpen, setFiltersOpen, tagsOpen, setTagsOpen, sort, setSort, sortDirection, toggleSortDirection, view, setView, setSelectedId, editor, setEditor, metadataOpen, setMetadataOpen, batchOpen, setBatchOpen, steamOpen, setSteamOpen, metadataCandidate, setMetadataCandidate, importedDraft, setImportedDraft, tagManager, setTagManager, settings, setSettings, menuOpen, setMenuOpen, toast, setToast, fileInput, detailGuard, handleCardOpen, items, activeItems, contextItem, quickRecord, selected, scope, selectedGames, subtypes, visible, hasDemos, totalGameMinutes, appliedFilterCount, showCollectionPrompt, updateItems, startSelection, applyBatchEdit, applyBulkClassification, applyBulkGrade, patchSelected, guardDetail, closeDetail, openEditor, navigate, saveWork, importBatch, syncSteam, lifecycleAction, changeLibraryView, assignTag, manageTag, moveTagAction, openMenu, patchItem, exportBackup, importBackup, clearDemo, changeTagFilters };
}
