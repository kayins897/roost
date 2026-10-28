import type { MetadataCandidate } from '../src/domain/catalog.ts';
import type { ScreenDetails } from '../src/domain/types.ts';
import { isPersonalScore } from '../src/domain/gameAssets.ts';

/** Public store/page requests only. No account credentials or library data are sent. */
export interface MetadataOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  imageToDataUrl?: (bytes: Uint8Array) => string | undefined;
}
type FetchKind = 'steam' | 'douban' | 'cover';
const TEXT_LIMIT = 2 * 1024 * 1024;
const COVER_LIMIT = 2 * 1024 * 1024;
const COVER_HOSTS = new Set([
  'shared.akamai.steamstatic.com', 'shared.fastly.steamstatic.com',
  'shared.cloudflare.steamstatic.com', 'cdn.akamai.steamstatic.com',
  'cdn.cloudflare.steamstatic.com', 'steamcdn-a.akamaihd.net',
  'store.akamai.steamstatic.com',
  'img1.doubanio.com', 'img2.doubanio.com', 'img3.doubanio.com', 'img9.doubanio.com',
]);
const BLOCKED = '来源网站要求验证或限制了访问，请稍后再试，或使用手动收录。';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function string(value: unknown, max = 300): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.replace(/\s+/g, ' ').trim().slice(0, max) || undefined;
}
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(v => string(v)).filter((v): v is string => Boolean(v)).slice(0, 12) : [];
}
function year(value: unknown): string | undefined { return string(value)?.match(/(?:18|19|20|21)\d{2}/)?.[0]; }
function allowedUrl(value: string, kind: FetchKind): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('来源链接无效'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('仅支持受信来源的 HTTPS 链接');
  const valid = kind === 'steam'
    ? url.hostname === 'store.steampowered.com' && ['/api/storesearch/', '/api/appdetails'].includes(url.pathname)
    : kind === 'douban'
      ? ['book.douban.com', 'movie.douban.com'].includes(url.hostname) && /^\/subject\/\d+\/$/.test(url.pathname)
      : COVER_HOSTS.has(url.hostname);
  if (!valid) throw new Error(kind === 'douban' ? BLOCKED : '来源返回了不受支持的链接');
  return url;
}

async function request(value: string, kind: FetchKind, options: MetadataOptions): Promise<{ bytes: Uint8Array; contentType: string }> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), options.timeoutMs ?? 12000);
  const limit = kind === 'cover' ? COVER_LIMIT : TEXT_LIMIT;
  try {
    let url = allowedUrl(value, kind);
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await (options.fetch ?? globalThis.fetch)(url.toString(), {
        signal: abort.signal, redirect: 'manual', credentials: 'omit',
        headers: { Accept: kind === 'cover' ? 'image/jpeg,image/png,image/webp' : kind === 'steam' ? 'application/json' : 'text/html' },
      });
      if (response.status >= 300 && response.status < 400) {
        const destination = response.headers.get('location');
        await response.body?.cancel();
        if (!destination || redirects === 3) throw new Error('来源页面跳转过多，请使用作品的直接链接');
        url = allowedUrl(new URL(destination, url).toString(), kind);
        continue;
      }
      if ([401, 403, 418, 429].includes(response.status)) { await response.body?.cancel(); throw new Error(BLOCKED); }
      if (!response.ok) { await response.body?.cancel(); throw new Error(`来源暂时无法访问（HTTP ${response.status}），请稍后重试或手动收录。`); }
      if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('来源内容过大，已停止读取'); }
      if (!response.body) throw new Error('来源返回了空内容');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const { value: chunk, done } = await reader.read();
          if (done) break;
          total += chunk.byteLength;
          if (total > limit) throw new Error('来源内容过大，已停止读取');
          chunks.push(chunk);
        }
      } catch (error) { await reader.cancel(); throw error; }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return { bytes, contentType: response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '' };
    }
    throw new Error('来源页面跳转过多');
  } catch (error) {
    if (abort.signal.aborted) throw new Error('连接来源超时，请检查网络后重试，也可以手动收录。');
    if (error instanceof TypeError) throw new Error('无法连接来源，请检查网络后重试，也可以手动收录。');
    throw error;
  } finally { clearTimeout(timer); }
}
async function textRequest(url: string, kind: 'steam' | 'douban', options: MetadataOptions): Promise<string> {
  const response = await request(url, kind, options);
  if (kind === 'steam' && !['application/json', 'text/json'].includes(response.contentType)) throw new Error('Steam 返回了无法识别的资料，请稍后再试');
  if (kind === 'douban' && !['text/html', 'application/xhtml+xml'].includes(response.contentType)) throw new Error(BLOCKED);
  return new TextDecoder().decode(response.bytes);
}
function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { throw new Error('来源返回了无法识别的资料，请稍后再试'); }
}
function coverMime(bytes: Uint8Array): string | undefined {
  if (bytes.length > 8 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return 'image/png';
  if (bytes.length >= 16 && new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return undefined;
}
async function withCover(candidate: MetadataCandidate, options: MetadataOptions): Promise<MetadataCandidate> {
  if (!candidate.coverSourceUrl) return candidate;
  try {
    const { bytes, contentType } = await request(candidate.coverSourceUrl, 'cover', options);
    const mime = coverMime(bytes);
    if (!mime || mime !== contentType) return candidate;
    const coverUrl = options.imageToDataUrl ? options.imageToDataUrl(bytes) : `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
    if (!coverUrl || !/^data:image\/(?:jpeg|png|webp);base64,/.test(coverUrl)) return candidate;
    return { ...candidate, coverUrl };
  } catch { return candidate; } // Metadata remains useful when a cover is unavailable.
}
function coverSource(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try { return allowedUrl(value, 'cover').toString(); } catch { return undefined; }
}

/** Search results deliberately do not download eight covers or request eight app pages. */
export function parseSteamSearch(value: unknown): MetadataCandidate[] {
  const data = record(value);
  if (!data || !Array.isArray(data.items)) throw new Error('Steam 返回了无法识别的搜索结果');
  return data.items.flatMap(item => {
    const row = record(item);
    const title = string(row?.name, 160);
    const id = row?.id;
    if (!row || row.type !== 'app' || !Number.isSafeInteger(id) || Number(id) <= 0 || !title) return [];
    return [{ provider: 'steam' as const, externalId: String(id), category: 'game' as const, title,
      platforms: ['Steam'], sourceUrl: `https://store.steampowered.com/app/${id}/`, coverSourceUrl: coverSource(row.tiny_image) }];
  }).slice(0, 8);
}
export function parseSteamDetails(value: unknown, id: string): MetadataCandidate {
  const item = record(record(value)?.[id]);
  const data = record(item?.data);
  const title = string(data?.name, 160);
  if (item?.success !== true || !data || !title) throw new Error('Steam 未提供该作品资料，可能受地区限制或已经下架，可继续手动收录。');
  if (data.steam_appid !== undefined && String(data.steam_appid) !== id) throw new Error('Steam 返回的资料与所选游戏编号不一致，已停止应用，避免混入其他版本的信息。');
  if (typeof data.type === 'string' && !['game', 'dlc', 'demo'].includes(data.type)) throw new Error('所选 Steam 条目不是游戏、游戏扩展或试玩版，请选择游戏，或在相应板块手动收录。');
  return { provider: 'steam', externalId: id, category: 'game', title,
    creator: stringList(data.developers).join(' / ') || undefined,
    year: year(record(data.release_date)?.date),
    platforms: ['Steam'], sourceUrl: `https://store.steampowered.com/app/${id}/`,
    coverSourceUrl: coverSource(data.header_image),
  };
}
function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (whole, entity: string) => {
    if (!entity.startsWith('#')) return named[entity.toLowerCase()] ?? whole;
    const code = entity.toLowerCase().startsWith('#x') ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}
function cleanText(html: string): string { return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function attributes(tag: string): Record<string, string> {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(match => [match[1].toLowerCase(), decodeEntities(match[2] ?? match[3])]));
}
function names(value: unknown): string | undefined {
  const rows = Array.isArray(value) ? value : [value];
  return rows.map(row => string(record(row)?.name ?? row)).filter(Boolean).join(' / ') || undefined;
}
function screenDetails(schema: Record<string, unknown> | undefined, fields: Map<string, string>, html: string, description: string | undefined): ScreenDetails {
  const split = (value: string | undefined) => value?.split(/\s*\/\s*/).map(part => part.trim()).filter(Boolean);
  const actorNames = names(schema?.actor) ?? fields.get('主演');
  const origin = names(schema?.countryOfOrigin) ?? fields.get('制片国家/地区');
  const rawDuration = typeof schema?.duration === 'string' ? schema.duration : undefined;
  const iso = rawDuration && /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(rawDuration);
  const runtime = fields.get('单集片长') ?? fields.get('片长');
  const duration = iso && (iso[1] || iso[2]) ? Number(iso[1] ?? 0) * 60 + Number(iso[2] ?? 0) : runtime?.match(/^(\d+)\s*分钟(?:\s|$|\/)/)?.[1];
  const episodes = schema?.numberOfEpisodes ?? fields.get('集数');
  const episodeCount = typeof episodes === 'number' ? episodes : typeof episodes === 'string' && /^\d+$/.test(episodes.trim()) ? Number(episodes) : undefined;
  const rawRating = record(schema?.aggregateRating)?.ratingValue ?? html.match(/<(?:strong|span)\b[^>]*property=["']v:average["'][^>]*>([\s\S]*?)<\/(?:strong|span)>/i)?.[1];
  const score = typeof rawRating === 'number' ? rawRating : typeof rawRating === 'string' && rawRating.trim() ? Number(cleanText(rawRating)) : undefined;
  const synopsis = string(typeof schema?.description === 'string' ? cleanText(schema.description) : cleanText(html.match(/<span\b[^>]*property=["']v:summary["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? description ?? ''), 10000);
  return {
    ...(actorNames ? { actors: split(actorNames) } : {}), ...(origin ? { regions: split(origin) } : {}),
    ...(duration !== undefined && Number.isSafeInteger(Number(duration)) && Number(duration) >= 0 ? { durationMinutes: Number(duration) } : {}),
    ...(episodeCount !== undefined && Number.isSafeInteger(episodeCount) && episodeCount >= 0 ? { episodeCount } : {}),
    ...(isPersonalScore(score) ? { doubanScore: score } : {}), ...(synopsis ? { description: synopsis } : {}), metadataSource: '豆瓣',
  };
}
export function parseDoubanPage(html: string, sourceUrl: string): MetadataCandidate {
  const url = allowedUrl(sourceUrl, 'douban');
  const category = url.hostname === 'book.douban.com' ? 'book' : 'screen';
  const metas = new Map<string, string[]>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = attributes(tag);
    const key = attrs.property ?? attrs.name;
    if (key && attrs.content) metas.set(key, [...(metas.get(key) ?? []), attrs.content]);
  }
  const meta = (key: string) => metas.get(key)?.[0];
  let schema: Record<string, unknown> | undefined;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (attributes(match[1]).type !== 'application/ld+json') continue;
    try {
      const value: unknown = JSON.parse(match[2]);
      const roots = Array.isArray(value) ? value : [value];
      const candidates = roots.flatMap(root => Array.isArray(record(root)?.['@graph']) ? record(root)!['@graph'] as unknown[] : [root]);
      schema = candidates.map(record).find(row => row && ['Book', 'Movie', 'TVSeries', 'CreativeWork'].includes(String(row['@type'])));
      if (schema) break;
    } catch { /* A malformed optional JSON-LD block must not hide valid page metadata. */ }
  }
  const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '';
  const headingTitle = heading.match(/<span\b[^>]*property=["']v:itemreviewed["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
  const title = string(meta('og:title') ?? schema?.name ?? (headingTitle ? cleanText(headingTitle) : cleanText(heading)), 160);
  if (!title || !heading || /captcha|检测到有异常请求|访问豆瓣的方式有点异常|安全验证|请求过于频繁/i.test(cleanText(heading))) throw new Error(BLOCKED);
  const info = html.match(/<div\b[^>]*id=["']info["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? '';
  const fields = new Map<string, string>();
  for (const line of info.split(/<br\s*\/?>/i)) {
    const text = cleanText(line);
    const colon = text.search(/[:：]/);
    if (colon >= 0) fields.set(text.slice(0, colon).trim(), text.slice(colon + 1).trim());
  }
  const ogType = meta('og:type') ?? String(schema?.['@type'] ?? '');
  const series = /tv|series/i.test(ogType) || fields.has('集数');
  const animated = (metas.get('video:tag') ?? []).includes('动画') || (fields.get('类型') ?? '').includes('动画');
  const image = Array.isArray(schema?.image) ? schema.image[0] : record(schema?.image)?.url ?? schema?.image;
  return { provider: 'douban', externalId: url.pathname.split('/')[2], category, title,
    originalTitle: string(fields.get('原作名') ?? meta('video:original_title') ?? (headingTitle && cleanText(headingTitle).startsWith(title + ' ') ? cleanText(headingTitle).slice(title.length).trim() : undefined)),
    creator: string(category === 'book' ? metas.get('book:author')?.join(' / ') ?? names(schema?.author) ?? fields.get('作者') : names(schema?.director) ?? fields.get('导演')),
    year: year(category === 'book' ? fields.get('出版年') ?? schema?.datePublished : meta('video:release_date') ?? schema?.datePublished ?? fields.get('首播') ?? fields.get('上映日期')),
    subcategory: category === 'screen' ? animated && series ? '番剧' : series ? '连续剧' : '电影' : undefined,
    ...(category === 'screen' ? { screenDetails: screenDetails(schema, fields, html, meta('og:description')) } : {}),
    sourceUrl: url.toString(), coverSourceUrl: coverSource(meta('og:image') ?? image),
  };
}

/** A query is either a Steam name or a canonical supported subject/store URL. */
export async function lookupMetadata(query: unknown, options: MetadataOptions = {}): Promise<MetadataCandidate[]> {
  if (typeof query !== 'string' || !query.trim() || query.length > 2048) throw new Error('请输入游戏名称或支持的作品链接');
  const input = query.trim();
  if (/^(?:[a-z][a-z\d+.-]*:\/\/|https?:|file:|data:|javascript:|about:)|^\/\//i.test(input)) {
    let url: URL;
    try { url = new URL(input); } catch { throw new Error('链接格式无效'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error('链接格式无效');
    if (url.hostname === 'store.steampowered.com') {
      const id = url.pathname.match(/^\/app\/(\d{1,12})(?:\/|$)/)?.[1];
      if (!id) throw new Error('请粘贴 Steam 游戏商店页面链接（/app/数字）');
      const value = parseJson(await textRequest(`https://store.steampowered.com/api/appdetails?appids=${id}&l=schinese&cc=cn`, 'steam', options));
      return [await withCover(parseSteamDetails(value, id), options)];
    }
    if (['book.douban.com', 'movie.douban.com'].includes(url.hostname)) {
      const id = url.pathname.match(/^\/subject\/(\d{1,12})\/?$/)?.[1];
      if (!id) throw new Error('请粘贴豆瓣图书或影视作品页面链接（/subject/数字/）');
      const canonical = `https://${url.hostname}/subject/${id}/`;
      return [await withCover(parseDoubanPage(await textRequest(canonical, 'douban', options), canonical), options)];
    }
    throw new Error('目前支持 Steam 商店、豆瓣图书和豆瓣电影的作品链接，也可以输入游戏名称搜索 Steam。');
  }
  if (input.length > 160) throw new Error('游戏搜索名称请控制在 160 字以内');
  const params = new URLSearchParams({ term: input, l: 'schinese', cc: 'cn' });
  return parseSteamSearch(parseJson(await textRequest(`https://store.steampowered.com/api/storesearch/?${params}`, 'steam', options)));
}
