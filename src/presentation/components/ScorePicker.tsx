import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import './score-picker.css';

interface ScorePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
}
const ROW_HEIGHT = 32;
function scoreFrom(value: string) {
  const number = value.trim() === '' ? undefined : Number(value);
  return number !== undefined && Number.isFinite(number) && number >= 0 && number <= 10 ? Math.round(number * 10) / 10 : undefined;
}

/** Controlled draft only. Mounting, clearing, and synchronizing never commit a score. */
export function ScorePicker({ value, onChange, label = '通关评分', disabled = false }: ScorePickerProps) {
  const draft = useRef(value); draft.current = value;
  const score = scoreFrom(value);
  const integer = score === undefined ? null : Math.floor(score);
  const decimal = score === undefined ? null : Math.round((score - Math.floor(score)) * 10);
  function updateWhole(next: number) {
    const current = scoreFrom(draft.current);
    draft.current = `${next}.${next === 10 ? 0 : current === undefined ? 0 : Math.round(current * 10) % 10}`; onChange(draft.current);
  }
  function updateDecimal(next: number) {
    const whole = Math.floor(scoreFrom(draft.current) ?? 0);
    // Both columns can settle in one pointer event, before React propagates the
    // new disabled prop. The latest shared draft must still enforce 10.0.
    if (whole === 10) return;
    draft.current = `${whole}.${next}`; onChange(draft.current);
  }
  return <div className="score-picker" role="group" aria-label={label}>
    <ScoreWheel value={integer} maximum={10} label={`${label}整数`} disabled={disabled} onChange={updateWhole} />
    <span className="score-picker-dot" aria-hidden="true">.</span>
    <ScoreWheel value={integer === 10 ? 0 : decimal} maximum={9} label={`${label}小数`} disabled={disabled || integer === 10} onChange={updateDecimal} />
    <span className="score-picker-unit" aria-hidden="true">分</span>
  </div>;
}

interface WheelProps { value: number | null; maximum: number; label: string; disabled: boolean; onChange: (value: number) => void }
function ScoreWheel({ value, maximum, label, disabled, onChange }: WheelProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const current = useRef({ value, disabled, onChange });
  current.current = { value, disabled, onChange };
  const lastSent = useRef<number | null>(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const programmatic = useRef(false);
  const frames = useRef<number[]>([]);
  const drag = useRef<{ id: number; y: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  function select(next: number) {
    if (current.current.disabled) return;
    const bounded = Math.max(0, Math.min(maximum, next));
    if (lastSent.current !== bounded) { lastSent.current = bounded; current.current.onChange(bounded); }
  }
  function settle() {
    if (!viewport.current || programmatic.current || current.current.disabled) return;
    if (timer.current) clearTimeout(timer.current);
    const index = Math.round(viewport.current.scrollTop / ROW_HEIGHT);
    // The blank row is display-only; returning to it does not silently erase a score.
    if (index > 0) { select(index - 1); synchronize(index - 1); }
    else synchronize(current.current.value);
  }
  function synchronize(next: number | null) {
    const element = viewport.current; if (!element) return;
    if (timer.current) clearTimeout(timer.current);
    for (const frame of frames.current) cancelAnimationFrame(frame);
    frames.current = [];
    programmatic.current = true;
    element.scrollTop = next === null ? 0 : (next + 1) * ROW_HEIGHT;
    frames.current.push(requestAnimationFrame(() => {
      frames.current.push(requestAnimationFrame(() => { programmatic.current = false; }));
    }));
  }
  useEffect(() => { lastSent.current = value; synchronize(value); }, [value]);
  useEffect(() => {
    // Wheel scrolling needn't focus the column. Commit its visible draft before
    // an outside Save click, as well as on Tab/blur, and stop residual inertia.
    const flush = (event: globalThis.PointerEvent) => { if (!viewport.current?.contains(event.target as Node)) settle(); };
    document.addEventListener('pointerdown', flush, true);
    return () => document.removeEventListener('pointerdown', flush, true);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    for (const frame of frames.current) cancelAnimationFrame(frame);
  }, []);
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    let next: number;
    if (event.key === 'ArrowUp') next = value === null ? 0 : value + 1;
    else if (event.key === 'ArrowDown') next = value === null ? 0 : value - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = maximum;
    else return;
    event.preventDefault(); event.stopPropagation(); select(next);
    synchronize(Math.max(0, Math.min(maximum, next)));
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    programmatic.current = false;
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    drag.current = { id: event.pointerId, y: event.clientY, top: event.currentTarget.scrollTop, moved: false };
    event.currentTarget.focus({ preventScroll: true });
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current; if (!active || active.id !== event.pointerId || disabled) return;
    const delta = active.y - event.clientY;
    if (!active.moved && Math.abs(delta) > 3) { active.moved = true; event.currentTarget.setPointerCapture(event.pointerId); }
    if (active.moved) { event.preventDefault(); event.currentTarget.scrollTop = active.top + delta; }
  }
  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current; if (!active || active.id !== event.pointerId) return;
    suppressClick.current = active.moved; drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (active.moved) { settle(); requestAnimationFrame(() => { suppressClick.current = false; }); }
  }
  return <div className={`score-picker-column ${disabled ? 'is-disabled' : ''}`}>
    <div ref={viewport} className="score-picker-wheel" role="spinbutton" tabIndex={disabled ? -1 : 0}
      aria-label={label} aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={value ?? undefined}
      aria-valuetext={value === null ? '未评分' : String(value)} aria-disabled={disabled}
      onKeyDown={keyDown} onBlur={settle} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd}
      onPointerCancel={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerLeave={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) drag.current = null; }}
      onWheel={() => { programmatic.current = false; }}
      onScroll={() => { if (programmatic.current || disabled) return; if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(settle, 120); }}>
      <span className={`score-picker-number ${value === null ? 'is-selected' : ''}`} aria-hidden="true">—</span>
      {Array.from({ length: maximum + 1 }, (_, number) => <span key={number}
        className={`score-picker-number ${value === number ? 'is-selected' : ''}`} aria-hidden="true"
        onClick={() => { if (!suppressClick.current && !disabled) { select(number); synchronize(number); } }}>{number}</span>)}
    </div>
  </div>;
}
