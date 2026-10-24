import {
Archive,ArrowRight,
BookOpen,
Check,CheckCircle2,ChevronDown,
Clapperboard,
Download,Filter,
Gamepad2,Grid2X2,Heart,
Info,
Link2,
List,ListPlus,Menu,
Music2,
Plus,
Search,Settings,Palette,Tag,X
} from 'lucide-react';
import { Fragment, useRef } from 'react';
import { applyMetadataCandidate,findDuplicateCandidates } from '../domain/catalog.ts';
import { emptyGameTags,formatPlaytime,GAME_TAG_KEYS,GAME_TAG_LABELS,gamePlayStateFor,legacyStatusForGameState,MEDIA_LABELS } from '../domain/library.ts';
import type { MediaType } from '../domain/types.ts';
import { desktopBridge,desktopInfo } from '../infrastructure/repository.ts';
import { AmbientScene } from './AmbientScene.tsx';
import { useGlassKit,useGlassPreference } from './glassKit.ts';
import { GlassLayers } from './features/glass/GlassLayers.tsx';
import { SettingsDialog } from './features/settings/SettingsDialog.tsx';
import { SelectionBar } from './features/library/SelectionBar.tsx';
import { ambientHue,backgroundPalettes } from './features/ambient/ambientPalette.ts';
import { BatchEditBody,type BatchAction } from './BatchEdit.tsx';
import { MetadataImport } from './MetadataImport.tsx';
import { MetadataReview } from './MetadataReview.tsx';
import { QuickEditor } from './RecordEditors.tsx';
import { SteamConnect } from './SteamConnect.tsx';
import { SteamLibraryImport } from './SteamLibraryImport.tsx';
import { TagFilterPanel } from './TagFilterPanel.tsx';
import { GameStateIcon,Modal } from './components/MediaPrimitives.tsx';
import { gameStates,statuses } from './components/libraryOptions.ts';
import './features.css';
import { RankedGallery } from './features/library/RankedGallery.tsx';
import { SortControls } from './features/library/SortControls.tsx';
import { DetailPanel } from './features/detail/DetailPanel.tsx';
import { Editor } from './features/editor/WorkEditor.tsx';
import { ContextMenu } from './features/library/ContextMenu.tsx';
import { MediaCard } from './features/library/MediaCard.tsx';
import { BackToTop } from './features/navigation/BackToTop.tsx';
import { WindowChrome } from './features/window-chrome/WindowChrome.tsx';
import { TagManager } from './features/tags/TagManager.tsx';

type Section = MediaType;
const nav: { id: Section; label: string; icon: typeof Gamepad2 }[] = [
  { id: 'game', label: '游戏', icon: Gamepad2 },
  { id: 'book', label: '书籍', icon: BookOpen },
  { id: 'screen', label: '影视', icon: Clapperboard },
  { id: 'music', label: '音乐', icon: Music2 },
];

import { useWorkspaceController } from './app/useWorkspaceController.ts';

function App() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const glass = useGlassPreference();
  useGlassKit(glass);
  const searchRef = useRef<HTMLInputElement>(null);
  const { reorderGame, changeGameFilter, appearance, ambient, snapshot, loadError, section, setSection, selecting, setSelecting, selectionIds, setSelectionIds, batchEditOpen, setBatchEditOpen, status, setStatus, gameFilter, setGameFilter, libraryView, batchAction, setBatchAction, assignment, setAssignment, contextMenu, setContextMenu, quickItem, setQuickItem, subtypeFilter, setSubtypeFilter, query, setQuery, selectedTags, setSelectedTags, selectedGameTags, setSelectedGameTags, favoriteOnly, setFavoriteOnly, filtersOpen, setFiltersOpen, tagsOpen, setTagsOpen, sort, setSort, sortDirection, toggleSortDirection, view, setView, setSelectedId, editor, setEditor, metadataOpen, setMetadataOpen, batchOpen, setBatchOpen, steamOpen, setSteamOpen, metadataCandidate, setMetadataCandidate, importedDraft, setImportedDraft, tagManager, setTagManager, settings, setSettings, menuOpen, setMenuOpen, toast, setToast, fileInput, detailGuard, handleCardOpen, items, activeItems, contextItem, quickRecord, selected, scope, selectedGames, subtypes, visible, hasDemos, totalGameMinutes, appliedFilterCount, showCollectionPrompt, startSelection, applyBatchEdit, patchSelected, guardDetail, closeDetail, openEditor, navigate, saveWork, importBatch, syncSteam, lifecycleAction, changeLibraryView, assignTag, manageTag, moveTagAction, openMenu, patchItem, exportBackup, importBackup, clearDemo } = useWorkspaceController();
  const backgroundHue = ambient.paletteHue ?? ambientHue(ambient.hue);
  const backgroundIndex = backgroundPalettes.findIndex(p => Math.abs(p.hue - backgroundHue) < 1);
  function cycleBackgroundPalette() {
    const next = backgroundPalettes[(backgroundIndex + 1) % backgroundPalettes.length];
    ambient.chooseLook({ hue: next.legacy, paletteHue: next.hue });
  }
  const rankMode = section === 'game' && libraryView === 'library' ? gameFilter === 'cleared' ? 'rating' as const : ['plan','want'].includes(gameFilter) ? 'priority' as const : undefined : undefined;
  return <div className="app-shell" data-section={section}>
    <WindowChrome />
    <AmbientScene animated={ambient.enabled} theme={appearance.effective} hue={ambient.hue} strength={ambient.strength} depth={ambient.depth} speed={ambient.speed} swirl={ambient.swirl} settings={ambient} />
    <aside id="library-navigation" className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`}>
      <div className="dock-stack"><div className="sidebar-dock" data-material-glass="pane"><GlassLayers />
        <nav className="sidebar-nav" aria-label="作品分类">{nav.map(entry => {
          const Icon = entry.icon;
          const count = activeItems.filter(item => item.category === entry.id).length;
          return <button key={entry.id} className={`nav-item ${section === entry.id ? 'nav-item--active' : ''}`} data-material-glass="button" aria-label={entry.label} aria-description={`${count} 件作品`} aria-current={section === entry.id ? 'page' : undefined} data-tooltip={`${entry.label} · ${count} 件`} onClick={() => navigate(entry.id)}><GlassLayers /><Icon size={20} strokeWidth={1.7} /><span>{entry.label}</span><small>{count}</small></button>;
        })}</nav>
        <div className="sidebar-divider" />
        <div className="sidebar-tools">
          <button onClick={() => setTagManager(true)} aria-label="标签管理" data-tooltip="标签管理" data-material-glass="button"><GlassLayers /><span><Tag size={20} strokeWidth={1.7} />标签</span></button>
          <button className="background-theme-toggle icon-button" data-material-glass="button" onClick={cycleBackgroundPalette} data-tooltip={`背景配色：${backgroundPalettes[backgroundIndex]?.label ?? '自定义'} · 点击切换`} aria-label="切换背景主题配色"><GlassLayers /><Palette size={20} strokeWidth={1.7} style={{ color: `hsl(${backgroundHue} 75% 70%)` }} /></button>
          <button onClick={() => setSettings(true)} aria-label="数据与设置" data-tooltip="数据与设置" data-material-glass="button"><GlassLayers /><span><Settings size={20} strokeWidth={1.7} />设置</span></button>
        </div>
      </div><BackToTop scrollRef={scrollRef} focusRef={searchRef} onReturn={() => setMenuOpen(false)} /></div>
      <div className="sidebar-bottom"><div className="sidebar-version">v{desktopInfo?.version ?? '0.4.23'}</div></div>
    </aside>
    {menuOpen && <button className="mobile-dim" onClick={() => setMenuOpen(false)} aria-label="关闭菜单" />}

    <main className="main-panel">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="打开菜单" aria-expanded={menuOpen} aria-controls="library-navigation"><Menu size={21} /></button><label className="search-box global-search" data-material-glass="pane"><GlassLayers /><Search size={18} /><input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索作品、开发商、印象或标签" aria-label="搜索收藏" />{query && <button className="search-clear" onClick={() => setQuery('')} title="清除搜索" aria-label="清除搜索"><X size={14} /></button>}</label></div>
        <div className="topbar-actions">
          <span className="storage-marker"><span className="live-dot" />{loadError ? '等待恢复' : '本地保存'}</span>
          <button className="top-icon" onClick={exportBackup} disabled={!!loadError} title="导出备份" aria-label="导出备份"><Download size={18} /></button>
          <button className="button button--secondary metadata-add" onClick={() => guardDetail(() => setMetadataOpen(true))} disabled={!!loadError}><Search size={16} />检索与导入</button>
          <button className="button button--secondary bulk-add" aria-label="批量导入作品" title="批量导入作品" onClick={() => guardDetail(() => setBatchOpen(true))} disabled={!!loadError}><ListPlus size={17} />批量收录</button>
          <button className="button button--primary add-top" onClick={openEditor} disabled={!!loadError}><Plus size={18} />收录作品</button>
        </div>
      </header>

      <div className="main-scroll" id="library-content-scroll" ref={scrollRef}><div className="content-wrap">
        {loadError && <div className="error-banner"><Info size={18} /><span>{loadError} 已暂停收藏库写入，请通过「数据与设置 → 导入备份」恢复。</span></div>}
        {hasDemos && <div className="demo-banner"><Info size={16} /><span><strong>演示作品</strong>，并非你的真实收藏。</span><button onClick={clearDemo}>清除演示数据 <ArrowRight size={14} /></button></div>}

        <section className="page-heading"><div className="heading-details"><h1>{MEDIA_LABELS[section]}</h1><p>{section === 'game' ? `已收藏 ${scope.length} 款游戏 · 累计记录 ${formatPlaytime(totalGameMinutes)}` : `已收藏 ${scope.length} 件作品`}</p></div></section>

        <div className="library-views" aria-label="收藏范围">{section === 'game' && <button className={libraryView === 'library' && gameFilter === 'plan' ? 'is-active' : ''} onClick={() => changeLibraryView('library', true)}>待体验计划</button>}<button className={libraryView === 'library' && gameFilter !== 'plan' ? 'is-active' : ''} onClick={() => changeLibraryView('library')}>{section === 'game' ? '全部游戏' : '全部作品'}</button><button className={libraryView === 'hidden' ? 'is-active library-management-start' : 'library-management-start'} onClick={() => changeLibraryView('hidden')}>已隐藏</button><button className={libraryView === 'trash' ? 'is-active' : ''} onClick={() => changeLibraryView('trash')}>回收站</button></div>
        {gameFilter === 'plan' && section === 'game' && <p className="planning-note">先挑想开始的作品，暂时搁置排在最后。{assignment && '正在分配标签：' + assignment.name}</p>}
        <div className="collection-workspace">
        <section className="collection-section">
          <div className="collection-toolbar">
            <div className="collection-title"><span className="collection-number">显示 {visible.length} 件作品</span>{desktopBridge && section === 'game' && <button className="text-button steam-open-link" onClick={() => guardDetail(() => setSteamOpen(true))} disabled={!!loadError}><Link2 size={14} />连接 Steam</button>}</div>
            <div className="filter-secondary">
              {!selecting && <button className="advanced-toggle batch-edit-open" aria-label="批量编辑游戏" onClick={startSelection} disabled={!!loadError || !scope.length}><CheckCircle2 size={16} />多选整理</button>}
              <button className={`advanced-toggle ${filtersOpen ? 'is-expanded' : ''}`} onClick={() => setFiltersOpen(open => !open)} aria-expanded={filtersOpen} aria-controls="library-advanced-filters"><Filter size={16} />筛选{appliedFilterCount > 0 && <span className="filter-counter">{appliedFilterCount}</span>}<ChevronDown className="toggle-chevron" size={15} /></button>
              <SortControls value={sort} direction={sortDirection} game={section === 'game'} rating={gameFilter === 'cleared'} onChange={setSort} onToggleDirection={toggleSortDirection} />
              <div className="view-switch" aria-label="切换显示方式"><button onClick={() => setView('grid')} className={view === 'grid' ? 'is-active' : ''} title="卡片视图" aria-label="卡片视图" aria-pressed={view === 'grid'}><Grid2X2 size={17} /></button><button onClick={() => setView('list')} className={view === 'list' ? 'is-active' : ''} title="列表视图" aria-label="列表视图" aria-pressed={view === 'list'}><List size={18} /></button></div>
            </div>
          </div>
          <div className="controls-panel">
            <div className="filter-primary">
              <span className="filter-group-title">{section === 'game' ? '游玩状态' : '体验状态'}</span>
              {libraryView === 'library' && <div className={`status-tabs ${section === 'game' ? 'game-status-tabs' : ''}`} aria-label={section === 'game' ? '按游玩状态筛选' : '按状态筛选'}>{section === 'game' ? gameStates.map(s => <button key={s.id} className={`${gameFilter === s.id ? 'is-selected' : ''} mark-tab--${s.id}`} aria-pressed={gameFilter === s.id} onClick={() => changeGameFilter(s.id)}>{s.id !== 'all' && <GameStateIcon state={s.id} size={15} />}{s.label}</button>) : statuses.map(s => <button key={s.id} className={status === s.id ? 'is-selected' : ''} aria-pressed={status === s.id} onClick={() => setStatus(s.id)}>{s.label}</button>)}</div>}
            </div>
            <div id="library-advanced-filters" className="filter-expanded" data-glass="filters" hidden={!filtersOpen}>
              <div className="subtype-row"><span>喜欢</span><div><button aria-pressed={favoriteOnly} className={favoriteOnly ? 'is-active' : ''} onClick={() => setFavoriteOnly(current => !current)}><Heart size={13} />只看喜欢</button></div></div>
              {subtypes.length > 0 && <div className="subtype-row"><span>{section === 'game' ? '平台' : section === 'book' ? '阅读分类' : section === 'screen' ? '影视类型' : '音乐类型'}</span><div><button className={subtypeFilter === 'all' ? 'is-active' : ''} aria-pressed={subtypeFilter === 'all'} onClick={() => setSubtypeFilter('all')}>全部</button>{subtypes.map(subtype => <button key={subtype} className={subtypeFilter === subtype ? 'is-active' : ''} aria-pressed={subtypeFilter === subtype} onClick={() => setSubtypeFilter(subtype)}>{subtype}</button>)}</div></div>}
            </div>
          </div>
          {scope.length > 0 && <TagFilterPanel items={scope} game={section === 'game'} open={tagsOpen} onToggle={() => setTagsOpen(current => !current)} selectedTags={selectedTags} selectedGameTags={selectedGameTags} onTag={tag => setSelectedTags(current => current.includes(tag) ? current.filter(value => value !== tag) : [...current, tag])} onGameTag={(key, tag) => setSelectedGameTags(current => ({ ...current, [key]: current[key].includes(tag) ? current[key].filter(value => value !== tag) : [...current[key], tag] }))} onClear={() => { setSelectedTags([]); setSelectedGameTags(emptyGameTags()); }} />}
          {appliedFilterCount > 0 && <div className="active-filter-summary" aria-label="当前启用的高级筛选"><span>已筛选</span>{subtypeFilter !== 'all' && <button onClick={() => setSubtypeFilter('all')}>{subtypeFilter}<X size={13} /></button>}{selectedTags.map(tag => <button key={tag} onClick={() => setSelectedTags(current => current.filter(t => t !== tag))}>{tag}<X size={13} /></button>)}{GAME_TAG_KEYS.flatMap(key => selectedGameTags[key].map(tag => <button key={`${key}:${tag}`} onClick={() => setSelectedGameTags(current => ({ ...current, [key]: current[key].filter(value => value !== tag) }))}>{GAME_TAG_LABELS[key]}：{tag}<X size={13} /></button>))}{favoriteOnly && <button onClick={() => setFavoriteOnly(false)}>只看喜欢<X size={13} /></button>}<button className="clear-all-filters" onClick={() => { setSubtypeFilter('all'); setSelectedTags([]); setSelectedGameTags(emptyGameTags()); setFavoriteOnly(false); }}>全部清除</button></div>}

          {visible.length ? rankMode ? <RankedGallery items={visible} mode={rankMode} view={view} manualOrder={sort === 'rank'} rankDirection={sort === 'rank' ? sortDirection : 'desc'} reorderEnabled={sort === 'rank' && !selecting && !loadError} onMove={(sourceId,targetId) => reorderGame(sourceId,targetId,rankMode)} renderItem={item => <MediaCard item={item} onOpen={handleCardOpen} onMenu={openMenu} variant={view} selecting={selecting} chosen={selecting && selectionIds.has(item.id)} />} /> : <div className={`media-gallery media-gallery--${view}`}>{visible.map((item, index) => <Fragment key={item.id}>{gameFilter === 'plan' && gamePlayStateFor(item) === 'paused' && (index === 0 || gamePlayStateFor(visible[index - 1]) !== 'paused') && <div className="plan-divider">以后再说 · 暂时搁置</div>}<MediaCard item={item} onOpen={handleCardOpen} onMenu={openMenu} variant={view} selecting={selecting} chosen={selecting && selectionIds.has(item.id)} /></Fragment>)}{showCollectionPrompt && libraryView === 'library' && !selecting && <button className="add-collection-tile" aria-label="添加下一件作品" onClick={openEditor} disabled={!!loadError}><Plus size={28} /><strong>添加下一件</strong><small>手动收录或补充作品资料</small></button>}</div> : <div className="empty-state"><div className="empty-icon"><Archive size={26} /></div><h3>{loadError ? '收藏库需要恢复' : scope.length ? '没有找到匹配的作品' : '这个空间还是空的'}</h3><p>{loadError ? '请导入有效备份后继续使用。' : scope.length ? '试着调整筛选条件，或清除搜索关键词。' : '喜欢的游戏、书籍和电影，都可以从这里开始收录。'}</p><button className="button button--secondary" onClick={() => { if (loadError) setSettings(true); else if (scope.length) { setQuery(''); setStatus('all'); setGameFilter('all'); setSubtypeFilter('all'); setSelectedTags([]); setSelectedGameTags(emptyGameTags()); setFavoriteOnly(false); } else openEditor(); }}>{loadError ? '打开数据与设置' : scope.length ? '清除筛选' : '收录第一件作品'}<ArrowRight size={16} /></button></div>}
        </section>
        </div>
      </div></div>
    </main>

    {selecting && <SelectionBar count={selectionIds.size} assignment={assignment?.name} canSelectAll={!!visible.length} onSelectAll={() => setSelectionIds(current => new Set([...current, ...visible.map(item => item.id)]))} onClear={() => setSelectionIds(new Set())} onExit={() => { setSelecting(false); setSelectionIds(new Set()); setAssignment(null); }}>{section === 'game' && libraryView !== 'trash' && <>{(['state','add-tags','remove-tags'] as BatchAction[]).map(action => <button className="button button--secondary" disabled={!selectedGames.length} key={action} onClick={() => { setBatchAction(action); setBatchEditOpen(true); }}>{action === 'state' ? '改状态' : action === 'add-tags' ? '添加标签' : '移除标签'}</button>)}</>}{libraryView === 'trash' ? <><button className="button button--secondary" disabled={!selectionIds.size} onClick={() => lifecycleAction('restore', [...selectionIds])}>恢复</button><button className="button button--secondary danger-action" disabled={!selectionIds.size} onClick={() => lifecycleAction('delete', [...selectionIds])}>永久删除</button></> : <><button className="button button--secondary" disabled={!selectionIds.size} onClick={() => lifecycleAction(libraryView === 'hidden' ? 'unhide' : 'hide', [...selectionIds])}>{libraryView === 'hidden' ? '取消隐藏' : '隐藏'}</button><button className="button button--secondary danger-action" disabled={!selectionIds.size} onClick={() => lifecycleAction('trash', [...selectionIds])}>移到回收站</button></>}</SelectionBar>}
    {contextMenu && contextItem && <ContextMenu menu={contextMenu} item={contextItem} onClose={() => setContextMenu(null)} onState={value => patchItem(contextItem.id, { gamePlayState: value, status: legacyStatusForGameState(value) })} onGrade={(mode, value) => patchItem(contextItem.id, mode === 'priority' ? { playPriority: value, ...(value !== contextItem.playPriority ? { priorityOrder: undefined } : {}) } : { personalGrade: value, ...(value !== contextItem.personalGrade ? { ratingOrder: undefined } : {}) })} onQuick={mode => setQuickItem({ id: contextItem.id, mode })} onEdit={() => { setSelectedId(contextItem.id); setEditor('edit'); }} onFavorite={() => patchItem(contextItem.id, { favorite: !contextItem.favorite })} onHide={() => lifecycleAction(contextItem.hiddenAt ? 'unhide' : 'hide', [contextItem.id])} onTrash={() => lifecycleAction('trash', [contextItem.id])} onRestore={() => lifecycleAction('restore', [contextItem.id])} onDelete={() => lifecycleAction('delete', [contextItem.id])} />}
    {quickItem && quickRecord && <QuickEditor item={quickRecord} mode={quickItem.mode} onClose={() => setQuickItem(null)} onSave={patch => patchItem(quickRecord.id, patch)} />}
    {selected && <DetailPanel key={selected.id} item={selected} guardRef={detailGuard} onClose={closeDetail} onEdit={() => guardDetail(() => setEditor('edit'))} onPatch={patchSelected} onDelete={() => guardDetail(() => lifecycleAction('trash', [selected.id]))} onRestore={() => lifecycleAction('restore', [selected.id])} onDeletePermanently={() => lifecycleAction('delete', [selected.id])} onHide={() => guardDetail(() => lifecycleAction(selected.hiddenAt ? 'unhide' : 'hide', [selected.id]))} onFilterTag={(tag, group) => guardDetail(() => { setSection(selected.category); setStatus('all'); setGameFilter('all'); setSubtypeFilter('all'); setQuery(''); setFavoriteOnly(false); setSelectedTags(group ? [] : [tag]); setSelectedGameTags(group ? { ...emptyGameTags(), [group]: [tag] } : emptyGameTags()); detailGuard.current = null; setSelectedId(null); })} />}
    {editor && <Editor key={`${editor}-${editor === 'import' ? importedDraft?.id : selected?.id ?? 'new'}`} initial={editor === 'edit' ? selected ?? undefined : editor === 'import' ? importedDraft ?? undefined : undefined} creating={editor === 'import' && !items.some(item => item.id === importedDraft?.id)} category={section} onSave={saveWork} onClose={() => { setEditor(null); setImportedDraft(null); }} />}
    {metadataOpen && <MetadataImport onClose={() => setMetadataOpen(false)} onSelect={candidate => { setMetadataOpen(false); setMetadataCandidate(candidate); }} />}
    {batchEditOpen && <Modal title={batchAction === 'state' ? '更改状态' : batchAction === 'add-tags' ? '添加标签' : '移除标签'} description="只对明确选中的游戏应用这一项操作。" wide onClose={() => setBatchEditOpen(false)}><BatchEditBody action={batchAction} initialTag={batchAction === 'add-tags' ? assignment : null} items={selectedGames} availableItems={items} onApply={applyBatchEdit} onClose={() => setBatchEditOpen(false)} /></Modal>}
    {batchOpen && <SteamLibraryImport exclusions={snapshot.importExclusions} items={items} onClose={() => setBatchOpen(false)} onImport={importBatch} />}
    {steamOpen && <SteamConnect exclusions={snapshot.importExclusions} items={items} onClose={() => setSteamOpen(false)} onSync={syncSteam} />}
    {metadataCandidate && <MetadataReview candidate={metadataCandidate} matches={findDuplicateCandidates(items, metadataCandidate)} items={items} onClose={() => setMetadataCandidate(null)} onConfirm={existing => { try { if (existing?.removedAt) { setToast('这件作品在回收站中，请先恢复后再更新资料。'); return; } setImportedDraft(applyMetadataCandidate(existing, metadataCandidate)); setMetadataCandidate(null); setEditor('import'); } catch (error) { setToast(error instanceof Error ? error.message : '资料无法应用'); } }} />}
    {tagManager && <TagManager onMove={moveTagAction} onAssign={assignTag} items={activeItems} section={section} onClose={() => setTagManager(false)} onRename={(oldName, newName, tagScope) => { return manageTag(oldName, newName, tagScope); }} onDelete={(name, tagScope) => { return manageTag(name, undefined, tagScope); }} />}
    {settings && <SettingsDialog ambient={ambient} glass={glass} hasDemos={hasDemos} onClose={() => setSettings(false)} onSteam={() => { setSettings(false); setSteamOpen(true); }} onExport={exportBackup} onImport={() => fileInput.current?.click()} onClearDemo={clearDemo} onNotice={setToast} />}
    <input className="sr-only" ref={fileInput} type="file" accept="application/json,.json" onChange={importBackup} />
    {toast && <div className="toast" role="status"><Check size={17} />{toast}<button onClick={() => setToast('')} aria-label="关闭提示"><X size={15} /></button></div>}
    <div className="mobile-add"><button onClick={openEditor} disabled={!!loadError} aria-label="收录作品"><Plus size={25} /></button></div>
  </div>;
}

export default App;
