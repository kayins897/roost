export type GlassMode = 'liquid' | 'frosted';
export type GlassTint = 'smoke' | 'deep-mint' | 'champagne';
export type GlassSettings = { mode: GlassMode; tint: GlassTint; refraction: number; blur: number; dispersion: number; depth: number; elasticity: number; actionsEnabled: boolean; actionBlur: number; actionOpacity: number };
export const glassDefaults: GlassSettings = { mode: 'liquid', tint: 'smoke', refraction: 100, blur: 3, dispersion: 10, depth: 8, elasticity: 25, actionsEnabled: true, actionBlur: 8, actionOpacity: 56 };
const ranges = { refraction: [0, 100], blur: [0, 12], dispersion: [0, 100], depth: [2, 20], elasticity: [0, 50], actionBlur: [0, 20], actionOpacity: [0, 100] } as const;
export function normalizeGlass(value: Partial<GlassSettings>, fallback = glassDefaults): GlassSettings {
  const result = { ...glassDefaults, mode: value.mode === 'liquid' || value.mode === 'frosted' ? value.mode : fallback.mode };
  result.tint = value.tint === 'smoke' || value.tint === 'deep-mint' || value.tint === 'champagne' ? value.tint : fallback.tint;
  result.actionsEnabled = typeof value.actionsEnabled === 'boolean' ? value.actionsEnabled : fallback.actionsEnabled;
  for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
    const n = value[key], [min, max] = ranges[key];
    result[key] = typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback[key];
  }
  return result;
}
