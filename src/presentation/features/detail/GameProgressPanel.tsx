import { t } from '../../i18n/index.ts';
import { Heart, Pencil, Plus, RotateCcw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { completionCountFor, undoCompletionRecord, type CompletionRecordUndo } from '../../../domain/gameProgress.ts';
import type { MediaItem } from '../../../domain/types.ts';
import { formatPlaytime, GAME_PLAY_LABELS } from '../../../domain/library.ts';
import { CompletionCountEditor } from './CompletionCountEditor.tsx';
import { CompletionEvents } from './CompletionEvents.tsx';
import { CompletionRecordForm } from './CompletionRecordForm.tsx';
import { GameExperiencePicker } from './GameExperiencePicker.tsx';
import { GameRating } from './GameRating.tsx';
import { experienceClassificationPatch } from '../../../domain/gameExperience.ts';
import { CLASSIFICATIONS, CLASSIFICATION_LABELS, classificationFor } from '../library/experienceOptions.ts';

/** Current activity, completion, and explicitly recorded totals remain independent. */
export function GameProgressPanel({ item, onPatch, onEditTime, footprint }: { item: MediaItem; onPatch: (patch: Partial<MediaItem>) => boolean; onEditTime: () => void; footprint: ReactNode }) {
  const locked = Boolean(item.removedAt);
  const classification = classificationFor(item), count = completionCountFor(item);
  const [recording, setRecording] = useState(false);
  const [editingCount, setEditingCount] = useState(false);
  const [undoable, setUndoable] = useState<CompletionRecordUndo | null>(null);
  const [message, setMessage] = useState('');
  function undoRecord() {
    if (!undoable) return;
    const patch = undoCompletionRecord(item, undoable);
    if (!patch) { setMessage('相关内容在记录后已被修改，无法自动撤销；请手动修正次数或进度。'); setUndoable(null); return; }
    if (onPatch(patch)) { setUndoable(null); setMessage('已撤销本次记录。'); }
    else setMessage('撤销未能保存，请重试。');
  }
  return <>
    <section className="detail-bento-card bento-experience" aria-label={t("我的体验")}>
      <div className="detail-personal-heading"><h3>{t("我的体验")}</h3>{!locked && <button className="icon-button" onClick={() => onPatch({ favorite: !item.favorite })} aria-label={item.favorite ? t('取消喜欢') : t('标为喜欢')}><Heart size={17} fill={item.favorite ? 'currentColor' : 'none'} /></button>}</div>
      <GameExperiencePicker label={t("体验分类")} isCurrentExplicit={item.experienceStatus !== undefined} value={classification} currentLabel={CLASSIFICATION_LABELS[classification]} options={CLASSIFICATIONS} labels={CLASSIFICATION_LABELS} className="engagement-picker" tone={`experience-color--${classification}`} locked={locked} onChange={value => onPatch(experienceClassificationPatch(value))} />
      {item.experienceStatus === undefined && item.gamePlayState !== undefined && <p className="feature-help legacy-classification-note">{t("旧分类：")}{t(GAME_PLAY_LABELS[item.gamePlayState])}{t("。选择新分类后保留原始记录，不自动改写。")}</p>}
      <div className="bento-ratings"><GameRating item={item} locked={locked} onPatch={onPatch} /></div>
    </section>
    <div className="bento-stats" aria-label={t("游玩统计")}>
      <section className="detail-bento-card bento-stat" aria-label={t("游玩时长")}><div className="bento-stat-heading"><h3>{t("游玩时长")}</h3>{!locked && <button className="text-button" onClick={onEditTime} aria-label={t("修改时长")}><Pencil size={13} /></button>}</div><strong className="bento-stat-value">{item.playtimeMinutes === undefined ? t('未记录') : formatPlaytime(item.playtimeMinutes)}</strong><span className="bento-stat-caption">{t("累计游玩")}</span></section>
      <section className="detail-bento-card bento-stat" aria-label={t("完成次数")}><div className="bento-stat-heading"><h3>{t("完成次数")}</h3>{!locked && !editingCount && <button className="text-button" onClick={() => setEditingCount(true)} aria-label={t("编辑次数")}><Pencil size={13} /></button>}</div><strong className="bento-stat-value">{count === undefined ? t('未记录') : <>{count}<small>{t("次")}</small></>}</strong>
        {editingCount && !locked ? <CompletionCountEditor count={count} onCancel={() => setEditingCount(false)} onSave={value => { if (!onPatch({ completionCount: value })) return false; setEditingCount(false); setMessage('累计完成次数已更新。'); return true; }} /> : <span className="bento-stat-caption">{t("手动记录 · 不由日志推算")}</span>}
      </section>
    </div>
    <section className="detail-bento-card bento-footprint" aria-label={t("体验足迹")}>
      <div className="bento-footprint-history">{footprint}<CompletionEvents item={item} onPatch={onPatch} /></div>
      {!locked && <div className="completion-actions">
        {!recording && <button className="button button--secondary" onClick={() => setRecording(true)}><Plus size={14} />{t("记录一次完成")}</button>}
        {undoable && <button className="button button--ghost" onClick={undoRecord}><RotateCcw size={14} />{t("撤销本次")}</button>}
      </div>}
      {recording && !locked && <CompletionRecordForm item={item} onPatch={onPatch} onCancel={() => setRecording(false)} onRecorded={receipt => { setUndoable(receipt); setRecording(false); setMessage('已记录一次完成。'); }} />}
      {message && <p className="feature-help" role="status">{t(message)}</p>}
      {locked && <p className="feature-help">{t("回收站中的记录只读，恢复后可编辑。")}</p>}
    </section>
  </>;
}
