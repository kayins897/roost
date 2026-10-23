import { createFluidResources } from './fluidResources.ts';
import type { FluidPalette } from './ambientPalette.ts';
import { createFrameClock } from './frameClock.ts';
export interface FluidBoardOptions {
  getPalette: () => FluidPalette;
  getSpeed: () => number;
  getSwirl: () => number;
  getDistortion?: () => number;
  getBrushStrength?: () => number;
  getBrushRadius?: () => number;
  onAvailability?: (available: boolean) => void;
}
export interface FluidBoardHandle { setRunning(on: boolean): void; once(): void; dispose(): void }

/** Demo two-pass shader with bounded clocks, target resizing and explicit GPU ownership. */
export function attachFluidBoard(canvas: HTMLCanvasElement, options: FluidBoardOptions): FluidBoardHandle | null {
  let gl: WebGL2RenderingContext | null;
  try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, powerPreference: 'low-power' }); }
  catch { return null; }
  if (!gl) return null;
  const context = gl;
  let resources = createFluidResources(context);
  if (!resources) return null;
  type Target = ReturnType<NonNullable<typeof resources>['target']>;
  let targets: [Target, Target] | null = null;
  let width = 0, height = 0, fw = 0, fh = 0, flip = false;
  let raf = 0, elapsed = 0, wantsRunning = false, disposed = false;
  const frameClock = createFrameClock(60);
  const pointer = { x: .5, y: .5, smoothX: .5, smoothY: .5, vx: 0, vy: 0 };
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  function uniform(pass: 'flow' | 'display', name: string) {
    const key = `${pass}:${name}`;
    if (!uniforms.has(key)) uniforms.set(key, context.getUniformLocation(resources![pass], name));
    return uniforms.get(key)!;
  }
  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(2, Math.round(canvas.clientWidth * ratio)), h = Math.max(2, Math.round(canvas.clientHeight * ratio));
    if (w === width && h === height && targets) return;
    width = w; height = h; canvas.width = w; canvas.height = h;
    fw = Math.max(2, Math.round(w / 4)); fh = Math.max(2, Math.round(h / 4));
    resources!.releaseTargets(); targets = [resources!.target(fw, fh), resources!.target(fw, fh)]; flip = false;
  }
  function paint(delta = 0) {
    if (!resources || context.isContextLost() || disposed) return;
    try { resize(); } catch { fail(); return; }
    // Preserve the demo's 30 Hz flow damping while rendering twice as often.
    const steps = delta * 30, smooth = 1 - Math.pow(.88, steps), velocity = 1 - Math.pow(.85, steps);
    pointer.vx *= Math.pow(.94, steps); pointer.vy *= Math.pow(.94, steps);
    pointer.smoothX += (pointer.x - pointer.smoothX) * smooth; pointer.smoothY += (pointer.y - pointer.smoothY) * smooth;
    pointer.vx += ((pointer.x - pointer.smoothX) * .5 - pointer.vx) * velocity;
    pointer.vy += ((pointer.y - pointer.smoothY) * .5 - pointer.vy) * velocity;
    const read = targets![flip ? 0 : 1], write = targets![flip ? 1 : 0]; flip = !flip;
    context.bindFramebuffer(context.FRAMEBUFFER, write.fbo); context.viewport(0, 0, fw, fh); resources!.bind(resources!.flow);
    context.activeTexture(context.TEXTURE0); context.bindTexture(context.TEXTURE_2D, read.tex);
    context.uniform1i(uniform('flow', 'u_prev'), 0);
    context.uniform2f(uniform('flow', 'u_mouse'), pointer.smoothX, pointer.smoothY);
    context.uniform2f(uniform('flow', 'u_velocity'), pointer.vx, pointer.vy);
    context.uniform1f(uniform('flow', 'u_brushRadius'), options.getBrushRadius?.() ?? .22);
    context.uniform1f(uniform('flow', 'u_brushStrength'), options.getBrushStrength?.() ?? 0);
    context.uniform1f(uniform('flow', 'u_frameSteps'), steps);
    context.uniform1f(uniform('flow', 'u_decay'), Math.pow(.96, steps)); context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
    context.bindFramebuffer(context.FRAMEBUFFER, null); context.viewport(0, 0, width, height); resources!.bind(resources!.display);
    context.bindTexture(context.TEXTURE_2D, write.tex); context.uniform1i(uniform('display', 'u_flowmap'), 0);
    context.uniform1f(uniform('display', 'u_time'), elapsed);
    context.uniform1f(uniform('display', 'u_pixelRatio'), window.devicePixelRatio || 1);
    context.uniform2f(uniform('display', 'u_resolution'), width, height);
    options.getPalette().forEach((color, index) => context.uniform4f(uniform('display', `u_color${index + 1}`), color[0] / 255, color[1] / 255, color[2] / 255, 1));
    context.uniform1f(uniform('display', 'u_swirl'), options.getSwirl() / 50);
    context.uniform1f(uniform('display', 'u_distortion'), (options.getDistortion?.() ?? 20) / 100);
    context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; frameClock.reset(); }
  function fail() { stop(); resources?.dispose(); resources = null; targets = null; options.onAvailability?.(false); }
  function tick(now: number) {
    raf = 0;
    if (!wantsRunning || !resources || disposed) return;
    const delta = frameClock.step(now);
    if (delta !== null) {
      elapsed += delta * options.getSpeed() / 100; paint(delta);
    }
    if (wantsRunning && resources && !disposed) raf = requestAnimationFrame(tick);
  }
  function lost(event: Event) {
    event.preventDefault(); stop(); resources = null; targets = null; uniforms.clear(); options.onAvailability?.(false);
  }
  function restored() {
    if (disposed) return;
    resources = createFluidResources(context); targets = null; uniforms.clear();
    options.onAvailability?.(resources !== null);
    if (!resources) return;
    if (!options.onAvailability) paint();
    if (wantsRunning && !raf) raf = requestAnimationFrame(tick);
  }
  function move(event: PointerEvent) {
    if (!wantsRunning || event.pointerType === 'touch') return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width && bounds.height) { pointer.x = (event.clientX - bounds.left) / bounds.width; pointer.y = 1 - (event.clientY - bounds.top) / bounds.height; }
  }
  canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', restored);
  window.addEventListener('pointermove', move, { passive: true });
  return {
    setRunning(on) { wantsRunning = on; if (!on) stop(); else if (!raf && resources && !disposed) raf = requestAnimationFrame(tick); },
    once() { paint(); },
    dispose() {
      disposed = true; wantsRunning = false; stop(); window.removeEventListener('pointermove', move);
      canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored);
      resources?.dispose(); resources = null; targets = null; uniforms.clear();
    },
  };
}
