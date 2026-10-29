import type { MetadataCandidate } from './catalog.ts';
import type { SteamImportGame } from './steamImport.ts';
import { validateImportWork } from './steamImport.ts';

/** Only exact public subject links are eligible. Names and ISBNs never trigger a search. */
export function intakeSubject(work: SteamImportGame): string | undefined {
  if (work.category !== 'book' && work.category !== 'screen') return;
  try {
    const url = new URL(work.sourceUrl ?? '');
    const host = work.category === 'book' ? 'book.douban.com' : 'movie.douban.com';
    const id = /^\/subject\/(\d{1,12})\/?$/.exec(url.pathname)?.[1]?.replace(/^0+/, '');
    if (!id || url.hostname !== host || url.port || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) return;
    if (work.externalIds?.some(ref => ref.provider === 'douban' && ref.id.replace(/^0+/, '') !== id)) return;
    return `https://${host}/subject/${id}/`;
  } catch { return; }
}

function missing(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string' && !value.trim() || Array.isArray(value) && !value.length;
}

/** Enrichment edits the unsaved draft only. User-provided values, including 0, always win. */
export function fillIntakeMetadata(draft: SteamImportGame, candidate: MetadataCandidate): SteamImportGame {
  const source = intakeSubject(draft);
  const returned = intakeSubject({ title: candidate.title, category: candidate.category, sourceUrl: candidate.sourceUrl });
  const id = source?.split('/')[4];
  if (!source || source !== returned || candidate.category !== draft.category || candidate.provider !== 'douban' || candidate.externalId.replace(/^0+/, '') !== id) {
    throw new Error('来源返回的作品与清单链接不一致，未应用资料');
  }
  const next = structuredClone(draft);
  for (const key of ['originalTitle', 'creator', 'year', 'subcategory', 'coverUrl'] as const) {
    if (missing(next[key]) && !missing(candidate[key])) next[key] = candidate[key];
  }
  next.externalIds = [{ provider: 'douban', id: id!, url: source }];
  next.sourceUrl = source;
  const key = draft.category === 'book' ? 'bookDetails' : 'screenDetails';
  const fields = draft.category === 'book'
    ? ['translator', 'publisher', 'isbn', 'description', 'doubanScore', 'metadataSource']
    : ['actors', 'regions', 'durationMinutes', 'episodeCount', 'description', 'doubanScore', 'metadataSource'];
  const incoming = candidate[key] as Record<string, unknown> | undefined;
  const details = { ...next[key] } as Record<string, unknown>;
  for (const field of fields) if (missing(details[field]) && incoming?.[field] !== undefined) details[field] = structuredClone(incoming[field]);
  if (Object.keys(details).length) Object.assign(next, { [key]: details });
  const checked = validateImportWork(next);
  if (typeof checked === 'string') throw new Error(checked);
  return checked;
}
