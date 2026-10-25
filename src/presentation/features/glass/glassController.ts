import { desktopBridge } from '../../../infrastructure/repository.ts';
import { createMaterialPane, type MaterialPane } from './materialPane.ts';
import type { GlassSettings } from './glassOptions.ts';

const selector = '[data-material-glass]';
export function startGlassMaterials(settings: GlassSettings) {
  const { mode } = settings;
  const queries = {
    motion: matchMedia('(prefers-reduced-motion: reduce)'),
    transparency: matchMedia('(prefers-reduced-transparency: reduce)'),
    coarse: matchMedia('(hover: none), (pointer: coarse)'),
  };
  const supported = CSS.supports('backdrop-filter', 'url(#qiyu-material-support)');
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  defs.classList.add('glass-material__defs'); defs.setAttribute('aria-hidden', 'true'); document.body.appendChild(defs);
  const panes = new Map<HTMLElement, MaterialPane>();
  let visible = true;
  try { visible = desktopBridge?.getInfo().windowVisible ?? true; } catch { /* Browser-only material. */ }
  function configure() {
    const effective = queries.transparency.matches ? 'solid' : mode === 'liquid' && supported && !queries.motion.matches && !queries.coarse.matches ? 'liquid' : 'frosted';
    const animated = visible && !document.hidden && !queries.motion.matches && !queries.transparency.matches && !queries.coarse.matches;
    for (const pane of panes.values()) pane.configure(effective, animated);
  }
  function collect() {
    for (const [host, pane] of panes) if (!host.isConnected || !host.matches(selector)) { pane.dispose(); panes.delete(host); }
    document.querySelectorAll<HTMLElement>(selector).forEach(host => {
      if (panes.has(host)) return;
      const pane = createMaterialPane(host, settings, defs);
      if (pane) panes.set(host, pane);
    });
    configure();
  }
  collect();
  const observer = new MutationObserver(records => {
    if (records.some(record => record.type === 'attributes' || [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && (node.matches(selector) || node.querySelector(selector))))) collect();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-material-glass'] });
  function move(event: PointerEvent) {
    if (event.pointerType === 'touch') return;
    const target = event.target;
    for (const pane of panes.values()) pane.feed(event.clientX, event.clientY, target instanceof Node && pane.host.contains(target));
  }
  const reset = () => { for (const pane of panes.values()) pane.reset(); };
  function leave(event: PointerEvent) { if (!event.relatedTarget) for (const pane of panes.values()) pane.feed(0, 0, false); }
  const release = desktopBridge?.onWindowVisibility?.(value => { visible = value; configure(); });
  Object.values(queries).forEach(query => query.addEventListener('change', configure));
  document.addEventListener('visibilitychange', configure);
  document.addEventListener('pointermove', move, { passive: true });
  document.addEventListener('pointerout', leave, { passive: true });
  window.addEventListener('blur', reset);
  return () => {
    observer.disconnect(); release?.(); Object.values(queries).forEach(query => query.removeEventListener('change', configure));
    document.removeEventListener('visibilitychange', configure); document.removeEventListener('pointermove', move); document.removeEventListener('pointerout', leave);
    window.removeEventListener('blur', reset);
    for (const pane of panes.values()) pane.dispose(); panes.clear(); defs.remove();
  };
}
