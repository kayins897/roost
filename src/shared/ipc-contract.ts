// 渲染进程与主进程的唯一 IPC 契约（AGENTS.md 规约 3）。
// desktop/preload.ts 按本接口实现并暴露 window.qiyuDesktop；
// src/infrastructure/repository.ts 按本接口消费；main.ts 的 sendSync 通道返回 DesktopResult。
// 本模块只允许 import domain 类型，不允许任何运行时依赖。
import type { LibrarySnapshot } from '../domain/types.ts';
import type { MetadataCandidate } from '../domain/catalog.ts';
import type { SteamImportGame } from '../domain/steamImport.ts';
import type {
  SteamConnectionState, SteamLibraryRequest, SteamLibraryResult,
  SteamEnrichmentProgress, SteamEnrichmentResult,
} from '../domain/steamConnection.ts';

export interface DesktopResult<T> { ok: boolean; value?: T; error?: string }
export interface StoredRecord { snapshot: LibrarySnapshot | null; revision: string; error?: string }
export type {
  LibrarySnapshot, MetadataCandidate, SteamImportGame,
  SteamConnectionState, SteamLibraryRequest, SteamLibraryResult,
  SteamEnrichmentProgress, SteamEnrichmentResult,
};

export interface DesktopBridge {
  getInfo(): { version: string; dataDirectory: string; windowVisible?: boolean; demo?: boolean };
  onWindowVisibility?(listener: (visible: boolean) => void): () => void;
  loadLibrary(): DesktopResult<StoredRecord>;
  saveLibrary(snapshot: LibrarySnapshot, revision: string, allowRecovery: boolean): DesktopResult<{ revision: string }>;
  openDataDirectory(): void;
  lookupMetadata(query: string): Promise<DesktopResult<MetadataCandidate[]>>;
  getSteamConnection(): Promise<DesktopResult<SteamConnectionState>>;
  forgetSteamConnection(): Promise<DesktopResult<SteamConnectionState>>;
  readSteamLibrary(request: SteamLibraryRequest): Promise<DesktopResult<SteamLibraryResult>>;
  enrichSteamLibrary(games: SteamImportGame[]): Promise<DesktopResult<SteamEnrichmentResult>>;
  cancelSteamRequest(): void;
  onSteamProgress(listener: (value: SteamEnrichmentProgress) => void): () => void;
}

declare global { interface Window { qiyuDesktop?: DesktopBridge } }
