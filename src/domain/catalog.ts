import { emptyGameTags, normalizePlatforms, platformsFor } from './library.ts';
import type { ExperienceEntry, ExternalId, MediaItem, MediaType, MetadataProvider, ScreenDetails } from './types.ts';
import { isScreenDetails } from './screensValidation.ts';

/** Remote artwork is a preview/source only; persisted coverUrl remains a local data URL. */
export interface MetadataCandidate {
  provider: MetadataProvider;
  externalId: string;
  category: MediaType;
  title: string;
  originalTitle?: string;
  creator?: string;
  year?: string;
  subcategory?: string;
  platforms?: string[];
  sourceUrl: string;
  coverUrl?: string;
  coverSourceUrl?: string;
  screenDetails?: ScreenDetails;
}

function normalizedTitle(value: string | undefined): string {
  return (value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{Z}\s]+/gu, '');
}

/** Known subject URLs collapse language, tracking and slug differences to the same identity. */
function sourceIdentity(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return undefined;
    const host = url.hostname.toLowerCase();
    const steamId = /^\/app\/(\d+)(?:\/|$)/i.exec(url.pathname)?.[1];
    if (host === 'store.steampowered.com' && steamId) return `steam:${steamId}`;
    const doubanId = /^\/subject\/(\d+)(?:\/|$)/i.exec(url.pathname)?.[1];
    if ((host === 'book.douban.com' || host === 'movie.douban.com') && doubanId) return `douban:${host}:${doubanId}`;
    url.hash = '';
    url.searchParams.sort();
    return `${host}${url.port ? `:${url.port}` : ''}${url.pathname.replace(/\/+$/, '')}${url.search}`;
  } catch {
    return undefined;
  }
}

/** Exact identities rank first; names are suggestions requiring user confirmation. */
export function findDuplicateCandidates(items: MediaItem[], candidate: MetadataCandidate): MediaItem[] {
  const candidateSource = sourceIdentity(candidate.sourceUrl);
  const names = new Set([candidate.title, candidate.originalTitle].map(normalizedTitle).filter(Boolean));
  const exact: MediaItem[] = [];
  const byName: MediaItem[] = [];
  for (const item of items) {
    if (item.category !== candidate.category) continue;
    const sameExternalId = item.externalIds?.some(ref => ref.provider === candidate.provider && ref.id === candidate.externalId);
    const sameSource = candidateSource !== undefined && [item.sourceUrl, ...(item.externalIds ?? []).map(ref => ref.url)]
      .some(source => sourceIdentity(source) === candidateSource);
    if (sameExternalId || sameSource) exact.push(item);
    else if ([item.title, item.originalTitle].some(name => {
      const normalized = normalizedTitle(name);
      return normalized !== '' && names.has(normalized);
    })) byName.push(item);
  }
  return [...exact, ...byName];
}

function filled(current: string | undefined, incoming: string | undefined): string | undefined {
  return current?.trim() ? current : incoming?.trim() || current;
}

function mergeExternalIds(existing: ExternalId[], candidate: MetadataCandidate): ExternalId[] {
  const result = existing.map(ref => ({ ...ref }));
  const match = result.find(ref => ref.provider === candidate.provider && ref.id === candidate.externalId);
  if (match) match.url = filled(match.url, candidate.sourceUrl);
  else result.push({ provider: candidate.provider, id: candidate.externalId, url: candidate.sourceUrl });
  return result;
}

/** Fill metadata gaps while retaining every personal and unknown field on existing records. */
export function applyMetadataCandidate(existing: MediaItem | undefined, candidate: MetadataCandidate): MediaItem {
  if (existing && existing.category !== candidate.category) throw new Error('不能合并不同板块的作品');
  if (!candidate.title.trim() || !candidate.externalId.trim()) throw new Error('资料缺少作品名称或来源编号');
  if (candidate.category === 'screen' && candidate.screenDetails !== undefined && !isScreenDetails(candidate.screenDetails)) throw new Error('影视资料格式无效');
  const identity = sourceIdentity(candidate.sourceUrl);
  if ((candidate.provider !== 'steam' && candidate.provider !== 'douban') || !identity ||
    (candidate.provider === 'steam' && (candidate.category !== 'game' || identity !== `steam:${candidate.externalId}`)) ||
    (candidate.provider === 'douban' && !((candidate.category === 'book' && identity === `douban:book.douban.com:${candidate.externalId}`) ||
      (candidate.category === 'screen' && identity === `douban:movie.douban.com:${candidate.externalId}`)))) {
    throw new Error('资料来源与作品编号不匹配');
  }
  const now = new Date().toISOString();
  const base: MediaItem = existing ?? {
    id: crypto.randomUUID(), title: candidate.title.trim(), category: candidate.category,
    subcategory: '', creator: '', year: '', status: 'want',
    ...(candidate.category === 'game' ? { gamePlayState: 'want' as const, gameTags: emptyGameTags() } : {}),
    tags: [], impression: '', favorite: false, artwork: 'default', createdAt: now, updatedAt: now,
  };
  const platforms = normalizePlatforms([
    ...platformsFor(base), ...(candidate.platforms ?? []),
    ...(!existing && candidate.category === 'game' && !candidate.platforms ? [candidate.subcategory ?? ''] : []),
  ]);
  // Candidate download failure must not replace an existing local cover with a remote URL.
  const localCover = candidate.coverUrl && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(candidate.coverUrl)
    ? candidate.coverUrl : undefined;
  return {
    ...base,
    title: filled(base.title, candidate.title) ?? candidate.title.trim(),
    originalTitle: filled(base.originalTitle, candidate.originalTitle),
    creator: filled(base.creator, candidate.creator) ?? '',
    year: filled(base.year, candidate.year) ?? '',
    subcategory: filled(base.subcategory, candidate.subcategory) ?? '',
    sourceUrl: filled(base.sourceUrl, candidate.sourceUrl),
    coverUrl: filled(base.coverUrl, localCover),
    ...(base.category === 'game' || platforms.length > 0 ? { platforms } : {}),
    ...(base.category === 'screen' && candidate.screenDetails ? { screenDetails: mergeScreenDetails(base.screenDetails, candidate.screenDetails) } : {}),
    externalIds: mergeExternalIds(base.externalIds ?? [], candidate),
    updatedAt: now,
  };
}

/** Only known public fields may fill gaps; personal values, zero and unknown extensions survive. */
function mergeScreenDetails(existing: ScreenDetails = {}, incoming: ScreenDetails): ScreenDetails {
  const next = { ...existing };
  for (const key of ['actors', 'regions', 'durationMinutes', 'episodeCount', 'description', 'doubanScore', 'viewingSources', 'metadataSource'] as const) {
    const current = next[key], value = incoming[key];
    const missing = current === undefined || (typeof current === 'string' && !current.trim()) || (Array.isArray(current) && !current.length);
    if (missing && value !== undefined) Object.assign(next, { [key]: Array.isArray(value) ? [...value] : value });
  }
  return next;
}

export type TimelineEntry = ExperienceEntry & { item: MediaItem };

/** Only explicit experience dates participate; collection timestamps never invent experiences. */
export function timelineEntries(items: MediaItem[]): TimelineEntry[] {
  return items.flatMap(item => (item.experienceEntries ?? []).map(entry => ({ ...entry, item })))
    .sort((a, b) => b.date.localeCompare(a.date) || a.item.title.localeCompare(b.item.title, 'zh-CN') || a.id.localeCompare(b.id));
}
