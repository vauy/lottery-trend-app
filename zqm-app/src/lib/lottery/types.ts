/**
 * 臻奇妙趋势分析 · 核心类型定义
 *
 * 全局约定：records 数组一律为「正序」—— index 0 是最旧一期，末尾是最新一期。
 */

/** 一期开奖记录 */
export interface DrawRecord {
  /** 期号，如 "2026257" */
  issue: string;
  /** 开奖日期 YYYY-MM-DD */
  date: string;
  /**
   * 开奖号码：
   *  - 位置型（福彩3D / 排列三）：[百, 十, 个]
   *  - 位置型（排列五）：        [万, 千, 百, 十, 个]
   *  - 无位置型（快乐8）：        20 个升序号码
   */
  nums: number[];
}

/** 术语分组定义（奇偶 / 质合 / 大小 / 大中小 / 012路 / 阴阳 / 曲直） */
export interface GroupDef {
  id: string;
  name: string;
  categories: string[];
  /** 数字 → 类别索引，map[digit - digitMin] = categories 下标 */
  map: number[];
}

/** 单个位置（如百位）的定义 */
export interface PositionDef {
  /** 位置标识：wan / qian / bai / shi / ge */
  id: PosKey;
  /** 中文名 */
  name: string;
  /** 在 nums 数组中的下标 */
  index: number;
}

/** 位置标识。any = 不定位（任意位置出现即算命中） */
export type PosKey = 'any' | 'wan' | 'qian' | 'bai' | 'shi' | 'ge';

/** 彩种大类 */
export type GameStyle = 'positional' | 'keno';

/** 玩法定义 */
export interface GameTypeDef {
  id: GameId;
  name: string;
  /** 位置型（有百十个位）还是无位置型（快乐8） */
  style: GameStyle;
  /** 每期开出的号码个数：位置型为位数（3/5），快乐8 为 20 */
  drawCount: number;
  /** 号码取值下界（快乐8 为 1） */
  digitMin: number;
  /** 号码取值上界（快乐8 为 80） */
  digitMax: number;
  /** 位置定义，无位置型为空数组 */
  positions: PositionDef[];
  /** 术语分组 */
  groups: GroupDef[];
  /** 理论出现概率（用于 K 线周期加权）：位置型 1/10，快乐8 20/80 = 1/4 */
  hitProbability: number;
}

export type GameId = 'fc3d' | 'pl3' | 'pl5' | 'kl8';

/** 冷温热状态 */
export type TemperatureStatus = 'cold' | 'warm' | 'hot';

/** 单个号码的遗漏统计（遗漏分析页使用） */
export interface OmissionStat {
  /** 号码 */
  digit: number;
  /** 当前遗漏（最新一期开出则为 0） */
  current: number;
  /** 上期遗漏 */
  previous: number;
  /** 统计窗口内出现次数 */
  frequency: number;
  /** 理论循环周期（1 / 概率） */
  cycle: number;
  /** 平均遗漏 = 总期数 / 中出次数 */
  avgOmission: number;
  /** 历史最大遗漏 */
  maxOmission: number;
  /** 最大连出次数 */
  maxRepeat: number;
  /** 当前连出次数 */
  currentRepeat: number;
  /** 欲出几率 = 当前遗漏 / 平均遗漏 */
  wantRatio: number;
  /** 投资价值 = 当前遗漏 / 循环周期 */
  investRatio: number;
  /** 回补几率 = (上期遗漏 - 本期遗漏) / 循环周期 */
  coverRatio: number;
  /** 冷温热 */
  temperature: TemperatureStatus;
}

/** 一根 K 线 */
export interface Candle {
  /** 开盘 */
  o: number;
  /** 收盘 */
  c: number;
  /** 最低 */
  l: number;
  /** 最高 */
  h: number;
}

/** K 线图数据集（频率K线 / 周期K线 / 遗漏K线 共用） */
export interface KLineSeries {
  /** 横轴标签（期号或周期区间） */
  categories: string[];
  /** 蜡烛数据，与 categories 等长 */
  candles: Candle[];
  /** 收盘序列（供技术指标计算） */
  closes: number[];
  /** 原始每期命中情况，与 records 等长（仅周期=1 时有意义） */
  hits?: number[];
}

/** 遗漏图节点 */
export interface OmissionNode {
  /** 第几次开出（1 起） */
  order: number;
  /** 开出时的期号 */
  issue: string;
  /** 开出前遗漏的期数 */
  value: number;
  /** 该点的移动均线值 */
  ma: Record<string, number | null>;
}

/** 出次图 / 出次移动统计的点 */
export interface CountPoint {
  /** 分段标签 */
  label: string;
  /** 段内出现次数 */
  count: number;
}

/** 指标共振信号 */
export interface ResonanceResult {
  /** 1 = 看多（热），-1 = 看空（冷），0 = 无信号 */
  signal: 0 | 1 | -1;
  /** 命中的看多条件数 */
  bull: number;
  /** 命中的看空条件数 */
  bear: number;
}
