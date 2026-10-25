import { completionFor, engagementFor, inPlanView, isValidCompletionEvent, PLAY_ENGAGEMENTS, COMPLETION_STATUSES } from './gameProgress.ts';
import type { GamePlayState, GameTagGroupKey, GameTagGroups, LibrarySnapshot, MediaItem, MediaType, PersonalGrade, ProgressStatus
, CompletionStatus, PlayEngagement } from './types.ts';
import { isValidImportExclusion } from './importExclusions.ts';
import { experienceCategoryFor, experienceStatusFor, isGameExperienceCategory, isGameExperienceStatus } from './gameExperience.ts';
import type { GameExperienceCategory, GameExperienceStatus } from './types.ts';

export const MEDIA_LABELS: Record<MediaType, string> = {
  game: '游戏', book: '书籍', screen: '影视', music: '音乐',
};
export const STATUS_LABELS: Record<ProgressStatus, string> = {
  want: '待体验', active: '进行中', finished: '已完成', paused: '暂时搁置',
};
export const GAME_MARK_LABELS: Record<ProgressStatus, string> = {
  want: '待体验', active: '无特殊标记', finished: '已通关', paused: '暂时搁置',
};
export const GAME_PLAY_LABELS: Record<GamePlayState, string> = {
  want: '待体验', playing: '游玩中', cleared: '已通关',
  replaying: '持续游玩', ongoing: '持续游玩', paused: '暂时搁置', abandoned: '已放弃',
};
/** Selectable states; replaying remains valid only when reading existing records. */
export const GAME_PLAY_STATES: GamePlayState[] = ['want', 'playing', 'cleared', 'ongoing', 'paused', 'abandoned'];

/** The existing status field remains for older backups and non-game modules. */
export function gamePlayStateFor(item: MediaItem): GamePlayState {
  // Normalize for presentation/filtering only, never rewrite a stored legacy value.
  if (item.gamePlayState) return item.gamePlayState === 'replaying' ? 'ongoing' : item.gamePlayState;
  if (item.status === 'want') return 'want';
  if (item.status === 'finished') return 'cleared';
  if (item.status === 'paused') return 'paused';
  return 'playing';
}

export function legacyStatusForGameState(state: GamePlayState): ProgressStatus {
  if (state === 'want') return 'want';
  // A generic four-state fallback; older app validators may still reject the new game enum.
  if (state === 'paused' || state === 'abandoned') return 'paused';
  if (state === 'cleared') return 'finished';
  return 'active';
}

/** A paused game can have hours, but the compact card prioritizes its state. */
export function shouldShowPlaytime(state: GamePlayState): boolean {
  return state !== 'want' && state !== 'paused';
}
export const GAME_TAG_LABELS: Record<GameTagGroupKey, string> = {
  gameplay: '玩法', theme: '题材', scenario: '游玩场景', other: '其他',
};
export const GAME_TAG_KEYS: GameTagGroupKey[] = ['gameplay', 'theme', 'scenario', 'other'];

export function normalizeTags(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map(x => x.trim()).filter(tag => {
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Platforms use the same whitespace and case-insensitive deduplication rules as tags. */
export function normalizePlatforms(values: string[]): string[] {
  return normalizeTags(values);
}

/** Do not split legacy text: a slash or comma can be part of the user's platform name. */
export function platformsFor(item: MediaItem): string[] {
  if (item.platforms !== undefined) return normalizePlatforms(item.platforms);
  return item.category === 'game' ? normalizePlatforms([item.subcategory]) : [];
}

export function emptyGameTags(): GameTagGroups {
  return { gameplay: [], theme: [], scenario: [], other: [] };
}

export function flattenGameTags(groups: GameTagGroups): string[] {
  return normalizeTags(GAME_TAG_KEYS.flatMap(key => groups[key]));
}

/** Keeps old game records usable without rewriting or discarding their tags. */
export function gameTagsFor(item: MediaItem): GameTagGroups {
  if (!item.gameTags) return { ...emptyGameTags(), other: normalizeTags(item.tags) };
  const groups = Object.fromEntries(GAME_TAG_KEYS.map(key => [key, normalizeTags(item.gameTags?.[key] ?? [])])) as GameTagGroups;
  const classified = new Set(flattenGameTags(groups).map(t => t.toLocaleLowerCase()));
  groups.other = normalizeTags([...groups.other, ...item.tags.filter(tag => !classified.has(tag.toLocaleLowerCase()))]);
  return groups;
}

export function tagsFor(item: MediaItem): string[] {
  return item.category === 'game' ? flattenGameTags(gameTagsFor(item)) : normalizeTags(item.tags);
}

export function gameTagCounts(items: MediaItem[]): Record<GameTagGroupKey, { name: string; count: number }[]> {
  const result = {} as Record<GameTagGroupKey, { name: string; count: number }[]>;
  for (const key of GAME_TAG_KEYS) {
    const counts = new Map<string, number>();
    for (const item of items.filter(i => i.category === 'game')) {
      for (const tag of gameTagsFor(item)[key]) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    result[key] = [...counts].map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
  }
  return result;
}

export function formatPlaytime(minutes?: number): string {
  if (minutes === undefined) return '未记录';
  if (minutes > 0 && minutes < 6) return `${minutes} 分钟`;
  const hours = minutes / 60;
  return `${(Number.isInteger(hours) ? hours : Number(hours.toFixed(1))).toLocaleString('zh-CN')} h`;
}

export function availableTags(items: MediaItem[]): { name: string; count: number }[] {
  const result = new Map<string, number>();
  for (const item of items) for (const tag of tagsFor(item)) {
    result.set(tag, (result.get(tag) ?? 0) + 1);
  }
  return [...result].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
}

export interface FilterParams {
  category?: MediaType;
  subcategory?: string;
  status?: ProgressStatus | 'all';
  gamePlayState?: GamePlayState | 'all';
  gameEngagement?: PlayEngagement | 'all' | 'plan';
  gameCompletion?: CompletionStatus | 'all';
  /** 两一级采用 OR；与二级及其他筛选 AND 组合。空数组表示空结果，由界面保护全空。 */
  gameExperienceStatuses?: readonly GameExperienceStatus[];
  gameExperienceCategories?: readonly GameExperienceCategory[];
  search?: string;
  tags?: string[];
  favoriteOnly?: boolean;
  gameTags?: Partial<Record<GameTagGroupKey, string[]>>;
}

export function filterLibrary(items: MediaItem[], params: FilterParams): MediaItem[] {
  const query = params.search?.trim().toLocaleLowerCase() ?? '';
  const gameState = params.gamePlayState === 'replaying' ? 'ongoing' : params.gamePlayState;
  return items.filter(item => {
    if (params.category && item.category !== params.category) return false;
    if (params.subcategory && (item.category === 'game'
      ? !platformsFor(item).some(platform => platform.toLocaleLowerCase() === params.subcategory!.toLocaleLowerCase())
      : item.subcategory !== params.subcategory)) return false;
    if (params.favoriteOnly && !item.favorite) return false;
    if (params.status && params.status !== 'all' && item.status !== params.status) return false;
    // v0.4.24 双维度筛选：当前关系（plan=计划+搁置）与通关进度独立 AND 组合。
    if (item.category === 'game') {
      if (params.gameExperienceStatuses && !params.gameExperienceStatuses.includes(experienceStatusFor(item))) return false;
      if (params.gameExperienceCategories && !params.gameExperienceCategories.some(value => experienceCategoryFor(item) === value)) return false;
      if (params.gameEngagement && params.gameEngagement !== 'all') {
        if (params.gameEngagement === 'plan') { if (!inPlanView(item)) return false; }
        else if (engagementFor(item) !== params.gameEngagement) return false;
      }
      if (params.gameCompletion && params.gameCompletion !== 'all' && completionFor(item) !== params.gameCompletion) return false;
    }
    if (gameState && gameState !== 'all' &&
      (item.category !== 'game' || gamePlayStateFor(item) !== gameState)) return false;
    if (params.tags?.some(tag => !tagsFor(item).some(t => t.toLocaleLowerCase() === tag.toLocaleLowerCase()))) return false;
    if (params.gameTags && GAME_TAG_KEYS.some(key => params.gameTags?.[key]?.some(tag =>
      item.category !== 'game' || !gameTagsFor(item)[key].some(value => value.toLocaleLowerCase() === tag.toLocaleLowerCase())))) return false;
    if (!query) return true;
    return [item.title, item.originalTitle, item.creator, item.subcategory, item.impression, item.review,
      ...platformsFor(item), ...tagsFor(item), ...(item.experienceEntries ?? []).map(entry => entry.note)]
      .some(field => field?.toLocaleLowerCase().includes(query));
  });
}

export interface TagScope {
  category?: MediaType;
  group?: GameTagGroupKey;
}

export function renameTag(items: MediaItem[], oldName: string, newName: string, scope?: TagScope): MediaItem[] {
  const source = oldName.trim().toLocaleLowerCase();
  const replacement = newName.trim();
  if (!source || !replacement) return items;
  return items.map(item => {
    if ((scope?.category && item.category !== scope.category) || (scope?.group && item.category !== 'game')) return item;
    const replace = (tags: string[]) => normalizeTags(tags.map(tag => tag.toLocaleLowerCase() === source ? replacement : tag));
    if (item.category !== 'game') return { ...item, tags: replace(item.tags) };
    const before = gameTagsFor(item);
    const gameTags = Object.fromEntries(GAME_TAG_KEYS.map(key => [key, !scope?.group || scope.group === key ? replace(before[key]) : before[key]])) as GameTagGroups;
    return { ...item, tags: flattenGameTags(gameTags), gameTags: { ...item.gameTags, ...gameTags } };
  });
}

export function deleteTag(items: MediaItem[], name: string, scope?: TagScope): MediaItem[] {
  const target = name.trim().toLocaleLowerCase();
  if (!target) return items;
  return items.map(item => {
    if ((scope?.category && item.category !== scope.category) || (scope?.group && item.category !== 'game')) return item;
    const remove = (tags: string[]) => tags.filter(tag => tag.toLocaleLowerCase() !== target);
    if (item.category !== 'game') return { ...item, tags: remove(item.tags) };
    const before = gameTagsFor(item);
    const gameTags = Object.fromEntries(GAME_TAG_KEYS.map(key => [key, !scope?.group || scope.group === key ? remove(before[key]) : before[key]])) as GameTagGroups;
    return { ...item, tags: flattenGameTags(gameTags), gameTags: { ...item.gameTags, ...gameTags } };
  });
}

/** 把游戏标签从一组移动到另一组：来源组移除、目标组按既有去重规则合并同名，
 * 其他分组（含跨组同名）保持不变；一次构造完整结果。仅改动来源组含该标签的作品。 */
export function moveGameTag(items: MediaItem[], name: string, from: GameTagGroupKey, to: GameTagGroupKey): MediaItem[] {
  const source = name.trim();
  const target = source.toLocaleLowerCase();
  if (!target || from === to) return items;
  return items.map(item => {
    if (item.category !== 'game') return item;
    const before = gameTagsFor(item);
    if (!before[from].some(tag => tag.toLocaleLowerCase() === target)) return item;
    const gameTags = Object.fromEntries(GAME_TAG_KEYS.map(key => {
      if (key === from) return [key, before[from].filter(tag => tag.toLocaleLowerCase() !== target)];
      if (key === to) return [key, normalizeTags([...before[to], source])];
      // 未涉及的分组保持原始存储值（不归一化）；仅旧平铺格式（无 gameTags）经推导重建时统一规范化。
      return [key, item.gameTags?.[key] ?? before[key]];
    })) as GameTagGroups;
    return { ...item, tags: flattenGameTags(gameTags), gameTags: { ...item.gameTags, ...gameTags } };
  });
}

function isSafeSourceLink(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:'; }
  catch { return false; }
}

function isLocalCover(value: string): boolean {
  return /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

/** Validate calendar dates without Date's automatic rollover or host timezone behavior. */
export function isExperienceDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1 || month < 1 || month > 12) return false;
  if (match[3] === undefined) return true;
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function isMinutes(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** A missing grade is handled by the optional field, never inferred from a platform. */
export function isValidPersonalGrade(value: unknown): value is PersonalGrade {
  return typeof value === 'string' && ['SSS', 'SS', 'S', 'A', 'B', 'C'].includes(value);
}

/** Lifecycle timestamps are new fields; malformed dates must not silently hide records. */
function isLifecycleTimestamp(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z'));
}

export function isValidSnapshot(value: unknown): value is LibrarySnapshot {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<LibrarySnapshot>;
  const categories: MediaType[] = ['game', 'book', 'screen', 'music'];
  const statuses: ProgressStatus[] = ['want', 'active', 'finished', 'paused'];
  return data.schemaVersion === 1 &&
    (data.importExclusions === undefined || (Array.isArray(data.importExclusions) && data.importExclusions.every(isValidImportExclusion))) &&
    Array.isArray(data.items) && data.items.every(item =>
    item && typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.title === 'string' && item.title.trim().length > 0 &&
    categories.includes(item.category) && typeof item.subcategory === 'string' &&
    typeof item.creator === 'string' && typeof item.year === 'string' &&
    statuses.includes(item.status) && Array.isArray(item.tags) &&
    (item.gamePlayState === undefined || item.gamePlayState === 'replaying' || GAME_PLAY_STATES.includes(item.gamePlayState)) &&
    (item.category !== 'game' || item.experienceStatus === undefined || isGameExperienceStatus(item.experienceStatus)) &&
    (item.category !== 'game' || item.experienceCategory === undefined || isGameExperienceCategory(item.experienceCategory)) &&
    item.tags.every((tag: unknown) => typeof tag === 'string') &&
    (item.playtimeMinutes === undefined || (typeof item.playtimeMinutes === 'number' && Number.isSafeInteger(item.playtimeMinutes) && item.playtimeMinutes >= 0)) &&
    (item.personalGrade === undefined || isValidPersonalGrade(item.personalGrade)) &&
    (item.playPriority === undefined || isValidPersonalGrade(item.playPriority)) &&
    (item.priorityOrder === undefined || (Number.isSafeInteger(item.priorityOrder) && item.priorityOrder >= 0)) &&
    (item.ratingOrder === undefined || (Number.isSafeInteger(item.ratingOrder) && item.ratingOrder >= 0)) &&
    (item.platforms === undefined || (Array.isArray(item.platforms) && item.platforms.every((platform: unknown) => typeof platform === 'string' && platform.trim().length > 0))) &&
    (item.externalIds === undefined || (Array.isArray(item.externalIds) && item.externalIds.every((external: unknown) => {
      if (!external || typeof external !== 'object') return false;
      const ref = external as Record<string, unknown>;
      return (ref.provider === 'steam' || ref.provider === 'douban') && typeof ref.id === 'string' && ref.id.trim().length > 0 &&
        (ref.url === undefined || (typeof ref.url === 'string' && isSafeSourceLink(ref.url)));
    }))) &&
    (item.experienceEntries === undefined || (Array.isArray(item.experienceEntries) && item.experienceEntries.every((value: unknown) => {
      if (!value || typeof value !== 'object') return false;
      const entry = value as Record<string, unknown>;
      return typeof entry.id === 'string' && entry.id.trim().length > 0 && typeof entry.date === 'string' && isExperienceDate(entry.date) &&
        ['started', 'progress', 'completed', 'note'].includes(entry.kind as string) && typeof entry.note === 'string' &&
        (entry.minutes === undefined || isMinutes(entry.minutes));
    }) && new Set(item.experienceEntries.map(entry => entry.id)).size === item.experienceEntries.length)) &&
    (item.playEngagement === undefined || PLAY_ENGAGEMENTS.includes(item.playEngagement)) &&
    (item.completion === undefined || COMPLETION_STATUSES.includes(item.completion)) &&
    (item.completionCount === undefined || (typeof item.completionCount === 'number' && Number.isSafeInteger(item.completionCount) && item.completionCount >= 0)) &&
    (item.completionEvents === undefined || (Array.isArray(item.completionEvents) && item.completionEvents.every((entry: unknown) => isValidCompletionEvent(entry)) && new Set(item.completionEvents.map(entry => entry.id)).size === item.completionEvents.length)) &&
    (item.gameTags === undefined || (item.gameTags && typeof item.gameTags === 'object' && GAME_TAG_KEYS.every(key =>
      Array.isArray(item.gameTags?.[key]) && item.gameTags[key].every((tag: unknown) => typeof tag === 'string')))) &&
    typeof item.impression === 'string' && (item.review === undefined || typeof item.review === 'string') && typeof item.favorite === 'boolean' &&
    typeof item.artwork === 'string' && typeof item.createdAt === 'string' &&
    typeof item.updatedAt === 'string' &&
    (item.hiddenAt === undefined || isLifecycleTimestamp(item.hiddenAt)) &&
    (item.removedAt === undefined || isLifecycleTimestamp(item.removedAt)) &&
    (item.originalTitle === undefined || typeof item.originalTitle === 'string') &&
    (item.sourceUrl === undefined || (typeof item.sourceUrl === 'string' && isSafeSourceLink(item.sourceUrl))) &&
    (item.coverUrl === undefined || (typeof item.coverUrl === 'string' && isLocalCover(item.coverUrl)))
  ) && new Set(data.items.map(item => item.id)).size === data.items.length;
}
