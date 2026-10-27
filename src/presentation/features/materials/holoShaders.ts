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
  float light = dot(tex, vec3(0.2126, 0.7152, 0.0722));
  // A silver coating catches a moving, slightly bowed light source. No radial
  // rings, starburst spokes, noise or lattice are printed over the artwork.
  float drift = uTime * 0.18;
  float diagonal = dot(vUv - 0.5, vec2(0.78, -0.62))
    + uRay.x * 0.20 + uRay.y * 0.16 + sin(drift) * 0.12;
  float bow = sin(vUv.y * 4.0 + drift * 0.6) * 0.038;
  float ribbon = exp(-pow((diagonal + bow - 0.04) / 0.19, 2.0));
  float edge = exp(-pow((diagonal + bow - 0.055) / 0.047, 2.0));
  float shoulder = exp(-pow((diagonal + bow + 0.15) / 0.075, 2.0));
  float second = exp(-pow((diagonal - 0.36 + sin(vUv.x * 4.5) * 0.04) / 0.14, 2.0));
  float body = smoothstep(0.018, 0.12, light) * (1.0 - smoothstep(0.80, 0.99, light));
  vec3 base = mix(tex, filmBase(tex, 0.0), 0.18);
  // Multiplicative exposure retains the printed fine detail even in the silver
  // highlight; the very small neutral lift is local, rather than a white veil.
  float exposure = ribbon * 0.15 + edge * 0.20 + second * 0.055 - shoulder * 0.12;
  vec3 silver = base * (1.0 + exposure * uStrength * body);
  vec3 temperature = mix(vec3(0.93, 0.98, 1.0), vec3(1.0, 0.97, 0.94), 0.5 + 0.5 * sin(diagonal * 4.0 + uRay.x));
  silver += temperature * (ribbon * 0.028 + edge * 0.070) * uStrength * body;
  silver = mix(silver, vec3(dot(silver, vec3(0.2126, 0.7152, 0.0722))) + vec3(0.035), edge * 0.10 * body * uStrength);
  // A barely visible continuous brushed response only exists where light falls.
  float brush = sin((vUv.x * 0.75 - vUv.y) * 170.0 + sin(vUv.y * 7.0) * 0.4);
  silver += vec3(brush * 0.006 * ribbon * body * uStrength);
  gl_FragColor = vec4(clamp(silver, 0.0, 1.0), 1.0);
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
  vec3 tex = texture2D(uCover, vUv).rgb;
  float light = dot(tex, vec3(0.2126, 0.7152, 0.0722));
  vec3 base = mix(tex, filmBase(tex, 2.8), 0.20);
  float diagonal = dot(vUv - 0.5, vec2(0.78, -0.62))
    + uRay.x * 0.22 + uRay.y * 0.16 + sin(uTime * 0.16) * 0.11;
  float bow = sin(vUv.y * 3.4 + uTime * 0.08) * 0.045;
  float band = exp(-pow((diagonal + bow) / 0.26, 2.0));
  float second = exp(-pow((diagonal + bow - 0.42) / 0.17, 2.0));
  // Thin-film colours travel across a reflection, never replace every source hue.
  // Keep chromatic offset zero-luminance so edges and lettering retain contrast.
  float phase = diagonal * 1.35 + vUv.y * 0.12 + uRay.x * 0.16 - uRay.y * 0.10 + uTime * 0.028;
  vec3 spectrum = 0.5 + 0.5 * cos(6.2831853 * (phase + vec3(0.0, 0.3333, 0.6667)));
  vec3 chroma = spectrum - vec3(dot(spectrum, vec3(0.2126, 0.7152, 0.0722)));
  float body = smoothstep(0.025, 0.15, light) * (1.0 - smoothstep(0.73, 0.98, light));
  float coat = (0.12 + 0.88 * band + second * 0.22) * body * uStrength;
  vec3 coated = base * (vec3(1.0) + chroma * 0.48 * coat);
  coated += chroma * 0.055 * coat;
  float specular = exp(-pow((diagonal + bow + 0.025) / 0.065, 2.0));
  coated += vec3(0.032 * specular * body * uStrength);
  gl_FragColor = vec4(clamp(coated, 0.0, 1.0), 1.0);
}`;
  return { vertex, effects: [
    { kind: 'foil', title: '闪箔', src: head + foil },
    { kind: 'holo', title: '镭射', src: head + holo },
    { kind: 'poly', title: '多彩', src: head + poly }
  ] };
})();
