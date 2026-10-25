import { ipcMain, type BrowserWindow, type IpcMainEvent } from 'electron';
import type { WindowCommand, WindowState } from '../src/shared/ipc-contract.ts';

export function stateFor(window: BrowserWindow): WindowState {
  return { maximized: window.isMaximized(), minimized: window.isMinimized(), fullscreen: window.isFullScreen(), focused: window.isFocused() };
}

export function registerWindowControls(getWindow: () => BrowserWindow | null, trusted: (event: IpcMainEvent) => boolean) {
  ipcMain.on('qiyu:window-state', event => {
    const window = getWindow();
    event.returnValue = trusted(event) && window && !window.isDestroyed()
      ? { ok: true, value: stateFor(window) } : { ok: false, error: '窗口不可用' };
  });
  ipcMain.on('qiyu:window-command', (event, command: WindowCommand) => {
    const window = getWindow();
    if (!trusted(event) || !window || window.isDestroyed()) return;
    if (command === 'minimize') window.minimize();
    else if (command === 'toggle-maximize') { if (window.isMaximized()) window.unmaximize(); else window.maximize(); }
    else if (command === 'close') window.close(); // Normal close honors beforeunload, unlike destroy().
  });
}

export function observeWindowControls(window: BrowserWindow) {
  const publish = () => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('qiyu:window-state-changed', stateFor(window));
  };
  window.on('maximize', publish); window.on('unmaximize', publish);
  window.on('minimize', publish); window.on('restore', publish);
  window.on('focus', publish); window.on('blur', publish);
  window.on('enter-full-screen', publish); window.on('leave-full-screen', publish);
  window.webContents.on('did-finish-load', publish);
}
