import { gamePlayStateFor, isValidPersonalGrade } from './library.ts';
import type { MediaItem } from './types.ts';

export { isValidPersonalGrade } from './library.ts';

export type CoverFinish = 'standard' | 'silver' | 'gold' | 'holographic' | 'prismatic';

export const GAME_GRADES = ['SSS', 'SS', 'S', 'A', 'B', 'C'] as const;

/** Presentation mapping only; it never infers or changes a personal grade. */
export const GAME_GRADE_TIERS = {
  SSS: { finish: 'prismatic', label: '棱彩星辉' },
  SS: { finish: 'holographic', label: '镭射全息' },
  S: { finish: 'gold', label: '金箔' },
  A: { finish: 'silver', label: '银箔' },
  B: { finish: 'standard', label: '标准' },
  C: { finish: 'standard', label: '标准' },
} as const satisfies Record<typeof GAME_GRADES[number], { finish: CoverFinish; label: string }>;

/** Stored grades survive status/category edits; only completed games show a rated finish. */
export function coverFinishFor(item: MediaItem): CoverFinish {
  if (item.category !== 'game' || gamePlayStateFor(item) !== 'cleared' || !isValidPersonalGrade(item.personalGrade)) return 'standard';
  return GAME_GRADE_TIERS[item.personalGrade].finish;
}
