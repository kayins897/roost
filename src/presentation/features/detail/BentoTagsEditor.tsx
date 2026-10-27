import { useState } from 'react';
import { emptyGameTags, flattenGameTags, GAME_TAG_KEYS, GAME_TAG_LABELS, gameTagCounts, gameTagsFor, normalizeTags } from '../../../domain/library.ts';
import type { GameTagGroupKey, GameTagGroups, MediaItem } from '../../../domain/types.ts';
import { TagPickerGroup } from '../tags/TagPickerGroup.tsx';
import { BentoSaveForm, type BentoSave } from './BentoContentEditors.tsx';

export function BentoTagsEditor({ item, availableItems, save, close }: { item: MediaItem; availableItems: MediaItem[]; save: BentoSave; close: () => void }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(GAME_TAG_KEYS.map(key => [key, gameTagsFor(item)[key].join('、')])) as Record<GameTagGroupKey, string>);
  const [error, setError] = useState('');
  const choices = gameTagCounts(availableItems.filter(value => value.category === 'game' && !value.hiddenAt && !value.removedAt));
  return <BentoSaveForm error={error} onClose={close} onSubmit={() => {
    const gameTags = { ...emptyGameTags(), ...item.gameTags, ...Object.fromEntries(GAME_TAG_KEYS.map(key => [key, normalizeTags(draft[key].split(/[,，、\n]+/))])) } as GameTagGroups;
    const ok = save({ gameTags, tags: flattenGameTags(gameTags) }); if (!ok) setError('标签未能保存，请重试。'); return ok;
  }}>{GAME_TAG_KEYS.map(key => <TagPickerGroup key={key} label={GAME_TAG_LABELS[key]} value={draft[key]} available={choices[key]} onChange={value => setDraft(current => ({ ...current, [key]: value }))} />)}</BentoSaveForm>;
}
