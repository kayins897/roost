import { attachFluidBoard } from './fluidEngine.ts';
import { fluidPaletteFor, type FluidPalette } from './ambientPalette.ts';
import { createFrameClock } from './frameClock.ts';
import { easeTheme, mixRGB, themeTransitionMs } from './themeTone.ts';
import { applyDrift } from './ambientDrift.ts';
import { createStarRiver, type StarPointer } from './starRiver.ts';
import { normalizeAmbientSettings, type AmbientSettings } from './ambientSettings.ts';

export type AmbientLook = Partial<AmbientSettings> & { animated: boolean; theme: 'dark' | 'light'; hue: number; strength: number; depth: number; speed: number; swirl: number };
/** DOM adapter: all animation shares the same explicit visibility/accessibility gates. */
export function attachAmbientEngine(scene: HTMLDivElement, fluidCanvas: HTMLCanvasElement, starCanvas: HTMLCanvasElement, initial: AmbientLook, initialVisible: boolean) {
  let look = { ...initial, ...normalizeAmbientSettings(initial) }, nativeVisible = initialVisible, raf = 0, elapsed = 0, disposed = false;
  const frameClock = createFrameClock(60);
  let palette = fluidPaletteFor(look.hue, look.theme, look.depth, look.paletteHue);
  let paletteFade: { from: FluidPalette; to: FluidPalette; started: number } | null = null;
  let width = 1, height = 1, resizeRaf = 0;
  const motion = matchMedia('(prefers-reduced-motion: reduce)'), transparency = matchMedia('(prefers-reduced-transparency: reduce)'), fine = matchMedia('(hover: hover) and (pointer: fine)');
  // Keep frame clocks event-driven; do not poll MediaQueryList state inside rAF.
  let motionReduced = motion.matches, transparencyReduced = transparency.matches;
  const pointer: StarPointer = { x: -9999, y: -9999, vx: 0, vy: 0, active: false, dragging: false };
  const drift = { mx: 0, my: 0, smx: 0, smy: 0 };
  const river = createStarRiver(starCanvas, pointer);
  const visible = () => nativeVisible && !document.hidden;
  const running = () => look.animated && (look.fluidEnabled || look.starsEnabled) && !motionReduced && !transparencyReduced && visible();
  let available = false;
  function displayedPalette(now = performance.now()): FluidPalette {
    if (!paletteFade) return palette;
    const p = Math.min(1, (now - paletteFade.started) / themeTransitionMs);
    const value = paletteFade.from.map((color, i) => mixRGB(color, paletteFade!.to[i], easeTheme(p))) as FluidPalette;
    if (p >= 1) { palette = paletteFade.to; paletteFade = null; }
    return value;
  }
  const fading = () => paletteFade !== null && visible() && !motionReduced && !transparencyReduced && available && look.fluidEnabled;
  const fluid = attachFluidBoard(fluidCanvas, {
    getPalette: displayedPalette, getSpeed: () => look.speed, getSwirl: () => look.swirl,
    getDistortion: () => look.distortion, getBrushStrength: () => look.brushStrength, getBrushRadius: () => look.brushRadius,
    onAvailability: value => { available = value; configure(); },
  });
  available = fluid !== null;
  function resetPointer() {
    pointer.active = pointer.dragging = false; pointer.x = pointer.y = -9999; pointer.vx = pointer.vy = 0;
    drift.mx = drift.my = 0;
  }
  function draw(delta = 0) {
    if (look.starsEnabled) river.draw(elapsed, delta, look.theme);
    applyDrift(fluidCanvas, starCanvas, drift, elapsed, running(), look.parallax);
    scene.style.setProperty('--scene-x', `${(-drift.smx * 20 * look.parallax / 100).toFixed(2)}px`);
    scene.style.setProperty('--scene-y', `${(-drift.smy * 13 * look.parallax / 100).toFixed(2)}px`);
  }
  function tick(now: number) {
    raf = 0;
    if ((!running() && !fading()) || disposed) return;
    const dt = frameClock.step(now);
    if (dt !== null) {
      const moving = running();
      if (moving) {
        elapsed += dt;
        const k = 1 - Math.exp(-10 * dt);
        drift.smx += (drift.mx - drift.smx) * k; drift.smy += (drift.my - drift.smy) * k;
        pointer.vx *= Math.pow(.94, dt * 60); pointer.vy *= Math.pow(.94, dt * 60);
      }
      // Static backgrounds may repaint only for this finite palette transition.
      if (!moving && fading()) fluid?.once();
      draw(moving ? dt : 0);
    }
    if (running() || fading()) raf = requestAnimationFrame(tick);
  }
  function configure() {
    if (disposed) return;
    if (raf) cancelAnimationFrame(raf); raf = 0; frameClock.reset();
    if (!visible() || motionReduced || transparencyReduced) { if (paletteFade) palette = paletteFade.to; paletteFade = null; }
    const moving = running(), fluidVisible = available && look.fluidEnabled && !transparencyReduced;
    scene.dataset.motion = !visible() ? 'paused' : moving ? 'animated' : 'static';
    scene.dataset.motionReason = !nativeVisible ? 'native-hidden' : document.hidden ? 'document-hidden' : !look.animated ? 'user-disabled' : motionReduced ? 'system-reduced-motion' : transparencyReduced ? 'system-reduced-transparency' : 'running';
    scene.dataset.nativeVisible = String(nativeVisible); scene.dataset.documentVisible = String(!document.hidden);
    scene.dataset.fluid = fluidVisible ? 'on' : 'off'; scene.dataset.fluidAvailable = String(available);
    scene.dataset.stars = look.starsEnabled ? 'on' : 'off';
    if (!look.starsEnabled) river.clear();
    fluid?.setRunning(moving && fluidVisible);
    if (!moving) { resetPointer(); drift.smx = drift.smy = 0; }
    if (visible()) { if (fluidVisible) fluid?.once(); draw(); }
    if (moving || fading()) raf = requestAnimationFrame(tick);
  }
  function resize() {
    resizeRaf = 0; const rect = scene.getBoundingClientRect(); width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    scene.dataset.particles = String(river.resize(width, height, look.density));
    if (visible()) { if (available && look.fluidEnabled && !transparencyReduced) fluid?.once(); draw(); }
  }
  function scheduleResize() { if (!resizeRaf) resizeRaf = requestAnimationFrame(resize); }
  function move(event: PointerEvent) {
    if (!running() || !fine.matches || event.pointerType === 'touch') return;
    if (pointer.active) { pointer.vx += (event.clientX - pointer.x - pointer.vx) * .5; pointer.vy += (event.clientY - pointer.y - pointer.vy) * .5; }
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true;
    drift.mx = Math.max(-1, Math.min(1, event.clientX / width * 2 - 1)); drift.my = Math.max(-1, Math.min(1, event.clientY / height * 2 - 1));
  }
  function out(event: PointerEvent) { if (!event.relatedTarget) resetPointer(); }
  function down(event: PointerEvent) {
    if (!running() || !fine.matches || event.pointerType === 'touch' || event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest('button,a,input,select,textarea,label,[role="button"],.media-card,.modal,.detail-panel,.sidebar-dock,.topbar,.filter-expanded,.status-tabs,.library-views,.collection-toolbar,.tag-panel,.selection-toolbar,.toast,.context-menu,.search-box')) return;
    pointer.dragging = true; if (look.starsEnabled) river.ripple(event.clientX, event.clientY);
  }
  function up() { pointer.dragging = false; }
  function motionChanged(event: MediaQueryListEvent) { motionReduced = event.matches; configure(); }
  function transparencyChanged(event: MediaQueryListEvent) { transparencyReduced = event.matches; configure(); }
  resize(); configure();
  window.addEventListener('resize', scheduleResize, { passive: true }); window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerout', out, { passive: true }); window.addEventListener('pointerdown', down, { passive: true });
  window.addEventListener('pointerup', up, { passive: true }); window.addEventListener('pointercancel', up, { passive: true }); window.addEventListener('blur', resetPointer);
  document.addEventListener('visibilitychange', configure); motion.addEventListener('change', motionChanged); transparency.addEventListener('change', transparencyChanged); fine.addEventListener('change', resetPointer);
  return {
    update(next: AmbientLook) {
      const previousDensity = look.density;
      const now = performance.now(), current = displayedPalette(now);
      look = { ...next, ...normalizeAmbientSettings(next) };
      const target = fluidPaletteFor(look.hue, look.theme, look.depth, look.paletteHue);
      const previousTarget = paletteFade?.to ?? palette;
      if (target.some((color, i) => color.some((v, c) => v !== previousTarget[i][c]))) {
        palette = target;
        paletteFade = visible() && !motionReduced && !transparencyReduced ? { from: current, to: target, started: now } : null;
      }
      if (look.density !== previousDensity) resize();
      configure();
    },
    setVisible(value: boolean) { nativeVisible = value; configure(); },
    dispose() {
      disposed = true; if (raf) cancelAnimationFrame(raf); if (resizeRaf) cancelAnimationFrame(resizeRaf); fluid?.dispose();
      window.removeEventListener('resize', scheduleResize); window.removeEventListener('pointermove', move); window.removeEventListener('pointerout', out);
      window.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('blur', resetPointer);
      document.removeEventListener('visibilitychange', configure); motion.removeEventListener('change', motionChanged); transparency.removeEventListener('change', transparencyChanged); fine.removeEventListener('change', resetPointer);
    },
  };
}
