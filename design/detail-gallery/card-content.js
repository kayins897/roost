// Each widget supplies its own content editor; appearance controls live on another page.
function mountCardContent(id,container,close) {
  const model=previewDetail;
  const node=(tag,text,className)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(className)n.className=className;return n;};
  const button=(text,action,attrs={})=>{const b=node('button',text);b.type='button';Object.entries(attrs).forEach(([k,v])=>b.setAttribute(k,v));b.onclick=action;return b;};
  const field=(label,id,value,type='text')=>{
    const wrap=node('label',label,'context-field'),input=node(type==='textarea'?'textarea':'input');
    input.id=id;input.setAttribute('aria-label',label);if(type!=='textarea')input.type=type;input.value=value??'';wrap.append(input);return {wrap,input};
  };
  const form=()=>{const f=node('form',null,'context-form');container.append(f);return f;};
  const save=(f,action,label='保存')=>{const row=node('div',null,'context-save');row.append(button('取消',()=>close(true)),button(label,()=>{if(action()!==false)close(true);},{'data-content-save':id}));f.append(row);f.onsubmit=e=>{e.preventDefault();row.lastElementChild.click();};};
  const title=text=>container.append(node('p',text,'context-description'));
  if (id==='cover') {
    container.append(button('更换封面图片',()=>{close();document.querySelector('#cover-file').click();},{id:'context-change-cover'}),button('恢复示例封面',()=>{model.resetCover();close(true);}));
  } else if (id==='grade') {
    if (!model.hasRating()) {title('“新游戏+”和“收官完结”可设置通关评分。原有评分会保留。');return;}
    const f=form(),score=field('通关评分','context-rating',model.rating,'number'),range=node('input'),error=node('p',null,'context-error');
    Object.assign(score.input,{min:'0',max:'10',step:'0.5',placeholder:'未评分'});
    range.type='range';range.min=0;range.max=10;range.step=.5;range.value=model.rating??5;range.id='context-rating-range';range.setAttribute('aria-label','调整通关评分');
    range.oninput=()=>{score.input.value=range.value;};score.input.oninput=()=>{if(score.input.value!==''&&score.input.validity.valid)range.value=score.input.value;error.textContent='';};
    error.id='context-rating-error';error.setAttribute('role','status');f.append(score.wrap,range,node('p','0—10 分 · 每次 0.5 分','context-description'),error);
    f.append(button('清除评分',()=>{model.setRating(null);close(true);},{id:'context-clear-rating'}));
    save(f,()=>{const value=score.input.value.trim(),n=value===''?null:Number(value);if(!score.input.validity.valid||!model.setRating(n)){error.textContent='请输入 0～10 分，以 0.5 分递增。';score.input.setAttribute('aria-invalid','true');score.input.focus();return false;}});
  } else if (id==='footprint') {
    const summary=node('div');container.append(summary);
    function renderSummary() {
      summary.replaceChildren(node('p','体验分类','menu-label'));const choices=node('div',null,'context-options');choices.id='context-state-choices';
      model.states.forEach(state=>choices.append(button(state,()=>{model.setState(state);renderSummary();[...summary.querySelectorAll('button')].find(b=>b.textContent===state)?.focus();},{'data-context-state':state,'aria-pressed':String(model.state===state)})));
      summary.append(choices);
      if(model.hasPriority()){
        summary.append(node('p','游玩优先级','menu-label'));const ranks=node('div',null,'context-options');ranks.id='context-priority-choices';
        [...model.grades,'未设置'].forEach(rank=>ranks.append(button(rank,()=>{model.setPriority(rank==='未设置'?null:rank);renderSummary();[...summary.querySelectorAll('#context-priority-choices button')].find(b=>b.textContent===rank)?.focus();},{'data-context-priority':rank,'aria-pressed':String((model.priority||'未设置')===rank)})));
        summary.append(ranks);
      }
    }
    renderSummary();
    const details=node('details',null,'context-note-editor'),heading=node('summary','记录与整理足迹');details.append(heading);container.append(details);
    const f=node('form',null,'context-form'),date=field('足迹月份','context-note-date','','month'),name=field('足迹标题','context-note-title',''),text=field('足迹内容','context-note-text','','textarea');
    name.input.maxLength=120;text.input.maxLength=240;f.append(date.wrap,name.wrap,text.wrap);details.append(f);
    let editIndex=null;const submit=button('记录足迹',()=>{
      if(!name.input.value.trim()){name.input.setCustomValidity('请写下足迹标题');name.input.reportValidity();return;}
      model.saveFootprint(editIndex,{date:date.input.value.replace('-','.'),title:name.input.value.trim(),text:text.input.value.trim()});close(true);
    },{id:'context-note-save'});
    name.input.oninput=()=>name.input.setCustomValidity('');f.append(submit);f.onsubmit=e=>{e.preventDefault();submit.click();};
    const list=node('div',null,'context-note-list');details.append(list);
    model.footprints.forEach((note,index)=>{
      const row=node('div'),label=node('span',note.title);row.append(label,button('修改',()=>{editIndex=index;date.input.value=note.date.replace('.','-');name.input.value=note.title;text.input.value=note.text;submit.textContent='保存足迹';name.input.focus();},{'aria-label':'修改足迹 '+(index+1)}),button('移除',()=>{model.removeFootprint(index);close(true);},{'aria-label':'移除足迹 '+(index+1)}));list.append(row);
    });
  } else if (id==='hours'||id==='count') {
    const f=form(),value=document.querySelector('#'+id+'-value').childNodes[0].textContent,amount=field(id==='hours'?'累计游玩小时':'累计完成次数','context-'+id,value==='未记录'?'':value,'number');
    amount.input.min=0;amount.input.step=id==='hours'?'0.1':'1';amount.input.placeholder='未记录';f.append(amount.wrap);
    let date;if(id==='hours'){date=field('最后运行时间','context-last-run',document.querySelector('#last-run-value').getAttribute('datetime')||'','datetime-local');f.append(date.wrap);}
    save(f,()=>{if(!amount.input.validity.valid){amount.input.reportValidity();return false;}model.setStat(id,amount.input.value.trim(),date?.input.value||'');});
  } else if (id==='facts') {
    const f=form(),fields=[['作品名称','original'],['发行年份','year'],['收录日期','date'],['创作者','creator']].map(([label,key])=>{
      const value=document.querySelector('[data-field="'+key+'"]')?.textContent||document.querySelector('[data-field-row="'+key+'"] dd').textContent;
      const item=field(label,'context-fact-'+key,value);f.append(item.wrap);return {key,...item};
    });
    save(f,()=>{fields.forEach(({key,input})=>{const target=document.querySelector('[data-field="'+key+'"]')||document.querySelector('[data-field-row="'+key+'"] dd');target.textContent=input.value.trim()||'未记录';});});
  } else if (id==='platform') {
    platformPreview.mountEditor(container,close);
  } else if (id==='tags') {
    const f=form(),fields=model.tags.map(([label,values],i)=>{const item=field(label,'context-tags-'+i,values.join('、'));f.append(item.wrap);return item;});
    save(f,()=>model.updateTags(fields.map(item=>item.input.value)));
  } else if (id==='impression'||id==='review') {
    const f=form(),text=field(id==='impression'?'一句话印象':'长文测评','context-'+id,document.querySelector(id==='impression'?'#impression':'#review-body textarea').value,'textarea');
    if(id==='impression')text.input.maxLength=80;else text.input.rows=9;f.append(text.wrap);save(f,()=>model.saveWriting(id,text.input.value));
  } else if (id==='gallery') {
    container.append(node('p','展示方式','menu-label'));const modes=node('div',null,'context-options');modes.id='context-gallery-modes';
    [['single','单图'],['quad','四宫格'],['nine','九宫格']].forEach(([mode,label])=>modes.append(button(label,()=>{model.setGalleryMode(mode);close(true);},{'data-gallery-mode':mode,'aria-pressed':String(model.galleryMode===mode)})));
    container.append(modes,button('导入截图',()=>{close();document.querySelector('#photo-files').click();},{id:'context-add-photos'}));
    if(model.photos.length){const cover=field('封面截图','context-gallery-cover','','select');const select=node('select');select.id=cover.input.id;select.setAttribute('aria-label','封面截图');cover.input.replaceWith(select);
      model.photos.forEach((photo,index)=>{const option=node('option',(index+1)+' · '+(photo.caption||'未命名截图'));option.value=index;option.selected=model.coverIndex===index;select.append(option);});
      select.onchange=()=>model.setGalleryCover(Number(select.value));container.append(cover.wrap);
    }
  }
}

