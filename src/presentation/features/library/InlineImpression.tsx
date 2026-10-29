import { t } from '../../i18n/index.ts';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { impressionError, personalWritingFor, personalWritingPatch } from '../../../domain/personalWriting.ts';
import type { MediaItem } from '../../../domain/types.ts';
import { useUnsavedChanges } from '../../RecordEditors.tsx';
import type { ListWritingGuard } from './useListWritingGuard.ts';

export function InlineImpression({ item, locked, onPatch, guard }: {
  item: MediaItem; locked: boolean; onPatch: (id: string, patch: Partial<MediaItem>) => boolean;
  guard: RefObject<ListWritingGuard | null>;
}) {
  const original = personalWritingFor(item);
  const [draft, setDraft] = useState(original.impression), [base, setBase] = useState(original.impression);
  const [error, setError] = useState('');
  const owner = useRef<HTMLDivElement>(null);
  const dirty = draft !== base;
  useUnsavedChanges(dirty);
  // External refreshes update clean rows; an unsaved draft is never silently discarded.
  useEffect(() => { if (!dirty) { setDraft(original.impression); setBase(original.impression); } }, [original.impression, dirty]);
  function clearGuard() { if (guard.current?.owner === owner.current) guard.current = null; }
  function save() {
    if (!dirty) { clearGuard(); return true; }
    const validation = impressionError(draft);
    if (validation) { setError(validation); return false; }
    if (original.impression !== base) { setError('这条印象已在别处更新。请按 Esc 读取最新内容，再编辑。'); return false; }
    // Only this field changes; a legacy long impression moves intact into the review.
    if (!onPatch(item.id, personalWritingPatch(item, { impression: draft, review: original.review }))) {
      setError('保存失败，草稿已保留。按 Enter 重试，Esc 取消。'); return false;
    }
    setBase(draft); setError(''); clearGuard(); return true;
  }
  useEffect(() => {
    const element = owner.current;
    if (dirty && element) guard.current = { owner: element, save };
    return () => { if (guard.current?.owner === element) guard.current = null; };
  });
  return <div className="list-impression" ref={owner}>
    <label><input aria-label={t("{0}的一句话印象", [item.title])} value={draft} readOnly={locked}
      placeholder={locked ? t('退出多选后可编辑印象') : original.legacy ? t('原有长文已完整保留在测评中') : t('写下一句话印象…')}
      aria-invalid={!!error || !!impressionError(draft)} aria-describedby={error ? `impression-help-${item.id}` : undefined}
      onChange={event => { setDraft(event.target.value); setError(''); }} onBlur={save}
      onKeyDown={event => { if (event.nativeEvent.isComposing) return; if (event.key === 'Enter') { event.preventDefault(); save(); } if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDraft(original.impression); setBase(original.impression); setError(''); clearGuard(); } }} /></label>
    {error && <small id={`impression-help-${item.id}`} className="list-impression-error" role="alert">{t(error)}</small>}
  </div>;
}
