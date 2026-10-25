import { Check, Pencil, Plus, RotateCcw, Star, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { COMPLETION_LABELS, COMPLETION_STATUSES, completionFor, completionCountFor, editCompletionEvent, engagementFor, ENGAGEMENT_LABELS, isCompletionDate, PLAY_ENGAGEMENTS, recordCompletion, removeCompletionEvent, undoCompletionRecord } from '../../../domain/gameProgress.ts';
import type { CompletionEvent, MediaItem, PlayEngagement } from '../../../domain/types.ts';

/** 详情「游玩与进度」：双维度选择、累计完成次数与明确完成事件的编辑/删除/撤销。
 * 全部经 onPatch 一次一笔提交；失败由 onPatch 返回 false 并保留界面状态。 */
export function GameProgressPanel({ item, onPatch }: { item: MediaItem; onPatch: (patch: Partial<MediaItem>) => boolean }) {
  const locked = Boolean(item.removedAt);
  const engagement = engagementFor(item);
  const completion = completionFor(item);
  const count = completionCountFor(item);
  const events = item.completionEvents ?? [];
  const [recording, setRecording] = useState(false);
  const [undoable, setUndoable] = useState<{ eventId: string; countAfter?: number; completionAfter?: typeof completion } | null>(null);
  const [message, setMessage] = useState('');
  // 记录表单状态
  const [dateText, setDateText] = useState('');
  const [note, setNote] = useState('');
  const [countChoice, setCountChoice] = useState<'increment' | 'keep' | 'start-at-one' | 'set'>('keep');
  const [countValue, setCountValue] = useState('');
  const [markCleared, setMarkCleared] = useState(completion !== 'not-applicable');
  const [editingEvent, setEditingEvent] = useState<CompletionEvent | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editNote, setEditNote] = useState('');
  const [countEditing, setCountEditing] = useState(false);
  const [countDraft, setCountDraft] = useState('');
  const errorRef = useRef('');

  const dateValid = dateText.trim() === '' || isCompletionDate(dateText.trim());
  const effectiveChoice = count === undefined && countChoice === 'increment' ? 'start-at-one' : countChoice;
  const resolvedCount = effectiveChoice === 'increment' ? (count ?? 0) + 1 : effectiveChoice === 'start-at-one' ? 1 : effectiveChoice === 'set' ? (Number(countValue) >= 0 && Number.isInteger(Number(countValue)) ? Number(countValue) : undefined) : count;

  function saveEngagement(value: PlayEngagement) { if (!onPatch({ playEngagement: value })) setMessage('当前关系保存失败，请重试。'); else setMessage(''); }
  function saveCompletion(value: typeof completion) { if (!onPatch({ completion: value })) setMessage('通关进度保存失败，请重试。'); else setMessage(''); }

  function submitRecord() {
    if (!dateValid || (effectiveChoice === 'set' && resolvedCount === undefined)) { setMessage('请检查日期或次数输入。'); return; }
    const result = recordCompletion(item, {
      eventId: crypto.randomUUID(),
      occurredAt: dateText.trim() === '' ? undefined : dateText.trim(),
      note: note.trim() === '' ? undefined : note,
      countChoice: effectiveChoice === 'set' ? (resolvedCount === count ? 'keep' : resolvedCount === 1 ? 'start-at-one' : 'increment') : effectiveChoice,
      markCleared,
    }, new Date().toISOString());
    if (!result) { setMessage('无法记录，请检查输入。'); return; }
    if (onPatch(result.patch)) {
      setUndoable({ eventId: result.patch.completionEvents!.at(-1)!.id, ...(result.patch.completionCount !== undefined || effectiveChoice === 'start-at-one' ? { countAfter: resolvedCount } : {}), ...(result.patch.completion !== undefined ? { completionAfter: 'cleared' as const } : {}) });
      setRecording(false); setDateText(''); setNote(''); setCountChoice('keep'); setCountValue(''); setMessage('已记录一次完成。');
    } else setMessage('保存未完成，表单内容已保留，请重试。');
  }

  function undoRecord() {
    if (!undoable) return;
    const patch = undoCompletionRecord(item, undoable.eventId, { ...(undoable.countAfter !== undefined ? { countAfter: undoable.countAfter } : {}), ...(undoable.completionAfter !== undefined ? { completionAfter: undoable.completionAfter } : {}) });
    if (!patch) { setMessage('相关内容在记录后已被修改，无法自动撤销；请手动修正次数或进度。'); setUndoable(null); return; }
    if (onPatch(patch)) { setUndoable(null); setMessage('已撤销本次记录。'); }
  }

  function saveCount() {
    const trimmed = countDraft.trim();
    if (trimmed !== '' && !(Number.isInteger(Number(trimmed)) && Number(trimmed) >= 0)) { setMessage('次数需为非负整数，或留空表示未记录。'); return; }
    if (onPatch({ completionCount: trimmed === '' ? undefined : Number(trimmed) })) { setCountEditing(false); setMessage('累计完成次数已更新。'); }
    else setMessage('次数保存失败，请重试。');
  }

  return <section className="game-progress" aria-label="游玩与进度">
    <div className="detail-statuses game-state-options" aria-label="当前游玩关系">
      {PLAY_ENGAGEMENTS.map(value => <button key={value} className={`status-option ${engagement === value ? 'is-selected' : ''}`} aria-pressed={engagement === value} disabled={locked} onClick={() => saveEngagement(value)}>{ENGAGEMENT_LABELS[value]}</button>)}
      {engagement === 'unrecorded' && <span className="game-progress-unrecorded">当前关系未记录</span>}
    </div>
    <div className="detail-statuses completion-options" aria-label="通关进度">
      {COMPLETION_STATUSES.map(value => <button key={value} className={`status-option completion-option--${value} ${completion === value ? 'is-selected' : ''}`} aria-pressed={completion === value} disabled={locked} onClick={() => saveCompletion(value)}>{COMPLETION_LABELS[value]}</button>)}
    </div>
    <div className="completion-count-row">
      <span>累计完成<strong>{count === undefined ? '未记录' : `${count} 次`}</strong></span>
      {!locked && (countEditing
        ? <span className="completion-count-edit"><input inputMode="numeric" aria-label="累计完成次数" placeholder="留空=未记录" value={countDraft} onChange={event => setCountDraft(event.target.value)} /><button className="icon-button icon-button--positive" aria-label="保存次数" onClick={saveCount}><Check size={14} /></button><button className="icon-button" aria-label="取消" onClick={() => { setCountEditing(false); setCountDraft(''); }}><X size={14} /></button></span>
        : <button className="text-button" onClick={() => { setCountEditing(true); setCountDraft(count === undefined ? '' : String(count)); }}><Pencil size={13} />编辑次数</button>)}
      <span className="feature-help">未记录与 0 次不同；不从日志或事件数推算。</span>
    </div>
    {!locked && <div className="completion-actions">
      {!recording && <button className="button button--secondary" onClick={() => { setRecording(true); setMarkCleared(completion !== 'not-applicable'); }}><Plus size={14} />记录一次完成</button>}
      {undoable && <button className="button button--ghost" onClick={undoRecord}><RotateCcw size={14} />撤销本次</button>}
      {events.length > 0 && <span className="feature-help">已记录 {events.length} 次完成事件</span>}
    </div>}
    {recording && <div className="completion-record-form" role="form" aria-label="记录一次完成">
      <label className="form-field">实际完成日期（可留空=未知）<input value={dateText} placeholder="YYYY / YYYY-MM / YYYY-MM-DD" aria-label="实际完成日期" onChange={event => setDateText(event.target.value)} /><button type="button" className="text-button" onClick={() => setDateText(new Date().toISOString().slice(0, 10))}>今天</button>{!dateValid && <span className="form-error" role="alert">日期格式或数值不合法</span>}</label>
      <label className="form-field">备注（可选，例如“二周目”）<input value={note} aria-label="完成备注" maxLength={80} onChange={event => setNote(event.target.value)} /></label>
      <label className="form-field">累计次数
        <select aria-label="累计次数处理" value={effectiveChoice} onChange={event => setCountChoice(event.target.value as typeof effectiveChoice)}>
          {count === undefined
            ? <><option value="keep">保持未记录，仅记录事件</option><option value="start-at-one">从本次开始计为 1</option><option value="set">填写包含本次的累计值</option></>
            : <><option value="increment">同步 +1（{count} → {count + 1}）</option><option value="keep">保持 {count} 不变</option></>}
        </select>
        {effectiveChoice === 'set' && <input inputMode="numeric" aria-label="包含本次的累计值" value={countValue} onChange={event => setCountValue(event.target.value)} />}
      </label>
      <label className="form-field completion-mark-row"><input type="checkbox" checked={markCleared} onChange={event => setMarkCleared(event.target.checked)} />同时把通关进度标记为已通关{completion === 'not-applicable' && <span className="feature-help">（当前为不适用，勾选将改为已通关）</span>}</label>
      <p className="feature-help" role="status">预览：{count === undefined && effectiveChoice === 'keep' ? '累计保持未记录' : `累计 ${count === undefined ? '未记录' : count} → ${resolvedCount === undefined ? '未记录' : resolvedCount}`}{markCleared && completion !== 'cleared' ? `；进度 ${COMPLETION_LABELS[completion]} → 已通关` : ''}。</p>
      {errorRef.current && <p className="form-error" role="alert">{errorRef.current}</p>}
      <div className="modal-actions"><button className="button button--ghost" onClick={() => setRecording(false)}>取消</button><button className="button button--primary" disabled={!dateValid} onClick={submitRecord}><Star size={14} />保存这条完成记录</button></div>
    </div>}
    {events.length > 0 && <ul className="completion-event-list" aria-label="已记录的完成事件">
      {events.map(event => {
        const editingThis = editingEvent?.id === event.id;
        return <li key={event.id}>
          {editingThis ? <span className="completion-event-edit">
            <input value={editDate} aria-label="完成日期" placeholder="YYYY / YYYY-MM / YYYY-MM-DD 或留空" onChange={change => setEditDate(change.target.value)} />
            <input value={editNote} aria-label="完成备注" maxLength={80} onChange={change => setEditNote(change.target.value)} />
            <button className="icon-button icon-button--positive" aria-label="保存修改" onClick={() => {
              const patch = editCompletionEvent(item, event.id, { occurredAt: editDate.trim(), note: editNote });
              if (patch && onPatch(patch)) { setEditingEvent(null); setMessage('完成事件已更新（不改变累计次数）。'); }
              else setMessage('修改未保存，请检查日期格式。');
            }}><Check size={14} /></button>
            <button className="icon-button" aria-label="取消" onClick={() => setEditingEvent(null)}><X size={14} /></button>
          </span> : <>
            <span><strong>{event.occurredAt ?? '日期未知'}</strong>{event.note && <small> · {event.note}</small>}<small> · 录入于 {new Date(event.recordedAt).toLocaleDateString('zh-CN')}</small></span>
            {!locked && <span>
              <button className="icon-button" aria-label={`编辑完成记录${event.occurredAt ?? ''}`} onClick={() => { setEditingEvent(event); setEditDate(event.occurredAt ?? ''); setEditNote(event.note ?? ''); }}><Pencil size={13} /></button>
              <button className="icon-button icon-button--danger" aria-label={`删除完成记录${event.occurredAt ?? ''}`} onClick={() => {
                if (window.confirm('删除这条完成记录？累计次数独立保留，不会被自动扣减。')) {
                  const patch = removeCompletionEvent(item, event.id);
                  if (patch) onPatch(patch);
                }
              }}><X size={13} /></button>
            </span>}
          </>}
        </li>;
      })}
    </ul>}
    {message && <p className="feature-help" role="status">{message}</p>}
  </section>;
}
