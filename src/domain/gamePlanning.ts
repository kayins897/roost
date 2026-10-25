import { isValidPersonalGrade } from './library.ts';
import { experienceCategoryFor } from './gameExperience.ts';
import { completionFor, inPlanView } from './gameProgress.ts';
import { GAME_GRADES } from './gameRating.ts';
import type { MediaItem } from './types.ts';
import type { SortDirection } from './librarySort.ts';

export type RankMode = 'priority' | 'rating';
export type RankedGameGroup = { id: string; label: string; items: MediaItem[] };
const orderKey = (mode: RankMode) => mode === 'priority' ? 'priorityOrder' : 'ratingOrder';
const normalGame = (item: MediaItem) => item.category === 'game' && !item.hiddenAt && !item.removedAt;
const inRankView = (item: MediaItem, mode: RankMode) => normalGame(item) && (mode === 'priority' ? inPlanView(item) : (completionFor(item) === 'cleared' || experienceCategoryFor(item) === 'completed'));
const validOrder = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function rankId(item: MediaItem, mode: RankMode): string {
  const grade = mode === 'priority' ? item.playPriority : item.personalGrade;
  return isValidPersonalGrade(grade) ? grade : 'unranked';
}
/** Explicit order wins; legacy records and equal order values retain the caller's stable sort. */
function sortRank(items: MediaItem[], mode: RankMode): MediaItem[] {
  const key = orderKey(mode);
  return items.map((item, index) => ({ item, index })).sort((a, b) => {
    const first = a.item[key], second = b.item[key];
    if (validOrder(first) && validOrder(second) && first !== second) return first - second;
    if (validOrder(first) !== validOrder(second)) return validOrder(first) ? -1 : 1;
    return a.index - b.index;
  }).map(entry => entry.item);
}
/** Presentation derivation only: reading groups never adds ranks or order to an old library. */
export function groupRankedGames(items: MediaItem[], mode: RankMode, manualOrder = true, direction: SortDirection = 'desc'): RankedGameGroup[] {
  const grades = direction === 'asc' ? [...GAME_GRADES].reverse() : GAME_GRADES;
  const groups: RankedGameGroup[] = grades.map(id => ({ id, label: id, items: [] }));
  groups.push({ id: 'unranked', label: mode === 'priority' ? '未设置优先级' : '未评级', items: [] });
  const byId = new Map(groups.map(group => [group.id, group]));
  for (const item of items) if (inRankView(item, mode)) byId.get(rankId(item, mode))!.items.push(item);
  if (manualOrder) for (const group of groups) group.items = sortRank(group.items, mode);
  return groups;
}

/** Move to the target's old position, so both drag and up/down commands use the same action.
 * Only the normal, eligible same-rank subset receives an explicit order. No dates or grades change. */
export function moveGameWithinRank(allItems: MediaItem[], sourceId: string, targetId: string, mode: RankMode): { items: MediaItem[]; changedCount: number } {
  const unchanged = { items: allItems, changedCount: 0 };
  if (sourceId === targetId || new Set(allItems.map(item => item.id)).size !== allItems.length) return unchanged;
  const sources = allItems.filter(item => item.id === sourceId), targets = allItems.filter(item => item.id === targetId);
  if (sources.length !== 1 || targets.length !== 1) return unchanged;
  const source = sources[0], target = targets[0];
  // 同组判定只看有效视图资格与等级档，不再比较旧单轴状态——
  // 两款都有效通关的作品即使旧轴分别是 cleared 与 playing 也可同级移动。
  if (!inRankView(source, mode) || !inRankView(target, mode) || rankId(source, mode) !== rankId(target, mode)) return unchanged;
  const group = sortRank(allItems.filter(item => inRankView(item, mode) && rankId(item, mode) === rankId(source, mode)), mode);
  const from = group.findIndex(item => item.id === sourceId), to = group.findIndex(item => item.id === targetId);
  group.splice(from, 1); group.splice(to, 0, source);
  const positions = new Map(group.map((item, index) => [item.id, index])), key = orderKey(mode);
  let changedCount = 0;
  const items = allItems.map(item => {
    const position = positions.get(item.id);
    if (position === undefined || item[key] === position) return item;
    changedCount++; return { ...item, [key]: position };
  });
  return changedCount ? { items, changedCount } : unchanged;
}
