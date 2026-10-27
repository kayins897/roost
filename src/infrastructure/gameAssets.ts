import type { GameScreenshot, LibrarySnapshot } from '../domain/types.ts';
import { desktopBridge } from './repository.ts';
export const desktopGameAssetsAvailable = Boolean(desktopBridge?.importScreenshots);
export function screenshotUrl(image: GameScreenshot, thumbnail = false): string { return `qiyu://app/_images/${image.assetId}/${thumbnail ? 'thumb' : 'original'}`; }
export async function importScreenshots(): Promise<GameScreenshot[]> {
  if (!desktopBridge?.importScreenshots) throw new Error('请在桌面版中导入截图');
  const result = await desktopBridge.importScreenshots();
  if (!result.ok || !result.value) throw new Error(result.error ?? '截图未能导入');
  return result.value;
}
export async function exportFullBackup(snapshot: LibrarySnapshot): Promise<boolean> {
  if (!desktopBridge?.exportFullBackup) throw new Error('请在桌面版中导出完整备份');
  const result = await desktopBridge.exportFullBackup(snapshot);
  if (!result.ok || !result.value) throw new Error(result.error ?? '备份未能导出');
  return result.value.saved;
}
export async function chooseFullBackup() {
  if (!desktopBridge?.chooseFullBackup) throw new Error('请在桌面版中恢复完整备份');
  const result = await desktopBridge.chooseFullBackup();
  if (!result.ok) throw new Error(result.error ?? '备份无法读取');
  return result.value ?? null;
}
export async function installBackupAssets(token: string) {
  const result = await desktopBridge?.installBackupAssets(token);
  if (!result?.ok) throw new Error(result?.error ?? '截图无法恢复');
}
export function discardBackup(token: string) { desktopBridge?.discardBackup(token); }
