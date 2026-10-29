import { t } from '../../i18n/index.ts';
import { useUnsavedChanges } from '../../RecordEditors.tsx';
import { useState } from 'react';
import type { MediaItem } from '../../../domain/types.ts';
import { Modal } from '../../components/MediaPrimitives.tsx';

export function BookFactsForm({ item, onClose, onSave }: { item: MediaItem; onClose: () => void; onSave: (patch: Partial<MediaItem>) => boolean }) {
  const initial = { title: item.title, originalTitle: item.originalTitle ?? '', author: item.creator, year: item.year, type: item.subcategory, publisher: item.bookDetails?.publisher ?? '', translator: item.bookDetails?.translator ?? '', isbn: item.bookDetails?.isbn ?? '', description: item.bookDetails?.description ?? '', douban: item.bookDetails?.doubanScore === undefined ? '' : String(item.bookDetails.doubanScore), score: item.personalScore === undefined ? '' : String(item.personalScore), readingSources: (item.bookDetails?.readingSources ?? []).join('，'), metadataSource: item.bookDetails?.metadataSource ?? '' };
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft);
  useUnsavedChanges(dirty);
  function save() {
    const score = draft.score === '' ? undefined : Number(draft.score);
    const doubanScore = draft.douban === '' ? undefined : Number(draft.douban);
    if (!draft.title.trim()) { setError('书名不能为空。'); return; }
    if ([score, doubanScore].some(value => value !== undefined && (!Number.isFinite(value) || value < 0 || value > 10 || Math.abs(value * 10 - Math.round(value * 10)) > 1e-6))) { setError('评分应为 0–10 分，最多一位小数；未评分请留空。'); return; }
    const patch: Partial<MediaItem> = { title: draft.title.trim(), originalTitle: draft.originalTitle.trim(), creator: draft.author.trim(), year: draft.year.trim(), subcategory: draft.type.trim(), personalScore: score, bookDetails: { ...item.bookDetails, publisher: draft.publisher.trim(), translator: draft.translator.trim(), isbn: draft.isbn.trim(), description: draft.description, doubanScore, metadataSource: draft.metadataSource.trim(), readingSources: [...new Set(draft.readingSources.split(/[,，;；\n]/).map(value => value.trim()).filter(Boolean))] } };
    if (onSave(patch)) onClose(); else setError('保存失败，资料草稿仍保留，请重试。');
  }
  const close = () => { if (!dirty || window.confirm(t('放弃尚未保存的书籍资料？'))) onClose(); };
  const fields: { key: keyof typeof initial; label: string }[] = [{ key: 'title', label: '书名' }, { key: 'originalTitle', label: '原名' }, { key: 'author', label: '作者' }, { key: 'translator', label: '译者' }, { key: 'publisher', label: '出版社' }, { key: 'year', label: '出版年份' }, { key: 'type', label: '书籍类型' }, { key: 'isbn', label: 'ISBN' }, { key: 'readingSources', label: '阅读来源（逗号分隔）' }, { key: 'metadataSource', label: '资料来源' }];
  return <Modal title={t("书籍资料")} onClose={close} wide className="books-dialog"><form onSubmit={event => { event.preventDefault(); save(); }}><div className="books-facts-fields">{fields.map(({ key, label }) => <label className="form-field" key={key}>{t(label)}<input value={draft[key]} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))}/></label>)}<label className="form-field">{t("我的评分")}<input type="number" min={0} max={10} step={.1} placeholder={t("未评分")} value={draft.score} onChange={event => setDraft(current => ({ ...current, score: event.target.value }))}/></label><label className="form-field">{t("豆瓣评分")}<input type="number" min={0} max={10} step={.1} placeholder={t("未评分")} value={draft.douban} onChange={event => setDraft(current => ({ ...current, douban: event.target.value }))}/></label></div><label className="form-field">{t("简介")}<textarea rows={4} value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))}/></label>{error && <p role="alert" className="books-danger">{t(error)}</p>}<footer className="books-dialog-actions"><button type="button" className="button button--secondary" onClick={close}>{t("取消")}</button><button type="submit" className="button button--primary">{t("保存资料")}</button></footer></form></Modal>;
}
