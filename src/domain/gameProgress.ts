import { legacyStatusForGameState } from './library.ts';
import type { CompletionEvent, CompletionStatus, MediaItem, PlayEngagement } from './types.ts';
import { experienceCategoryFor, experienceStatusFor } from './gameExperience.ts';

/** v0.4.24 双维度模型：当前游玩关系与通关进度相互独立；旧 gamePlayState/status 冻结为
 * 兼容来源，只读推导、不再反投影写入。新字段是新版事实来源。 */

export const PLAY_ENGAGEMENTS: readonly PlayEngagement[] = ['planned', 'playing', 'paused', 'inactive', 'abandoned'];
export const COMPLETION_STATUSES: readonly CompletionStatus[] = ['unknown', 'not-cleared', 'cleared', 'not-applicable'];

export const ENGAGEMENT_LABELS: Record<PlayEngagement, string> = {
  planned: '计划游玩', playing: '游玩中', paused: '暂时搁置', inactive: '当前不玩', abandoned: '已放弃',
};
/** 与通关进度无关的简短关系文案；用于卡片等紧凑位置。 */
export const ENGAGEMENT_SHORT: Record<PlayEngagement, string> = {
  planned: '计划', playing: '游玩中', paused: '搁置', inactive: '不玩', abandoned: '已放弃',
};
export const COMPLETION_LABELS: Record<CompletionStatus, string> = {
  unknown: '未确定', 'not-cleared': '明确未通关', cleared: '已通关', 'not-applicable': '不适用',
};

/** 新建/显式保存时旧轴的兼容投影；inactive 无旧对应值，落 paused（旧版无此概念）。 */
const ENGAGEMENT_LEGACY_STATE: Record<PlayEngagement, 'want' | 'playing' | 'paused' | 'abandoned'> = {
  planned: 'want', playing: 'playing', paused: 'paused', inactive: 'paused', abandoned: 'abandoned',
};

/** 有效当前关系：新字段明确值优先；缺省按旧 gamePlayState 只读推导。
 * 旧 cleared 无法可靠推断现在是否还在玩，返回 'unrecorded' 而不是猜测。 */
export function engagementFor(item: MediaItem): PlayEngagement | 'unrecorded' {
  if (item.playEngagement !== undefined) return item.playEngagement;
  const legacy = item.gamePlayState;
  if (legacy !== undefined) {
    if (legacy === 'want') return 'planned';
    if (legacy === 'playing' || legacy === 'ongoing' || legacy === 'replaying') return 'playing';
    if (legacy === 'paused') return 'paused';
    if (legacy === 'abandoned') return 'abandoned';
    return 'unrecorded'; // cleared
  }
  // 仅在缺少更具体旧值时按通用 status 回退；finished 只证明进度线，不推断当前关系。
  if (item.status === 'want') return 'planned';
  if (item.status === 'active') return 'playing';
  if (item.status === 'paused') return 'paused';
  return 'unrecorded';
}

/** 有效通关进度：completion 显式值（含 'unknown' 覆盖推导）优先；
 * 缺省按旧轴推导——cleared，或无 gamePlayState 且 status=finished。其余为未确定，
 * 不把 ongoing/replaying 推断成曾通关。 */
export function completionFor(item: MediaItem): CompletionStatus {
  if (item.completion !== undefined) return item.completion;
  if (item.gamePlayState === 'cleared') return 'cleared';
  if (item.gamePlayState === undefined && item.status === 'finished') return 'cleared';
  return 'unknown';
}

/** 有效完成次数：undefined=未记录（不从事件数、日志或时长推算），0=明确零次。 */
export function completionCountFor(item: MediaItem): number | undefined {
  return item.completionCount;
}

/** 评级资格只看整理分类：新游戏+与收官完结可评；历史等级和客观事实不授予资格。 */
export function gradeEditable(item: MediaItem): boolean {
  if (item.category !== 'game') return false;
  const category = experienceCategoryFor(item);
  return category === 'replayable' || category === 'completed';
}

/** 新作开荒、未完待续与新游戏+可安排优先级；其余分类保留历史值但不开放编辑。 */
export function priorityEditable(item: MediaItem): boolean {
  if (item.category !== 'game') return false;
  const category = experienceCategoryFor(item);
  return experienceStatusFor(item) === 'unplayed' || category === 'continue' || category === 'replayable';
}

/** 完成事件实际日期：YYYY / YYYY-MM / YYYY-MM-DD，日历合法（含闰年），不补精度。 */
export function isCompletionDate(value: string): boolean {
  if (/^\d{4}$/.test(value)) return Number(value) >= 1;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]);
  if (year < 1 || month < 1 || month > 12) return false;
  if (match[3] === undefined) return true;
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function isValidCompletionEvent(value: unknown): value is CompletionEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return typeof event.id === 'string' && event.id.trim().length > 0
    && (event.occurredAt === undefined || (typeof event.occurredAt === 'string' && isCompletionDate(event.occurredAt)))
    && typeof event.recordedAt === 'string' && isRecordedTimestamp(event.recordedAt)
    && (event.note === undefined || typeof event.note === 'string');
}

function isRecordedTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z'));
}

const validCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** 保存当前关系：只写新维度，不改通关进度/等级/时长/旧轴（旧轴冻结）。 */
export function engagementPatch(value: PlayEngagement): Partial<MediaItem> {
  return { playEngagement: value };
}

/** 保存通关进度：只写新维度；显式 'unknown' 覆盖历史推导。不改关系与等级。 */
export function completionPatch(value: CompletionStatus): Partial<MediaItem> {
  return { completion: value };
}

/** 新建游戏的兼容初值：旧轴接受关系投影，通关进度只进新字段。 */
export function newGameProjection(engagement: PlayEngagement, completion: CompletionStatus): Partial<MediaItem> {
  const legacy = ENGAGEMENT_LEGACY_STATE[engagement];
  return { playEngagement: engagement, completion, gamePlayState: legacy, status: legacyStatusForGameState(legacy) };
}

export function legacyStateForEngagement(engagement: PlayEngagement): 'want' | 'playing' | 'paused' | 'abandoned' {
  return ENGAGEMENT_LEGACY_STATE[engagement];
}

// ── 完成事件动作（纯函数补丁构造） ──────────────────────────────

export interface CompletionRecordInput {
  eventId: string;
  occurredAt?: string;
  note?: string;
  /** 次数选择：keep-unknown 保持未记录；start-at-one 从本次计为 1；increment 已知值+1；keep 保持现值（默认）。 */
  countChoice: 'keep-unknown' | 'start-at-one' | 'increment' | 'keep' | 'set';
  /** 仅 countChoice=set 时使用，明确包含本次在内的累计值。 */
  countValue?: number;
  /** 是否同时把通关进度标记为已通关（不适用进度默认保留，由调用方决定初始勾选）。 */
  markCleared: boolean;
}

export interface CompletionRecordPreview {
  countBefore: number | undefined;
  countAfter: number | undefined;
  completionBefore: CompletionStatus;
  completionAfter: CompletionStatus;
  note?: string;
}

/** 仅存于本次会话的撤销凭据；保存实际写入字段的精确前值，而不是由后值猜算。 */
export interface CompletionRecordUndo {
  itemId: string;
  event: CompletionEvent;
  fields: {
    completionCount?: { before: number | undefined; after: number | undefined };
    completion?: { before: CompletionStatus | undefined; after: CompletionStatus | undefined };
  };
}

/** 记录一次明确完成：事件、次数选择与进度标记一笔提交；幂等（同 eventId 已存在时返回 null）。 */
export function recordCompletion(item: MediaItem, input: CompletionRecordInput, now: string): { patch: Partial<MediaItem>; preview: CompletionRecordPreview; undo: CompletionRecordUndo } | null {
  if (item.category !== 'game' || item.removedAt || input.eventId.trim().length === 0 || !isRecordedTimestamp(now)) return null;
  if (item.completionEvents?.some(event => event.id === input.eventId)) return null;
  if (input.occurredAt !== undefined && !isCompletionDate(input.occurredAt)) return null;
  const countBefore = completionCountFor(item);
  let countAfter = countBefore;
  if (input.countChoice === 'increment') {
    if (countBefore === undefined) return null; // 未知累计不得隐式 +1
    countAfter = countBefore + 1;
    if (!validCount(countAfter)) return null;
  } else if (input.countChoice === 'start-at-one') {
    if (countBefore !== undefined) return null; // 只允许未知累计明确从本次开始；旧草稿不能重置后来录入的累计。
    countAfter = 1;
  }
  else if (input.countChoice === 'set') {
    if (!validCount(input.countValue)) return null;
    countAfter = input.countValue;
  }
  const completionBefore = completionFor(item);
  const completionAfter = input.markCleared ? 'cleared' as const : completionBefore;
  const event: CompletionEvent = {
    id: input.eventId,
    recordedAt: now,
    ...(input.occurredAt !== undefined && input.occurredAt !== '' ? { occurredAt: input.occurredAt } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  };
  const patch: Partial<MediaItem> = {
    completionEvents: [...(item.completionEvents ?? []), event],
    ...(countAfter !== countBefore ? { completionCount: countAfter } : {}),
    ...(completionAfter !== completionBefore ? { completion: completionAfter } : {}),
  };
  const undo: CompletionRecordUndo = {
    itemId: item.id, event: { ...event }, fields: {
      ...(countAfter !== countBefore ? { completionCount: { before: countBefore, after: countAfter } } : {}),
      ...(completionAfter !== completionBefore ? { completion: { before: item.completion, after: completionAfter } } : {}),
    },
  };
  return { patch, preview: { countBefore, countAfter, completionBefore, completionAfter, ...(event.note ? { note: event.note } : {}) }, undo };
}

/** 编辑事件的日期/备注：不重新计数、不改进度。 */
export function editCompletionEvent(item: MediaItem, eventId: string, change: { occurredAt?: string; note?: string }): Partial<MediaItem> | null {
  if (!item.completionEvents?.some(event => event.id === eventId)) return null;
  if (change.occurredAt !== undefined && change.occurredAt !== '' && !isCompletionDate(change.occurredAt)) return null;
  return {
    completionEvents: item.completionEvents.map(event => {
      if (event.id !== eventId) return event;
      const edited = { ...event };
      if (change.occurredAt !== undefined) {
        if (change.occurredAt === '') delete edited.occurredAt;
        else edited.occurredAt = change.occurredAt;
      }
      if (change.note !== undefined) {
        if (change.note.trim() === '') delete edited.note;
        else edited.note = change.note.trim();
      }
      return edited;
    }),
  };
}

/** 删除完成事件：只删记录；countCorrection 显式给出时同笔修正累计数，否则独立保留。 */
export function removeCompletionEvent(item: MediaItem, eventId: string, countCorrection?: number): Partial<MediaItem> | null {
  if (!item.completionEvents?.some(event => event.id === eventId)) return null;
  if (countCorrection !== undefined && !validCount(countCorrection)) return null;
  const patch: Partial<MediaItem> = { completionEvents: item.completionEvents.filter(event => event.id !== eventId) };
  if (countCorrection !== undefined) patch.completionCount = countCorrection;
  return patch;
}

/** 撤销一次记录：还原该事件及本次造成的次数/进度变化。仅当相关字段仍是本次写入的
 * 值时有效；已被后续修改时返回 null（禁止旧值覆盖新决定）。 */
export function undoCompletionRecord(item: MediaItem, receipt: CompletionRecordUndo): Partial<MediaItem> | null {
  if (item.id !== receipt.itemId || item.category !== 'game' || item.removedAt) return null;
  const event = item.completionEvents?.find(entry => entry.id === receipt.event.id);
  if (!event || JSON.stringify(event) !== JSON.stringify(receipt.event)) return null;
  const count = receipt.fields.completionCount;
  const completion = receipt.fields.completion;
  if (count && item.completionCount !== count.after) return null;
  if (completion && item.completion !== completion.after) return null;
  const patch: Partial<MediaItem> = { completionEvents: (item.completionEvents ?? []).filter(entry => entry.id !== receipt.event.id) };
  if (count) patch.completionCount = count.before;
  if (completion) patch.completion = completion.before;
  return patch;
}

/** 规划成员与优先级资格一致，不按旧计划/搁置关系分区。 */
export function inPlanView(item: MediaItem): boolean {
  return priorityEditable(item);
}
