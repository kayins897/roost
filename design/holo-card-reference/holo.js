(() => {
  const { vertex, effects } = window.HoloShaders;
  const params = { strength: 0.65, filter: 0.55, speed: 0.35, etching: true, compare: false, paused: false };
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const message = document.getElementById('message');
  let cover = window.HoloFixtures.cover();
  let raf = 0, clock = 0, last = 0, selected = 'foil', uploadVersion = 0;
  let frames = 0;
  const views = [];

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(error);
    }
    return shader;
  }
  function createView(effect) {
    const figure = document.querySelector('[data-kind="' + effect.kind + '"]');
    const face = figure.querySelector('.card-face');
    const canvas = figure.querySelector('canvas');
    const fallback = new Image(); fallback.className = 'fallback'; fallback.alt = '原图（静态回退）';
    fallback.style.cssText = 'position:absolute;inset:0;display:none'; face.append(fallback);
    const state = { x: 0, y: 0, tx: 0, ty: 0 };
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true });
    let program, texture, uniforms, buffer, failed = !gl;
    function staticCover() {
      fallback.src = cover.toDataURL('image/png');
      fallback.style.display = failed ? 'block' : 'none'; canvas.style.visibility = failed ? 'hidden' : '';
    }
    function setup() {
      const vs = compile(gl, gl.VERTEX_SHADER, vertex);
      const fs = compile(gl, gl.FRAGMENT_SHADER, effect.src);
      program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs);
      gl.linkProgram(program); gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
      const pos = gl.getAttribLocation(program, 'aPos');
      gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
      texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      uniforms = Object.fromEntries(['uCover','uTime','uStrength','uFilter','uEtching','uRay'].map(n => [n, gl.getUniformLocation(program,n)]));
      failed = false; updateTexture();
    }
    function updateTexture() {
      if (!failed) { gl.bindTexture(gl.TEXTURE_2D, texture); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cover); }
      staticCover();
    }
    try { if (gl) setup(); } catch (e) { failed = true; message.textContent = '材质未能启动，已显示原图。'; }
    staticCover();
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); failed = true; staticCover(); requestDraw(); });
    canvas.addEventListener('webglcontextrestored', () => { try { setup(); } catch { failed = true; staticCover(); } requestDraw(); });
    function point(x, y, immediate = false) {
      state.tx = Math.max(-1,Math.min(1,x)); state.ty = Math.max(-1,Math.min(1,y));
      if (immediate || media.matches) { state.x = state.tx; state.y = state.ty; }
      requestDraw();
    }
    figure.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      const rect = figure.getBoundingClientRect();
      point((e.clientX-rect.left)/rect.width*2-1,(e.clientY-rect.top)/rect.height*2-1);
    });
    figure.addEventListener('pointerleave', () => point(0,0));
    figure.addEventListener('click', () => select(effect.kind));
    figure.addEventListener('focus', () => select(effect.kind));
    figure.addEventListener('keydown', e => {
      const directions = {ArrowLeft:[-0.2,0],ArrowRight:[0.2,0],ArrowUp:[0,-0.2],ArrowDown:[0,0.2]};
      if (directions[e.key]) { e.preventDefault(); const [x,y]=directions[e.key]; point(state.tx+x,state.ty+y); }
      if (e.key === 'Escape') point(0,0);
    });
    return {
      kind: effect.kind, state, point, updateTexture, failed: () => failed,
      draw(t, dt = 1/60, immediate = false) {
        const amount = immediate || media.matches ? 1 : 1-Math.exp(-dt*12);
        state.x += (state.tx-state.x)*amount; state.y += (state.ty-state.y)*amount;
        if (Math.abs(state.tx-state.x)<0.0005) state.x=state.tx;
        if (Math.abs(state.ty-state.y)<0.0005) state.y=state.ty;
        face.style.transform = media.matches ? '' : 'perspective(1000px) rotateX('+(-state.y*5)+'deg) rotateY('+(state.x*7)+'deg)';
        if (!failed) {
          gl.useProgram(program); gl.bindTexture(gl.TEXTURE_2D,texture); gl.uniform1i(uniforms.uCover,0);
          gl.uniform1f(uniforms.uTime,t); gl.uniform1f(uniforms.uStrength,params.compare?0:params.strength);
          gl.uniform1f(uniforms.uFilter,params.compare?0:params.filter);
          gl.uniform1f(uniforms.uEtching,params.etching?1:0); gl.uniform2f(uniforms.uRay,state.x,state.y);
          gl.viewport(0,0,canvas.width,canvas.height); gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        }
        return state.x!==state.tx || state.y!==state.ty;
      }
    };
  }
  function playing() { return !params.paused && !media.matches && !params.compare && params.speed>0 && (params.strength>0 || params.filter>0) && views.some(v=>!v.failed()); }
  function requestDraw() { if (!raf && !document.hidden) raf=requestAnimationFrame(frame); }
  function frame(now) {
    raf=0; const dt=last?Math.min(0.05,(now-last)/1000):1/60; last=now;
    if (playing()) clock+=dt*params.speed;
    let moving=false; views.forEach(v=>{moving=v.draw(clock,dt)||moving;}); frames++;
    if (playing() || moving) requestDraw(); else last=0;
  }
  function select(kind) {
    selected=kind;
    const effect=effects.find(e=>e.kind===kind);
    document.getElementById('srcTitle').textContent=effect.title+' · fragment shader';
    document.getElementById('src').textContent=effect.src;
    document.querySelectorAll('.card').forEach(f=>f.classList.toggle('is-active',f.dataset.kind===kind));
  }
  effects.forEach(e=>views.push(createView(e)));
  if (views.some(v=>v.failed())) message.textContent='部分材质不可用，已保留原图。';
  select('foil');
  function sync() {
    document.getElementById('strength').value=String(params.strength*100);
    document.getElementById('filter').value=String(params.filter*100);
    document.getElementById('speed').value=String(params.speed*100);
    document.getElementById('strengthOut').textContent=Math.round(params.strength*100)+'%';
    document.getElementById('filterOut').textContent=Math.round(params.filter*100)+'%';
    document.getElementById('speedOut').textContent=Math.round(params.speed*100)+'%';
    document.getElementById('etching').checked=params.etching;
    document.getElementById('compare').setAttribute('aria-pressed',String(params.compare));
    document.getElementById('compare').textContent=params.compare?'返回材质':'查看原图';
    const stopped=params.paused||media.matches;
    const motion=document.getElementById('motion');
    motion.setAttribute('aria-pressed',String(!stopped));
    motion.textContent=media.matches?'系统已减少动态':stopped?'继续流动':'暂停流动';
    motion.disabled=media.matches;
    requestDraw();
  }
  ['strength','filter','speed'].forEach(key=>document.getElementById(key).addEventListener('input',e=>{params[key]=Number(e.target.value)/100;sync();}));
  document.getElementById('etching').addEventListener('change',e=>{params.etching=e.target.checked;sync();});
  document.getElementById('compare').addEventListener('click',()=>{params.compare=!params.compare;sync();});
  document.getElementById('motion').addEventListener('click',()=>{params.paused=!params.paused;sync();});
  document.querySelector('.file-button').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();document.getElementById('coverFile').click();}});
  document.getElementById('coverFile').addEventListener('change',async e=>{
    const file=e.target.files[0]; if(!file)return; const version=++uploadVersion;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>25*1024*1024){message.textContent='请选择25MB以内的 PNG、JPEG 或 WebP 图片。';e.target.value='';return;}
    const url=URL.createObjectURL(file);const image=new Image();
    try {
      image.src=url;await image.decode();if(version!==uploadVersion)return;
      cover=window.HoloFixtures.fromImage(image);views.forEach(v=>v.updateTexture());
      message.textContent='底图仅用于本页预览，未保存到收藏库。';requestDraw();
    } catch {if(version===uploadVersion)message.textContent='图片无法读取，已保留原底图。';}
    finally {URL.revokeObjectURL(url);e.target.value='';}
  });
  document.getElementById('reset').addEventListener('click',()=>{
    uploadVersion++;Object.assign(params,{strength:.65,filter:.55,speed:.35,etching:true,compare:false,paused:false});
    clock=0;cover=window.HoloFixtures.cover();views.forEach(v=>{v.point(0,0,true);v.updateTexture();});
    message.textContent='';sync();
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){cancelAnimationFrame(raf);raf=0;last=0;}else requestDraw();
  });
  media.addEventListener('change',()=>{views.forEach(v=>v.point(0,0,true));sync();});
  sync();
  // Local deterministic inspection surface; no production bridge or persistent storage.
  window.__deck={
    params, insts:views, select, active:()=>selected,
    setTime(t){clock=t;last=0;views.forEach(v=>v.draw(clock,1/60,true));},
    setRay(kind,x,y){const view=views.find(v=>v.kind===kind);view.point(x,y,true);view.draw(clock,1/60,true);},
    snapshot:()=>({clock,frames,paused:params.paused,reduced:media.matches,failed:views.filter(v=>v.failed()).map(v=>v.kind)})
  };
})();
