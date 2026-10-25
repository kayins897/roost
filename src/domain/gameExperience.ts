import type { GameExperienceCategory, GameExperienceStatus, MediaItem } from './types.ts';

export const EXPERIENCE_STATUSES: readonly GameExperienceStatus[] = ['unplayed', 'experienced'];
export const EXPERIENCE_CATEGORIES: readonly GameExperienceCategory[] = ['continue', 'replayable', 'long-term', 'completed', 'put-aside'];
export const EXPERIENCE_STATUS_LABELS: Record<GameExperienceStatus, string> = { unplayed: '待体验', experienced: '已体验' };
export const EXPERIENCE_CATEGORY_LABELS: Record<GameExperienceCategory, string> = {
  continue: '待续', replayable: '可重玩', 'long-term': '长线游玩', completed: '已通关', 'put-aside': '已放下',
};
/** 表现层映射至现有游戏语义色；领域不依赖 CSS 或具体色值。 */
export type GameExperienceTone = 'want' | 'playing' | 'ongoing' | 'cleared' | 'paused';
export const EXPERIENCE_STATUS_TONES: Record<GameExperienceStatus, GameExperienceTone> = { unplayed: 'want', experienced: 'playing' };
export const EXPERIENCE_CATEGORY_TONES: Record<GameExperienceCategory, GameExperienceTone> = {
  continue: 'playing', replayable: 'ongoing', 'long-term': 'ongoing', completed: 'cleared', 'put-aside': 'paused',
};

export function isGameExperienceStatus(value: unknown): value is GameExperienceStatus {
  return typeof value === 'string' && EXPERIENCE_STATUSES.includes(value as GameExperienceStatus);
}

export function isGameExperienceCategory(value: unknown): value is GameExperienceCategory {
  return typeof value === 'string' && EXPERIENCE_CATEGORIES.includes(value as GameExperienceCategory);
}

/** 手动一级始终优先，包括有时长/旧通关记录时明确设为待体验。
 * 缺省只认可正时长、明确通关/正次数和曾游玩的旧状态。搁置、放弃、计划与
 * inactive 均不单独证明曾体验；普通日志及完成事件不用于推断整理分类。 */
export function experienceStatusFor(item: MediaItem): GameExperienceStatus {
  if (item.experienceStatus !== undefined) return item.experienceStatus;
  if ((item.playtimeMinutes !== undefined && item.playtimeMinutes > 0)
    || item.completion === 'cleared'
    || (item.completionCount !== undefined && item.completionCount > 0)
    || item.playEngagement === 'playing') return 'experienced';
  if (item.gamePlayState !== undefined) {
    return ['playing', 'ongoing', 'replaying', 'cleared'].includes(item.gamePlayState) ? 'experienced' : 'unplayed';
  }
  return item.status === 'active' || item.status === 'finished' ? 'experienced' : 'unplayed';
}

/** 旧状态不等于用户新分类；二级只读显式值，待体验下不展示残存二级。 */
export function experienceCategoryFor(item: MediaItem): GameExperienceCategory | undefined {
  return experienceStatusFor(item) === 'experienced' ? item.experienceCategory : undefined;
}

export type ExperienceClassificationPatch = Partial<Pick<MediaItem, 'experienceStatus' | 'experienceCategory'>>;

/** 明确改一级只涉及分类；设待体验时同时清二级，不清等级、客观事实或原旧轴。 */
export function experienceStatusPatch(value: GameExperienceStatus): ExperienceClassificationPatch {
  if (!isGameExperienceStatus(value)) throw new Error('不支持的体验分类。');
  return value === 'unplayed' ? { experienceStatus: value, experienceCategory: undefined } : { experienceStatus: value };
}

/** 只改二级，不自动改变一级、通关进度或完成次数；调用方须满足已体验资格。 */
export function experienceCategoryPatch(value: GameExperienceCategory | undefined): ExperienceClassificationPatch {
  if (value !== undefined && !isGameExperienceCategory(value)) throw new Error('不支持的已体验分类。');
  return { experienceCategory: value };
}

/** 最终分类入口：待体验，或已体验下未分类/五个二级之一。 */
export type GameExperienceClassification = GameExperienceCategory | 'unclassified' | 'unplayed';

export function experienceClassificationPatch(value: GameExperienceClassification): ExperienceClassificationPatch {
  if (value === 'unplayed') return experienceStatusPatch('unplayed');
  return { ...experienceStatusPatch('experienced'), ...experienceCategoryPatch(value === 'unclassified' ? undefined : value) };
}

export type ExperienceBatchChange =
  | { kind: 'status'; value: GameExperienceStatus }
  | { kind: 'category'; value: GameExperienceCategory | undefined }
  | { kind: 'classification'; value: GameExperienceClassification };

/** 单件入口同样检查资格；无资格返回 null，合法但同值的补丁由调用方判定零变化。 */
export function createExperiencePatch(item: MediaItem, change: ExperienceBatchChange): ExperienceClassificationPatch | null {
  if (item.category !== 'game' || item.removedAt) return null;
  if (change.kind === 'status') return experienceStatusPatch(change.value);
  if (change.kind === 'classification') return experienceClassificationPatch(change.value);
  if (change.kind !== 'category') throw new Error('不支持的分类操作。');
  const patch = experienceCategoryPatch(change.value);
  return experienceStatusFor(item) === 'experienced' ? { experienceStatus: 'experienced', ...patch } : null;
}

export interface ExperienceBatchItemChange {
  id: string;
  title: string;
  before: MediaItem;
  after: MediaItem;
}

export interface ExperienceBatchPlan {
  selectedIds: string[];
  selectedCount: number;
  skippedCount: number;
  changedCount: number;
  changes: ExperienceBatchItemChange[];
  items: MediaItem[];
}

/** 预览和应用共用同一纯规则。提交前须针对最新库重新构造，保留预览后无关修改。
 * 去重选择；跳过非游戏/回收/缺失，二级另跳过待体验；仅变更分类与修改时间。 */
export function planExperienceBatchChange(items: MediaItem[], selectedIds: readonly string[], change: ExperienceBatchChange, timestamp: string): ExperienceBatchPlan {
  // 空选择也校验输入，避免非法动作被误当成成功的零修改。
  if (change.kind === 'status') experienceStatusPatch(change.value);
  else if (change.kind === 'classification') experienceClassificationPatch(change.value);
  else if (change.kind === 'category') experienceCategoryPatch(change.value);
  else throw new Error('不支持的分类操作。');
  const uniqueIds = [...new Set(selectedIds)];
  const selected = new Set(uniqueIds);
  const changes: ExperienceBatchItemChange[] = [];
  let selectedCount = 0;
  const result = items.map(item => {
    if (!selected.has(item.id)) return item;
    const patch = createExperiencePatch(item, change);
    if (patch === null) return item;
    selectedCount++;
    if ((Object.keys(patch) as (keyof ExperienceClassificationPatch)[]).every(key => item[key] === patch[key])) return item;
    const after = { ...item, ...patch, updatedAt: timestamp };
    changes.push({ id: item.id, title: item.title, before: item, after });
    return after;
  });
  return { selectedIds: uniqueIds, selectedCount, skippedCount: uniqueIds.length - selectedCount, changedCount: changes.length, changes, items: changes.length ? result : items };
}
