import { isValidSnapshot } from '../domain/library.ts';
import type { LibraryRepository, LibrarySnapshot } from '../domain/types.ts';
import { LocalStorageRepository } from './localStorageRepository.ts';

export const desktopBridge = window.qiyuDesktop ?? null;
export const desktopInfo = desktopBridge?.getInfo() ?? null;

class DesktopRepository implements LibraryRepository {
  private revision = '';
  load(): LibrarySnapshot {
    const result = desktopBridge!.loadLibrary();
    if (!result.ok || !result.value) throw new Error(result.error || '无法读取本机收藏文件');
    this.revision = result.value.revision;
    if (result.value.error) throw new Error(result.value.error);
    const snapshot = result.value.snapshot ?? { schemaVersion: 1, items: [] };
    if (!isValidSnapshot(snapshot)) throw new Error('本机收藏文件格式不受支持');
    return snapshot;
  }
  save(snapshot: LibrarySnapshot, options?: { allowRecovery?: boolean }): void {
    if (!isValidSnapshot(snapshot)) throw new Error('收藏库数据校验失败');
    const result = desktopBridge!.saveLibrary(snapshot, this.revision, options?.allowRecovery === true);
    if (!result.ok || !result.value) throw new Error(result.error || '本机收藏保存失败');
    this.revision = result.value.revision;
  }
}
export function createRepository(): LibraryRepository {
  return desktopBridge ? new DesktopRepository() : new LocalStorageRepository();
}
