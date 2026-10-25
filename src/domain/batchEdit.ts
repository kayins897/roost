import { emptyGameTags, flattenGameTags, GAME_PLAY_STATES, GAME_TAG_KEYS, gamePlayStateFor, gameTagsFor, isValidPersonalGrade, legacyStatusForGameState, normalizeTags } from './library.ts';
import { gradeEditable, priorityEditable } from './gameProgress.ts';
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

/** v0.4.24 批量双维度补丁：只写新字段，不改旧轴、等级、时长或标签；同值作品引用不变。 */
export function createBatchProgressPatch(items: MediaItem[], selectedIds: readonly string[], patch: Partial<Pick<MediaItem, 'playEngagement' | 'completion'>>, timestamp = new Date().toISOString()): { changedCount: number; items: MediaItem[]; changes: { id: string; title: string }[] } {
  const ids = new Set(selectedIds);
  let changedCount = 0;
  const changes: { id: string; title: string }[] = [];
  const result = items.map(item => {
    if (!ids.has(item.id) || item.category !== 'game' || item.removedAt) return item;
    const same = (Object.keys(patch) as ('playEngagement' | 'completion')[]).every(key => item[key] === patch[key]);
    if (same) return item;
    changedCount++; changes.push({ id: item.id, title: item.title });
    return { ...item, ...patch, updatedAt: timestamp };
  });
  return { changedCount, items: changedCount ? result : items, changes };
}

/** 纯等级批量补丁：不改状态、时长、标签或旧别名，仅对当前状态与维度匹配
 * （待体验→优先级 / 已通关→评级）的所选游戏生效；同等级零变化（引用与字段
 * 原样），变档时清除对应手动顺序。与 createGameBatchEditPlan 的"等级随状态"
 * 路径隔离，供多选工具栏快捷定级复用。 */
export function createBulkGradePatch(items: MediaItem[], selectedIds: readonly string[], mode: 'priority' | 'rating', grade: PersonalGrade | undefined, timestamp = new Date().toISOString()): { changedCount: number; items: MediaItem[] } {
  if (grade !== undefined && !isValidPersonalGrade(grade)) throw new Error('不支持的等级。');
  const ids = new Set(selectedIds);
  let changedCount = 0;
  const result = items.map(item => {
    if (!ids.has(item.id) || item.category !== 'game' || item.removedAt) return item;
    // v0.4.24：资格按双维度（计划/搁置可排优先级；通关/不适用/历史评级可评）。
    const matches = mode === 'priority' ? priorityEditable(item) : gradeEditable(item);
    if (!matches) return item;
    if ((mode === 'priority' ? item.playPriority : item.personalGrade) === grade) return item;
    changedCount++;
    return mode === 'priority'
      ? { ...item, playPriority: grade, priorityOrder: undefined, updatedAt: timestamp }
      : { ...item, personalGrade: grade, ratingOrder: undefined, updatedAt: timestamp };
  });
  return { changedCount, items: changedCount ? result : items };
}

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
