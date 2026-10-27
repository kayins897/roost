import { createSeed } from '../reading-workspace/seed';
import type { PreviewState, ReadingRound, Work } from '../reading-workspace/model';

// Synthetic presentation data only. No new production fields or storage contract.
export const BOOK_TAGS: Record<string, string[]> = {
  b1: ['文学', '城市', '旅行', '哲学'], b2: ['文学', '哲学', '成长'],
  b3: ['设计', '美学', '生活'], b4: ['科幻', '宇宙', '冒险'],
  b5: ['心理', '生活', '非虚构'], b6: ['社会', '经济', '非虚构'],
  b7: ['科普', '宇宙', '科学'], b8: ['文学', '哲学'],
};
export const COLLECTIONS = [
  { id: 'cities', title: '城市与远方', description: '跟随文字，去往别处。', bookIds: ['b1', 'b8', 'b4'] },
  { id: 'world', title: '理解世界', description: '从身边的生活，到更辽阔的世界。', bookIds: ['b6', 'b7', 'b5', 'b3'] },
];

export function createDeskSeed(): PreviewState {
  const seed = createSeed();
  const works = seed.works.filter(work => work.category === 'book');
  works.push(
    { id: 'b6', title: '置身事内', subtitle: '兰小欢', category: 'book', tone: '#e9dfc4', accent: '#b44c37', year: '2021', format: '非虚构', description: '从身边的经济生活出发，尝试理解我们身处的世界。' },
    { id: 'b7', title: '时间简史', subtitle: '史蒂芬·霍金', category: 'book', tone: '#183851', accent: '#e8e6cf', year: '1988', format: '科普', description: '面向普通读者的宇宙、时间与物理之旅。' },
    { id: 'b8', title: '局外人', subtitle: '阿尔贝·加缪', category: 'book', tone: '#e9ddc5', accent: '#b94939', year: '1942', format: '文学', description: '关于个体、世界与人的处境。' },
  );
  return {
    works,
    plans: [
      ...seed.plans.filter(plan => works.some(work => work.id === plan.workId)),
      { id: 'desk-p6', workId: 'b6', state: 'queued', reason: '理解身边的现实，或许就能理解自己。', order: 2 },
    ],
    rounds: [
      ...seed.rounds,
      { id: 'desk-r3', workId: 'b1', finishedOn: '2026-03', impression: '读完之后，开始留意路过的每一座城。', review: '城市既存在于地图上，也存在于每个人的记忆里。\n\n再次阅读时，想把那些曾经忽略的街道和路口重新走一遍。' },
      { id: 'desk-r4', workId: 'b3', finishedOn: '2025-11', impression: '重新观察那些习以为常的日常。', review: '好的设计让人重新看见，而不仅仅是看起来新鲜。' },
      { id: 'desk-r5', workId: 'b2', finishedOn: '2023-06', impression: '有些答案，要走过一遍才会明白。', review: '第一次阅读时，记住的是出发；后来记住的是倾听。' },
      { id: 'desk-r6', workId: 'b8', finishedOn: '2026-07', impression: '炙热的日光下，人的孤独变得清晰。', review: '' },
    ],
    activities: seed.activities.filter(activity => works.some(work => work.id === activity.workId)),
  };
}

export function latestRound(state: PreviewState, workId: string): ReadingRound | undefined {
  return state.rounds.filter(round => round.workId === workId)
    .sort((a, b) => (b.finishedOn ?? '').localeCompare(a.finishedOn ?? ''))[0];
}

export function matchesBook(state: PreviewState, work: Work, query: string): boolean {
  const text = query.trim().toLocaleLowerCase();
  return !text || [work.title, work.subtitle, work.format, ...(BOOK_TAGS[work.id] ?? []),
    ...state.plans.filter(plan => plan.workId === work.id).map(plan => plan.reason),
    ...state.rounds.filter(round => round.workId === work.id).flatMap(round => [round.impression, round.review]),
  ].join(' ').toLocaleLowerCase().includes(text);
}

export function tagCounts(works: Work[]) {
  const counts = new Map<string, number>();
  for (const work of works) for (const tag of new Set(BOOK_TAGS[work.id] ?? [])) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-CN'));
}

export function readingSummary(state: PreviewState) {
  const readings = state.activities.filter(activity => activity.kind === 'reading');
  const known = readings.filter(activity => activity.minutes !== undefined);
  const minutes = known.length ? known.reduce((sum, activity) => sum + activity.minutes!, 0) : undefined;
  return { books: new Set(state.rounds.map(round => round.workId)).size, rounds: state.rounds.length, minutes,
    unknown: readings.filter(activity => activity.minutes === undefined).length };
}

export function durationLabel(minutes?: number) {
  if (minutes === undefined) return '时长未记录';
  if (minutes < 60) return `${minutes} 分钟`;
  return `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分` : ''}`;
}
