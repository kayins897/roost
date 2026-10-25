import { Check, Pencil, X } from 'lucide-react';
import { useState } from 'react';
import { editCompletionEvent, isCompletionDate, removeCompletionEvent } from '../../../domain/gameProgress.ts';
import type { CompletionEvent, MediaItem } from '../../../domain/types.ts';
import { parseCompletionCount } from './CompletionCountEditor.tsx';

function CompletionEventRow({ item, event, onPatch }: { item: MediaItem; event: CompletionEvent; onPatch: (patch: Partial<MediaItem>) => boolean }) {
  const [mode, setMode] = useState<'edit' | 'delete' | null>(null);
  const [date, setDate] = useState(''), [note, setNote] = useState('');
  const [correctCount, setCorrectCount] = useState(false), [count, setCount] = useState('');
  const [error, setError] = useState('');
  const locked = Boolean(item.removedAt);
  function beginEdit() { setDate(event.occurredAt ?? ''); setNote(event.note ?? ''); setError(''); setMode('edit'); }
  function saveEdit() {
    if (date.trim() !== '' && !isCompletionDate(date.trim())) { setError('请检查日期格式。'); return; }
    const patch = editCompletionEvent(item, event.id, { occurredAt: date.trim(), note });
    if (patch && onPatch(patch)) { setMode(null); setError(''); }
    else setError('修改未能保存，内容已保留，请重试。');
  }
  function deleteEvent() {
    const value = correctCount ? parseCompletionCount(count) : undefined;
    if (correctCount && value === undefined) { setError('修正次数需为非负安全整数。'); return; }
    const patch = removeCompletionEvent(item, event.id, value);
    if (!(patch && onPatch(patch))) setError('删除未能保存，请重试。');
  }
  return <li>
    {mode === 'edit' && !locked ? <div className="completion-event-edit">
      <input value={date} aria-label="完成日期" placeholder="YYYY / YYYY-MM / YYYY-MM-DD 或留空" onChange={change => setDate(change.target.value)} />
      <input value={note} aria-label="完成备注" maxLength={80} onChange={change => setNote(change.target.value)} />
      <button className="icon-button icon-button--positive" aria-label="保存修改" onClick={saveEdit}><Check size={14} /></button><button className="icon-button" aria-label="取消修改完成记录" onClick={() => setMode(null)}><X size={14} /></button>
    </div> : mode === 'delete' && !locked ? <div className="completion-event-delete"><p>删除这条完成事件？默认保留独立的累计次数。</p><label><input type="checkbox" checked={correctCount} onChange={change => setCorrectCount(change.target.checked)} />同时把累计次数修正为</label>{correctCount && <input inputMode="numeric" aria-label="删除后累计次数" value={count} onChange={change => setCount(change.target.value)} />}<button className="button button--secondary" onClick={deleteEvent}>确认删除完成事件</button><button className="text-button" onClick={() => setMode(null)}>取消</button></div> : <>
      <span><strong>{event.occurredAt ?? '日期未知'}</strong>{event.note && <small> · {event.note}</small>}<small> · 录入于 {new Date(event.recordedAt).toLocaleDateString('zh-CN')}</small></span>
      {!locked && <span><button className="icon-button" aria-label={`编辑完成记录${event.occurredAt ?? ''}`} onClick={beginEdit}><Pencil size={13} /></button><button className="icon-button icon-button--danger" aria-label={`删除完成记录${event.occurredAt ?? ''}`} onClick={() => { setCorrectCount(false); setCount(item.completionCount === undefined ? '' : String(item.completionCount)); setError(''); setMode('delete'); }}><X size={13} /></button></span>}
    </>}
    {error && <small className="form-error" role="alert">{error}</small>}
  </li>;
}

export function CompletionEvents({ item, onPatch }: { item: MediaItem; onPatch: (patch: Partial<MediaItem>) => boolean }) {
  const events = item.completionEvents ?? [];
  if (!events.length) return null;
  const dated = events.filter(event => event.occurredAt !== undefined).sort((a, b) => b.occurredAt!.localeCompare(a.occurredAt!));
  const unknown = events.filter(event => event.occurredAt === undefined);
  return <div className="completion-events"><h4>已记录的完成事件</h4>{dated.length > 0 && <ul className="completion-event-list" aria-label="有日期的完成事件">{dated.map(event => <CompletionEventRow key={event.id} item={item} event={event} onPatch={onPatch} />)}</ul>}{unknown.length > 0 && <><p className="feature-help">实际日期未知（不按录入日期推算发生时间）</p><ul className="completion-event-list" aria-label="日期未知的完成事件">{unknown.map(event => <CompletionEventRow key={event.id} item={item} event={event} onPatch={onPatch} />)}</ul></>}</div>;
}
