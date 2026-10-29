import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge, DesktopResult, LibrarySnapshot, MetadataCandidate, StoredRecord, SteamImportGame, SteamEnrichmentProgress, SteamLibraryRequest } from '../src/shared/ipc-contract.ts';

// 桥接实现必须与 src/shared/ipc-contract.ts 的 DesktopBridge 逐方法对齐；
// 载荷类型即契约类型，不在 preload 做运行时改写。
const bridge: DesktopBridge = {
  getInfo: () => ipcRenderer.sendSync('qiyu:info').value,
  loadLibrary: (): DesktopResult<StoredRecord> => ipcRenderer.sendSync('qiyu:load'),
  saveLibrary: (snapshot: LibrarySnapshot, revision: string, allowRecovery: boolean) =>
    ipcRenderer.sendSync('qiyu:save', { snapshot, revision, allowRecovery }),
  openDataDirectory: () => { ipcRenderer.send('qiyu:open-data'); },
  importScreenshots: () => ipcRenderer.invoke('qiyu:images-import'),
  exportFullBackup: (snapshot: LibrarySnapshot) => ipcRenderer.invoke('qiyu:backup-export', snapshot),
  chooseFullBackup: () => ipcRenderer.invoke('qiyu:backup-choose'),
  installBackupAssets: (token: string) => ipcRenderer.invoke('qiyu:backup-assets', token),
  discardBackup: (token: string) => ipcRenderer.send('qiyu:backup-discard', token),
  lookupMetadata: (query: string): Promise<DesktopResult<MetadataCandidate[]>> => ipcRenderer.invoke('qiyu:metadata', query),
  getSteamConnection: () => ipcRenderer.invoke('qiyu:steam-state'),
  forgetSteamConnection: () => ipcRenderer.invoke('qiyu:steam-forget'),
  readSteamLibrary: (request: SteamLibraryRequest) => ipcRenderer.invoke('qiyu:steam-read', request),
  enrichSteamLibrary: (games: SteamImportGame[]) => ipcRenderer.invoke('qiyu:steam-enrich', games),
  cancelSteamRequest: () => ipcRenderer.send('qiyu:steam-cancel'),
  onSteamProgress: (listener: (value: SteamEnrichmentProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: SteamEnrichmentProgress) => listener(value);
    ipcRenderer.on('qiyu:steam-progress', handler);
    return () => ipcRenderer.removeListener('qiyu:steam-progress', handler);
  },
  onWindowVisibility: (listener: (visible: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) => {
      if (typeof value === 'boolean') listener(value);
    };
    ipcRenderer.on('qiyu:window-visibility', handler);
    return () => ipcRenderer.removeListener('qiyu:window-visibility', handler);
  },
};
contextBridge.exposeInMainWorld('qiyuDesktop', Object.freeze(bridge));
