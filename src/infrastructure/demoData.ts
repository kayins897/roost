import { flattenGameTags } from '../domain/library.ts';
import type { GamePlayState, GameTagGroups, LibrarySnapshot, MediaItem, MediaType, ProgressStatus } from '../domain/types.ts';

type Demo = [string, MediaType, string, string, string, ProgressStatus, string[], string];

const examples: Demo[] = [
  ['空洞骑士', 'game', 'Steam', 'Team Cherry', '2017', 'finished', ['独立游戏', '探索', '高难度'], 'hollow'],
  ['博德之门 3', 'game', 'Steam', 'Larian Studios', '2023', 'active', ['角色扮演', '叙事', '回合制'], 'baldur'],
  ['杀戮尖塔', 'game', 'Steam', 'Mega Crit', '2019', 'finished', ['策略', '卡牌', '高重复游玩'], 'spire'],
  ['极乐迪斯科', 'game', 'Steam', 'ZA/UM', '2019', 'want', ['叙事', '角色扮演', '独立游戏'], 'disco'],
  ['星际拓荒', 'game', 'Switch', 'Mobius Digital', '2019', 'want', ['探索', '解谜', '独立游戏'], 'outer'],
  ['哈迪斯', 'game', 'Switch', 'Supergiant Games', '2020', 'paused', ['动作', '高重复游玩'], 'hades'],
  ['潜水员戴夫', 'game', 'Steam', 'MINTROCKET', '2023', 'want', ['经营', '轻松'], 'dave'],
  ['尼尔：机械纪元', 'game', 'PS5', 'PlatinumGames', '2017', 'finished', ['叙事', '动作', '音乐出色'], 'nier'],
  ['悉达多', 'book', '严肃文学', '赫尔曼·黑塞', '1922', 'want', ['文学', '哲思'], 'siddhartha'],
  ['设计心理学', 'book', '专业书籍', '唐纳德·诺曼', '1988', 'active', ['设计', '学习'], 'design'],
  ['星际穿越', 'screen', '电影', '克里斯托弗·诺兰', '2014', 'finished', ['科幻', '电影'], 'interstellar'],
  ['葬送的芙莉莲', 'screen', '番剧', 'MADHOUSE', '2023', 'want', ['奇幻', '番剧'], 'frieren'],
  ['Nier: Automata OST', 'music', '专辑', 'MONACA', '2017', 'finished', ['原声', '氛围感'], 'soundtrack'],
];

const demoGameDetails: Record<string, { playtimeMinutes?: number; gameTags: GameTagGroups }> = {
  hollow: { playtimeMinutes: 2460, gameTags: { gameplay: ['银河恶魔城', '动作'], theme: ['黑暗奇幻'], scenario: ['需要沉浸'], other: ['独立游戏', '高难度'] } },
  baldur: { playtimeMinutes: 7125, gameTags: { gameplay: ['CRPG', '回合制'], theme: ['西方奇幻', '剧情向'], scenario: ['需要沉浸', '适合长时间游玩'], other: ['角色扮演'] } },
  spire: { playtimeMinutes: 10500, gameTags: { gameplay: ['卡牌构筑', 'Roguelike'], theme: ['奇幻'], scenario: ['碎片时间'], other: ['策略', '高重复游玩'] } },
  disco: { gameTags: { gameplay: ['角色扮演', '对话选择'], theme: ['悬疑', '剧情向'], scenario: ['需要沉浸'], other: ['独立游戏'] } },
  outer: { gameTags: { gameplay: ['探索', '解谜'], theme: ['太空科幻'], scenario: ['需要沉浸'], other: ['独立游戏'] } },
  hades: { playtimeMinutes: 1320, gameTags: { gameplay: ['动作', 'Roguelike'], theme: ['神话'], scenario: ['碎片时间', '放松解压'], other: ['高重复游玩'] } },
  dave: { gameTags: { gameplay: ['经营', '冒险'], theme: ['海洋'], scenario: ['放松解压'], other: ['轻松'] } },
  nier: { playtimeMinutes: 3840, gameTags: { gameplay: ['动作', '角色扮演'], theme: ['科幻', '剧情向'], scenario: ['需要沉浸'], other: ['音乐出色'] } },
};

const demoGameStates: Record<string, GamePlayState> = {
  hollow: 'cleared', baldur: 'playing', spire: 'replaying', disco: 'want',
  outer: 'want', hades: 'paused', dave: 'want', nier: 'cleared',
};

export const demoIds = new Set(examples.map((_, i) => `demo-${i + 1}`));

export const demoSnapshot: LibrarySnapshot = {
  schemaVersion: 1,
  items: examples.map(([title, category, subcategory, creator, year, status, tags, artwork], index): MediaItem => ({
    id: `demo-${index + 1}`,
    title,
    category,
    subcategory,
    creator,
    year,
    status,
    gamePlayState: category === 'game' ? demoGameStates[artwork] : undefined,
    tags: demoGameDetails[artwork] ? flattenGameTags(demoGameDetails[artwork].gameTags) : tags,
    gameTags: demoGameDetails[artwork]?.gameTags,
    playtimeMinutes: demoGameDetails[artwork]?.playtimeMinutes,
    impression: '',
    favorite: index === 0 || index === 1 || index === 7,
    artwork,
    createdAt: new Date(Date.UTC(2026, 8, 10 + index)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 8, 10 + index)).toISOString(),
  })),
};
