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
  return <section className="books-heatmap books-surface" aria-label="阅读热力表"><header>
    <button className="books-heatmap-toggle" aria-expanded={expanded} aria-controls="books-heatmap-content" onClick={() => setExpanded(value => !value)}><strong>阅读足迹</strong><ChevronDown size={15} className={expanded ? '' : 'is-collapsed'}/></button><span className="books-muted">累计已读 {summary.books} 本 · {formatMinutes(summary.minutes)}{summary.unknownCount > 0 && ` · ${summary.unknownCount} 条时长未记录`}</span>
    <button className="button button--secondary" disabled={disabled || !books.length} onClick={() => onRecord(selected)}><Plus size={14}/>记录阅读</button>
  </header>{expanded && <div id="books-heatmap-content"><div className="books-heatmap-year"><button className="icon-button" aria-label="上一年" disabled={year <= 1900} onClick={() => changeYear(year - 1)}><ChevronLeft size={15}/></button><strong>{year} 年</strong><button className="icon-button" aria-label="下一年" disabled={year >= 2200} onClick={() => changeYear(year + 1)}><ChevronRight size={15}/></button><span className="books-muted">{activeDays} 天留下记录</span></div>
    <div className="books-heatmap-scroll"><div className="books-heatmap-months">{Array.from({ length: 12 }, (_, month) => <span key={month}>{month + 1} 月</span>)}</div><div className="books-heatmap-grid">{Array.from({ length: offset }, (_, index) => <span key={`blank${index}`} aria-hidden="true"/>)}{days.map(day => {
      const level = day.minutes === undefined || day.minutes === 0 ? 0 : day.minutes < 30 ? 1 : day.minutes < 60 ? 2 : day.minutes < 120 ? 3 : 4;
      return <button key={day.date} className={`books-heatmap-day ${selected === day.date ? 'is-selected' : ''}`} data-level={level} data-unknown={day.unknown || undefined} aria-pressed={selected === day.date} aria-label={`${day.date}，${day.hasRecords ? formatMinutes(day.minutes) : '没有阅读记录'}${day.unknown ? '，另有未记录时长' : ''}`} title={`${day.date} · ${day.hasRecords ? formatMinutes(day.minutes) : '无记录'}`} onClick={() => setSelected(day.date)}/>;
    })}</div></div><footer><span>{selected} · {selectedDay.hasRecords ? formatMinutes(selectedDay.minutes) : '无阅读记录'}{selectedDay.unknown && '（有未记录时长）'}</span><span className="books-heatmap-legend">少{[0, 1, 2, 3, 4].map(level => <i key={level} data-level={level}/>)}多 · 虚线：时长未知</span></footer>{selectedEntries.length > 0 && <div className="books-day-entries" aria-label={`${selected}阅读记录`}>{selectedEntries.map(({ book, entry }) => <button key={`${book.id}-${entry.id}`} disabled={disabled} onClick={() => onEditEntry(book.id, entry)}><strong>{book.title}</strong><span>{entry.note || '阅读记录'}</span><small>{formatMinutes(entry.minutes)}</small></button>)}</div>}</div>}</section>;
}
