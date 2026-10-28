import type { Dispatch } from 'react';
import type { Action, Activity, PreviewState, ReadingRound } from '../reading-workspace/model';
import type { BookTags, TagAction } from './book-tags';

export type Face = 'plan' | 'records';
export type Layout = 'grid' | 'list';
export type DeskDialog =
  | { kind: 'book'; workId: string }
  | { kind: 'plan'; workId?: string }
  | { kind: 'round'; workId?: string; round?: ReadingRound; finishPlan?: boolean }
  | { kind: 'log'; workId?: string; date?: string; initial?: Activity }
  | { kind: 'collection'; id?: string }
  | { kind: 'tags'; workId?: string }
  | { kind: 'day'; date: string }
  | { kind: 'info' };
export interface DeskProps {
  state: PreviewState;
  dispatch: Dispatch<Action>;
  open: (dialog: DeskDialog) => void;
  tags: BookTags;
  changeTags: (action: TagAction) => void;
}
