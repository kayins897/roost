import type { ScreenKind } from '../domain/screenConsumption.ts';
import { ScreensWorkspace } from './features/screen/ScreensWorkspace.tsx';
import { ScreenDetail } from './features/screen/ScreenDetail.tsx';
import { ScreenTagsDialog } from './features/screen/ScreenTagDialog.tsx';
import type { DetailPanelProps } from './features/detail/DetailPanel.tsx';
import { BooksWorkspace } from './features/books/BooksWorkspace.tsx';
import { BookDetail } from './features/books/BookDetail.tsx';
import { BookTagsDialog } from './features/books/BookTagDialog.tsx';
import { desktopGameAssetsAvailable } from '../infrastructure/gameAssets.ts';
import {
Archive,ArrowRight,
BookOpen,
Check,CheckCircle2,ChevronDown,
Clapperboard,
Filter,
Gamepad2,Grid2X2,Heart,
Info,
Link2,
List,Menu,
Music2,
Plus,
Search,Settings,Palette,FolderPlus,Trash2,X
} from 'lucide-react';
import { Fragment, useRef, useState } from 'react';
import { version as appVersion } from '../../package.json';
import { applyMetadataCandidate,findDuplicateCandidates } from '../domain/catalog.ts';
import { emptyGameTags,formatPlaytime,GAME_TAG_KEYS,GAME_TAG_LABELS,MEDIA_LABELS } from '../domain/library.ts';
import { CLASSIFICATIONS, CLASSIFICATION_LABELS, classificationRankMode } from './features/library/experienceOptions.ts';
import { EXPERIENCE_CATEGORIES, EXPERIENCE_CATEGORY_LABELS, type GameExperienceClassification } from '../domain/gameExperience.ts';
import type { MediaType } from '../domain/types.ts';
import { desktopBridge,desktopInfo } from '../infrastructure/repository.ts';
import { AmbientScene } from './AmbientScene.tsx';
import { useGlassKit,useGlassPreference } from './glassKit.ts';
import { GlassLayers } from './features/glass/GlassLayers.tsx';
import { SettingsDialog } from './features/settings/SettingsDialog.tsx';
import { CollectionHub } from './features/library/CollectionHub.tsx';
import { useListWritingGuard } from './features/library/useListWritingGuard.ts';
import { SelectionBar } from './features/library/SelectionBar.tsx';
import { ambientHue,backgroundPalettes } from './features/ambient/ambientPalette.ts';
import { BatchEditBody,type BatchAction } from './BatchEdit.tsx';
import { MetadataImport } from './MetadataImport.tsx';
import { MetadataReview } from './MetadataReview.tsx';
import { QuickEditor } from './RecordEditors.tsx';
import { SteamConnect } from './SteamConnect.tsx';
import { SteamLibraryImport } from './SteamLibraryImport.tsx';
import { TagFilterPanel } from './TagFilterPanel.tsx';
import {Modal } from './components/MediaPrimitives.tsx';
import { statuses } from './components/libraryOptions.ts';
import './features.css';
import { RankedGallery } from './features/library/RankedGallery.tsx';
import { SortControls } from './features/library/SortControls.tsx';
import { DetailPanel } from './features/detail/DetailPanel.tsx';
import { Editor } from './features/editor/WorkEditor.tsx';
import { ContextMenu } from './features/library/ContextMenu.tsx';
import { MediaCard } from './features/library/MediaCard.tsx';
import { BulkGradeBar } from './features/library/BulkGradeBar.tsx';
import { BackToTop } from './features/navigation/BackToTop.tsx';
import { WindowChrome } from './features/window-chrome/WindowChrome.tsx';
import { TagManager } from './features/tags/TagManager.tsx';
import { TagAssignmentBar } from './features/tags/TagAssignmentBar.tsx';

type Section = MediaType;
const nav: { id: Section; label: string; icon: typeof Gamepad2 }[] = [
  { id: 'game', label: '游戏', icon: Gamepad2 },
  { id: 'book', label: '书籍', icon: BookOpen },
  { id: 'screen', label: '影视', icon: Clapperboard },
  { id: 'music', label: '音乐', icon: Music2 },
];

import { useWorkspaceController } from './app/useWorkspaceController.ts';

function App() {
  const [collectionHub, setCollectionHub] = useState(false);
  const [screenCreateKind, setScreenCreateKind] = useState<ScreenKind>('movie');
  const listWriting = useListWritingGuard();
  const scrollRef = useRef<HTMLDivElement>(null);
  const glass = useGlassPreference();
  useGlassKit(glass);
  const searchRef = useRef<HTMLInputElement>(null);
  const { updateSnapshot, bookAction, screenAction, importDesktopBackup, applyBulkScore, reorderGame, changeGameFilter, appearance, ambient, snapshot, loadError, section, setSection, selecting, setSelecting, selectionIds, setSelectionIds, batchEditOpen, setBatchEditOpen, status, setStatus, gameFilter, setGameFilter, experienceCategoryFilter, setExperienceCategoryFilter, patchClassification, libraryView, batchAction, setBatchAction, assignment, setAssignment, contextMenu, setContextMenu, quickItem, setQuickItem, subtypeFilter, setSubtypeFilter, query, setQuery, selectedTags, setSelectedTags, selectedGameTags, setSelectedGameTags, favoriteOnly, setFavoriteOnly, filtersOpen, setFiltersOpen, tagsOpen, setTagsOpen, sort, setSort, sortDirection, toggleSortDirection, view, setView, setSelectedId, editor, setEditor, metadataOpen, setMetadataOpen, batchOpen, setBatchOpen, steamOpen, setSteamOpen, metadataCandidate, setMetadataCandidate, importedDraft, setImportedDraft, tagManager, setTagManager, settings, setSettings, menuOpen, setMenuOpen, toast, setToast, fileInput, detailGuard, handleCardOpen, items, activeItems, contextItem, quickRecord, selected, scope, selectedGames, subtypes, visible, hasDemos, totalGameMinutes, appliedFilterCount, showCollectionPrompt, startSelection, applyBatchEdit, applyBulkClassification, applyBulkGrade, patchSelected, guardDetail, closeDetail, openEditor, navigate, saveWork, importBatch, syncSteam, lifecycleAction, changeLibraryView, assignTag, manageTag, moveTagAction, openMenu, patchItem, exportBackup, importBackup, clearDemo } = useWorkspaceController();
  const backgroundHue = ambient.paletteHue ?? ambientHue(ambient.hue);
  const backgroundIndex = backgroundPalettes.findIndex(p => Math.abs(p.hue - backgroundHue) < 1);
  function cycleBackgroundPalette() {
    const next = backgroundPalettes[(backgroundIndex + 1) % backgroundPalettes.length];
    ambient.chooseLook({ hue: next.legacy, paletteHue: next.hue });
  }
  const rankMode = section === 'game' && libraryView === 'library' ? classificationRankMode(gameFilter, experienceCategoryFilter) : undefined;
  const demoInfo = desktopInfo?.demo === true;
  return <div className="app-shell" data-section={section} onPointerDownCapture={listWriting.capture} onClickCapture={listWriting.capture} onChangeCapture={listWriting.capture} onKeyDownCapture={listWriting.capture} onContextMenuCapture={listWriting.capture}>
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
          <button onClick={() => guardDetail(() => setCollectionHub(true))} disabled={!!loadError} aria-label="收录作品" data-tooltip="收录作品" data-material-glass="button"><GlassLayers /><FolderPlus size={20} strokeWidth={1.7} /></button><button className={libraryView === 'trash' ? 'nav-item--active' : ''} onClick={() => changeLibraryView(libraryView === 'trash' ? 'library' : 'trash')} aria-label="回收站" aria-pressed={libraryView === 'trash'} data-tooltip={libraryView === 'trash' ? '退出回收站' : '回收站'} data-material-glass="button"><GlassLayers /><Trash2 size={20} strokeWidth={1.7} /></button>
          <button className="background-theme-toggle icon-button" data-material-glass="button" onClick={cycleBackgroundPalette} data-tooltip={`背景配色：${backgroundPalettes[backgroundIndex]?.label ?? '自定义'} · 点击切换`} aria-label="切换背景主题配色"><GlassLayers /><Palette size={20} strokeWidth={1.7} style={{ color: `hsl(${backgroundHue} 75% 70%)` }} /></button>
          <button onClick={() => setSettings(true)} aria-label="数据与设置" data-tooltip="数据与设置" data-material-glass="button"><GlassLayers /><span><Settings size={20} strokeWidth={1.7} />设置</span></button>
        </div>
      </div><BackToTop scrollRef={scrollRef} focusRef={searchRef} onReturn={() => setMenuOpen(false)} /></div>
      <div className="sidebar-bottom"><span className={`storage-marker ${loadError ? 'storage-marker--error' : ''}`} role="status"><span className="live-dot" />{loadError ? '等待恢复' : '本地保存'}</span><div className="sidebar-version">v{desktopInfo?.version ?? appVersion}</div></div>
    </aside>
    {menuOpen && <button className="mobile-dim" onClick={() => setMenuOpen(false)} aria-label="关闭菜单" />}

    <main className="main-panel">
      {demoInfo && <div className="demo-mode-banner" role="status">演示数据 · v{desktopInfo?.version} · 当前修改只保存在独立演示目录。同一“启动演示”入口会保留修改，不影响正式收藏。</div>}
      <header className="topbar">
        <div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="打开菜单" aria-expanded={menuOpen} aria-controls="library-navigation"><Menu size={21} /></button><label className="search-box global-search" data-material-glass="pane"><GlassLayers /><Search size={18} /><input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder={section === 'book' ? '搜索书名、作者、标签或感想' : section === 'screen' ? '搜索片名、导演、标签或观后感' : '搜索作品、开发商、印象或标签'} aria-label="搜索收藏" />{query && <button className="search-clear" onClick={() => setQuery('')} title="清除搜索" aria-label="清除搜索"><X size={14} /></button>}</label></div>
      </header>

      <div className="main-scroll" id="library-content-scroll" ref={scrollRef}><div className="content-wrap">
        {loadError && <div className="error-banner"><Info size={18} /><span>{loadError} 已暂停收藏库写入，请通过「数据与设置 → 导入备份」恢复。</span></div>}
        {hasDemos && <div className="demo-banner"><Info size={16} /><span><strong>演示作品</strong>，并非你的真实收藏。</span><button onClick={clearDemo}>清除演示数据 <ArrowRight size={14} /></button></div>}

        <section className="page-heading"><div className="heading-details"><h1>{MEDIA_LABELS[section]}</h1><p>{section === 'game' ? `已收藏 ${scope.length} 款游戏 · 累计记录 ${formatPlaytime(totalGameMinutes)}` : `已收藏 ${scope.length} 件作品`}</p></div></section>

        {libraryView !== 'library' && <div className="library-views" aria-label="收藏范围"><strong>{libraryView === 'trash' ? '回收站' : '已隐藏作品'}</strong><button onClick={() => changeLibraryView('library')}>返回收藏库</button></div>}
        {section === 'book' ? <BooksWorkspace snapshot={snapshot} query={query} libraryView={libraryView} disabled={!!loadError} onCommit={updateSnapshot} onOpen={handleCardOpen} onBatch={() => { setBatchOpen(true); }} onCreate={openEditor} onEdit={id => { setSelectedId(id); setEditor('edit'); }} onLifecycle={lifecycleAction} onNotice={setToast} /> : section === 'screen' ? <ScreensWorkspace snapshot={snapshot} query={query} libraryView={libraryView} disabled={!!loadError} onCommit={updateSnapshot} onOpen={handleCardOpen} onKindChange={setScreenCreateKind} onBatch={kind => { setScreenCreateKind(kind); setBatchOpen(true); }} onCreate={kind => { setScreenCreateKind(kind); openEditor(); }} onEdit={id => { setSelectedId(id); setEditor('edit'); }} onLifecycle={lifecycleAction} onNotice={setToast}/> : <div className="collection-workspace">
        <section className="collection-section">
          <div className="collection-toolbar">
            <div className="collection-title"><span className="collection-number">显示 {visible.length} 件作品</span>{desktopBridge && section === 'game' && <button className="text-button steam-open-link" onClick={() => guardDetail(() => setSteamOpen(true))} disabled={!!loadError}><Link2 size={14} />连接 Steam</button>}</div>
            <div className="filter-secondary library-glass-group" data-material-glass="pane"><GlassLayers />
              {!selecting && <button className="advanced-toggle batch-edit-open" aria-label="批量编辑游戏" onClick={startSelection} disabled={!!loadError || !scope.length}><CheckCircle2 size={16} />多选整理</button>}
              <button aria-label="筛选" className={`advanced-toggle ${filtersOpen ? 'is-expanded' : ''}`} onClick={() => setFiltersOpen(open => !open)} aria-expanded={filtersOpen} aria-controls="library-advanced-filters"><Filter size={16} />筛选{appliedFilterCount > 0 && <span className="filter-counter">{appliedFilterCount}</span>}<ChevronDown className="toggle-chevron" size={15} /></button>
              <SortControls value={sort} direction={sortDirection} game={section === 'game'} rating={rankMode === 'rating'} onChange={setSort} onToggleDirection={toggleSortDirection} />
              <div className="view-switch" aria-label="切换显示方式"><button onClick={() => setView('grid')} className={view === 'grid' ? 'is-active' : ''} title="卡片视图" aria-label="卡片视图" aria-pressed={view === 'grid'}><Grid2X2 size={17} /></button><button onClick={() => setView('list')} className={view === 'list' ? 'is-active' : ''} title="列表视图" aria-label="列表视图" aria-pressed={view === 'list'}><List size={18} /></button></div>
            </div>
          </div>
          <div className="controls-panel">
            <div className="filter-primary">
              <span className="filter-group-title">{section === 'game' ? '体验分类' : '体验状态'}</span>
              {section === 'game' ? <>
                <div className="status-tabs game-status-tabs library-glass-group" data-material-glass="pane" role="group" aria-label="按体验分类筛选"><GlassLayers />{(['unplayed','experienced'] as const).map(value => {
                  const pressed = gameFilter === 'all' || gameFilter === value;
                  return <button key={value} className={pressed ? 'is-selected' : ''} aria-pressed={pressed} onClick={() => changeGameFilter(gameFilter === 'all' ? value === 'unplayed' ? 'experienced' : 'unplayed' : gameFilter === value ? value : 'all')}>{value === 'unplayed' ? '新作开荒' : '已体验'}</button>;
                })}</div>
                {gameFilter === 'experienced' && <div className="status-tabs experience-category-filters library-glass-group" data-material-glass="pane" role="group" aria-label="已体验二级筛选"><GlassLayers />{(['all',...EXPERIENCE_CATEGORIES,'unclassified'] as const).map(value => <button key={value} className={`experience-color--${value} ${experienceCategoryFilter === value ? 'is-selected' : ''}`} aria-pressed={experienceCategoryFilter === value} onClick={() => { setExperienceCategoryFilter(value); setSort(['playing','continue','replayable','completed'].includes(value) ? 'rank' : 'recent'); }}>{value === 'all' ? '不限分类' : value === 'unclassified' ? '未分类' : EXPERIENCE_CATEGORY_LABELS[value]}</button>)}</div>}
              </> : <div className="status-tabs" aria-label="按状态筛选">{statuses.map(entry => <button key={entry.id} className={status === entry.id ? 'is-selected' : ''} aria-pressed={status === entry.id} onClick={() => setStatus(entry.id)}>{entry.label}</button>)}</div>}
            </div>
            <div id="library-advanced-filters" className="filter-expanded" data-glass="filters" hidden={!filtersOpen}>
              <div className="subtype-row"><span>喜欢</span><div><button aria-pressed={favoriteOnly} className={favoriteOnly ? 'is-active' : ''} onClick={() => setFavoriteOnly(current => !current)}><Heart size={13} />只看喜欢</button></div></div>
              {subtypes.length > 0 && <div className="subtype-row"><span>{section === 'game' ? '平台' : '音乐类型'}</span><div><button className={subtypeFilter === 'all' ? 'is-active' : ''} aria-pressed={subtypeFilter === 'all'} onClick={() => setSubtypeFilter('all')}>全部</button>{subtypes.map(subtype => <button key={subtype} className={subtypeFilter === subtype ? 'is-active' : ''} aria-pressed={subtypeFilter === subtype} onClick={() => setSubtypeFilter(subtype)}>{subtype}</button>)}</div></div>}
            </div>
          </div>
          {scope.length > 0 && <TagFilterPanel onCreate={section === 'game' && libraryView === 'library' ? () => guardDetail(() => setTagManager('create')) : undefined} creationDisabled={!!loadError} items={scope} game={section === 'game'} open={tagsOpen} onToggle={() => setTagsOpen(current => !current)} selectedTags={selectedTags} selectedGameTags={selectedGameTags} onTag={tag => setSelectedTags(current => current.includes(tag) ? current.filter(value => value !== tag) : [...current, tag])} onGameTag={(key, tag) => setSelectedGameTags(current => ({ ...current, [key]: current[key].includes(tag) ? current[key].filter(value => value !== tag) : [...current[key], tag] }))} onClear={() => { setSelectedTags([]); setSelectedGameTags(emptyGameTags()); }} />}
          {appliedFilterCount > 0 && <div className="active-filter-summary" aria-label="当前启用的高级筛选"><span>已筛选</span>{subtypeFilter !== 'all' && <button onClick={() => setSubtypeFilter('all')}>{subtypeFilter}<X size={13} /></button>}{selectedTags.map(tag => <button key={tag} onClick={() => setSelectedTags(current => current.filter(t => t !== tag))}>{tag}<X size={13} /></button>)}{GAME_TAG_KEYS.flatMap(key => selectedGameTags[key].map(tag => <button key={`${key}:${tag}`} onClick={() => setSelectedGameTags(current => ({ ...current, [key]: current[key].filter(value => value !== tag) }))}>{GAME_TAG_LABELS[key]}：{tag}<X size={13} /></button>))}{favoriteOnly && <button onClick={() => setFavoriteOnly(false)}>只看喜欢<X size={13} /></button>}<button className="clear-all-filters" onClick={() => { setSubtypeFilter('all'); setSelectedTags([]); setSelectedGameTags(emptyGameTags()); setFavoriteOnly(false); }}>全部清除</button></div>}

          {visible.length ? rankMode ? <RankedGallery items={visible} mode={rankMode} view={view} manualOrder={sort === 'rank'} rankDirection={sort === 'rank' ? sortDirection : 'desc'} reorderEnabled={sort === 'rank' && !selecting && !loadError} onMove={(sourceId,targetId) => reorderGame(sourceId,targetId,rankMode)} renderItem={item => <MediaCard item={item} onOpen={handleCardOpen} onMenu={openMenu} onPatch={patchItem} writingGuard={listWriting.guard} readOnly={!!loadError || libraryView === 'trash'} variant={view} selecting={selecting} chosen={selecting && selectionIds.has(item.id)} />} /> : <div className={`media-gallery media-gallery--${view}`}>{visible.map(item => <Fragment key={item.id}><MediaCard item={item} onOpen={handleCardOpen} onMenu={openMenu} onPatch={patchItem} writingGuard={listWriting.guard} readOnly={!!loadError || libraryView === 'trash'} variant={view} selecting={selecting} chosen={selecting && selectionIds.has(item.id)} /></Fragment>)}{showCollectionPrompt && libraryView === 'library' && !selecting && <button className="add-collection-tile" aria-label="添加下一件作品" onClick={openEditor} disabled={!!loadError}><Plus size={28} /><strong>添加下一件</strong><small>手动收录或补充作品资料</small></button>}</div> : <div className="empty-state"><div className="empty-icon"><Archive size={26} /></div><h3>{loadError ? '收藏库需要恢复' : scope.length ? '没有找到匹配的作品' : '这个空间还是空的'}</h3><p>{loadError ? '请导入有效备份后继续使用。' : scope.length ? '试着调整筛选条件，或清除搜索关键词。' : '喜欢的游戏、书籍和电影，都可以从这里开始收录。'}</p><button className="button button--secondary" onClick={() => { if (loadError) setSettings(true); else if (scope.length) { setQuery(''); setStatus('all'); setGameFilter('all'); setSubtypeFilter('all'); setSelectedTags([]); setSelectedGameTags(emptyGameTags()); setFavoriteOnly(false); } else openEditor(); }}>{loadError ? '打开数据与设置' : scope.length ? '清除筛选' : '收录第一件作品'}<ArrowRight size={16} /></button></div>}
        </section>
        </div>}
      </div></div>
    </main>

    {selecting && (assignment ? <TagAssignmentBar key={`${assignment.group}:${assignment.name}`} assignment={assignment} items={selectedGames} visibleIds={new Set(visible.map(item => item.id))} canSelectAll={!!visible.length} onSelectAll={() => setSelectionIds(current => new Set([...current, ...visible.map(item => item.id)]))} onClear={() => setSelectionIds(new Set())} onCancel={() => { setSelecting(false); setSelectionIds(new Set()); setAssignment(null); }} onApply={applyBatchEdit} /> : <SelectionBar count={selectionIds.size} canSelectAll={!!visible.length} onSelectAll={() => setSelectionIds(current => new Set([...current, ...visible.map(item => item.id)]))} onClear={() => setSelectionIds(new Set())} onExit={() => { setSelecting(false); setSelectionIds(new Set()); setAssignment(null); }}>{section === 'game' && libraryView !== 'trash' && <><label className="bulk-grade-field">体验分类<select aria-label="批量体验分类" value="" disabled={!selectedGames.length} onChange={event => { if (event.target.value) applyBulkClassification(event.target.value as GameExperienceClassification); }}><option value="" disabled>直接设置…</option>{CLASSIFICATIONS.map(value => <option key={value} value={value}>{CLASSIFICATION_LABELS[value]}</option>)}</select></label>{(['add-tags','remove-tags'] as BatchAction[]).map(action => <button className="button button--secondary" disabled={!selectedGames.length} key={action} onClick={() => { setBatchAction(action); setBatchEditOpen(true); }}>{action === 'add-tags' ? '添加标签' : '移除标签'}</button>)}<BulkGradeBar selectedGames={selectedGames} visibleIds={new Set(visible.map(item => item.id))} onApply={applyBulkGrade} onScore={applyBulkScore} /></>}{libraryView === 'trash' ? <><button className="button button--secondary" disabled={!selectionIds.size} onClick={() => lifecycleAction('restore', [...selectionIds])}>恢复</button><button className="button button--secondary danger-action" disabled={!selectionIds.size} onClick={() => lifecycleAction('delete', [...selectionIds])}>永久删除</button></> : <>{libraryView === 'hidden' && <button className="button button--secondary" disabled={!selectionIds.size} onClick={() => lifecycleAction('unhide', [...selectionIds])}>取消隐藏</button>}<button className="button button--secondary danger-action" disabled={!selectionIds.size} onClick={() => lifecycleAction('trash', [...selectionIds])}>移到回收站</button></>}</SelectionBar>)}
    {contextMenu && contextItem && <ContextMenu menu={contextMenu} item={contextItem} onClose={() => setContextMenu(null)} onClassification={value => patchClassification(contextItem.id, value)}
          onScore={value => patchItem(contextItem.id, { personalScore: value, ratingOrder: undefined })} onGrade={(mode, value) => patchItem(contextItem.id, mode === 'priority' ? { playPriority: value, ...(value !== contextItem.playPriority ? { priorityOrder: undefined } : {}) } : { personalGrade: value, ...(value !== contextItem.personalGrade ? { ratingOrder: undefined } : {}) })} onQuick={mode => setQuickItem({ id: contextItem.id, mode })} onEdit={() => { setSelectedId(contextItem.id); setEditor('edit'); }} onFavorite={() => patchItem(contextItem.id, { favorite: !contextItem.favorite })} onHide={() => lifecycleAction(contextItem.hiddenAt ? 'unhide' : 'hide', [contextItem.id])} onTrash={() => lifecycleAction('trash', [contextItem.id])} onRestore={() => lifecycleAction('restore', [contextItem.id])} onDelete={() => lifecycleAction('delete', [contextItem.id])} />}
    {quickItem && quickRecord && <QuickEditor item={quickRecord} availableItems={activeItems} mode={quickItem.mode} onClose={() => setQuickItem(null)} onSave={patch => patchItem(quickRecord.id, patch)} />}
    {selected && (() => {
      const shared: DetailPanelProps = { item: selected, availableItems: activeItems, guardRef: detailGuard, onClose: closeDetail,
        onEdit: () => guardDetail(() => setEditor('edit')), onPatch: patchSelected,
        onDelete: () => guardDetail(() => lifecycleAction('trash', [selected.id])), onRestore: () => lifecycleAction('restore', [selected.id]),
        onDeletePermanently: () => lifecycleAction('delete', [selected.id]), onHide: () => guardDetail(() => lifecycleAction('unhide', [selected.id])),
        onFilterTag: (tag, group) => guardDetail(() => { setSection(selected.category); setStatus('all'); setGameFilter('all'); setSubtypeFilter('all'); setQuery(selected.category === 'screen' ? tag : ''); setFavoriteOnly(false); setSelectedTags(group ? [] : [tag]); setSelectedGameTags(group ? { ...emptyGameTags(), [group]: [tag] } : emptyGameTags()); detailGuard.current = null; setSelectedId(null); }) };
      return selected.category === 'book' ? <BookDetail key={selected.id} {...shared} catalogTags={snapshot.bookTagCatalog} onAction={action => bookAction(selected.id, action)}/> : selected.category === 'screen' ? <ScreenDetail key={selected.id} {...shared} catalogTags={snapshot.screenTagCatalog} onAction={action => screenAction(selected.id, action)}/> : <DetailPanel key={selected.id} {...shared}/>;
    })()}

    {editor && <Editor key={`${editor}-${editor === 'import' ? importedDraft?.id : selected?.id ?? 'new'}`} initial={editor === 'edit' ? selected ?? undefined : editor === 'import' ? importedDraft ?? undefined : undefined} creating={editor === 'import' && !items.some(item => item.id === importedDraft?.id)} category={section} initialScreenKind={screenCreateKind} onSave={saveWork} onClose={() => { setEditor(null); setImportedDraft(null); }} />}
    {metadataOpen && <MetadataImport onClose={() => setMetadataOpen(false)} onSelect={candidate => { setMetadataOpen(false); setMetadataCandidate(candidate); }} />}
    {batchEditOpen && <Modal title={batchAction === 'add-tags' ? '添加标签' : '移除标签'} description="只对明确选中的游戏应用这一项操作。" wide onClose={() => setBatchEditOpen(false)}><BatchEditBody action={batchAction} items={selectedGames} availableItems={activeItems} onApply={applyBatchEdit} onClose={() => setBatchEditOpen(false)} /></Modal>}
    {batchOpen && <SteamLibraryImport initialScreenKind={screenCreateKind} initialCategory={section} exclusions={snapshot.importExclusions} items={items} onClose={() => setBatchOpen(false)} onImport={importBatch} />}
    {steamOpen && <SteamConnect exclusions={snapshot.importExclusions} items={items} onClose={() => setSteamOpen(false)} onSync={syncSteam} />}
    {metadataCandidate && <MetadataReview candidate={metadataCandidate} matches={findDuplicateCandidates(items, metadataCandidate)} items={items} onClose={() => setMetadataCandidate(null)} onConfirm={existing => { try { if (existing?.removedAt) { setToast('这件作品在回收站中，请先恢复后再更新资料。'); return; } setImportedDraft(applyMetadataCandidate(existing, metadataCandidate)); setMetadataCandidate(null); setEditor('import'); } catch (error) { setToast(error instanceof Error ? error.message : '资料无法应用'); } }} />}
    {tagManager && section === 'book' && <BookTagsDialog snapshot={snapshot} onCommit={updateSnapshot} onClose={() => setTagManager(false)} />}
    {tagManager && section === 'screen' && <ScreenTagsDialog snapshot={snapshot} onCommit={updateSnapshot} onClose={() => setTagManager(false)} />}
    {tagManager && section !== 'book' && section !== 'screen' && <TagManager creating={tagManager === 'create'} onMove={moveTagAction} onAssign={assignTag} items={activeItems} section={section} onClose={() => setTagManager(false)} onRename={(oldName, newName, tagScope) => { return manageTag(oldName, newName, tagScope); }} onDelete={(name, tagScope) => { return manageTag(name, undefined, tagScope); }} />}
    {collectionHub && <CollectionHub onClose={() => setCollectionHub(false)} onManual={() => { setCollectionHub(false); openEditor(); }} onSearch={() => { setCollectionHub(false); setMetadataOpen(true); }} onBatch={() => { setCollectionHub(false); setBatchOpen(true); }} onTags={() => { setCollectionHub(false); setTagManager(true); }} />}
    {settings && <SettingsDialog onHidden={() => { setSettings(false); changeLibraryView('hidden'); }} ambient={ambient} glass={glass} hasDemos={hasDemos} onClose={() => setSettings(false)} onSteam={() => { setSettings(false); setSteamOpen(true); }} onExport={exportBackup} onImport={() => { if (desktopGameAssetsAvailable) void importDesktopBackup(); else fileInput.current?.click(); }} onClearDemo={clearDemo} onNotice={setToast} />}
    <input className="sr-only" ref={fileInput} type="file" accept="application/json,.json" onChange={importBackup} />
    {toast && <div className="toast" role="status"><Check size={17} />{toast}<button onClick={() => setToast('')} aria-label="关闭提示"><X size={15} /></button></div>}
    <div className="mobile-add"><button onClick={openEditor} disabled={!!loadError} aria-label="收录作品"><Plus size={25} /></button></div>
  </div>;
}

export default App;
