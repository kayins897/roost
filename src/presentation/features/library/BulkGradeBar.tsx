import { gradeEditable, priorityEditable } from '../../../domain/gameProgress.ts';
import { GAME_GRADES } from '../../../domain/gameRating.ts';
import { useState } from 'react';
import type { MediaItem, PersonalGrade } from '../../../domain/types.ts';

// 多选工具栏的等级快捷设置：全部待体验→优先级、全部已通关→评级；
// 混合状态提示改用「改状态」。选择候选只预览将更新数量，应用才写入。
export function BulkGradeBar({ selectedGames, onApply }: { selectedGames: MediaItem[]; onApply: (mode: 'priority' | 'rating', value: PersonalGrade | undefined) => boolean }) {
  const [grade, setGrade] = useState<PersonalGrade | 'clear' | ''>('');
  if (!selectedGames.length) return null;
  const allPlanned = selectedGames.every(item => priorityEditable(item));
  const allGraded = selectedGames.every(item => gradeEditable(item));
  if (!allPlanned && !allGraded) return <span className="bulk-grade-hint">所选游戏的等级资格不一致，快捷设置不可用；可用「改状态/进度」调整或单独编辑。</span>;
  const mode: 'priority' | 'rating' = allPlanned ? 'priority' : 'rating';
  const label = allPlanned ? '待体验优先级' : '通关评级';
  const key = allPlanned ? 'playPriority' : 'personalGrade';
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
