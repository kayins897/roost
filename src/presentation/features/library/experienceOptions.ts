import { EXPERIENCE_CATEGORIES, EXPERIENCE_CATEGORY_LABELS, experienceCategoryFor, experienceStatusFor, type GameExperienceClassification } from '../../../domain/gameExperience.ts';
import type { MediaItem } from '../../../domain/types.ts';

export const CLASSIFICATIONS: readonly GameExperienceClassification[] = ['unplayed', 'unclassified', ...EXPERIENCE_CATEGORIES];
export const CLASSIFICATION_LABELS: Record<GameExperienceClassification, string> = {
  unplayed: '待体验', unclassified: '已体验 · 未分类', ...EXPERIENCE_CATEGORY_LABELS,
};
export function classificationFor(item: MediaItem): GameExperienceClassification {
  return experienceStatusFor(item) === 'unplayed' ? 'unplayed' : experienceCategoryFor(item) ?? 'unclassified';
}
