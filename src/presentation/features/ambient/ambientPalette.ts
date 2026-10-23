export type RGB = [number, number, number];
export type FluidPalette = [RGB, RGB, RGB];
export const backgroundPalettes = [
  { label: '香槟金', hue: 44, legacy: 33 }, { label: '深海蓝', hue: 210, legacy: 80 },
  { label: '极光绿', hue: 160, legacy: 67 }, { label: '紫罗兰', hue: 268, legacy: 100 }, { label: '绛红', hue: 355, legacy: 0 },
];
export const normalizeLook = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback;

/** Retain existing percentage values. The new default 33 selects the demo's 44°. */
export function ambientHue(value: number) {
  const stops = [32, 44, 166, 252], anchors = [0, 33, 67, 100];
  const n = normalizeLook(value, 33), i = n <= 33 ? 0 : n <= 67 ? 1 : 2;
  return stops[i] + (stops[i + 1] - stops[i]) * (n - anchors[i]) / (anchors[i + 1] - anchors[i]);
}
export function hsl(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const values = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return values.map(v => Math.round((v + m) * 255)) as RGB;
}
/** Exact dark HSL depth ramp from the standalone demo; no RGB white mixing. */
export function fluidPaletteFor(hue: number, theme: 'dark' | 'light', depth: number, paletteHue?: number): FluidPalette {
  const d = normalizeLook(depth, 22) / 100;
  const ramp = (deep: number, mid: number, pale: number) => d < .5 ? deep + (mid - deep) * d / .5 : mid + (pale - mid) * (d - .5) / .5;
  const angle = paletteHue ?? ambientHue(hue);
  if (theme === 'dark') return [hsl(angle, .85, ramp(0, .46, .62)), hsl(angle, .9, ramp(0, .305, .45)), hsl(angle, .5, ramp(0, .075, .10))];
  return [hsl(angle, .55, ramp(.93, .78, .68)), hsl(angle, .45, ramp(.97, .89, .82)), hsl(angle, .25, ramp(.99, .97, .94))];
}
export function ambientSwatches(theme: 'dark' | 'light') {
  const labels = theme === 'dark' ? ['暖琥珀', '香槟金', '薄荷青', '紫罗兰'] : ['淡金', '米香槟', '薄荷', '淡紫'];
  return [0, 33, 67, 100].map((hue, i) => ({ hue, label: labels[i], color: `rgb(${hsl(ambientHue(hue), .85, .55).join(',')})` }));
}
