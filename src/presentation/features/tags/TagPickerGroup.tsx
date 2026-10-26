import { Check } from 'lucide-react';
import { useId } from 'react';
import { normalizeTags } from '../../../domain/library.ts';
import './tag-editor.css';

interface Props {
  label: string;
  value: string;
  available: { name: string; count: number }[];
  onChange: (value: string) => void;
}

/** A draft only: chips and typed names share the same case-insensitive selection. */
export function TagPickerGroup({ label, value, available, onChange }: Props) {
  const id = useId();
  const selected = normalizeTags(value.split(/[,，、\n]+/));
  const keys = new Set(selected.map(name => name.toLocaleLowerCase()));
  const choices = normalizeTags([...available.map(tag => tag.name), ...selected]);
  function toggle(name: string) {
    const key = name.toLocaleLowerCase();
    onChange((keys.has(key) ? selected.filter(tag => tag.toLocaleLowerCase() !== key) : [...selected, name]).join('、'));
  }
  return <section className="tag-picker-group" role="group" aria-label={`${label}标签`}>
    <label className="form-field" htmlFor={id}><span>{label}<small className="tag-picker-count">{selected.length ? `已选 ${selected.length}` : ''}</small></span>
      <input id={id} aria-label={label} value={value} maxLength={4000} placeholder="选择下方标签，或输入新标签" onChange={event => onChange(event.target.value)} />
    </label>
    {choices.length > 0 && <div className="tag-picker-choices" role="group" aria-label={`${label}可选标签`}>{choices.map(name => <button key={name} type="button" className={`tag-filter ${keys.has(name.toLocaleLowerCase()) ? 'is-selected' : ''}`} aria-pressed={keys.has(name.toLocaleLowerCase())} onClick={() => toggle(name)}>{keys.has(name.toLocaleLowerCase()) && <Check size={12} />}{name}</button>)}</div>}
  </section>;
}
