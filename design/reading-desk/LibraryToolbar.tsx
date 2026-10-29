import { ArrowDown, ArrowUp, Check, ChevronDown, SlidersHorizontal } from 'lucide-react';
import type { Dispatch, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import type { LibraryView, Sort, ViewAction } from './library-view';
import { ViewToggle } from './ViewToggle';
import { FACES, type Face } from './types';

export function LibraryToolbar({ view, change, count, counts, filters }: { view: LibraryView; change: Dispatch<ViewAction>; count: number; counts: Record<Face, number>; filters: ReactNode }) {
  const sort = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => { if (event.target instanceof Node && !sort.current?.contains(event.target)) sort.current?.removeAttribute('open'); };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  const choices: { value: Sort; label: string }[] = [{ value: 'order', label: view.face === 'records' ? '阅读时间' : '书架顺序' }, { value: 'name', label: '名称' }, { value: 'year', label: '年份' }];
  return <div className="rd-library-toolbar">
    <div className="rd-library-topline"><span className="rd-result-count" aria-live="polite">显示 {count} 本书</span>
      <div className="rd-library-tools">
        {filters}
        <details ref={sort} className="rd-sort" onKeyDown={event => { if (event.key === 'Escape') { sort.current?.removeAttribute('open'); sort.current?.querySelector('summary')?.focus(); } }}><summary aria-label="排序方式"><SlidersHorizontal size={14}/>{choices.find(choice => choice.value === view.sort)?.label}<ChevronDown size={13}/></summary><div className="rd-sort-menu" role="group" aria-label="书籍排序">{choices.map(choice => <button key={choice.value} aria-pressed={view.sort === choice.value} onClick={event => { change({ type: 'sort', sort: choice.value }); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{choice.label}{view.sort === choice.value && <Check size={13}/>}</button>)}</div></details>
        <button className="rd-direction" aria-label="切换排序方向" title="切换排序方向" onClick={() => change({ type: 'direction' })}>{view.ascending ? <ArrowUp size={14}/> : <ArrowDown size={14}/>}<span>{view.face === 'records' && view.sort === 'order' ? view.ascending ? '最近' : '最早' : view.ascending ? '正序' : '倒序'}</span></button>
        <ViewToggle label="书架" value={view.layouts[view.face]} onChange={layout => change({ type: 'layout', layout })}/>
      </div>
    </div>
    <div className="rd-library-filters"><div className="rd-face-switch" role="group" aria-label="书籍页面">{FACES.map(({ id, label }) => <button key={id} aria-label={label} aria-pressed={view.face === id} onClick={() => change({ type: 'face', face: id })}>{label}<small>{counts[id]}</small></button>)}</div>
    </div>
  </div>;
}
