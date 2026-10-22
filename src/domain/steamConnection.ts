import type { SteamImportGame } from './steamImport.ts';

export interface SteamConnectionState {
  profile: string;
  hasApiKey: boolean;
  remembered: boolean;
  canRemember: boolean;
}
export interface SteamLibraryRequest {
  profile: string;
  apiKey?: string;
  rememberKey: boolean;
  includePlayedFreeGames: boolean;
}
export interface SteamLibraryResult {
  steamId: string;
  fetchedAt: string;
  reportedCount: number;
  includePlayedFreeGames: boolean;
  games: SteamImportGame[];
}
export interface SteamEnrichmentProgress { completed: number; total: number; title: string }
export interface SteamEnrichmentResult {
  games: SteamImportGame[];
  missingCovers: number;
  missingDetails: number;
  cancelled: boolean;
  detailsRateLimited: boolean;
}
