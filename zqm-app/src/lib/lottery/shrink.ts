/**
 * 组号 / 缩水引擎
 *
 * 流程：每位选若干候选数字（复式）→ 笛卡尔积展开全部组合 → 逐条应用过滤条件 → 输出剩余组合。
 * 组合数上限受 MAX_COMBOS 保护，避免手机端一次性展开过多导致卡死。
 */
import { FILTERS, cartesian, cartesianSize, type FilterContext } from './filters';
import type { GameTypeDef } from './types';

/** 手机端可承受的最大展开量 */
export const MAX_COMBOS = 200000;

export interface ShrinkFilterCfg {
  id: string;
  enabled: boolean;
  cfg: any;
}

export interface ShrinkConfig {
  /** 每位候选数字，长度须等于彩种位数 */
  slots: number[][];
  filters: ShrinkFilterCfg[];
  /** 文本大底：若非空，则只保留出现在这里的组合 */
  textBase?: string[];
}

export interface ShrinkResult {
  /** 展开出的组合总数 */
  total: number;
  /** 过滤后剩余数量 */
  kept: number;
  /** 剩余组合（数字数组） */
  list: number[][];
  /** 错误提示（如组合数超限） */
  error?: string;
}

/** 组合转字符串，如 [1,2,3] → "123" */
export function comboKey(nums: number[]): string {
  return nums.join('');
}

/** 解析文本大底：按行切，允许空格/逗号分隔，产出组合 key */
export function parseTextBase(text: string): string[] {
  const out: string[] = [];
  if (!text) return out;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    for (const token of line.split(/[\s,，、|]+/)) {
      if (/^\d+$/.test(token)) out.push(token);
    }
  }
  return out;
}

/** 按彩种规则校验一注号码 */
export function validateCombo(nums: number[], game: GameTypeDef): boolean {
  if (nums.length !== game.drawCount) return false;
  return nums.every((n) => Number.isFinite(n) && n >= game.digitMin && n <= game.digitMax);
}

/**
 * 执行缩水。
 */
export function shrink(
  game: GameTypeDef,
  config: ShrinkConfig,
  ctx: FilterContext = {},
): ShrinkResult {
  const { slots, filters, textBase } = config;

  if (game.style === 'keno') {
    return { total: 0, kept: 0, list: [], error: '快乐8 为无位置彩种，不支持定位组号' };
  }
  if (!slots.length || slots.length !== game.drawCount) {
    return { total: 0, kept: 0, list: [], error: '请先为每一位选择候选数字' };
  }
  for (const s of slots) {
    if (!s.length) return { total: 0, kept: 0, list: [], error: '每一位至少需要选择一个数字' };
  }

  const size = cartesianSize(slots);
  if (size > MAX_COMBOS) {
    return {
      total: size,
      kept: 0,
      list: [],
      error: `组合数 ${size.toLocaleString()} 超过上限 ${MAX_COMBOS.toLocaleString()}，请减少候选数字`,
    };
  }

  const all = cartesian(slots);
  const active = filters
    .filter((f) => f.enabled)
    .map((f) => ({ def: FILTERS.find((x) => x.id === f.id), cfg: f.cfg }))
    .filter((x) => x.def) as Array<{ def: (typeof FILTERS)[number]; cfg: any }>;

  const base = textBase?.length ? new Set(textBase) : null;
  const kept: number[][] = [];

  for (const nums of all) {
    if (base && !base.has(comboKey(nums))) continue;
    let pass = true;
    for (const { def, cfg } of active) {
      if (!def.test(nums, cfg, ctx)) {
        pass = false;
        break;
      }
    }
    if (pass) kept.push(nums);
  }

  return { total: all.length, kept: kept.length, list: kept };
}

/**
 * 胆拖展开：胆码必须全部出现，拖码补足剩余位。
 * @param dan  胆码数字
 * @param tuo  拖码数字（可与胆码重复时自动去重）
 */
export function danTuoExpand(
  game: GameTypeDef,
  dan: number[],
  tuo: number[],
): number[][] {
  if (game.style === 'keno') return [];
  const k = game.drawCount;
  if (dan.length === 0 || dan.length > k) return [];

  const rest = tuo.filter((d) => !dan.includes(d));
  const need = k - dan.length;

  const combos: number[][] = [];
  const pick = (start: number, acc: number[]) => {
    if (acc.length === need) {
      combos.push([...dan, ...acc].sort((a, b) => a - b));
      return;
    }
    for (let i = start; i < rest.length; i += 1) {
      pick(i + 1, [...acc, rest[i]]);
    }
  };
  pick(0, []);
  return combos.filter((c) => validateCombo(c, game));
}

/** 组合转文本（每行一注） */
export function combosToText(list: number[][]): string {
  return list.map(comboKey).join('\n');
}

/** 文本转组合（自动按彩种位数校验） */
export function textToCombos(text: string, game: GameTypeDef): number[][] {
  return parseTextBase(text)
    .filter((s) => s.length === game.drawCount)
    .map((s) => s.split('').map((c) => parseInt(c, 10)))
    .filter((c) => validateCombo(c, game));
}
