import { gamePlayStateFor } from '../../../domain/library.ts';
import { GAME_GRADES } from '../../../domain/gameRating.ts';
import { useState } from 'react';
import type { MediaItem, PersonalGrade } from '../../../domain/types.ts';

// 多选工具栏的等级快捷设置：全部待体验→优先级、全部已通关→评级；
// 混合状态提示改用「改状态」。选择候选只预览将更新数量，应用才写入。
export function BulkGradeBar({ selectedGames, onApply }: { selectedGames: MediaItem[]; onApply: (mode: 'priority' | 'rating', value: PersonalGrade | undefined) => boolean }) {
  const [grade, setGrade] = useState<PersonalGrade | 'clear' | ''>('');
  if (!selectedGames.length) return null;
  const allWant = selectedGames.every(item => gamePlayStateFor(item) === 'want');
  const allCleared = selectedGames.every(item => gamePlayStateFor(item) === 'cleared');
  if (!allWant && !allCleared) return <span className="bulk-grade-hint">所选游戏状态不一致，等级快捷设置不可用；可先用「改状态」统一。</span>;
  const mode: 'priority' | 'rating' = allWant ? 'priority' : 'rating';
  const label = allWant ? '待体验优先级' : '通关评级';
  const key = allWant ? 'playPriority' : 'personalGrade';
  const next = grade === 'clear' ? undefined : grade || undefined;
  const willChange = grade === '' ? -1 : selectedGames.filter(item => item[key] !== next).length;
  return <span className="bulk-grade-bar">
    <label className="bulk-grade-field">统一{label}
      <select aria-label={`统一${label}`} value={grade} onChange={event => setGrade(event.target.value as PersonalGrade | 'clear' | '')}>
        <option value="">选择…</option>
        {GAME_GRADES.map(value => <option key={value} value={value}>{value}</option>)}
        <option value="clear">清除{label}</option>
      </select>
    </label>
    {grade !== '' && <small className="bulk-grade-count">{willChange ? `将更新 ${willChange} 款（共 ${selectedGames.length} 款）` : `所选 ${selectedGames.length} 款已是该等级`}</small>}
    <button className="button button--secondary" disabled={grade === '' || !willChange} onClick={() => { if (onApply(mode, next)) setGrade(''); }}>{willChange ? '应用等级' : '应用'}</button>
  </span>;
}
