import { t } from '../../i18n/index.ts';
import { ArrowDown, ArrowUp, SlidersHorizontal } from 'lucide-react';
import type { LibrarySort, SortDirection } from '../../../domain/librarySort.ts';
import './sort-controls.css';

export function SortControls({ value, direction, game, rating, onChange, onToggleDirection }: { value: LibrarySort; direction: SortDirection; game: boolean; rating: boolean; onChange: (value: LibrarySort) => void; onToggleDirection: () => void }) {
  const ascending = direction === 'asc', Icon = ascending ? ArrowUp : ArrowDown;
  return <div className="sort-controls">
    <label className="sort-box sort-controls__field"><SlidersHorizontal size={16} aria-hidden="true" /><select aria-label={t("排序方式")} value={value} onChange={event => onChange(event.target.value as LibrarySort)}>{game && <option value="rank">{rating ? t('评分') : t('优先级')}</option>}<option value="recent">{t("收录时间")}</option><option value="title">{t("名称")}</option><option value="year">{t("年份")}</option>{game && <option value="playtime">{t("游玩时长")}</option>}</select></label>
    <button type="button" className="button button--secondary sort-controls__direction" aria-label={t("排序方向：{0}，切换为{1}", [ascending ? '升序' : '降序', ascending ? '降序' : '升序'])} title={ascending ? t('升序，点击切换为降序') : t('降序，点击切换为升序')} onClick={onToggleDirection}><Icon size={15} aria-hidden="true" /><span>{ascending ? t('升序') : t('降序')}</span></button>
  </div>;
}
