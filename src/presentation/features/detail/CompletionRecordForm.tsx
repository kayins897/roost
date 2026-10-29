import { t } from '../../i18n/index.ts';
import { Star } from 'lucide-react';
import { useRef, useState } from 'react';
import { isCompletionDate, recordCompletion, type CompletionRecordInput, type CompletionRecordUndo } from '../../../domain/gameProgress.ts';
import type { MediaItem } from '../../../domain/types.ts';
import { parseCompletionCount } from './CompletionCountEditor.tsx';

export function CompletionRecordForm({ item, onPatch, onCancel, onRecorded }: { item: MediaItem; onPatch: (patch: Partial<MediaItem>) => boolean; onCancel: () => void; onRecorded: (receipt: CompletionRecordUndo) => void }) {
  const count = item.completionCount;
  const [eventId] = useState(() => crypto.randomUUID());
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [countChoice, setCountChoice] = useState<CompletionRecordInput['countChoice']>('keep');
  const [countDraft, setCountDraft] = useState('');
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const dateValid = date.trim() === '' || isCompletionDate(date.trim());
  const setValue = parseCompletionCount(countDraft);
  const nextCount = countChoice === 'increment' ? (count === undefined ? undefined : count + 1) : countChoice === 'start-at-one' ? 1 : countChoice === 'set' ? setValue : count;
  const countValid = countChoice === 'set' ? setValue !== undefined : countChoice === 'start-at-one' ? count === undefined : countChoice === 'increment' ? nextCount !== undefined && Number.isSafeInteger(nextCount) : true;
  function submit() {
    if (submitting.current || !dateValid || !countValid) return;
    const result = recordCompletion(item, { eventId, occurredAt: date.trim() || undefined, note: note.trim() || undefined, countChoice, ...(countChoice === 'set' ? { countValue: setValue } : {}), markCleared: false }, new Date().toISOString());
    if (!result) { setError('无法记录，请检查日期、次数或是否已经保存了这条事件。'); return; }
    submitting.current = true;
    if (onPatch(result.patch)) onRecorded(result.undo);
    else { submitting.current = false; setError('保存未完成，表单和本次事件编号已保留，请重试。'); }
  }
  function today() {
    const now = new Date();
    setDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
  }
  return <div className="completion-record-form" role="form" aria-label={t("记录一次完成")}>
    <label className="form-field">{t("实际完成日期（可留空=未知）")}<input value={date} placeholder="YYYY / YYYY-MM / YYYY-MM-DD" aria-label={t("实际完成日期")} onChange={event => setDate(event.target.value)} /><button type="button" className="text-button" onClick={today}>{t("今天")}</button>{!dateValid && <span className="form-error" role="alert">{t("日期格式或数值不合法")}</span>}</label>
    <label className="form-field">{t("备注（可选，例如“二周目”）")}<input value={note} aria-label={t("完成备注")} maxLength={80} onChange={event => setNote(event.target.value)} /></label>
    <label className="form-field">{t("累计次数")}<select aria-label={t("累计次数处理")} value={countChoice} onChange={event => setCountChoice(event.target.value as CompletionRecordInput['countChoice'])}>
      <option value="keep">{count === undefined ? t('保持未记录，仅记录事件') : t("保持 {0} 不变", [count])}</option>
      {count === undefined ? <option value="start-at-one">{t("从本次开始计为 1")}</option> : <option value="increment">{t("同步 +1（")}{count} → {count + 1}）</option>}
      <option value="set">{t("填写包含本次的累计值")}</option>
    </select>{countChoice === 'set' && <input inputMode="numeric" aria-label={t("包含本次的累计值")} value={countDraft} onChange={event => setCountDraft(event.target.value)} />}{!countValid && <small className="form-error">{t("请输入非负安全整数；未知次数不能直接 +1。")}</small>}</label>
    <p className="feature-help" role="status">{t("预览：")}{count === undefined && countChoice === 'keep' ? t('累计保持未记录') : t("累计 {0} → {1}", [count === undefined ? '未记录' : count, nextCount === undefined ? '未记录' : nextCount])}。</p>
    {error && <p className="form-error" role="alert">{t(error)}</p>}
    <div className="modal-actions"><button className="button button--ghost" onClick={onCancel}>{t("取消")}</button><button className="button button--primary" disabled={!dateValid || !countValid} onClick={submit}><Star size={14} />{t("保存这条完成记录")}</button></div>
  </div>;
}
