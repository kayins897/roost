import { useState } from 'react';
import { isPersonalScore } from '../../../domain/gameAssets.ts';
import type { BookDetails, MediaItem } from '../../../domain/types.ts';
import { Modal } from '../../components/MediaPrimitives.tsx';
import { t } from '../../i18n/index.ts';
import { useUnsavedChanges } from '../../RecordEditors.tsx';

export type BookFactsScope = 'identity' | 'edition' | 'sources' | 'synopsis' | 'score';

function draftFor(item: MediaItem) {
  const details = item.bookDetails;
  return {
    title: item.title,
    originalTitle: item.originalTitle ?? '',
    author: item.creator,
    translator: details?.translator ?? '',
    publisher: details?.publisher ?? '',
    year: item.year,
    type: item.subcategory,
    isbn: details?.isbn ?? '',
    readingSources: details?.readingSources?.join('，') ?? '',
    metadataSource: details?.metadataSource ?? '',
    description: details?.description ?? '',
    score: String(item.personalScore ?? ''),
    douban: String(details?.doubanScore ?? ''),
  };
}

type Draft = ReturnType<typeof draftFor>;
type Field = { key: keyof Draft; label: string };
const sections: Record<BookFactsScope, { title: string; fields: Field[] }> = {
  identity: { title: '书籍资料', fields: [
    { key: 'title', label: '书名' },
    { key: 'originalTitle', label: '原名' },
    { key: 'author', label: '作者' },
  ] },
  edition: { title: '出版信息', fields: [
    { key: 'translator', label: '译者' },
    { key: 'publisher', label: '出版社' },
    { key: 'year', label: '出版年份' },
    { key: 'type', label: '书籍类型' },
    { key: 'isbn', label: 'ISBN' },
  ] },
  sources: { title: '阅读来源', fields: [
    { key: 'readingSources', label: '阅读来源（逗号分隔）' },
    { key: 'metadataSource', label: '资料来源' },
    { key: 'douban', label: '豆瓣评分' },
  ] },
  synopsis: { title: '简介', fields: [{ key: 'description', label: '简介' }] },
  score: { title: '评分', fields: [
    { key: 'score', label: '我的评分' },
  ] },
};

const readScore = (value: string) => value === '' ? undefined : Number(value);

export function BookFactsForm({ scope, item, onClose, onSave }: {
  scope: BookFactsScope;
  item: MediaItem;
  onClose: () => void;
  onSave: (patch: Partial<MediaItem>) => boolean;
}) {
  const { title, fields } = sections[scope];
  const [initial] = useState(() => draftFor(item));
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  const changed = (key: keyof Draft) => draft[key] !== initial[key];
  const dirty = fields.some(({ key }) => changed(key));
  useUnsavedChanges(dirty);

  function close() {
    if (!dirty || window.confirm(t('放弃尚未保存的书籍资料？'))) onClose();
  }

  function edit(key: keyof Draft, value: string) {
    setDraft(current => ({ ...current, [key]: value }));
    setError('');
  }

  function save() {
    if (!dirty) { onClose(); return; }
    const patch: Partial<MediaItem> = {};
    const details: Partial<BookDetails> = {};
    const score = readScore(draft.score);
    const douban = readScore(draft.douban);
    if ((changed('score') && score !== undefined && !isPersonalScore(score)) ||
      (changed('douban') && douban !== undefined && !isPersonalScore(douban))) {
      setError('评分应为 0–10 分，最多一位小数；未评分请留空。');
      return;
    }

    if (scope === 'identity') {
      if (!draft.title.trim()) { setError('书名不能为空。'); return; }
      if (changed('title')) patch.title = draft.title.trim();
      if (changed('originalTitle')) patch.originalTitle = draft.originalTitle.trim();
      if (changed('author')) patch.creator = draft.author.trim();
    } else if (scope === 'edition') {
      if (changed('translator')) details.translator = draft.translator.trim();
      if (changed('publisher')) details.publisher = draft.publisher.trim();
      if (changed('year')) patch.year = draft.year.trim();
      if (changed('type')) patch.subcategory = draft.type.trim();
      if (changed('isbn')) details.isbn = draft.isbn.trim();
    } else if (scope === 'sources') {
      if (changed('readingSources')) {
        const sources = draft.readingSources.split(/[,，;；\n]/).map(value => value.trim()).filter(Boolean);
        details.readingSources = [...new Set(sources)];
      }
      if (changed('metadataSource')) details.metadataSource = draft.metadataSource.trim();
      if (changed('douban')) details.doubanScore = douban;
    } else if (scope === 'synopsis') {
      if (changed('description')) details.description = draft.description;
    } else if (changed('score')) {
      patch.personalScore = score;
    }

    if (Object.keys(details).length) patch.bookDetails = { ...item.bookDetails, ...details };
    if (onSave(patch)) onClose();
    else setError('保存失败，资料草稿仍保留，请重试。');
  }

  return <Modal title={t(title)} onClose={close} wide={scope === 'synopsis'} className="books-dialog">
    <form onSubmit={event => { event.preventDefault(); save(); }}>
      <div className={scope === 'synopsis' ? undefined : 'books-facts-fields'}>
        {fields.map(({ key, label }) => {
          const score = key === 'score' || key === 'douban';
          return <label className="form-field" key={key}>
            {t(label)}
            {key === 'description'
              ? <textarea rows={7} value={draft[key]} onChange={event => edit(key, event.target.value)} />
              : <input type={score ? 'number' : 'text'} min={score ? 0 : undefined} max={score ? 10 : undefined}
                step={score ? .1 : undefined} placeholder={score ? t('未评分') : undefined}
                value={draft[key]} onChange={event => edit(key, event.target.value)} />}
          </label>;
        })}
      </div>
      {error && <p role="alert" className="books-danger">{t(error)}</p>}
      <footer className="books-dialog-actions">
        <button type="button" className="button button--secondary" onClick={close}>{t('取消')}</button>
        <button type="submit" className="button button--primary">{t('保存资料')}</button>
      </footer>
    </form>
  </Modal>;
}
