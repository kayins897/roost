import { t } from '../../i18n/index.ts';
import { bookHasRead } from '../../../domain/books.ts';
import type { MediaItem } from '../../../domain/types.ts';
import type { BookEditorState as State } from './bookEditor.ts';

export function BookEditorState({ value, initial, finishedOn, onChange, onDate }: { value: State; initial?: MediaItem; finishedOn: string; onChange: (value: State) => void; onDate: (value: string) => void }) {
  return <>
    <label className="form-field">{t("阅读安排")}<select aria-label={t("阅读安排")} value={value} onChange={event => onChange(event.target.value as State)}>{([['want', '想读'], ['reading', '在读'], ['records', '已读'], ['idle', '闲置'], ['abandoned', '弃读']] as const).map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}</select></label>
    {value === 'records' && (!initial || !bookHasRead(initial)) && <label className="form-field">{t("读完日期")}{" "}<span className="field-note">{t("可留空")}</span><input value={finishedOn} onChange={event => onDate(event.target.value)} placeholder={t("2026、2026-10 或 2026-10-28")}/></label>}
  </>;
}
