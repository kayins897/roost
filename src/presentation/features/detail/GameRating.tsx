import { Bookmark, Sparkles, Star, X } from 'lucide-react';
import { useState } from 'react';
import { coverFinishFor, GAME_GRADES } from '../../../domain/gameRating.ts';
import { COMPLETION_LABELS, completionFor, gradeEditable, priorityEditable } from '../../../domain/gameProgress.ts';
import type { MediaItem } from '../../../domain/types.ts';
import { COVER_FINISH_LABELS } from '../../components/libraryOptions.ts';
import './rating.css';

export function GameRating({ item, locked, onPatch }: { item: MediaItem; locked: boolean; onPatch: (patch: Partial<MediaItem>) => boolean }) {
  const [error, setError] = useState('');
  // v0.4.24：评级资格按通关进度（已通关/不适用可评；未通关但已有历史评级保留编辑）。
  const completion = completionFor(item);
  const editable = gradeEditable(item);
  const canPriority = priorityEditable(item);
  if (!editable && !canPriority) return null;
  const value = item.personalGrade;
  const label = '我的评级';
  function save(next: string) {
    const grade = next === '' ? undefined : next as NonNullable<MediaItem['personalGrade']>;
    if (grade === value) return;
    const patch = { personalGrade: grade, ...(grade !== value ? { ratingOrder: undefined } : {}) };
    setError(onPatch(patch) ? '' : '未能保存，请重试。');
  }
  const finish = coverFinishFor(item);
  function savePriority(next: string) {
    const grade = next === '' ? undefined : next as NonNullable<MediaItem['playPriority']>;
    if (grade === item.playPriority) return;
    setError(onPatch({ playPriority: grade, priorityOrder: undefined }) ? '' : '未能保存，请重试。');
  }
  return <>
    {canPriority && <section className="game-priority" aria-label="待体验优先级"><h3><Bookmark size={15} />待体验优先级</h3><div className="rating-input-row"><select aria-label="待体验优先级" value={item.playPriority ?? ''} disabled={locked} onChange={event => savePriority(event.target.value)}><option value="">未设置</option>{GAME_GRADES.map(grade => <option key={grade} value={grade}>{grade}</option>)}</select>{item.playPriority && !locked && <button className="text-button" onClick={() => savePriority('')} aria-label="清除待体验优先级"><X size={13} />清除</button>}<span className="rating-help">安排下一次体验，与个人评级独立。</span></div></section>}
    {editable && <section className="game-rating" aria-label="个人评级">
    <div className="rating-heading"><h3><Star size={15} />{label}</h3><span className={'rating-finish rating-finish--' + finish}><Sparkles size={13} />{COVER_FINISH_LABELS[finish]}</span></div>
    <div className="rating-input-row"><select aria-label={label} value={value ?? ''} disabled={locked} onChange={event => save(event.target.value)}><option value="">未评级</option>{GAME_GRADES.map(grade => <option key={grade} value={grade}>{grade}</option>)}</select>{value && !locked && <button className="text-button" onClick={() => save('')} aria-label="清除个人评级"><X size={13} />清除</button>}<span className="rating-help">{completion === 'not-applicable' ? `进度为「${COMPLETION_LABELS[completion]}」，仍可记录个人喜好` : completion === 'cleared' ? '仅代表你的个人喜好' : `当前进度「${COMPLETION_LABELS[completion]}」，历史评级保留可编辑`}</span></div>
  </section>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </>;
}
