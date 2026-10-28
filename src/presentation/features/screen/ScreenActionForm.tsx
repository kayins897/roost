import { useState } from 'react';
import type { ScreenAction } from '../../../domain/screens.ts';
import { isCompletionDate } from '../../../domain/gameProgress.ts';
import type { ExperienceEntry, MediaItem, ScreenViewingRound } from '../../../domain/types.ts';
import { useUnsavedChanges } from '../../RecordEditors.tsx';
import { Modal } from '../../components/MediaPrimitives.tsx';
import { localDate, screenId } from './screenView.ts';

export type ScreenFormKind = 'round' | 'entry' | 'progress';
interface Props {
  kind: ScreenFormKind; item: MediaItem; onClose: () => void; onSave: (action: ScreenAction) => boolean;
  initialRound?: ScreenViewingRound; initialEntry?: ExperienceEntry;
}
export function ScreenActionForm({ kind, item, onClose, onSave, initialRound, initialEntry }: Props) {
  const initial = {
    date: initialRound?.finishedOn ?? initialEntry?.date ?? (kind === 'entry' ? localDate() : ''),
    minutes: initialEntry?.minutes === undefined ? '' : String(initialEntry.minutes),
    note: initialEntry?.note ?? initialRound?.impression ?? '', review: initialRound?.review ?? '',
    season: String(item.screenViewing?.progress?.season ?? ''), episode: String(item.screenViewing?.progress?.episode ?? ''), finishPlan: !initialRound,
  };
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft);
  useUnsavedChanges(dirty);
  const close = () => { if (!dirty || window.confirm('放弃尚未保存的观看记录？')) onClose(); };
  function edit(key: keyof typeof initial, value: string | boolean) { setDraft(current => ({ ...current, [key]: value })); setError(''); }
  function save() {
    let action: ScreenAction;
    if (kind === 'progress') {
      const season = draft.season === '' ? undefined : Number(draft.season), episode = draft.episode === '' ? undefined : Number(draft.episode);
      if ((season !== undefined && (!Number.isSafeInteger(season) || season < 1)) || (episode !== undefined && (!Number.isSafeInteger(episode) || episode < 0))) { setError('季数请输入正整数；集数可为 0，未知可以留空。'); return; }
      action = { type: 'progress', season, episode };
    } else if (kind === 'round') {
      if (draft.date && !isCompletionDate(draft.date)) { setError('日期可填有效的年、年月或年月日；不知道时可以留空。'); return; }
      action = { type: 'round', round: { ...initialRound, id: initialRound?.id ?? screenId(), ...(draft.date ? { finishedOn: draft.date } : { finishedOn: undefined }), impression: draft.note, review: draft.review }, finishPlan: draft.finishPlan };
    } else {
      const minutes = draft.minutes === '' ? undefined : Number(draft.minutes);
      const maximum = Math.max(initialEntry?.date.length === 7 ? 44640 : 1440, initialEntry?.minutes ?? 0);
      if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(draft.date) || !isCompletionDate(draft.date) || (minutes !== undefined && (!Number.isSafeInteger(minutes) || minutes < 0 || minutes > maximum))) { setError(`请选择有效日期，时长应为 0–${maximum} 的整数分钟；未知可以留空。`); return; }
      action = { type: 'entry', entry: { ...initialEntry, id: initialEntry?.id ?? screenId(), kind: initialEntry?.kind ?? 'progress', date: draft.date, note: draft.note, minutes } };
    }
    if (onSave(action)) onClose(); else setError('保存失败，草稿仍保留，请重试。');
  }
  return <Modal title={kind === 'progress' ? '观看进度' : kind === 'round' ? initialRound ? '编辑看过记录' : '补录看过' : '记录观看'} onClose={close} className="books-dialog"><form onSubmit={event => { event.preventDefault(); save(); }}>
    <p className="books-form-book">{item.title}</p>
    {kind === 'progress' ? <><div className="books-facts-fields"><label className="form-field">看到第几季<input type="number" min={1} step={1} placeholder="未记录" value={draft.season} onChange={event => edit('season', event.target.value)}/></label><label className="form-field">看到第几集<input type="number" min={0} step={1} placeholder="未记录" value={draft.episode} onChange={event => edit('episode', event.target.value)}/></label></div><p className="books-muted">进度不会自动把整部作品标记为看过。</p></> : <>
      <label className="form-field">{kind === 'round' ? '看完日期' : '观看日期'}<input type={kind === 'round' ? 'text' : initialEntry?.date.length === 7 ? 'month' : 'date'} placeholder="如 2026、2026-10、2026-10-28；可留空" value={draft.date} onChange={event => edit('date', event.target.value)} required={kind === 'entry'}/></label>
      {kind === 'entry' && <label className="form-field">实际观看时长（分钟）<input type="number" min={0} step={1} placeholder="未记录" value={draft.minutes} onChange={event => edit('minutes', event.target.value)}/><small className="books-muted">留空与 0 分钟不同；片长不会自动算入实际时长。</small></label>}
      <label className="form-field">{kind === 'round' ? '这次看完的感想' : '这次看了什么'}<textarea rows={3} value={draft.note} onChange={event => edit('note', event.target.value)}/></label>
      {kind === 'round' && <><label className="form-field">观后感<textarea rows={5} value={draft.review} onChange={event => edit('review', event.target.value)}/></label>{!initialRound && <label className="books-checkbox"><input type="checkbox" checked={draft.finishPlan} onChange={event => edit('finishPlan', event.target.checked)}/>结束当前观看安排</label>}</>}
    </>}
    {error && <p role="alert" className="books-danger">{error}</p>}<footer className="books-dialog-actions"><button type="button" className="button button--secondary" onClick={close}>取消</button><button className="button button--primary" type="submit">保存记录</button></footer>
  </form></Modal>;
}
