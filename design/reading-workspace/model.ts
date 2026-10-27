// Synthetic preview only. These types are not a production persistence proposal.
export type Category = 'game' | 'book' | 'screen' | 'music';
export type GameTagGroupKey = 'gameplay' | 'theme' | 'scenario' | 'other';
export interface Work { id: string; title: string; subtitle: string; category: Category; tone: string; accent: string; format?: string; year: string; description: string; gameTags?: Partial<Record<GameTagGroupKey, string[]>> }
// Prototype-only planning ranges. These do not change the production library format.
export interface PlanPlacement { id: string; kind: 'season' | 'month' | 'stage' | 'week'; start: string; end: string; label: string }
export interface Plan { id: string; workId: string; date?: string; placements?: PlanPlacement[]; state: 'queued' | 'reading'; reason: string; order: number }
export interface ReadingRound { id: string; workId: string; finishedOn?: string; impression: string; review: string }
export interface Activity { id: string; workId: string; date?: string; kind: 'reading' | 'completed' | 'watched' | 'note'; minutes?: number; note: string }
export interface PreviewState { works: Work[]; plans: Plan[]; rounds: ReadingRound[]; activities: Activity[] }
export type Action =
  | { type: 'plan'; plan: Plan }
  | { type: 'start'; id: string }
  | { type: 'move'; id: string; direction: -1 | 1 }
  | { type: 'unplan'; id: string }
  | { type: 'round'; round: ReadingRound; finishPlan?: boolean }
  | { type: 'activity'; activity: Activity }
  | { type: 'remove-activity'; id: string }
  | { type: 'reset'; state: PreviewState };

export function reducer(state: PreviewState, action: Action): PreviewState {
  if (action.type === 'reset') return action.state;
  if (action.type === 'plan') {
    const existing = state.plans.find(p => p.workId === action.plan.workId);
    return { ...state, plans: existing ? state.plans.map(p => p.id === existing.id ? { ...p, reason: action.plan.reason, date: action.plan.date, placements: action.plan.placements ?? p.placements } : p) : [...state.plans, action.plan] };
  }
  if (action.type === 'start') return { ...state, plans: state.plans.map(p => p.id === action.id ? { ...p, state: 'reading' } : p) };
  if (action.type === 'unplan') return { ...state, plans: state.plans.filter(p => p.id !== action.id) };
  if (action.type === 'move') {
    const current = state.plans.find(p => p.id === action.id);
    if (!current) return state;
    const category = state.works.find(w => w.id === current.workId)?.category;
    const ordered = state.plans.filter(p => p.state === current.state && state.works.find(w => w.id === p.workId)?.category === category).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const at = ordered.findIndex(p => p.id === action.id), target = at + action.direction;
    if (target < 0 || target >= ordered.length) return state;
    [ordered[at], ordered[target]] = [ordered[target], ordered[at]];
    const orders = new Map(ordered.map((p, index) => [p.id, index]));
    return { ...state, plans: state.plans.map(p => orders.has(p.id) ? { ...p, order: orders.get(p.id)! } : p) };
  }
  if (action.type === 'round') return { ...state, rounds: [...state.rounds.filter(r => r.id !== action.round.id), action.round], plans: action.finishPlan ? state.plans.filter(p => p.workId !== action.round.workId) : state.plans };
  if (action.type === 'activity') return { ...state, activities: [...state.activities.filter(a => a.id !== action.activity.id), action.activity] };
  if (action.type === 'remove-activity') return { ...state, activities: state.activities.filter(a => a.id !== action.id) };
  return state;
}

export const CATEGORY_LABELS: Record<Category, string> = { game: '游戏', book: '书籍', screen: '影视', music: '音乐' };
export const ACTIVITY_LABELS: Record<Activity['kind'], string> = { reading: '阅读', completed: '通关', watched: '观影', note: '体验' };
export function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number), date = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
export function dailyMinutes(state: PreviewState, date: string): number | undefined {
  const records = state.activities.filter(a => a.kind === 'reading' && a.date === date && state.works.some(w => w.id === a.workId && w.category === 'book'));
  const known = records.filter(a => a.minutes !== undefined);
  return known.length ? known.reduce((sum, a) => sum + a.minutes!, 0) : undefined;
}
export function heatLevel(minutes: number | undefined): number { return minutes === undefined || minutes === 0 ? 0 : minutes < 15 ? 1 : minutes < 30 ? 2 : minutes < 60 ? 3 : 4; }
export function uid(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
