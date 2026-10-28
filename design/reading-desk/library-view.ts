import type { Face, Layout } from './types';
export type Sort = 'order' | 'name' | 'year';
export interface LibraryView {
  face: Face; layouts: Record<Face, Layout>; query: string; selectedTags: string[];
  readingOnly: boolean; sort: Sort; ascending: boolean;
}
export const INITIAL_VIEW: LibraryView = { face: 'plan', layouts: { plan: 'grid', records: 'grid' }, query: '', selectedTags: [], readingOnly: false, sort: 'order', ascending: true };
export type ViewAction =
  | { type: 'face'; face: Face }
  | { type: 'layout'; layout: Layout }
  | { type: 'query'; query: string }
  | { type: 'tag'; name: string }
  | { type: 'clear-tags' }
  | { type: 'remove-tag'; name: string }
  | { type: 'reading' }
  | { type: 'sort'; sort: Sort }
  | { type: 'direction' }
  | { type: 'home' }
  | { type: 'reset' };
export function viewReducer(state: LibraryView, action: ViewAction): LibraryView {
  switch (action.type) {
    case 'face': return { ...state, face: action.face, readingOnly: false };
    case 'layout': return { ...state, layouts: { ...state.layouts, [state.face]: action.layout } };
    case 'query': return { ...state, query: action.query };
    case 'tag': return { ...state, selectedTags: state.selectedTags.includes(action.name) ? state.selectedTags.filter(tag => tag !== action.name) : [...state.selectedTags, action.name] };
    case 'clear-tags': return { ...state, selectedTags: [] };
    case 'remove-tag': return { ...state, selectedTags: state.selectedTags.filter(tag => tag !== action.name) };
    case 'reading': return { ...state, readingOnly: !state.readingOnly };
    case 'sort': return { ...state, sort: action.sort };
    case 'direction': return { ...state, ascending: !state.ascending };
    case 'home': return { ...state, face: 'plan', query: '', selectedTags: [], readingOnly: false };
    case 'reset': return INITIAL_VIEW;
  }
}
