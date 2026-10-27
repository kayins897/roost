import { useEffect } from 'react';
import { loadCoverMaterial } from '../../../infrastructure/coverMaterialPreferences.ts';
import { createHoloRenderer } from './holoRenderer.ts';
import './materials.css';
export function useHoloCovers() {
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)'), pointer = matchMedia('(hover: hover) and (pointer: fine)');
    let renderer: ReturnType<typeof createHoloRenderer> = null, active: HTMLElement | null = null, prefs = loadCoverMaterial();
    let activeFinish = '';
    let raf = 0, previous = 0, time = 0, x = 0, y = 0, tx = 0, ty = 0;
    function stop() { cancelAnimationFrame(raf); raf = 0; previous = 0; active?.removeAttribute('data-webgl-material'); renderer?.detach(); active = null; activeFinish = ''; }
    function tick(now: number) {
      raf = 0;
      if (!active?.isConnected || document.hidden || active.closest('[data-selecting]') || !['foil', 'holographic', 'prismatic'].includes(active.dataset.finish ?? '')) { stop(); return; }
      if (activeFinish !== active.dataset.finish) { activeFinish = active.dataset.finish!; renderer?.attach(active, activeFinish as 'foil' | 'holographic' | 'prismatic'); }
      const dt = previous ? Math.min(.05, (now - previous) / 1000) : 1 / 60; previous = now;
      const easing = 1 - Math.exp(-dt * 12); x += (tx - x) * easing; y += (ty - y) * easing;
      time += reduced.matches ? 0 : dt * prefs.speed; renderer?.draw(time, x, y, prefs);
      if (!reduced.matches && (prefs.speed > 0 || Math.abs(x - tx) + Math.abs(y - ty) > .001)) raf = requestAnimationFrame(tick);
    }
    function request() { if (!raf) raf = requestAnimationFrame(tick); }
    function move(event: PointerEvent) {
      if (event.pointerType === 'touch' || !pointer.matches || document.hidden) { stop(); return; }
      const cover = event.target instanceof Element ? event.target.closest<HTMLElement>('.media-card--grid:not([data-selecting]) .card-cover') : null;
      const finish = cover?.dataset.finish;
      if (!cover || !cover.querySelector('img') || !['foil', 'holographic', 'prismatic'].includes(finish ?? '')) { stop(); return; }
      if (active !== cover) {
        stop(); renderer ??= createHoloRenderer(request); if (!renderer) return;
        active = cover; activeFinish = finish!; x = 0; y = 0; renderer.attach(cover, finish as 'foil' | 'holographic' | 'prismatic');
      }
      const bounds = cover.getBoundingClientRect(); tx = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1)); ty = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      if (reduced.matches) { x = tx; y = ty; } request();
    }
    function out(event: PointerEvent) { if (!active?.contains(event.relatedTarget as Node | null)) stop(); }
    function update() { prefs = loadCoverMaterial(); if (active) request(); }
    document.addEventListener('pointermove', move, { passive: true }); document.addEventListener('pointerout', out, { passive: true });
    document.addEventListener('visibilitychange', stop); document.addEventListener('scroll', stop, { passive: true, capture: true }); window.addEventListener('blur', stop);
    window.addEventListener('qiyu:cover-material', update); reduced.addEventListener('change', stop);
    return () => { stop(); renderer?.dispose(); document.removeEventListener('pointermove', move); document.removeEventListener('pointerout', out); document.removeEventListener('visibilitychange', stop); document.removeEventListener('scroll', stop, true); window.removeEventListener('blur', stop); window.removeEventListener('qiyu:cover-material', update); reduced.removeEventListener('change', stop); };
  }, []);
}
