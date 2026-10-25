import type { GameExperienceClassification } from '../../../domain/gameExperience.ts';
import { classificationFor } from './experienceOptions.ts';
import type { GamePlayState, MediaItem, PlayEngagement } from '../../../domain/types.ts';

/** Existing colour tokens are a read-only visual projection, never the stored legacy state. */
export const engagementIcon: Record<PlayEngagement, GamePlayState> = {
  planned: 'want', playing: 'playing', paused: 'paused', inactive: 'paused', abandoned: 'abandoned',
};
export function gameVisualState(item: MediaItem): GameExperienceClassification | undefined {
  return item.category === 'game' ? classificationFor(item) : undefined;
}
