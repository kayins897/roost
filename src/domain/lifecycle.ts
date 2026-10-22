import { addImportExclusions, removeImportExclusions } from './importExclusions.ts';
import type { LibrarySnapshot, MediaItem } from './types.ts';

export type LibraryView = 'library' | 'hidden' | 'trash';
type ItemIds = ReadonlySet<string> | readonly string[];

function selectedIds(snapshot: LibrarySnapshot, ids: ItemIds): Set<string> {
  const selected = new Set(ids);
  const known = new Set(snapshot.items.map(item => item.id));
  if ([...selected].some(id => !known.has(id))) throw new Error('部分作品已不存在，请刷新后重试');
  return selected;
}

export function visibleLibraryItems(snapshot: LibrarySnapshot, view: LibraryView = 'library'): MediaItem[] {
  return snapshot.items.filter(item => view === 'trash' ? !!item.removedAt : !item.removedAt && (view === 'hidden' ? !!item.hiddenAt : !item.hiddenAt));
}

/** Hiding never edits progress, hours, impressions or the import-exclusion list. */
export function setItemsHidden(snapshot: LibrarySnapshot, ids: ItemIds, hidden: boolean): LibrarySnapshot {
  const selected = selectedIds(snapshot, ids);
  const now = new Date().toISOString();
  let changed = false;
  const items = snapshot.items.map(item => {
    if (!selected.has(item.id) || item.removedAt || !!item.hiddenAt === hidden) return item;
    changed = true;
    const updated = { ...item, updatedAt: now };
    if (hidden) updated.hiddenAt = now;
    else delete updated.hiddenAt;
    return updated;
  });
  return changed ? { ...snapshot, items } : snapshot;
}

/** Removal is local and recoverable, including the full original personal record. */
export function trashItems(snapshot: LibrarySnapshot, ids: ItemIds): LibrarySnapshot {
  const selected = selectedIds(snapshot, ids);
  const now = new Date().toISOString();
  const removed = snapshot.items.filter(item => selected.has(item.id) && !item.removedAt);
  if (!removed.length) return snapshot;
  const items = snapshot.items.map(item => selected.has(item.id) && !item.removedAt ? { ...item, removedAt: now, updatedAt: now } : item);
  const importExclusions = addImportExclusions(snapshot.importExclusions, removed);
  return { ...snapshot, items, ...(importExclusions.length ? { importExclusions } : {}) };
}

export function restoreItems(snapshot: LibrarySnapshot, ids: ItemIds): LibrarySnapshot {
  const selected = selectedIds(snapshot, ids);
  const restored = snapshot.items.filter(item => selected.has(item.id) && !!item.removedAt);
  if (!restored.length) return snapshot;
  const now = new Date().toISOString();
  const items = snapshot.items.map(item => {
    if (!selected.has(item.id) || !item.removedAt) return item;
    const updated = { ...item, updatedAt: now };
    delete updated.removedAt;
    return updated;
  });
  const importExclusions = snapshot.importExclusions ? removeImportExclusions(snapshot.importExclusions, restored, items.filter(item => !!item.removedAt)) : undefined;
  return { ...snapshot, items, ...(importExclusions ? { importExclusions } : {}) };
}

/** Permanent erasure requires a prior explicit move to the trash. */
export function permanentlyDeleteItems(snapshot: LibrarySnapshot, ids: ItemIds): LibrarySnapshot {
  const selected = selectedIds(snapshot, ids);
  const removed = snapshot.items.filter(item => selected.has(item.id));
  if (!removed.length) return snapshot;
  if (removed.some(item => !item.removedAt)) throw new Error('请先将作品移入回收站，再永久删除');
  const importExclusions = addImportExclusions(snapshot.importExclusions, removed);
  return { ...snapshot, items: snapshot.items.filter(item => !selected.has(item.id)), ...(importExclusions.length ? { importExclusions } : {}) };
}
