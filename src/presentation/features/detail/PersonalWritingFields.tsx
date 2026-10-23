import { Check } from 'lucide-react';
import { useId } from 'react';
import { IMPRESSION_MAX_LENGTH, writingLength } from '../../../domain/personalWriting.ts';
import type { usePersonalWriting } from './usePersonalWriting.ts';

export function PersonalWritingFields({ writing, locked }: { writing: ReturnType<typeof usePersonalWriting>; locked: boolean }) {
  const id = useId(), { draft, dirty, legacy, validation, saveError, edit, save } = writing;
  return <section className="detail-writing" aria-label="个人感受">
    {legacy && <p className="detail-legacy-note">原有长文字已完整显示在测评中。仅编辑并保存感受时才拆分记录，不会自动截断。</p>}
    <div className="detail-writing-heading"><label htmlFor={`${id}-impression`}>一句话印象</label><span id={`${id}-count`} className={validation ? 'detail-writing-error' : ''}>{writingLength(draft.impression)} / {IMPRESSION_MAX_LENGTH} 字</span></div>
    <input id={`${id}-impression`} className="detail-one-line" type="text" readOnly={locked} aria-label="一句话印象" aria-describedby={`${id}-count${validation ? ` ${id}-error` : ''}`} aria-invalid={Boolean(validation)} placeholder="用一句话，留下它给你的感觉。" value={draft.impression} onChange={event => edit('impression', event.target.value)} />
    <div className="detail-writing-heading detail-review-heading"><label htmlFor={`${id}-review`}>长文测评</label><span>{writingLength(draft.review).toLocaleString('zh-CN')} 字</span></div>
    <textarea id={`${id}-review`} className="detail-review-input" rows={9} readOnly={locked} aria-label="长文测评" placeholder="哪些地方打动了你？有哪些遗憾？在这里慢慢写。" value={draft.review} onChange={event => edit('review', event.target.value)} />
    {(validation || saveError) && <p id={`${id}-error`} className="form-error" role="alert">{validation || saveError}</p>}
    <div className="detail-writing-footer"><span role="status">{dirty ? '未保存 · 关闭时保存，失败会保留此窗口' : '已保存 · 本地'}</span>{dirty && !locked && <button className="button button--primary" onClick={save}><Check size={14} />保存感受</button>}</div>
  </section>;
}
