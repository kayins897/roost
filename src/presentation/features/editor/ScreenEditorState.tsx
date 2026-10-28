import { screenHasWatched } from '../../../domain/screens.ts';
import type { MediaItem } from '../../../domain/types.ts';
import { screenEditorOptions, type ScreenEditorState as State } from './screenEditor.ts';

export function ScreenEditorState({ value, subcategory, initial, date, onChange, onDate }: { value: State; subcategory: string; initial?: MediaItem; date: string; onChange: (value: State) => void; onDate: (value: string) => void }) {
  const options = screenEditorOptions(subcategory), shown = options.some(([id]) => id === value) ? value : 'want';
  return <>
    <label className="form-field">观看安排<select aria-label="观看安排" value={shown} onChange={event => onChange(event.target.value as State)}>{options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    {value === 'watched' && (!initial || !screenHasWatched(initial)) && <label className="form-field">看完日期 <span className="field-note">可留空</span><input aria-label="看完日期" value={date} onChange={event => onDate(event.target.value)} placeholder="年、年月或年月日"/></label>}
  </>;
}
