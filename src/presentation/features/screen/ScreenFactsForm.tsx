import { t } from '../../i18n/index.ts';
import { useState } from 'react';
import type { MediaItem } from '../../../domain/types.ts';
import { useUnsavedChanges } from '../../RecordEditors.tsx';
import { Modal } from '../../components/MediaPrimitives.tsx';

export function ScreenFactsForm({ item, onClose, onSave }: { item: MediaItem; onClose: () => void; onSave: (patch: Partial<MediaItem>) => boolean }) {
  const details = item.screenDetails;
  const initial = { title: item.title, originalTitle: item.originalTitle ?? '', director: item.creator, year: item.year, type: item.subcategory || '电影', actors: (details?.actors ?? []).join('，'), regions: (details?.regions ?? []).join('，'), runtime: details?.durationMinutes === undefined ? '' : String(details.durationMinutes), episodes: details?.episodeCount === undefined ? '' : String(details.episodeCount), description: details?.description ?? '', douban: details?.doubanScore === undefined ? '' : String(details.doubanScore), sources: (details?.viewingSources ?? []).join('，'), metadata: details?.metadataSource ?? '' };
  const [draft, setDraft] = useState(initial), [error, setError] = useState('');
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft);
  useUnsavedChanges(dirty);
  const close = () => { if (!dirty || window.confirm(t('放弃尚未保存的影视资料？'))) onClose(); };
  const split = (value: string) => [...new Set(value.split(/[,，;；\n]/).map(text => text.trim()).filter(Boolean))];
  function save() {
    const doubanScore = draft.douban === '' ? undefined : Number(draft.douban), durationMinutes = draft.runtime === '' ? undefined : Number(draft.runtime), episodeCount = draft.episodes === '' ? undefined : Number(draft.episodes);
    if (!draft.title.trim()) { setError('作品名称不能为空。'); return; }
    if (doubanScore !== undefined && (!Number.isFinite(doubanScore) || doubanScore < 0 || doubanScore > 10 || Math.abs(doubanScore * 10 - Math.round(doubanScore * 10)) > 1e-6)) { setError('豆瓣评分应为 0–10 分，最多一位小数。'); return; }
    if ((durationMinutes !== undefined && (!Number.isSafeInteger(durationMinutes) || durationMinutes < 0)) || (episodeCount !== undefined && (!Number.isSafeInteger(episodeCount) || episodeCount < 0))) { setError('片长和总集数应为非负整数；未知可留空。'); return; }
    if (onSave({ title: draft.title.trim(), originalTitle: draft.originalTitle.trim(), creator: draft.director.trim(), year: draft.year.trim(), subcategory: draft.type, screenDetails: { ...item.screenDetails, actors: split(draft.actors), regions: split(draft.regions), durationMinutes, episodeCount, description: draft.description, doubanScore, viewingSources: split(draft.sources), metadataSource: draft.metadata.trim() } })) onClose();
    else setError('保存失败，资料草稿仍保留，请重试。');
  }
  const fields: { key: keyof typeof initial; label: string }[] = [{ key: 'title', label: '作品名称' }, { key: 'originalTitle', label: '原名' }, { key: 'director', label: '导演' }, { key: 'year', label: '发行年份' }, { key: 'actors', label: '演员（逗号分隔）' }, { key: 'regions', label: '地区（逗号分隔）' }, { key: 'sources', label: '观看来源（逗号分隔）' }, { key: 'metadata', label: '资料来源' }];
  return <Modal title={t("影视资料")} onClose={close} wide className="books-dialog"><form onSubmit={event => { event.preventDefault(); save(); }}><div className="books-facts-fields">{fields.map(({ key, label }) => <label className="form-field" key={key}>{t(label)}<input value={draft[key]} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))}/></label>)}<label className="form-field">{t("类型")}<select value={draft.type} onChange={event => setDraft(current => ({ ...current, type: event.target.value }))}>{!['电影', '连续剧', '番剧'].includes(draft.type) && <option>{draft.type}</option>}{['电影', '连续剧', '番剧'].map(type => <option key={type} value={type}>{t(type)}</option>)}</select></label><label className="form-field">{t("片长（分钟）")}<input type="number" min={0} step={1} placeholder={t("未记录")} value={draft.runtime} onChange={event => setDraft(current => ({ ...current, runtime: event.target.value }))}/></label><label className="form-field">{t("总集数")}<input type="number" min={0} step={1} placeholder={t("未记录")} value={draft.episodes} onChange={event => setDraft(current => ({ ...current, episodes: event.target.value }))}/></label><label className="form-field">{t("豆瓣评分")}<input type="number" min={0} max={10} step={.1} placeholder={t("未评分")} value={draft.douban} onChange={event => setDraft(current => ({ ...current, douban: event.target.value }))}/></label></div><label className="form-field">{t("简介")}<textarea rows={4} value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))}/></label>{error && <p role="alert" className="books-danger">{t(error)}</p>}<footer className="books-dialog-actions"><button type="button" className="button button--secondary" onClick={close}>{t("取消")}</button><button className="button button--primary" type="submit">{t("保存资料")}</button></footer></form></Modal>;
}
