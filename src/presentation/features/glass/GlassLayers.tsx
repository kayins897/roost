import type { GlassMode } from '../../glassKit.ts';

export function GlassLayers() {
  return <><i className="glass-material__effect" aria-hidden="true" /><i className="glass-material__highlight" aria-hidden="true" /></>;
}

export type GlassMaterialOptions = { mode: GlassMode; refraction: number };
