import {
Check,
Upload
} from 'lucide-react';
import type { ChangeEvent,FormEvent } from 'react';
import { emptyGameTags,flattenGameTags,GAME_TAG_KEYS,GAME_TAG_LABELS,gameTagsFor,MEDIA_LABELS,normalizePlatforms,normalizeTags,platformsFor,STATUS_LABELS } from '../../../domain/library.ts';
import { gradeEditable, priorityEditable, newGameProjection } from '../../../domain/gameProgress.ts';
import type { GameTagGroupKey,GameTagGroups,MediaItem,MediaType,ProgressStatus } from '../../../domain/types.ts';
import { experienceClassificationPatch, type GameExperienceClassification } from '../../../domain/gameExperience.ts';
import { CLASSIFICATIONS, CLASSIFICATION_LABELS, classificationFor } from '../library/experienceOptions.ts';
import { GAME_GRADES } from '../../../domain/gameRating.ts';
import { impressionError, IMPRESSION_MAX_LENGTH, personalWritingFor, personalWritingPatch, writingLength } from '../../../domain/personalWriting.ts';
import { desktopInfo } from '../../../infrastructure/repository.ts';
import { useUnsavedChanges } from '../../RecordEditors.tsx';

import { useFieldState } from '../../app/useFieldState.ts';
import { Modal, Poster } from '../../components/MediaPrimitives.tsx';
import { categories,gameTagExamples } from '../../components/libraryOptions.ts';
import { ScorePicker } from '../../components/ScorePicker.tsx';
async function compressCover(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  if (file.size > 12 * 1024 * 1024) throw new Error('图片请小于 12 MB');
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const ratio = Math.min(480 / image.width, 680 / image.height, 1);
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } finally { image.close(); }
}

export function Editor({ initial, category, onClose, onSave, creating = false }: { initial?: MediaItem; category: MediaType; onClose: () => void; onSave: (item: MediaItem) => void; creating?: boolean }) {
  const writingOriginal = initial ?? { impression: '' };
  const writing = personalWritingFor(writingOriginal);
  const fields = useFieldState(() => ({
    title: initial?.title ?? '',
    originalTitle: initial?.originalTitle ?? '',
    type: (initial?.category ?? category) as MediaType,
    subtype: initial?.subcategory ?? '',
    platformInput: initial ? platformsFor(initial).join('、') : '',
    creator: initial?.creator ?? '',
    year: initial?.year ?? '',
    status: (initial?.status ?? 'want') as ProgressStatus,
    classification: (initial?.category === 'game' ? classificationFor(initial) : 'unplayed') as GameExperienceClassification,
    classificationTouched: false,
    playPriority: initial?.playPriority ?? '',
    personalScore: initial?.personalScore === undefined ? '' : String(initial.personalScore),
    playtimeHours: initial?.playtimeMinutes === undefined ? '' : String(initial.playtimeMinutes / 60),
    tags: initial?.tags.join('、') ?? '',
    gameTagInputs: ((() => {
    const groups = initial ? gameTagsFor(initial) : emptyGameTags();
    return Object.fromEntries(GAME_TAG_KEYS.map(key => [key, groups[key].join('、')])) as Record<GameTagGroupKey, string>;
  })()) as Record<GameTagGroupKey, string>,
    impression: writing.impression,
    review: writing.review,
    sourceUrl: initial?.sourceUrl ?? '',
    coverUrl: initial?.coverUrl ?? '',
    fileBusy: false,
    fileError: '',
    dirty: false
  }));
  const [title, setTitle] = fields('title');
  const [originalTitle, setOriginalTitle] = fields('originalTitle');
  const [type, setType] = fields('type');
  const [subtype, setSubtype] = fields('subtype');
  const [platformInput, setPlatformInput] = fields('platformInput');
  const [creator, setCreator] = fields('creator');
  const [year, setYear] = fields('year');
  const [status, setStatus] = fields('status');
  const [classification, setClassification] = fields('classification');
  const [classificationTouched, setClassificationTouched] = fields('classificationTouched');
  const [playPriority, setPlayPriority] = fields('playPriority');
  const [personalScore, setPersonalScore] = fields('personalScore');
  const [playtimeHours, setPlaytimeHours] = fields('playtimeHours');
  const [tags, setTags] = fields('tags');
  const [gameTagInputs, setGameTagInputs] = fields('gameTagInputs');
  const [impression, setImpression] = fields('impression');
  const [review, setReview] = fields('review');
  const writingValidation = impressionError(impression);
  const [sourceUrl, setSourceUrl] = fields('sourceUrl');
  const [coverUrl, setCoverUrl] = fields('coverUrl');
  const [fileBusy, setFileBusy] = fields('fileBusy');
  const [fileError, setFileError] = fields('fileError');
  const [dirty, setDirty] = fields('dirty');
  useUnsavedChanges(dirty);
  function close() { if (!dirty || window.confirm('放弃这次尚未保存的作品修改？')) onClose(); }

  async function onCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileBusy(true);
    setFileError('');
    try { setCoverUrl(await compressCover(file)); setDirty(true); }
    catch (error) { setFileError(error instanceof Error ? error.message : '图片处理失败'); }
    finally { setFileBusy(false); event.target.value = ''; }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || fileBusy || writingValidation) return;
    const groupedTags = { ...initial?.gameTags, ...Object.fromEntries(GAME_TAG_KEYS.map(key => [key, normalizeTags(gameTagInputs[key].split(/[,，、\n]+/))])) } as GameTagGroups;
    const hours = playtimeHours.trim() === '' ? undefined : Number(playtimeHours);
    if (type === 'game' && hours !== undefined && (!Number.isFinite(hours) || hours < 0 || hours > 100000)) return;
    const now = new Date().toISOString();
    // v0.4.24：编辑只写新维度（未触碰时保留原值/推导）；新建构造旧轴兼容投影。
    const gameFields = type !== 'game' || initial?.category === 'game' ? {} : newGameProjection('planned', 'unknown');
    const rankItem = { ...(initial ?? {}), category: type, ...experienceClassificationPatch(classification) } as MediaItem;
    onSave({
      ...initial,
      ...(type === 'game' && (classificationTouched || initial?.category !== 'game') ? experienceClassificationPatch(classification) : {}),
      id: initial?.id ?? crypto.randomUUID(), title: title.trim(), originalTitle: originalTitle.trim() || undefined, category: type, subcategory: subtype.trim(),
      platforms: type === 'game' ? normalizePlatforms(platformInput.split(/[,，、;；\n]+/)) : initial?.platforms,
      creator: creator.trim(), year: year.trim(), status: type === 'game' ? (initial?.category === 'game' ? initial.status : ((gameFields as { status?: MediaItem['status'] }).status ?? 'want')) : status,
      gamePlayState: type === 'game' ? (initial?.category === 'game' ? initial.gamePlayState : (gameFields as { gamePlayState?: MediaItem['gamePlayState'] }).gamePlayState) : initial?.gamePlayState,
      // 未触碰的维度保留 initial 原值（gameFields 编辑分支只含 touched 键；'unknown' 为合法显式值不受 ?? 影响）。
      ...(type === 'game' ? { playEngagement: (gameFields as { playEngagement?: MediaItem['playEngagement'] }).playEngagement ?? initial?.playEngagement, completion: (gameFields as { completion?: MediaItem['completion'] }).completion ?? initial?.completion } : {}),
      playtimeMinutes: type === 'game' ? hours !== undefined ? Math.round(hours * 60) : undefined : initial?.playtimeMinutes,
      tags: type === 'game' ? flattenGameTags(groupedTags) : normalizeTags(tags.split(/[,，、\n]+/)),
      gameTags: type === 'game' ? groupedTags : initial?.gameTags,
      ...(priorityEditable(rankItem) && playPriority !== (initial?.playPriority ?? '') ? { playPriority: (playPriority || undefined) as MediaItem['playPriority'], priorityOrder: undefined } : {}),
      ...(gradeEditable(rankItem) && personalScore !== (initial?.personalScore === undefined ? '' : String(initial.personalScore)) ? { personalScore: personalScore === '' ? undefined : Number(personalScore), ratingOrder: undefined } : {}),
      impression: initial?.impression ?? '',
      ...personalWritingPatch(writingOriginal, { impression, review }),
      favorite: initial?.favorite ?? false, artwork: initial?.artwork ?? 'default',
      sourceUrl: sourceUrl.trim() || undefined, coverUrl: coverUrl || undefined,
      createdAt: initial?.createdAt ?? now, updatedAt: now,
    });
  }

  return <Modal title={initial && !creating ? '编辑作品' : '收录新作品'} description="先记下作品，其他信息以后再补充也不迟。" onClose={close} wide>
    <form className="editor-form" onSubmit={submit} onChangeCapture={() => setDirty(true)}>
      <div className="editor-grid">
        <div className="editor-fields">
          <label className="form-field">作品名称 <span className="required">*</span><input autoFocus required placeholder="例如：艾尔登法环" maxLength={160} value={title} onChange={e => setTitle(e.target.value)} /></label>
          <label className="form-field">作品原名 <span className="field-note">可留空</span><input placeholder="例如：ELDEN RING" value={originalTitle} onChange={e => setOriginalTitle(e.target.value)} /></label>
          <div className="two-fields">
            <label className="form-field">归属板块<select value={type} onChange={e => { const next = e.target.value as MediaType; setType(next); setSubtype(''); if (!initial) { setStatus('want'); setClassification('unplayed'); setClassificationTouched(false); } }}>{categories.map(c => <option key={c} value={c}>{MEDIA_LABELS[c]}</option>)}</select></label>
            {type === 'game' ? <label className="form-field">拥有平台 <span className="field-note">可多选或以顿号分隔</span><input placeholder="Steam、Switch、PS5、TapTap、本地收藏" value={platformInput} onChange={e => setPlatformInput(e.target.value)} /><span className="platform-suggestions">{['Steam', 'Switch', 'PS5', 'TapTap', '本地收藏'].map(platform => { const current = normalizePlatforms(platformInput.split(/[,，、;；\n]+/)); const active = current.some(value => value.toLocaleLowerCase() === platform.toLocaleLowerCase()); return <button type="button" key={platform} className={active ? 'is-active' : ''} aria-pressed={active} onClick={() => { setDirty(true); setPlatformInput(active ? current.filter(value => value.toLocaleLowerCase() !== platform.toLocaleLowerCase()).join('、') : [...current, platform].join('、')); }}>{platform}</button>; })}</span></label> : <label className="form-field">子分类 <span className="field-note">可留空</span><input placeholder={type === 'screen' ? '电影 / 番剧 / 连续剧' : type === 'book' ? '专业书籍 / 严肃文学 / 网络小说' : '单曲 / 专辑'} value={subtype} onChange={e => setSubtype(e.target.value)} /></label>}
          </div>
          <div className="two-fields">
            <label className="form-field">作者 / 开发商<input placeholder="可留空" value={creator} onChange={e => setCreator(e.target.value)} /></label>
            <label className="form-field">发行年份<input placeholder="例如：2025" maxLength={12} value={year} onChange={e => setYear(e.target.value)} /></label>
          </div>
          {type === 'game' ? <>
            <div className="two-fields game-time-mark-fields">
              <label className="form-field">累计游玩时长 <span className="field-note">小时 · 可留空</span><div className="time-field"><input type="number" min="0" max="100000" step="any" inputMode="decimal" placeholder="例如 42.5" value={playtimeHours} onChange={e => setPlaytimeHours(e.target.value)} /><span>h</span></div></label>
              <label className="form-field">体验分类<select aria-label="体验分类" value={classification} onChange={e => { setClassification(e.target.value as GameExperienceClassification); setClassificationTouched(true); }}>{CLASSIFICATIONS.map(value => <option key={value} value={value}>{CLASSIFICATION_LABELS[value]}</option>)}</select></label>
            </div>
            {priorityEditable({ ...(initial ?? {}), category: 'game', ...experienceClassificationPatch(classification) } as MediaItem) && <label className="form-field">游玩优先级<select aria-label="游玩优先级" value={playPriority} onChange={event => setPlayPriority(event.target.value)}><option value="">未设置</option>{GAME_GRADES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
            {gradeEditable({ ...(initial ?? {}), category: 'game', ...experienceClassificationPatch(classification) } as MediaItem) && <div className="form-field"><span>通关评分</span><ScorePicker value={personalScore} label="通关评分" onChange={value => { setPersonalScore(value); setDirty(true); }} />{personalScore !== '' && <button type="button" className="text-button" onClick={() => { setPersonalScore(''); setDirty(true); }}>清除评分</button>}</div>}
            <p className="game-state-help">分类表达你的体验意愿，完成次数和日志独立记录。已体验可以暂不设置二级分类；时长为空也可以标记已体验。</p>
            <div className="game-tag-editor"><div className="game-tag-editor-title">游戏标签 <span>四个维度，按需填写即可</span></div>
              {GAME_TAG_KEYS.map(key => <div className={`game-tag-edit-group tag-type--${key}`} key={key}>
                <label className="form-field">{GAME_TAG_LABELS[key]}<input placeholder={key === 'scenario' ? '例如：刚需联机、需要沉浸、放松解压' : `用顿号分隔${GAME_TAG_LABELS[key]}标签`} value={gameTagInputs[key]} onChange={e => setGameTagInputs(current => ({ ...current, [key]: e.target.value }))} /></label>
                <div className="game-tag-suggestions">{gameTagExamples[key].map(example => <button type="button" key={example} onClick={() => { setDirty(true); setGameTagInputs(current => ({ ...current, [key]: normalizeTags([...current[key].split(/[,，、\n]+/), example]).join('、') })); }}>+ {example}</button>)}</div>
              </div>)}
            </div>
          </> : <>
            <label className="form-field">当前状态<select value={status} onChange={e => setStatus(e.target.value as ProgressStatus)}>{Object.entries(STATUS_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label className="form-field">标签 <span className="field-note">以逗号或顿号分隔</span><input placeholder="叙事、独立创作、想二刷" value={tags} onChange={e => setTags(e.target.value)} /></label>
          </>}
          {writing.legacy && <p className="feature-help">旧版长文字完整显示在测评中；不修改感受时保留原始记录。</p>}
          <label className="form-field">一句话印象 <span className="field-note">{writingLength(impression)} / {IMPRESSION_MAX_LENGTH} 字</span><input aria-label="一句话印象" aria-invalid={Boolean(writingValidation)} placeholder="用一句话留下感受" value={impression} onChange={e => setImpression(e.target.value)} /></label>
          {writingValidation && <p className="form-error" role="alert">{writingValidation}</p>}
          <label className="form-field">长文测评<textarea aria-label="长文测评" rows={6} placeholder="详细记录你的个人感受" value={review} onChange={e => setReview(e.target.value)} /></label>
          <label className="form-field">作品链接 <span className="field-note">资料识别可从「检索与导入」进入</span><input type="url" placeholder="https://..." value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} /></label>
        </div>
        <div className="cover-editor"><div className="cover-editor-preview"><Poster item={{ id: 'preview', title, category: type, subcategory: subtype, creator, year, status, tags: [], impression: '', favorite: false, artwork: initial?.artwork ?? 'default', coverUrl, createdAt: '', updatedAt: '' }} /></div>
          <label className="cover-upload"><Upload size={15} />{fileBusy ? '处理封面中…' : '上传本地封面'}<input type="file" accept="image/*" onChange={onCover} disabled={fileBusy} /></label>
          {coverUrl && <button type="button" className="subtle-link" onClick={() => { setCoverUrl(''); setDirty(true); }}>移除封面</button>}
          {fileError && <p className="form-error">{fileError}</p>}
          <p className="cover-hint">{desktopInfo ? '图片会压缩并与收藏一起保存在本机。建议定期导出备份。' : '图片会压缩并存入本机浏览器。收藏较多时，建议定期导出备份。'}</p>
        </div>
      </div>
      <div className="modal-actions"><button type="button" className="button button--ghost" onClick={close}>取消</button><button type="submit" disabled={!title.trim() || fileBusy || Boolean(writingValidation)} className="button button--primary"><Check size={16} />{initial && !creating ? '保存修改' : '加入收藏'}</button></div>
    </form>
  </Modal>;
}

