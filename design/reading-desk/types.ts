import type { Dispatch } from 'react';
import type { Action, Activity, PreviewState, ReadingRound } from '../reading-workspace/model';

export type Face = 'plan' | 'records';
export type Layout = 'grid' | 'list';
export type DeskDialog =
  | { kind: 'book'; workId: string }
  | { kind: 'plan'; workId?: string }
  | { kind: 'round'; workId?: string; round?: ReadingRound; finishPlan?: boolean }
  | { kind: 'log'; workId?: string; date?: string; initial?: Activity }
  | { kind: 'collection'; id?: string }
  | { kind: 'heatmap' }
  | { kind: 'day'; date: string }
  | { kind: 'info' };
export interface DeskProps {
  state: PreviewState;
  dispatch: Dispatch<Action>;
  open: (dialog: DeskDialog) => void;
}
