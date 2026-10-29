import { useSyncExternalStore } from 'react';
import { isPersonalScore } from '../../../domain/gameAssets.ts';
import { gradeEditable } from '../../../domain/gameProgress.ts';
import { coverFinishFor, type CoverFinish } from '../../../domain/gameRating.ts';
import type { MediaItem } from '../../../domain/types.ts';
import { configuredCoverFinish, loadCoverMaterial, subscribeCoverMaterial } from '../../../infrastructure/coverMaterialPreferences.ts';

/** Each memoized library card subscribes to the shared, stable preference snapshot. */
export function useCoverFinish(item: MediaItem): CoverFinish {
  const prefs = useSyncExternalStore(subscribeCoverMaterial, loadCoverMaterial, loadCoverMaterial);
  if (item.category !== 'game') return 'standard';
  const score = gradeEditable(item) && isPersonalScore(item.personalScore) ? item.personalScore : undefined;
  return configuredCoverFinish(score, coverFinishFor(item), prefs);
}
