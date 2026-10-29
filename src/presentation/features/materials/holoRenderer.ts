import { HoloShaders } from './holoShaders.ts';
import type { CoverMaterialPreferences } from '../../../infrastructure/coverMaterialPreferences.ts';
type Kind = 'holographic' | 'prismatic';
const names = { holographic: 'holo', prismatic: 'poly' };
/** One reusable context, not one context per collection item. Original image stays underneath. */
export function createHoloRenderer(onReady: () => void = () => {}) {
  const canvas = document.createElement('canvas'); canvas.className = 'cover-material-canvas'; canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: false });
  if (!gl) return null;
  let texture: WebGLTexture | null = null, buffer: WebGLBuffer | null = null;
  let programs = new Map<string, WebGLProgram>(), failed = false, active = false, image: HTMLImageElement | null = null;
  let kind: Kind = 'holographic';
  function hide() { canvas.style.visibility = 'hidden'; canvas.parentElement?.removeAttribute('data-webgl-material'); }
  function unlisten() { image?.removeEventListener('load', ready); image?.removeEventListener('error', hide); }
  function shader(type: number, source: string) {
    const result = gl!.createShader(type)!; gl!.shaderSource(result, source); gl!.compileShader(result);
    if (!gl!.getShaderParameter(result, gl!.COMPILE_STATUS)) { gl!.deleteShader(result); throw new Error('材质编译失败'); } return result;
  }
  function setup() {
    programs = new Map();
    const vertex = shader(gl!.VERTEX_SHADER, HoloShaders.vertex);
    try {
      for (const effect of HoloShaders.effects) {
        const fragment = shader(gl!.FRAGMENT_SHADER, effect.src), program = gl!.createProgram()!;
        gl!.attachShader(program, vertex); gl!.attachShader(program, fragment); gl!.linkProgram(program); gl!.deleteShader(fragment);
        if (!gl!.getProgramParameter(program, gl!.LINK_STATUS)) { gl!.deleteProgram(program); throw new Error('材质连接失败'); }
        programs.set(effect.kind, program);
      }
    } finally { gl!.deleteShader(vertex); }
    buffer = gl!.createBuffer(); gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
    gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl!.STATIC_DRAW);
    texture = gl!.createTexture(); gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR); gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE); gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    failed = false;
  }
  function upload() {
    if (!image?.complete || !image.naturalWidth || !canvas.parentElement) { hide(); return false; }
    const box = canvas.parentElement;
    const ratio = Math.min(2, Math.max(1.5, window.devicePixelRatio || 1)), width = Math.max(1, Math.round(box.clientWidth * ratio)), height = Math.max(1, Math.round(box.clientHeight * ratio));
    canvas.width = width; canvas.height = height;
    const input = document.createElement('canvas'); input.width = width; input.height = height;
    const ctx = input.getContext('2d')!; ctx.imageSmoothingQuality = 'high';
    // Match the existing library image's object-fit: cover without changing its tilt.
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    ctx.drawImage(image, (width - image.naturalWidth * scale) / 2, (height - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
    gl!.bindTexture(gl!.TEXTURE_2D, texture); gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, input);
    canvas.style.visibility = ''; return true;
  }
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); failed = true; hide(); });
  canvas.addEventListener('webglcontextrestored', () => { try { setup(); if (active) ready(); } catch { failed = true; hide(); } });
  try { setup(); } catch { gl.getExtension('WEBGL_lose_context')?.loseContext(); return null; }
  return {
    canvas,
    attach(target: HTMLElement, finish: Kind) {
      active = true; kind = finish;
      unlisten();
      target.append(canvas); image = target.querySelector('img');
      hide();
      // A normal cross-origin <img> remains visible but taints a WebGL texture even
      // when its server sends CORS headers. Keep that original intact and load an
      // anonymous copy solely for the effect; blocked providers retain CSS fallback.
      const source = image?.currentSrc || image?.src;
      if (source && /^https?:/i.test(source) && new URL(source, location.href).origin !== location.origin) {
        image = new Image(); image.crossOrigin = 'anonymous'; image.src = source;
      }
      image?.addEventListener('load', ready);
      image?.addEventListener('error', hide);
      ready();
    },
    detach() { active = false; unlisten(); hide(); canvas.remove(); },
    draw(time: number, x: number, y: number, prefs: CoverMaterialPreferences) {
      if (failed || !active || canvas.style.visibility === 'hidden') return;
      const program = programs.get(names[kind])!; gl!.useProgram(program);
      gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer); const attribute = gl!.getAttribLocation(program, 'aPos'); gl!.enableVertexAttribArray(attribute); gl!.vertexAttribPointer(attribute, 2, gl!.FLOAT, false, 0, 0);
      gl!.bindTexture(gl!.TEXTURE_2D, texture); gl!.uniform1i(gl!.getUniformLocation(program, 'uCover'), 0);
      for (const [name, value] of Object.entries({ uTime: time, uStrength: prefs.strength, uFilter: prefs.filter, uEtching: Number(prefs.facets) })) gl!.uniform1f(gl!.getUniformLocation(program, name), value);
      gl!.uniform2f(gl!.getUniformLocation(program, 'uRay'), x, y); gl!.viewport(0, 0, canvas.width, canvas.height); gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      canvas.parentElement?.setAttribute('data-webgl-material', 'active');
    },
    dispose() { active = false; unlisten(); hide(); for (const program of programs.values()) gl!.deleteProgram(program); gl!.deleteTexture(texture); gl!.deleteBuffer(buffer); canvas.remove(); gl!.getExtension('WEBGL_lose_context')?.loseContext(); },
  };
  function ready() { try { if (!failed && active && upload()) onReady(); } catch { hide(); } }
}
