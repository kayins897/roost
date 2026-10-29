import { uiLocale, t } from '../../i18n/index.ts';
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { bookDailyMinutes, bookReadingSummary } from '../../../domain/books.ts';
import type { ExperienceEntry, MediaItem } from '../../../domain/types.ts';
import { formatMinutes, localDate } from './bookView.ts';

export function BookHeatmap({ books, onRecord, onEditEntry, disabled }: { books: MediaItem[]; onRecord: (date: string) => void; onEditEntry: (id: string, entry: ExperienceEntry) => void; disabled: boolean }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState(localDate());
  const summary = bookReadingSummary(books);
  const days = useMemo(() => {
    const start = new Date(year, 0, 1); const values: { date: string; minutes?: number; hasRecords: boolean; unknown: boolean }[] = [];
    while (start.getFullYear() === year) { const date = localDate(start); values.push({ date, ...bookDailyMinutes(books, date) }); start.setDate(start.getDate() + 1); }
    return values;
  }, [books, year]);
  const offset = (new Date(year, 0, 1).getDay() + 6) % 7;
  const selectedDay = bookDailyMinutes(books, selected);
  const activeDays = days.filter(day => day.hasRecords).length;
  const selectedEntries = books.flatMap(book => (book.experienceEntries ?? []).filter(entry => entry.date === selected).map(entry => ({ book, entry })));
  function changeYear(value: number) { if (value < 1900 || value > 2200) return; setYear(value); setSelected(value === new Date().getFullYear() ? localDate() : `${value}-01-01`); }
  return <section className="books-heatmap books-surface" aria-label={t("阅读热力表")}><header>
    <button className="books-heatmap-toggle" aria-expanded={expanded} aria-controls="books-heatmap-content" onClick={() => setExpanded(value => !value)}><strong>{t("阅读足迹")}</strong><ChevronDown size={15} className={expanded ? '' : 'is-collapsed'}/></button><span className="books-muted">{t("累计已读")}{" "}{summary.books} {" "}{t("本 ·")}{" "}{t(formatMinutes(summary.minutes))}{summary.unknownCount > 0 && t(" · {0} 条时长未记录", [summary.unknownCount])}</span>
    <button className="button button--secondary" disabled={disabled || !books.length} onClick={() => onRecord(selected)}><Plus size={14}/>{t("记录阅读")}</button>
  </header>{expanded && <div id="books-heatmap-content"><div className="books-heatmap-year"><button className="icon-button" aria-label={t("上一年")} disabled={year <= 1900} onClick={() => changeYear(year - 1)}><ChevronLeft size={15}/></button><strong>{year} {" "}{t("年")}</strong><button className="icon-button" aria-label={t("下一年")} disabled={year >= 2200} onClick={() => changeYear(year + 1)}><ChevronRight size={15}/></button><span className="books-muted">{activeDays} {" "}{t("天留下记录")}</span></div>
    <div className="books-heatmap-scroll"><div className="books-heatmap-months">{Array.from({ length: 12 }, (_, month) => <span key={month}>{new Date(year, month, 1).toLocaleDateString(uiLocale(), { month: 'short' })}</span>)}</div><div className="books-heatmap-grid">{Array.from({ length: offset }, (_, index) => <span key={`blank${index}`} aria-hidden="true"/>)}{days.map(day => {
      const level = day.minutes === undefined || day.minutes === 0 ? 0 : day.minutes < 30 ? 1 : day.minutes < 60 ? 2 : day.minutes < 120 ? 3 : 4;
      return <button key={day.date} className={`books-heatmap-day ${selected === day.date ? 'is-selected' : ''}`} data-level={level} data-unknown={day.unknown || undefined} aria-pressed={selected === day.date} aria-label={t("{0}，{1}{2}", [day.date, day.hasRecords ? formatMinutes(day.minutes) : '没有阅读记录', day.unknown ? '，另有未记录时长' : ''])} title={t("{0} · {1}", [day.date, day.hasRecords ? formatMinutes(day.minutes) : '无记录'])} onClick={() => setSelected(day.date)}/>;
    })}</div></div><footer><span>{selected} · {selectedDay.hasRecords ? formatMinutes(selectedDay.minutes) : t('无阅读记录')}{selectedDay.unknown && t('（有未记录时长）')}</span><span className="books-heatmap-legend">{t("少")}{[0, 1, 2, 3, 4].map(level => <i key={level} data-level={level}/>)}{t("多 · 虚线：时长未知")}</span></footer>{selectedEntries.length > 0 && <div className="books-day-entries" aria-label={t("{0}阅读记录", [selected])}>{selectedEntries.map(({ book, entry }) => <button key={`${book.id}-${entry.id}`} disabled={disabled} onClick={() => onEditEntry(book.id, entry)}><strong>{book.title}</strong><span>{entry.note || t('阅读记录')}</span><small>{t(formatMinutes(entry.minutes))}</small></button>)}</div>}</div>}</section>;
}
