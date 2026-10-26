// Standalone design preview; these preferences are never written to storage.
const cardDefaultColors = {
  cover:'#111317', grade:'#3654CE', facts:'#1C1C20', hours:'#242426', count:'#232327', platform:'#17171B',
  tags:'#C91662', impression:'#F79232', footprint:'#7825D0', gallery:'#151518', review:'#121214',
};
// Default surfaces carry hierarchy; choosing a custom color gives this card a solid surface.
const cardDefaultSurfaces = {
  cover:{border:'#41454D'},
  grade:{stops:['#215AE4','#7638D6'],border:'transparent'},
  facts:{border:'#3A3A43'}, hours:{border:'transparent'}, count:{border:'#625476'}, platform:{border:'#3C3C46'},
  tags:{border:'transparent'}, impression:{stops:['#FB791B','#FFB046'],border:'transparent'},
  footprint:{stops:['#6521D0','#8F2DD5'],border:'transparent'},
  gallery:{border:'#44444C'}, review:{border:'#303038'},
};
const cardColorPresets = [
  ['鸢尾蓝','#3654CE'], ['电光紫','#7825D0'], ['玫红','#C91662'], ['暖橘','#F79232'],
  ['丁香','#D2C2F5'], ['深海青','#1E5362'], ['炭黑','#242426'], ['浅雾','#DDE4ED'],
];
function applyCardColor(element, color) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return;
  const rgb = hex => [1,3,5].map(offset => parseInt(hex.slice(offset,offset+2),16));
  const hex = values => '#' + values.map(v => Math.round(v).toString(16).padStart(2,'0')).join('');
  const mix = (a,b,amount) => hex(rgb(a).map((v,i) => v*amount + rgb(b)[i]*(1-amount)));
  const luminance = value => rgb(value).map(v => v/255).map(v => v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((sum,v,i) => sum+v*[.2126,.7152,.0722][i],0);
  const ratio = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  const id=element.dataset.widget;
  const surfaceStyle=color.toLowerCase()===cardDefaultColors[id]?.toLowerCase() ? cardDefaultSurfaces[id] : null;
  const stops=surfaceStyle?.stops || [], backgrounds=[color,...stops];
  const contrast = ink => Math.min(...backgrounds.map(background=>ratio(ink,background)));
  const light = contrast('#F6F6FA') >= contrast('#161D27');
  let ink = light ? '#F6F6FA' : '#161D27';
  // Near middle grey, neither softened ink reaches readable contrast.
  if (contrast(ink)<4.5) ink=contrast('#FFFFFF')>contrast('#000000') ? '#FFFFFF' : '#000000';
  const surface = amount => {
    const raised=mix(ink,color,amount);
    return ratio(ink,raised)>=4.5 ? raised : mix(luminance(ink)>.5 ? '#000000' : '#FFFFFF',color,amount);
  };
  const input=surface(.07), control=surface(.08), surfaces=[...backgrounds,input,control];
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
    surface:stops.length ? 'linear-gradient(135deg,'+stops.join(',')+')' : color,
    border:surfaceStyle?.border || mix(ink,color,.22),
    line:mix(ink,color,.22), state:readable(light ? '#B3ECF2' : '#143A51'), scheme:light ? 'dark' : 'light',
  };
  Object.entries(tokens).forEach(([name,value]) => element.style.setProperty('--widget-'+name,value));
  element.querySelectorAll('[data-state-color]').forEach((button,index)=>{
    element.style.setProperty('--widget-choice-'+index,readable(button.dataset.stateColor));
  });
  element.dataset.color = color.toUpperCase();
  element.dataset.surface = stops.length ? 'gradient' : 'solid';
}
function installCardMenu({ grid, readCard, setSize, setColor, editLayout, manageCards }) {
  const menu = document.createElement('section');
  menu.id = 'card-context-menu'; menu.className = 'card-context-menu'; menu.hidden = true;
  menu.setAttribute('role','dialog'); menu.setAttribute('aria-label','卡片设置');
  menu.innerHTML = "<div class=\"context-heading\"><button id=\"context-back\" aria-label=\"返回内容编辑\">‹</button><div class=\"menu-title\" id=\"context-card-name\"></div><button id=\"context-close\" aria-label=\"关闭卡片菜单\">×</button></div><div id=\"context-content\"></div><button id=\"context-appearance\" class=\"menu-appearance\">外观与布局 <span>›</span></button><div id=\"context-appearance-page\" hidden><div class=\"menu-label\">尺寸</div><div id=\"context-sizes\"></div><div class=\"menu-label\">卡片配色</div><div id=\"context-colors\"></div><div class=\"custom-card-color\"><input type=\"color\" id=\"card-color-picker\" aria-label=\"选择卡片颜色\"><input id=\"card-color-hex\" aria-label=\"自定义颜色\" maxlength=\"7\" spellcheck=\"false\"><button id=\"card-color-apply\">应用</button></div><div id=\"card-color-error\" role=\"status\"></div><button id=\"context-default-color\" class=\"menu-text-button\">恢复这张卡片的默认颜色</button><div class=\"context-actions\"><button id=\"edit-layout\">调整布局<span>移动 · 显隐</span></button><button id=\"context-manage\">卡片与内容<span>显示内容</span></button></div></div>";
  document.body.append(menu);
  const query = selector => menu.querySelector(selector);
  let selected='cover',origin=grid,menuScrollTop=0,blank=false,anchorX=10,anchorY=10;
  const visibleControls=()=>[...menu.querySelectorAll('button,input,textarea,select,summary')].filter(node=>!node.disabled&&node.getClientRects().length);
  function showPage(page) {
    menu.dataset.page=page;query('#context-content').hidden=page!=='content';query('#context-appearance').hidden=page!=='content';
    query('#context-appearance-page').hidden=page!=='appearance';query('#context-back').hidden=page!=='appearance'||blank;
    position(anchorX,anchorY);(page==='content'?(query('#context-content').querySelector('button,input,textarea,select')||query('#context-appearance')):query('#context-sizes button')).focus({preventScroll:true});
  }
  function focusOrigin() {
    const target = origin.isConnected && !origin.closest('[hidden]') ? origin : grid.querySelector('.widget:not([hidden])') || grid;
    target.focus({preventScroll:true});
  }
  function close(restore = false) { const open = !menu.hidden; menu.hidden = true; detail.classList.remove('card-settings-open'); if (open && restore) focusOrigin(); }
  function position(x,y) {
    anchorX=x;anchorY=y;
    const box=menu.getBoundingClientRect(), margin=10;
    menu.style.left=Math.max(margin,Math.min(x,innerWidth-box.width-margin))+'px';
    menu.style.top=Math.max(margin,Math.min(y,innerHeight-box.height-margin))+'px';
  }
  function button(label, action) { const node=document.createElement('button'); node.type='button'; node.textContent=label; node.onclick=action; return node; }
  function open(id,anchor,x,y,isBlank=false) {
    const card=readCard(id); if (!card) return;
    selected=id;blank=isBlank;menu.dataset.widget=id; origin=anchor; menuScrollTop=detail.scrollTop; menu.hidden=false; menu.scrollTop=0; detail.classList.add('card-settings-open');
    menu.setAttribute('aria-label',card.title+'设置'); query('#context-card-name').textContent=isBlank?'布局与卡片':card.title;
    query('#context-content').replaceChildren();if(!isBlank)mountCardContent(id,query('#context-content'),close);
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
    position(x,y);showPage(isBlank?'appearance':'content');
  }
  query('#context-appearance').onclick=()=>showPage('appearance');
  query('#context-back').onclick=()=>showPage('content');
  query('#context-close').onclick=()=>close(true);
  new ResizeObserver(()=>{if(!menu.hidden)position(anchorX,anchorY);}).observe(menu);
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
    if(event.target.closest('a')||event.target.closest('input,textarea,select')&&!event.target.readOnly)return;
    event.preventDefault();
    const widget=event.target.closest('.widget'), anchor=widget||grid;
    open(widget?.dataset.widget||'cover',anchor,event.clientX,event.clientY,!widget);
  });
  detail.addEventListener('keydown',event=>{
    if (event.key!=='ContextMenu' && !(event.shiftKey && event.key==='F10')) return;
    if(event.target.closest('input,textarea,select')&&!event.target.readOnly)return;
    event.preventDefault();
    const widget=event.target.closest('.widget'), anchor=widget||grid, box=anchor.getBoundingClientRect();
    open(widget?.dataset.widget||'cover',anchor,box.x+24,Math.max(12,box.y+24),!widget);
  });
  document.addEventListener('pointerdown',event=>{ if (!menu.contains(event.target)) close(); });
  menu.addEventListener('keydown',event=>{
    if (event.key==='Escape') { event.preventDefault(); event.stopPropagation(); if(menu.dataset.page==='appearance'&&!blank)showPage('content');else close(true); }
    if (event.key==='Tab') {
      const controls=visibleControls();
      if (event.target===controls[event.shiftKey ? 0 : controls.length-1]) { event.preventDefault(); close(true); }
    }
    if (event.key==='Enter' && event.target===query('#card-color-hex')) { event.preventDefault(); query('#card-color-apply').click(); }
    if (['ArrowUp','ArrowDown'].includes(event.key) && event.target.tagName==='BUTTON') {
      event.preventDefault(); const buttons=visibleControls().filter(n=>n.tagName==='BUTTON'),index=buttons.indexOf(event.target);
      buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();
    }
  });
  addEventListener('resize',()=>close());
  // A queued event from focusing/scrolling to the card must not dismiss its newly opened menu.
  detail.addEventListener('scroll',()=>{ if (Math.abs(detail.scrollTop-menuScrollTop)>.5) close(); },{passive:true});
  document.querySelector('#close-preview').addEventListener('click',()=>close());
  return { close, focusOrigin };
}
