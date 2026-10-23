import { GAME_PLAY_LABELS,GAME_PLAY_STATES } from '../../domain/library.ts';
import type { GamePlayState,GameTagGroupKey,MediaType,ProgressStatus } from '../../domain/types.ts';
export const statuses: { id: ProgressStatus | 'all'; label: string }[] = [
  { id: 'all', label: '全部作品' }, { id: 'want', label: '想体验' },
  { id: 'active', label: '进行中' }, { id: 'finished', label: '已完成' },
  { id: 'paused', label: '已搁置' },
];
export const gameStates: { id: GamePlayState | 'all'; label: string }[] = [
  { id: 'all', label: '全部游戏' }, ...GAME_PLAY_STATES.map(id => ({ id, label: GAME_PLAY_LABELS[id] })),
];
export const gameTagExamples: Record<GameTagGroupKey, string[]> = {
  gameplay: ['动作', '回合制', '卡牌构筑', '探索', '解谜'],
  theme: ['科幻', '奇幻', '历史', '悬疑', '剧情向'],
  scenario: ['刚需联机', '需要沉浸', '放松解压', '碎片时间'],
  other: ['独立游戏', '高难度', '音乐出色', '想二刷'],
};
export const categories: MediaType[] = ['game', 'book', 'screen', 'music'];

export const COVER_FINISH_LABELS = { standard: '原始封面', silver: '银箔', gold: '金箔', holographic: '镭射全息', prismatic: '棱彩星辉' };
