import { ArrowDown, ArrowUp, BookOpen, Check, ChevronDown, SlidersHorizontal } from 'lucide-react';
import type { Dispatch } from 'react';
import { useEffect, useRef } from 'react';
import type { LibraryView, Sort, ViewAction } from './library-view';
import { ViewToggle } from './ViewToggle';

export function LibraryToolbar({ view, change, count, readingCount }: { view: LibraryView; change: Dispatch<ViewAction>; count: number; readingCount: number }) {
  const sort = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => { if (event.target instanceof Node && !sort.current?.contains(event.target)) sort.current?.removeAttribute('open'); };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  const choices: { value: Sort; label: string }[] = [{ value: 'order', label: view.face === 'plan' ? '计划顺序' : '阅读时间' }, { value: 'name', label: '名称' }, { value: 'year', label: '年份' }];
  return <div className="rd-library-toolbar">
    <div className="rd-library-topline"><span className="rd-result-count" aria-live="polite">显示 {count} 本书</span>
      <div className="rd-library-tools">
        <details ref={sort} className="rd-sort" onKeyDown={event => { if (event.key === 'Escape') { sort.current?.removeAttribute('open'); sort.current?.querySelector('summary')?.focus(); } }}><summary aria-label="排序方式"><SlidersHorizontal size={14}/>{choices.find(choice => choice.value === view.sort)?.label}<ChevronDown size={13}/></summary><div className="rd-sort-menu" role="group" aria-label="书籍排序">{choices.map(choice => <button key={choice.value} aria-pressed={view.sort === choice.value} onClick={event => { change({ type: 'sort', sort: choice.value }); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{choice.label}{view.sort === choice.value && <Check size={13}/>}</button>)}</div></details>
        <button className="rd-direction" aria-label="切换排序方向" title="切换排序方向" onClick={() => change({ type: 'direction' })}>{view.ascending ? <ArrowUp size={14}/> : <ArrowDown size={14}/>}<span>{view.face === 'records' && view.sort === 'order' ? view.ascending ? '最近' : '最早' : view.ascending ? '正序' : '倒序'}</span></button>
        <ViewToggle label={view.face === 'plan' ? '阅读计划' : '阅读记录'} value={view.layouts[view.face]} onChange={layout => change({ type: 'layout', layout })}/>
      </div>
    </div>
    <div className="rd-library-filters"><div className="rd-face-switch" role="group" aria-label="书籍页面">{(['plan', 'records'] as const).map(face => <button key={face} aria-pressed={view.face === face} onClick={() => change({ type: 'face', face })}>{face === 'plan' ? '想读' : '读过'}</button>)}</div>
      <div className="rd-reading-filter"><button aria-label="只看在读" aria-pressed={view.readingOnly} onClick={() => change({ type: 'reading' })}><BookOpen size={14}/>在读<span>{readingCount}</span></button></div>
    </div>
  </div>;
}
