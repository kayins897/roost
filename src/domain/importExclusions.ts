import type { ExternalId, MediaItem, MediaType } from './types.ts';

type ExternalWork = Pick<MediaItem, 'category'> & {
  appId?: string;
  externalIds?: readonly ExternalId[];
  sourceUrl?: string;
};

function canonicalId(provider: ExternalId['provider'], value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value)) return undefined;
  const id = value.replace(/^0+/, '');
  if (!id) return undefined;
  if (provider === 'steam' && (!Number.isSafeInteger(Number(id)) || Number(id) > 4294967295)) return undefined;
  return id;
}

function fromUrl(value: unknown, category?: MediaType): ExternalId | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return undefined;
    if ((!category || category === 'game') && url.hostname === 'store.steampowered.com') {
      const id = canonicalId('steam', /^\/app\/(\d+)(?:\/|$)/.exec(url.pathname)?.[1]);
      return id ? { provider: 'steam', id, url: `https://store.steampowered.com/app/${id}/` } : undefined;
    }
    const host = url.hostname;
    if ((host === 'book.douban.com' && (!category || category === 'book')) || (host === 'movie.douban.com' && (!category || category === 'screen'))) {
      const id = canonicalId('douban', /^\/subject\/(\d{1,20})(?:\/|$)/.exec(url.pathname)?.[1]);
      return id ? { provider: 'douban', id, url: `https://${host}/subject/${id}/` } : undefined;
    }
  } catch { /* An unrecognized source never establishes an external identity. */ }
  return undefined;
}

function identityKey(ref: ExternalId): string | undefined {
  const id = canonicalId(ref.provider, ref.id);
  if (!id) return undefined;
  // A URL-less Douban reference is a conservative wildcard across its two catalogs.
  const catalog = ref.provider === 'douban' ? fromUrl(ref.url)?.url?.includes('book.douban.com') ? 'book:' : ref.url ? 'screen:' : '' : '';
  return `${ref.provider}:${catalog}${id}`;
}

/** Strict validation applies only to the new exclusion list, preserving legacy ID reads. */
export function isValidImportExclusion(value: unknown): value is ExternalId {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ref = value as ExternalId;
  if (ref.provider !== 'steam' && ref.provider !== 'douban') return false;
  const id = canonicalId(ref.provider, ref.id);
  if (!id) return false;
  if (ref.url === undefined) return true;
  const source = fromUrl(ref.url);
  return source?.provider === ref.provider && source.id === id;
}

/** Source links also cover old records that predate externalIds. */
export function externalIdentitiesFor(work: ExternalWork): ExternalId[] {
  const result = new Map<string, ExternalId>();
  const add = (ref: ExternalId | undefined) => { if (ref) result.set(identityKey(ref)!, ref); };
  const steam = work.category === 'game' ? canonicalId('steam', work.appId) : undefined;
  if (steam) add({ provider: 'steam', id: steam, url: `https://store.steampowered.com/app/${steam}/` });
  for (const ref of work.externalIds ?? []) {
    const id = canonicalId(ref.provider, ref.id);
    const allowed = ref.provider === 'steam' ? work.category === 'game' : ref.provider === 'douban' && (work.category === 'book' || work.category === 'screen');
    if (allowed && id) add({ provider: ref.provider, id, url: ref.provider === 'steam' ? `https://store.steampowered.com/app/${id}/` : `https://${work.category === 'book' ? 'book' : 'movie'}.douban.com/subject/${id}/` });
    const fromReference = fromUrl(ref.url, work.category);
    if (fromReference?.provider === ref.provider) add(fromReference);
  }
  add(fromUrl(work.sourceUrl, work.category));
  return [...result.values()];
}

function sameIdentity(left: ExternalId, right: ExternalId): boolean {
  const leftKey = identityKey(left), rightKey = identityKey(right);
  return !!leftKey && !!rightKey && (leftKey === rightKey || (left.provider === 'douban' && right.provider === 'douban' &&
    canonicalId('douban', left.id) === canonicalId('douban', right.id) && (!left.url || !right.url)));
}

export function isImportExcluded(work: ExternalWork, exclusions: readonly ExternalId[] | undefined): boolean {
  return !!exclusions?.length && externalIdentitiesFor(work).some(ref => exclusions.some(exclusion => sameIdentity(ref, exclusion)));
}

/** Keep unknown fields on existing references and add only previously unrepresented identities. */
export function addImportExclusions(existing: readonly ExternalId[] | undefined, works: readonly ExternalWork[]): ExternalId[] {
  const result = [...(existing ?? [])];
  for (const work of works) for (const ref of externalIdentitiesFor(work)) {
    if (!result.some(exclusion => sameIdentity(ref, exclusion))) result.push(ref);
  }
  return result;
}

export function removeImportExclusions(existing: readonly ExternalId[], restored: readonly ExternalWork[], stillRemoved: readonly ExternalWork[]): ExternalId[] {
  return existing.filter(exclusion => !restored.some(work => isImportExcluded(work, [exclusion])) || stillRemoved.some(work => isImportExcluded(work, [exclusion])));
}
