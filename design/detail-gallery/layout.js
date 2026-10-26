// Layout prototype only: no repository, storage key, files or persistent preferences.
(() => {
  const find = selector => document.querySelector(selector);
  const grid = find('.bento-grid');
  const definitions = [
    ['cover', '封面', { small:[1,2,420], medium:[2,3,690], large:[2,4,860] }],
    ['experience', '我的体验', { small:[1,1,270], medium:[2,1,270], large:[2,2,440] }],
    ['hours', '游玩时长', { medium:[1,1,190], large:[2,1,190] }],
    ['platform', '拥有平台', { medium:[1,1,190], large:[2,1,190] }],
    ['facts', '作品资料', { small:[1,1,270], medium:[2,1,250], large:[4,1,240] }],
    ['impression', '一句话印象', { small:[1,1,180], medium:[3,1,190], large:[4,2,340] }],
    ['footprint', '体验足迹', { small:[1,1,200], medium:[1,2,470], large:[2,2,440] }],
    ['gallery', '我的截图', { small:[2,1,200], medium:[2,1,270], large:[4,2,400] }],
    ['tags', '标签', { small:[1,1,210], medium:[1,1,270], large:[4,1,210] }],
    ['count', '完成次数', { medium:[1,1,160], large:[2,1,160] }],
    ['review', '长文测评', { small:[2,1,80], medium:[4,1,80] }],
  ];
  const fieldNames = { original:'作品名称', year:'发行年份', date:'收录日期', creator:'创作者', source:'来源链接', tag0:'玩法', tag1:'题材', tag2:'游玩场景', tag3:'其他' };
  const sizeNames = { small:'紧凑', medium:'标准', large:'加大' };
  const widgets = new Map();
  let layout = defaults(), entryLayout = null, editing = false, dragged = null;
  function defaults() { return { cards:definitions.map(([id]) => ({ id, size:'medium', visible:id!=='count', color:cardDefaultColors[id] })), fields:Object.fromEntries(Object.keys(fieldNames).map(id => [id,true])) }; }
  const clone = value => JSON.parse(JSON.stringify(value));
  const announce = text => { find('#layout-status').textContent = text; };
  // Native auto-sized grid tracks grow with content; hover transforms never feed back into row sizing.
  function applyFields() {
    Object.entries(layout.fields).forEach(([id, visible]) => {
      const node = id.startsWith('tag') ? find('#tag-rows')?.children[Number(id.slice(3))] : find('[data-field-row="' + id + '"]');
      if (node) node.hidden = !visible;
      const checkbox = find('[data-toggle-field="' + id + '"]'); if (checkbox) checkbox.checked = visible;
    });
  }
  function render() {
    layout.cards.forEach((card, index) => {
      const widget = widgets.get(card.id), element = widget.element, [columns,rows,height] = widget.sizes[card.size];
      element.hidden = !card.visible; element.dataset.size = card.size;
      applyCardColor(element,card.color);
      element.style.setProperty('--cols', columns);
      element.style.setProperty('--rows', rows);
      element.style.setProperty('--card-height', height+'px');
      element.style.setProperty('--medium-cols', card.size==='medium' && ['cover','experience','gallery'].includes(card.id) ? 1 : Math.min(columns,2));
      element.style.setProperty('--medium-rows', card.size==='medium' && ['cover','footprint'].includes(card.id) ? rows : 1);
      element.classList.remove('col-span-1','col-span-2','col-span-3','col-span-4','row-span-1','row-span-2','row-span-3','row-span-4');
      element.classList.add('col-span-'+columns,'row-span-'+rows);
      element.querySelector('[data-action=size]').textContent = sizeNames[card.size] + ' ⌄';
      element.querySelectorAll('[data-size]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.size === card.size)));
      element.querySelector('[data-action=move-up]').disabled = !layout.cards.slice(0,index).some(c => c.visible);
      element.querySelector('[data-action=move-down]').disabled = !layout.cards.slice(index+1).some(c => c.visible);
      find('[data-toggle-widget="' + card.id + '"]').checked = card.visible;
      grid.append(element);
    });
    find('#layout-empty').hidden = layout.cards.some(card => card.visible);
    applyFields();
  }
  function closeSizes() { document.querySelectorAll('.widget-sizes').forEach(node => node.hidden = true); document.querySelectorAll('[data-action=size]').forEach(node => node.setAttribute('aria-expanded', 'false')); }
  function setEditing(value) {
    editing = value; find('.detail-window').classList.toggle('layout-editing', value);
    find('#layout-tools').hidden = !value;
    find('#widget-manager').hidden = true; find('#manage-widgets').setAttribute('aria-expanded', 'false');
    widgets.forEach(widget => { widget.body.inert = value; widget.tools.hidden = !value; });
    closeSizes(); render();
    if (value) find('#layout-done').focus(); else cardMenu.focusOrigin();
  }
  function move(id, target, after = false) {
    if (!editing || id === target) return;
    const source = layout.cards.find(card => card.id === id);
    layout.cards = layout.cards.filter(card => card.id !== id);
    layout.cards.splice(layout.cards.findIndex(card => card.id === target) + Number(after), 0, source);
    closeSizes(); render(); widgets.get(id).tools.querySelector('.widget-drag').focus();
    announce(widgets.get(id).title + '已移动');
  }
  function stepMove(id, step) {
    const visible = layout.cards.filter(card => card.visible), index = visible.findIndex(card => card.id === id), target = visible[index + step];
    if (target) move(id, target.id, step > 0);
  }
  function makeButton(text, label, action) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
    button.setAttribute('aria-label', label); if (action) button.dataset.action = action; return button;
  }
  definitions.forEach(([id,title,sizes]) => {
    const element = find('.' + id + '-card'), body = document.createElement('div'), tools = document.createElement('div');
    element.classList.add('widget','group','rounded-3xl'); element.dataset.widget = id; element.setAttribute('aria-label', title);
    element.tabIndex=0; element.setAttribute('aria-haspopup','dialog');
    body.className = 'widget-body'; body.append(...element.childNodes); tools.className = 'widget-tools'; tools.hidden = true;
    const handle = makeButton('⠿', '拖动' + title), up = makeButton('↑', '上移' + title, 'move-up'), down = makeButton('↓', '下移' + title, 'move-down');
    handle.className = 'widget-drag'; handle.draggable = true;
    const size = makeButton('标准 ⌄', title + '尺寸', 'size'), hide = makeButton('−', '隐藏' + title, 'hide'), menu = document.createElement('div');
    menu.className = 'widget-sizes'; menu.hidden = true; size.setAttribute('aria-expanded','false');
    for (const name of Object.keys(sizes)) {
      const option = makeButton(sizeNames[name], title + '：' + sizeNames[name]); option.dataset.size = name;
      option.onclick = () => { layout.cards.find(card => card.id === id).size = name; closeSizes(); render(); size.focus(); announce(title + '尺寸改为' + sizeNames[name]); };
      menu.append(option);
    }
    size.onclick = () => { const open = menu.hidden; closeSizes(); menu.hidden = !open; size.setAttribute('aria-expanded', String(open)); if (open) menu.querySelector('[aria-pressed=true]').focus(); };
    up.onclick = () => stepMove(id,-1); down.onclick = () => stepMove(id,1);
    handle.onkeydown = event => { if (['ArrowUp','ArrowDown'].includes(event.key)) { event.preventDefault(); stepMove(id,event.key === 'ArrowUp' ? -1 : 1); } };
    hide.onclick = () => { layout.cards.find(card => card.id === id).visible = false; closeSizes(); render(); find('#manage-widgets').focus(); announce(title + '已隐藏，内容保留'); };
    tools.append(handle,up,down,size,hide,menu); element.append(tools,body);
    widgets.set(id,{ element,body,tools,title,sizes });
    const label = document.createElement('label'), checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.dataset.toggleWidget = id;
    checkbox.onchange = () => { layout.cards.find(card => card.id === id).visible = checkbox.checked; render(); checkbox.focus(); };
    label.append(checkbox, title); find('#widget-toggles').append(label);
    handle.ondragstart = event => {
      if (!editing) { event.preventDefault(); return; } dragged = id;
      event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain',id); element.classList.add('dragging');
    };
    handle.ondragend = clearDrag;
    element.ondragover = event => {
      if (!editing || !dragged || dragged === id) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move'; clearDrop();
      element.classList.add(event.clientY < element.getBoundingClientRect().y + element.offsetHeight/2 ? 'drop-before' : 'drop-after');
    };
    element.ondrop = event => {
      if (!editing || !dragged) return; event.preventDefault();
      const after = event.clientY >= element.getBoundingClientRect().y + element.offsetHeight/2;
      move(dragged,id,after); clearDrag();
    };
  });
  function clearDrop() { widgets.forEach(widget => widget.element.classList.remove('drop-before','drop-after')); }
  function clearDrag() { dragged = null; clearDrop(); widgets.forEach(widget => widget.element.classList.remove('dragging')); }
  Object.entries(fieldNames).forEach(([id,title],index) => {
    if (index === 0 || index === 5) { const heading = document.createElement('span'); heading.className = 'field-heading'; heading.textContent = index === 0 ? '作品资料' : '标签分组'; find('#field-toggles').append(heading); }
    const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.dataset.toggleField = id;
    input.onchange = () => { layout.fields[id] = input.checked; applyFields(); };
    label.append(input,title); find('#field-toggles').append(label);
  });
  function beginEdit() { if (!editing) entryLayout = clone(layout); setEditing(true); }
  function manageCards() {
    beginEdit(); find('#widget-manager').hidden=false; find('#manage-widgets').setAttribute('aria-expanded','true');
    find('#widget-toggles input').focus();
  }
  const cardMenu = installCardMenu({
    grid,
    readCard:id=>{ const widget=widgets.get(id), card=layout.cards.find(c=>c.id===id); return widget&&card ? {...card,title:widget.title,sizes:widget.sizes} : null; },
    setSize:(id,size)=>{ const card=layout.cards.find(c=>c.id===id); if (card && widgets.get(id).sizes[size]) { card.size=size; render(); announce('卡片尺寸已调整'); } },
    setColor:(id,color)=>{ const card=layout.cards.find(c=>c.id===id); if (card && /^#[0-9a-f]{6}$/i.test(color)) { card.color=color; render(); announce('卡片配色已调整'); } },
    editLayout:beginEdit,
    manageCards,
  });
  find('#restore-widgets').onclick=manageCards;
  find('#layout-done').onclick = () => { setEditing(false); announce('布局已应用于当前预览'); };
  find('#layout-cancel').onclick = () => { layout = clone(entryLayout); setEditing(false); announce('已恢复调整前的布局'); };
  find('#layout-reset').onclick = () => { layout = defaults(); closeSizes(); render(); find('#layout-reset').focus(); announce('已恢复默认布局，内容保留'); };
  find('#manage-widgets').onclick = () => { const open = find('#widget-manager').hidden; find('#widget-manager').hidden = !open; find('#manage-widgets').setAttribute('aria-expanded', String(open)); };
  document.addEventListener('click', event => { if (!event.target.closest('.widget-tools')) closeSizes(); });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !editing) return;
    const open = [...document.querySelectorAll('.widget-sizes')].find(node => !node.hidden);
    closeSizes(); clearDrag();
    if (open) { event.preventDefault(); open.parentElement.querySelector('[data-action=size]').focus(); }
  });
  new MutationObserver(applyFields).observe(find('#tag-rows'),{childList:true});
  render();
})();
