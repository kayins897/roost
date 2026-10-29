import { useState, type FormEvent } from 'react';
import { validateImportWork, type SteamImportGame } from '../../../domain/steamImport.ts';
import { t } from '../../i18n/index.ts';

/** Local preview form. Applying here never calls the repository. */
export function ImportCorrection({ work, onApply, onCancel }: { work: SteamImportGame; onApply: (value: SteamImportGame) => void; onCancel: () => void }) {
  const book = work.category === 'book';
  const details = book ? work.bookDetails : work.screenDetails;
  const [draft, setDraft] = useState({ title: work.title, originalTitle: work.originalTitle ?? '', creator: work.creator ?? '', year: work.year ?? '', subcategory: work.subcategory ?? '', sourceUrl: work.sourceUrl ?? '', tags: (work.tags ?? []).join('；'),
    publisher: work.bookDetails?.publisher ?? '', translator: work.bookDetails?.translator ?? '', isbn: work.bookDetails?.isbn ?? '',
    score: work.personalScore === undefined ? '' : String(work.personalScore), douban: details?.doubanScore === undefined ? '' : String(details.doubanScore),
    runtime: work.screenDetails?.durationMinutes === undefined ? '' : String(work.screenDetails.durationMinutes), episodes: work.screenDetails?.episodeCount === undefined ? '' : String(work.screenDetails.episodeCount),
  });
  const [error, setError] = useState('');
  const field = (key: keyof typeof draft, label: string, type = 'text', maxLength = 400) => <label className="form-field" key={key}>{t(label)}<input autoFocus={key === 'title'} aria-label={t(label)} type={type} value={draft[key]} maxLength={maxLength} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} /></label>;
  function apply(event: FormEvent) {
    event.preventDefault();
    const number = (value: string) => value.trim() ? Number(value) : undefined;
    const sourceUrl = draft.sourceUrl.trim() || undefined;
    const value = { ...work, title: draft.title.trim(), originalTitle: draft.originalTitle.trim(), creator: draft.creator.trim(), year: draft.year.trim(), subcategory: draft.subcategory.trim(), sourceUrl,
      ...(sourceUrl !== work.sourceUrl ? { externalIds: undefined } : {}),
      tags: draft.tags.split(/[,，;；、\n]/).map(tag => tag.trim()).filter(Boolean), personalScore: number(draft.score),
      ...(book ? { bookDetails: { ...work.bookDetails, publisher: draft.publisher.trim(), translator: draft.translator.trim(), isbn: draft.isbn.trim(), doubanScore: number(draft.douban) } }
        : { screenDetails: { ...work.screenDetails, durationMinutes: number(draft.runtime), episodeCount: number(draft.episodes), doubanScore: number(draft.douban) } }),
    };
    if (!book && value.subcategory && !['电影', '连续剧', '番剧', '动漫'].includes(value.subcategory)) { setError('影视类型请选择电影、连续剧或番剧'); return; }
    const checked = validateImportWork(value);
    if (typeof checked === 'string') { setError(checked); return; }
    onApply(checked);
  }
  return <form className="intake-correction" aria-label={t('修正导入资料')} onSubmit={apply} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); } }}>
    <div className="intake-correction-fields">
      {field('title', book ? '书名' : '作品名称', 'text', 200)}{field('creator', book ? '作者' : '导演')}
      {field('originalTitle', '原名', 'text', 200)}{field('year', book ? '出版年份' : '发行年份', 'text', 200)}
      {book ? <>{field('publisher', '出版社')}{field('translator', '译者')}{field('isbn', 'ISBN')}</> : <>
        <label className="form-field">{t('影视类型')}<select aria-label={t('影视类型')} value={draft.subcategory} onChange={event => setDraft(current => ({ ...current, subcategory: event.target.value }))}><option value="">{t('未填写 · 导入时采用上方类型')}</option>{['电影', '连续剧', '番剧', ...(draft.subcategory === '动漫' ? ['动漫'] : [])].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
        {field('runtime', '片长（分钟）')}{field('episodes', '总集数')}
      </>}
      {field('score', '我的评分')}{field('douban', '豆瓣评分')}{field('tags', '标签（分号分隔）')}
      <div className="intake-correction-link">{field('sourceUrl', '来源链接', 'url', 2048)}</div>
    </div>
    {error && <p role="alert" className="form-error">{t(error)}</p>}
    <div className="intake-correction-actions"><button type="button" className="button button--ghost" onClick={onCancel}>{t('取消修正')}</button><button type="submit" className="button button--primary">{t('应用到预览')}</button></div>
  </form>;
}
