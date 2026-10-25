import { emptyGameTags, flattenGameTags, GAME_TAG_KEYS, isValidSnapshot, normalizePlatforms, normalizeTags } from './library.ts';
import type { ExternalId, GameTagGroups, MediaItem, MediaType, ProgressStatus
, CompletionStatus, PlayEngagement } from './types.ts';
import { isImportExcluded } from './importExclusions.ts';

export const STEAM_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const STEAM_IMPORT_MAX_GAMES = 2000;
export interface SteamImportGame {
  title: string; appId?: string; playtimeMinutes?: number;
  category?: MediaType; originalTitle?: string; subcategory?: string; creator?: string; year?: string;
  sourceUrl?: string; externalIds?: ExternalId[]; tags?: string[]; coverUrl?: string;
  platforms?: string[]; gameTags?: GameTagGroups;
}
export interface SteamImportWarning { row: number; reason: string }
export interface SteamImportResult { games: SteamImportGame[]; skipped: SteamImportWarning[] }
export interface SteamImportPreview {
  key: string;
  game: SteamImportGame;
  duplicate: 'existing-id' | 'existing-name' | 'source-id' | 'source-name' | 'excluded' | null;
  matchedTitle?: string;
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value: Record<string, unknown>, key: string): unknown => Object.hasOwn(value, key) ? value[key] : undefined;
const normalizedName = (name: string) => name.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/gu, ' ');

function appId(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim();
  if (!/^\d{1,10}$/.test(text)) return undefined;
  const number = Number(text);
  return Number.isSafeInteger(number) && number > 0 && number <= 4294967295 ? String(number) : undefined;
}
function minutes(value: unknown): number | undefined {
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) value = Number(value);
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
export function steamAppIdFromUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.hostname !== 'store.steampowered.com' || url.username || url.password || url.port) return undefined;
    return appId(/^\/app\/(\d+)(?:\/|$)/.exec(url.pathname)?.[1]);
  } catch { return undefined; }
}
function parseGame(value: unknown): SteamImportGame | string {
  if (!object(value)) return '游戏记录需要是对象';
  const name = own(value, 'name') ?? own(value, 'title');
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) return '名称为空或超过 200 字';
  const rawId = own(value, 'appid') ?? own(value, 'appId');
  const id = rawId === undefined ? undefined : appId(rawId);
  if (rawId !== undefined && !id) return 'Steam AppID 无效';
  const rawMinutes = own(value, 'playtime_forever') ?? own(value, 'playtimeMinutes');
  const duration = rawMinutes === undefined ? undefined : minutes(rawMinutes);
  if (rawMinutes !== undefined && duration === undefined) return '游玩分钟需要为非负整数';
  return { title: name.trim(), ...(id ? { appId: id } : {}), ...(duration !== undefined ? { playtimeMinutes: duration } : {}) };
}

function safeLink(value: string): boolean {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}
function parseManifestWork(value: unknown): SteamImportGame | string {
  if (!object(value)) return '作品记录需要是对象';
  const category = own(value, 'category');
  if (!['game', 'book', 'screen', 'music'].includes(category as string)) return '作品板块无效';
  const title = own(value, 'title');
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200) return '名称为空或超过 200 字';
  const result: SteamImportGame = { title: title.trim(), category: category as MediaType };
  for (const key of ['originalTitle', 'subcategory', 'creator', 'year'] as const) {
    const text = own(value, key);
    if (text === undefined) continue;
    if (typeof text !== 'string' || text.length > (key === 'creator' ? 400 : 200)) return `${key} 格式无效或过长`;
    result[key] = text.trim();
  }
  const rawMinutes = own(value, 'playtimeMinutes');
  if (rawMinutes !== undefined) {
    if (category !== 'game') return '游玩分钟仅适用于游戏';
    const duration = minutes(rawMinutes);
    if (typeof rawMinutes !== 'number' || duration === undefined) return '游玩分钟需要为非负安全整数';
    result.playtimeMinutes = duration;
  }
  const sourceUrl = own(value, 'sourceUrl');
  if (sourceUrl !== undefined) {
    if (typeof sourceUrl !== 'string' || sourceUrl.length > 2048 || !safeLink(sourceUrl)) return '来源链接需要是有效的 HTTP / HTTPS 链接';
    result.sourceUrl = sourceUrl;
  }
  const ids = own(value, 'externalIds');
  if (ids !== undefined) {
    if (!Array.isArray(ids) || ids.length > 10) return '外部作品编号格式无效';
    const references: ExternalId[] = [];
    for (const ref of ids) {
      if (!object(ref)) return '外部作品编号格式无效';
      const provider = own(ref, 'provider'), id = own(ref, 'id'), url = own(ref, 'url');
      if ((provider !== 'steam' && provider !== 'douban') || typeof id !== 'string' || !/^\d{1,20}$/.test(id) || /^0+$/.test(id)) return '外部作品编号格式无效';
      if (provider === 'steam' && (category !== 'game' || !appId(id))) return 'Steam 编号只能用于游戏';
      if (provider === 'douban' && category !== 'book' && category !== 'screen') return '豆瓣编号只能用于书籍或影视';
      if (url !== undefined) {
        if (typeof url !== 'string' || !safeLink(url)) return '外部作品链接无效';
        const parsed = new URL(url);
        if (provider === 'steam' ? steamAppIdFromUrl(url) !== appId(id) : parsed.hostname !== (category === 'book' ? 'book.douban.com' : 'movie.douban.com') || /^\/subject\/(\d+)(?:\/|$)/.exec(parsed.pathname)?.[1] !== id) return '外部作品链接与编号不匹配';
      }
      const normalizedId = provider === 'steam' ? appId(id)! : id;
      if (!references.some(existing => existing.provider === provider && existing.id === normalizedId)) references.push({ provider, id: normalizedId, ...(typeof url === 'string' ? { url } : {}) });
    }
    result.externalIds = references;
  }
  const tags = own(value, 'tags');
  if (tags !== undefined) {
    if (!Array.isArray(tags) || tags.length > 100 || tags.some(tag => typeof tag !== 'string' || tag.length > 80)) return '标签需要为文字数组，最多 100 个';
    result.tags = normalizeTags(tags);
  }
  const platforms = own(value, 'platforms');
  if (platforms !== undefined) {
    if (category !== 'game' || !Array.isArray(platforms) || platforms.length > 30 || platforms.some(platform => typeof platform !== 'string' || !platform.trim() || platform.length > 80)) return '游戏平台需要为有效文字数组';
    result.platforms = normalizePlatforms(platforms);
  }
  const gameTags = own(value, 'gameTags');
  if (gameTags !== undefined) {
    if (category !== 'game' || !object(gameTags)) return '游戏标签分组格式无效';
    const groups = emptyGameTags();
    for (const key of GAME_TAG_KEYS) {
      const values = own(gameTags, key);
      if (!Array.isArray(values) || values.length > 100 || values.some(tag => typeof tag !== 'string' || tag.length > 80)) return '游戏标签需包含玩法、题材、游玩场景、其他四个文字数组';
      groups[key] = normalizeTags(values);
    }
    result.gameTags = groups;
  }
  const cover = own(value, 'coverUrl');
  if (cover !== undefined) {
    if (typeof cover !== 'string' || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(cover)) return '封面需要为本地 JPEG / PNG / WebP 图片数据';
    result.coverUrl = cover;
  }
  return result;
}

/** Only explicit allowlisted fields enter a new item; arbitrary JSON never becomes library data. */
export function parseSteamImport(text: string, category: MediaType = 'game'): SteamImportResult {
  if (new TextEncoder().encode(text).byteLength > STEAM_IMPORT_MAX_BYTES) throw new Error('清单超过 2 MB，请拆分后导入');
  const original = text.replace(/^\uFEFF/, '');
  const input = original.trim();
  if (!input) throw new Error('请粘贴游戏清单，或选择 JSON / TXT 文件');
  const result: SteamImportResult = { games: [], skipped: [] };
  let rows: unknown[];
  let manifest = false;
  const json = /^[\[{]/.test(input);
  if (json) {
    let parsed: unknown;
    try { parsed = JSON.parse(input); } catch { throw new Error('JSON 格式不完整，请检查文件或粘贴内容'); }
    if (object(parsed) && own(parsed, 'schemaVersion') !== undefined) throw new Error('这是完整收藏备份，请到“数据与设置”使用备份导入。批量清单不会替换收藏库');
    manifest = object(parsed) && own(parsed, 'format') === 'qiyu.batch.v1';
    if (object(parsed) && own(parsed, 'format') !== undefined && !manifest) throw new Error('批量清单格式不受支持，请使用 qiyu.batch.v1');
    if (manifest) {
      const works = own(parsed as Record<string, unknown>, 'items');
      if (!Array.isArray(works)) throw new Error('批量清单没有找到 items 数组');
      rows = works;
    } else {
      const response = object(parsed) ? own(parsed, 'response') : undefined;
      const rawGames = Array.isArray(parsed) ? parsed : object(response) ? own(response, 'games') : object(parsed) ? own(parsed, 'games') : undefined;
      if (!Array.isArray(rawGames)) throw new Error('没有找到 games 数组。请提供 GetOwnedGames JSON、qiyu.batch.v1 清单，或每行一个名称');
      rows = rawGames;
    }
  } else {
    rows = original.split(/\r?\n/).map(line => line.trim());
  }
  if ((json ? rows.length : rows.filter(Boolean).length) > STEAM_IMPORT_MAX_GAMES) throw new Error(`一次最多导入 ${STEAM_IMPORT_MAX_GAMES} 件，请拆分清单`);
  rows.forEach((row, index) => {
    if (!json && !row) return;
    let candidate: SteamImportGame | string;
    if (json) candidate = manifest ? parseManifestWork(row) : parseGame(row);
    else {
      const columns = String(row).split(/\t|\s*\|\s*/).map(column => column.trim());
      const [title, source, duration] = columns;
      if (columns.length > 3) candidate = '仅支持名称、Steam 链接、游玩分钟三列';
      else if (steamAppIdFromUrl(title) || /^https?:\/\//i.test(title)) candidate = '请在链接前补上游戏名称';
      else if (category === 'game' && source && !steamAppIdFromUrl(source)) candidate = '第 2 列需要是 Steam 商店游戏链接';
      else if (category === 'game') candidate = parseGame({ title, ...(source ? { appid: steamAppIdFromUrl(source) } : {}), ...(duration ? { playtimeMinutes: duration } : {}) });
      else if (columns.length > 1) candidate = '书籍、影视和音乐文本请每行仅填写一个名称；详细资料可用批量 JSON 清单';
      else candidate = parseManifestWork({ title, category, ...(category === 'screen' ? { subcategory: '电影' } : {}) });
    }
    if (typeof candidate === 'string') result.skipped.push({ row: index + 1, reason: candidate });
    else result.games.push(candidate);
  });
  return result;
}

function sourceIdentity(category: MediaType, value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (category === 'game') {
    const id = steamAppIdFromUrl(value);
    return id ? `game:steam:${id}` : undefined;
  }
  if (category !== 'screen' && category !== 'book') return undefined;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port ||
      url.hostname !== (category === 'book' ? 'book.douban.com' : 'movie.douban.com')) return undefined;
    const id = /^\/subject\/(\d{1,20})(?:\/|$)/.exec(url.pathname)?.[1]?.replace(/^0+/, '');
    return id ? `${category}:douban:${id}` : undefined;
  } catch { return undefined; }
}

/** Names and source identities are collected symmetrically for existing and incoming works. */
function identitiesFor(work: SteamImportGame): string[] {
  const category = work.category ?? 'game';
  const result = new Set<string>();
  const steamId = category === 'game' ? appId(work.appId) : undefined;
  if (steamId) result.add(`game:steam:${steamId}`);
  for (const ref of work.externalIds ?? []) {
    let identity: string | undefined;
    if (ref.provider === 'steam' && category === 'game') {
      const id = appId(ref.id);
      if (id) identity = `game:steam:${id}`;
    } else if (ref.provider === 'douban' && (category === 'book' || category === 'screen') && /^\d{1,20}$/.test(ref.id)) {
      const id = ref.id.replace(/^0+/, '');
      if (id) identity = `${category}:douban:${id}`;
    }
    if (!identity) {
      const fromUrl = sourceIdentity(category, ref.url);
      if (fromUrl?.startsWith(`${category}:${ref.provider}:`)) identity = fromUrl;
    }
    if (identity) result.add(identity);
  }
  const source = sourceIdentity(category, work.sourceUrl);
  if (source) result.add(source);
  return [...result];
}

function namesFor(work: SteamImportGame): string[] {
  const category = work.category ?? 'game';
  return [...new Set([work.title, work.originalTitle].filter((title): title is string => !!title?.trim())
    .map(title => `${category}:${normalizedName(title)}`))];
}

/** An import only adds works; a known identity or same-name work is left completely untouched. */
export function previewSteamImport(games: SteamImportGame[], existing: MediaItem[], exclusions?: readonly ExternalId[]): SteamImportPreview[] {
  const ids = new Map<string, string>();
  const names = new Map<string, { title: string; year: string }[]>();
  for (const item of existing) {
    for (const identity of identitiesFor(item)) ids.set(identity, item.title);
    for (const name of namesFor(item)) {
      names.set(name, [...(names.get(name) ?? []), { title: item.title, year: item.year.trim() }]);
    }
  }
  const seenIds = new Set<string>();
  const seenNames = new Map<string, string[]>();
  return games.map((game, index) => {
    const aliases = namesFor(game);
    const year = game.year?.trim() ?? '';
    const identities = identitiesFor(game);
    const existingId = identities.find(identity => ids.has(identity));
    const existingName = aliases.flatMap(name => names.get(name) ?? []).find(match => !year || !match.year || year === match.year);
    let duplicate: SteamImportPreview['duplicate'] = null;
    let matchedTitle: string | undefined;
    if (isImportExcluded({ ...game, category: game.category ?? 'game' }, exclusions)) duplicate = 'excluded';
    else if (existingId) { duplicate = 'existing-id'; matchedTitle = ids.get(existingId); }
    else if (existingName) { duplicate = 'existing-name'; matchedTitle = existingName.title; }
    else if (identities.some(identity => seenIds.has(identity))) duplicate = 'source-id';
    else if (aliases.some(name => (seenNames.get(name) ?? []).some(seenYear => !year || !seenYear || year === seenYear))) duplicate = 'source-name';
    for (const name of aliases) seenNames.set(name, [...(seenNames.get(name) ?? []), year]);
    identities.forEach(identity => seenIds.add(identity));
    return { key: String(index), game, duplicate, ...(matchedTitle ? { matchedTitle } : {}) };
  });
}

/** No play history, completion state or metadata is guessed from ownership or recorded duration. */
/** v0.4.24：游戏的 initialEngagement 提供时写入 playEngagement，旧轴按关系投影；未提供保持旧行为。 */
export function createSteamImportItems(games: SteamImportGame[], initialStatus: ProgressStatus = 'want', initialEngagement?: PlayEngagement, initialCompletion?: CompletionStatus): MediaItem[] {
  const now = new Date().toISOString();
  const result: MediaItem[] = games.map(game => {
    const category = game.category ?? 'game';
    const defaultSteam = category === 'game' && (game.category === undefined || !!game.appId || game.externalIds?.some(ref => ref.provider === 'steam') || !!steamAppIdFromUrl(game.sourceUrl));
    const platforms = game.platforms ?? (defaultSteam ? ['Steam'] : undefined);
    const groups = game.gameTags ? structuredClone(game.gameTags) : emptyGameTags();
    const classified = new Set(flattenGameTags(groups).map(tag => tag.toLocaleLowerCase()));
    groups.other = normalizeTags([...groups.other, ...(game.tags ?? []).filter(tag => !classified.has(tag.toLocaleLowerCase()))]);
    return {
    id: crypto.randomUUID(), title: game.title, category, subcategory: game.subcategory ?? (defaultSteam ? 'Steam' : ''),
    ...(category === 'game' ? { ...(platforms ? { platforms: [...platforms] } : {}), gamePlayState: initialEngagement === 'playing' ? 'playing' as const : (initialEngagement === 'paused' || initialEngagement === 'inactive') ? 'paused' as const : initialEngagement === 'abandoned' ? 'abandoned' as const : initialEngagement === 'planned' ? 'want' as const : initialStatus === 'finished' ? 'cleared' as const : initialStatus === 'active' ? 'playing' as const : initialStatus === 'paused' ? 'paused' as const : 'want' as const,
      ...(initialEngagement !== undefined ? { playEngagement: initialEngagement } : {}), ...(initialCompletion !== undefined ? { completion: initialCompletion } : {}), gameTags: groups } : {}),
    creator: game.creator ?? '', year: game.year ?? '', status: initialStatus, tags: category === 'game' ? flattenGameTags(groups) : [...(game.tags ?? [])],
    impression: '', favorite: false, artwork: 'default', createdAt: now, updatedAt: now,
    ...(game.originalTitle ? { originalTitle: game.originalTitle } : {}),
    ...(game.coverUrl ? { coverUrl: game.coverUrl } : {}),
    ...(game.externalIds ? { externalIds: game.externalIds.map(ref => ({ ...ref })) } : {}),
    ...(game.sourceUrl ? { sourceUrl: game.sourceUrl } : {}),
    ...(game.playtimeMinutes !== undefined ? { playtimeMinutes: game.playtimeMinutes } : {}),
    ...(game.appId ? { externalIds: [{ provider: 'steam' as const, id: game.appId, url: `https://store.steampowered.com/app/${game.appId}/` }], sourceUrl: `https://store.steampowered.com/app/${game.appId}/` } : {}),
  }; });
  if (!isValidSnapshot({ schemaVersion: 1, items: result })) throw new Error('批量作品资料校验未通过，请检查清单');
  return result;
}
