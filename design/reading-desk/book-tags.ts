// Presentation-only tags for the isolated preview. No production persistence fields.
export const BOOK_TAGS: Record<string, string[]> = {
  b1: ['文学', '城市', '旅行', '哲学'], b2: ['文学', '哲学', '成长'],
  b3: ['设计', '美学', '生活'], b4: ['科幻', '宇宙', '冒险'],
  b5: ['心理', '生活', '非虚构'], b6: ['社会', '经济', '非虚构'],
  b7: ['科普', '宇宙', '科学'], b8: ['文学', '哲学'],
};
export interface BookTags { names: string[]; byBook: Record<string, string[]> }
export type TagAction =
  | { type: 'create'; name: string }
  | { type: 'book'; workId: string; names: string[] }
  | { type: 'assign'; name: string; workIds: string[] }
  | { type: 'delete'; name: string }
  | { type: 'reset' };

export function cleanTags(names: string[]) {
  const seen = new Set<string>();
  return names.map(name => name.trim()).filter(name => {
    const key = name.toLocaleLowerCase();
    if (!name || name.length > 32 || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
export function createBookTags(): BookTags {
  return { names: cleanTags(Object.values(BOOK_TAGS).flat()), byBook: Object.fromEntries(Object.entries(BOOK_TAGS).map(([id, names]) => [id, [...names]])) };
}
export function tagReducer(state: BookTags, action: TagAction): BookTags {
  if (action.type === 'reset') return createBookTags();
  if (action.type === 'create') return { ...state, names: cleanTags([...state.names, action.name]) };
  if (action.type === 'book') {
    const canonical = action.names.map(name => state.names.find(existing => existing.toLocaleLowerCase() === name.trim().toLocaleLowerCase()) ?? name);
    const names = cleanTags(canonical);
    return { names: cleanTags([...state.names, ...names]), byBook: { ...state.byBook, [action.workId]: names } };
  }
  if (action.type === 'assign') {
    if (!state.names.includes(action.name)) return state;
    const selected = new Set(action.workIds);
    return { ...state, byBook: Object.fromEntries(Object.entries(state.byBook).map(([id, names]) => [id,
      selected.has(id) ? cleanTags([...names, action.name]) : names.filter(name => name !== action.name),
    ])) };
  }
  return { names: state.names.filter(name => name !== action.name), byBook: Object.fromEntries(Object.entries(state.byBook).map(([id, names]) => [id, names.filter(name => name !== action.name)])) };
}
