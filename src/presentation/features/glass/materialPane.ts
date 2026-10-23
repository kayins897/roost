import { buildGlassFilter, type GlassFilter } from './glassFilter.ts';
import type { GlassSettings } from './glassOptions.ts';

export type GlassEffective = 'liquid' | 'frosted' | 'solid';
export interface MaterialPane {
  host: HTMLElement;
  configure: (effective: GlassEffective, animate: boolean) => void;
  feed: (x: number, y: number, on: boolean) => void;
  reset: () => void;
  dispose: () => void;
}

/** Keeps reference spring 180/20, elasticity .25 and two masked rim lights. */
export function createMaterialPane(host: HTMLElement, settings: GlassSettings, defs: SVGSVGElement): MaterialPane | null {
  const effect = host.querySelector<HTMLElement>(':scope > .glass-material__effect');
  const highlight = host.querySelector<HTMLElement>(':scope > .glass-material__highlight');
  if (!effect || !highlight) return null;
  host.style.setProperty('--material-blur', `${settings.blur}px`);
  let filter: GlassFilter | null = null, effective: GlassEffective = 'frosted', animated = false, frame = 0, disposed = false;
  const button = host.dataset.materialGlass === 'button';
  const current = { scale: 0, x: 0, y: 0, spec: 0 }, velocity = { scale: 0, x: 0, y: 0 };
  let target = { scale: 0, x: 0, y: 0, spec: 0 };
  const scale = () => filter?.displacements.forEach((node, i) => node.setAttribute('scale', String(Math.max(0, filter!.ratios[i] * current.scale))));
  function reset() {
    cancelAnimationFrame(frame); frame = 0;
    current.scale = filter?.baseScale ?? 0; current.x = current.y = current.spec = 0;
    velocity.scale = velocity.x = velocity.y = 0;
    target = { scale: current.scale, x: 0, y: 0, spec: 0 };
    host.style.removeProperty('translate');
    highlight!.style.setProperty('--ngs-spec-o', '0');
    highlight!.style.removeProperty('--ngx'); highlight!.style.removeProperty('--ngy');
    filter?.brightness.forEach(node => node.setAttribute('slope', '1.1'));
    scale();
  }
  function rebuild() {
    reset(); filter?.svg.remove(); filter = null; effect!.style.removeProperty('backdrop-filter');
    if (effective !== 'liquid') return;
    const width = host.offsetWidth, height = host.offsetHeight;
    if (width < 2 || height < 2) return;
    const raw = Number.parseFloat(getComputedStyle(host).borderTopLeftRadius);
    const radius = Math.min(Number.isFinite(raw) ? raw : 24, width / 2, height / 2);
    filter = buildGlassFilter(width, height, radius, settings);
    if (!filter) { host.dataset.glassEffective = 'frosted'; return; }
    defs.appendChild(filter.svg);
    effect!.style.backdropFilter = `url(#${filter.svg.querySelector('filter')!.id})`;
    reset();
  }
  function tick() {
    frame = 0; if (disposed || !animated) return;
    let active = false;
    for (const key of ['scale', 'x', 'y'] as const) {
      velocity[key] += (180 * (target[key] - current[key]) - 20 * velocity[key]) / 60;
      current[key] += velocity[key] / 60;
      if (Math.abs(target[key] - current[key]) > .01 || Math.abs(velocity[key]) > .01) active = true;
    }
    current.spec += (target.spec - current.spec) * .18;
    if (Math.abs(target.spec - current.spec) < .005) current.spec = target.spec;
    else active = true;
    if (!active) {
      current.scale = target.scale; current.x = target.x; current.y = target.y;
      velocity.scale = velocity.x = velocity.y = 0;
    }
    // Individual translate preserves the extension button's horizontal centering.
    host.style.translate = `${current.x.toFixed(2)}px ${current.y.toFixed(2)}px`;
    highlight!.style.setProperty('--ngs-spec-o', current.spec.toFixed(3));
    scale();
    if (active) frame = requestAnimationFrame(tick);
  }
  const observer = new ResizeObserver(rebuild); observer.observe(host);
  return {
    host,
    configure(next, animate) {
      const changed = effective !== next || !host.dataset.glassEffective;
      effective = next; animated = animate;
      host.dataset.glassEffective = next;
      if (changed) rebuild();
      if (!animate) reset();
    },
    feed(x, y, on) {
      if (!animated) { reset(); return; }
      if (!on && target.spec === 0 && current.spec === 0 && current.x === 0 && current.y === 0 && !frame) return;
      const base = filter?.baseScale ?? 0;
      if (!on) {
        target = { scale: base, x: 0, y: 0, spec: 0 };
        highlight!.style.removeProperty('--ngx'); highlight!.style.removeProperty('--ngy');
      } else {
        const rect = host.getBoundingClientRect();
        const nx = (x - rect.left) / rect.width - .5, ny = (y - rect.top) / rect.height - .5;
        const elasticity = settings.elasticity / 100 * (button ? .6 : 1), distance = Math.min(1, Math.hypot(nx, ny) * 2);
        target = { scale: base * (1 + elasticity * .5 * (1 - distance * .6)), x: nx * elasticity * 24, y: ny * elasticity * 24, spec: 1 };
        highlight!.style.setProperty('--ngx', `${((nx + .5) * 100).toFixed(2)}%`);
        highlight!.style.setProperty('--ngy', `${((ny + .5) * 100).toFixed(2)}%`);
      }
      filter?.brightness.forEach(node => node.setAttribute('slope', String(on && button ? 1.6 : 1.1)));
      if (!frame) frame = requestAnimationFrame(tick);
    },
    reset,
    dispose() {
      disposed = true; reset(); observer.disconnect(); filter?.svg.remove();
      effect!.style.removeProperty('backdrop-filter'); delete host.dataset.glassEffective;
      host.style.removeProperty('--material-blur');
      highlight!.style.removeProperty('--ngs-spec-o');
    },
  };
}
