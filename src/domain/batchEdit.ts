import { emptyGameTags, flattenGameTags, GAME_PLAY_STATES, GAME_TAG_KEYS, gamePlayStateFor, gameTagsFor, isValidPersonalGrade, legacyStatusForGameState, normalizeTags } from './library.ts';
import type { GamePlayState, GameTagGroupKey, GameTagGroups, MediaItem, PersonalGrade } from './types.ts';

export interface GameBatchEditInput {
  /** Omit this field to keep each game's current state. */
  gamePlayState?: GamePlayState;
  playPriority?: PersonalGrade | null;
  personalGrade?: PersonalGrade | null;
  tags?: { mode: 'add' | 'remove'; groups: Partial<GameTagGroups> };
}

export interface GameBatchItemChange {
  id: string;
  title: string;
  before: MediaItem;
  after: MediaItem;
  tagChanges: { group: GameTagGroupKey; added: string[]; removed: string[] }[];
  stateChange?: { before: GamePlayState; after: GamePlayState };
  rankChange?: { label: string; before?: PersonalGrade; after?: PersonalGrade };
}

export interface GameBatchEditPlan {
  /** Unique requested IDs, including skipped non-game/missing IDs for an honest preview. */
  selectedIds: string[];
  input: GameBatchEditInput;
  timestamp: string;
  selectedCount: number;
  skippedCount: number;
  changedCount: number;
  changes: GameBatchItemChange[];
  /** Same order as the source library. Unchanged items retain their original reference. */
  items: MediaItem[];
}

const keyFor = (tag: string) => tag.toLocaleLowerCase();

function normalizedInput(input: GameBatchEditInput): GameBatchEditInput {
  if (input.gamePlayState !== undefined && !GAME_PLAY_STATES.includes(input.gamePlayState)) throw new Error('不支持的游戏状态。');
  for (const [key,state] of [['playPriority','want'],['personalGrade','cleared']] as const) if (input[key] !== undefined && (input.gamePlayState !== state || (input[key] !== null && !isValidPersonalGrade(input[key])))) throw new Error('等级与目标状态不匹配。');
  if (input.tags && input.tags.mode !== 'add' && input.tags.mode !== 'remove') throw new Error('不支持的标签操作。');
  return {
    ...(input.gamePlayState === undefined ? {} : { gamePlayState: input.gamePlayState }),
    ...(input.playPriority === undefined ? {} : { playPriority: input.playPriority }),
    ...(input.personalGrade === undefined ? {} : { personalGrade: input.personalGrade }),
    ...(input.tags ? { tags: { mode: input.tags.mode, groups: Object.fromEntries(GAME_TAG_KEYS.map(group => [group, normalizeTags(input.tags?.groups[group] ?? [])])) as GameTagGroups } } : {}),
  };
}

/**
 * Builds a read-only preview and its result. Rebuild against the latest library at commit
 * time so a preview never replaces unrelated changes made after it was displayed.
 * Only explicit tag/state changes touch a record; no hours, identity or history is inferred.
 */
export function createGameBatchEditPlan(items: MediaItem[], selectedIds: readonly string[], edit: GameBatchEditInput, timestamp = new Date().toISOString()): GameBatchEditPlan {
  const input = normalizedInput(edit);
  const uniqueIds = [...new Set(selectedIds)];
  const selected = new Set(uniqueIds);
  const changes: GameBatchItemChange[] = [];
  let selectedCount = 0;
  const result = items.map(item => {
    if (!selected.has(item.id) || item.category !== 'game') return item;
    selectedCount += 1;
    const beforeGroups = gameTagsFor(item);
    const nextGroups = { ...emptyGameTags(), ...beforeGroups };
    const tagChanges: GameBatchItemChange['tagChanges'] = [];
    if (input.tags) for (const group of GAME_TAG_KEYS) {
      const requested = input.tags.groups[group] ?? [];
      if (!requested.length) continue;
      const existing = new Set(beforeGroups[group].map(keyFor));
      const targets = new Set(requested.map(keyFor));
      const added = input.tags.mode === 'add' ? requested.filter(tag => !existing.has(keyFor(tag))) : [];
      const removed = input.tags.mode === 'remove' ? beforeGroups[group].filter(tag => targets.has(keyFor(tag))) : [];
      if (!added.length && !removed.length) continue;
      nextGroups[group] = input.tags.mode === 'add' ? [...beforeGroups[group], ...added] : beforeGroups[group].filter(tag => !targets.has(keyFor(tag)));
      tagChanges.push({ group, added, removed });
    }
    const beforeState = gamePlayStateFor(item);
    const targetState = input.gamePlayState;
    const stateChanges = targetState !== undefined && (beforeState !== targetState || item.status !== legacyStatusForGameState(targetState) || (targetState === 'ongoing' && item.gamePlayState === 'replaying'));
    const rankKey = input.playPriority !== undefined ? 'playPriority' : input.personalGrade !== undefined ? 'personalGrade' : undefined;
    const nextRank = rankKey ? input[rankKey] ?? undefined : undefined;
    const rankChanged = rankKey !== undefined && item[rankKey] !== nextRank;
    if (!tagChanges.length && !stateChanges && !rankChanged) return item;
    const after: MediaItem = {
      ...item,
      ...(tagChanges.length ? { gameTags: { ...item.gameTags, ...nextGroups }, tags: flattenGameTags(nextGroups) } : {}),
      ...(stateChanges ? { gamePlayState: targetState, status: legacyStatusForGameState(targetState!) } : {}),
      ...(rankChanged ? rankKey === 'playPriority' ? { playPriority: nextRank, priorityOrder: undefined } : { personalGrade: nextRank, ratingOrder: undefined } : {}),
      updatedAt: timestamp,
    };
    changes.push({ id: item.id, title: item.title, before: item, after, tagChanges,
      ...(rankChanged ? { rankChange: { label: rankKey === 'playPriority' ? '待体验优先级' : '通关评级', before: item[rankKey!], after: nextRank } } : {}),
      ...(stateChanges ? { stateChange: { before: beforeState, after: targetState! } } : {}),
    });
    return after;
  });
  return { selectedIds: uniqueIds, input, timestamp, selectedCount, skippedCount: uniqueIds.length - selectedCount, changedCount: changes.length, changes, items: changes.length ? result : items };
}
