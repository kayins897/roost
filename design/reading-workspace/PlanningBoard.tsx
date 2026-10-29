import { ArrowUpRight, MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';
import type { WorkspaceProps } from './contracts';
import { CATEGORY_LABELS, type Category, type Plan } from './model';
import { calendarPeriod, type CalendarScale } from './periods';
import { candidateLocation, partitionCandidates, planningSlots, type PlanningMode, type PlanningSlot } from './planning';
import { CandidateForm } from './CandidateForm';
import { Cover } from './ui';
import './planning.css';

interface Props extends WorkspaceProps { date: string; scale: CalendarScale; filter: Category | 'all' }
export function PlanningBoard(props: Props) {
  const { state, dispatch, date, scale, query, filter, openWork } = props;
  const [yearMode, setYearMode] = useState<PlanningMode>('seasons');
  const [monthMode, setMonthMode] = useState<PlanningMode>('stages');
  const [editor, setEditor] = useState<{ plan?: Plan; slotId?: string } | null>(null);
  const period = calendarPeriod(date, scale), mode = scale === 'year' ? yearMode : monthMode;
  const slots = planningSlots(date, scale, mode);
  const works = new Map(state.works.map(work => [work.id, work]));
  const matches = (plan: Plan) => {
    const work = works.get(plan.workId);
    return work && work.category !== 'music' && (filter === 'all' || work.category === filter) && `${work.title} ${plan.reason}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  };
  const plans = state.plans.filter(matches).sort((a, b) => a.order - b.order);
  const { buckets, context, loose } = partitionCandidates(plans, period, slots);
  const total = [...buckets.values()].flat().length;
  const renderCandidate = (plan: Plan, slot?: PlanningSlot) => {
    const work = works.get(plan.workId)!;
    return <article className={`pb-candidate pb-candidate--${work.category}`} key={plan.id} data-plan-id={plan.id}>
      <button className="pb-work" onClick={() => openWork(work.id)}><Cover work={work} small/><span><small>{CATEGORY_LABELS[work.category]}{plan.state === 'reading' && ' · 在读'}</small><strong>{work.title}</strong>{plan.reason && <span>{plan.reason}</span>}<em>{candidateLocation(plan)}</em></span></button>
      <button className="rw-icon-button pb-adjust" aria-label={`调整${work.title}的候选安排`} onClick={() => setEditor({ plan, slotId: slot?.id })}><MoreHorizontal size={19}/></button>
    </article>;
  };
  return <section className="pb-board" aria-label="阶段式体验规划">
    <header className="pb-heading"><div><p className="rw-eyebrow">给下一次喜欢留位置</p><h2>{scale === 'year' ? '这一年的候选' : scale === 'month' ? '这个月想体验的' : '这周想体验的'}<span>{total} 部</span></h2><p className="rw-muted">可以挑选，也可以改变主意。</p></div><div className="pb-heading-actions">
      {scale !== 'week' && <div className="cal-scale-switch" role="group" aria-label="规划分组">{(scale === 'year' ? [{ id: 'seasons', label: '四季' }, { id: 'months', label: '月份' }] : [{ id: 'stages', label: '月初中末' }, { id: 'weeks', label: '自然周' }]).map(value => <button key={value.id} className={mode === value.id ? 'is-active' : ''} aria-pressed={mode === value.id} onClick={() => scale === 'year' ? setYearMode(value.id as PlanningMode) : setMonthMode(value.id as PlanningMode)}>{value.label}</button>)}</div>}
      <button className="rw-button rw-button--primary" onClick={() => setEditor({})}><Plus size={16}/>添加候选</button></div></header>
    <div className={`pb-slots pb-slots--${scale} pb-slots--${mode}`}>{slots.map((slot, index) => <section className={`pb-slot ${buckets.get(slot.id)!.length ? '' : 'pb-slot--empty'}`} key={slot.id} data-slot-id={slot.id}>
      <header><span className="pb-stage-number">{String(index + 1).padStart(2, '0')}</span><div><h3>{slot.label}</h3><small>{slot.caption}</small></div><button className="rw-icon-button" aria-label={`为${slot.label}添加候选`} onClick={() => setEditor({ slotId: slot.id })}><Plus size={17}/></button></header>
      <div className="pb-candidates">{buckets.get(slot.id)!.map(plan => renderCandidate(plan, slot))}</div>
      {!buckets.get(slot.id)!.length && <button className="pb-empty" onClick={() => setEditor({ slotId: slot.id })}>还留着空位 <ArrowUpRight size={14}/></button>}
    </section>)}</div>
    {context.length > 0 && <section className="pb-context" aria-label="来自更宽阶段的候选"><header><h3>来自更宽的阶段</h3><p>还没有细化到这一期，随时可以调整。</p></header><div>{context.map(plan => renderCandidate(plan))}</div></section>}
    <details className="pb-loose" open><summary>未定时间 <span>{loose.length}</span></summary><div className="pb-loose-list">{loose.length ? loose.map(plan => renderCandidate(plan)) : <p className="rw-muted">暂时没有未定时间的候选。</p>}</div></details>
    {editor && <CandidateForm key={`${editor.plan?.id ?? 'new'}-${editor.slotId ?? ''}`} state={state} dispatch={dispatch} slots={slots} initial={editor.plan} slotId={editor.slotId} onClose={() => setEditor(null)}/>}
  </section>;
}
