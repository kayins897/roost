import { useState } from 'react';
import { isScreenSeries } from '../../../domain/screens.ts';
import type { MediaItem, ScreenDetails } from '../../../domain/types.ts';
import { Modal } from '../../components/MediaPrimitives.tsx';
import { t } from '../../i18n/index.ts';
import { useUnsavedChanges } from '../../RecordEditors.tsx';

export type ScreenFactsScope = 'identity' | 'runtime' | 'release' | 'credits' | 'sources' | 'synopsis';
type Field = { key: keyof Draft; label: string; input?: 'type' | 'textarea' | 'number' | 'url' };
const types = ['电影', '连续剧', '番剧'];
const split = (value: string) => [...new Set(value.split(/[,，;；\n]/).map(text => text.trim()).filter(Boolean))];
const number = (value: string) => value === '' ? undefined : Number(value);
const integerOrUnknown = (value?: number) => value === undefined || (Number.isSafeInteger(value) && value >= 0);
const draftsFor = (item: MediaItem) => ({
  title: item.title, originalTitle: item.originalTitle ?? '', type: item.subcategory || '电影',
  director: item.creator, actors: item.screenDetails?.actors?.join('，') ?? '',
  year: item.year, regions: item.screenDetails?.regions?.join('，') ?? '',
  runtime: String(item.screenDetails?.durationMinutes ?? ''), episodes: String(item.screenDetails?.episodeCount ?? ''),
  sources: item.screenDetails?.viewingSources?.join('，') ?? '', metadata: item.screenDetails?.metadataSource ?? '',
  sourceUrl: item.sourceUrl ?? '', douban: String(item.screenDetails?.doubanScore ?? ''), description: item.screenDetails?.description ?? '',
});
type Draft = ReturnType<typeof draftsFor>;
const sections: Record<ScreenFactsScope, { title: string; fields: Field[] }> = {
  identity: { title: '作品名称与类型', fields: [{ key: 'title', label: '作品名称' }, { key: 'originalTitle', label: '原名' }, { key: 'type', label: '类型', input: 'type' }] },
  runtime: { title: '片长与集数', fields: [{ key: 'runtime', label: '片长（分钟）', input: 'number' }, { key: 'episodes', label: '总集数', input: 'number' }] },
  release: { title: '发行信息', fields: [{ key: 'year', label: '发行年份' }, { key: 'regions', label: '地区（逗号分隔）' }] },
  credits: { title: '演职员', fields: [{ key: 'director', label: '导演' }, { key: 'actors', label: '演员（逗号分隔）' }] },
  sources: { title: '来源与评分', fields: [{ key: 'sources', label: '观看来源（逗号分隔）' }, { key: 'metadata', label: '资料来源' }, { key: 'sourceUrl', label: '来源链接', input: 'url' }, { key: 'douban', label: '豆瓣评分', input: 'number' }] },
  synopsis: { title: '作品简介', fields: [{ key: 'description', label: '简介', input: 'textarea' }] },
};

export function ScreenFactsForm({ scope, item, onClose, onSave }: {
  scope: ScreenFactsScope; item: MediaItem; onClose: () => void; onSave: (patch: Partial<MediaItem>) => boolean;
}) {
  const [initial] = useState(() => draftsFor(item));
  const [draft, setDraft] = useState(initial), [error, setError] = useState('');
  const fields = sections[scope].fields.filter(field => field.key !== 'episodes' || isScreenSeries(item));
  const changed = (key: keyof Draft) => draft[key] !== initial[key];
  const dirty = fields.some(field => changed(field.key));
  useUnsavedChanges(dirty);
  const close = () => { if (!dirty || window.confirm(t('放弃尚未保存的影视资料？'))) onClose(); };
  const change = (key: keyof Draft, value: string) => setDraft(current => ({ ...current, [key]: value }));

  function save() {
    if (!dirty) { onClose(); return; }
    const patch: Partial<MediaItem> = {};
    const details: Partial<ScreenDetails> = {};
    if (scope === 'identity') {
      if (!draft.title.trim()) { setError('作品名称不能为空。'); return; }
      if (changed('title')) patch.title = draft.title.trim();
      if (changed('originalTitle')) patch.originalTitle = draft.originalTitle.trim();
      if (changed('type')) patch.subcategory = draft.type;
    } else if (scope === 'credits') {
      if (changed('director')) patch.creator = draft.director.trim();
      if (changed('actors')) details.actors = split(draft.actors);
    } else if (scope === 'release') {
      if (changed('year')) patch.year = draft.year.trim();
      if (changed('regions')) details.regions = split(draft.regions);
    } else if (scope === 'runtime') {
      const duration = number(draft.runtime), episodes = number(draft.episodes);
      if ((changed('runtime') && !integerOrUnknown(duration)) || (changed('episodes') && !integerOrUnknown(episodes))) { setError('片长和总集数应为非负整数；未知可留空。'); return; }
      if (changed('runtime')) details.durationMinutes = duration;
      if (isScreenSeries(item) && changed('episodes')) details.episodeCount = episodes;
    } else if (scope === 'sources') {
      if (changed('sources')) details.viewingSources = split(draft.sources);
      if (changed('metadata')) details.metadataSource = draft.metadata.trim();
      if (changed('sourceUrl')) {
        const value = draft.sourceUrl.trim();
        if (value && !/^https?:\/\//i.test(value)) { setError('来源链接需以 https:// 或 http:// 开头。'); return; }
        patch.sourceUrl = value || undefined;
      }
      if (changed('douban')) {
        const value = number(draft.douban);
        if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 10 || Math.abs(value * 10 - Math.round(value * 10)) > 1e-6)) { setError('豆瓣评分应为 0–10 分，最多一位小数。'); return; }
        details.doubanScore = value;
      }
    } else if (changed('description')) {
      details.description = draft.description;
    }
    if (Object.keys(details).length) patch.screenDetails = { ...item.screenDetails, ...details };
    if (onSave(patch)) onClose();
    else setError('保存失败，资料草稿仍保留，请重试。');
  }

  const title = scope === 'runtime' && !isScreenSeries(item) ? '片长' : sections[scope].title;
  return <Modal title={t(title)} onClose={close} wide={scope === 'synopsis'} className="books-dialog">
    <form onSubmit={event => { event.preventDefault(); save(); }}>
      <div className="screen-metadata-fields">
        {fields.map(({ key, label, input }) => <label className="form-field" key={key}>{t(label)}
          {input === 'type' ? <select value={draft.type} onChange={event => change(key, event.target.value)}>
            {!types.includes(draft.type) && <option>{draft.type}</option>}
            {types.map(type => <option key={type} value={type}>{t(type)}</option>)}
          </select> : input === 'textarea' ? <textarea rows={7} value={draft[key]} onChange={event => change(key, event.target.value)} />
            : <input type={input ?? 'text'} min={input === 'number' ? 0 : undefined} max={key === 'douban' ? 10 : undefined}
              step={input === 'number' ? key === 'douban' ? .1 : 1 : undefined}
              value={draft[key]} onChange={event => change(key, event.target.value)} />}
        </label>)}
      </div>
      {error && <p role="alert" className="books-danger">{t(error)}</p>}
      <footer className="books-dialog-actions">
        <button type="button" className="button button--secondary" onClick={close}>{t('取消')}</button>
        <button className="button button--primary" type="submit">{t('保存资料')}</button>
      </footer>
    </form>
  </Modal>;
}
