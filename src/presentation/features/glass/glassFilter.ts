/** SDF lens and RGB filter ported from design/mineradio-reference/index.html. */
import type { GlassSettings } from './glassOptions.ts';
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const channel = (n: number) => clamp(128 + Math.round(n * 127), 1, 255);

function lensFalloff(t: number) {
  const n = 1 - t, ramp = n * n;
  return ramp + (1 - Math.sqrt(Math.sqrt(Math.max(0, 1 - n ** 4))) - ramp) * .2;
}

function lensMap(width: number, height: number, radius: number, depth: number): string | null {
  const raster = .2, w = Math.max(1, Math.round(width * raster)), h = Math.max(1, Math.round(height * raster));
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([128, 128, 128, 255], i * 4);
  const corner = Math.max(1, Math.min(radius * raster, Math.min(w, h) / 2)), edge = Math.max(.5, depth * raster);
  const cx = w / 2, cy = h / 2, halfW = cx - corner, halfH = cy - corner;
  const put = (x: number, y: number, dx: number, dy: number) => { const i = (y * w + x) * 4; data[i] = dx; data[i + 1] = dy; };
  for (let y = 0; y < Math.ceil(h / 2); y++) {
    const xmax = y + .5 >= edge ? Math.min(Math.ceil(w / 2), Math.ceil(Math.max(corner, edge))) : Math.ceil(w / 2);
    for (let x = 0; x < xmax; x++) {
      const px = x + .5, py = y + .5, sx = Math.abs(px - cx) - halfW, sy = Math.abs(py - cy) - halfH;
      const ox = Math.max(sx, 0), oy = Math.max(sy, 0), distance = Math.hypot(ox, oy);
      const sdf = distance + Math.min(Math.max(sx, sy), 0) - corner;
      if (sdf <= -edge) continue;
      let nx = 0, ny = 0;
      if (ox > 0 || oy > 0) { nx = (px < cx ? -ox : ox) / distance; ny = (py < cy ? -oy : oy) / distance; }
      else if (sx > sy) nx = px < cx ? -1 : 1;
      else ny = py < cy ? -1 : 1;
      const mag = lensFalloff(clamp(-sdf / edge, 0, 1)), dx = channel(-nx * mag), dy = channel(-ny * mag);
      put(x, y, dx, dy);
      const mx = w - 1 - x, my = h - 1 - y;
      if (mx !== x) put(mx, y, 256 - dx, dy);
      if (my !== y) put(x, my, dx, 256 - dy);
      if (mx !== x && my !== y) put(mx, my, 256 - dx, 256 - dy);
    }
  }
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.putImageData(new ImageData(data, w, h), 0, 0);
  return canvas.toDataURL('image/png');
}

export interface GlassFilter {
  svg: SVGSVGElement;
  baseScale: number;
  ratios: number[];
  displacements: SVGFEDisplacementMapElement[];
  brightness: Element[];
}
let sequence = 0;

export function buildGlassFilter(width: number, height: number, radius: number, settings: GlassSettings): GlassFilter | null {
  const { refraction, blur, dispersion, depth } = settings;
  const map = lensMap(width, height, radius, depth);
  if (!map) return null;
  const id = `qiyu-material-${++sequence}`, baseScale = clamp(refraction / 100, 0, 1) * 24 * (255 / 127);
  const ratios = [1 + dispersion / 100 * .2, 1, 1 - dispersion / 100 * .2];
  const padding = Math.ceil(Math.max(blur * 1.5, 4) + 2);
  let chain = `<feImage href="${map}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" result="lens"/>`;
  chain += `<feGaussianBlur in="SourceGraphic" stdDeviation="${blur / 2}" result="blur"/>`;
  chain += '<feComponentTransfer in="blur" result="bright"><feFuncR type="linear" slope="1.1"/><feFuncG type="linear" slope="1.1"/><feFuncB type="linear" slope="1.1"/></feComponentTransfer>';
  for (const [i, ch] of ['r', 'g', 'b'].entries()) {
    const matrix = ch === 'r' ? '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'
      : ch === 'g' ? '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0' : '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0';
    chain += `<feDisplacementMap in="bright" in2="lens" scale="${baseScale * ratios[i]}" xChannelSelector="R" yChannelSelector="G" result="disp_${ch}"/>`;
    chain += `<feColorMatrix in="disp_${ch}" type="matrix" values="${matrix}" result="ch_${ch}"/>`;
  }
  chain += '<feBlend in="ch_r" in2="ch_g" mode="screen" result="rg"/><feBlend in="rg" in2="ch_b" mode="screen"/>';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('glass-material__defs'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<filter id="${id}" x="${-padding / width * 100}%" y="${-padding / height * 100}%" width="${(1 + 2 * padding / width) * 100}%" height="${(1 + 2 * padding / height) * 100}%" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">${chain}</filter>`;
  return { svg, baseScale, ratios, displacements: [...svg.querySelectorAll('feDisplacementMap')], brightness: [...svg.querySelectorAll('feFuncR,feFuncG,feFuncB')] };
}
