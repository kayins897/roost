import type { CoverFinish } from '../domain/gameRating.ts';

export interface CoverMaterialRange { min: number; max: number; finish: CoverFinish }
export interface CoverMaterialPreferences {
  strength: number; filter: number; speed: number; facets: boolean;
  enabled: boolean; mode: 'default' | 'uniform' | 'ranges';
  uniformFinish: Exclude<CoverFinish, 'standard'>; ranges: readonly CoverMaterialRange[];
}
export const DEFAULT_COVER_RANGES: readonly CoverMaterialRange[] = Object.freeze([
  Object.freeze({ min: 9, max: 9.4, finish: 'prismatic' }),
  Object.freeze({ min: 9.5, max: 10, finish: 'holographic' }),
]);
export const DEFAULT_COVER_MATERIAL: Readonly<CoverMaterialPreferences> = Object.freeze({
  strength: 1, filter: 1, speed: 1, facets: true, enabled: true, mode: 'default',
  uniformFinish: 'holographic', ranges: DEFAULT_COVER_RANGES,
});
const KEY = 'qiyu.cover-material.v1', EVENT = 'qiyu:cover-material';
const finishes = ['standard', 'holographic', 'prismatic'];
const unit = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
const score = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 10 && Math.abs(n * 10 - Math.round(n * 10)) < 1e-8;

/** Bounds are inclusive and use the same tenth-point precision as personal scores. */
export function coverRangeError(ranges: readonly CoverMaterialRange[]): string | undefined {
  if (!Array.isArray(ranges) || ranges.length > 20) return '最多设置 20 个评分区间';
  for (const range of ranges) {
    if (!range || !score(range.min) || !score(range.max) || range.min > range.max || !finishes.includes(range.finish)) return '区间须在 0–10 分内，最多一位小数，最低分不能超过最高分';
  }
  const sorted = [...ranges].sort((a, b) => a.min - b.min);
  if (sorted.some((range, index) => index > 0 && range.min <= sorted[index - 1].max)) return '评分区间不能重叠；上下界均包含在区间内';
}

function normalize(value: unknown): CoverMaterialPreferences {
  const p = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<CoverMaterialPreferences> : {};
  return {
    ...p,
    strength: unit(p.strength) ? p.strength : 1, filter: unit(p.filter) ? p.filter : 1, speed: unit(p.speed) ? p.speed : 1,
    facets: typeof p.facets === 'boolean' ? p.facets : true,
    enabled: typeof p.enabled === 'boolean' ? p.enabled : true,
    mode: ['default', 'uniform', 'ranges'].includes(p.mode ?? '') ? p.mode! : 'default',
    uniformFinish: p.uniformFinish === 'prismatic' ? 'prismatic' : 'holographic',
    ranges: Array.isArray(p.ranges) && !coverRangeError(p.ranges) ? p.ranges : DEFAULT_COVER_RANGES,
  };
}
let cachedRaw: string | null | undefined, cached = normalize(null);
/** Stable snapshot for React subscriptions; loading never rewrites the stored preference. */
export function loadCoverMaterial(): CoverMaterialPreferences {
  let raw: string | null;
  try { raw = localStorage.getItem(KEY); } catch { return cached; }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try { cached = normalize(JSON.parse(raw ?? 'null')); } catch { cached = normalize(null); }
  return cached;
}
export function saveCoverMaterial(p: CoverMaterialPreferences) {
  if (!p || !unit(p.strength) || !unit(p.filter) || !unit(p.speed) || typeof p.facets !== 'boolean'
    || typeof p.enabled !== 'boolean' || !['default', 'uniform', 'ranges'].includes(p.mode)
    || !['holographic', 'prismatic'].includes(p.uniformFinish)) throw new Error('卡面设置无效');
  const error = coverRangeError(p.ranges);
  if (error) throw new Error(error);
  localStorage.setItem(KEY, JSON.stringify(p));
  window.dispatchEvent(new Event(EVENT));
}

const listeners = new Set<() => void>();
function notify() { loadCoverMaterial(); listeners.forEach(listener => listener()); }
function storageChanged(event: StorageEvent) { if (event.key === KEY || event.key === null) notify(); }
export function subscribeCoverMaterial(listener: () => void): () => void {
  if (!listeners.size) { window.addEventListener(EVENT, notify); window.addEventListener('storage', storageChanged); }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { window.removeEventListener(EVENT, notify); window.removeEventListener('storage', storageChanged); }
  };
}

/** Only appearance mapping: caller retains ownership of media/category eligibility. */
export function configuredCoverFinish(personalScore: number | undefined, original: CoverFinish, p: CoverMaterialPreferences): CoverFinish {
  if (!p.enabled) return 'standard';
  if (p.mode === 'default') return original;
  if (p.mode === 'uniform') return p.uniformFinish;
  if (!score(personalScore)) return 'standard';
  return p.ranges.find(range => personalScore >= range.min && personalScore <= range.max)?.finish ?? 'standard';
}
