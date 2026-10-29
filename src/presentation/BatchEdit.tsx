import { t } from './i18n/index.ts';
import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createGameBatchEditPlan, type GameBatchEditPlan } from '../domain/batchEdit.ts';
import { emptyGameTags, GAME_TAG_KEYS, GAME_TAG_LABELS, gameTagCounts, normalizeTags } from '../domain/library.ts';
import type { GameTagGroupKey, MediaItem } from '../domain/types.ts';
import './batch-edit.css';
import { TagPickerGroup } from './features/tags/TagPickerGroup.tsx';

export type BatchAction = 'add-tags' | 'remove-tags';
export interface TagAssignment { group: GameTagGroupKey; name: string }
interface Props { items: MediaItem[]; availableItems?: MediaItem[]; action: BatchAction; initialTag?: TagAssignment | null; onApply: (plan: GameBatchEditPlan) => boolean; onClose: () => void }
export function BatchEditBody({ items, availableItems = items, action, initialTag, onApply, onClose }: Props) {
  const [group, setGroup] = useState<GameTagGroupKey>(initialTag?.group ?? 'other');
  const [text, setText] = useState(initialTag?.name ?? '');
  const [error, setError] = useState('');
  const names = useMemo(() => normalizeTags(text.split(/[,，、\n]+/)), [text]);
  const available = useMemo(() => gameTagCounts(availableItems), [availableItems]);
  const plan = useMemo(() => createGameBatchEditPlan(items, items.map(item => item.id), { tags: { mode: action === 'add-tags' ? 'add' : 'remove', groups: { ...emptyGameTags(), [group]: names } } }), [items, action, group, names]);
  const title = action === 'add-tags' ? '添加标签' : '移除标签';
  function apply() {
    try { if (onApply(plan)) onClose(); else setError('保存未完成，所选作品与修改已保留。请处理提示后重试。'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '保存失败，请重试'); }
  }
  return <div className="batch-edit" data-testid="batch-edit-body">
    <p className="batch-edit-intro">{t("对选中的")}{" "}<strong>{items.length}</strong> {" "}{t("款游戏")}{title}{t("。其他资料、时长和个人记录保留。")}</p>
    <label className="form-field">{t("标签分组")}<select aria-label={t("标签分组")} value={group} onChange={event => { setGroup(event.target.value as GameTagGroupKey); setText(''); }}>{GAME_TAG_KEYS.map(value => <option key={value} value={value}>{t(GAME_TAG_LABELS[value])}</option>)}</select></label>
    <TagPickerGroup label={t("批量标签名称")} value={text} available={available[group]} onChange={setText} />
    <p className="feature-help">{action === 'add-tags' ? t('已有标签保留，重复项跳过。新标签会随本次修改一起创建。') : t('只移除这个分组中指定的标签。')}</p>
    <p className="feature-help" role="status">{plan.changedCount ? t("{0} 款将更新，{1} 款保持原样", [plan.changedCount, items.length - plan.changedCount]) : t('选择操作内容后即可应用')}</p>
    <details className="batch-change-details"><summary>{t("查看所选作品与变化")}</summary><ul>{plan.changes.map(change => <li key={change.id}><strong>{change.title}</strong>　{change.tagChanges.map(value => `${GAME_TAG_LABELS[value.group]}：${value.added.length ? '+' + value.added.join('、') : '−' + value.removed.join('、')}`).join('；')}</li>)}</ul></details>
    {error && <p role="alert" className="form-error">{t(error)}</p>}
    <div className="modal-actions"><button className="button button--ghost" onClick={onClose}>{t("取消")}</button><button className="button button--primary" disabled={!plan.changedCount} onClick={apply}><Check size={15} />{t("应用到")}{" "}{plan.changedCount} {" "}{t("款")}</button></div>
  </div>;
}
