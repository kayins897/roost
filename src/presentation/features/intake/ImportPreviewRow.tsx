import type { SteamImportGame, SteamImportPreview } from '../../../domain/steamImport.ts';
import { MEDIA_LABELS, formatPlaytime } from '../../../domain/library.ts';
import { intakeSubject } from '../../../domain/intakeMetadata.ts';
import { t } from '../../i18n/index.ts';
import { ImportCorrection } from './ImportCorrection.tsx';

export function ImportPreviewRow({ row, selected, disabled, editing, message, canRead, onSelect, onEdit, onRead, onApply }: {
  row: SteamImportPreview; selected: boolean; disabled: boolean; editing: boolean; message?: string; canRead: boolean;
  onSelect: (value: boolean) => void; onEdit: (value: boolean) => void; onRead: () => void; onApply: (value: SteamImportGame) => void;
}) {
  const work = row.game, editable = work.category === 'book' || work.category === 'screen';
  const state = row.duplicate === 'excluded' ? t('已移除，跳过') : row.duplicate === 'existing-id' ? t('已收藏{0}', [row.matchedTitle ? `：${row.matchedTitle}` : '']) : row.duplicate === 'existing-name' ? t('收藏中同名{0}', [row.matchedTitle ? `：${row.matchedTitle}` : '']) : row.duplicate === 'source-id' ? t('清单内同来源编号／ISBN') : row.duplicate === 'source-name' ? t('清单内同名') : t('新增');
  return <div className={`intake-preview-entry${editing ? ' is-editing' : ''}`}>
    <div className={`steam-import-row${row.duplicate ? ' steam-import-row--duplicate' : ''}`}>
      <label className="intake-row-select"><input type="checkbox" aria-label={t('导入 {0}', [work.title])} disabled={!!row.duplicate || disabled || editing} checked={!row.duplicate && selected} onChange={event => onSelect(event.target.checked)} />
      {work.coverUrl && <img className="intake-preview-cover" src={work.coverUrl} alt="" />}
      <span className="steam-import-game"><strong>{work.title}</strong><small>{[t(MEDIA_LABELS[work.category ?? 'game']), work.creator, work.bookDetails?.publisher, work.subcategory ? ['电影', '连续剧', '番剧', '动漫'].includes(work.subcategory) ? t(work.subcategory) : work.subcategory : '', work.year, work.appId ? `Steam ${work.appId}` : undefined, work.playtimeMinutes !== undefined ? formatPlaytime(work.playtimeMinutes) : undefined].filter(Boolean).join(' · ')}</small><span className="steam-import-row-state">{state}</span></span></label>
      {editable && <div className="intake-row-actions"><button type="button" className="text-button" aria-label={t('修正 {0}', [work.title])} aria-expanded={editing} disabled={disabled} onClick={() => onEdit(!editing)}>{t('修正')}</button>{canRead && intakeSubject(work) && !row.duplicate && <button type="button" className="text-button" aria-label={t('读取 {0} 的豆瓣资料', [work.title])} disabled={disabled || editing} onClick={onRead}>{t('读取资料')}</button>}</div>}
    </div>
    {message && <p className="intake-row-message" role="status">{t(message)}</p>}
    {editing && <ImportCorrection work={work} onApply={onApply} onCancel={() => onEdit(false)} />}
  </div>;
}
