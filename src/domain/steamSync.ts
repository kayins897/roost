import { normalizePlatforms, platformsFor } from './library.ts';
import { createSteamImportItems, parseSteamImport, steamAppIdFromUrl, STEAM_IMPORT_MAX_GAMES } from './steamImport.ts';
import type { SteamImportGame } from './steamImport.ts';
import type { ExternalId, MediaItem } from './types.ts';
import { isImportExcluded } from './importExclusions.ts';

export interface SteamLibraryGame extends SteamImportGame { appId: string }
export interface SteamSyncOptions { updatePlaytime: boolean; exclusions?: readonly ExternalId[] }
export interface SteamSyncRow {
  key: string;
  appId: string;
  game: SteamLibraryGame;
  existingId?: string;
  kind: 'new' | 'update' | 'unchanged' | 'ambiguous' | 'excluded';
  fields: string[];
  retainedHigherMinutes: boolean;
}
export interface SteamSyncResult { items: MediaItem[]; added: number; updated: number; unchanged: number }

const normalizeName = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/gu, ' ');
const canonicalId = (value: string) => typeof value === 'string' && /^\d{1,10}$/.test(value) ? steamAppIdFromUrl(`https://store.steampowered.com/app/${value}/`) : undefined;
const present = (value: string | undefined) => typeof value === 'string' && value.trim().length > 0;

/** Treat API data as input, not as objects which may be copied into personal records. */
function prepareGames(games: readonly SteamLibraryGame[]): SteamLibraryGame[] {
  if (!Array.isArray(games) || games.length > STEAM_IMPORT_MAX_GAMES) throw new Error(`一次最多同步 ${STEAM_IMPORT_MAX_GAMES} 款游戏`);
  const seen = new Set<string>();
  return games.map(game => {
    const appId = typeof game?.appId === 'string' ? canonicalId(game.appId) : undefined;
    if (!appId) throw new Error('Steam 同步资料中的 AppID 无效');
    if (seen.has(appId)) throw new Error(`Steam 同步资料有重复 AppID：${appId}`);
    seen.add(appId);
    if (game.category !== undefined && game.category !== 'game') throw new Error('Steam 同步只能用于游戏');
    // Per-game parsing supports a large library whose local covers exceed 2 MB together.
    const parsed = parseSteamImport(JSON.stringify({ format: 'qiyu.batch.v1', items: [{
      category: 'game', title: game.title,
      ...(game.originalTitle !== undefined ? { originalTitle: game.originalTitle } : {}),
      ...(game.creator !== undefined ? { creator: game.creator } : {}),
      ...(game.year !== undefined ? { year: game.year } : {}),
      ...(game.coverUrl !== undefined ? { coverUrl: game.coverUrl } : {}),
      ...(game.playtimeMinutes !== undefined ? { playtimeMinutes: game.playtimeMinutes } : {}),
    }] }));
    if (parsed.skipped.length || parsed.games.length !== 1) throw new Error(`Steam 游戏 ${appId} 的资料无效：${parsed.skipped[0]?.reason ?? '格式错误'}`);
    return {
      ...parsed.games[0], appId, platforms: ['Steam'],
      sourceUrl: `https://store.steampowered.com/app/${appId}/`,
      externalIds: [{ provider: 'steam', id: appId, url: `https://store.steampowered.com/app/${appId}/` }],
    };
  });
}

function existingSteamIds(item: MediaItem): string[] {
  if (item.category !== 'game') return [];
  const ids = new Set<string>();
  for (const ref of item.externalIds ?? []) {
    const id = ref.provider === 'steam' ? canonicalId(ref.id) : undefined;
    if (id) ids.add(id);
    const fromUrl = ref.provider === 'steam' ? steamAppIdFromUrl(ref.url) : undefined;
    if (fromUrl) ids.add(fromUrl);
  }
  const fromSource = steamAppIdFromUrl(item.sourceUrl);
  if (fromSource) ids.add(fromSource);
  return [...ids];
}

function changesFor(game: SteamLibraryGame, item: MediaItem, options: SteamSyncOptions): { patch: Partial<MediaItem>; retainedHigherMinutes: boolean } {
  const patch: Partial<MediaItem> = {};
  for (const key of ['creator', 'year', 'originalTitle', 'coverUrl'] as const) {
    if (!present(item[key]) && present(game[key])) patch[key] = game[key];
  }
  const platforms = platformsFor(item);
  if (!platforms.some(platform => platform.toLocaleLowerCase() === 'steam')) patch.platforms = normalizePlatforms([...platforms, 'Steam']);
  if (!present(item.subcategory)) patch.subcategory = 'Steam';
  if (!(item.externalIds ?? []).some(ref => ref.provider === 'steam' && canonicalId(ref.id) === game.appId)) {
    patch.externalIds = [...(item.externalIds ?? []).map(ref => ({ ...ref })), { provider: 'steam', id: game.appId, url: `https://store.steampowered.com/app/${game.appId}/` }];
  }
  if (!present(item.sourceUrl)) patch.sourceUrl = `https://store.steampowered.com/app/${game.appId}/`;
  const retainedHigherMinutes = options.updatePlaytime && game.playtimeMinutes !== undefined && item.playtimeMinutes !== undefined && item.playtimeMinutes > game.playtimeMinutes;
  if (options.updatePlaytime && game.playtimeMinutes !== undefined && (item.playtimeMinutes === undefined || item.playtimeMinutes < game.playtimeMinutes)) patch.playtimeMinutes = game.playtimeMinutes;
  return { patch, retainedHigherMinutes };
}

/** No same-name guess establishes identity, ownership, completion or a personal preference. */
export function planSteamSync(games: readonly SteamLibraryGame[], existing: readonly MediaItem[], options: SteamSyncOptions): SteamSyncRow[] {
  const source = prepareGames(games);
  const idIndex = new Map<string, MediaItem[]>();
  const nameIndex = new Set<string>();
  const sourceNameIndex = new Map<string, Set<string>>();
  // Check the whole source before planning any row: two unbound AppIDs may share
  // a localized/original title, so source order must not decide which gets added.
  for (const game of source) {
    for (const name of [game.title, game.originalTitle]) {
      if (!present(name)) continue;
      const normalized = normalizeName(name!);
      const ids = sourceNameIndex.get(normalized) ?? new Set<string>();
      ids.add(game.appId);
      sourceNameIndex.set(normalized, ids);
    }
  }
  for (const item of existing) {
    if (item.category !== 'game') continue;
    for (const id of existingSteamIds(item)) idIndex.set(id, [...(idIndex.get(id) ?? []), item]);
    for (const name of [item.title, item.originalTitle]) if (present(name)) nameIndex.add(normalizeName(name!));
  }
  return source.map(game => {
    const base = { key: game.appId, appId: game.appId, game, fields: [] as string[], retainedHigherMinutes: false };
    const matches = idIndex.get(game.appId) ?? [];
    if (isImportExcluded({ ...game, category: 'game' }, options.exclusions) || matches.some(item => !!item.removedAt)) return { ...base, kind: 'excluded' };
    if (matches.length > 1 || (matches.length === 1 && existingSteamIds(matches[0]).length > 1)) return { ...base, kind: 'ambiguous' };
    if (matches.length === 0) {
      if ([game.title, game.originalTitle].some(name => present(name) && (
        nameIndex.has(normalizeName(name!)) || (sourceNameIndex.get(normalizeName(name!))?.size ?? 0) > 1
      ))) return { ...base, kind: 'ambiguous' };
      return { ...base, kind: 'new' };
    }
    const item = matches[0];
    const { patch, retainedHigherMinutes } = changesFor(game, item, options);
    const fields = Object.keys(patch);
    return { ...base, existingId: item.id, kind: fields.length ? 'update' : 'unchanged', fields, retainedHigherMinutes };
  });
}

/** Append and fill missing metadata; preserve record order, personal fields and unknown fields. */
export function applySteamSync(games: readonly SteamLibraryGame[], existing: readonly MediaItem[], selectedAppIds: ReadonlySet<string> | readonly string[], options: SteamSyncOptions): SteamSyncResult {
  const rows = planSteamSync(games, existing, options);
  const knownIds = new Set(rows.map(row => row.appId));
  const selected = new Set<string>();
  for (const rawId of selectedAppIds) {
    const id = typeof rawId === 'string' ? canonicalId(rawId) : undefined;
    if (!id || !knownIds.has(id)) throw new Error('所选游戏已不在本次读取结果中，请重新读取');
    selected.add(id);
  }
  const updates = new Map<string, Partial<MediaItem>>();
  const additions: SteamLibraryGame[] = [];
  let unchanged = 0;
  for (const row of rows) {
    if (!selected.has(row.appId)) continue;
    if (row.kind === 'new') additions.push(row.game);
    else if (row.kind === 'update') {
      const item = existing.find(candidate => candidate.id === row.existingId)!;
      updates.set(item.id, changesFor(row.game, item, options).patch);
    } else unchanged++;
  }
  const now = new Date().toISOString();
  const items = existing.map(item => {
    const patch = updates.get(item.id);
    return patch ? { ...item, ...patch, updatedAt: now } : item;
  });
  return { items: [...items, ...createSteamImportItems(additions)], added: additions.length, updated: updates.size, unchanged };
}
