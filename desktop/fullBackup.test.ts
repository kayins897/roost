import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assetHash, GameAssetStore } from './gameAssets.ts';
import { installBackupAssets, prepareFullBackup, writeFullBackup } from './fullBackup.ts';
import { LibraryStore } from './store.ts';
import type { LibrarySnapshot, MediaItem } from '../src/domain/types.ts';
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1N0AAAAASUVORK5CYII=', 'base64');
const decode = () => ({ width: 1, height: 1, thumbnail: image });
const game = (extra: Partial<MediaItem> = {}): MediaItem => ({ id: 'game', title: '合成游戏', category: 'game', subcategory: 'Steam', creator: '', year: '', status: 'finished', tags: [], impression: '记录', favorite: false, artwork: 'default', createdAt: '2026-01-01', updatedAt: '2026-01-01', ...extra });
function temporary() { return fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-full-backup-')); }
test('复制原图不依赖来源文件、同内容去重，不接受路径作为assetID', () => {
  const dir = temporary(), source = path.join(dir, '自己的图片.png'); fs.writeFileSync(source, image);
  const assets = new GameAssetStore(path.join(dir, 'profile'), decode), first = assets.importFile(source), second = assets.importFile(source);
  fs.unlinkSync(source); assert.equal(first.filename, '自己的图片.png'); assert.equal(first.assetId, second.assetId); assert.notEqual(first.id, second.id);
  assert.deepEqual(fs.readFileSync(assets.file(first.assetId)), image); assert.equal(fs.readdirSync(assets.directory).length, 2);
  assert.throws(() => assets.file('../library.json')); assert.throws(() => assets.install(Buffer.from('not an image')));
});
test('完整备份跨目录恢复、保留评分/零/未知扩展，删除引用不破坏旧备份', () => {
  const dir = temporary(), assets = new GameAssetStore(path.join(dir, 'source'), decode); assets.install(image);
  const screenshot = { id: 'shot', assetId: assetHash(image), filename: '画面.png', mimeType: 'image/png' as const, width: 1, height: 1, addedAt: '2026-01-01T00:00:00.000Z' };
  const snapshot: LibrarySnapshot = { schemaVersion: 1, items: [game({ personalGrade: 'SSS', personalScore: 9.5, completionCount: 0, screenshots: [screenshot], screenshotCoverId: 'shot' })] };
  const filename = path.join(dir, 'backup.roost'); writeFullBackup(filename, snapshot, assets);
  const prepared = prepareFullBackup(filename), target = new GameAssetStore(path.join(dir, 'target'), decode); installBackupAssets(prepared, target);
  const store = new LibraryStore(path.join(dir, 'target')); store.save(prepared.snapshot, 'missing', true);
  assert.deepEqual(fs.readFileSync(target.file(screenshot.assetId)), image); assert.deepEqual(new LibraryStore(store.directory).load().snapshot?.items, snapshot.items);
  const current = store.load(); store.save({ ...prepared.snapshot, items: [game({ screenshots: [] })] }, current.revision);
  assert.ok(fs.existsSync(target.file(screenshot.assetId))); assert.ok(fs.existsSync(path.join(store.directory, 'library.previous.json')));
});
test('篡改/截断/缺图不产生假完整备份，恢复失败不覆盖收藏', () => {
  const dir = temporary(), assets = new GameAssetStore(dir, decode); assets.install(image);
  const shot = { id: 's', assetId: assetHash(image), filename: 'x.png', mimeType: 'image/png' as const, width: 1, height: 1, addedAt: '2026-01-01' };
  const snapshot: LibrarySnapshot = { schemaVersion: 1, items: [game({ screenshots: [shot] })] }, filename = path.join(dir, 'backup.roost');
  writeFullBackup(filename, snapshot, assets); const bytes = fs.readFileSync(filename); bytes[bytes.length - 1] ^= 1; fs.writeFileSync(filename, bytes);
  assert.throws(() => prepareFullBackup(filename), /损坏/); fs.writeFileSync(filename, bytes.subarray(0, 20)); assert.throws(() => prepareFullBackup(filename));
  fs.unlinkSync(assets.file(shot.assetId)); assert.throws(() => writeFullBackup(filename, snapshot, assets));
  const store = new LibraryStore(path.join(dir, 'existing')); store.save({ schemaVersion: 1, items: [game()] }, 'missing'); const before = fs.readFileSync(store.file, 'utf8');
  assert.throws(() => store.save(snapshot, 'stale-revision', true)); assert.equal(fs.readFileSync(store.file, 'utf8'), before);
});
