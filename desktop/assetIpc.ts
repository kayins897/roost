import { dialog, ipcMain, nativeImage, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isValidSnapshot } from '../src/domain/library.ts';
import { GameAssetStore } from './gameAssets.ts';
import { installBackupAssets, prepareFullBackup, writeFullBackup, type PreparedBackup } from './fullBackup.ts';

export function createGameAssetStore(directory: string) {
  return new GameAssetStore(directory, bytes => {
    const image = nativeImage.createFromBuffer(bytes), size = image.getSize();
    if (image.isEmpty() || size.width * size.height > 60000000) throw new Error('图片无法解析或尺寸过大');
    const ratio = Math.min(1, 720 / Math.max(size.width, size.height));
    const thumb = ratio < 1 ? image.resize({ width: Math.max(1, Math.round(size.width * ratio)), height: Math.max(1, Math.round(size.height * ratio)) }) : image;
    return { ...size, thumbnail: thumb.toJPEG(82) };
  });
}
export function registerAssetIpc(assets: GameAssetStore, owner: () => BrowserWindow | null, trusted: (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => boolean | null) {
  const pending = new Map<string, PreparedBackup>();
  let busy = false;
  const errorResult = (error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : '文件操作失败' });
  const register = (name: string, action: (value: unknown) => Promise<unknown>) => ipcMain.handle(name, async (event, value: unknown) => {
    if (!trusted(event)) return { ok: false, error: '请求来源无效' };
    if (busy) return { ok: false, error: '已有图片或备份操作正在进行，请稍后重试' };
    busy = true;
    try { return { ok: true, value: await action(value) }; } catch (error) { return errorResult(error); } finally { busy = false; }
  });
  register('qiyu:images-import', async () => {
    const result = await dialog.showOpenDialog(owner()!, { title: '添加游戏截图', properties: ['openFile', 'multiSelections'], filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    if (result.canceled) return [];
    if (result.filePaths.length > 30) throw new Error('每次最多添加 30 张截图');
    return result.filePaths.map(filename => assets.importFile(filename));
  });
  register('qiyu:backup-export', async snapshot => {
    if (!isValidSnapshot(snapshot)) throw new Error('收藏数据校验失败');
    const result = await dialog.showSaveDialog(owner()!, { title: '导出完整备份（含截图原图）', defaultPath: `栖域-完整备份-${new Date().toISOString().slice(0, 10)}.roost`, filters: [{ name: '栖域完整备份', extensions: ['roost'] }] });
    if (result.canceled || !result.filePath) return { saved: false };
    writeFullBackup(result.filePath, snapshot, assets); return { saved: true };
  });
  register('qiyu:backup-choose', async () => {
    const result = await dialog.showOpenDialog(owner()!, { title: '恢复收藏备份', properties: ['openFile'], filters: [{ name: '栖域完整备份 / 旧 JSON', extensions: ['roost', 'json'] }] });
    if (result.canceled) return null;
    const filename = result.filePaths[0];
    pending.clear();
    if (/\.json$/i.test(filename)) {
      if (fs.statSync(filename).size > 100 * 1024 * 1024) throw new Error('JSON 备份超过 100 MB');
      const snapshot: unknown = JSON.parse(fs.readFileSync(filename, 'utf8'));
      if (!isValidSnapshot(snapshot)) throw new Error('不是受支持的栖域 v1 备份');
      if (snapshot.items.some(item => item.screenshots?.some(image => !fs.existsSync(assets.file(image.assetId))))) throw new Error('JSON 不包含截图原图，请选择 .roost 完整备份');
      return { snapshot };
    }
    const prepared = prepareFullBackup(filename), token = randomUUID(); pending.set(token, prepared);
    return { snapshot: prepared.snapshot, token };
  });
  register('qiyu:backup-assets', async token => {
    if (typeof token !== 'string' || !pending.has(token)) throw new Error('备份预览已失效，请重新选择');
    const prepared = pending.get(token)!; pending.delete(token); installBackupAssets(prepared, assets); return null;
  });
  ipcMain.on('qiyu:backup-discard', (event, token: unknown) => { if (trusted(event) && typeof token === 'string') pending.delete(token); });
}
