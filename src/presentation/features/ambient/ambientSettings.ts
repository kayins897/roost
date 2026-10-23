/** Standalone demo controls; the existing hue percentage remains a separate legacy field. */
export type AmbientSettings = {
  fluidEnabled: boolean;
  starsEnabled: boolean;
  parallax: number;
  density: number;
  paletteHue?: number;
  distortion: number;
  brushStrength: number;
  brushRadius: number;
};
export const ambientSettingsDefaults: AmbientSettings = {
  fluidEnabled: true, starsEnabled: true, parallax: 100, density: 60,
  paletteHue: undefined, distortion: 20, brushStrength: 0, brushRadius: .22,
};
const bounded = (value: unknown, low: number, high: number, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
export function normalizeAmbientSettings(value: Partial<AmbientSettings>): AmbientSettings {
  return {
    fluidEnabled: typeof value.fluidEnabled === 'boolean' ? value.fluidEnabled : true,
    starsEnabled: typeof value.starsEnabled === 'boolean' ? value.starsEnabled : true,
    parallax: bounded(value.parallax, 0, 150, 100), density: bounded(value.density, 10, 100, 60),
    paletteHue: typeof value.paletteHue === 'number' && Number.isFinite(value.paletteHue) ? bounded(value.paletteHue, 0, 360, 44) : undefined,
    distortion: bounded(value.distortion, 0, 60, 20), brushStrength: bounded(value.brushStrength, 0, 2.5, 0), brushRadius: bounded(value.brushRadius, .05, .5, .22),
  };
}
