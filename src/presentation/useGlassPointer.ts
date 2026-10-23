import { useEffect } from 'react';

/** Updates only the hovered glass surface; no component state or idle animation loop. */
export function useGlassPointer() {
  useEffect(() => {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reducedTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
    let attached = false;
    let frame: number | undefined;
    let active: HTMLElement | null = null;
    let latest: { surface: HTMLElement; x: number; y: number } | undefined;

    function clearSurface() {
      if (!active) return;
      active.removeAttribute('data-glass-active');
      active.style.removeProperty('--glass-x');
      active.style.removeProperty('--glass-y');
      active = null;
    }

    function reset() {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = undefined;
      latest = undefined;
      clearSurface();
    }

    function paint() {
      frame = undefined;
      const next = latest;
      if (!next || !next.surface.isConnected || document.hidden) { reset(); return; }
      if (active !== next.surface) { clearSurface(); active = next.surface; }
      const bounds = active.getBoundingClientRect();
      active.style.setProperty('--glass-x', `${(next.x - bounds.left).toFixed(1)}px`);
      active.style.setProperty('--glass-y', `${(next.y - bounds.top).toFixed(1)}px`);
      active.setAttribute('data-glass-active', 'true');
    }

    function move(event: PointerEvent) {
      if (event.pointerType === 'touch' || document.hidden) { reset(); return; }
      const surface = event.target instanceof Element ? event.target.closest<HTMLElement>('.sidebar-dock,.global-search') : null;
      if (!surface || surface.matches(':disabled')) { reset(); return; }
      latest = { surface, x: event.clientX, y: event.clientY };
      if (frame === undefined) frame = window.requestAnimationFrame(paint);
    }

    function leave(event: PointerEvent) { if (!event.relatedTarget) reset(); }
    function visibility() { if (document.hidden) reset(); }

    function detach() {
      if (attached) {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerout', leave);
        document.removeEventListener('visibilitychange', visibility);
        window.removeEventListener('blur', reset);
        attached = false;
      }
      reset();
    }

    function configure() {
      if (!finePointer.matches || reducedMotion.matches || reducedTransparency.matches) { detach(); return; }
      if (attached) return;
      document.addEventListener('pointermove', move, { passive: true });
      document.addEventListener('pointerout', leave, { passive: true });
      document.addEventListener('visibilitychange', visibility);
      window.addEventListener('blur', reset);
      attached = true;
    }

    const preferences = [finePointer, reducedMotion, reducedTransparency];
    for (const preference of preferences) preference.addEventListener('change', configure);
    configure();
    return () => {
      for (const preference of preferences) preference.removeEventListener('change', configure);
      detach();
    };
  }, []);
}
