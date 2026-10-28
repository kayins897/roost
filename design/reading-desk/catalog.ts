import { createSeed } from '../reading-workspace/seed.ts';
import type { PreviewState, ReadingRound, Work } from '../reading-workspace/model';
import { BOOK_TAGS, type BookTags } from './book-tags.ts';
import type { LibraryView } from './library-view';
import { arrangementOf, type DeskState } from './book-classification.ts';
import { metadataOf, matchesFacets } from './book-metadata.ts';

// Synthetic presentation data only. No new production fields or storage contract.
export const COLLECTIONS = [
  { id: 'cities', title: '城市与远方', description: '跟随文字，去往别处。', bookIds: ['b1', 'b8', 'b4'] },
  { id: 'world', title: '理解世界', description: '从身边的生活，到更辽阔的世界。', bookIds: ['b6', 'b7', 'b5', 'b3'] },
];

export function createDeskSeed(): DeskState {
  const seed = createSeed();
  const works = seed.works.filter(work => work.category === 'book');
  works.push(
    { id: 'b6', title: '置身事内', subtitle: '兰小欢', category: 'book', tone: '#e9dfc4', accent: '#b44c37', year: '2021', format: '非虚构', description: '从身边的经济生活出发，尝试理解我们身处的世界。' },
    { id: 'b7', title: '时间简史', subtitle: '史蒂芬·霍金', category: 'book', tone: '#183851', accent: '#e8e6cf', year: '1988', format: '科普', description: '面向普通读者的宇宙、时间与物理之旅。' },
    { id: 'b8', title: '局外人', subtitle: '阿尔贝·加缪', category: 'book', tone: '#e9ddc5', accent: '#b94939', year: '1942', format: '文学', description: '关于个体、世界与人的处境。' },
  );
  return {
    works,
    arrangements: { b7: 'idle', b5: 'abandoned' },
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

export function matchesBook(state: PreviewState, work: Work, query: string, byBook = BOOK_TAGS): boolean {
  const text = query.trim().toLocaleLowerCase();
  const metadata = metadataOf(work);
  return !text || [work.title, work.subtitle, work.format, metadata.publisher, ...metadata.readingSource, ...metadata.metadataSource, ...(byBook[work.id] ?? []),
    ...state.plans.filter(plan => plan.workId === work.id).map(plan => plan.reason),
    ...state.rounds.filter(round => round.workId === work.id).flatMap(round => [round.impression, round.review]),
  ].join(' ').toLocaleLowerCase().includes(text);
}

export function shelfBooks(state: DeskState, tags: BookTags, view: LibraryView, applyTags = true, applyFacets = true): Work[] {
  const planOf = (id: string) => state.plans.find(plan => plan.workId === id);
  return state.works.filter(work => {
    const current = arrangementOf(state, work.id);
    const included = view.face === 'all' || (view.face === 'records' ? Boolean(latestRound(state, work.id))
      : current === (view.face === 'plan' ? 'want' : view.face));
    return included
      && matchesBook(state, work, view.query, tags.byBook)
      && (!applyTags || view.selectedTags.every(tag => tags.byBook[work.id]?.includes(tag)))
      && (!applyFacets || matchesFacets(work, view.facets));
  }).sort((a, b) => {
    // In-progress books use normal cover cards and remain pinned in the plan face.
    const pinned = view.face === 'all' ? Number(arrangementOf(state, b.id) === 'reading') - Number(arrangementOf(state, a.id) === 'reading') : 0;
    const value = view.sort === 'name' ? a.title.localeCompare(b.title, 'zh-CN')
      : view.sort === 'year' ? Number(a.year) - Number(b.year)
      : view.face === 'records' ? (latestRound(state, b.id)?.finishedOn ?? '').localeCompare(latestRound(state, a.id)?.finishedOn ?? '')
      : (planOf(a.id)?.order ?? 99) - (planOf(b.id)?.order ?? 99);
    return pinned || (view.ascending ? value : -value) || a.id.localeCompare(b.id);
  });
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
