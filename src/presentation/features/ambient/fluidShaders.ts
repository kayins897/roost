export const VERTEX_SHADER = `#version 300 es
in vec4 a_position;
out vec2 vUv;
void main() { vUv = a_position.xy * .5 + .5; gl_Position = a_position; }`;
export const FLOW_FRAG = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D u_prev;
uniform vec2 u_mouse, u_velocity;
uniform float u_brushRadius, u_brushStrength, u_decay, u_frameSteps;
out vec4 fragColor;
void main() {
  vec4 prev = texture(u_prev, vUv);
  prev.r *= u_decay;
  prev.gb = mix(vec2(.5), prev.gb, u_decay);
  float dist = distance(vUv, u_mouse);
  float influence = max(0., exp(-dist * dist / (u_brushRadius * u_brushRadius * .5)) - .01);
  float totalStrength = u_brushStrength * .3 + min(length(u_velocity) * 3., .7) * u_brushStrength;
  prev.r = max(prev.r, influence * totalStrength);
  float blendAmt = 1. - pow(1. - influence * min(totalStrength, .4) * .3, u_frameSteps);
  prev.g = mix(prev.g, clamp(u_velocity.x * 2. + .5, 0., 1.), blendAmt);
  prev.b = mix(prev.b, clamp(u_velocity.y * 2. + .5, 0., 1.), blendAmt);
  fragColor = prev;
}`;
/** Demo shader; only its optional logo-mask branch is omitted. */
export const DISPLAY_FRAG = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform float u_time, u_pixelRatio;
uniform vec2 u_resolution;
uniform vec4 u_color1, u_color2, u_color3;
uniform float u_swirl, u_distortion;
uniform sampler2D u_flowmap;
out vec4 fragColor;
#define TWO_PI 6.28318530718
vec2 rotate(vec2 uv, float th) { return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv; }
float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); }
float noise(vec2 st) {
  vec2 i = floor(st), f = fract(st);
  float a = random(i), b = random(i + vec2(1,0)), c = random(i + vec2(0,1)), d = random(i + vec2(1,1));
  vec2 u = f*f*(3.-2.*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = .5 * u_time;
  uv -= .5; uv *= .0035 * u_resolution;
  uv = rotate(uv, (-5. / 90.) * .5 * 3.141592653589793);
  uv /= u_pixelRatio; uv += .5; uv += vec2(0., .65);
  vec4 flow = texture(u_flowmap, gl_FragCoord.xy / u_resolution.xy);
  float influence = flow.r;
  vec2 flowDir = (flow.gb - .5) * 2.;
  float n1 = noise(uv + t), n2 = noise(uv*2. - t), angle = n1 * TWO_PI;
  float distortion = u_distortion + influence * 1.35;
  uv.x += 4. * distortion * n2 * cos(angle);
  uv.y += 4. * distortion * n2 * sin(angle);
  uv += flowDir * influence * .15;
  float swirlAmt = clamp(u_swirl, 0., 2.) + influence * .45;
  for (float i = 1.; i <= 8.; i++) {
    uv.x += swirlAmt / i * cos(t + i*1.5*uv.y);
    uv.y += swirlAmt / i * cos(t + i*1.*uv.x);
  }
  vec2 cuv = uv * .85;
  float mixer = .5 + .5 * sin(cuv.x) * cos(cuv.y);
  vec3 col = mix(u_color1.rgb, u_color2.rgb, smoothstep(0., .7, mixer));
  col = mix(col, u_color3.rgb, smoothstep(.3, 1., mixer));
  fragColor = vec4(col, 1.);
}`;
