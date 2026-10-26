// Isolated, in-memory design preview. No application repository or storage.
const $ = selector => document.querySelector(selector);
const previewDetail = (() => {
  const states = ['新作开荒','游玩中','未完待续','新游戏+','收官完结','暂时搁置','已体验 · 未分类'];
  const grades = ['SSS','SS','S','A','B','C'];
  let state='新游戏+', priority='A', rating=9;
  const tags=[['玩法',['银河恶魔城','动作','探索']],['题材',['奇幻','虫之王国']],['游玩场景',['需要沉浸']],['其他',['独立游戏']]];
  const footprints=[{date:'2026.10',title:'回到圣巢',text:'开始新一轮探索，寻找上次错过的角落。'},{date:'2026.09',title:'旅程的一个句点',text:'给这段体验留下一份记录。'}];
  const hasPriority=()=>['新作开荒','游玩中','未完待续','新游戏+'].includes(state);
  const hasRating=()=>['新游戏+','收官完结'].includes(state);
  function renderExperience() {
    $('#current-state').textContent=state;
    $('#priority-field').hidden=!hasPriority(); $('#priority-value').textContent=priority||'未设置';
    $('#grade-value').textContent=hasRating() && rating!==null ? rating.toFixed(1) : '—';
    $('#grade-unit').hidden=!hasRating() || rating===null;
    $('#grade-empty').hidden=!hasRating() || rating!==null; $('#grade-unavailable').hidden=hasRating();
    $('.grade-card').dataset.ratingAvailable=String(hasRating());
  }
  function renderTags() {
    $('#tag-rows').replaceChildren(...tags.map(([label,values])=>{
      const row=document.createElement('div'), name=document.createElement('span'), list=document.createElement('div');
      row.className='tag-row'; name.textContent=label;
      for (const value of values) { const chip=document.createElement('span'); chip.className='tag-pill'; chip.textContent=value; list.append(chip); }
      if (!values.length) { const empty=document.createElement('span'); empty.className='count'; empty.textContent='暂无标签'; list.append(empty); }
      row.append(name,list); return row;
    }));
  }
  function renderFootprints() {
    $('#footprints').replaceChildren(...footprints.map(note=>{
      const row=document.createElement('li'), time=document.createElement('time'), wrap=document.createElement('div'), title=document.createElement('strong');
      time.textContent=note.date||'日期未记录'; title.textContent=note.title; wrap.append(title);
      if (note.text) { const text=document.createElement('p'); text.textContent=note.text; wrap.append(text); }
      row.append(time,wrap); return row;
    }));
    if (!footprints.length) { const row=document.createElement('li'); row.className='footprint-empty'; row.textContent='还没有体验足迹'; $('#footprints').append(row); }
  }
  function setRating(value) {
    if (!hasRating() || (value!==null && (!Number.isFinite(value) || value<0 || value>10 || !Number.isInteger(value*2)))) return false;
    rating=value; renderExperience(); return true;
  }
  function setStat(key,value,date) {
    const target=$('#'+key+'-value'); target.replaceChildren(); target.append(value===''?'未记录':value);
    if (value!=='') { const unit=document.createElement('small'); unit.textContent=key==='hours'?'h':'次'; target.append(unit); }
    if (key==='hours') {
      const node=$('#last-run-value'); node.textContent=date ? date.replace('T',' ').replaceAll('-','.') : '未记录';
      if (date) node.setAttribute('datetime',date); else node.removeAttribute('datetime');
    }
  }
  $('.favorite').onclick=event=>{ const button=event.currentTarget, value=button.getAttribute('aria-pressed')!=='true'; button.setAttribute('aria-pressed',String(value)); button.setAttribute('aria-label',value?'取消喜欢':'标为喜欢'); button.textContent=value?'♥':'♡'; };
  function countWriting() { $('#impression-count').textContent=$('#impression').value.length+' / 80'; $('#review-count').textContent=$('#review-body textarea').value.length+' 字'; }
  $('#review-toggle').onclick=()=>{ const open=$('#review-body').hidden; $('#review-body').hidden=!open; $('#review-toggle').setAttribute('aria-expanded',String(open)); };
  let photos=[{src:'assets/shot-1.jpg',caption:'旅途中的一刻'},{src:'assets/shot-2.jpg',caption:'想再回去的地方'},{src:'assets/shot-3.jpg',caption:'探索留下的画面'},{src:'assets/shot-4.jpg',caption:''}];
  let photoIndex=0,coverIndex=0,galleryMode='single',galleryPage=0,photoOrigin=null;
  const pageSize=()=>({single:1,quad:4,nine:9}[galleryMode]);
  function renderPhotos() {
    const size=pageSize(), pages=Math.max(1,Math.ceil(photos.length/size)); galleryPage=Math.min(galleryPage,pages-1);
    $('.gallery-card').dataset.galleryMode=galleryMode; $('#photo-count').textContent=photos.length+' 张';
    const indices=galleryMode==='single' ? (photos.length?[coverIndex]:[]) : photos.map((_,i)=>i).slice(galleryPage*size,(galleryPage+1)*size);
    $('#gallery-track').replaceChildren(...indices.map(index=>{
      const photo=photos[index], button=document.createElement('button'), image=document.createElement('img');
      button.className='gallery-photo'; button.dataset.photoIndex=index; button.setAttribute('aria-label','查看截图 '+(index+1));
      image.src=photo.src; image.alt=photo.caption||'游戏截图 '+(index+1); image.draggable=false;
      button.append(image); button.onclick=()=>openPhoto(index); return button;
    }));
    if (!photos.length) { const empty=document.createElement('div'); empty.className='gallery-empty'; empty.textContent='还没有截图'; $('#gallery-track').append(empty); }
    $('.gallery-pages').hidden=galleryMode==='single'||pages<=1;
    $('#gallery-page-count').textContent=(galleryPage+1)+' / '+pages;
    $('#gallery-prev-page').disabled=galleryPage===0; $('#gallery-next-page').disabled=galleryPage===pages-1;
  }
  function showPhoto() {
    const photo=photos[photoIndex]; if (!photo) { $('.lightbox').close(); return; }
    $('#lightbox-image').src=photo.src; $('#lightbox-image').alt=photo.caption||'游戏截图 '+(photoIndex+1);
    $('#lightbox-position').textContent=(photoIndex+1)+' / '+photos.length; $('#photo-caption').value=photo.caption;
    $('#prev-photo').disabled=$('#next-photo').disabled=photos.length<2;
    $('#set-gallery-cover').disabled=photoIndex===coverIndex;
  }
  function openPhoto(index) { photoOrigin=document.activeElement; photoIndex=index; showPhoto(); $('.lightbox').showModal(); $('#close-lightbox').focus(); }
  function movePhoto(step) { if (photos.length) { photoIndex=(photoIndex+step+photos.length)%photos.length; showPhoto(); } }
  $('#prev-photo').onclick=()=>movePhoto(-1); $('#next-photo').onclick=()=>movePhoto(1);
  $('#close-lightbox').onclick=()=>$('.lightbox').close();
  $('.lightbox').addEventListener('close',()=>{const target=photoOrigin?.isConnected&&photoOrigin.getClientRects().length?photoOrigin:$('.gallery-card');target.focus({preventScroll:true});});
  $('.lightbox').addEventListener('click',event=>{ if (event.target===$('.lightbox')) $('.lightbox').close(); });
  $('.lightbox').addEventListener('keydown',event=>{ if (event.target instanceof HTMLInputElement) return; if (['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); movePhoto(event.key==='ArrowLeft'?-1:1); } });
  $('#photo-caption').oninput=()=>{ photos[photoIndex].caption=$('#photo-caption').value; renderPhotos(); };
  $('#set-gallery-cover').onclick=()=>{ coverIndex=photoIndex; renderPhotos(); showPhoto(); };
  $('#remove-photo').onclick=()=>{
    const [removed]=photos.splice(photoIndex,1); if (removed?.local) URL.revokeObjectURL(removed.src);
    if (photoIndex<coverIndex) coverIndex--; else if (photoIndex===coverIndex) coverIndex=Math.min(coverIndex,photos.length-1);
    coverIndex=Math.max(0,coverIndex); photoIndex=Math.min(photoIndex,photos.length-1); renderPhotos(); showPhoto();
  };
  $('#gallery-prev-page').onclick=()=>{ galleryPage--; renderPhotos(); }; $('#gallery-next-page').onclick=()=>{ galleryPage++; renderPhotos(); };
  async function readImage(file) {
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw Error('unsupported');
    const src=URL.createObjectURL(file), image=new Image();
    try { await new Promise((resolve,reject)=>{ image.onload=resolve; image.onerror=reject; image.src=src; }); return src; }
    catch (error) { URL.revokeObjectURL(src); throw error; }
  }
  $('#photo-files').onchange=async event=>{
    $('.gallery-error').textContent=''; const failures=[];
    for (const file of event.target.files) { try { photos.push({src:await readImage(file),caption:'',local:true}); } catch { failures.push(file.name); } }
    event.target.value=''; renderPhotos(); if (failures.length) $('.gallery-error').textContent='未能打开：'+failures.join('、');
  };
  let coverURL=null;
  $('#cover-file').onchange=async event=>{
    const file=event.target.files[0]; event.target.value=''; if (!file) return;
    try { const src=await readImage(file); if (coverURL) URL.revokeObjectURL(coverURL); coverURL=src; $('.cover-card img').src=src; }
    catch { $('#layout-status').textContent='未能打开这张封面图片'; }
  };
  $('#close-preview').onclick=()=>{ $('.detail-window').hidden=true; $('#close-preview').hidden=true; $('#preview-closed').hidden=false; $('#reopen').focus(); };
  $('#reopen').onclick=()=>{ $('.detail-window').hidden=false; $('#close-preview').hidden=false; $('#preview-closed').hidden=true; $('#close-preview').focus(); };
  renderExperience(); renderTags(); renderFootprints(); renderPhotos(); countWriting();
  return {
    states,grades,tags,hasPriority,hasRating,setRating,setStat,
    get state(){return state;}, get priority(){return priority;}, get rating(){return rating;}, get footprints(){return footprints;},
    setState(value){if(states.includes(value)){state=value;renderExperience();}},
    setPriority(value){if(hasPriority()&&(value===null||grades.includes(value))){priority=value;renderExperience();}},
    updateTags(values){values.forEach((value,index)=>{const seen=new Set();tags[index][1]=value.split(/[,，、]+/).map(s=>s.trim()).filter(s=>{const key=s.toLocaleLowerCase();if(!s||seen.has(key))return false;seen.add(key);return true;});});renderTags();},
    saveFootprint(index,note){if(index===null)footprints.unshift(note);else footprints[index]=note;renderFootprints();},
    removeFootprint(index){footprints.splice(index,1);renderFootprints();},
    saveWriting(id,text){$(id==='impression'?'#impression':'#review-body textarea').value=text;countWriting();},
    get photos(){return photos;},get galleryMode(){return galleryMode;},get coverIndex(){return coverIndex;},
    setGalleryMode(value){if(['single','quad','nine'].includes(value)){galleryMode=value;galleryPage=0;renderPhotos();}},
    setGalleryCover(index){if(photos[index]){coverIndex=index;renderPhotos();}},
    resetCover(){if(coverURL)URL.revokeObjectURL(coverURL);coverURL=null;$('.cover-card img').src='assets/cover.jpg';},
  };
})();

