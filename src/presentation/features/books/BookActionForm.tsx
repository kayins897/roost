import { useState } from 'react';
import type { BookAction } from '../../../domain/books.ts';
import { isCompletionDate } from '../../../domain/gameProgress.ts';
import type { MediaItem } from '../../../domain/types.ts';
import { Modal } from '../../components/MediaPrimitives.tsx';
import { bookId, localDate } from './bookView.ts';

export type BookFormKind = 'entry' | 'round' | 'plan';
interface Props {
  kind: BookFormKind; item: MediaItem; date?: string; onClose: () => void;
  onSave: (action: BookAction) => boolean; books?: MediaItem[]; onBook?: (id: string) => void;
  initialRound?: { id: string; finishedOn?: string; impression: string; review: string };
  initialEntry?: { id: string; date: string; note: string; minutes?: number; kind: 'started' | 'progress' | 'completed' | 'note' };
}
export function BookActionForm({ kind, item, date, onClose, onSave, books, onBook, initialRound, initialEntry }: Props) {
  const initialPlan = item.bookReading?.plan;
  const initial = { date: initialRound?.finishedOn ?? initialEntry?.date ?? (kind === 'round' ? '' : date ?? localDate()), minutes: initialEntry?.minutes === undefined ? '' : String(initialEntry.minutes), note: initialEntry?.note ?? initialRound?.impression ?? (kind === 'plan' ? initialPlan?.reason ?? '' : ''), review: initialRound?.review ?? '', targetDate: initialPlan?.targetDate ?? '', finishPlan: true };
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  function edit(key: keyof typeof draft, value: string | boolean) { setDraft(current => ({ ...current, [key]: value })); setError(''); }
  function save() {
    const minutes = draft.minutes === '' ? undefined : Number(draft.minutes);
    if (kind === 'entry' && (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(draft.date) || !isCompletionDate(draft.date) || (minutes !== undefined && (!Number.isSafeInteger(minutes) || minutes < 0 || minutes > 1440)))) { setError('请选择有效日期，时长请输入 0–1440 的整数分钟，未记录可留空。'); return; }
    if (kind === 'round' && draft.date && !isCompletionDate(draft.date)) { setError('读完日期可填写有效的年、年月、年月日；不知道时可以留空。'); return; }
    if (kind === 'plan' && draft.targetDate && !isCompletionDate(draft.targetDate)) { setError('请填写有效的计划日期，例如 2026、2026-10 或 2026-10-28。'); return; }
    const action: BookAction = kind === 'entry' ? { type: 'entry', entry: { id: initialEntry?.id ?? bookId(), date: draft.date, kind: initialEntry?.kind ?? 'progress', note: draft.note, ...(minutes === undefined ? {} : { minutes }) } } : kind === 'round' ? { type: 'round', round: { id: initialRound?.id ?? bookId(), ...(draft.date ? { finishedOn: draft.date } : {}), impression: draft.note, review: draft.review }, finishPlan: initialRound ? false : draft.finishPlan } : { type: 'plan', reason: draft.note, ...(draft.targetDate ? { targetDate: draft.targetDate } : {}) };
    if (onSave(action)) onClose(); else setError('保存失败，内容仍保留，请重试。');
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const close = () => { if (!dirty || window.confirm('放弃尚未保存的阅读记录？')) onClose(); };
  return <Modal title={kind === 'entry' ? '记录阅读' : kind === 'round' ? initialRound ? '编辑读后记录' : '补录已读' : '阅读计划'} onClose={close} className="books-dialog"><form onSubmit={event => { event.preventDefault(); save(); }}>
    {books && onBook ? <label className="form-field">书籍<select value={item.id} onChange={event => { if (!dirty || window.confirm('切换书籍会清除当前草稿，继续吗？')) onBook(event.target.value); }}>{books.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}</select></label> : <p className="books-form-book">{item.title}</p>}
    {kind !== 'plan' && <label className="form-field">{kind === 'entry' ? '阅读日期' : '读完日期'}<input type={kind === 'entry' ? initialEntry?.date.length === 7 ? 'month' : 'date' : 'text'} placeholder={kind === 'round' ? '如 2026、2026-10；可留空' : ''} value={draft.date} onChange={event => edit('date', event.target.value)} required={kind === 'entry'}/></label>}
    {kind === 'entry' && <label className="form-field">阅读时长（分钟）<input type="number" min={0} max={1440} step={1} placeholder="未记录" value={draft.minutes} onChange={event => edit('minutes', event.target.value)}/><small className="books-muted">留空表示时长未记录，0 表示明确记录为零；不会自动记为读完。</small></label>}
    <label className="form-field">{kind === 'plan' ? '为什么想读' : kind === 'round' ? '读完的感想' : '这次读了什么'}<textarea rows={3} value={draft.note} onChange={event => edit('note', event.target.value)}/></label>
    {kind === 'round' && <><label className="form-field">长篇读后感<textarea rows={6} value={draft.review} onChange={event => edit('review', event.target.value)}/></label>{!initialRound && <label className="books-checkbox"><input type="checkbox" checked={draft.finishPlan} onChange={event => edit('finishPlan', event.target.checked)}/>结束当前阅读安排，保留计划理由</label>}</>}
    {kind === 'plan' && <label className="form-field">计划日期（可选）<input type="text" placeholder="如 2026、2026-10、2026-10-28" value={draft.targetDate} onChange={event => edit('targetDate', event.target.value)}/><small className="books-muted">修改计划不会自动恢复闲置或弃读的安排。</small></label>}
    {error && <p role="alert" className="books-danger">{error}</p>}<footer className="books-dialog-actions"><button type="button" className="button button--secondary" onClick={close}>取消</button><button type="submit" className="button button--primary">保存记录</button></footer>
  </form></Modal>;
}
