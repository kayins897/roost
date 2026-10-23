type Star = { band: number; local: number; flow: number; pace: number; twinkleSeed: number; depth: number; kind: number; ox: number; oy: number };
type Ripple = { x: number; y: number; age: number; strength: number };
export type StarPointer = { x: number; y: number; vx: number; vy: number; active: boolean; dragging: boolean };
const fract = (n: number) => n - Math.floor(n), hash = (n: number) => fract(Math.sin(n) * 43758.5453123);
const R_LIFE = 2, R_CAP = 8, P_RAD = 130, D_RAD = 190;

function bakeSprite(cr: number, cg: number, cb: number) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, `rgba(${cr},${cg},${cb},.95)`); g.addColorStop(.4, `rgba(${cr},${cg},${cb},.55)`);
    g.addColorStop(.75, `rgba(${cr},${cg},${cb},.14)`); g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
  }
  return c;
}

/** Six bands, density 60 and the original blue/violet/gold/white sprite palette. */
export function createStarRiver(canvas: HTMLCanvasElement, pointer: StarPointer) {
  const ctx = canvas.getContext('2d');
  const sprites = [bakeSprite(150, 205, 255), bakeSprite(168, 140, 255), bakeSprite(244, 210, 138), bakeSprite(238, 246, 255)];
  let width = 1, height = 1, ratio = 1, stars: Star[] = [];
  const ripples: Ripple[] = [];
  function resize(w: number, h: number, density = 60) {
    width = w; height = h; ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
    const count = Math.round(Math.max(30, Math.min(1400, width * height / 3400 * (density / 50))));
    stars = Array.from({ length: count }, (_, i) => {
      const band = i % 6, bandN = (band + .5) / 6, seed = i * .618, pick = hash(seed * 17.7);
      return { band, local: hash(seed * 3.7), flow: hash(seed * 5.1), pace: .6 + hash(seed * 11.3) * .8, twinkleSeed: seed * 9, depth: hash(seed * 9.13), kind: pick > .86 ? 2 : pick > .7 ? 3 : bandN < .5 ? 0 : 1, ox: 0, oy: 0 };
    });
    return count;
  }
  function ripple(x: number, y: number) {
    if (ripples.length >= R_CAP) ripples.shift();
    ripples.push({ x, y, age: 0, strength: .8 + Math.random() * .5 });
  }
  function draw(t: number, delta: number, theme: 'dark' | 'light') {
    if (!ctx) return;
    for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].age += delta; if (ripples[i].age >= R_LIFE) ripples.splice(i, 1); }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
    const master = theme === 'dark' ? .9 : .42;
    ctx.globalCompositeOperation = theme === 'dark' ? 'lighter' : 'source-over';
    for (const star of stars) {
      const bandN = (star.band + .5) / 6, speed = (.008 + bandN * .012) * star.pace;
      // Equivalent to the demo's .016 per 60 Hz frame, independent of display refresh rate.
      if (delta > 0) { star.flow = (star.flow + speed * .016 * delta * 60) % 1; star.ox *= Math.pow(.93, delta * 60); star.oy *= Math.pow(.93, delta * 60); }
      const sweep = width * (.55 + bandN * .4);
      let bx = (star.flow * 2 - .5) * sweep + width / 2;
      if (bx < -30) bx += width + 60; else if (bx > width + 30) bx -= width + 60;
      const phase = star.flow * Math.PI * 2 * (1.1 + bandN * .5) + star.twinkleSeed;
      const ridge = Math.exp(-(((star.local - .45) / .26) ** 2));
      const by = height * (.06 + bandN * .88) + Math.sin(phase) * (14 + bandN * 22) * (.5 + star.depth) + (star.local - .5) * 26;
      if (pointer.active && delta > 0) {
        const pd = Math.hypot(bx - pointer.x, by - pointer.y);
        if (pd < D_RAD) {
          const pull = (1 - pd / D_RAD) ** 2 * (pointer.dragging ? 1.9 : .35);
          star.ox += pointer.vx * pull * .15 * delta * 60; star.oy += pointer.vy * pull * .15 * delta * 60;
        }
      }
      let x = bx + star.ox, y = by + star.oy;
      const twinkle = (.5 + .5 * Math.sin(t * (.5 + fract(star.twinkleSeed * .37) * .9) + star.twinkleSeed)) ** 3;
      let alpha = (.10 + ridge * .42 + twinkle * .30) * (.45 + star.depth * .55) * master;
      let radius = .9 + ridge * 1.9 + twinkle * 1.6 + star.depth * .8;
      if (pointer.active) {
        const pd = Math.hypot(x - pointer.x, y - pointer.y);
        if (pd < P_RAD) { const lift = (1 - pd / P_RAD) ** 2; alpha += lift * .5 * master; radius += lift * 2.2; }
      }
      let push = 0, glow = 0;
      for (const r of ripples) {
        const dist = Math.hypot(x - r.x, y - r.y), life = r.age / R_LIFE;
        const ring = Math.exp(-(((dist - r.age * 260 * (.7 + r.strength * .3)) / (46 + r.age * 30)) ** 2));
        const bulge = Math.exp(-((dist / (70 + r.age * 90)) ** 2)) * (1 - life);
        const env = Math.min(1, r.age / .12) * (1 - life * life);
        push += (ring + bulge * .7) * env * r.strength; glow += (ring * .9 + bulge * .5) * env * r.strength;
      }
      if (push > .001) {
        for (const r of ripples) {
          const dx = x - r.x, dy = y - r.y, rd = Math.hypot(dx, dy) || 1, life = r.age / R_LIFE;
          const ring = Math.exp(-(((rd - r.age * 260 * (.7 + r.strength * .3)) / (46 + r.age * 30)) ** 2));
          const move = ring * Math.min(1, r.age / .12) * (1 - life * life) * r.strength * 26;
          x += dx / rd * move; y += dy / rd * move;
        }
        alpha += glow * .6 * master; radius += glow * 2;
      }
      if (alpha <= .012) continue;
      ctx.globalAlpha = Math.min(alpha, .95); ctx.drawImage(sprites[star.kind], x - radius, y - radius, radius * 2, radius * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function clear() { ctx?.setTransform(1, 0, 0, 1, 0, 0); ctx?.clearRect(0, 0, canvas.width, canvas.height); }
  return { resize, draw, ripple, clear };
}
