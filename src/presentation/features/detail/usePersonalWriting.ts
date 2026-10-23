import { useEffect, useState } from 'react';
import { impressionError, personalWritingFor, personalWritingPatch, type PersonalWriting } from '../../../domain/personalWriting.ts';
import type { MediaItem } from '../../../domain/types.ts';
import { useUnsavedChanges } from '../../RecordEditors.tsx';

export function usePersonalWriting(item: MediaItem, onPatch: (patch: Partial<MediaItem>) => boolean) {
  const original = personalWritingFor(item);
  const [draft, setDraft] = useState<PersonalWriting>(original);
  const [saveError, setSaveError] = useState('');
  useEffect(() => { setDraft(personalWritingFor(item)); setSaveError(''); }, [item.id, item.impression, item.review]);
  const dirty = draft.impression !== original.impression || draft.review !== original.review;
  const validation = impressionError(draft.impression);
  useUnsavedChanges(dirty);
  function save() {
    if (!dirty) return true;
    if (validation) { setSaveError(validation); return false; }
    const saved = onPatch(personalWritingPatch(item, draft));
    setSaveError(saved ? '' : '未能保存，草稿仍保留在这里，请重试。');
    return saved;
  }
  function edit(key: keyof PersonalWriting, value: string) { setDraft(current => ({ ...current, [key]: value })); setSaveError(''); }
  return { draft, dirty, legacy: original.legacy, validation, saveError, save, edit };
}
