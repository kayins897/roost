import { Check } from 'lucide-react';
import { useState } from 'react';
import { GAME_GRADES } from '../../../domain/gameRating.ts';
import type { MediaItem, PersonalGrade } from '../../../domain/types.ts';
import { Modal } from '../../components/MediaPrimitives.tsx';

export function QuickRankEditor({ item, mode, onClose, onSave }: { item: MediaItem; mode: 'priority' | 'rating'; onClose: () => void; onSave: (patch: Partial<MediaItem>) => boolean }) {
  const priority = mode === 'priority', original = priority ? item.playPriority : item.personalGrade;
  const [grade, setGrade] = useState<PersonalGrade | ''>(original ?? ''), [error, setError] = useState('');
  const label = priority ? '待体验优先级' : '通关评级';
  return <Modal title={label} description={`${item.title} · 状态已更新，也可以顺便留下${priority ? '计划优先级' : '个人评级'}。`} onClose={onClose}>
    <label className="form-field">{label}<select autoFocus aria-label={label} value={grade} onChange={event => setGrade(event.target.value as PersonalGrade | '')}><option value="">未设置</option>{GAME_GRADES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    <p className="feature-help">{priority ? 'SSS 最高，C 最低；通关后的评级独立记录。' : '你的个人喜好，与待体验优先级独立。'}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button className="button button--ghost" onClick={onClose}>暂不设置</button><button className="button button--primary" onClick={() => { const value = grade || undefined; const patch = priority ? { playPriority: value, ...(value !== original ? { priorityOrder: undefined } : {}) } : { personalGrade: value, ...(value !== original ? { ratingOrder: undefined } : {}) }; if (onSave(patch)) onClose(); else setError('未能保存，选择已保留，请重试。'); }}><Check size={15} />保存</button></div>
  </Modal>;
}
