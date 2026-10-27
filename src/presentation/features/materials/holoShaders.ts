/* Visible equations: videos linked in SOURCE-README.md. Final foil colouring,
   spatial/time scales and strength are calibrated here, not verified source parameters. */
export const HoloShaders = (() => {
  const vertex = `attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  const head = `precision highp float;
varying vec2 vUv;
uniform sampler2D uCover;
uniform float uTime;
uniform float uStrength;
uniform float uFilter;
uniform float uEtching;
uniform vec2 uRay;

vec3 rgb2hsl(vec3 c) {
  float hi = max(max(c.r, c.g), c.b);
  float lo = min(min(c.r, c.g), c.b);
  float l = (hi + lo) * 0.5;
  float d = hi - lo;
  float h = 0.0;
  float s = 0.0;
  if (d > 0.00001) {
    s = d / max(0.00001, 1.0 - abs(2.0 * l - 1.0));
    if (hi == c.r) h = mod((c.g - c.b) / d, 6.0);
    else if (hi == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h = fract(h / 6.0 + 1.0);
  }
  return vec3(h, s, l);
}
vec3 hsl2rgb(vec3 c) {
  vec3 k = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z + c.y * (k - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
}
// Calibrated film layer: gentle contrast and cyan/lilac interference across the base image.
// It is deliberately independent from the reflective texture strength.
vec3 filmBase(vec3 tex, float phase) {
  float sweep = 0.5 + 0.5 * sin(dot(vUv, vec2(2.3, -1.7)) + phase + uRay.x * 0.35 - uRay.y * 0.22 + 0.16 * sin(uTime * 0.24));
  vec3 balance = mix(vec3(0.86, 1.05, 1.14), vec3(1.12, 0.93, 1.09), sweep);
  vec3 toned = clamp((tex - 0.5) * 1.12 + 0.5, 0.0, 1.0) * balance;
  float light = dot(tex, vec3(0.2126, 0.7152, 0.0722));
  float body = smoothstep(0.015, 0.14, light) * (1.0 - 0.45 * smoothstep(0.82, 1.0, light));
  return mix(tex, clamp(toned, 0.0, 1.0), uFilter * body);
}
`;
  const field = (wide = false) => `
  vec2 uv_scaled_centered = ${wide ? 'mat2(0.8, -0.6, 0.6, 0.8) * ((vUv - 0.5) * vec2(60.0, 90.0)) + vec2(-60.0, 300.0)' : '(vUv - 0.5) * vec2(140.0, 210.0)'};
  float t = uTime * 18.0;
  vec2 p1 = uv_scaled_centered + 50.0 * vec2(sin(-t / 143.6340), cos(-t / 99.4324));
  vec2 p2 = uv_scaled_centered + 50.0 * vec2(cos(t / 53.1532), cos(t / 61.4532));
  vec2 p3 = uv_scaled_centered + 50.0 * vec2(sin(-t / 87.53218), sin(-t / 49.0000));
  float field = (1.0 + cos(length(p1) / 19.483)
    + sin(length(p2) / 33.155) * cos(p2.y / 15.73)
    + cos(length(p3) / 27.193) * sin(p3.x / 21.92)) * 0.5;
  float res = 0.5 + 0.5 * cos(uRay.x * 2.612 + (field - 0.5) * 3.14);
`;
  const foil = `void main() {
  vec3 tex = texture2D(uCover, vUv).rgb;
  vec2 uv = (vUv - 0.5) * vec2(0.6667, 1.0);
  float hr = uTime * 0.30 + uRay.x * 0.55;
  float hg = uTime * 0.23 + uRay.y * 0.65;
  float radius = length(90.0 * uv);
  float fac = clamp(2.0 * sin(radius + hr * 2.0
    + 3.0 * (1.0 + 0.8 * cos(length(113.1121 * uv) - hr * 3.121)))
    - 1.0 - max(5.0 - radius, 0.0), 0.0, 1.0);
  vec2 rotater = vec2(cos(hr * 0.1221), sin(hr * 0.3512));
  float angle = dot(rotater, uv) / max(0.0001, length(rotater) * length(uv));
  float fac2 = clamp(5.0 * cos(hg * 0.3 + angle * 3.14 * (2.2 + 0.9 * sin(hr * 1.65 + 0.2 * hg)))
    - 4.0 - max(2.0 - length(20.0 * uv), 0.0), 0.0, 1.0);
  float fac3 = 0.3 * clamp(2.0 * sin(hr * 5.0 + vUv.x * 3.0 + 3.0 * (1.0 + 0.5 * cos(hr * 7.0))), -1.0, 1.0);
  float fac4 = 0.3 * clamp(2.0 * sin(hr * 6.66 + vUv.y * 3.8 + 3.0 * (1.0 + 0.5 * cos(hr * 3.414))), -1.0, 1.0);
  float maxfac = max(max(fac, max(fac2, max(fac3, max(fac4, 0.0)))) + 2.2 * (fac + fac2 + fac3 + fac4), 0.0);
  // Film, broad metallic undulation, then the fine rings and silver light beams.
  vec3 base = filmBase(tex, 0.0);
  float metal = (1.0 - exp(-maxfac * 0.26)) * (0.13 + 0.87 * max(fac, fac2));
  // Sparse segments of finer concentric engraving; no noise dots or lattice overlay.
  float fine = pow(max(0.0, sin(radius * 2.25 - hr * 1.7 + angle * 0.45)), 12.0)
    * pow(0.5 + 0.5 * cos(angle * 5.0 + hg), 4.0) * smoothstep(3.0, 10.0, radius);
  metal = clamp(metal * 0.82 + fine * 0.22, 0.0, 0.92);
  float light = dot(tex, vec3(0.2126, 0.7152, 0.0722));
  float broad = (fac3 + fac4) * 0.16;
  vec3 metalBase = clamp(base * (0.97 + broad), 0.0, 1.0);
  float tone = 0.5 + 0.5 * sin(angle * 3.14 + hr * 0.8);
  vec3 silver = mix(vec3(0.78, 0.91, 1.0), vec3(1.0, 0.88, 0.96), tone);
  vec3 reflected = mix(metalBase, silver, metal * 0.88);
  float protect = 0.85 + 0.15 * (1.0 - light);
  gl_FragColor = vec4(mix(base, reflected, uStrength * protect), 1.0);
}`;
  const holo = `void main() {
${field()}
  vec3 tex = texture2D(uCover, vUv).rgb;
  vec3 base = filmBase(tex, 1.4);
  vec3 hsl = rgb2hsl(base);
  // Equilateral triangle faces, not a line mask. Identity and normals stay fixed as the light moves.
  vec2 p = vUv * vec2(5.2, 7.8);
  vec2 lattice = vec2(p.x - p.y / 1.7320508, p.y / 0.8660254);
  vec2 cell = floor(lattice);
  vec2 local = fract(lattice);
  float side = step(1.0, local.x + local.y);
  float seed = fract(sin(dot(cell, vec2(127.1, 311.7)) + side * 74.7) * 43758.5453);
  float azimuth = seed * 6.2831853;
  vec3 normal = normalize(vec3(vec2(cos(azimuth), sin(azimuth)) * 0.44, 1.0));
  vec3 viewLight = normalize(vec3(uRay.x * 0.75 + 0.12 * sin(uTime * 0.3), -uRay.y * 0.75 - 0.35, 1.2));
  float facing = pow(max(dot(normal, viewLight), 0.0), 10.0);
  float diagonal = dot(vUv - 0.5, vec2(0.78, -0.62)) + uRay.x * 0.22 + uRay.y * 0.16 + 0.18 * sin(uTime * 0.7);
  float glint = exp(-pow(diagonal / 0.22, 2.0));
  float body = smoothstep(0.02, 0.16, hsl.z) * (1.0 - smoothstep(0.82, 0.99, hsl.z));
  float reflection = smoothstep(0.25, 0.80, facing);
  vec3 face = hsl;
  face.x += (0.04 + res * 0.14 + (seed - 0.5) * 0.22 + side * 0.025) * body * (0.20 + 0.80 * reflection);
  face.y = min(0.75, face.y + (0.03 + reflection * 0.12) * body);
  face.z = clamp(face.z + ((facing - 0.40) * 0.20 + (seed - 0.5) * 0.025) * body, 0.0, 1.0);
  vec3 smoothFace = hsl;
  smoothFace.x += (0.04 + res * 0.16) * body;
  smoothFace.y = min(0.75, smoothFace.y + 0.12 * body);
  smoothFace.z = clamp(smoothFace.z + glint * 0.07 * body, 0.0, 1.0);
  vec3 faceted = hsl2rgb(face);
  // Only a few well-aligned faces catch a neutral silver glint; others keep the original ink.
  float silver = pow(reflection, 5.0) * (0.20 + 0.80 * glint) * 0.20 * body;
  faceted = mix(faceted, vec3(0.87, 0.95, 1.0), silver);
  vec3 coated = mix(hsl2rgb(smoothFace), faceted, uEtching);
  gl_FragColor = vec4(mix(base, coated, uStrength * (0.60 + 0.25 * glint)), 1.0);
}`;
  const poly = `void main() {
${field(true)}
  vec3 tex = texture2D(uCover, vUv).rgb;
  vec3 base = filmBase(tex, 2.8);
  float low = min(min(base.r, base.g), base.b);
  float high = max(max(base.r, base.g), base.b);
  float saturation_fac = 1.0 - max(0.0, 0.05 * (1.1 - (high - low)));
  // Video Shader 2 uses HSL, not HSV. Preserve source lightness and dark details.
  vec3 hsl = rgb2hsl(vec3(base.r * saturation_fac, base.g * saturation_fac, base.b));
  hsl.x += res + uRay.y * 0.04;
  hsl.y = min(0.6, hsl.y + 0.5);
  gl_FragColor = vec4(mix(base, hsl2rgb(hsl), uStrength * 0.90), 1.0);
}`;
  return { vertex, effects: [
    { kind: 'foil', title: '闪箔', src: head + foil },
    { kind: 'holo', title: '镭射', src: head + holo },
    { kind: 'poly', title: '多彩', src: head + poly }
  ] };
})();
