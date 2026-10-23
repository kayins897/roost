import { hsl, type RGB } from './ambientPalette.ts';
import { desktopBridge } from '../../../infrastructure/repository.ts';

type Color = [number, number, number, number];
export const themeTransitionMs = 380;
export const easeTheme = (value: number) => { const p = Math.max(0, Math.min(1, value)); return p * p * (3 - 2 * p); };
export const mixRGB = (from: RGB, to: RGB, progress: number): RGB => from.map((v, i) => v + (to[i] - v) * progress) as RGB;

// State borders, danger actions and foil grades deliberately retain their semantic colors.
const gold: Record<string, string> = {
  '--accent': '#d7ba7d', '--accent-ink': '#f1e0b8', '--accent-soft': '#332b1d', '--accent-line': '#a58b58', '--hover': '#332c23', '--line': '#f4d28a26',
  '--control-fill': '#211f1b', '--control-hover': '#302b23', '--control-border': '#8b78533d', '--control-hover-border': '#c6a66580',
  '--control-selected': '#c5a66d', '--control-selected-ink': '#211b11', '--control-selected-border': '#ddc18b', '--control-ink': '#ded7c8', '--control-selected-solid': '#c5a66d',
};
function rgba(value: RGB, alpha = 1): Color { return [...value, alpha]; }
function parseColor(value: string): Color {
  const hex = value.trim().replace(/^#/, '');
  if (/^[\da-f]{6}(?:[\da-f]{2})?$/i.test(hex)) return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1];
  const channels = value.match(/[\d.]+/g)?.map(Number);
  return channels && channels.length >= 3 ? [channels[0], channels[1], channels[2], channels[3] ?? 1] : [0, 0, 0, 1];
}
export function themeToneFor(hue: number): Record<string, Color> {
  const normalized = ((hue % 360) + 360) % 360;
  if (Math.abs(normalized - 44) < .01) return { ...Object.fromEntries(Object.entries(gold).map(([key, color]) => [key, parseColor(color)])), '--theme-ambient': rgba(hsl(normalized, .85, .5)) };
  const color = (s: number, l: number, a = 1) => rgba(hsl(normalized, s, l), a);
  return {
    '--accent': color(.5, .73), '--accent-ink': color(.38, .84), '--accent-soft': color(.28, .16), '--accent-line': color(.3, .48), '--hover': color(.23, .17), '--line': color(.45, .7, .15),
    '--control-fill': color(.17, .12), '--control-hover': color(.23, .17), '--control-border': color(.3, .48, .3), '--control-hover-border': color(.45, .66, .56),
    '--control-selected': color(.42, .72), '--control-selected-ink': color(.24, .095), '--control-selected-border': color(.46, .79), '--control-ink': color(.2, .84), '--control-selected-solid': color(.42, .72),
    '--theme-ambient': color(.85, .5),
  };
}
/** A finite UI transition, independent of background motion. It never writes preferences. */
export function applyThemeTone(root: HTMLElement, hue: number) {
  const target = themeToneFor(hue), styles = getComputedStyle(root);
  const from = Object.fromEntries(Object.entries(target).map(([key, fallback]) => [key, styles.getPropertyValue(key).trim() ? parseColor(styles.getPropertyValue(key)) : fallback]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const nativeVisible = () => { try { return desktopBridge?.getInfo()?.windowVisible ?? true; } catch { return true; } };
  let raf = 0, disposed = false;
  const started = performance.now(), first = root.dataset.themeTone === undefined;
  root.dataset.themeTone = String(hue);
  function paint(progress: number) {
    for (const [key, to] of Object.entries(target)) {
      const color = from[key].map((v, i) => v + (to[i] - v) * progress);
      root.style.setProperty(key, `rgb(${color.slice(0, 3).map(v => v.toFixed(2)).join(' ')} / ${color[3].toFixed(4)})`);
    }
  }
  function finish() { if (raf) cancelAnimationFrame(raf); raf = 0; paint(1); }
  function tick(now: number) {
    raf = 0; if (disposed) return;
    const p = Math.min(1, (now - started) / themeTransitionMs); paint(easeTheme(p));
    if (p < 1) raf = requestAnimationFrame(tick);
  }
  function changed() { if (reduced.matches || document.hidden || !nativeVisible()) finish(); }
  const same = Object.entries(target).every(([key, to]) => to.every((v, i) => Math.abs(v - from[key][i]) < .001));
  if (first || same || reduced.matches || document.hidden || !nativeVisible()) finish(); else raf = requestAnimationFrame(tick);
  const releaseVisibility = desktopBridge?.onWindowVisibility?.(visible => { if (!visible) finish(); });
  reduced.addEventListener('change', changed); document.addEventListener('visibilitychange', changed);
  return () => { disposed = true; if (raf) cancelAnimationFrame(raf); releaseVisibility?.(); reduced.removeEventListener('change', changed); document.removeEventListener('visibilitychange', changed); };
}
