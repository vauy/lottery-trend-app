/**
 * 彩票趋势分析 APP —— 核心类型定义
 *
 * 约定：所有分析函数接收的 records 数组均为「正序」（index 0 为最旧一期，末尾为最新一期）。
 */

/** 一期开奖记录 */
export interface DrawRecord {
  /** 期号，如 "2026255" */
  issue: string;
  /** 开奖日期 YYYY-MM-DD */
  date: string;
  /** 开奖号码，三位数按 [百, 十, 个] 顺序 */
  nums: number[];
}

/** 术语分组定义（奇偶 / 质合 / 大小 / 大中小 / 012路 / 阴阳 / 曲直） */
export interface GroupDef {
  /** 分组标识，如 "odd" */
  id: string;
  /** 分组名称，如 "奇偶" */
  name: string;
  /** 类别列表，如 ["偶", "奇"] */
  categories: string[];
  /** 数字 -> 类别索引（长度等于取值个数，map[digit] = categories 下标） */
  map: number[];
}

/** 玩法定义 */
export interface GameTypeDef {
  /** 玩法标识，如 "fc3d" */
  id: string;
  /** 玩法名称，如 "福彩3D" */
  name: string;
  /** 位数，如 3 */
  digitCount: number;
  /** 最小数字，如 0 */
  digitMin: number;
  /** 最大数字，如 9 */
  digitMax: number;
  /** 术语分组 */
  groups: GroupDef[];
}

/** 冷温热状态 */
export type TemperatureStatus = 'cold' | 'warm' | 'hot';

/** 单个数字的遗漏/频率分析结果 */
export interface DigitStat {
  /** 数字 0-9 */
  digit: number;
  /** 当前遗漏（连续未开出期数，最新一期开出则为 0） */
  omission: number;
  /** 统计窗口内出现次数 */
  frequency: number;
  /** 冷温热分类 */
  temperature: TemperatureStatus;
  /** 历史最大遗漏 */
  maxOmission: number;
}

/** 号码走势序列（供 K 线图使用） */
export interface TrendPoint {
  /** 期号 */
  issue: string;
  /** 日期 */
  date: string;
  /** 本期该号码是否开出（0/1） */
  hit: number;
  /** 均线值（若干条，键为周期，如 "5" / "10" / "20"） */
  ma: Record<string, number | null>;
  /** 布林通道（null 表示数据不足） */
  boll: { mid: number; upper: number; lower: number } | null;
}

/** 周期出次统计（供遗漏图上部使用） */
export interface CycleCountPoint {
  /** 起始期号 */
  startIssue: string;
  /** 结束期号 */
  endIssue: string;
  /** 该周期内号码出现次数 */
  count: number;
}