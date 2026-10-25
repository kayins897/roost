import { COMPLETION_LABELS, COMPLETION_STATUSES, ENGAGEMENT_LABELS, PLAY_ENGAGEMENTS } from '../../domain/gameProgress.ts';
import type { CompletionStatus,GameTagGroupKey,MediaType,PlayEngagement,ProgressStatus } from '../../domain/types.ts';
export const statuses: { id: ProgressStatus | 'all'; label: string }[] = [
  { id: 'all', label: '全部作品' }, { id: 'want', label: '想体验' },
  { id: 'active', label: '进行中' }, { id: 'finished', label: '已完成' },
  { id: 'paused', label: '已搁置' },
];
/** v0.4.24：游戏筛选按当前游玩关系；通关进度为独立组合筛选。 */
export const gameStates: { id: PlayEngagement | 'all' | 'plan'; label: string }[] = [
  { id: 'all', label: '全部游戏' }, { id: 'plan', label: '待体验计划' },
  ...PLAY_ENGAGEMENTS.map(id => ({ id, label: ENGAGEMENT_LABELS[id] })),
];
export const completionFilters: { id: CompletionStatus | 'all'; label: string }[] = [
  { id: 'all', label: '全部进度' }, ...COMPLETION_STATUSES.map(id => ({ id, label: COMPLETION_LABELS[id] })),
];
export const gameTagExamples: Record<GameTagGroupKey, string[]> = {
  gameplay: ['动作', '回合制', '卡牌构筑', '探索', '解谜'],
  theme: ['科幻', '奇幻', '历史', '悬疑', '剧情向'],
  scenario: ['刚需联机', '需要沉浸', '放松解压', '碎片时间'],
  other: ['独立游戏', '高难度', '音乐出色', '想二刷'],
};
export const categories: MediaType[] = ['game', 'book', 'screen', 'music'];

export const COVER_FINISH_LABELS = { standard: '原始封面', silver: '银箔', gold: '金箔', holographic: '镭射全息', prismatic: '棱彩星辉' };
