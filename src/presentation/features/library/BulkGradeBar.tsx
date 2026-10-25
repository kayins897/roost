import { gradeEditable, priorityEditable } from '../../../domain/gameProgress.ts';
import { GAME_GRADES } from '../../../domain/gameRating.ts';
import { useState } from 'react';
import type { MediaItem, PersonalGrade } from '../../../domain/types.ts';

// 多选工具栏的等级快捷设置：全部待体验→优先级、全部已通关→评级；
// 混合状态提示改用「改状态」。选择候选只预览将更新数量，应用才写入。
export function BulkGradeBar({ selectedGames, visibleIds, onApply }: { selectedGames: MediaItem[]; visibleIds: ReadonlySet<string>; onApply: (mode: 'priority' | 'rating', value: PersonalGrade | undefined) => boolean }) {
  const [grade, setGrade] = useState<PersonalGrade | 'clear' | ''>('');
  const [chosenMode, setChosenMode] = useState<'priority' | 'rating'>('priority');
  if (!selectedGames.length) return null;
  const allPlanned = selectedGames.every(item => priorityEditable(item));
  const allGraded = selectedGames.every(item => gradeEditable(item));
  const inView = selectedGames.filter(item => visibleIds.has(item.id)).length;
  const outOfView = selectedGames.length - inView;
  const selectionSummary = `已选 ${selectedGames.length} 款：当前结果内 ${inView}、${outOfView} 款在当前结果之外`;
  if (!allPlanned && !allGraded) {
    const anyEligible = selectedGames.some(item => priorityEditable(item) || gradeEditable(item));
    return <span className="bulk-grade-hint">{selectionSummary}；{anyEligible ? '所选游戏的等级资格不一致，快捷设置不可用' : '所选游戏的当前关系/进度不适用等级设置'}；可用「改状态/进度」调整或单独编辑。</span>;
  }
  const mode = allPlanned && allGraded ? chosenMode : allPlanned ? 'priority' : 'rating';
  const label = mode === 'priority' ? '待体验优先级' : '通关评级';
  const key = mode === 'priority' ? 'playPriority' : 'personalGrade';
  const next = grade === 'clear' ? undefined : grade || undefined;
  const willChange = grade === '' ? -1 : selectedGames.filter(item => item[key] !== next).length;
  return <span className="bulk-grade-bar">
    {allPlanned && allGraded && <label className="bulk-grade-field">设置维度<select aria-label="批量等级维度" value={mode} onChange={event => { setChosenMode(event.target.value as 'priority' | 'rating'); setGrade(''); }}><option value="priority">待体验优先级</option><option value="rating">通关评级</option></select></label>}
    <label className="bulk-grade-field">统一{label}
      <select aria-label={`统一${label}`} value={grade} onChange={event => setGrade(event.target.value as PersonalGrade | 'clear' | '')}>
        <option value="">选择…</option>
        {GAME_GRADES.map(value => <option key={value} value={value}>{value}</option>)}
        <option value="clear">清除{label}</option>
      </select>
    </label>
    <small className="bulk-grade-count">{selectionSummary}{grade !== '' ? `；${willChange ? `将更新 ${willChange} 款（共 ${selectedGames.length} 款）` : '所选作品已是该等级'}` : ''}</small>
    <button className="button button--secondary" disabled={grade === '' || !willChange} onClick={() => { if (onApply(mode, next)) setGrade(''); }}>{willChange ? '应用等级' : '应用'}</button>
  </span>;
}
