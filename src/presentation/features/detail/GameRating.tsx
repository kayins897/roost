import { Bookmark, Sparkles, Star, X } from 'lucide-react';
import { useState } from 'react';
import { coverFinishFor, GAME_GRADES } from '../../../domain/gameRating.ts';
import { gamePlayStateFor } from '../../../domain/library.ts';
import type { MediaItem } from '../../../domain/types.ts';
import { COVER_FINISH_LABELS } from '../../components/libraryOptions.ts';
import './rating.css';

export function GameRating({ item, locked, onPatch }: { item: MediaItem; locked: boolean; onPatch: (patch: Partial<MediaItem>) => boolean }) {
  const [error, setError] = useState('');
  const state = gamePlayStateFor(item), planned = state === 'want', completed = state === 'cleared';
  if (!planned && !completed) return item.personalGrade ? <p className="rating-help">已保留通关评级 {item.personalGrade}，标回已通关后可编辑。</p> : null;
  const value = planned ? item.playPriority : item.personalGrade;
  const label = planned ? '待体验优先级' : '我的评级';
  function save(next: string) {
    const grade = next === '' ? undefined : next as NonNullable<MediaItem['personalGrade']>;
    const patch = planned ? { playPriority: grade, ...(grade !== value ? { priorityOrder: undefined } : {}) } : { personalGrade: grade, ...(grade !== value ? { ratingOrder: undefined } : {}) };
    setError(onPatch(patch) ? '' : '未能保存，请重试。');
  }
  const finish = coverFinishFor(item);
  return <section className="game-rating" aria-label={planned ? '待体验优先级' : '个人评级'}>
    <div className="rating-heading"><h3>{planned ? <Bookmark size={15} /> : <Star size={15} />}{label}</h3>{!planned && <span className={'rating-finish rating-finish--' + finish}><Sparkles size={13} />{COVER_FINISH_LABELS[finish]}</span>}</div>
    <div className="rating-input-row"><select aria-label={label} value={value ?? ''} disabled={locked} onChange={event => save(event.target.value)}><option value="">{planned ? '未设置优先级' : '未评级'}</option>{GAME_GRADES.map(grade => <option key={grade} value={grade}>{grade}</option>)}</select>{value && !locked && <button className="text-button" onClick={() => save('')} aria-label={planned ? '清除待体验优先级' : '清除个人评级'}><X size={13} />清除</button>}<span className="rating-help">{planned ? 'SSS 最高，C 最低；与你通关后的评级分开' : '仅代表你的个人喜好'}</span></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
