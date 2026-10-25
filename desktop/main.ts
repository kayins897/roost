import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, protocol, safeStorage, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LibraryStore } from './store.ts';
import { lookupMetadata } from './metadata.ts';
import { enrichSteamLibrary, readSteamLibrary, SteamConnectionStore } from './steam.ts';

const ENTRY_URL = 'qiyu://app/index.html';
const testing = process.env.QIYU_E2E === '1';
app.setName('栖域');
// 可见隔离演示模式：--demo（随包启动器传入）使用独立的 QIYU-Demo 数据目录与单实例锁，
// 与正常模式/测试模式互不干扰；绝不回退真实 QIYU 目录。
const demoMode = process.argv.includes('--demo');
const demoSeed = () => path.join(app.getAppPath(), 'build', 'demo-library.json');
function seedDemoLibrary(keepExisting: boolean): boolean {
  const seedFile = demoSeed();
  if (!fs.existsSync(seedFile)) return false;
  if (keepExisting && fs.existsSync(path.join(dataDirectory, 'library.json'))) return true;
  fs.copyFileSync(seedFile, path.join(dataDirectory, 'library.json'));
  return true;
}
const dataDirectory = testing && process.env.QIYU_TEST_DATA_DIR
  ? path.resolve(process.env.QIYU_TEST_DATA_DIR)
  : demoMode ? path.join(app.getPath('appData'), 'QIYU-Demo')
  : path.join(app.getPath('appData'), 'QIYU');
fs.mkdirSync(dataDirectory, { recursive: true });
app.setPath('userData', dataDirectory);
if (demoMode && !testing) {
  const libraryFile = path.join(dataDirectory, 'library.json');
  if (!fs.existsSync(libraryFile)) {
    if (!seedDemoLibrary(false)) { dialog.showErrorBox('栖域演示启动失败', '找不到随包演示数据（build/demo-library.json）。请重新解压完整目录后重试。'); app.quit(); }
  }
}
protocol.registerSchemesAsPrivileged([{ scheme: 'qiyu', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
let mainWindow: BrowserWindow | null = null;
function windowVisible() {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized());
}
function publishWindowVisibility() {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('qiyu:window-visibility', windowVisible());
  }
}
const store = new LibraryStore(dataDirectory);
const steamConnection = new SteamConnectionStore(dataDirectory, safeStorage);
let steamRequest: AbortController | null = null;
function trusted(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) {
  return mainWindow && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame && event.senderFrame.url === ENTRY_URL;
}
// 封面统一压缩为本地 JPEG data URL：超限或无法解析的图片返回 undefined，由调用方按"失败不阻塞元数据"处理。
function coverToDataUrl(bytes: Uint8Array, maxWidth: number, maxHeight: number) {
  const image = nativeImage.createFromBuffer(Buffer.from(bytes));
  if (image.isEmpty()) return undefined;
  const size = image.getSize();
  if (size.width > 12000 || size.height > 12000 || size.width * size.height > 40000000) return undefined;
  const ratio = Math.min(maxWidth / size.width, maxHeight / size.height, 1);
  const resized = ratio < 1 ? image.resize({ width: Math.max(1, Math.round(size.width * ratio)), height: Math.max(1, Math.round(size.height * ratio)) }) : image;
  return `data:image/jpeg;base64,${resized.toJPEG(76).toString('base64')}`;
}
function registerIpc() {
  ipcMain.handle('qiyu:steam-state', event => {
    if (!trusted(event)) return { ok: false, error: '请求来源无效' };
    try { return { ok: true, value: steamConnection.state() }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Steam 设置无法读取' }; }
  });
  ipcMain.handle('qiyu:steam-forget', event => {
    if (!trusted(event)) return { ok: false, error: '请求来源无效' };
    if (steamRequest) return { ok: false, error: '请先取消正在进行的 Steam 读取' };
    try { return { ok: true, value: steamConnection.forget() }; }
    catch { return { ok: false, error: '清除 Steam 设置失败，请稍后再试；收藏不会被删除' }; }
  });
  ipcMain.on('qiyu:steam-cancel', event => { if (trusted(event)) steamRequest?.abort(); });
  ipcMain.handle('qiyu:steam-read', async (event, value: unknown) => {
    if (!trusted(event)) return { ok: false, error: '请求来源无效' };
    if (steamRequest) return { ok: false, error: '已有 Steam 读取正在进行，请稍候或先取消' };
    if (!value || typeof value !== 'object' || !('rememberKey' in value) || typeof value.rememberKey !== 'boolean' || !('profile' in value) || typeof value.profile !== 'string') return { ok: false, error: 'Steam 连接请求无效' };
    const input = value as { profile: string; apiKey?: unknown; rememberKey: boolean; includePlayedFreeGames?: unknown };
    if (input.apiKey !== undefined && typeof input.apiKey !== 'string') return { ok: false, error: 'Steam 密钥格式无效' };
    steamRequest = new AbortController();
    try {
      const key = (typeof input.apiKey === 'string' && input.apiKey.trim()) || steamConnection.key();
      const result = await readSteamLibrary(input, key, { signal: steamRequest.signal, fetch: (request, init) => net.fetch(request instanceof URL ? request.toString() : request, init) });
      steamConnection.save(result.steamId, key, input.rememberKey);
      return { ok: true, value: result };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Steam 库读取失败' }; }
    finally { steamRequest = null; }
  });
  ipcMain.handle('qiyu:steam-enrich', async (event, games: unknown) => {
    if (!trusted(event)) return { ok: false, error: '请求来源无效' };
    if (steamRequest) return { ok: false, error: '已有 Steam 读取正在进行，请稍候或先取消' };
    steamRequest = new AbortController();
    try {
      const value = await enrichSteamLibrary(games, {
        signal: steamRequest.signal,
        fetch: (request, init) => net.fetch(request instanceof URL ? request.toString() : request, init),
        imageToDataUrl: bytes => coverToDataUrl(bytes, 240, 360),
        onProgress: value => { if (trusted(event) && !event.sender.isDestroyed()) event.sender.send('qiyu:steam-progress', value); },
      });
      return { ok: true, value };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Steam 资料补全失败' }; }
    finally { steamRequest = null; }
  });
  let metadataBusy = false;
  ipcMain.handle('qiyu:metadata', async (event, query: unknown) => {
    if (!trusted(event)) return { ok: false, error: '请求来源无效' };
    if (metadataBusy) return { ok: false, error: '正在读取作品资料，请稍候再试' };
    metadataBusy = true;
    try {
      const value = await lookupMetadata(query, {
        fetch: (input, init) => net.fetch(input instanceof URL ? input.toString() : input, init),
        imageToDataUrl: bytes => coverToDataUrl(bytes, 480, 680),
      });
      return { ok: true, value };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : '读取作品资料失败，请稍后再试或手动收录。' }; }
    finally { metadataBusy = false; }
  });
  const handlers: Record<string, (value: unknown) => unknown> = {
    'qiyu:info': () => ({ version: app.getVersion(), dataDirectory, windowVisible: windowVisible(), ...(demoMode ? { demo: true } : {}) }),
    'qiyu:load': () => store.load(),
    'qiyu:save': value => {
      if (!value || typeof value !== 'object') throw new Error('保存请求无效');
      const request = value as { revision?: unknown; allowRecovery?: unknown; snapshot?: unknown };
      if (typeof request.revision !== 'string' || typeof request.allowRecovery !== 'boolean') throw new Error('保存请求无效');
      return store.save(request.snapshot, request.revision, request.allowRecovery);
    },
  };
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.on(channel, (event, value) => {
      if (!trusted(event)) { event.returnValue = { ok: false, error: '请求来源无效' }; return; }
      try { event.returnValue = { ok: true, value: handler(value) }; }
      catch (error) { event.returnValue = { ok: false, error: error instanceof Error ? error.message : '本机文件操作失败' }; }
    });
  }
  ipcMain.handle('qiyu:demo-reset', event => {
    if (!trusted(event) || !demoMode) return { ok: false, error: '演示重置仅在演示模式可用' };
    try {
      const libraryFile = path.join(dataDirectory, 'library.json');
      if (fs.existsSync(libraryFile)) fs.renameSync(libraryFile, path.join(dataDirectory, `demo-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`));
      if (!seedDemoLibrary(false)) return { ok: false, error: '找不到随包演示数据，请重新解压完整目录' };
      return { ok: true, value: null };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : '演示重置失败' }; }
  });
  ipcMain.on('qiyu:open-data', event => {
    if (!trusted(event)) return;
    fs.mkdirSync(dataDirectory, { recursive: true });
    void shell.openPath(dataDirectory).then(message => { if (message) dialog.showErrorBox('无法打开数据目录', message); });
  });
}
function externalLink(value: string) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
    void shell.openExternal(url.toString()).catch(error => dialog.showErrorBox('无法打开来源链接', String(error)));
  } catch { /* Invalid source links never open a native application. */ }
}
function createWindow() {
  mainWindow = new BrowserWindow({
    title: demoMode ? '栖域（演示数据）' : '栖域', width: 1440, height: 960, minWidth: 880, minHeight: 640,
    backgroundColor: '#08090b', show: false,
    ...(process.platform === 'win32' ? {
      titleBarStyle: 'hidden' as const,
      titleBarOverlay: { color: '#00000000', symbolColor: '#e5e1dc', height: 32 },
    } : {}),
    icon: path.join(app.getAppPath(), 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  mainWindow.once('ready-to-show', () => { if (!testing) mainWindow?.show(); });
  mainWindow.on('show', publishWindowVisibility);
  mainWindow.on('hide', publishWindowVisibility);
  mainWindow.on('minimize', publishWindowVisibility);
  mainWindow.on('restore', publishWindowVisibility);
  mainWindow.webContents.on('did-finish-load', publishWindowVisibility);
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { externalLink(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (event, url) => { if (url !== ENTRY_URL) { event.preventDefault(); externalLink(url); } });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  mainWindow.webContents.session.on('will-download', (event, item, contents) => {
    if (contents !== mainWindow?.webContents || !item.getURL().startsWith('blob:qiyu://app/') || !item.getFilename().endsWith('.json')) { event.preventDefault(); return; }
    item.setSaveDialogOptions({ title: '导出收藏备份', defaultPath: path.join(app.getPath('documents'), path.basename(item.getFilename())), filters: [{ name: '栖域 JSON 备份', extensions: ['json'] }] });
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3) dialog.showErrorBox('栖域启动失败', `${description}\n${url}`);
  });
  void mainWindow.loadURL(ENTRY_URL);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (testing) return; if (mainWindow?.isMinimized()) mainWindow.restore(); mainWindow?.show(); mainWindow?.focus(); });
  app.whenReady().then(() => {
    const distDirectory = path.resolve(app.getAppPath(), 'dist');
    protocol.handle('qiyu', request => {
      try {
        const url = new URL(request.url);
        if (url.hostname !== 'app') return new Response('Not found', { status: 404 });
        const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
        const resource = path.resolve(distDirectory, '.' + pathname);
        if (!resource.startsWith(distDirectory + path.sep)) return new Response('Forbidden', { status: 403 });
        return net.fetch(pathToFileURL(resource).toString());
      } catch { return new Response('Not found', { status: 404 }); }
    });
    registerIpc(); Menu.setApplicationMenu(null); createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  }).catch(error => { dialog.showErrorBox('栖域启动失败', String(error)); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => steamRequest?.abort());
}
