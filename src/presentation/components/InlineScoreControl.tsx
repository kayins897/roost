import { useEffect, useRef, useState } from 'react';
import { isPersonalScore } from '../../domain/gameAssets.ts';
import { ScorePicker, type ScorePickerHandle } from './ScorePicker.tsx';

const textFor = (value?: number) => value === undefined ? '' : value.toFixed(1);
/** Coalesce a short wheel gesture, then use the existing revision-checked
 * repository. Outside clicks, Escape and unmount flush the last chosen score. */
export function InlineScoreControl({ value, onSave, label = '通关评分' }: {
  value?: number; onSave: (value: number | undefined) => boolean; label?: string;
}) {
  const [draft, setDraft] = useState(textFor(value)), [error, setError] = useState('');
  const persisted = useRef(value), failed = useRef(false), draftRef = useRef(draft);
  const pending = useRef<string | undefined>(undefined), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true), saveRef = useRef(onSave); saveRef.current = onSave;
  const region = useRef<HTMLDivElement>(null);
  const picker = useRef<ScorePickerHandle>(null);
  useEffect(() => {
    mounted.current = true;
    // A failed write must not disappear as if it succeeded when an outside
    // click or Escape dismisses the parent menu. Retry or undo remains inline.
    const keepFailedDraft = (event: Event) => {
      if (region.current?.contains(event.target as Node)) return;
      flush();
      if (!failed.current) return;
      event.preventDefault(); event.stopImmediatePropagation();
      region.current?.querySelector<HTMLButtonElement>('[data-score-retry]')?.focus();
    };
    const keepOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      flush();
      if (!failed.current) return;
      event.preventDefault(); event.stopImmediatePropagation();
      region.current?.querySelector<HTMLButtonElement>('[data-score-retry]')?.focus();
    };
    window.addEventListener('pointerdown', keepFailedDraft, true); window.addEventListener('click', keepFailedDraft, true); window.addEventListener('keydown', keepOnEscape, true);
    const leaving = () => { flush(); };
    window.addEventListener('beforeunload', leaving);
    return () => { mounted.current = false; flush(); window.removeEventListener('pointerdown', keepFailedDraft, true); window.removeEventListener('click', keepFailedDraft, true); window.removeEventListener('keydown', keepOnEscape, true); window.removeEventListener('beforeunload', leaving); };
  }, []);
  useEffect(() => {
    persisted.current = value;
    if (pending.current === undefined || textFor(value) === draftRef.current) {
      draftRef.current = textFor(value); setDraft(draftRef.current); failed.current = false; setError('');
    }
  }, [value]);
  function choose(text: string) {
    draftRef.current = text; setDraft(text);
    const next = text === '' ? undefined : Number(text);
    if (next !== undefined && !isPersonalScore(next)) return;
    if (timer.current) clearTimeout(timer.current);
    failed.current = false; setError('');
    if (next === persisted.current) { pending.current = undefined; return; }
    pending.current = text;
    timer.current = setTimeout(flush, 200);
  }
  function flush(forceRetry = false) {
    // Settle touch/drag scrolling before the parent's outside/Escape handler
    // can unmount us, so a failed final write can still retain its draft.
    picker.current?.settle();
    if (timer.current) clearTimeout(timer.current);
    if (pending.current === undefined) return;
    // A failed write stays a visible draft. Dismissal/focus must never retry it
    // implicitly; only a new choice or the explicit Retry button does that.
    if (failed.current && !forceRetry) return;
    const next = pending.current === '' ? undefined : Number(pending.current);
    let ok = false;
    try { ok = saveRef.current(next); } catch { /* Keep the chosen draft available for explicit retry. */ }
    failed.current = !ok;
    if (ok) { pending.current = undefined; persisted.current = next; if (mounted.current) setError(''); }
    else if (mounted.current) setError('评分未能保存');
  }
  return <div ref={region} className="score-control score-control--instant" onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) flush(); }} onKeyDown={event => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) event.stopPropagation();
  }}>
    <ScorePicker ref={picker} value={draft} label={label} onChange={choose} />
    {(draft !== '' || value !== undefined) && <button type="button" className="text-button" onClick={() => { choose(''); flush(); }}>清除评分</button>}
    {error && <div className="score-control-error" role="alert"><span>{error}</span><button type="button" data-score-retry onClick={() => flush(true)}>重试</button><button type="button" onClick={() => { if (timer.current) clearTimeout(timer.current); pending.current = undefined; failed.current = false; draftRef.current = textFor(persisted.current); setDraft(draftRef.current); setError(''); }}>撤销修改</button></div>}
  </div>;
}
