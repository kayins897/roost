import { useReducer, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen, HelpCircle, LibraryBig, Plus, RotateCcw, Search, X } from 'lucide-react';
import { reducer } from '../reading-workspace/model';
import { createDeskSeed } from './catalog';
import { DeskDialogs } from './DeskDialogs';
import { PlanShelf } from './PlanShelf';
import { RecordShelf } from './RecordShelf';
import type { DeskDialog, Face, Layout } from './types';
import './desk.css';

function ReadingDesk() {
  const [state, dispatch] = useReducer(reducer, undefined, createDeskSeed);
  const [face, setFace] = useState<Face>('plan');
  const [layouts, setLayouts] = useState<Record<Face, Layout>>({ plan: 'grid', records: 'grid' });
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [dialog, setDialog] = useState<DeskDialog | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const open = (next: DeskDialog) => {
    if (!dialog) trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDialog(next);
  };
  const close = () => { setDialog(null); requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus()); };
  const props = { state, dispatch, open };
  return <div className="rd-app">
    <a className="rd-skip" href="#reading-content">跳到书架</a>
    <div className="rd-brand" aria-label="栖域"><span>栖</span><strong>栖域<small>ROOST</small></strong></div>
    <nav className="rd-dock" aria-label="独立预览导航"><button className="is-active" aria-label="书籍首页" title="书籍首页" onClick={() => { setFace('plan'); setQuery(''); setTag(''); document.querySelector('.rd-shell')?.scrollTo({ top: 0, behavior: 'smooth' }); }}><BookOpen size={21}/></button><button aria-label="主题书单" title="主题书单" onClick={() => open({ kind: 'collection' })}><LibraryBig size={21}/></button><span/><button aria-label="预览说明" title="预览说明" onClick={() => open({ kind: 'info' })}><HelpCircle size={20}/></button></nav>
    <div className="rd-version">v0.4.30<span><i/>独立预览</span></div>
    <div className="rd-shell">
      <header className="rd-topbar"><label className="rd-search"><Search size={17}/><input aria-label="搜索书名、作者、标签或感想" placeholder="搜索书名、作者、标签或感想" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button aria-label="清空搜索" onClick={() => setQuery('')}><X size={15}/></button>}</label><button className="rd-icon rd-reset" aria-label="重置预览" title="重置预览" onClick={() => {
        if (window.confirm('恢复全部示例？本页中的修改将清除，正式收藏不受影响。')) { dispatch({ type: 'reset', state: createDeskSeed() }); setQuery(''); setTag(''); setDialog(null); }
      }}><RotateCcw size={17}/></button></header>
      <main id="reading-content" tabIndex={-1}>
        <header className="rd-page-head"><div><h1>书籍</h1><div className="rd-face-switch" role="group" aria-label="书籍页面">{(['plan', 'records'] as const).map(value => <button key={value} aria-pressed={face === value} onClick={() => setFace(value)}>{value === 'plan' ? '阅读计划' : '阅读记录'}</button>)}</div></div><button className="rd-button rd-button--primary rd-add" onClick={() => open({ kind: face === 'plan' ? 'plan' : 'round' })}><Plus size={17}/>{face === 'plan' ? '加入计划' : '补录已读'}</button></header>
        {face === 'plan' ? <PlanShelf {...props} query={query} layout={layouts.plan} setLayout={layout => setLayouts(previous => ({ ...previous, plan: layout }))}/> : <RecordShelf {...props} query={query} tag={tag} setTag={setTag} layout={layouts.records} setLayout={layout => setLayouts(previous => ({ ...previous, records: layout }))}/>}
      </main>
    </div>
    {dialog && <DeskDialogs {...props} key={dialog.kind} dialog={dialog} onClose={close}/>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<ReadingDesk/>);
