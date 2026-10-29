import { t } from '../../i18n/index.ts';
import { ChevronDown } from 'lucide-react';
import { useId, useRef, useState } from 'react';

interface Props<T extends string> {
  label: string;
  value: string;
  currentLabel: string;
  options: readonly T[];
  labels: Record<T, string>;
  className: string;
  tone?: string;
  locked: boolean;
  isCurrentExplicit?: boolean;
  onChange: (value: T) => boolean;
}

/** A local disclosure: selecting saves through the existing patch action. */
export function GameExperiencePicker<T extends string>({ label, value, currentLabel, options, labels, className, tone, locked, isCurrentExplicit = true, onChange }: Props<T>) {
  const [open, setOpen] = useState(false), [error, setError] = useState('');
  const id = useId(), trigger = useRef<HTMLButtonElement>(null);
  function choose(next: T) {
    if ((next !== value || !isCurrentExplicit) && !onChange(next)) { setError('未能保存，请重试。'); return; }
    setError(''); setOpen(false); trigger.current?.focus();
  }
  return <div className={`experience-picker ${className}`} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} className={`experience-current ${tone ?? ''}`} aria-label={t("更改{0}", [t(label)])} aria-expanded={open} aria-controls={id} disabled={locked} onClick={() => setOpen(current => !current)}>
      <span className="experience-current-label">{t(label)}</span><strong>{t(currentLabel)}</strong>{!locked && <ChevronDown size={16} aria-hidden="true" />}
    </button>
    <div id={id} className={`detail-statuses ${className === 'engagement-picker' ? 'game-state-options' : 'completion-options'}`} aria-label={t(label)} hidden={!open}>
      {options.map(next => <button key={next} className={`status-option ${className === 'engagement-picker' ? `experience-color--${next}` : ''} ${next === value ? 'is-selected' : ''}`} aria-pressed={next === value} onClick={() => choose(next)}>{t(labels[next])}</button>)}
    </div>
    {error && <p className="form-error" role="alert">{t(error)}</p>}
  </div>;
}
