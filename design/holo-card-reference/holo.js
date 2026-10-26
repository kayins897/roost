const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const HEAD = `precision highp float;
varying vec2 vUv;
uniform sampler2D uCover;
uniform vec2  uSize;
uniform float uTime;
uniform float uRay;
uniform float uDelta;
uniform float uGrid;
uniform float uField;
uniform vec2  uShift;
`;

const COMMON = `
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1.0e-10)), d / (q.x + 1.0e-10), q.x);
}
vec3 hsl2rgb(vec3 c) {
  vec3 k = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z + c.y * (k - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
}
vec3 rgb2hsl(vec3 c) {
  float mx = max(max(c.r, c.g), c.b);
  float mn = min(min(c.r, c.g), c.b);
  float l = (mx + mn) * 0.5;
  float d = mx - mn;
  float h = 0.0;
  float s = 0.0;
  if (d > 1.0e-5) {
    s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
    if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}`;

// Shader 4 / Shader 2 共用的三层圆波干涉场
const FIELD = `
vec2 uv_scaled_centered = (vUv - 0.5) * uSize * uField + uShift;
vec2 field_part1 = uv_scaled_centered + 50.0 * vec2(sin(-uTime / 143.6340), cos(-uTime / 99.4324));
vec2 field_part2 = uv_scaled_centered + 50.0 * vec2(cos( uTime / 53.1532), cos( uTime / 61.4532));
vec2 field_part3 = uv_scaled_centered + 50.0 * vec2(sin(-uTime / 87.53218), sin(-uTime / 49.0000));
float field = (1.0 + (
      cos(length(field_part1) / 19.483)
      + sin(length(field_part2) / 33.155) * cos(field_part2.y / 15.73)
      + cos(length(field_part3) / 27.193) * sin(field_part3.x / 21.92)
    )) / 2.0;
float res = (0.5 + 0.5 * cos(uRay * 2.612 + (field - 0.5) * 3.14));
`;

const BODY_HOLO = `
void main() {
${FIELD}
  float fac = 0.5 * max(max(max(0.0, 7.0 * abs(cos(vUv.x * uGrid * 20.0)) - 6.0),
                            max(0.0, 7.0 * cos(vUv.y * uGrid * 45.0 + vUv.x * uGrid * 20.0) - 6.0)),
                            max(0.0, 7.0 * cos(vUv.y * uGrid * 45.0 - vUv.x * uGrid * 20.0) - 6.0));
  vec3 tex = texture2D(uCover, vUv).rgb;
  vec3 hsl = rgb2hsl(tex);
  hsl.x = hsl.x + res * fac;
  hsl.y = hsl.y * 1.3;
  hsl.z = hsl.z * 0.6 + 0.4;
  gl_FragColor = vec4((1.0 - uDelta) * tex + uDelta * hsl2rgb(hsl), 1.0);
}`;

const BODY_FOIL = `
void main() {
  vec2 adjusted_uv = (vUv - 0.5) * vec2(0.6667, 1.0) * uField;
  float hr = uTime;
  float hg = uTime;

  float fac = max(min(2.0 * sin((length(90.0 * adjusted_uv) + hr * 2.0)
              + 3.0 * (1.0 + 0.8 * cos(length(113.1121 * adjusted_uv) - hr * 3.121)))
              - 1.0 - max(5.0 - length(90.0 * adjusted_uv), 0.0), 1.0), 0.0);

  vec2 rotater = vec2(cos(hr * 0.1221), sin(hr * 0.3512));
  float angle = dot(rotater, adjusted_uv) / (length(rotater) * length(adjusted_uv));
  float fac2 = max(min(5.0 * cos(hg * 0.3 + angle * 3.14 * (2.2 + 0.9 * sin(hr * 1.65 + 0.2 * hg)))
              - 4.0 - max(2.0 - length(20.0 * adjusted_uv), 0.0), 1.0), 0.0);

  float fac3 = 0.3 * max(min(2.0 * sin(hr * 5.0 + vUv.x * 3.0 + 3.0 * (1.0 + 0.5 * cos(hr * 7.0))), 1.0), -1.0);
  float fac4 = 0.3 * max(min(2.0 * sin(hr * 6.66 + vUv.y * 3.8 + 3.0 * (1.0 + 0.5 * cos(hr * 3.414))), 1.0), -1.0);

  float maxfac = max(max(fac, max(fac2, max(fac3, max(fac4, 0.0)))) + 2.2 * (fac + fac2 + fac3 + fac4), 0.0);

  vec3 tex = texture2D(uCover, vUv).rgb;
  vec3 glow = hsv2rgb(vec3(fract(0.56 + maxfac * 0.35), 0.75, 1.0));
  float m = clamp(maxfac, 0.0, 1.0);
  vec3 add = (m * m * (3.0 - 2.0 * m)) * mix(vec3(0.92), glow, 0.45) * uDelta;
  gl_FragColor = vec4(1.0 - (1.0 - tex) * (1.0 - 0.8 * add), 1.0);
}`;

const BODY_POLY = `
void main() {
${FIELD}
  vec3 tex = texture2D(uCover, vUv).rgb;
  vec3 hsl = rgb2hsv(tex);
  hsl.x = hsl.x + res + uRay * 0.04;
  hsl.y = min(0.6, hsl.y + 0.5);
  gl_FragColor = vec4(mix(tex, hsv2rgb(hsl), uDelta), 1.0);
}`;

const EFFECTS = [
  { kind: "foil", title: "闪箔", body: BODY_FOIL, field: 0.18, deltaK: 0.85, shift: [0, 0] },
  { kind: "holo", title: "镭射", body: BODY_HOLO, field: 1.0,  deltaK: 0.9,  shift: [0, 0] },
  { kind: "poly", title: "多彩", body: BODY_POLY, field: 0.3,  deltaK: 0.7,  shift: [-300, 1500] }
];

EFFECTS.forEach(e => { e.src = HEAD + COMMON + e.body; });

const params = { delta: 0.9, grid: 1.25, speed: 1, on: true };
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

function makeCover() {
  const c = document.createElement("canvas");
  c.width = 480; c.height = 720;
  const x = c.getContext("2d");
  const bg = x.createLinearGradient(0, 0, 0, 720);
  bg.addColorStop(0, "#9aa6dc"); bg.addColorStop(0.55, "#7d8cce"); bg.addColorStop(1, "#6675bd");
  x.fillStyle = bg; x.fillRect(0, 0, 480, 720);
  x.globalAlpha = 0.28; x.fillStyle = "#ffffff";
  for (let i = 0; i < 480; i += 16) x.fillRect(i, 0, 3, 720);
  x.globalAlpha = 1;
  x.strokeStyle = "rgba(255,255,255,0.55)"; x.lineWidth = 6; x.strokeRect(18, 18, 444, 684);
  x.fillStyle = "#f4f9ff";
  x.beginPath();
  x.moveTo(240, 120);
  x.bezierCurveTo(360, 130, 400, 250, 380, 340);
  x.bezierCurveTo(360, 430, 300, 470, 240, 470);
  x.bezierCurveTo(180, 470, 120, 430, 100, 340);
  x.bezierCurveTo(80, 250, 120, 130, 240, 120);
  x.fill();
  x.fillStyle = "#3c4788";
  x.beginPath(); x.arc(196, 270, 17, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(284, 270, 17, 0, Math.PI * 2); x.fill();
  x.strokeStyle = "#3c4788"; x.lineWidth = 9; x.lineCap = "round";
  x.beginPath(); x.arc(240, 330, 46, 0.35, Math.PI - 0.35); x.stroke();
  x.fillStyle = "#ffffff"; x.font = "bold 62px sans-serif"; x.textAlign = "center";
  x.fillText("WARM", 240, 600);
  x.font = "18px sans-serif"; x.globalAlpha = 0.6;
  x.fillText("SYNTHETIC FIXTURE", 240, 640);
  return c;
}
const cover = makeCover();

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("compile: " + gl.getShaderInfoLog(s));
  return s;
}

function createInstance(effect) {
  const canvas = document.getElementById("cv-" + effect.kind);
  const gl = canvas.getContext("webgl", { antialias: true, premultipliedAlpha: false });
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, effect.src));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cover);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(prog, "uCover"), 0);
  gl.uniform1f(gl.getUniformLocation(prog, "uField"), effect.field);

  const uni = {};
  ["uCover", "uSize", "uTime", "uRay", "uDelta", "uGrid", "uField", "uShift"].forEach(n => {
    uni[n] = gl.getUniformLocation(prog, n);
  });

  const state = { kind: effect.kind, ray: 0 };

  return {
    kind: effect.kind,
    draw(t) {
      gl.useProgram(prog);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform2f(uni.uSize, 240, 360);
      gl.uniform1f(uni.uTime, t);
      gl.uniform1f(uni.uRay, state.ray);
      gl.uniform2f(uni.uShift, effect.shift[0], effect.shift[1]);
      gl.uniform1f(uni.uDelta, (params.on ? params.delta : 0) * effect.deltaK);
      gl.uniform1f(uni.uGrid, params.grid);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    state
  };
}

const insts = EFFECTS.map(createInstance);
const byKind = {};
insts.forEach(i => { byKind[i.kind] = i; });

const srcTitle = document.getElementById("srcTitle");
const srcBox = document.getElementById("src");
function select(kind) {
  const effect = EFFECTS.find(e => e.kind === kind);
  srcTitle.textContent = effect.title + " · fragment shader";
  srcBox.textContent = effect.src.trim();
  srcBox.scrollTop = 0;
  document.querySelectorAll(".card").forEach(el => {
    el.classList.toggle("is-active", el.dataset.kind === kind);
  });
  window.__active = kind;
}
select("foil");

document.querySelectorAll(".card").forEach(fig => {
  const kind = fig.dataset.kind;
  const inst = byKind[kind];
  fig.addEventListener("pointermove", event => {
    const rect = fig.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
    const y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));
    fig.style.transform = "perspective(720px) rotateX(" + (-y * 7).toFixed(2) + "deg) rotateY(" + (x * 10).toFixed(2) + "deg)";
    inst.state.ray = x;
  });
  fig.addEventListener("pointerleave", () => {
    fig.style.transform = "";
    inst.state.ray = 0;
  });
  fig.addEventListener("click", () => select(kind));
});

const bind = (id, key, fmt) => {
  const input = document.getElementById(id);
  const out = document.getElementById(id + "Out");
  const sync = () => { params[key] = Number(input.value); out.textContent = fmt(params[key]); };
  input.addEventListener("input", sync);
  sync();
};
bind("delta", "delta", v => v.toFixed(2));
bind("grid", "grid", v => v.toFixed(2));
bind("speed", "speed", v => v.toFixed(2));
document.getElementById("toggle").addEventListener("click", event => {
  params.on = !params.on;
  event.target.textContent = params.on ? "关闭特效" : "开启特效";
});

let clock = 0;
let last = performance.now();
function frame(now) {
  clock += Math.min(0.1, (now - last) / 1000) * params.speed;
  last = now;
  insts.forEach(i => i.draw(clock));
  if (!reduced) requestAnimationFrame(frame);
}
insts.forEach(i => i.draw(reduced ? 3.2 : 0));
if (!reduced) requestAnimationFrame(frame);

window.__deck = {
  params,
  insts,
  select,
  active: () => window.__active,
  setTime: v => { clock = v; insts.forEach(i => i.draw(clock)); }
};
