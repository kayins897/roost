import { EXPERIENCE_CATEGORIES, EXPERIENCE_CATEGORY_LABELS, experienceCategoryFor, experienceStatusFor, type GameExperienceClassification } from '../../../domain/gameExperience.ts';
import type { MediaItem } from '../../../domain/types.ts';

export const CLASSIFICATIONS: readonly GameExperienceClassification[] = ['unplayed', 'unclassified', ...EXPERIENCE_CATEGORIES];
export const CLASSIFICATION_LABELS: Record<GameExperienceClassification, string> = {
  unplayed: '新作开荒', unclassified: '已体验 · 未分类', ...EXPERIENCE_CATEGORY_LABELS,
};
export function classificationFor(item: MediaItem): GameExperienceClassification {
  return experienceStatusFor(item) === 'unplayed' ? 'unplayed' : experienceCategoryFor(item) ?? 'unclassified';
}

/** Sorting follows the visible classification; New Game+ supports both fields, with priority first. */
export function classificationRankMode(primary: 'unplayed' | 'experienced' | 'all', secondary: GameExperienceClassification | 'all'): 'priority' | 'rating' | undefined {
  if (primary === 'unplayed' || (primary === 'experienced' && ['playing','continue','replayable','long-term'].includes(secondary))) return 'priority';
  return primary === 'experienced' && secondary === 'completed' ? 'rating' : undefined;
}
