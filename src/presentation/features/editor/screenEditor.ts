import { applyScreenAction, screenArrangement, screenHasWatched } from '../../../domain/screens.ts';
import { isCompletionDate } from '../../../domain/gameProgress.ts';
import type { MediaItem, ScreenArrangement } from '../../../domain/types.ts';

export type ScreenEditorState = ScreenArrangement | 'watched';
export const SCREEN_EDITOR_STATES: [ScreenEditorState, string][] = [['want', '想看'], ['watching', '在看'], ['watched', '看过'], ['idle', '搁置'], ['abandoned', '弃看'], ['none', '未安排']];
export function screenEditorState(item?: MediaItem): ScreenEditorState {
  if (!item || item.category !== 'screen') return 'want';
  const arrangement = screenArrangement(item);
  return arrangement === 'none' && screenHasWatched(item) ? 'watched' : arrangement;
}
export function screenEditorError(state: ScreenEditorState, date: string): string {
  return state === 'watched' && date.trim() && !isCompletionDate(date.trim()) ? '看完日期请填写有效的年、年月或年月日，也可以留空。' : '';
}
export function applyScreenEditor(item: MediaItem, state: ScreenEditorState, date: string): MediaItem {
  const now = item.updatedAt;
  if (state !== 'watched') return applyScreenAction(item, { type: 'arrangement', value: state }, now);
  if (screenHasWatched(item)) return applyScreenAction(item, { type: 'arrangement', value: 'none' }, now);
  return applyScreenAction(item, { type: 'round', round: { id: crypto.randomUUID(), ...(date.trim() ? { finishedOn: date.trim() } : {}), impression: '', review: '' }, finishPlan: true }, now);
}
