/**
 * 分析标的（Target）定义
 *
 * 「标的」= 每期要么「开出」要么「遗漏」的一件事，它是所有 K 线/遗漏图的输入。
 *  - digit 型：某个位上的某个数字，如「个位5」
 *  - group 型：某个位上的某种形态，如「百位奇」
 * 快乐8 无位置概念，pos 恒为 'any'。
 */
import type { DrawRecord, GameTypeDef, PosKey } from './types';

export type Target =
  | { kind: 'digit'; pos: PosKey; digit: number }
  | { kind: 'group'; pos: PosKey; groupId: string; categoryIndex: number };

export type TrendTarget = Target & {
  key: string;
  label: string;
};

function posName(game: GameTypeDef, pos: PosKey): string {
  if (game.style === 'keno' || pos === 'any') return '';
  return game.positions.find((p) => p.id === pos)?.name ?? '';
}

/** 取某位上的数字；any / 快乐8 返回整组 */
function slot(game: GameTypeDef, record: DrawRecord, pos: PosKey): number[] {
  if (game.style === 'keno' || pos === 'any') return record.nums;
  const def = game.positions.find((p) => p.id === pos);
  if (!def) return [];
  const v = record.nums[def.index];
  return Number.isFinite(v) ? [v] : [];
}

/** 判定某期是否命中该标的 */
export function isHit(game: GameTypeDef, record: DrawRecord, target: Target): 0 | 1 {
  const values = slot(game, record, target.pos);
  if (target.kind === 'digit') {
    return values.includes(target.digit) ? 1 : 0;
  }
  const group = game.groups.find((g) => g.id === target.groupId);
  if (!group) return 0;
  const cat = group.categories[target.categoryIndex];
  return values.some((v) => group.map[v - game.digitMin] === target.categoryIndex && cat) ? 1 : 0;
}

/** 生成某彩种在某位置下的全部数字标的 */
export function buildDigitTargets(game: GameTypeDef, pos: PosKey): TrendTarget[] {
  const prefix = posName(game, pos);
  const out: TrendTarget[] = [];
  for (let d = game.digitMin; d <= game.digitMax; d += 1) {
    out.push({
      kind: 'digit',
      pos,
      digit: d,
      key: `${pos}:${d}`,
      label: `${prefix}${d}`,
    });
  }
  return out;
}

/** 生成某彩种在某位置下的全部形态标的（奇偶/大小/质合/…） */
export function buildGroupTargets(game: GameTypeDef, pos: PosKey): TrendTarget[] {
  const prefix = posName(game, pos);
  const out: TrendTarget[] = [];
  for (const group of game.groups) {
    group.categories.forEach((cat, idx) => {
      out.push({
        kind: 'group',
        pos,
        groupId: group.id,
        categoryIndex: idx,
        key: `${pos}:${group.id}:${idx}`,
        label: `${prefix}${cat}`,
      });
    });
  }
  return out;
}

/** 按 key 反查标的（用于跨屏传递） */
export function findTarget(game: GameTypeDef, pos: PosKey, key: string): TrendTarget | null {
  const all = [...buildDigitTargets(game, pos), ...buildGroupTargets(game, pos)];
  return all.find((t) => t.key === key) ?? null;
}

/**
 * 计算标的在整段历史上每期的命中情况（正序，与 records 等长）
 */
export function buildHitSeries(
  records: DrawRecord[],
  game: GameTypeDef,
  target: Target,
): number[] {
  return records.map((r) => isHit(game, r, target));
}
