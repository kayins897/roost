import { useState, type Dispatch } from 'react';
import { Dialog } from './ui';
import { CATEGORY_LABELS, uid, type Action, type Plan, type PreviewState } from './model';
import { candidateLocation, placeCandidate, type PlanningSlot } from './planning';

interface Props { state: PreviewState; dispatch: Dispatch<Action>; slots: PlanningSlot[]; initial?: Plan; slotId?: string; onClose: () => void }
export function CandidateForm({ state, dispatch, slots, initial, slotId, onClose }: Props) {
  const works = state.works.filter(work => work.category !== 'music');
  const firstPlan = initial ?? state.plans.find(plan => plan.workId === works[0].id);
  const [draft, setDraft] = useState({ workId: initial?.workId ?? works[0].id, slotId: slotId ?? slots[0].id, reason: firstPlan?.reason ?? '' });
  const [error, setError] = useState(''), [fail, setFail] = useState(false);
  const existing = state.plans.find(plan => plan.workId === draft.workId);
  return <Dialog title={initial ? '调整候选安排' : '挑选想体验的作品'} onClose={onClose}>
    <form className="rw-form" onSubmit={event => {
      event.preventDefault();
      const slot = slots.find(value => value.id === draft.slotId);
      if (!slot || !works.some(work => work.id === draft.workId)) return setError('请选择作品和时间阶段。');
      if (fail) return setError('模拟保存失败，选择已保留，可以重试。');
      const base: Plan = existing ?? { id: uid('plan'), workId: draft.workId, state: 'queued', reason: '', order: state.plans.length };
      dispatch({ type: 'plan', plan: { ...placeCandidate(base, slot), reason: draft.reason.trim() } });
      onClose();
    }}>
      <label>作品<select aria-label="候选作品" value={draft.workId} disabled={!!initial} onChange={event => {
        const plan = state.plans.find(value => value.workId === event.target.value);
        setDraft({ ...draft, workId: event.target.value, reason: plan?.reason ?? '' }); setError('');
      }}>{works.map(work => <option key={work.id} value={work.id}>{work.title} · {CATEGORY_LABELS[work.category]}</option>)}</select></label>
      <fieldset className="pb-slot-picker"><legend>想在什么时候体验</legend><div>{slots.map(slot => <button type="button" key={slot.id} aria-pressed={draft.slotId === slot.id} className={draft.slotId === slot.id ? 'is-active' : ''} onClick={() => setDraft({ ...draft, slotId: slot.id })}><strong>{slot.label}</strong><small>{slot.caption}</small></button>)}</div></fieldset>
      {existing && <p className="pb-form-note">已在{candidateLocation(existing)}。这次调整沿用同一作品的计划{existing.state === 'reading' ? '，并保留在读状态' : ''}。</p>}
      <label>留给未来的自己 <span className="rw-muted">选填</span><textarea aria-label="候选说明" rows={3} value={draft.reason} onChange={event => setDraft({ ...draft, reason: event.target.value })} placeholder="想在这个阶段体验它的理由……"/></label>
      <details className="rw-preview-options"><summary>预览验证选项</summary><label className="rw-checkbox"><input type="checkbox" checked={fail} onChange={event => setFail(event.target.checked)}/>模拟保存失败</label></details>
      {error && <p className="rw-error" role="alert">{error}</p>}
      <div className="rw-dialog-action"><button type="button" className="rw-button" onClick={onClose}>返回</button><button type="submit" className="rw-button rw-button--primary">保存安排</button></div>
      {existing && <details className="pb-manage"><summary>管理这条候选</summary><div><button type="button" className="rw-button" onClick={() => { dispatch({ type: 'plan', plan: { ...existing, date: undefined, placements: [] } }); onClose(); }}>移回未定时间</button><button type="button" className="rw-button rw-button--danger" onClick={() => { dispatch({ type: 'unplan', id: existing.id }); onClose(); }}>移出候选</button></div></details>}
    </form>
  </Dialog>;
}
