import { ArrowDown, ArrowUp, SlidersHorizontal } from 'lucide-react';
import type { LibrarySort, SortDirection } from '../../../domain/librarySort.ts';
import './sort-controls.css';

export function SortControls({ value, direction, game, rating, onChange, onToggleDirection }: { value: LibrarySort; direction: SortDirection; game: boolean; rating: boolean; onChange: (value: LibrarySort) => void; onToggleDirection: () => void }) {
  const ascending = direction === 'asc', Icon = ascending ? ArrowUp : ArrowDown;
  return <div className="sort-controls">
    <label className="sort-box sort-controls__field"><SlidersHorizontal size={16} aria-hidden="true" /><select aria-label="排序方式" value={value} onChange={event => onChange(event.target.value as LibrarySort)}>{game && <option value="rank">{rating ? '评级' : '优先级'}</option>}<option value="recent">收录时间</option><option value="title">名称</option><option value="year">年份</option>{game && <option value="playtime">游玩时长</option>}</select></label>
    <button type="button" className="button button--secondary sort-controls__direction" aria-label={`排序方向：${ascending ? '升序' : '降序'}，切换为${ascending ? '降序' : '升序'}`} title={ascending ? '升序，点击切换为降序' : '降序，点击切换为升序'} onClick={onToggleDirection}><Icon size={15} aria-hidden="true" /><span>{ascending ? '升序' : '降序'}</span></button>
  </div>;
}
