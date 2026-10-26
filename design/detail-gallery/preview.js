const $ = selector => document.querySelector(selector);
const states = ['新作开荒', '游玩中', '未完待续', '新游戏+', '收官完结', '暂时搁置', '已体验 · 未分类'];
const colors = ['#b89cdd', '#80b9ea', '#8cbfe0', '#80c5d4', '#88cda1', '#d5ac78', '#b4b8c5'];
let currentState = '新游戏+';
const initialTags = [['玩法', ['银河恶魔城', '动作', '探索']], ['题材', ['奇幻', '虫之王国']], ['游玩场景', ['需要沉浸']], ['其他', ['独立游戏']]];
function renderTags() {
  $('#tag-rows').replaceChildren(...initialTags.map(([label, values]) => {
    const row = document.createElement('div'); row.className = 'tag-row';
    const name = document.createElement('span'); name.textContent = label;
    const tags = document.createElement('div');
    values.forEach(value => { const chip = document.createElement('span'); chip.className = 'tag-pill'; chip.textContent = value; tags.append(chip); });
    row.append(name, tags); return row;
  }));
}
function renderStates() {
  $('#state-choices').replaceChildren(...states.map((state, index) => {
    const button = document.createElement('button'); button.textContent = state; button.setAttribute('aria-pressed', String(state === currentState)); button.style.color = colors[index];
    button.onclick = () => { currentState = state; $('#current-state').textContent = state; document.documentElement.style.setProperty('--state', colors[index]); $('#priority-field').hidden = !['新作开荒', '游玩中', '未完待续', '新游戏+'].includes(state); $('#grade-field').hidden = !['新游戏+', '收官完结'].includes(state); $('#state-choices').hidden = true; $('#experience-toggle').setAttribute('aria-expanded', 'false'); renderStates(); $('#experience-toggle').focus(); };
    return button;
  }));
}
$('#experience-toggle').onclick = () => { $('#state-choices').hidden = !$('#state-choices').hidden; $('#experience-toggle').setAttribute('aria-expanded', String(!$('#state-choices').hidden)); };
$('.favorite').onclick = event => { const button = event.currentTarget, pressed = button.getAttribute('aria-pressed') !== 'true'; button.setAttribute('aria-pressed', String(pressed)); button.setAttribute('aria-label', pressed ? '取消喜欢' : '标为喜欢'); button.textContent = pressed ? '♥' : '♡'; };
document.querySelectorAll('[data-stat]').forEach(button => { button.onclick = () => { const key = button.dataset.stat; $('#' + key + '-value').hidden = true; $('#' + key + '-editor').hidden = false; $('#' + key + '-editor input').focus(); }; });
document.querySelectorAll('[data-save]').forEach(button => { button.onclick = () => { const key = button.dataset.save, input = $('#' + key + '-editor input'), n = Number(input.value); if (input.value !== '' && (!Number.isFinite(n) || n < 0 || (key === 'count' && !Number.isInteger(n)))) { input.setCustomValidity('请输入有效的非负数'); input.reportValidity(); return; } input.setCustomValidity(''); const label = $('#' + key + '-value'); label.replaceChildren(); label.append(input.value.trim() === '' ? '未记录' : input.value); if (input.value.trim() !== '') { const unit = document.createElement('small'); unit.textContent = key === 'hours' ? 'h' : '次'; label.append(unit); } label.hidden = false; $('#' + key + '-editor').hidden = true; }; });
$('#edit-facts').onclick = () => { const open = $('.facts-edit').hidden; $('.facts-edit').hidden = !open; $('.facts').hidden = open; $('#edit-facts').setAttribute('aria-expanded', String(open)); $('#edit-facts').textContent = open ? '取消' : '编辑'; };
$('#save-facts').onclick = () => { document.querySelectorAll('[data-input]').forEach(input => { $('[data-field="' + input.dataset.input + '"]').textContent = input.value.trim() || '未记录'; }); $('#edit-facts').click(); };
$('#edit-tags').onclick = () => { const open = $('.tag-editor').hidden; $('.tag-editor').hidden = !open; $('#tag-rows').hidden = open; $('#edit-tags').setAttribute('aria-expanded', String(open)); $('#edit-tags').textContent = open ? '取消' : '编辑'; };
$('#save-tags').onclick = () => { document.querySelectorAll('.tag-editor input').forEach((input, index) => { const seen = new Set(); initialTags[index][1] = input.value.split(/[,，、]+/).map(value => value.trim()).filter(value => { const key = value.toLocaleLowerCase(); if (!value || seen.has(key)) return false; seen.add(key); return true; }); }); renderTags(); $('#edit-tags').click(); };
function impressionCount() { $('#impression-count').textContent = $('#impression').value.length + ' / 80'; }
$('#impression').oninput = () => { impressionCount(); $('.writing-status').textContent = ''; };
$('#impression').onblur = () => { $('.writing-status').textContent = '已更新预览'; };
$('#review-toggle').onclick = () => { $('#review-body').hidden = !$('#review-body').hidden; $('#review-toggle').setAttribute('aria-expanded', String(!$('#review-body').hidden)); };
function reviewCount() { $('#review-count').textContent = $('#review-body textarea').value.length + ' 字'; }
$('#review-body textarea').oninput = reviewCount;
$('#add-footprint').onclick = () => { $('.footprint-editor').hidden = !$('.footprint-editor').hidden; if (!$('.footprint-editor').hidden) $('.footprint-editor input').focus(); };
$('#save-footprint').onclick = () => { const text = $('.footprint-editor input').value.trim(); if (!text) return; const row = document.createElement('li'), time = document.createElement('time'), wrap = document.createElement('div'), strong = document.createElement('strong'); time.textContent = '2026.10'; strong.textContent = text; wrap.append(strong); row.append(time, wrap); $('#footprints').prepend(row); $('.footprint-editor input').value = ''; $('.footprint-editor').hidden = true; };
let photos = [
  { src: 'assets/shot-1.jpg', caption: '旅途中的一刻', local: false },
  { src: 'assets/shot-2.jpg', caption: '想再回去的地方', local: false },
  { src: 'assets/shot-3.jpg', caption: '探索留下的画面', local: false },
  { src: 'assets/shot-4.jpg', caption: '', local: false },
];
let photoIndex = 0;
function renderPhotos() {
  $('#photo-count').textContent = photos.length + ' 张';
  $('#gallery-track').replaceChildren(...photos.map((photo, index) => {
    const button = document.createElement('button'); button.className = 'gallery-photo'; button.setAttribute('aria-label', '查看截图 ' + (index + 1));
    const figure = document.createElement('figure'), image = document.createElement('img'), caption = document.createElement('figcaption'); image.src = photo.src; image.alt = photo.caption || '游戏截图 ' + (index + 1); image.loading = 'lazy'; caption.textContent = photo.caption || '添加一句说明…';
    figure.append(image, caption); button.append(figure); button.onclick = () => openPhoto(index); return button;
  }));
  if (!photos.length) { const empty = document.createElement('div'); empty.className = 'gallery-empty'; const text = document.createElement('span'); text.textContent = '把值得留下的画面放在这里'; const button = document.createElement('button'); button.className = 'button'; button.textContent = '＋ 添加第一张截图'; button.onclick = () => $('#photo-files').click(); empty.append(text, button); $('#gallery-track').append(empty); }
}
function showPhoto() { const photo = photos[photoIndex]; if (!photo) { $('.lightbox').close(); return; } $('#lightbox-image').src = photo.src; $('#lightbox-image').alt = photo.caption || '游戏截图 ' + (photoIndex + 1); $('#lightbox-position').textContent = (photoIndex + 1) + ' / ' + photos.length; $('#photo-caption').value = photo.caption; $('#prev-photo').disabled = $('#next-photo').disabled = photos.length < 2; }
function openPhoto(index) { photoIndex = index; showPhoto(); $('.lightbox').showModal(); $('#close-lightbox').focus(); }
function movePhoto(step) { if (!photos.length) return; photoIndex = (photoIndex + step + photos.length) % photos.length; showPhoto(); }
$('#prev-photo').onclick = () => movePhoto(-1); $('#next-photo').onclick = () => movePhoto(1); $('#close-lightbox').onclick = () => $('.lightbox').close();
$('.lightbox').addEventListener('click', event => { if (event.target === $('.lightbox')) $('.lightbox').close(); });
$('.lightbox').addEventListener('keydown', event => { if (event.target instanceof HTMLInputElement) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); movePhoto(event.key === 'ArrowLeft' ? -1 : 1); } });
$('#photo-caption').oninput = () => { photos[photoIndex].caption = $('#photo-caption').value; renderPhotos(); };
$('#remove-photo').onclick = () => { const [removed] = photos.splice(photoIndex, 1); if (removed?.local) URL.revokeObjectURL(removed.src); photoIndex = Math.min(photoIndex, photos.length - 1); renderPhotos(); showPhoto(); };
$('#add-photos').onclick = () => $('#photo-files').click();
$('#photo-files').onchange = async event => {
  $('.gallery-error').textContent = ''; const failures = [];
  for (const file of event.target.files) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { failures.push(file.name); continue; }
    const url = URL.createObjectURL(file), probe = new Image();
    try { await new Promise((resolve, reject) => { probe.onload = resolve; probe.onerror = reject; probe.src = url; }); photos.push({ src: url, caption: '', local: true }); } catch { URL.revokeObjectURL(url); failures.push(file.name); }
  }
  event.target.value = ''; renderPhotos(); $('#gallery-track').scrollLeft = $('#gallery-track').scrollWidth;
  if (failures.length) $('.gallery-error').textContent = '未能打开：' + failures.join('、');
};
$('#close-preview').onclick = () => { $('.detail-window').hidden = true; $('#preview-closed').hidden = false; $('#reopen').focus(); };
$('#reopen').onclick = () => { $('.detail-window').hidden = false; $('#preview-closed').hidden = true; $('#close-preview').focus(); };
renderTags(); renderStates(); renderPhotos(); impressionCount(); reviewCount();
