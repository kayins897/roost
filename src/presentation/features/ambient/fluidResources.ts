import { DISPLAY_FRAG, FLOW_FRAG, VERTEX_SHADER } from './fluidShaders.ts';
export function createFluidResources(gl: WebGL2RenderingContext) {
  const shaders: WebGLShader[] = [], programs: WebGLProgram[] = [], textures: WebGLTexture[] = [], framebuffers: WebGLFramebuffer[] = [], buffers: WebGLBuffer[] = [];
  const dispose = () => {
    for (const value of framebuffers) gl.deleteFramebuffer(value);
    for (const value of textures) gl.deleteTexture(value);
    for (const value of buffers) gl.deleteBuffer(value);
    for (const value of programs) gl.deleteProgram(value);
    for (const value of shaders) gl.deleteShader(value);
  };
  try {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type); if (!shader) throw new Error('Shader allocation failed');
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader compilation failed');
      return shader;
    };
    const link = (source: string) => {
      const program = gl.createProgram(); if (!program) throw new Error('Program allocation failed');
      programs.push(program); gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, source)); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Program linking failed');
      return program;
    };
    const flow = link(FLOW_FRAG), display = link(DISPLAY_FRAG), quad = gl.createBuffer();
    if (!quad) throw new Error('Buffer allocation failed');
    buffers.push(quad); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const bind = (program: WebGLProgram) => {
      gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      const attribute = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    };
    const target = (width: number, height: number) => {
      const tex = gl.createTexture(), fbo = gl.createFramebuffer();
      if (tex) textures.push(tex); if (fbo) framebuffers.push(fbo);
      if (!tex || !fbo) throw new Error('Flow allocation failed');
      const neutral = new Uint8Array(width * height * 4);
      for (let i = 0; i < width * height; i++) { neutral[i * 4 + 1] = neutral[i * 4 + 2] = 128; neutral[i * 4 + 3] = 255; }
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, neutral);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete flow target');
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); return { tex, fbo };
    };
    const releaseTargets = () => {
      for (const value of framebuffers.splice(0)) gl.deleteFramebuffer(value);
      for (const value of textures.splice(0)) gl.deleteTexture(value);
    };
    return { flow, display, bind, target, releaseTargets, dispose };
  } catch { dispose(); return null; }
}
