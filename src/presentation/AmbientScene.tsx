import { useEffect, useRef, type CSSProperties } from 'react';
import { desktopBridge } from '../infrastructure/repository.ts';
import { attachAmbientEngine, type AmbientLook } from './features/ambient/ambientEngine.ts';
import { ambientHue, hsl, normalizeLook } from './features/ambient/ambientPalette.ts';
import { normalizeAmbientSettings, type AmbientSettings } from './features/ambient/ambientSettings.ts';
import './ambient.css';
export { useAmbientMotion } from './features/ambient/ambientPreference.ts';
export { ambientSwatches } from './features/ambient/ambientPalette.ts';
export type { AmbientSettings } from './features/ambient/ambientSettings.ts';

/** React/native adapter. Particle, WebGL and drift algorithms live in the ambient feature. */
export function AmbientScene({ animated, theme, hue = 33, strength = 60, depth = 22, speed = 14, swirl = 12, settings }: { animated: boolean; theme: 'dark' | 'light'; hue?: number; strength?: number; depth?: number; speed?: number; swirl?: number; settings?: Partial<AmbientSettings> }) {
  const sceneRef = useRef<HTMLDivElement>(null), fluidRef = useRef<HTMLCanvasElement>(null), starsRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<ReturnType<typeof attachAmbientEngine> | null>(null);
  const lookRef = useRef<AmbientLook>({ animated, theme, hue, strength, depth, speed, swirl });
  const controls = normalizeAmbientSettings(settings ?? {});
  lookRef.current = { ...controls, animated, theme, hue: normalizeLook(hue, 33), strength: normalizeLook(strength, 60), depth: normalizeLook(depth, 22), speed: normalizeLook(speed, 14), swirl: normalizeLook(swirl, 12) };
  const amount = normalizeLook(strength, 60) / 100;
  const style = {
    '--ambient-main': hsl(controls.paletteHue ?? ambientHue(hue), .85, .5).join(' '),
    '--ambient-field-opacity': .45 + amount * .85,
    '--ambient-particle-opacity': Math.min(1, .4 + amount),
    '--ambient-fluid-opacity': theme === 'dark' ? Math.min(1, .7 + amount * .5) : .3 + amount * .4,
  } as CSSProperties;
  useEffect(() => {
    if (!sceneRef.current || !fluidRef.current || !starsRef.current) return;
    const readVisible = () => { try { return desktopBridge?.getInfo()?.windowVisible ?? true; } catch { return true; } };
    const handle = attachAmbientEngine(sceneRef.current, fluidRef.current, starsRef.current, lookRef.current, readVisible());
    handleRef.current = handle;
    let timer: number | undefined;
    const refresh = () => {
      handle.setVisible(readVisible());
      if (timer !== undefined) clearTimeout(timer);
      timer = window.setTimeout(() => { timer = undefined; handle.setVisible(readVisible()); }, 100);
    };
    const release = desktopBridge?.onWindowVisibility?.(visible => { handle.setVisible(visible); if (visible) refresh(); });
    window.addEventListener('focus', refresh); window.addEventListener('pageshow', refresh);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', refresh); release?.();
      handle.dispose(); handleRef.current = null;
    };
  }, []);
  useEffect(() => { handleRef.current?.update(lookRef.current); }, [animated, theme, hue, strength, depth, speed, swirl, controls.fluidEnabled, controls.starsEnabled, controls.parallax, controls.density, controls.paletteHue, controls.distortion, controls.brushStrength, controls.brushRadius]);
  return <div ref={sceneRef} className="ambient-scene" style={style} data-motion="static" data-fluid="off" data-scene="star-river" data-depth-layers="2" data-streams="6" aria-hidden="true">
    <canvas ref={fluidRef} className="ambient-scene__fluid" />
    <div className="ambient-scene__field ambient-scene__field--far" />
    <div className="ambient-scene__field ambient-scene__field--near" />
    <div className="ambient-scene__field ambient-scene__field--ember" />
    <canvas ref={starsRef} className="ambient-scene__particles" />
    <div className="ambient-scene__vignette" />
  </div>;
}
