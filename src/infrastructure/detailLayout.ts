export const DETAIL_WIDGET_IDS = ['cover', 'grade', 'hours', 'platform', 'facts', 'impression', 'footprint', 'gallery', 'tags', 'count', 'review'] as const;
export type DetailWidgetId = typeof DETAIL_WIDGET_IDS[number];
export interface DetailWidgetPreference { id: DetailWidgetId; size: 'small' | 'medium' | 'large'; visible: boolean; color: string }
export interface DetailLayoutPreferences { cards: DetailWidgetPreference[]; fields: Record<string, boolean>; galleryMode: 1 | 4 | 9 }
const KEY = 'qiyu.detail-layout.v1';
const FIELDS = ['original', 'year', 'date', 'creator', 'source', 'tag0', 'tag1', 'tag2', 'tag3'];
export function defaultDetailLayout(): DetailLayoutPreferences {
  return { cards: DETAIL_WIDGET_IDS.map(id => ({ id, size: 'medium', visible: id !== 'count', color: 'default' })), fields: Object.fromEntries(FIELDS.map(id => [id, true])), galleryMode: 1 };
}
function valid(value: unknown): value is DetailLayoutPreferences {
  if (!value || typeof value !== 'object') return false;
  const pref = value as DetailLayoutPreferences;
  return Array.isArray(pref.cards) && pref.cards.length === DETAIL_WIDGET_IDS.length && new Set(pref.cards.map(c => c?.id)).size === DETAIL_WIDGET_IDS.length &&
    pref.cards.every(c => c && DETAIL_WIDGET_IDS.includes(c.id) && ['small', 'medium', 'large'].includes(c.size) && typeof c.visible === 'boolean' && (c.color === 'default' || /^#[0-9a-f]{6}$/i.test(c.color))) &&
    !!pref.fields && typeof pref.fields === 'object' && FIELDS.every(key => typeof pref.fields[key] === 'boolean') && [1, 4, 9].includes(pref.galleryMode);
}
export function loadDetailLayout(): DetailLayoutPreferences {
  try { const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (valid(raw)) return raw; } catch { /* Broken preferences never affect the library. */ }
  return defaultDetailLayout();
}
export function saveDetailLayout(value: DetailLayoutPreferences): void {
  if (!valid(value)) throw new Error('布局设置无效，未保存');
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { throw new Error('布局未能保存，请检查本机存储空间后重试'); }
}
