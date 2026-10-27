import { useState } from 'react';
import { Dialog } from './ui';
import { ACTIVITY_LABELS, uid, validDay, type Activity, type Plan, type PreviewState, type Action } from './model';
import type { Dispatch } from 'react';

interface FormProps { state: PreviewState; dispatch: Dispatch<Action>; today: string; onClose: () => void }
export function ActivityForm({ state, dispatch, today, onClose, initial, workId, date }: FormProps & { initial?: Activity; workId?: string; date: string }) {
  const firstWork = state.works.find(w => w.id === (initial?.workId || workId || 'b1'))!;
  const [draft, setDraft] = useState({ workId: firstWork.id, date: initial?.date ?? (initial ? '' : date), kind: initial?.kind || (firstWork.category === 'book' ? 'reading' : firstWork.category === 'game' ? 'completed' : firstWork.category === 'screen' ? 'watched' : 'note'), minutes: initial?.minutes?.toString() ?? '', note: initial?.note ?? '' });
  const [error, setError] = useState(''), [fail, setFail] = useState(false);
  const work = state.works.find(w => w.id === draft.workId)!;
  const dateValid = !draft.date || validDay(draft.date) || (/^\d{4}(-(?:0[1-9]|1[0-2]))?$/.test(draft.date) && Number(draft.date.slice(0, 4)) >= 1900);
  const kinds: Activity['kind'][] = work.category === 'book' ? ['reading', 'note'] : work.category === 'game' ? ['completed', 'note'] : work.category === 'screen' ? ['watched', 'note'] : ['note'];
  return <Dialog title={initial ? '修改体验记录' : '记录一次体验'} onClose={onClose}><form className="rw-form" onSubmit={event => {
    event.preventDefault();
    if (!dateValid || (draft.date && draft.date > today)) return setError('请填写有效的实际日期；未来安排请使用计划。');
    if (draft.minutes && (!/^\d+$/.test(draft.minutes) || !Number.isSafeInteger(Number(draft.minutes)) || Number(draft.minutes) > 1440)) return setError('本次分钟数请输入 0–1440 的整数，留空表示未记录。');
    if (draft.minutes && !validDay(draft.date)) return setError('记录每天的分钟数需要明确到日；不确定日期时请将时长留空。');
    if (fail) return setError('模拟保存失败，输入已保留。取消“模拟保存失败”后可重试。');
    dispatch({ type: 'activity', activity: { id: initial?.id || uid('activity'), workId: draft.workId, kind: draft.kind as Activity['kind'], date: draft.date || undefined, minutes: draft.minutes === '' ? undefined : Number(draft.minutes), note: draft.note.trim() } }); onClose();
  }}><label>作品<select aria-label="作品" value={draft.workId} onChange={event => { const next = state.works.find(w => w.id === event.target.value)!; setDraft({ ...draft, workId: next.id, kind: next.category === 'book' ? 'reading' : next.category === 'game' ? 'completed' : next.category === 'screen' ? 'watched' : 'note' }); }}>{state.works.map(w => <option value={w.id} key={w.id}>{w.title}</option>)}</select></label><div className="rw-form-row"><label>体验类型<select aria-label="体验类型" value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as Activity['kind'] })}>{kinds.map(kind => <option key={kind} value={kind}>{ACTIVITY_LABELS[kind]}</option>)}</select></label><label>实际日期<input aria-label="实际日期" value={draft.date} placeholder="2026-10-27／2026-10／留空" onChange={event => setDraft({ ...draft, date: event.target.value })}/></label></div><label>本次时长 <span className="rw-muted">分钟，可留空</span><input inputMode="numeric" aria-label="本次分钟数" value={draft.minutes} placeholder="未记录" onChange={event => setDraft({ ...draft, minutes: event.target.value })}/></label><label>留下一点感受<textarea rows={3} value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} placeholder="这一刻，值得记住的事。"/></label><details className="rw-preview-options"><summary>预览验证选项</summary><label className="rw-checkbox"><input type="checkbox" checked={fail} onChange={event => setFail(event.target.checked)}/>模拟保存失败</label></details>{error && <p className="rw-error" role="alert">{error}</p>}<div className="rw-dialog-action">{initial && <button type="button" className="rw-button rw-button--danger" onClick={() => { dispatch({ type: 'remove-activity', id: initial.id }); onClose(); }}>删除记录</button>}<button type="button" className="rw-button" onClick={onClose}>取消</button><button className="rw-button rw-button--primary" type="submit">保存记录</button></div></form></Dialog>;
}

export function PlanForm({ state, dispatch, onClose, initial, date }: FormProps & { initial?: Plan; date?: string }) {
  const initialPlan = initial?.id ? initial : state.plans.find(p => p.workId === (initial?.workId || 'b1'));
  const [draft, setDraft] = useState({ workId: initialPlan?.workId || 'b1', date: initial?.id ? initialPlan?.date ?? '' : initial?.date ?? date ?? initialPlan?.date ?? '', reason: initialPlan?.reason || '' });
  const [error, setError] = useState('');
  return <Dialog title={initial?.id ? '调整体验计划' : '安排下一次体验'} onClose={onClose}><form className="rw-form" onSubmit={event => {
    event.preventDefault(); if (draft.date && !validDay(draft.date)) return setError('请选择有效日期，也可以留空以后再安排。');
    const existing = state.plans.find(p => p.workId === draft.workId);
    dispatch({ type: 'plan', plan: { id: existing?.id || uid('plan'), workId: draft.workId, date: draft.date || undefined, state: existing?.state || 'queued', order: existing?.order ?? state.plans.length, reason: draft.reason.trim() } }); onClose();
  }}><label>作品<select aria-label="作品" value={draft.workId} disabled={!!initial?.id} onChange={event => { const p = state.plans.find(p => p.workId === event.target.value); setDraft({ workId: event.target.value, date: p?.date ?? draft.date, reason: p?.reason ?? '' }); }}>{state.works.map(w => <option value={w.id} key={w.id}>{w.title}</option>)}</select></label>{!initial?.id && state.plans.some(p => p.workId === draft.workId) && <p className="rw-muted">此作品已有计划，保存将调整该计划。</p>}<label>计划日期 <span className="rw-muted">可留空</span><input type="date" value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })}/></label><label>为什么想体验<textarea rows={3} value={draft.reason} onChange={event => setDraft({ ...draft, reason: event.target.value })}/></label>{error && <p className="rw-error" role="alert">{error}</p>}<div className="rw-dialog-action">{initial?.id && <button type="button" className="rw-button rw-button--danger" onClick={() => { dispatch({ type: 'unplan', id: initial.id }); onClose(); }}>取消计划</button>}<button type="button" className="rw-button" onClick={onClose}>返回</button><button className="rw-button rw-button--primary" type="submit">保存计划</button></div></form></Dialog>;
}
