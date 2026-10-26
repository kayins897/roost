// In-memory design preview. Platform names are user attributes, never account connections.
const platformPreview = (() => {
  const find = selector => document.querySelector(selector);
  const catalog = [
    ['steam','Steam',['steam']], ['playstation','PlayStation',['playstation','ps','ps3','ps4','ps5']],
    ['switch','Switch',['switch','nintendo switch','任天堂switch']], ['ea','EA',['ea','ea app','origin']],
    ['battlenet','Battle.net',['battle.net','battlenet','暴雪','战网']],
    ['ubisoft','Ubisoft',['ubisoft','ubisoft connect','uplay','育碧']],
    ['wegame','WeGame',['wegame']], ['epic','Epic Games',['epic','epic games','epic games store']],
  ];
  let owned = ['Steam','Switch'];
  const normalize = value => value.trim().toLocaleLowerCase();
  const identity = name => catalog.find(([, , aliases]) => aliases.includes(normalize(name)));
  const key = name => identity(name)?.[0] || normalize(name);
  function logo(name) {
    const known=identity(name), art=typeof platformIconArt !== 'undefined' && platformIconArt[known?.[0]];
    if (!art) {
      const fallback=document.createElement('span'); fallback.className='platform-logo fallback';
      fallback.setAttribute('aria-hidden','true'); fallback.textContent=Array.from(name)[0]?.toUpperCase() || '·'; return fallback;
    }
    const ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg');
    svg.classList.add('platform-logo'); svg.setAttribute('viewBox',known[0]==='switch' ? '77 40 130 130' : art.viewBox); svg.setAttribute('aria-hidden','true');
    for (const d of art.paths) { const path=document.createElementNS(ns,'path'); path.setAttribute('d',d); svg.append(path); }
    return svg;
  }
  function render() {
    find('#platform-list').replaceChildren(...owned.map(name => {
      const badge=document.createElement('div'), text=document.createElement('span');
      badge.className='platform-badge'; badge.dataset.platform=key(name); text.textContent=name;
      badge.append(logo(name),text); return badge;
    }));
    if (!owned.length) { const empty=document.createElement('span'); empty.className='platform-empty'; empty.textContent='未记录'; find('#platform-list').append(empty); }
    if (!find('#platform-choices')) return;
    const choices=[...catalog.map(([id,name])=>[id,name]),...owned.filter(name=>!identity(name)).map(name=>[key(name),name])];
    find('#platform-choices').classList.add('platform-choices');
    find('#platform-choices').replaceChildren(...choices.map(([id,name]) => {
      const button=document.createElement('button'), text=document.createElement('span'); button.type='button';
      button.dataset.platform=id; button.setAttribute('aria-pressed',String(owned.some(value=>key(value)===id))); text.textContent=name;
      button.append(logo(name),text);
      button.onclick=()=>{ owned=owned.some(value=>key(value)===id) ? owned.filter(value=>key(value)!==id) : [...owned,name]; render(); ([...find('#platform-choices').children].find(node=>node.dataset.platform===id)||find('#custom-platform')).focus(); };
      return button;
    }));
  }
  function mountEditor(container,close) {
    const editor=document.createElement('div'); editor.id='platform-editor'; editor.className='platform-editor';
    editor.innerHTML='<div id="platform-choices" aria-label="选择拥有平台"></div><div class="custom-platform"><input id="custom-platform" aria-label="其他平台名称" placeholder="其他平台…" maxlength="60"><button class="button" id="add-platform">加入</button></div><p id="platform-error" role="status"></p><button class="button" id="done-platforms">完成</button>';
    container.append(editor); render();
    find('#done-platforms').onclick=()=>close(true);
    find('#add-platform').onclick=()=>{
      const input=find('#custom-platform'),name=input.value.trim(); find('#platform-error').textContent=''; if (!name) return;
      if (owned.some(value=>key(value)===key(name))) { find('#platform-error').textContent='已添加该平台'; return; }
      owned.push(name); input.value=''; render(); input.focus();
    };
    find('#custom-platform').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();find('#add-platform').click();}});
  }
  render(); return {mountEditor};
})();
