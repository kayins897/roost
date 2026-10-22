import type { MediaItem } from './types.ts';

export const IMPRESSION_MAX_LENGTH = 80;
export interface PersonalWriting { impression: string; review: string }
export const writingLength = (value: string): number => Array.from(value).length;
export function impressionError(value: string): string {
  if (/[\r\n]/.test(value)) return '一句话印象请保持单行；长篇内容可以写在测评中。';
  return writingLength(value) > IMPRESSION_MAX_LENGTH ? `一句话印象最多 ${IMPRESSION_MAX_LENGTH} 字，请精简或移到长文测评。` : '';
}

/** Display only: legacy combined text is never rewritten by reading a snapshot. */
export function personalWritingFor(item: Pick<MediaItem, 'impression' | 'review'>): PersonalWriting & { legacy: boolean } {
  const legacy = Boolean(impressionError(item.impression));
  return { legacy, impression: legacy ? '' : item.impression, review: legacy ? [item.impression, item.review].filter(value => value !== undefined && value !== '').join('\n\n') : item.review ?? '' };
}

/** An unchanged metadata form must preserve legacy text and absent optional fields. */
export function personalWritingPatch(item: Pick<MediaItem, 'impression' | 'review'>, draft: PersonalWriting): Partial<Pick<MediaItem, 'impression' | 'review'>> {
  const error = impressionError(draft.impression);
  if (error) throw new Error(error);
  const original = personalWritingFor(item);
  const impressionChanged = draft.impression !== original.impression;
  const reviewChanged = draft.review !== original.review;
  if (!impressionChanged && !reviewChanged) return {};
  if (original.legacy) return { impression: draft.impression, review: draft.review };
  return { ...(impressionChanged ? { impression: draft.impression } : {}), ...(reviewChanged ? { review: draft.review } : {}) };
}
