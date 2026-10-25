import { completionFor, engagementFor } from '../../../domain/gameProgress.ts';
import type { GamePlayState, MediaItem, PlayEngagement } from '../../../domain/types.ts';

/** Existing colour tokens are a read-only visual projection, never the stored legacy state. */
export const engagementIcon: Record<PlayEngagement, GamePlayState> = {
  planned: 'want', playing: 'playing', paused: 'paused', inactive: 'paused', abandoned: 'abandoned',
};
export function gameVisualState(item: MediaItem): GamePlayState | undefined {
  if (item.category !== 'game') return undefined;
  if (completionFor(item) === 'cleared') return 'cleared';
  const engagement = engagementFor(item);
  return engagement === 'unrecorded' || engagement === 'inactive' ? undefined : engagementIcon[engagement];
}
