import { Check, X } from 'lucide-react';
import { useState } from 'react';

export function parseCompletionCount(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function CompletionCountEditor({ count, onSave, onCancel }: { count: number | undefined; onSave: (value: number | undefined) => boolean; onCancel: () => void }) {
  const [draft, setDraft] = useState(count === undefined ? '' : String(count));
  const [error, setError] = useState('');
  function save() {
    const value = draft.trim() === '' ? undefined : parseCompletionCount(draft);
    if (draft.trim() !== '' && value === undefined) { setError('次数需为非负安全整数，或留空表示未记录。'); return; }
    if (value === count) { onCancel(); return; }
    if (!onSave(value)) setError('次数保存失败，请重试。');
  }
  return <span className="completion-count-edit"><input inputMode="numeric" aria-label="累计完成次数" placeholder="留空=未记录" value={draft} onChange={event => setDraft(event.target.value)} /><button className="icon-button icon-button--positive" aria-label="保存次数" onClick={save}><Check size={14} /></button><button className="icon-button" aria-label="取消修改次数" onClick={onCancel}><X size={14} /></button>{error && <small role="alert" className="form-error">{error}</small>}</span>;
}
