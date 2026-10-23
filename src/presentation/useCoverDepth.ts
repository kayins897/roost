import { useEffect } from 'react';

/** Only the hovered cover gets a camera; labels and collection layout stay still. */
export function useCoverDepth() {
  useEffect(() => {
    const pointer = matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let active: HTMLElement | null = null;
    let frame: number | undefined;
    let latest: { cover: HTMLElement; x: number; y: number } | undefined;
    const properties = ['--cover-rx', '--cover-ry', '--cover-x', '--cover-y', '--cover-light-x', '--cover-light-y', '--cover-angle'];
    function reset() {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined; latest = undefined;
      if (active) { active.removeAttribute('data-depth'); properties.forEach(name => active!.style.removeProperty(name)); }
      active = null;
    }
    function paint() {
      frame = undefined;
      if (!latest || !latest.cover.isConnected || document.hidden) { reset(); return; }
      if (active !== latest.cover) {
        if (active) { active.removeAttribute('data-depth'); properties.forEach(name => active!.style.removeProperty(name)); }
        active = latest.cover;
      }
      const { x, y } = latest;
      active.style.setProperty('--cover-angle', `${(45 + x * 7 - y * 5).toFixed(1)}deg`);
      active.dataset.depth = 'active';
      active.style.setProperty('--cover-rx', `${(-y * 14).toFixed(2)}deg`);
      active.style.setProperty('--cover-ry', `${(x * 18).toFixed(2)}deg`);
      active.style.setProperty('--cover-x', `${(-x * 5).toFixed(2)}px`);
      active.style.setProperty('--cover-y', `${(-y * 5).toFixed(2)}px`);
      active.style.setProperty('--cover-light-x', `${(62 + x * 12).toFixed(1)}%`);
      active.style.setProperty('--cover-light-y', `${(38 + y * 10).toFixed(1)}%`);
    }
    function move(event: PointerEvent) {
      if (!pointer.matches || reduced.matches || event.pointerType === 'touch' || document.hidden) { reset(); return; }
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>('.media-card--grid:not([data-selecting])') : null;
      const cover = card && event.target instanceof Element ? event.target.closest<HTMLElement>('.card-cover') : null;
      if (!cover || !card) { reset(); return; }
      const rect = card.getBoundingClientRect();
      const bounds = { left: rect.left, top: rect.top, width: cover.offsetWidth, height: cover.offsetHeight };
      latest = { cover, x: Math.max(-.5, Math.min(.5, (event.clientX - bounds.left) / bounds.width - .5)), y: Math.max(-.5, Math.min(.5, (event.clientY - bounds.top) / bounds.height - .5)) };
      if (frame === undefined) frame = requestAnimationFrame(paint);
    }
    function leave(event: PointerEvent) {
      if (!(event.relatedTarget instanceof Element) || !event.relatedTarget.closest('.media-card--grid')) reset();
    }
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerout', leave, { passive: true });
    document.addEventListener('visibilitychange', reset);
    document.addEventListener('scroll', reset, { passive: true, capture: true });
    window.addEventListener('blur', reset);
    pointer.addEventListener('change', reset); reduced.addEventListener('change', reset);
    return () => {
      reset(); document.removeEventListener('pointermove', move); document.removeEventListener('pointerout', leave);
      document.removeEventListener('visibilitychange', reset); document.removeEventListener('scroll', reset, true);
      window.removeEventListener('blur', reset); pointer.removeEventListener('change', reset); reduced.removeEventListener('change', reset);
    };
  }, []);
}
