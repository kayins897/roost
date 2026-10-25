import { Pencil, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { COMPLETION_LABELS, COMPLETION_STATUSES, completionFor, completionCountFor, engagementFor, ENGAGEMENT_LABELS, PLAY_ENGAGEMENTS, undoCompletionRecord, type CompletionRecordUndo } from '../../../domain/gameProgress.ts';
import type { MediaItem } from '../../../domain/types.ts';
import { CompletionCountEditor } from './CompletionCountEditor.tsx';
import { CompletionEvents } from './CompletionEvents.tsx';
import { CompletionRecordForm } from './CompletionRecordForm.tsx';

/** Current activity, completion, and explicitly recorded totals remain independent. */
export function GameProgressPanel({ item, onPatch }: { item: MediaItem; onPatch: (patch: Partial<MediaItem>) => boolean }) {
  const locked = Boolean(item.removedAt);
  const engagement = engagementFor(item), completion = completionFor(item), count = completionCountFor(item);
  const [recording, setRecording] = useState(false);
  const [editingCount, setEditingCount] = useState(false);
  const [undoable, setUndoable] = useState<CompletionRecordUndo | null>(null);
  const [message, setMessage] = useState('');
  function undoRecord() {
    if (!undoable) return;
    const patch = undoCompletionRecord(item, undoable);
    if (!patch) { setMessage('相关内容在记录后已被修改，无法自动撤销；请手动修正次数或进度。'); setUndoable(null); return; }
    if (onPatch(patch)) { setUndoable(null); setMessage('已撤销本次记录。'); }
    else setMessage('撤销未能保存，请重试。');
  }
  return <section className="game-progress" aria-label="游玩与进度">
    <div className="detail-statuses game-state-options" aria-label="当前游玩关系">
      {PLAY_ENGAGEMENTS.map(value => <button key={value} className={`status-option ${engagement === value ? 'is-selected' : ''}`} aria-pressed={engagement === value} disabled={locked} onClick={() => { if (value !== engagement) setMessage(onPatch({ playEngagement: value }) ? '' : '当前关系保存失败，请重试。'); }}>{ENGAGEMENT_LABELS[value]}</button>)}
      {engagement === 'unrecorded' && <span className="game-progress-unrecorded">当前关系未记录</span>}
    </div>
    <div className="detail-statuses completion-options" aria-label="通关进度">
      {COMPLETION_STATUSES.map(value => <button key={value} className={`status-option completion-option--${value} ${completion === value ? 'is-selected' : ''}`} aria-pressed={completion === value} disabled={locked} onClick={() => { if (value !== completion) setMessage(onPatch({ completion: value }) ? '' : '通关进度保存失败，请重试。'); }}>{COMPLETION_LABELS[value]}</button>)}
    </div>
    <div className="completion-count-row">
      <span>累计完成<strong>{count === undefined ? '未记录' : `${count} 次`}</strong></span>
      {!locked && (editingCount ? <CompletionCountEditor count={count} onCancel={() => setEditingCount(false)} onSave={value => { if (!onPatch({ completionCount: value })) return false; setEditingCount(false); setMessage('累计完成次数已更新。'); return true; }} /> : <button className="text-button" onClick={() => setEditingCount(true)}><Pencil size={13} />编辑次数</button>)}
      <span className="feature-help">未记录与 0 次不同；不从日志或事件数推算。</span>
    </div>
    {count === 0 && completion === 'cleared' && <p className="feature-help">进度是已通关，累计次数为 0；两个字段独立保留，如需更正请手动修改。</p>}
    {!locked && <div className="completion-actions">
      {!recording && <button className="button button--secondary" onClick={() => setRecording(true)}><Plus size={14} />记录一次完成</button>}
      {undoable && <button className="button button--ghost" onClick={undoRecord}><RotateCcw size={14} />撤销本次</button>}
    </div>}
    {recording && !locked && <CompletionRecordForm item={item} onPatch={onPatch} onCancel={() => setRecording(false)} onRecorded={receipt => { setUndoable(receipt); setRecording(false); setMessage('已记录一次完成。'); }} />}
    <CompletionEvents item={item} onPatch={onPatch} />
    {message && <p className="feature-help" role="status">{message}</p>}
  </section>;
}
