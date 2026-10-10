/**
 * 选胆区 & 自动出号 —— 对齐官方帮助《选胆》与《自动出号》
 *
 * 选胆区（官方：软件最上方快速选胆区）：
 *   - 复式     按位复选 → 笛卡尔积展开成注
 *   - 胆拖     胆码必出 + 拖码补足（官方《胆拖》）
 *   - 分组胆   每组各取一个胆码再交叉（官方《分组胆》）
 *   - 不定胆   选定胆码必须出现在号码中，不定位（官方《不定位胆》）
 *   - 两码合差跨 两码合=(a+b)%10、两码差=|a-b|、两码跨=极差（官方《二码合、差、跨》）
 *   - 胆合积跨 胆码的和值 / 积值 / 跨度（官方《胆合积跨》）
 *
 * 自动出号（官方：极冷极热出号 / 遗漏出号 / 出次出号 / 位置遗漏出号）：
 *   官方注明「谨慎参考，任何出号工具逃不过概率限制」，此处仅实现其统计口径。
 */
import type { DrawRecord, GameTypeDef, OmissionStat, PosKey } from './types';
import { buildHitSeries } from './targets';
import { currentOmission } from './analysis';

export const MAX_PICK_COMBOS = 200000;

/** 笛卡尔积（带上限保护，超限直接截断而不是卡死） */
function cartesian(slots: number[][], limit = MAX_PICK_COMBOS): number[][] {
  if (!slots.length) return [];
  if (slots.some((s) => !s.length)) return [];
  let out: number[][] = [[]];
  for (const slot of slots) {
    const next: number[][] = [];
    for (const acc of out) {
      for (const v of slot) {
        next.push([...acc, v]);
        if (next.length > limit) return next;
      }
    }
    out = next;
  }
  return out;
}

/** 复式：按位复选，直接展开全部组合 */
export function expandFushi(slots: number[][]): number[][] {
  return cartesian(slots);
}

/** 胆拖：每注都必须包含全部胆码，剩余位从拖码中补足（不重复取号） */
export function expandDanTuo(dan: number[], tuo: number[], drawCount: number): number[][] {
  const k = drawCount;
  if (!dan.length || dan.length > k) return [];
  const rest = tuo.filter((d) => !dan.includes(d));
  const need = k - dan.length;
  if (need === 0) return [[...dan].sort((a, b) => a - b)];

  const out: number[][] = [];
  const walk = (start: number, acc: number[]) => {
    if (out.length >= MAX_PICK_COMBOS) return;
    if (acc.length === need) {
      out.push([...dan, ...acc].sort((a, b) => a - b));
      return;
    }
    for (let i = start; i < rest.length; i += 1) walk(i + 1, [...acc, rest[i]]);
  };
  walk(0, []);
  return out;
}

/** 分组胆：每组各选一个胆码，再交叉展开 */
export function expandGroupDan(groups: number[][]): number[][] {
  return cartesian(groups.filter((g) => g.length));
}

/** 不定胆 / 单底多底：只保留包含全部胆码的组合 */
export function filterByDan(combos: number[][], dan: number[]): number[][] {
  if (!dan.length) return combos;
  return combos.filter((c) => dan.every((d) => c.includes(d)));
}

/** 两码合 = (a + b) % 10 */
export function twoCodeHe(a: number, b: number): number {
  return (a + b) % 10;
}

/** 两码差 = |a - b| */
export function twoCodeCha(a: number, b: number): number {
  return Math.abs(a - b);
}

/** 两码跨 = 两码极差 */
export function twoCodeKua(a: number, b: number): number {
  return Math.abs(a - b);
}

/** 胆合积跨：胆码的和值 / 积值 / 跨度 */
export function danHeJiKua(dan: number[]): { he: number; ji: number; kua: number } {
  if (!dan.length) return { he: 0, ji: 0, kua: 0 };
  const he = dan.reduce((a, b) => a + b, 0);
  const ji = dan.reduce((a, b) => a * b, 1);
  const kua = Math.max(...dan) - Math.min(...dan);
  return { he, ji, kua };
}

// ───────────────────────── 自动出号 ─────────────────────────

/** 极冷极热出号：热=出次最多，冷=当前遗漏最大 */
export function pickHotCold(
  stats: OmissionStat[],
  mode: 'hot' | 'cold',
  count: number,
): number[] {
  const arr = [...stats];
  if (mode === 'hot') arr.sort((a, b) => b.frequency - a.frequency);
  else arr.sort((a, b) => b.current - a.current);
  return arr.slice(0, Math.max(0, count)).map((s) => s.digit);
}

/** 遗漏出号：当前遗漏落在 [min, max] 内的号码，遗漏大的优先 */
export function pickByOmission(
  stats: OmissionStat[],
  min: number,
  max: number,
  maxCount: number,
): number[] {
  const hit = stats.filter((s) => s.current >= min && s.current <= max);
  hit.sort((a, b) => b.current - a.current);
  return hit.slice(0, Math.max(0, maxCount)).map((s) => s.digit);
}

/** 出次出号：出现次数落在 [min, max] 内的号码，次数多的优先 */
export function pickByCount(
  stats: OmissionStat[],
  min: number,
  max: number,
  maxCount: number,
): number[] {
  const hit = stats.filter((s) => s.frequency >= min && s.frequency <= max);
  hit.sort((a, b) => b.frequency - a.frequency);
  return hit.slice(0, Math.max(0, maxCount)).map((s) => s.digit);
}

export interface PosPick {
  pos: PosKey;
  posName: string;
  digits: number[];
}

/**
 * 位置遗漏出号：每个位置各自按遗漏范围出胆码（官方《位置遗漏出号》）
 * 返回每位置的胆码，UI 侧再交叉组合成注。
 */
export function pickPosOmission(
  records: DrawRecord[],
  game: GameTypeDef,
  range: [number, number],
  maxPerPos: number,
): PosPick[] {
  if (game.style === 'keno' || !records.length) return [];
  const [min, max] = range;
  return game.positions.map((p) => {
    const items: Array<{ digit: number; omit: number }> = [];
    for (let d = game.digitMin; d <= game.digitMax; d += 1) {
      const hits = buildHitSeries(records, game, {
        kind: 'digit',
        pos: p.id as PosKey,
        digit: d,
      });
      const omit = currentOmission(hits);
      if (omit >= min && omit <= max) items.push({ digit: d, omit });
    }
    items.sort((a, b) => b.omit - a.omit);
    return {
      pos: p.id as PosKey,
      posName: p.name,
      digits: items.slice(0, Math.max(0, maxPerPos)).map((i) => i.digit),
    };
  });
}
