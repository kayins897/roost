import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isValidSnapshot } from '../src/domain/library.ts';
import type { LibrarySnapshot } from '../src/domain/types.ts';
import { assetHash, GameAssetStore, MAX_IMAGE_BYTES } from './gameAssets.ts';

// Versioned binary container: magic + manifest length + UTF-8 manifest + raw original files.
// No base64 in library JSON; bounded reads and hashes, no archive entry paths to traverse.
const MAGIC = Buffer.from('ROOSTBK1');
const MAX_MANIFEST = 100 * 1024 * 1024;
const MAX_BACKUP = 4 * 1024 * 1024 * 1024;
interface AssetEntry { id: string; size: number }
interface Manifest { format: 'roost-backup'; version: 1; snapshot: LibrarySnapshot; assets: AssetEntry[] }
export interface PreparedBackup { snapshot: LibrarySnapshot; filename: string; manifestBytes: number; assets: AssetEntry[]; fingerprint: string }
function fingerprint(filename: string) { const s = fs.statSync(filename); return `${s.size}:${s.mtimeMs}:${s.ctimeMs}`; }
function exact(fd: number, length: number, offset: number): Buffer {
  const bytes = Buffer.alloc(length); let read = 0;
  while (read < length) { const n = fs.readSync(fd, bytes, read, length - read, offset + read); if (!n) throw new Error('备份文件不完整'); read += n; }
  return bytes;
}
export function writeFullBackup(filename: string, snapshot: LibrarySnapshot, assets: GameAssetStore): void {
  if (!isValidSnapshot(snapshot)) throw new Error('收藏数据无效');
  const ids = [...new Set(snapshot.items.flatMap(item => (item.screenshots ?? []).map(image => image.assetId)))];
  const entries = ids.map(id => {
    const file = assets.file(id), stat = fs.statSync(file);
    if (!stat.isFile() || !stat.size || stat.size > MAX_IMAGE_BYTES) throw new Error('存在缺失或损坏截图，未导出不完整备份');
    return { id, size: stat.size };
  });
  const manifest: Manifest = { format: 'roost-backup', version: 1, snapshot: { ...snapshot, exportedAt: new Date().toISOString() }, assets: entries };
  const raw = Buffer.from(JSON.stringify(manifest));
  const total = 12 + raw.length + entries.reduce((sum, entry) => sum + entry.size, 0);
  if (raw.length > MAX_MANIFEST || total > MAX_BACKUP) throw new Error('完整备份超过当前支持的 4 GB 上限');
  const temporary = path.join(path.dirname(filename), `.roost-backup-${randomUUID()}.tmp`);
  let fd: number | undefined;
  try {
    fd = fs.openSync(temporary, 'wx');
    const header = Buffer.alloc(12); MAGIC.copy(header); header.writeUInt32LE(raw.length, 8);
    fs.writeFileSync(fd, header); fs.writeFileSync(fd, raw);
    for (const entry of entries) {
      const bytes = fs.readFileSync(assets.file(entry.id));
      if (bytes.length !== entry.size || assetHash(bytes) !== entry.id) throw new Error('截图校验失败，备份未完成');
      fs.writeFileSync(fd, bytes);
    }
    fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, filename);
  } finally { if (fd !== undefined) fs.closeSync(fd); if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
export function prepareFullBackup(filename: string): PreparedBackup {
  const stat = fs.statSync(filename);
  if (!stat.isFile() || stat.size > MAX_BACKUP || stat.size < 12) throw new Error('备份大小无效');
  const fd = fs.openSync(filename, 'r');
  try {
    const header = exact(fd, 12, 0);
    if (!header.subarray(0, 8).equals(MAGIC)) throw new Error('不是受支持的栖域完整备份');
    const length = header.readUInt32LE(8);
    if (length > MAX_MANIFEST || length + 12 > stat.size) throw new Error('备份目录大小无效');
    const manifest = JSON.parse(exact(fd, length, 12).toString()) as Manifest;
    if (manifest.format !== 'roost-backup' || manifest.version !== 1 || !isValidSnapshot(manifest.snapshot) || !Array.isArray(manifest.assets) || manifest.assets.length > 100000) throw new Error('备份数据无效');
    const referenced = new Set(manifest.snapshot.items.flatMap(item => (item.screenshots ?? []).map(image => image.assetId)));
    if (new Set(manifest.assets.map(a => a?.id)).size !== manifest.assets.length || referenced.size !== manifest.assets.length) throw new Error('备份截图目录不匹配');
    let offset = 12 + length;
    for (const entry of manifest.assets) {
      if (!entry || !/^[a-f0-9]{64}$/.test(entry.id) || !referenced.has(entry.id) || !Number.isSafeInteger(entry.size) || entry.size <= 0 || entry.size > MAX_IMAGE_BYTES || offset + entry.size > stat.size) throw new Error('备份截图目录无效');
      if (assetHash(exact(fd, entry.size, offset)) !== entry.id) throw new Error('备份截图损坏，未恢复收藏');
      offset += entry.size;
    }
    if (offset !== stat.size) throw new Error('备份长度不匹配');
    return { snapshot: manifest.snapshot, filename, manifestBytes: length, assets: manifest.assets, fingerprint: fingerprint(filename) };
  } finally { fs.closeSync(fd); }
}
/** Install first, then let the normal revision-checked repository commit the snapshot.
 * A failed save can leave unreferenced assets, but never overwrite the previous library. */
export function installBackupAssets(prepared: PreparedBackup, assets: GameAssetStore): void {
  if (fingerprint(prepared.filename) !== prepared.fingerprint) throw new Error('备份在预览后已改变，请重新选择');
  const fd = fs.openSync(prepared.filename, 'r');
  try {
    let offset = 12 + prepared.manifestBytes;
    for (const entry of prepared.assets) { assets.install(exact(fd, entry.size, offset), entry.id); offset += entry.size; }
  } finally { fs.closeSync(fd); }
}
