import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { dailyMinutes, heatLevel, type PreviewState } from './model';

type HeatmapProps = { state: PreviewState; today: string; openDay: (date: string) => void; logReading: (workId?: string, date?: string) => void };
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const RANGES = ['0', '1–14', '15–29', '30–59', '60+'];

export function Heatmap({ state, today, openDay, logReading }: HeatmapProps) {
  const year = Number(today.slice(0, 4));
  const [focused, setFocused] = useState(today);
  const keysHelp = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = scrollRef.current, cell = scroller?.querySelector<HTMLElement>(`[data-date="${today}"]`);
    if (scroller && cell && scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft += cell.getBoundingClientRect().right - scroller.getBoundingClientRect().right + 50;
  }, [today]);
  const { days, offset, columns, months } = useMemo(() => {
    const start = new Date(Date.UTC(year, 0, 1));
    const count = (Date.UTC(year + 1, 0, 1) - start.getTime()) / 86400000;
    const offset = (start.getUTCDay() + 6) % 7;
    const days = Array.from({ length: count }, (_, index) => new Date(Date.UTC(year, 0, index + 1)).toISOString().slice(0, 10));
    const months = Array.from({ length: 12 }, (_, month) => ({ month: month + 1, column: Math.floor((offset + (Date.UTC(year, month, 1) - start.getTime()) / 86400000) / 7) + 1 }));
    return { days, offset, columns: Math.ceil((offset + count) / 7), months };
  }, [year]);
  function dayInfo(date: string) {
    const records = state.activities.filter(activity => activity.kind === 'reading' && activity.date === date && state.works.some(work => work.id === activity.workId && work.category === 'book'));
    const minutes = dailyMinutes(state, date);
    const titles = [...new Set(records.map(record => state.works.find(work => work.id === record.workId)?.title).filter(Boolean))];
    const unknown = records.some(record => record.minutes === undefined);
    const label = minutes === undefined ? records.length ? '有阅读记录，时长未记录' : '未记录' : `${minutes} 分钟${unknown ? '，另有时长未知的记录' : ''}`;
    return { minutes, unknown, records, label, titles };
  }
  const selected = dayInfo(focused);
  return <section className="rw-card bk-heatmap" aria-labelledby="bk-heatmap-title">
    <header className="bk-section-heading"><div><p className="bk-eyebrow">READING DAYS · {year}</p><h2 id="bk-heatmap-title">阅读的痕迹</h2></div><button className="rw-button" onClick={() => logReading(undefined, today)}><Plus size={16}/>登记阅读</button></header>
    <p id={keysHelp} className="bk-sr-only">方向键选择日期，上下切换一天，左右切换一周，回车打开日历。</p>
    <div className="bk-heat-scroll" ref={scrollRef} role="group" aria-label={`${year} 年每日阅读时长`} aria-describedby={keysHelp}>
      <div className="bk-heat-canvas" style={{ '--bk-heat-columns': columns } as CSSProperties}>
        <div className="bk-heat-months" aria-hidden="true">{months.map(month => <span key={month.month} style={{ gridColumn: month.column }}>{month.month}月</span>)}</div>
        <div className="bk-heat-weekdays" aria-hidden="true">{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div>
        <div className="bk-heat-days">
          {Array.from({ length: offset }, (_, index) => <span className="bk-heat-padding" aria-hidden="true" key={`pad-${index}`}/>)}
          {days.map(date => {
            const info = dayInfo(date), future = date > today;
            const label = `${date} · ${future ? '未来日期' : info.label}${info.titles.length ? ` · ${info.titles.join('、')}` : ''}`;
            return <button key={date} type="button" className="bk-heat-day" data-date={date} data-level={heatLevel(info.minutes)} data-known={info.minutes !== undefined} data-unknown={info.unknown} data-today={date === today} aria-label={label} title={label} disabled={future} tabIndex={date === focused ? 0 : -1} onMouseEnter={() => !future && setFocused(date)} onFocus={() => setFocused(date)} onKeyDown={event => {
              const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' ? -7 : event.key === 'ArrowRight' ? 7 : 0;
              if (!delta) return;
              event.preventDefault();
              const at = days.indexOf(date), next = days[Math.max(0, Math.min(days.indexOf(today), at + delta))];
              setFocused(next);
              event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus();
            }} onClick={() => openDay(date)}/>;
          })}
        </div>
      </div>
    </div>
    <div className="bk-heat-footer">
      <button className="bk-heat-summary" onClick={() => openDay(focused)} aria-label={`在日历查看 ${focused}`}><span>{focused.replaceAll('-', '.')}</span><strong>{selected.label}</strong><ArrowUpRight size={15}/></button>
      <div className="bk-heat-legend" aria-label="预览色阶，单位分钟"><span className="bk-legend-item"><i className="bk-heat-key"/>未记录</span>{RANGES.map((range, index) => <span className="bk-legend-item" key={range}><i className="bk-heat-key" data-level={index} data-known="true"/>{range}</span>)}<span>分钟</span></div>
    </div>
    <p className="bk-heat-note rw-muted">未记录不代表 0 分钟。仅汇总实际阅读，计划不计入热度；色阶为预览建议。</p>
  </section>;
}
