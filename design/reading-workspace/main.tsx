import { useReducer, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen, CalendarDays, Gamepad2, Clapperboard, Search, RotateCcw, X } from 'lucide-react';
import { reducer, CATEGORY_LABELS, type Activity, type Category } from './model';
import { createSeed, PREVIEW_TODAY } from './seed';
import { Dialog, Cover } from './ui';
import { CalendarView } from './CalendarView';
import { ActivityForm } from './ActivityForm';
import { BooksView } from './BooksView';
import { BookDetail } from './BookDetail';
import './workspace.css';
import './calendar.css';
import './books.css';

function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createSeed);
  const [route, setRoute] = useState<'calendar' | 'books'>('calendar');
  const [query, setQuery] = useState(''), [date, setDate] = useState(PREVIEW_TODAY);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<{ initial?: Activity; workId?: string; date: string } | null>(null);
  const selected = state.works.find(work => work.id === selectedId);
  const common = {
    state, dispatch, query, today: PREVIEW_TODAY, openWork: (id: string) => setSelectedId(id),
    logReading: (workId?: string, day = PREVIEW_TODAY) => setForm({ workId, date: day }),
    openDay: (day: string) => { setQuery(''); setDate(day); setFilter('book'); setRoute('calendar'); },
  };
  function navigate(next: 'calendar' | 'books', category: Category | 'all' = 'all') { setRoute(next); setFilter(category); setQuery(''); }
  return <div className="rw-app">
    <div className="rw-ambient" aria-hidden="true"/><a className="rw-skip" href="#reading-content">跳到内容</a>
    <div className="rw-brand" aria-label="栖域"><span>栖</span><strong>栖域<small>ROOST</small></strong></div>
    <aside className="rw-dock" aria-label="主导航">
      <button aria-label="日历首页" className={route === 'calendar' && filter === 'all' ? 'is-active' : ''} onClick={() => navigate('calendar')} title="日历首页"><CalendarDays size={21}/></button>
      <button aria-label="书籍" className={route === 'books' ? 'is-active' : ''} onClick={() => navigate('books')} title="书籍"><BookOpen size={21}/></button>
      <span className="rw-dock-divider"/>
      {([{ id: 'game', icon: Gamepad2 }, { id: 'screen', icon: Clapperboard }] as const).map(entry => { const Icon = entry.icon; return <button key={entry.id} aria-label={`${CATEGORY_LABELS[entry.id]}记录`} title={`${CATEGORY_LABELS[entry.id]}记录`} className={route === 'calendar' && filter === entry.id ? 'is-active' : ''} onClick={() => navigate('calendar', entry.id)}><Icon size={20}/></button>; })}
    </aside>
    <div className="rw-version">v0.4.30<small>设计预览</small></div>
    <div className="rw-shell"><header className="rw-topbar">
      <label className="rw-search"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} aria-label="搜索当前页面" placeholder={route === 'books' ? '搜索书名、作者或感想' : '搜索作品、计划或感受'}/>{query && <button aria-label="清空搜索" onClick={() => setQuery('')}><X size={15}/></button>}</label>
      <span className="rw-demo-marker"><i/>示例数据 · 修改不写入收藏</span>
      <button className="rw-icon-button" aria-label="重置示例" title="重置本次预览" onClick={() => {
        if (window.confirm('恢复示例初始状态？只影响本次预览中的修改。')) { dispatch({ type: 'reset', state: createSeed() }); setQuery(''); setDate(PREVIEW_TODAY); setSelectedId(null); }
      }}><RotateCcw size={17}/></button>
    </header>
    <main id="reading-content" tabIndex={-1}>{route === 'books' ? <BooksView {...common}/> : <CalendarView {...common} date={date} setDate={setDate} filter={filter} setFilter={setFilter} editActivity={entry => setForm({ initial: entry, date: date > PREVIEW_TODAY ? PREVIEW_TODAY : date })}/>}</main></div>
    {selected && (selected.category === 'book' ? <BookDetail {...common} work={selected} onClose={() => setSelectedId(null)}/> : <Dialog title={selected.title} wide onClose={() => setSelectedId(null)}>
      <div className="rw-simple-detail"><Cover work={selected}/><div><span className="rw-eyebrow">{CATEGORY_LABELS[selected.category]} · {selected.year}</span><h2>{selected.title}</h2><p>{selected.description}</p><p className="rw-muted">{selected.subtitle}</p><button className="rw-button" onClick={() => setForm({ workId: selected.id, date: PREVIEW_TODAY })}>记录一次体验</button></div></div>
    </Dialog>)}
    {form && <ActivityForm key={`activity-${form.initial?.id || form.workId || 'new'}`} {...common} initial={form.initial} workId={form.workId} date={form.date} onClose={() => setForm(null)}/>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
