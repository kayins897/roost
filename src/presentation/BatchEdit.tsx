import { Check,Tag } from 'lucide-react';
import { useMemo,useState } from 'react';
import { createBatchProgressPatch, createGameBatchEditPlan, type GameBatchEditPlan } from '../domain/batchEdit.ts';
import { emptyGameTags,GAME_PLAY_LABELS,GAME_TAG_KEYS,GAME_TAG_LABELS,gameTagCounts,normalizeTags } from '../domain/library.ts';
import { COMPLETION_LABELS, COMPLETION_STATUSES, ENGAGEMENT_LABELS, PLAY_ENGAGEMENTS } from '../domain/gameProgress.ts';
import type { CompletionStatus,GameTagGroupKey,MediaItem,PlayEngagement } from '../domain/types.ts';
import './batch-edit.css';

export type BatchAction = 'engagement' | 'completion' | 'add-tags' | 'remove-tags';
type BatchPlanView = Pick<GameBatchEditPlan, 'input' | 'selectedIds' | 'selectedCount' | 'skippedCount' | 'timestamp' | 'items' | 'changedCount'> & { changes: { id: string; title: string; rankChange?: GameBatchEditPlan['changes'][number]['rankChange']; stateChange?: GameBatchEditPlan['changes'][number]['stateChange']; tagChanges?: GameBatchEditPlan['changes'][number]['tagChanges'] }[] };
export interface TagAssignment { group: GameTagGroupKey; name: string }
interface Props { items: MediaItem[]; availableItems?: MediaItem[]; action: BatchAction; initialTag?: TagAssignment | null; onApply: (plan: BatchPlanView) => boolean; onClose: () => void }
export function BatchEditBody({ items, availableItems = items, action, initialTag, onApply, onClose }: Props) {
  const [engagement, setEngagement] = useState<PlayEngagement | ''>('');
  const [completion, setCompletion] = useState<CompletionStatus | ''>('');
  const [group, setGroup] = useState<GameTagGroupKey>(initialTag?.group ?? 'other');
  const [text, setText] = useState(initialTag?.name ?? '');
  const [error, setError] = useState('');
  const names = useMemo(() => normalizeTags(text.split(/[,，、\n]+/)), [text]);
  const available = useMemo(() => gameTagCounts(availableItems), [availableItems]);
  // v0.4.24：批量「改当前关系 / 改通关进度」只写新维度（等级走工具栏快捷定级）；标签动作不变。
  const plan = useMemo<BatchPlanView>(() => {
    if (action === 'engagement' || action === 'completion') {
      const patch = action === 'engagement' ? (engagement ? { playEngagement: engagement } : {}) : (completion ? { completion } : {});
      const result = createBatchProgressPatch(items, items.map(item => item.id), patch);
      return { changedCount: result.changedCount, changes: result.changes, input: {} as GameBatchEditPlan['input'], selectedIds: items.map(item => item.id), selectedCount: items.length, skippedCount: 0, timestamp: '', items: result.items };
    }
    return createGameBatchEditPlan(items, items.map(item => item.id), { tags: { mode: action === 'add-tags' ? 'add' : 'remove', groups: { ...emptyGameTags(), [group]: names } } });
  }, [items, action, engagement, completion, group, names]);
  const title = action === 'engagement' ? '更改当前关系' : action === 'completion' ? '更改通关进度' : action === 'add-tags' ? '添加标签' : '移除标签';
  function apply() {
    try { if (onApply(plan)) onClose(); else setError('保存未完成，所选作品与修改已保留。请处理提示后重试。'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '保存失败，请重试'); }
  }
  return <div className="batch-edit" data-testid="batch-edit-body">
    <p className="batch-edit-intro">对选中的 <strong>{items.length}</strong> 款游戏{title}。其他资料、时长和个人记录保留。</p>
    {action === 'engagement' ? <div className="detail-statuses game-state-options" aria-label="批量当前关系">{PLAY_ENGAGEMENTS.map(value => <button key={value} className={`status-option ${engagement === value ? 'is-selected' : ''}`} aria-pressed={engagement === value} onClick={() => setEngagement(value)}>{ENGAGEMENT_LABELS[value]}</button>)}</div> : action === 'completion' ? <div className="detail-statuses completion-options" aria-label="批量通关进度">{COMPLETION_STATUSES.map(value => <button key={value} className={`status-option ${completion === value ? 'is-selected' : ''}`} aria-pressed={completion === value} onClick={() => setCompletion(value)}>{COMPLETION_LABELS[value]}</button>)}</div> : <>
      <label className="form-field">标签分组<select aria-label="标签分组" value={group} onChange={event => { setGroup(event.target.value as GameTagGroupKey); setText(''); }}>{GAME_TAG_KEYS.map(value => <option key={value} value={value}>{GAME_TAG_LABELS[value]}</option>)}</select></label>
      <label className="form-field">标签名称<input autoFocus aria-label="批量标签名称" value={text} onChange={event => setText(event.target.value)} placeholder="输入标签，多个用顿号分隔" maxLength={4000} /></label>
      <div className="batch-existing-tags">{available[group].map(tag => <button key={tag.name} className={names.includes(tag.name) ? 'is-selected' : ''} aria-pressed={names.includes(tag.name)} onClick={() => setText(names.includes(tag.name) ? names.filter(name => name !== tag.name).join('、') : [...names, tag.name].join('、'))}><Tag size={12} />{tag.name}</button>)}</div>
      <p className="feature-help">{action === 'add-tags' ? '已有标签保留，重复项跳过。新标签会随本次修改一起创建。' : '只移除这个分组中指定的标签。'}</p>
    </>}
    <p className="feature-help" role="status">{plan.changedCount ? `${plan.changedCount} 款将更新，${items.length - plan.changedCount} 款保持原样` : '选择操作内容后即可应用'}</p>
    <details className="batch-change-details"><summary>查看所选作品与变化</summary><ul>{plan.changes.map(change => <li key={change.id}><strong>{change.title}</strong>　{change.rankChange && <span>{change.rankChange.label}：{change.rankChange.before ?? '未设置'} → {change.rankChange.after ?? '未设置'}；</span>}{change.stateChange ? `${GAME_PLAY_LABELS[change.stateChange.before]} → ${GAME_PLAY_LABELS[change.stateChange.after]}` : change.tagChanges ? change.tagChanges.map(value => `${GAME_TAG_LABELS[value.group]}：${value.added.length ? '+' + value.added.join('、') : '−' + value.removed.join('、')}`).join('；') : (action === 'engagement' ? `当前关系 → ${ENGAGEMENT_LABELS[engagement as PlayEngagement]}` : `通关进度 → ${COMPLETION_LABELS[completion as CompletionStatus]}`)}</li>)}</ul></details>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="modal-actions"><button className="button button--ghost" onClick={onClose}>取消</button><button className="button button--primary" disabled={!plan.changedCount} onClick={apply}><Check size={15} />应用到 {plan.changedCount} 款</button></div>
  </div>;
}
