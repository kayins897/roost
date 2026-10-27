import { Heart } from 'lucide-react';
import { useState } from 'react';
import { experienceClassificationPatch } from '../../../domain/gameExperience.ts';
import { GAME_GRADES } from '../../../domain/gameRating.ts';
import { priorityEditable } from '../../../domain/gameProgress.ts';
import type { ExperienceEntry, MediaItem } from '../../../domain/types.ts';
import { EXPERIENCE_LABELS } from '../../RecordEditors.tsx';
import { CLASSIFICATIONS, CLASSIFICATION_LABELS, classificationFor } from '../library/experienceOptions.ts';
import type { BentoSave } from './BentoContentEditors.tsx';

export function BentoClassificationChoices({ item, save }: { item: MediaItem; save: BentoSave }) {
  const classification = classificationFor(item), [error, setError] = useState('');
  return <><div className="bento-context-options bento-classifications">{CLASSIFICATIONS.map(value => <button type="button" key={value} className={`experience-color--${value}`} aria-pressed={classification === value} onClick={() => setError(save(experienceClassificationPatch(value)) ? '' : '分类未能保存，请重试。')}>{CLASSIFICATION_LABELS[value]}</button>)}</div>{error && <p className="bento-context-error" role="alert">{error}</p>}</>;
}
export function BentoFootprint({ item, save }: { item: MediaItem; save: BentoSave }) {
  const [expanded, setExpanded] = useState(false), classification = classificationFor(item);
  const entries = [...(item.experienceEntries ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  return <>
    <div className="bento-heading"><h3>体验与足迹</h3>{!item.removedAt && <button type="button" className="bento-favorite" aria-label={item.favorite ? '取消喜欢' : '标为喜欢'} aria-pressed={item.favorite} onClick={() => save({ favorite: !item.favorite })}><Heart size={17} fill={item.favorite ? 'currentColor' : 'none'} /></button>}</div>
    <div className="bento-experience-summary"><span className="bento-muted">体验分类</span><button type="button" disabled={Boolean(item.removedAt)} className={`bento-current-classification experience-color--${classification}`} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{CLASSIFICATION_LABELS[classification]}</button>{expanded && <BentoClassificationChoices item={item} save={patch => { const ok = save(patch); if (ok) setExpanded(false); return ok; }} />}</div>
    {priorityEditable(item) && <div className="bento-priority-value"><span>游玩优先级</span><strong>{item.playPriority ?? '未设置'}</strong></div>}
    <ol className="bento-footprints" aria-label="体验足迹">{entries.length ? entries.map(entry => <li key={entry.id}><time>{entry.date}</time><div><strong>{EXPERIENCE_LABELS[entry.kind]}</strong>{entry.note && <p>{entry.note}</p>}{entry.minutes !== undefined && <small>{entry.minutes} 分钟</small>}</div></li>) : <li className="bento-muted">还没有体验足迹</li>}</ol>
  </>;
}
export function BentoFootprintEditor({ item, save, onExperience, onCompletion, onCompletionHistory, onUndo, canUndo }: {
  item: MediaItem; save: BentoSave; onExperience: (entry: ExperienceEntry | 'new') => void;
  onCompletion: () => void; onCompletionHistory: () => void; onUndo: () => void; canUndo: boolean;
}) {
  const [error, setError] = useState('');
  return <div className="bento-context-form"><p className="bento-context-description">体验分类</p><BentoClassificationChoices item={item} save={save} />
    {priorityEditable(item) && <><p className="bento-context-description">游玩优先级</p><div className="bento-context-options">{[...GAME_GRADES, ''].map(value => <button key={value} type="button" aria-pressed={(item.playPriority ?? '') === value} onClick={() => setError(save({ playPriority: value === '' ? undefined : value as MediaItem['playPriority'], priorityOrder: undefined }) ? '' : '优先级未能保存，请重试。')}>{value || '未设置'}</button>)}</div></>}
    <button type="button" onClick={() => onExperience('new')}>记录一次体验</button>{(item.experienceEntries ?? []).map(entry => <div className="bento-context-entry" key={entry.id}><span>{entry.date} · {EXPERIENCE_LABELS[entry.kind]}</span><button type="button" onClick={() => onExperience(entry)}>修改</button><button type="button" onClick={() => { if (save({ experienceEntries: item.experienceEntries!.filter(value => value.id !== entry.id) })) setError(''); else setError('记录未能移除，请重试。'); }}>移除</button></div>)}
    <div className="bento-context-divider" /><button type="button" onClick={onCompletion}>记录一次完成</button>{(item.completionEvents?.length ?? 0) > 0 && <button type="button" onClick={onCompletionHistory}>整理完成事件</button>}{canUndo && <button type="button" onClick={onUndo}>撤销刚才的完成记录</button>}
    {error && <p className="bento-context-error" role="alert">{error}</p>}
  </div>;
}
