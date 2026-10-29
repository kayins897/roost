import type { MediaItem } from './types.ts';
import { isPersonalScore } from './gameAssets.ts';
import { gradeEditable } from './gameProgress.ts';
export function scorePatch(value: number | undefined): Partial<MediaItem> {
  if (value !== undefined && !isPersonalScore(value)) throw new Error('评分须为 0–10 分，最多一位小数');
  return { personalScore: value, ratingOrder: undefined };
}
export function bulkScorePatch(items: MediaItem[], ids: ReadonlySet<string>, value: number | undefined) {
  const patch = scorePatch(value); let changedCount = 0;
  const selected = items.filter(item => ids.has(item.id));
  if (selected.length !== ids.size || selected.some(item => item.removedAt || !gradeEditable(item))) throw new Error('所选作品并非全部适用通关评分');
  const next = items.map(item => { if (!ids.has(item.id) || item.personalScore === value) return item; changedCount++; return { ...item, ...patch }; });
  return { items: changedCount ? next : items, changedCount };
}
