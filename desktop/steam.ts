import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SteamImportGame } from '../src/domain/steamImport.ts';
import type { SteamConnectionState, SteamEnrichmentProgress, SteamEnrichmentResult, SteamLibraryResult } from '../src/domain/steamConnection.ts';
import { parseSteamDetails } from './metadata.ts';

const MAX_GAMES = 2000;
const API_HOST = 'api.steampowered.com';
const COVER_HOSTS = new Set(['shared.fastly.steamstatic.com', 'shared.akamai.steamstatic.com', 'shared.cloudflare.steamstatic.com', 'cdn.akamai.steamstatic.com', 'cdn.cloudflare.steamstatic.com', 'steamcdn-a.akamaihd.net']);
const obj = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const uint = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const cleanName = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 200 ? value.trim() : undefined;
function appId(value: unknown): string {
  const id = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
  if (!/^\d{1,10}$/.test(id) || Number(id) <= 0 || Number(id) > 4294967295) throw new Error('Steam 返回了无效的游戏编号');
  return String(Number(id));
}

/** Only documented identifiers; never treat arbitrary text as a URL to fetch. */
export function parseSteamProfile(value: unknown): { steamId?: string; vanity?: string } {
  if (typeof value !== 'string' || value.trim().length > 300) throw new Error('请填写 SteamID64 或 Steam 主页链接');
  const profile = value.trim();
  if (/^7656119\d{10}$/.test(profile)) return { steamId: profile };
  let url: URL;
  try { url = new URL(profile); } catch { throw new Error('请填写17位 SteamID64 或完整 Steam 主页链接'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.hostname !== 'steamcommunity.com' || url.username || url.password || url.port) throw new Error('请使用 steamcommunity.com 的个人主页链接');
  const match = /^\/(profiles|id)\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
  if (match?.[1] === 'profiles' && /^7656119\d{10}$/.test(match[2])) return { steamId: match[2] };
  if (match?.[1] === 'id' && match[2].length <= 100) return { vanity: match[2] };
  throw new Error('请填写个人主页链接，而不是游戏商店或库存页链接');
}
export function validateSteamApiKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Fa-f0-9]{32}$/.test(value.trim())) throw new Error('Steam Web API Key 应为32位十六进制字符，请在本机填写');
  return value.trim();
}

interface CryptoStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}
/** The key never enters a library, renderer read-back, export, or diagnostic. */
export class SteamConnectionStore {
  private current: { profile: string; key: string; remembered: boolean } | undefined;
  private readonly file: string;
  private readonly encryption: CryptoStorage;
  constructor(directory: string, encryption: CryptoStorage) { this.file = path.join(directory, 'steam-connection.json'); this.encryption = encryption; }
  private load() {
    if (this.current) return;
    if (!fs.existsSync(this.file)) { this.current = { profile: '', key: '', remembered: false }; return; }
    try {
      if (fs.statSync(this.file).size > 16384) throw new Error();
      const value = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!obj(value) || value.version !== 1 || typeof value.profile !== 'string' || typeof value.encryptedKey !== 'string' || !this.encryption.isEncryptionAvailable()) throw new Error();
      parseSteamProfile(value.profile);
      const key = validateSteamApiKey(this.encryption.decryptString(Buffer.from(value.encryptedKey, 'base64')));
      this.current = { profile: value.profile, key, remembered: true };
    } catch { throw new Error('Steam 本机连接设置无法读取，请清除连接设置后重新填写；收藏库不受影响'); }
  }
  state(): SteamConnectionState {
    this.load();
    return { profile: this.current!.profile, hasApiKey: !!this.current!.key, remembered: this.current!.remembered, canRemember: this.encryption.isEncryptionAvailable() };
  }
  key(): string { this.load(); return this.current!.key; }
  save(profile: string, apiKey: string, remember: boolean) {
    parseSteamProfile(profile);
    const key = validateSteamApiKey(apiKey);
    if (remember && !this.encryption.isEncryptionAvailable()) throw new Error('系统安全存储不可用，请取消“在本机记住密钥”后重试');
    try {
      if (remember) {
        const raw = JSON.stringify({ version: 1, profile, encryptedKey: this.encryption.encryptString(key).toString('base64') });
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const temporary = path.join(path.dirname(this.file), `.steam-${randomUUID()}.tmp`);
        try { fs.writeFileSync(temporary, raw, { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, this.file); }
        finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
      } else if (fs.existsSync(this.file)) fs.unlinkSync(this.file);
    } catch { throw new Error('Steam 连接设置保存失败，请稍后重试；收藏没有改变'); }
    this.current = { profile, key, remembered: remember };
  }
  forget() {
    if (fs.existsSync(this.file)) fs.unlinkSync(this.file);
    this.current = { profile: '', key: '', remembered: false };
    return this.state();
  }
}

export interface SteamNetworkOptions {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  imageToDataUrl?: (bytes: Uint8Array) => string | undefined;
  onProgress?: (value: SteamEnrichmentProgress) => void;
}
class SteamHttpError extends Error {
  readonly status: number;
  constructor(status: number) { super(`Steam 来源暂时无法访问（HTTP ${status}）`); this.status = status; }
}
function trustedUrl(value: string, kind: 'api' | 'details' | 'cover'): URL {
  const url = new URL(value);
  const allowed = kind === 'api' ? url.hostname === API_HOST && ['/IPlayerService/GetOwnedGames/v1/', '/ISteamUser/ResolveVanityURL/v1/'].includes(url.pathname)
    : kind === 'details' ? url.hostname === 'store.steampowered.com' && url.pathname === '/api/appdetails'
      : COVER_HOSTS.has(url.hostname);
  if (!allowed || url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Steam 返回了不受支持的来源');
  return url;
}
async function request(urlString: string, kind: 'api' | 'details' | 'cover', options: SteamNetworkOptions): Promise<{ bytes: Uint8Array; type: string }> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(cancel, options.timeoutMs ?? 15000);
  const limit = kind === 'api' ? 4 * 1024 * 1024 : 2 * 1024 * 1024;
  try {
    let url = trustedUrl(urlString, kind);
    for (let hops = 0; hops < 4; hops++) {
      const response = await (options.fetch ?? globalThis.fetch)(url.toString(), { redirect: 'manual', credentials: 'omit', signal: controller.signal, headers: { Accept: kind === 'cover' ? 'image/jpeg,image/png,image/webp' : 'application/json' } });
      if (response.status >= 300 && response.status < 400) {
        const destination = response.headers.get('location'); await response.body?.cancel();
        // An API request carries the key. Never forward it through any redirect.
        if (kind === 'api' || !destination || hops === 3) throw new Error('Steam 接口发生不受支持的跳转，请稍后重试');
        url = trustedUrl(new URL(destination, url).toString(), kind); continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new SteamHttpError(response.status); }
      if (Number(response.headers.get('content-length')) > limit || !response.body) { await response.body?.cancel(); throw new Error('Steam 返回内容过大或为空'); }
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.length; if (size > limit) throw new Error('Steam 返回内容过大'); chunks.push(value);
        }
      } catch (error) { await reader.cancel(); throw error; }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return { bytes, type: response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '' };
    }
    throw new Error('Steam 来源跳转过多');
  } catch (error) {
    if (options.signal?.aborted) throw new Error('已取消 Steam 读取');
    if (controller.signal.aborted) throw new Error('连接 Steam 超时，请检查网络或稍后重试');
    if (error instanceof SteamHttpError) throw error;
    // Never expose fetch errors: their message/cause can contain the key-bearing URL.
    const safeMessages = ['Steam 返回了不受支持的来源', 'Steam 接口发生不受支持的跳转，请稍后重试', 'Steam 返回内容过大或为空', 'Steam 返回内容过大', 'Steam 来源跳转过多'];
    if (error instanceof Error && safeMessages.includes(error.message)) throw error;
    throw new Error('无法连接 Steam，请检查系统网络设置后重试');
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); }
}
async function jsonRequest(url: string, kind: 'api' | 'details', options: SteamNetworkOptions): Promise<unknown> {
  const response = await request(url, kind, options);
  if (!['application/json', 'text/json'].includes(response.type)) throw new Error('Steam 未返回可识别的 JSON 资料');
  try { return JSON.parse(new TextDecoder().decode(response.bytes)); } catch { throw new Error('Steam 返回的资料无法解析'); }
}
function apiUrl(endpoint: string, key: string, parameters: Record<string, unknown>): string {
  const url = new URL(`https://${API_HOST}/${endpoint}/v1/`);
  url.search = new URLSearchParams({ key, input_json: JSON.stringify(parameters) }).toString();
  return url.toString();
}
export function parseOwnedSteamGames(value: unknown): { reportedCount: number; games: SteamImportGame[] } {
  const response = obj(value) && obj(value.response) ? value.response : undefined;
  if (!response || !uint(response.game_count)) throw new Error('Steam 未返回库存。请检查游戏详情可见性以及 API Key 是否有效；本次不会更改收藏');
  const count = response.game_count;
  if (count > MAX_GAMES) throw new Error('Steam 库超过本次支持的2000款上限，已停止读取，没有截断导入');
  const entries = response.games ?? (count === 0 ? [] : undefined);
  if (!Array.isArray(entries) || entries.length !== count) throw new Error('Steam 库存数量与返回清单不一致，已停止本次读取');
  const ids = new Set<string>();
  const games = entries.map((entry): SteamImportGame => {
    if (!obj(entry)) throw new Error('Steam 游戏记录格式不正确');
    const id = appId(entry.appid); const title = cleanName(entry.name);
    if (!title || !uint(entry.playtime_forever) || ids.has(id)) throw new Error('Steam 返回了缺少名称、无效时长或重复的游戏记录，已停止本次读取');
    ids.add(id);
    const sourceUrl = `https://store.steampowered.com/app/${id}/`;
    return { appId: id, title, category: 'game', playtimeMinutes: entry.playtime_forever, platforms: ['Steam'], sourceUrl, externalIds: [{ provider: 'steam', id, url: sourceUrl }] };
  });
  return { reportedCount: count, games };
}
export async function readSteamLibrary(requestValue: unknown, keyValue: string, options: SteamNetworkOptions = {}): Promise<SteamLibraryResult> {
  if (!obj(requestValue) || typeof requestValue.profile !== 'string' || typeof requestValue.includePlayedFreeGames !== 'boolean') throw new Error('Steam 读取请求无效');
  const key = validateSteamApiKey(keyValue);
  const parsed = parseSteamProfile(requestValue.profile); let steamId = parsed.steamId;
  try {
    if (!steamId) {
      const resolved = await jsonRequest(apiUrl('ISteamUser/ResolveVanityURL', key, { vanityurl: parsed.vanity }), 'api', options);
      const response = obj(resolved) && obj(resolved.response) ? resolved.response : undefined;
      if (response?.success !== 1 || typeof response.steamid !== 'string' || !/^7656119\d{10}$/.test(response.steamid)) throw new Error('没有找到这个 Steam 自定义主页，请检查链接或改用 SteamID64');
      steamId = response.steamid;
    }
    const result = parseOwnedSteamGames(await jsonRequest(apiUrl('IPlayerService/GetOwnedGames', key, { steamid: steamId, include_appinfo: true, include_played_free_games: requestValue.includePlayedFreeGames }), 'api', options));
    return { ...result, steamId, fetchedAt: new Date().toISOString(), includePlayedFreeGames: requestValue.includePlayedFreeGames };
  } catch (error) {
    if (error instanceof SteamHttpError && [401, 403].includes(error.status)) throw new Error('Steam 拒绝了读取，请检查 API Key 和游戏详情可见性；收藏没有改变');
    if (error instanceof SteamHttpError && error.status === 429) throw new Error('Steam 请求次数过多，请稍后再试');
    throw error;
  }
}

function imageMime(bytes: Uint8Array): string | undefined {
  if (bytes.length > 8 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v)) return 'image/png';
  if (bytes.length >= 16 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return undefined;
}
/** Renderer input is reduced to an allowlist, never treated as a network destination. */
export function validateSteamEnrichment(value: unknown): SteamImportGame[] {
  if (!Array.isArray(value) || value.length > MAX_GAMES) throw new Error('补充资料每批最多2000款游戏');
  const seen = new Set<string>();
  return value.map(row => {
    if (!obj(row)) throw new Error('补充资料请求格式无效');
    const id = appId(row.appId), title = cleanName(row.title);
    if (!title || seen.has(id)) throw new Error('补充资料清单缺少名称或存在重复编号'); seen.add(id);
    if (row.playtimeMinutes !== undefined && !uint(row.playtimeMinutes)) throw new Error('游戏分钟数无效');
    const sourceUrl = `https://store.steampowered.com/app/${id}/`;
    const game: SteamImportGame = { appId: id, title, category: 'game', sourceUrl, externalIds: [{ provider: 'steam', id, url: sourceUrl }], platforms: ['Steam'] };
    if (row.playtimeMinutes !== undefined) game.playtimeMinutes = row.playtimeMinutes as number;
    for (const field of ['originalTitle', 'creator', 'year'] as const) if (typeof row[field] === 'string' && row[field].length <= (field === 'creator' ? 400 : 200)) game[field] = row[field];
    if (typeof row.coverUrl === 'string' && row.coverUrl.length < 300000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(row.coverUrl)) game.coverUrl = row.coverUrl;
    return game;
  });
}
export async function enrichSteamLibrary(value: unknown, options: SteamNetworkOptions = {}): Promise<SteamEnrichmentResult> {
  const games = validateSteamEnrichment(value); let cursor = 0, completed = 0, detailsRateLimited = false, coversRateLimited = false;
  async function worker() {
    while (!options.signal?.aborted && cursor < games.length) {
      const index = cursor++; const game = games[index]; let fallbackCover: string | undefined;
      if ((!game.creator || !game.year) && !detailsRateLimited) {
        try {
          const url = `https://store.steampowered.com/api/appdetails?appids=${game.appId}&l=schinese`;
          const details = parseSteamDetails(await jsonRequest(url, 'details', options), game.appId!);
          if (!game.creator) game.creator = details.creator;
          if (!game.year) game.year = details.year;
          if (!game.originalTitle && details.title !== game.title) game.originalTitle = details.title;
          fallbackCover = details.coverSourceUrl;
        } catch (error) { if (error instanceof SteamHttpError && [401, 403, 429].includes(error.status)) detailsRateLimited = true; }
      }
      if (!game.coverUrl && !options.signal?.aborted && !coversRateLimited) {
        const sources = [`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${game.appId}/library_600x900.jpg`, `https://shared.fastly.steamstatic.com/steam/apps/${game.appId}/library_600x900.jpg`, ...(fallbackCover ? [fallbackCover] : [])];
        for (const source of sources) {
          if (options.signal?.aborted) break;
          try {
            const { bytes, type } = await request(source, 'cover', options);
            const mime = imageMime(bytes); if (!mime || mime !== type) continue;
            const cover = options.imageToDataUrl?.(bytes);
            if (cover && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(cover)) { game.coverUrl = cover; break; }
          } catch (error) { if (error instanceof SteamHttpError && [401, 403, 429].includes(error.status)) { coversRateLimited = true; break; } }
        }
      }
      completed++;
      options.onProgress?.({ completed, total: games.length, title: game.title });
    }
  }
  await Promise.all([worker(), worker()]);
  return { games, missingCovers: games.filter(row => !row.coverUrl).length, missingDetails: games.filter(row => !row.creator || !row.year).length, cancelled: options.signal?.aborted === true, detailsRateLimited: detailsRateLimited || coversRateLimited };
}
