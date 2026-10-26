// Standalone design preview; these preferences are never written to storage.
const cardDefaultColors = {
  cover:'#14202B', experience:'#244E65', facts:'#343D5B', hours:'#304968', count:'#514261',
  tags:'#3D435A', impression:'#644735', footprint:'#424961', gallery:'#293E49', review:'#403A4C',
};
const cardColorPresets = [
  ['深湖','#264A5C'], ['夜蓝','#304968'], ['雾紫','#514261'], ['赤陶','#754D3E'],
  ['苔绿','#455641'], ['暖棕','#665638'], ['石墨','#24272E'], ['浅雾','#DDE4ED'],
];
function applyCardColor(element, color) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return;
  const rgb = hex => [1,3,5].map(offset => parseInt(hex.slice(offset,offset+2),16));
  const hex = values => '#' + values.map(v => Math.round(v).toString(16).padStart(2,'0')).join('');
  const mix = (a,b,amount) => hex(rgb(a).map((v,i) => v*amount + rgb(b)[i]*(1-amount)));
  const luminance = value => rgb(value).map(v => v/255).map(v => v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((sum,v,i) => sum+v*[.2126,.7152,.0722][i],0);
  const ratio = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  const light = ratio('#F6F6FA',color) >= ratio('#161D27',color);
  let ink = light ? '#F6F6FA' : '#161D27';
  // Near middle grey, neither softened ink reaches readable contrast.
  if (ratio(ink,color)<4.5) ink=ratio('#FFFFFF',color)>ratio('#000000',color) ? '#FFFFFF' : '#000000';
  const surface = amount => {
    const raised=mix(ink,color,amount);
    return ratio(ink,raised)>=4.5 ? raised : mix(luminance(ink)>.5 ? '#000000' : '#FFFFFF',color,amount);
  };
  const input=surface(.07), control=surface(.08), surfaces=[color,input,control];
  const readable = foreground => {
    let strength=0, result=foreground;
    while (surfaces.some(background=>ratio(result,background)<4.5) && strength<1) {
      strength=Math.min(1,strength+.04); result=mix(ink,foreground,strength);
    }
    return result;
  };
  const muted=readable(mix(ink,color,.74));
  const tokens = {
    color, ink, muted, accent:ink, input, control,
    line:mix(ink,color,.22), state:readable(light ? '#B3ECF2' : '#143A51'), scheme:light ? 'dark' : 'light',
  };
  Object.entries(tokens).forEach(([name,value]) => element.style.setProperty('--widget-'+name,value));
  element.querySelectorAll('[data-state-color]').forEach((button,index)=>{
    element.style.setProperty('--widget-choice-'+index,readable(button.dataset.stateColor));
  });
  element.dataset.color = color.toUpperCase();
}
function installCardMenu({ grid, readCard, setSize, setColor, editLayout, manageCards }) {
  const menu = document.createElement('section');
  menu.id = 'card-context-menu'; menu.className = 'card-context-menu'; menu.hidden = true;
  menu.setAttribute('role','dialog'); menu.setAttribute('aria-label','卡片设置');
  menu.innerHTML = '<div class="menu-title" id="context-card-name"></div><div class="menu-label">尺寸</div><div id="context-sizes"></div><div class="menu-label">卡片配色</div><div id="context-colors"></div><div class="custom-card-color"><input type="color" id="card-color-picker" aria-label="选择卡片颜色"><input id="card-color-hex" aria-label="自定义颜色" maxlength="7" spellcheck="false"><button id="card-color-apply">应用</button></div><div id="card-color-error" role="status"></div><button id="context-default-color" class="menu-text-button">恢复这张卡片的默认颜色</button><div class="context-actions"><button id="edit-layout">调整布局<span>移动 · 显隐</span></button><button id="context-manage">卡片与内容<span>显示内容</span></button></div>';
  document.body.append(menu);
  const query = selector => menu.querySelector(selector);
  let selected = 'cover', origin = grid, menuScrollTop = 0;
  function focusOrigin() {
    const target = origin.isConnected && !origin.closest('[hidden]') ? origin : grid.querySelector('.widget:not([hidden])') || grid;
    target.focus({preventScroll:true});
  }
  function close(restore = false) { const open = !menu.hidden; menu.hidden = true; detail.classList.remove('card-settings-open'); if (open && restore) focusOrigin(); }
  function position(x,y) {
    const box=menu.getBoundingClientRect(), margin=10;
    menu.style.left=Math.max(margin,Math.min(x,innerWidth-box.width-margin))+'px';
    menu.style.top=Math.max(margin,Math.min(y,innerHeight-box.height-margin))+'px';
  }
  function button(label, action) { const node=document.createElement('button'); node.type='button'; node.textContent=label; node.onclick=action; return node; }
  function open(id,anchor,x,y) {
    const card=readCard(id); if (!card) return;
    selected=id; origin=anchor; menuScrollTop=detail.scrollTop; menu.hidden=false; menu.scrollTop=0; detail.classList.add('card-settings-open');
    menu.setAttribute('aria-label',card.title+'设置'); query('#context-card-name').textContent=card.title;
    query('#context-sizes').replaceChildren(...Object.entries(card.sizes).map(([size,[columns,rows]]) => {
      const names={small:'紧凑',medium:'标准',large:'加大'};
      const option=button(names[size],()=>{ setSize(selected,size); close(true); });
      option.dataset.menuSize=size; option.setAttribute('aria-pressed',String(card.size===size));
      const shape=document.createElement('span'); shape.className='size-shape';
      shape.style.width=Math.min(25,9+columns*1.3)+'px'; shape.style.height=Math.min(20,6+rows*2)+'px'; option.prepend(shape); return option;
    }));
    query('#context-colors').replaceChildren(...cardColorPresets.map(([name,color])=>{
      const swatch=button('',()=>{ setColor(selected,color); close(true); });
      swatch.dataset.menuColor=color; swatch.style.setProperty('--swatch',color); swatch.setAttribute('aria-label',name);
      swatch.setAttribute('aria-pressed',String(card.color.toLowerCase()===color.toLowerCase())); swatch.title=name; return swatch;
    }));
    query('#card-color-picker').value=card.color; query('#card-color-hex').value=card.color.toUpperCase();
    query('#card-color-hex').removeAttribute('aria-invalid'); query('#card-color-error').textContent='';
    position(x,y); query('#context-sizes button').focus({preventScroll:true});
  }
  query('#card-color-picker').oninput=event=>{ query('#card-color-hex').value=event.target.value.toUpperCase(); query('#card-color-hex').removeAttribute('aria-invalid'); query('#card-color-error').textContent=''; };
  query('#card-color-hex').oninput=()=>{ query('#card-color-hex').removeAttribute('aria-invalid'); query('#card-color-error').textContent=''; };
  query('#card-color-apply').onclick=()=>{
    const input=query('#card-color-hex'), color=input.value.trim();
    if (!/^#[0-9a-f]{6}$/i.test(color)) {
      input.setAttribute('aria-invalid','true'); query('#card-color-error').textContent='请输入 #RRGGBB 格式的颜色';
      position(parseFloat(menu.style.left),parseFloat(menu.style.top)); input.focus({preventScroll:true}); return;
    }
    setColor(selected,color); close(true);
  };
  query('#context-default-color').onclick=()=>{ setColor(selected,cardDefaultColors[selected]); close(true); };
  query('#edit-layout').onclick=()=>{ close(); editLayout(); };
  query('#context-manage').onclick=()=>{ close(); manageCards(); };
  const detail=grid.closest('.detail-window'); grid.tabIndex=-1;
  detail.addEventListener('contextmenu',event=>{
    if (event.target.closest('input,textarea,select,a')) return;
    event.preventDefault();
    const widget=event.target.closest('.widget'), anchor=widget||grid;
    open(widget?.dataset.widget||'cover',anchor,event.clientX,event.clientY);
  });
  detail.addEventListener('keydown',event=>{
    if (event.key!=='ContextMenu' && !(event.shiftKey && event.key==='F10')) return;
    if (event.target.closest('input,textarea,select')) return;
    event.preventDefault();
    const widget=event.target.closest('.widget'), anchor=widget||grid, box=anchor.getBoundingClientRect();
    open(widget?.dataset.widget||'cover',anchor,box.x+24,Math.max(12,box.y+24));
  });
  document.addEventListener('pointerdown',event=>{ if (!menu.contains(event.target)) close(); });
  menu.addEventListener('keydown',event=>{
    if (event.key==='Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    if (event.key==='Tab') {
      const controls=[...menu.querySelectorAll('button,input')].filter(node=>!node.disabled);
      if (event.target===controls[event.shiftKey ? 0 : controls.length-1]) { event.preventDefault(); close(true); }
    }
    if (event.key==='Enter' && event.target===query('#card-color-hex')) { event.preventDefault(); query('#card-color-apply').click(); }
    if (['ArrowUp','ArrowDown'].includes(event.key) && event.target.tagName==='BUTTON') {
      event.preventDefault(); const buttons=[...menu.querySelectorAll('button')], index=buttons.indexOf(event.target);
      buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();
    }
  });
  addEventListener('resize',()=>close());
  // A queued event from focusing/scrolling to the card must not dismiss its newly opened menu.
  detail.addEventListener('scroll',()=>{ if (Math.abs(detail.scrollTop-menuScrollTop)>.5) close(); },{passive:true});
  document.querySelector('#close-preview').addEventListener('click',()=>close());
  return { close, focusOrigin };
}
