/**
 * 彩种定义 —— 福彩3D / 排列三 / 排列五 / 快乐8
 *
 * 位置型彩种：每期开出若干位数字，可分别按「万/千/百/十/个」位分析，也支持不定位。
 * 无位置型彩种（快乐8）：每期从 1-80 中开出 20 个号码，无位置概念，按号码本身分析。
 */
import type { GameTypeDef, GameId, GroupDef, PositionDef } from './types';

/** 0-9 数字的各类形态属性 */
const DIGIT_ATTR = {
  oddEven: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1], // 0=偶 1=奇
  bigSmall: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1], // 0=小(0-4) 1=大(5-9)
  prime: [1, 0, 0, 0, 1, 0, 1, 0, 1, 1], // 0=合 1=质(2,3,5,7)
  bigMidSmall: [0, 0, 0, 1, 1, 1, 1, 2, 2, 2], // 0=小(0-2) 1=中(3-6) 2=大(7-9)
  modulo: [0, 1, 2, 0, 1, 2, 0, 1, 2, 0], // 012路
  yinYang: [0, 1, 1, 0, 0, 1, 0, 0, 1, 1], // 阴/阳（奇偶的传统叫法变体）
  curveStraight: [0, 1, 1, 0, 1, 1, 0, 1, 0, 0], // 曲/直
} as const;

const COMMON_GROUPS: GroupDef[] = [
  { id: 'oddEven', name: '奇偶', categories: ['偶', '奇'], map: [...DIGIT_ATTR.oddEven] },
  { id: 'bigSmall', name: '大小', categories: ['小', '大'], map: [...DIGIT_ATTR.bigSmall] },
  { id: 'prime', name: '质合', categories: ['质', '合'], map: [...DIGIT_ATTR.prime] },
  { id: 'bigMidSmall', name: '大中小', categories: ['小', '中', '大'], map: [...DIGIT_ATTR.bigMidSmall] },
  { id: 'modulo', name: '012路', categories: ['0路', '1路', '2路'], map: [...DIGIT_ATTR.modulo] },
  { id: 'yinYang', name: '阴阳', categories: ['阴', '阳'], map: [...DIGIT_ATTR.yinYang] },
  { id: 'curveStraight', name: '曲直', categories: ['曲', '直'], map: [...DIGIT_ATTR.curveStraight] },
];

/** 排列五 / 福彩3D 等位置型的「位」定义，index 为 nums 下标 */
function buildPositions(keys: Array<[PositionDef['id'], string]>): PositionDef[] {
  return keys.map(([id, name], index) => ({ id, name, index }));
}

const P3 = buildPositions([
  ['bai', '百位'],
  ['shi', '十位'],
  ['ge', '个位'],
]);

const P5 = buildPositions([
  ['wan', '万位'],
  ['qian', '千位'],
  ['bai', '百位'],
  ['shi', '十位'],
  ['ge', '个位'],
]);

export const FC3D: GameTypeDef = {
  id: 'fc3d',
  name: '福彩3D',
  style: 'positional',
  drawCount: 3,
  digitMin: 0,
  digitMax: 9,
  positions: P3,
  groups: COMMON_GROUPS,
  hitProbability: 0.1,
};

export const PL3: GameTypeDef = {
  id: 'pl3',
  name: '排列三',
  style: 'positional',
  drawCount: 3,
  digitMin: 0,
  digitMax: 9,
  positions: P3,
  groups: COMMON_GROUPS,
  hitProbability: 0.1,
};

export const PL5: GameTypeDef = {
  id: 'pl5',
  name: '排列五',
  style: 'positional',
  drawCount: 5,
  digitMin: 0,
  digitMax: 9,
  positions: P5,
  groups: COMMON_GROUPS,
  hitProbability: 0.1,
};

export const KL8: GameTypeDef = {
  id: 'kl8',
  name: '快乐8',
  style: 'keno',
  drawCount: 20,
  digitMin: 1,
  digitMax: 80,
  positions: [],
  groups: [],
  hitProbability: 20 / 80,
};

export const GAMES: Record<GameId, GameTypeDef> = {
  fc3d: FC3D,
  pl3: PL3,
  pl5: PL5,
  kl8: KL8,
};

/** 支持的彩种顺序（Tab 展示顺序） */
export const GAME_ORDER: GameId[] = ['fc3d', 'pl3', 'pl5', 'kl8'];

export function getGame(id: GameId): GameTypeDef {
  const game = GAMES[id];
  if (!game) throw new Error(`未知玩法: ${id}`);
  return game;
}

/** 彩种的全部可选号码（3D/排三排五为 0-9，快乐8 为 1-80） */
export function getDigits(game: GameTypeDef): number[] {
  const out: number[] = [];
  for (let d = game.digitMin; d <= game.digitMax; d += 1) out.push(d);
  return out;
}

/** 取某位上的数字；any 返回整组号码 */
export function pickPosition(nums: number[], game: GameTypeDef, pos: string): number | number[] {
  if (game.style === 'keno') return nums;
  if (pos === 'any') return nums;
  const def = game.positions.find((p) => p.id === pos);
  if (!def) return nums;
  return nums[def.index];
}

/** 数字形态归类，如 classifyDigit('oddEven', 3) → '奇' */
export function classifyDigit(groupId: string, digit: number, game: GameTypeDef): string {
  const group = game.groups.find((g) => g.id === groupId);
  if (!group) return '-';
  return group.categories[group.map[digit - game.digitMin]] ?? '-';
}
