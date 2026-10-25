import { isValidPersonalGrade } from './library.ts';
import { gradeEditable } from './gameProgress.ts';
import type { MediaItem } from './types.ts';

export { isValidPersonalGrade } from './library.ts';

export type CoverFinish = 'standard' | 'silver' | 'gold' | 'foil' | 'holographic' | 'prismatic';

export const GAME_GRADES = ['SSS', 'SS', 'S', 'A', 'B', 'C'] as const;

/** Presentation mapping only; it never infers or changes a personal grade. */
export const GAME_GRADE_TIERS = {
  SSS: { finish: 'prismatic', label: '多彩' },
  SS: { finish: 'holographic', label: '镭射' },
  S: { finish: 'foil', label: '闪箔' },
  A: { finish: 'gold', label: '烫金' },
  B: { finish: 'silver', label: '烫银' },
  C: { finish: 'standard', label: '标准' },
} as const satisfies Record<typeof GAME_GRADES[number], { finish: CoverFinish; label: string }>;

/** Stored grades survive category edits; only rating-eligible games show a rated finish. */
export function coverFinishFor(item: MediaItem): CoverFinish {
  if (!gradeEditable(item) || !isValidPersonalGrade(item.personalGrade)) return 'standard';
  return GAME_GRADE_TIERS[item.personalGrade].finish;
}
