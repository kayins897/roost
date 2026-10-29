import { t } from '../i18n/index.ts';
import { useEffect, useImperativeHandle, useRef, useState, type Ref, type RefObject } from 'react';
import { isPersonalScore } from '../../domain/gameAssets.ts';
import { ScorePicker, type ScorePickerHandle } from './ScorePicker.tsx';

const textFor = (value?: number) => value === undefined ? '' : value.toFixed(1);
export interface InlineScoreControlHandle { commit: () => boolean }
/** Coalesce a short wheel gesture, then use the existing revision-checked
 * repository. Outside clicks, Escape and unmount flush the last chosen score. */
export function InlineScoreControl({ value, onSave, label = '通关评分', deferUntilDismiss = false, commitScope, ref }: {
  value?: number; onSave: (value: number | undefined) => boolean; label?: string;
  deferUntilDismiss?: boolean; commitScope?: RefObject<HTMLElement | null>; ref?: Ref<InlineScoreControlHandle>;
}) {
  const [draft, setDraft] = useState(textFor(value)), [error, setError] = useState('');
  const persisted = useRef(value), failed = useRef(false), draftRef = useRef(draft);
  const pending = useRef<string | undefined>(undefined), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true), saveRef = useRef(onSave); saveRef.current = onSave;
  const region = useRef<HTMLDivElement>(null);
  const picker = useRef<ScorePickerHandle>(null);
  useImperativeHandle(ref, () => ({ commit: () => flush() }));
  const withinScope = (target: EventTarget | null) => (commitScope?.current ?? region.current)?.contains(target as Node | null);
  useEffect(() => {
    mounted.current = true;
    // A failed write must not disappear as if it succeeded when an outside
    // click or Escape dismisses the parent menu. Retry or undo remains inline.
    const keepFailedDraft = (event: Event) => {
      if (withinScope(event.target)) return;
      flush();
      if (!failed.current) return;
      event.preventDefault(); event.stopImmediatePropagation();
      region.current?.querySelector<HTMLButtonElement>('[data-score-retry]')?.focus();
    };
    const keepOnEscape = (event: KeyboardEvent) => {
      // Cards also open their menus directly from keyboard handlers, without
      // dispatching a native contextmenu event. Guard that replacement too.
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { keepFailedDraft(event); return; }
      if (event.key !== 'Escape') return;
      flush();
      if (!failed.current) return;
      event.preventDefault(); event.stopImmediatePropagation();
      region.current?.querySelector<HTMLButtonElement>('[data-score-retry]')?.focus();
    };
    window.addEventListener('pointerdown', keepFailedDraft, true); window.addEventListener('click', keepFailedDraft, true); window.addEventListener('contextmenu', keepFailedDraft, true); window.addEventListener('keydown', keepOnEscape, true);
    const leaving = () => { flush(); };
    window.addEventListener('beforeunload', leaving);
    return () => { mounted.current = false; flush(); window.removeEventListener('pointerdown', keepFailedDraft, true); window.removeEventListener('click', keepFailedDraft, true); window.removeEventListener('contextmenu', keepFailedDraft, true); window.removeEventListener('keydown', keepOnEscape, true); window.removeEventListener('beforeunload', leaving); };
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
    // The library menu edits a local draft for its entire lifetime: an idle
    // wheel between the two columns must not move the card into another band.
    if (!deferUntilDismiss) timer.current = setTimeout(flush, 200);
  }
  function flush(forceRetry = false) {
    // Settle touch/drag scrolling before the parent's outside/Escape handler
    // can unmount us, so a failed final write can still retain its draft.
    picker.current?.settle();
    if (timer.current) clearTimeout(timer.current);
    if (pending.current === undefined) return true;
    // A failed write stays a visible draft. Dismissal/focus must never retry it
    // implicitly; only a new choice or the explicit Retry button does that.
    if (failed.current && !forceRetry) return false;
    const next = pending.current === '' ? undefined : Number(pending.current);
    let ok = false;
    try { ok = saveRef.current(next); } catch { /* Keep the chosen draft available for explicit retry. */ }
    failed.current = !ok;
    if (ok) { pending.current = undefined; persisted.current = next; if (mounted.current) setError(''); }
    else if (mounted.current) setError('评分未能保存');
    return ok;
  }
  return <div ref={region} className="score-control score-control--instant" onBlurCapture={event => { if (!withinScope(event.relatedTarget)) flush(); }} onKeyDown={event => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) event.stopPropagation();
  }}>
    <ScorePicker ref={picker} value={draft} label={label} onChange={choose} />
    {(draft !== '' || value !== undefined) && <button type="button" className="text-button" onClick={() => { choose(''); if (!deferUntilDismiss) flush(); }}>{t("清除评分")}</button>}
    {error && <div className="score-control-error" role="alert"><span>{t(error)}</span><button type="button" data-score-retry onClick={() => flush(true)}>{t("重试")}</button><button type="button" onClick={() => { if (timer.current) clearTimeout(timer.current); pending.current = undefined; failed.current = false; draftRef.current = textFor(persisted.current); setDraft(draftRef.current); setError(''); }}>{t("撤销修改")}</button></div>}
  </div>;
}
