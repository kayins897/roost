import type { PreviewState } from './model';

export const PREVIEW_TODAY = '2026-10-27';
export function createSeed(): PreviewState {
  const works: PreviewState['works'] = [
    { id: 'b1', title: '看不见的城市', subtitle: '伊塔洛·卡尔维诺', category: 'book', tone: '#173e3c', accent: '#e6c9a1', format: '文学', year: '1972', description: '城市由许多东西组成：记忆、欲望、语言的符号。' },
    { id: 'b2', title: '悉达多', subtitle: '赫尔曼·黑塞', category: 'book', tone: '#c46d39', accent: '#ffedc8', format: '文学', year: '1922', description: '沿着自己的道路，学习倾听河流与生活。' },
    { id: 'b3', title: '设计中的设计', subtitle: '原研哉', category: 'book', tone: '#d7d2c8', accent: '#343736', format: '专业', year: '2003', description: '重新发现日常之物，思考设计与感受的关系。' },
    { id: 'b4', title: '银河边缘来信', subtitle: '示例作者', category: 'book', tone: '#283965', accent: '#cfdbf8', format: '网文', year: '2026', description: '用于演示长篇网络阅读计划的虚构书目。' },
    { id: 'b5', title: '也许你该找个人聊聊', subtitle: '洛莉·戈特利布', category: 'book', tone: '#847ba4', accent: '#fff6df', format: '非虚构', year: '2019', description: '关于人的困惑、倾听，以及变化如何发生。' },
    { id: 'g1', title: '空洞骑士', subtitle: 'Team Cherry', category: 'game', tone: '#344253', accent: '#e2e7ee', year: '2017', description: '合成示例：在遗落的王国完成一段冒险。', gameTags: { gameplay: ['动作', '探索', '平台跳跃'], theme: ['奇幻', '地下王国'], scenario: ['需要沉浸'], other: ['独立游戏'] } },
    { id: 'g2', title: '哈迪斯', subtitle: 'Supergiant Games', category: 'game', tone: '#612b32', accent: '#ffdba3', year: '2020', description: '合成示例：重返冥界的一次旅程。', gameTags: { gameplay: ['动作', 'Roguelike'], theme: ['神话'], scenario: ['碎片时间'], other: ['独立游戏'] } },
    { id: 'g3', title: '杀戮尖塔', subtitle: 'Mega Crit', category: 'game', tone: '#315367', accent: '#e5dfb9', year: '2019', description: '合成示例：一次新的爬塔路线。', gameTags: { gameplay: ['策略', 'Roguelike', '卡牌构筑'], theme: ['奇幻'], scenario: ['放松解压', '碎片时间'], other: ['独立游戏'] } },
    { id: 'g4', title: '星际拓荒', subtitle: 'Mobius Digital', category: 'game', tone: '#9b5032', accent: '#f8dfaf', year: '2019', description: '合成示例：还未走完的太空旅程。', gameTags: { gameplay: ['探索', '解谜'], theme: ['科幻', '太空'], scenario: ['需要沉浸'], other: ['独立游戏'] } },
    { id: 'g5', title: '未开始的旅途', subtitle: '示例工作室', category: 'game', tone: '#66577c', accent: '#efe4ff', year: '2026', description: '只有库存而没有实际体验记录，不进入词云。', gameTags: { gameplay: ['库存专属标签'], theme: ['奇幻'] } },
    { id: 's1', title: '机器人之梦', subtitle: '巴勃罗·贝格尔', category: 'screen', tone: '#c36c37', accent: '#fff0be', year: '2023', description: '一场关于相遇、告别与回忆的电影。' },
    { id: 's2', title: '星际穿越', subtitle: '克里斯托弗·诺兰', category: 'screen', tone: '#3c4c54', accent: '#e0dbc7', year: '2014', description: '穿越星海，寻找归途。' },
  ];
  const activities: PreviewState['activities'] = [];
  // Entirely synthetic daily sessions. No personal collection or platform data.
  for (let day = 1; day <= 270; day++) {
    if (day % 5 === 0 || day % 7 === 0 || day % 11 === 0) {
      const date = new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10);
      activities.push({ id: `demo-${day}`, workId: day % 2 ? 'b1' : 'b2', date, kind: 'reading', minutes: [12, 25, 40, 65][day % 4], note: '' });
    }
  }
  activities.push(
    { id: 'a1', workId: 'b1', date: '2026-10-27', kind: 'reading', minutes: 35, note: '晚饭后的几座城市。' },
    { id: 'a2', workId: 'b1', date: '2026-10-27', kind: 'reading', minutes: 15, note: '睡前又读了一会。' },
    { id: 'a3', workId: 'b3', date: '2026-10-26', kind: 'reading', minutes: 20, note: '重新观察身边的设计。' },
    { id: 'a4', workId: 's1', date: '2026-10-25', kind: 'watched', minutes: 102, note: '有些陪伴，会一直留在记忆里。' },
    { id: 'a5', workId: 'g1', date: '2026-10-24', kind: 'completed', note: '记录了一次明确的通关。' },
    { id: 'a6', workId: 'b2', date: '2026-10-18', kind: 'reading', note: '读过，但不记得花了多久。' },
    { id: 'a7', workId: 'g2', date: '2026-09', kind: 'note', note: '只记得是九月，不把它放进某一天。' },
    { id: 'a8', workId: 'b5', kind: 'reading', note: '补录旧阅读，日期未知。' },
    { id: 'a9', workId: 'b3', date: '2026-10-21', kind: 'reading', minutes: 0, note: '明确记录为 0 分钟。' },
    { id: 'g-play-1', workId: 'g1', date: '2026-10-24', kind: 'note', minutes: 45, note: '终于走出那段漫长的回廊。' },
    { id: 'g-play-2', workId: 'g1', date: '2026-10-20', kind: 'note', minutes: 85, note: '为最后的旅程做准备。' },
    { id: 'g-play-3', workId: 'g2', date: '2026-10-22', kind: 'note', minutes: 60, note: '换一种武器，再试一次。' },
    { id: 'g-play-4', workId: 'g2', date: '2026-10-22', kind: 'note', minutes: 30, note: '找到了一组有趣的祝福。' },
    { id: 'g-play-5', workId: 'g3', date: '2026-10-26', kind: 'note', minutes: 25, note: '这次选了一条完全不同的路线。' },
    { id: 'g-play-6', workId: 'g3', date: '2026-10-27', kind: 'note', minutes: 0, note: '今天记录为 0 分钟，保留明确的零值。' },
    { id: 'g-play-7', workId: 'g4', date: '2026-10-19', kind: 'note', note: '记得那天玩过，时长没有留下。' },
  );
  return { works, activities, plans: [
    { id: 'p1', workId: 'b1', state: 'reading', reason: '每天留一点想象的空间。', order: 0 },
    { id: 'p2', workId: 'b3', state: 'reading', reason: '重新理解留白与日常。', order: 1 },
    { id: 'p3', workId: 'b2', state: 'queued', date: '2026-10-30', reason: '隔一段时间，再沿河走一次。', order: 0 },
    { id: 'p4', workId: 'b4', state: 'queued', reason: '给周末留一段漫长的冒险。', order: 1 },
    { id: 'p5', workId: 's2', state: 'queued', date: '2026-10-31', reason: '周末重看。', order: 0 },
    { id: 'p6', workId: 'g2', state: 'queued', date: '2026-10-23', reason: '还没开始，不自动当作已完成。', order: 1 },
    { id: 'p7', workId: 'g4', state: 'queued', reason: '想留一段完整的时间，慢慢探索。', order: 2, placements: [{ id: 'season:2026:autumn', kind: 'season', start: '2026-09-01', end: '2026-11-30', label: '秋季' }] },
    { id: 'p8', workId: 'g5', state: 'queued', reason: '到年末再看看是否想开始。', order: 3, placements: [{ id: 'stage:2026-12:middle', kind: 'stage', start: '2026-12-11', end: '2026-12-20', label: '月中' }] },
  ], rounds: [
    { id: 'r1', workId: 'b2', finishedOn: '2026-09-20', impression: '人无法两次踏入同一条河流。', review: '第一次读时在寻找答案，再读时更愿意停下来，听听自己的声音。\n\n河流一直在那里，而我们每次看见的，都有一些不同。' },
    { id: 'r2', workId: 'b5', impression: '被认真倾听，是一种缓慢的松动。', review: '读完的日期已经不记得，但一些片段还很清楚。' },
  ] };
}
