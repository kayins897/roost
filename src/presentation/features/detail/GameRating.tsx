import { Bookmark, Sparkles, Star, X } from 'lucide-react';
import { useState } from 'react';
import { coverFinishFor, GAME_GRADES } from '../../../domain/gameRating.ts';
import { gradeEditable, priorityEditable } from '../../../domain/gameProgress.ts';
import type { MediaItem } from '../../../domain/types.ts';
import { COVER_FINISH_LABELS } from '../../components/libraryOptions.ts';
import './rating.css';

export function GameRating({ item, locked, onPatch }: { item: MediaItem; locked: boolean; onPatch: (patch: Partial<MediaItem>) => boolean }) {
  const [error, setError] = useState('');
  // 分类决定入口；优先级与通关评级独立保存，新游戏+同时展示两项。
  const editable = gradeEditable(item);
  const canPriority = priorityEditable(item);
  if (!editable && !canPriority) return null;
  const value = item.personalGrade;
  const label = '通关评级';
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
    {canPriority && <section className="game-priority" aria-label="游玩优先级"><h3><Bookmark size={15} />游玩优先级</h3><div className="rating-input-row"><select aria-label="游玩优先级" value={item.playPriority ?? ''} disabled={locked} onChange={event => savePriority(event.target.value)}><option value="">未设置</option>{GAME_GRADES.map(grade => <option key={grade} value={grade}>{grade}</option>)}</select>{item.playPriority && !locked && <button className="text-button" onClick={() => savePriority('')} aria-label="清除游玩优先级"><X size={13} />清除</button>}<span className="rating-help">安排下一次体验，与个人评级独立。</span></div></section>}
    {editable && <section className="game-rating" aria-label="个人评级">
    <div className="rating-heading"><h3><Star size={15} />{label}</h3><span className={'rating-finish rating-finish--' + finish}><Sparkles size={13} />{COVER_FINISH_LABELS[finish]}</span></div>
    <div className="rating-input-row"><select aria-label={label} value={value ?? ''} disabled={locked} onChange={event => save(event.target.value)}><option value="">未评级</option>{GAME_GRADES.map(grade => <option key={grade} value={grade}>{grade}</option>)}</select>{value && !locked && <button className="text-button" onClick={() => save('')} aria-label="清除个人评级"><X size={13} />清除</button>}<span className="rating-help">仅代表你的个人喜好</span></div>
  </section>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </>;
}
