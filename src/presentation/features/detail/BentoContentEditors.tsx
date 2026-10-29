import { t } from '../../i18n/index.ts';
import { useState, type FormEvent, type ReactNode } from 'react';
import { gradeEditable } from '../../../domain/gameProgress.ts';
import { impressionError, personalWritingFor, personalWritingPatch } from '../../../domain/personalWriting.ts';
import type { MediaItem } from '../../../domain/types.ts';
import { InlineScoreControl } from '../../components/InlineScoreControl.tsx';

export type BentoSave = (patch: Partial<MediaItem>) => boolean;
export function BentoSaveForm({ children, onSubmit, onClose, error = '' }: { children: ReactNode; onSubmit: () => boolean; onClose: () => void; error?: string }) {
  function submit(event: FormEvent) { event.preventDefault(); if (onSubmit()) onClose(); }
  return <form className="bento-context-form" onSubmit={submit}>{children}{error && <p role="alert" className="bento-context-error">{t(error)}</p>}<div className="bento-context-save"><button type="button" onClick={onClose}>{t("取消")}</button><button className="bento-menu-primary" type="submit">{t("保存")}</button></div></form>;
}
export function BentoScoreEditor({ item, save }: { item: MediaItem; save: BentoSave; close: () => void }) {
  if (!gradeEditable(item)) return <p className="bento-context-description">{t("新游戏+与收官完结可设置通关评分。已有分数会保留。")}</p>;
  return <div className="bento-context-form"><InlineScoreControl value={item.personalScore} onSave={score => save({ personalScore: score, ratingOrder: undefined })} />{item.personalGrade && item.personalScore === undefined && <p className="bento-context-description">{t("原通关评级")}{" "}{item.personalGrade} {" "}{t("保留，不自动换算。")}</p>}</div>;
}
function localTimestamp(value?: string) {
  if (!value) return '';
  const date = new Date(value); if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
export function BentoStatEditor({ item, count, save, close }: { item: MediaItem; count: boolean; save: BentoSave; close: () => void }) {
  const initial = count ? item.completionCount : item.playtimeMinutes === undefined ? undefined : item.playtimeMinutes / 60;
  const [value, setValue] = useState(initial === undefined ? '' : String(initial));
  const [date, setDate] = useState(localTimestamp(item.lastPlayedAt));
  const [error, setError] = useState('');
  return <BentoSaveForm onClose={close} error={error} onSubmit={() => {
    const amount = value.trim() === '' ? undefined : Number(value);
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0 || amount > (count ? Number.MAX_SAFE_INTEGER : 100000) || (count && !Number.isSafeInteger(amount)))) { setError('请填写有效的非负数值。'); return false; }
    if (date && !Number.isFinite(new Date(date).getTime())) { setError('最后运行时间无效。'); return false; }
    const lastPlayedAt = date === localTimestamp(item.lastPlayedAt) ? item.lastPlayedAt : date ? new Date(date).toISOString() : undefined;
    const patch = count ? { completionCount: amount } : { playtimeMinutes: amount === undefined ? undefined : Math.round(amount * 60), lastPlayedAt };
    const ok = save(patch); if (!ok) setError('记录未能保存，请重试。'); return ok;
  }}><label>{count ? t('累计完成次数') : t('累计游玩小时')}<input autoFocus type="number" min="0" step={count ? '1' : 'any'} aria-label={count ? t('累计完成次数') : t('累计游玩小时')} placeholder={t("未记录")} value={value} onChange={event => setValue(event.target.value)} /></label>{!count && <label>{t("最后运行时间")}<input type="datetime-local" aria-label={t("最后运行时间")} value={date} onChange={event => setDate(event.target.value)} /></label>}<p className="bento-context-description">{t("留空表示未记录，与 0 不同。")}{count ? t('普通日志不会增加完成次数。') : t('最后运行独立记录，不从日志推算。')}</p></BentoSaveForm>;
}
export function BentoFactsEditor({ item, save, close }: { item: MediaItem; save: BentoSave; close: () => void }) {
  const [draft, setDraft] = useState({ title: item.title, originalTitle: item.originalTitle ?? '', creator: item.creator, year: item.year, createdAt: item.createdAt.slice(0, 10), sourceUrl: item.sourceUrl ?? '' });
  const [error, setError] = useState('');
  function change(key: keyof typeof draft, value: string) { setDraft(current => ({ ...current, [key]: value })); }
  return <BentoSaveForm onClose={close} error={error} onSubmit={() => {
    if (!draft.title.trim()) { setError('作品名称不能为空。'); return false; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.createdAt) || !Number.isFinite(new Date(draft.createdAt).getTime())) { setError('请填写有效的收录日期。'); return false; }
    if (draft.sourceUrl && !/^https?:\/\//i.test(draft.sourceUrl)) { setError('来源链接需以 https:// 或 http:// 开头。'); return false; }
    const createdAt = draft.createdAt === item.createdAt.slice(0, 10) ? item.createdAt : new Date(`${draft.createdAt}T00:00:00`).toISOString();
    const ok = save({ ...draft, title: draft.title.trim(), originalTitle: draft.originalTitle.trim() || undefined, createdAt, sourceUrl: draft.sourceUrl.trim() || undefined });
    if (!ok) setError('作品资料未能保存，请重试。'); return ok;
  }}>{([['title', '作品名称'], ['originalTitle', '作品原名'], ['year', '发行年份'], ['createdAt', '收录日期'], ['creator', '创作者'], ['sourceUrl', '来源链接']] as const).map(([key, label]) => <label key={key}>{label}<input type={key === 'createdAt' ? 'date' : 'text'} aria-label={label} value={draft[key]} onChange={event => change(key, event.target.value)} /></label>)}</BentoSaveForm>;
}
export function BentoWritingEditor({ item, review, save, close }: { item: MediaItem; review: boolean; save: BentoSave; close: () => void }) {
  const original = personalWritingFor(item), key = review ? 'review' : 'impression';
  const [value, setValue] = useState(original[key]), [error, setError] = useState('');
  return <BentoSaveForm onClose={close} error={error} onSubmit={() => {
    const validation = !review && impressionError(value); if (validation) { setError(validation); return false; }
    const ok = save(personalWritingPatch(item, { ...original, [key]: value })); if (!ok) setError('感受未能保存，草稿仍保留。'); return ok;
  }}><label>{review ? t('长文测评') : t('一句话印象')}<textarea autoFocus aria-label={review ? t('长文测评') : t('一句话印象')} rows={review ? 10 : 4} maxLength={review ? undefined : 80} value={value} onChange={event => setValue(event.target.value)} /></label>{!review && <p className="bento-context-description">{Array.from(value).length} {" "}{t("/ 80 字")}</p>}</BentoSaveForm>;
}
export function BentoCoverEditor({ item, save, close }: { item: MediaItem; save: BentoSave; close: () => void }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function select(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 12 * 1024 * 1024) { setError('请选择 12 MB 以内的图片。'); return; }
    setBusy(true);
    try {
      const image = await createImageBitmap(file);
      try {
        const canvas = document.createElement('canvas'), ratio = Math.min(480 / image.width, 680 / image.height, 1);
        canvas.width = Math.max(1, Math.round(image.width * ratio)); canvas.height = Math.max(1, Math.round(image.height * ratio));
        canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
        if (save({ coverUrl: canvas.toDataURL('image/jpeg', .8) })) close(); else setError('封面未能保存，请重试。');
      } finally { image.close(); }
    } catch { setError('图片无法读取，请选择其他文件。'); }
    finally { setBusy(false); }
  }
  return <div className="bento-context-form"><label>{t("更换封面图片")}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => select(event.target.files?.[0])} /></label>{item.coverUrl && <button type="button" disabled={busy} onClick={() => { if (save({ coverUrl: undefined })) close(); else setError('封面未能清除，请重试。'); }}>{t("移除当前封面")}</button>}{busy && <p role="status">{t("正在处理图片…")}</p>}{error && <p className="bento-context-error" role="alert">{t(error)}</p>}</div>;
}
