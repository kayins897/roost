export type MediaType = 'game' | 'book' | 'screen' | 'music';
export type ProgressStatus = 'want' | 'active' | 'finished' | 'paused';
/** A game's current relationship to the player, independent of its recorded hours.
 * replaying is a persisted legacy alias; current state controls offer ongoing instead. */
export type GamePlayState = 'want' | 'playing' | 'cleared' | 'replaying' | 'ongoing' | 'paused' | 'abandoned';
export type PersonalGrade = 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C';
/** 独立于通关进度的当前游玩关系（v0.4.24 新维度；旧 gamePlayState 冻结为兼容来源）。 */
export type PlayEngagement = 'planned' | 'playing' | 'paused' | 'inactive' | 'abandoned';
/** 通关进度四值；unknown 同时用于旧库只读推导的缺省与用户显式覆盖"未确定"。 */
export type CompletionStatus = 'unknown' | 'not-cleared' | 'cleared' | 'not-applicable';
/** 手动体验分类优先于时长、通关事实与历史状态；缺省只读回退，不启动补写。 */
export type GameExperienceStatus = 'unplayed' | 'experienced';
/** 已体验下可选的单一整理分类，独立于客观通关事实与当前活动。 */
export type GameExperienceCategory = 'continue' | 'replayable' | 'long-term' | 'completed' | 'put-aside';
/** 用户明确记录的一次完成；日期保留原始精度，缺省表示实际发生日期未知。 */
export interface CompletionEvent {
  id: string;
  /** YYYY / YYYY-MM / YYYY-MM-DD；不虚构精度。 */
  occurredAt?: string;
  /** 录入时间（ISO），仅用于展示排序，不冒充实际发生日期。 */
  recordedAt: string;
  note?: string;
}
export type GameTagGroupKey = 'gameplay' | 'theme' | 'scenario' | 'other';
export type GameTagGroups = Record<GameTagGroupKey, string[]>;
export type MetadataProvider = 'steam' | 'douban';

export interface ExternalId {
  provider: MetadataProvider;
  id: string;
  url?: string;
}

export type ExperienceKind = 'started' | 'progress' | 'completed' | 'note';
export interface ExperienceEntry {
  id: string;
  /** Actual experience date, keeping month-only entries at their original precision. */
  date: string;
  kind: ExperienceKind;
  note: string;
  /** Optional session duration; it does not overwrite the cumulative playtime. */
  minutes?: number;
}

export interface MediaItem {
  id: string;
  title: string;
  originalTitle?: string;
  category: MediaType;
  subcategory: string;
  /** A work can belong to several platforms; older games fall back to subcategory. */
  platforms?: string[];
  externalIds?: ExternalId[];
  experienceEntries?: ExperienceEntry[];
  creator: string;
  year: string;
  status: ProgressStatus;
  /** Optional for backwards-compatible v0.1/v0.2 snapshots. */
  gamePlayState?: GamePlayState;
  /** 必选一级的可选存储值：缺省由历史证据只读推导；显式值始终优先。 */
  experienceStatus?: GameExperienceStatus;
  /** 仅在有效已体验时展示；缺省不根据旧状态猜测二级分类。 */
  experienceCategory?: GameExperienceCategory;
  /** v0.4.24 当前游玩关系；undefined 时按旧 gamePlayState 只读推导。 */
  playEngagement?: PlayEngagement;
  /** v0.4.24 通关进度；undefined 时按旧轴推导，'unknown' 显式覆盖推导。 */
  completion?: CompletionStatus;
  /** 累计完成次数：undefined=未记录，0=明确零次，N=用户明确值；不从日志或事件数推算。 */
  completionCount?: number;
  /** 用户明确记录的完成事件；与普通体验日志相互独立。 */
  completionEvents?: CompletionEvent[];
  /** For games, undefined means "not recorded", while 0 means zero hours. */
  playtimeMinutes?: number;
  /** User-authored grade, retained across status/category changes; undefined is unrated. */
  personalGrade?: PersonalGrade;
  /** Planned consumption priority; independent of a completed game's personal grade. */
  playPriority?: PersonalGrade;
  /** Explicit order within a priority or completed-grade group. */
  priorityOrder?: number;
  ratingOrder?: number;
  tags: string[];
  /** Grouped game tags; legacy uncategorized game tags fall back to "other". */
  gameTags?: GameTagGroups;
  impression: string;
  /** Optional long-form personal review; old combined impressions remain readable. */
  review?: string;
  favorite: boolean;
  sourceUrl?: string;
  coverUrl?: string;
  artwork: string;
  createdAt: string;
  updatedAt: string;
  /** Optional visibility preference; unrelated to progress or personal history. */
  hiddenAt?: string;
  /** A complete recoverable item remains in the snapshot until explicitly purged. */
  removedAt?: string;
}

export interface LibrarySnapshot {
  schemaVersion: 1;
  items: MediaItem[];
  exportedAt?: string;
  /** External works explicitly removed by the user must not return on import. */
  importExclusions?: ExternalId[];
}

export interface LibraryRepository {
  load(): LibrarySnapshot;
  save(data: LibrarySnapshot, options?: { allowRecovery?: boolean; backupBeforeAppend?: boolean }): void;
}
