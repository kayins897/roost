import { useId, useState, type FormEvent } from 'react';
import { AlertCircle, CalendarDays } from 'lucide-react';
import type { Dispatch } from 'react';
import { uid, validDay, type Action, type PreviewState, type ReadingRound } from './model';
import { Dialog } from './ui';

type FormProps = { state: PreviewState; dispatch: Dispatch<Action>; workId?: string; onClose: () => void };
type RoundFormProps = FormProps & { today: string; round?: ReadingRound; finishPlan?: boolean };

export function readingDate(value?: string) {
  if (!value) return '完成日期未知';
  if (value.length === 7) return `${Number(value.slice(0, 4))} 年 ${Number(value.slice(5))} 月`;
  return `${Number(value.slice(0, 4))} 年 ${Number(value.slice(5, 7))} 月 ${Number(value.slice(8))} 日`;
}

export function PlanForm({ state, dispatch, workId, onClose }: FormProps) {
  const available = state.works.filter(work => work.category === 'book' && (work.id === workId || !state.plans.some(plan => plan.workId === work.id)));
  const [selected, setSelected] = useState(workId ?? available[0]?.id ?? '');
  const existing = state.plans.find(plan => plan.workId === selected);
  const [reason, setReason] = useState(existing?.reason ?? '');
  const [date, setDate] = useState(existing?.date ?? '');
  const [error, setError] = useState('');
  const prefix = useId();
  function save(event: FormEvent) {
    event.preventDefault();
    if (!selected || (date && !validDay(date))) { setError('请选择书籍，并检查计划日期。'); return; }
    dispatch({ type: 'plan', plan: { id: existing?.id ?? uid('plan'), workId: selected, state: existing?.state ?? 'queued', reason: reason.trim(), date: date || undefined, order: existing?.order ?? state.plans.filter(plan => plan.state === 'queued').length } });
    onClose();
  }
  return <Dialog title={existing ? '调整阅读计划' : '加入阅读计划'} onClose={onClose}>
    <form className="rw-form bk-form" onSubmit={save}>
      <label className="rw-field" htmlFor={`${prefix}-book`}>书籍
        <select id={`${prefix}-book`} value={selected} disabled={Boolean(workId)} onChange={event => { setSelected(event.target.value); setError(''); }} required>
          {available.map(work => <option value={work.id} key={work.id}>{work.title}</option>)}
          {!available.length && <option value="">没有可加入的书籍</option>}
        </select>
      </label>
      {!available.length && <p className="rw-muted">书架中的书籍都已在计划中，可以直接调整已有计划。</p>}
      <label className="rw-field" htmlFor={`${prefix}-reason`}>为什么想读 <span className="rw-muted">选填</span>
        <textarea id={`${prefix}-reason`} value={reason} onChange={event => setReason(event.target.value)} rows={3} placeholder="给未来的自己留一句话。"/>
      </label>
      <label className="rw-field" htmlFor={`${prefix}-date`}>计划日期 <span className="rw-muted">选填</span>
        <input id={`${prefix}-date`} type="date" value={date} onChange={event => setDate(event.target.value)}/>
      </label>
      <p className="bk-form-hint rw-muted"><CalendarDays size={16}/> 不确定哪天读也可以，先放进待读清单。</p>
      {error && <p className="bk-form-error" role="alert">{error}</p>}
      <div className="rw-dialog-action"><button className="rw-button" type="button" onClick={onClose}>取消</button><button className="rw-button rw-button--primary" disabled={!available.length} type="submit">保存计划</button></div>
    </form>
  </Dialog>;
}

export function RoundForm({ state, dispatch, workId, today, round, finishPlan = false, onClose }: RoundFormProps) {
  const books = state.works.filter(work => work.category === 'book');
  const [selected, setSelected] = useState(round?.workId ?? workId ?? books[0]?.id ?? '');
  const [precision, setPrecision] = useState<'unknown' | 'month' | 'day'>(round?.finishedOn ? round.finishedOn.length === 7 ? 'month' : 'day' : 'unknown');
  const [date, setDate] = useState(round?.finishedOn ?? '');
  const [impression, setImpression] = useState(round?.impression ?? '');
  const [review, setReview] = useState(round?.review ?? '');
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [error, setError] = useState('');
  const prefix = useId();
  function save(event: FormEvent) {
    event.preventDefault();
    const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(date) && Number(date.slice(0, 4)) >= 1900;
    if (!selected || (precision === 'day' && (!validDay(date) || date > today)) || (precision === 'month' && (!validMonth || date > today.slice(0, 7)))) {
      setError('请填写有效的完成日期；不记得时可以选择“日期未知”。'); return;
    }
    if (simulateFailure) { setError('模拟保存失败，草稿已保留。关闭下方模拟选项后可重试。'); return; }
    dispatch({ type: 'round', round: { id: round?.id ?? uid('round'), workId: selected, finishedOn: precision === 'unknown' ? undefined : date, impression: impression.trim(), review: review.trim() }, finishPlan: !round && finishPlan });
    onClose();
  }
  return <Dialog title={round ? '编辑这次阅读' : finishPlan ? '完成本次阅读' : '补录已读'} onClose={onClose}>
    <form className="rw-form bk-form" onSubmit={save}>
      <label className="rw-field" htmlFor={`${prefix}-book`}>书籍
        <select id={`${prefix}-book`} value={selected} disabled={Boolean(workId || round)} onChange={event => setSelected(event.target.value)} required>{books.map(work => <option value={work.id} key={work.id}>{work.title}</option>)}</select>
      </label>
      <fieldset className="bk-date-field"><legend>何时读完</legend><div className="bk-date-controls">
        <select aria-label="完成日期精度" value={precision} onChange={event => { const next = event.target.value as typeof precision; setPrecision(next); setDate(next === 'month' ? date.slice(0, 7) : date.length === 10 ? date : ''); setError(''); }}>
          <option value="unknown">日期未知</option><option value="month">只记得月份</option><option value="day">记得具体日期</option>
        </select>
        {precision !== 'unknown' && <input aria-label={precision === 'month' ? '完成月份' : '完成日期'} type={precision === 'month' ? 'month' : 'date'} value={date} max={precision === 'month' ? today.slice(0, 7) : today} onChange={event => setDate(event.target.value)} required/>}
      </div></fieldset>
      <label className="rw-field" htmlFor={`${prefix}-impression`}>一句话印象 <span className="rw-muted">选填</span>
        <input id={`${prefix}-impression`} value={impression} onChange={event => setImpression(event.target.value)} maxLength={160} placeholder="这次阅读，什么留在了心里？"/>
      </label>
      <label className="rw-field" htmlFor={`${prefix}-review`}>读后感 <span className="rw-muted">选填</span>
        <textarea id={`${prefix}-review`} value={review} onChange={event => setReview(event.target.value)} rows={5} placeholder="可以慢慢写，也可以以后再补。"/>
      </label>
      <label className="bk-failure-toggle"><input type="checkbox" checked={simulateFailure} onChange={event => setSimulateFailure(event.target.checked)}/> 模拟保存失败 <span className="rw-muted">原型演示</span></label>
      {error && <p className="bk-form-error" role="alert"><AlertCircle size={16}/>{error}</p>}
      <div className="rw-dialog-action"><button className="rw-button" type="button" onClick={onClose}>取消</button><button className="rw-button rw-button--primary" type="submit">{finishPlan && !round ? '保存并完成阅读' : '保存阅读记录'}</button></div>
    </form>
  </Dialog>;
}
