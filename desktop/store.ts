import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { isValidSnapshot } from '../src/domain/library.ts';
import type { LibrarySnapshot } from '../src/domain/types.ts';

const MAX_BYTES = 100 * 1024 * 1024;
const hash = (raw: string) => createHash('sha256').update(raw).digest('hex');
export class LibraryStore {
  readonly directory: string;
  readonly file: string;
  constructor(directory: string) {
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, 'library.json');
  }
  private readCurrent(): { raw: string | null; revision: string; snapshot: LibrarySnapshot | null; error?: string; oversized?: boolean } {
    if (!fs.existsSync(this.file)) return { raw: null, revision: 'missing', snapshot: null };
    const stat = fs.statSync(this.file);
    if (stat.size > MAX_BYTES) return {
      raw: null, snapshot: null, oversized: true,
      revision: `oversized-${hash(`${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}`)}`,
      error: '收藏文件超过 100 MB，已停止读取以保护原文件；可导入有效备份恢复，原文件将另存保留',
    };
    const raw = fs.readFileSync(this.file, 'utf8');
    const revision = hash(raw);
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isValidSnapshot(parsed)) throw new Error('格式不受支持');
      return { raw, revision, snapshot: parsed };
    } catch {
      return { raw, revision, snapshot: null, error: '收藏文件无法解析，原文件已保留。请打开数据目录检查备份，或导入有效备份恢复' };
    }
  }
  load() {
    const { snapshot, revision, error } = this.readCurrent();
    return { snapshot, revision, error };
  }
  save(snapshot: unknown, expectedRevision: string, allowRecovery = false): { revision: string } {
    if (!isValidSnapshot(snapshot)) throw new Error('收藏库数据校验失败');
    const raw = JSON.stringify(snapshot, null, 2);
    if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error('收藏库超过 100 MB，请减少封面体积后重试');
    const current = this.readCurrent();
    if (current.revision !== expectedRevision) throw new Error('收藏文件已在其他位置变更。为避免覆盖，保存已停止；请重新打开应用后再修改');
    if (current.error && !allowRecovery) throw new Error('收藏文件需要恢复，普通修改已停止。请先导入有效备份');
    fs.mkdirSync(this.directory, { recursive: true });
    if (current.raw !== null || current.oversized) {
      const backupDirectory = path.join(this.directory, 'backups');
      fs.mkdirSync(backupDirectory, { recursive: true });
      if (current.error || allowRecovery) {
        const beforeRecovery = path.join(backupDirectory, `before-import-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.json`);
        if (current.oversized) fs.copyFileSync(this.file, beforeRecovery, fs.constants.COPYFILE_EXCL);
        else fs.writeFileSync(beforeRecovery, current.raw!, { encoding: 'utf8', flag: 'wx' });
      }
      if (!current.error && current.raw !== null) {
        this.atomicWrite(path.join(this.directory, 'library.previous.json'), current.raw);
        const day = new Date().toLocaleDateString('sv-SE');
        const dailyFile = path.join(backupDirectory, `daily-${day}.json`);
        if (!fs.existsSync(dailyFile)) fs.writeFileSync(dailyFile, current.raw, { encoding: 'utf8', flag: 'wx' });
      }
    }
    this.atomicWrite(this.file, raw);
    this.pruneDailyBackups();
    return { revision: hash(raw) };
  }
  private atomicWrite(file: string, raw: string) {
    if (path.dirname(path.resolve(file)) !== this.directory) throw new Error('数据写入路径无效');
    const temporary = path.join(this.directory, `.qiyu-${randomUUID()}.tmp`);
    let descriptor: number | undefined;
    try {
      descriptor = fs.openSync(temporary, 'wx');
      fs.writeFileSync(descriptor, raw, 'utf8');
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor); descriptor = undefined;
      fs.renameSync(temporary, file);
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  private pruneDailyBackups() {
    // Pruning is best-effort and never turns a completed save into a failure.
    try {
      const directory = path.join(this.directory, 'backups');
      if (!fs.existsSync(directory)) return;
      const daily = fs.readdirSync(directory).filter(name => /^daily-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().reverse();
      for (const name of daily.slice(7)) fs.unlinkSync(path.join(directory, name));
    } catch { /* Keep excess generated backups when cleanup is unavailable. */ }
  }
}
