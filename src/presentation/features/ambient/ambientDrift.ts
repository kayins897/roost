export type Drift = { mx: number; my: number; smx: number; smy: number };
/** Original far/near displacement, perspective rotations and idle breathing. */
export function applyDrift(fluid: HTMLCanvasElement, stars: HTMLCanvasElement, drift: Drift, t: number, moving: boolean, parallax = 100) {
  if (!moving || parallax === 0) { fluid.style.transform = 'none'; stars.style.transform = 'none'; return; }
  const a = parallax / 100;
  const idleX = Math.sin(t * .08), idleY = Math.sin(t * .06 + 1), roll = Math.sin(t * .05 + 2);
  const fx = (-drift.smx * 20 + idleX * 10) * a, fy = (-drift.smy * 13 + idleY * 6) * a;
  const nx = (-drift.smx * 40 + idleX * 20) * a, ny = (-drift.smy * 26 + idleY * 12) * a;
  fluid.style.transform = `perspective(1200px) translate3d(${fx.toFixed(2)}px, ${fy.toFixed(2)}px, 0) rotateX(${(-drift.smy * .8 * a).toFixed(3)}deg) rotateY(${(drift.smx * .8 * a).toFixed(3)}deg) rotate(${((-drift.smx * .6 + roll * .2) * a).toFixed(3)}deg) scale(1.08)`;
  stars.style.transform = `perspective(1200px) translate3d(${nx.toFixed(2)}px, ${ny.toFixed(2)}px, 0) rotateX(${(-drift.smy * 1.5 * a).toFixed(3)}deg) rotateY(${(drift.smx * 1.5 * a).toFixed(3)}deg) rotate(${((-drift.smx * 1.2 + roll * .35) * a).toFixed(3)}deg)`;
}
