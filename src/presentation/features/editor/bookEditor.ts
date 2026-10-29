import { applyBookAction, bookArrangement, bookHasRead } from '../../../domain/books.ts';
import { isCompletionDate } from '../../../domain/gameProgress.ts';
import type { BookArrangement, MediaItem } from '../../../domain/types.ts';

export type BookEditorState = Exclude<BookArrangement, 'none'> | 'records';
export function bookEditorState(item?: MediaItem): BookEditorState {
  if (!item || item.category !== 'book') return 'want';
  const arrangement = bookArrangement(item);
  return arrangement === 'none' ? bookHasRead(item) ? 'records' : 'want' : arrangement;
}
export function bookEditorError(state: BookEditorState, finishedOn: string): string {
  return state === 'records' && finishedOn && !isCompletionDate(finishedOn) ? '读完日期请填写有效年份、年月或年月日；不知道时可留空。' : '';
}
/** Explicit form edit only; existing legacy values and reading history stay intact. */
export function applyBookEditor(item: MediaItem, state: BookEditorState, finishedOn: string): MediaItem {
  if (state !== 'records') return applyBookAction(item, { type: 'arrangement', value: state }, item.updatedAt);
  if (bookHasRead(item)) return applyBookAction(item, { type: 'arrangement', value: 'none' }, item.updatedAt);
  return applyBookAction(item, { type: 'round', round: { id: crypto.randomUUID(), finishedOn: finishedOn || undefined, impression: item.impression, review: item.review ?? '' }, finishPlan: true }, item.updatedAt);
}
