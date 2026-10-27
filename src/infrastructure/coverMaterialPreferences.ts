export interface CoverMaterialPreferences { strength: number; filter: number; speed: number; facets: boolean }
export const DEFAULT_COVER_MATERIAL: Readonly<CoverMaterialPreferences> = Object.freeze({ strength: 1, filter: 1, speed: 1, facets: true });
const KEY = 'qiyu.cover-material.v1';
function valid(value: unknown): value is CoverMaterialPreferences {
  if (!value || typeof value !== 'object') return false;
  const p = value as CoverMaterialPreferences;
  return ['strength', 'filter', 'speed'].every(key => typeof p[key as keyof typeof p] === 'number' && Number.isFinite(p[key as keyof typeof p]) && Number(p[key as keyof typeof p]) >= 0 && Number(p[key as keyof typeof p]) <= 1) && typeof p.facets === 'boolean';
}
export function loadCoverMaterial(): CoverMaterialPreferences {
  try { const p: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (valid(p)) return p; } catch { /* Defaults, without rewriting storage. */ }
  return { ...DEFAULT_COVER_MATERIAL };
}
export function saveCoverMaterial(p: CoverMaterialPreferences) {
  if (!valid(p)) throw new Error('卡面设置无效');
  localStorage.setItem(KEY, JSON.stringify(p));
  window.dispatchEvent(new Event('qiyu:cover-material'));
}
