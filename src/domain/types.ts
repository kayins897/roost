export type MediaType = 'game' | 'book' | 'screen' | 'music';
export type ProgressStatus = 'want' | 'active' | 'finished' | 'paused';
/** A game's current relationship to the player, independent of its recorded hours.
 * replaying is a persisted legacy alias; current state controls offer ongoing instead. */
export type GamePlayState = 'want' | 'playing' | 'cleared' | 'replaying' | 'ongoing' | 'paused' | 'abandoned';
export type PersonalGrade = 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C';
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
