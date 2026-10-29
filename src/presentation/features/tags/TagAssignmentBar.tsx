import { t } from '../../i18n/index.ts';
import { Check, Tag } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createGameBatchEditPlan, type GameBatchEditPlan } from '../../../domain/batchEdit.ts';
import { GAME_TAG_LABELS } from '../../../domain/library.ts';
import type { MediaItem } from '../../../domain/types.ts';
import type { TagAssignment } from '../../BatchEdit.tsx';
import './tag-editor.css';

interface Props {
  assignment: TagAssignment;
  items: MediaItem[];
  visibleIds: ReadonlySet<string>;
  canSelectAll: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onCancel: () => void;
  onApply: (plan: GameBatchEditPlan) => boolean;
}

export function TagAssignmentBar({ assignment, items, visibleIds, canSelectAll, onSelectAll, onClear, onCancel, onApply }: Props) {
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [error, setError] = useState('');
  const plan = useMemo(() => createGameBatchEditPlan(items, items.map(item => item.id), { tags: { mode, groups: { [assignment.group]: [assignment.name] } } }), [items, assignment, mode]);
  const outside = items.filter(item => !visibleIds.has(item.id)).length;
  function apply() {
    if (onApply(plan)) setError('');
    else setError('保存未完成，标签与作品选择已保留，请重试。');
  }
  return <section className="selection-actionbar tag-assignment-bar" role="region" aria-label={t("分配标签")}>
    <div className="selection-summary"><div className="tag-assignment-info"><Tag size={15} /><span title={assignment.name}>{assignment.name}</span><small>{t(GAME_TAG_LABELS[assignment.group])}</small></div><small role="status">{t("已选择")}{" "}{items.length} {" "}{t("件")}{outside > 0 && t(" · 其中 {0} 件不在当前结果中", [outside])}</small></div>
    <div className="selection-management"><button className="button button--secondary" disabled={!canSelectAll} onClick={onSelectAll}>{t("全选当前结果")}</button><button className="button button--secondary" disabled={!items.length} onClick={onClear}>{t("清空选择")}</button><button className="button button--ghost" onClick={onCancel}>{t("取消分配")}</button></div>
    <div className="selection-commands">
      <div className="tag-assignment-mode" role="group" aria-label={t("分配方式")}><button aria-pressed={mode === 'add'} onClick={() => { setMode('add'); setError(''); }}>{t("添加标签")}</button><button aria-pressed={mode === 'remove'} onClick={() => { setMode('remove'); setError(''); }}>{t("移除标签")}</button></div>
      <span className="tag-assignment-feedback" role="status">{!items.length ? t('选择要整理的作品') : plan.changedCount ? t("{0} 款将更新{1}", [plan.changedCount, items.length > plan.changedCount ? ` · ${items.length - plan.changedCount} 款无需修改` : '']) : mode === 'add' ? t('所选作品已有此标签') : t('所选作品没有此标签')}</span>
      <button className="button button--primary" disabled={!plan.changedCount} onClick={apply}><Check size={14} />{mode === 'add' ? t("添加到 {0} 款", [plan.changedCount]) : t("从 {0} 款移除", [plan.changedCount])}</button>
    </div>
    {error && <p className="form-error" role="alert">{t(error)}</p>}
  </section>;
}
