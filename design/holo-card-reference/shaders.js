/* Visible equations: videos linked in SOURCE-README.md. Final foil colouring,
   spatial/time scales and strength are calibrated here, not verified source parameters. */
window.HoloShaders = (() => {
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
  // Silver-white reflection; no invented rainbow colouring or full-card screen wash.
  float metal = (1.0 - exp(-maxfac * 0.26)) * (0.13 + 0.87 * max(fac, fac2));
  float light = dot(tex, vec3(0.2126, 0.7152, 0.0722));
  vec3 reflected = mix(tex * (1.0 - 0.025 * metal), vec3(0.86, 0.94, 1.0), metal * 0.75);
  float protect = 0.85 + 0.15 * (1.0 - light);
  gl_FragColor = vec4(mix(tex, reflected, uStrength * protect), 1.0);
}`;
  const holo = `void main() {
${field()}
  vec3 tex = texture2D(uCover, vUv).rgb;
  vec3 hsl = rgb2hsl(tex);
  float etched = 0.5 * max(max(max(0.0, 7.0 * abs(cos(vUv.x * 25.0)) - 6.0),
    max(0.0, 7.0 * cos(vUv.y * 56.25 + vUv.x * 25.0) - 6.0)),
    max(0.0, 7.0 * cos(vUv.y * 56.25 - vUv.x * 25.0) - 6.0));
  // The reference triangle etching is opt-in; a smooth phase takes its place by default.
  float fac = mix(0.18 + 0.24 * res, etched, uEtching);
  hsl.x += res * fac;
  hsl.y = min(1.0, hsl.y * 1.3);
  hsl.z = hsl.z * 0.6 + 0.4;
  // Reference final step mixes back the original; its exposed pastel stage is not the result.
  // Smooth diagonal envelope is a custom replacement for the removed lattice, not source code.
  float diagonal = dot(vUv - 0.5, vec2(0.78, -0.62)) + uRay.x * 0.22 + uRay.y * 0.16 + 0.18 * sin(uTime * 0.7);
  float glint = exp(-pow(diagonal / 0.22, 2.0));
  gl_FragColor = vec4(mix(tex, hsl2rgb(hsl), uStrength * (0.12 + 0.62 * glint)), 1.0);
}`;
  const poly = `void main() {
${field(true)}
  vec3 tex = texture2D(uCover, vUv).rgb;
  float low = min(min(tex.r, tex.g), tex.b);
  float high = max(max(tex.r, tex.g), tex.b);
  float saturation_fac = 1.0 - max(0.0, 0.05 * (1.1 - (high - low)));
  // Video Shader 2 uses HSL, not HSV. Preserve source lightness and dark details.
  vec3 hsl = rgb2hsl(vec3(tex.r * saturation_fac, tex.g * saturation_fac, tex.b));
  hsl.x += res + uRay.y * 0.04;
  hsl.y = min(0.6, hsl.y + 0.5);
  gl_FragColor = vec4(mix(tex, hsl2rgb(hsl), uStrength * 0.90), 1.0);
}`;
  return { vertex, effects: [
    { kind: 'foil', title: '闪箔', src: head + foil },
    { kind: 'holo', title: '镭射', src: head + holo },
    { kind: 'poly', title: '多彩', src: head + poly }
  ] };
})();
