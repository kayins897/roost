import type { Dispatch } from 'react';
import type { Activity, ReadingRound } from '../reading-workspace/model';
import type { DeskAction, DeskState } from './book-classification';
import type { BookTags, TagAction } from './book-tags';

export type Face = 'all' | 'plan' | 'reading' | 'records' | 'idle' | 'abandoned';
export const FACES: { id: Face; label: string }[] = [
  { id: 'all', label: '全部' }, { id: 'plan', label: '想读' }, { id: 'reading', label: '在读' },
  { id: 'records', label: '已读' }, { id: 'idle', label: '闲置' }, { id: 'abandoned', label: '弃读' },
];
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
  state: DeskState;
  dispatch: Dispatch<DeskAction>;
  open: (dialog: DeskDialog) => void;
  tags: BookTags;
  changeTags: (action: TagAction) => void;
}
