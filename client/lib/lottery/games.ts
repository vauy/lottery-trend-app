/**
 * 玩法定义 —— 多玩法框架
 *
 * 说明：
 *  - fc3d / pl3：3 位数，0-9，已启用
 *  - pl5：5 位数（万千百十个），**预留**。启用前需要：
 *      1) 扩展 targets.ts 支持任意位数（目前硬编码 3 位）
 *      2) 扩展 POS_IDX / 位置选择（目前只有 any/bai/shi/ge）
 *      3) analyze 页开放 "pl5" 按钮
 *    数据源（17500 的 pl5_asc.txt）已在 datasource.ts 里配好。
 */
import type { GameTypeDef } from './types';

const DIGIT_ATTR = {
  oddEven: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
  prime: [1, 0, 0, 0, 1, 0, 1, 0, 1, 1],
  bigSmall: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
  bigMidSmall: [0, 0, 0, 1, 1, 1, 1, 2, 2, 2],
  modulo: [0, 1, 2, 0, 1, 2, 0, 1, 2, 0],
  yinYang: [0, 1, 1, 0, 0, 1, 0, 0, 1, 1],
  curveStraight: [0, 1, 1, 0, 1, 1, 0, 1, 0, 0],
} as const;

const COMMON_GROUPS: GameTypeDef['groups'] = [
  { id: 'oddEven', name: '奇偶', categories: ['偶', '奇'], map: [...DIGIT_ATTR.oddEven] },
  { id: 'bigSmall', name: '大小', categories: ['小', '大'], map: [...DIGIT_ATTR.bigSmall] },
  { id: 'prime', name: '质合', categories: ['质', '合'], map: [...DIGIT_ATTR.prime] },
  { id: 'bigMidSmall', name: '大中小', categories: ['小', '中', '大'], map: [...DIGIT_ATTR.bigMidSmall] },
  { id: 'modulo', name: '012路', categories: ['0路', '1路', '2路'], map: [...DIGIT_ATTR.modulo] },
  { id: 'yinYang', name: '阴阳', categories: ['阴', '阳'], map: [...DIGIT_ATTR.yinYang] },
  { id: 'curveStraight', name: '曲直', categories: ['曲', '直'], map: [...DIGIT_ATTR.curveStraight] },
];

export const FC3D: GameTypeDef = {
  id: 'fc3d',
  name: '福彩3D',
  digitCount: 3,
  digitMin: 0,
  digitMax: 9,
  groups: COMMON_GROUPS,
};

export const PL3: GameTypeDef = {
  id: 'pl3',
  name: '排列3',
  digitCount: 3,
  digitMin: 0,
  digitMax: 9,
  groups: COMMON_GROUPS,
};

/** 排列5 —— 预留，前端暂不暴露 */

/** 快乐8 —— 1-80 号码池，每期开 20 个号 */
export const KL8: GameTypeDef = {
  id: 'kl8',
  name: '快乐8',
  digitCount: 20,      // 每期开 20 个号
  digitMin: 1,
  digitMax: 80,
  groups: [],          // 快乐8 无位置属性分组
};

export const PL5: GameTypeDef = {
  id: 'pl5',
  name: '排列5',
  digitCount: 5,
  digitMin: 0,
  digitMax: 9,
  groups: COMMON_GROUPS,
};

export const PAIR_CODE: Record<number, [number, number]> = {
  0: [0, 5],
  1: [1, 6],
  2: [2, 7],
  3: [3, 8],
  4: [4, 9],
};

export const GAMES: Record<string, GameTypeDef> = {
  fc3d: FC3D,
  pl3: PL3,
  pl5: PL5,
  kl8: KL8,
};

export function getGame(id: string): GameTypeDef {
  const game = GAMES[id];
  if (!game) {
    throw new Error(`未知玩法: ${id}`);
  }
  return game;
}

export function getDigits(game: GameTypeDef): number[] {
  const digits: number[] = [];
  for (let d = game.digitMin; d <= game.digitMax; d += 1) {
    digits.push(d);
  }
  return digits;
}

export function classifyDigit(groupId: string, digit: number, game: GameTypeDef): string {
  const group = game.groups.find((g) => g.id === groupId);
  if (!group) return '-';
  const idx = group.map[digit - game.digitMin];
  return group.categories[idx] ?? '-';
}
