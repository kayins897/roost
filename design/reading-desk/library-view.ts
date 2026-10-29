import type { Face, Layout } from './types';
import type { FacetKey, FacetSelection } from './book-metadata';
export type Sort = 'order' | 'name' | 'year';
export interface LibraryView {
  face: Face; layouts: Record<Face, Layout>; query: string; selectedTags: string[];
  facets: FacetSelection; sort: Sort; ascending: boolean;
}
export const INITIAL_VIEW: LibraryView = {
  face: 'all', layouts: { all: 'grid', plan: 'grid', reading: 'grid', records: 'grid', idle: 'grid', abandoned: 'grid' },
  query: '', selectedTags: [], facets: {}, sort: 'order', ascending: true,
};
export type ViewAction =
  | { type: 'face'; face: Face }
  | { type: 'layout'; layout: Layout }
  | { type: 'query'; query: string }
  | { type: 'tag'; name: string }
  | { type: 'clear-tags' }
  | { type: 'remove-tag'; name: string }
  | { type: 'facet'; key: FacetKey; value: string }
  | { type: 'clear-facets' }
  | { type: 'clear-filters' }
  | { type: 'sort'; sort: Sort }
  | { type: 'direction' }
  | { type: 'home' }
  | { type: 'reset' };
export function viewReducer(state: LibraryView, action: ViewAction): LibraryView {
  switch (action.type) {
    case 'face': return { ...state, face: action.face };
    case 'layout': return { ...state, layouts: { ...state.layouts, [state.face]: action.layout } };
    case 'query': return { ...state, query: action.query };
    case 'tag': return { ...state, selectedTags: state.selectedTags.includes(action.name) ? state.selectedTags.filter(tag => tag !== action.name) : [...state.selectedTags, action.name] };
    case 'clear-tags': return { ...state, selectedTags: [] };
    case 'remove-tag': return { ...state, selectedTags: state.selectedTags.filter(tag => tag !== action.name) };
    case 'facet': {
      const values = state.facets[action.key] ?? [];
      return { ...state, facets: { ...state.facets, [action.key]: values.includes(action.value) ? values.filter(value => value !== action.value) : [...values, action.value] } };
    }
    case 'clear-facets': return { ...state, facets: {} };
    case 'clear-filters': return { ...state, query: '', selectedTags: [], facets: {} };
    case 'sort': return { ...state, sort: action.sort };
    case 'direction': return { ...state, ascending: !state.ascending };
    case 'home': return { ...state, face: 'all', query: '', selectedTags: [], facets: {} };
    case 'reset': return INITIAL_VIEW;
  }
}
