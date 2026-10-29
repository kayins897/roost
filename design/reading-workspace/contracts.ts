import type { Dispatch } from 'react';
import type { Action, PreviewState, Work } from './model';
export interface WorkspaceProps {
  state: PreviewState; dispatch: Dispatch<Action>; query: string; today: string;
  openWork: (id: string) => void; logReading: (workId?: string, date?: string) => void; openDay: (date: string) => void;
}
export interface BookDetailProps extends WorkspaceProps { work: Work; onClose: () => void }
