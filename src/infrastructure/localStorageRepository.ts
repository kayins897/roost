import { isValidSnapshot } from '../domain/library.ts';
import type { LibraryRepository, LibrarySnapshot } from '../domain/types.ts';
import { demoSnapshot } from './demoData.ts';

const STORAGE_KEY = 'qiyu.library.v1';
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;

export class LocalStorageRepository implements LibraryRepository {
  private loadedRaw: string | null | undefined;
  private readonly storage: StorageAccess;
  constructor(storage?: StorageAccess) { this.storage = storage ?? window.localStorage; }
  load(): LibrarySnapshot {
    const raw = this.storage.getItem(STORAGE_KEY);
    this.loadedRaw = raw;
    if (raw === null) return structuredClone(demoSnapshot);
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isValidSnapshot(parsed)) throw new Error('本地收藏库数据格式不受支持');
      return parsed;
    } catch (error) {
      throw new Error('读取本地收藏库失败。请保留浏览器数据，避免进一步修改。', { cause: error });
    }
  }

  save(data: LibrarySnapshot, options?: { allowRecovery?: boolean; backupBeforeAppend?: boolean }): void {
    if (!isValidSnapshot(data)) throw new Error('收藏库数据校验失败');
    const current = this.storage.getItem(STORAGE_KEY);
    if (this.loadedRaw === undefined || current !== this.loadedRaw) throw new Error('其他窗口已修改收藏。保存已停止，请刷新页面后重试');
    if (current !== null) {
      let valid = false;
      try { valid = isValidSnapshot(JSON.parse(current)); } catch { /* Preserve invalid data. */ }
      if (!valid && !options?.allowRecovery) throw new Error('收藏库需要恢复，请先导入有效备份');
      if (!valid) this.storage.setItem('qiyu.library.recovery', current);
      if (options?.allowRecovery || options?.backupBeforeAppend) this.storage.setItem('qiyu.library.before-import', current);
    }
    this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
    this.loadedRaw = this.storage.getItem(STORAGE_KEY);
  }
}
