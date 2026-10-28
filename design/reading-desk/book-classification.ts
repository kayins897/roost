import { reducer, type Action, type PreviewState } from '../reading-workspace/model.ts';

// In-memory arrangements only; historical reading rounds remain independent.
export type Arrangement = 'want' | 'reading' | 'read' | 'idle' | 'abandoned';
export type DeskState = PreviewState & { arrangements?: Record<string, Arrangement> };
export type DeskAction = Action | { type: 'arrangement'; workId: string; value: Arrangement };
export const ARRANGEMENT_LABELS: Record<Arrangement, string> = {
  want: '想读', reading: '在读', read: '已读', idle: '闲置', abandoned: '弃读',
};

export function arrangementOf(state: DeskState, workId: string): Arrangement {
  const explicit = state.arrangements?.[workId];
  if (explicit) return explicit;
  const plan = state.plans.find(plan => plan.workId === workId);
  if (plan) return plan.state === 'reading' ? 'reading' : 'want';
  return state.rounds.some(round => round.workId === workId) ? 'read' : 'idle';
}

export function deskReducer(state: DeskState, action: DeskAction): DeskState {
  if (action.type === 'arrangement') {
    if (!state.works.some(work => work.id === action.workId)) return state;
    // A read classification requires a genuine reading round, even with an unknown date.
    if (action.value === 'read' && !state.rounds.some(round => round.workId === action.workId)) return state;
    if (arrangementOf(state, action.workId) === action.value) return state;
    return { ...state, arrangements: { ...state.arrangements, [action.workId]: action.value } };
  }
  const next = reducer(state, action) as DeskState;
  if (action.type === 'reset') return next;
  if (action.type === 'plan') {
    const prior = arrangementOf(state, action.plan.workId);
    const existing = state.plans.some(plan => plan.workId === action.plan.workId);
    return { ...next, arrangements: { ...state.arrangements, [action.plan.workId]: existing ? prior : 'want' } };
  }
  if (action.type === 'start') {
    const plan = state.plans.find(plan => plan.id === action.id);
    return plan ? { ...next, arrangements: { ...state.arrangements, [plan.workId]: 'reading' } } : next;
  }
  if (action.type === 'round' && action.finishPlan) {
    return { ...next, arrangements: { ...state.arrangements, [action.round.workId]: 'read' } };
  }
  // Adding minutes or editing a past round never resumes a shelved/abandoned book.
  return next;
}
