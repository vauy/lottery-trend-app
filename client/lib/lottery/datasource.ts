/**
 * 数据源层 —— 17500 全量历史 + 本地缓存 + 种子兜底
 *
 * 数据流：本地缓存 → 17500 接口 → 内置种子。
 * 统一输出「正序」records（index 0 最旧，末尾最新）。
 *
 * 17500 文件格式（空格分隔）：
 *   期号 日期 百 十 个 [其他数据...]
 *   例：2026257 2026-09-24 4 8 6 1 8 7 1 1 97749434 0 1040 0 346 0 173
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FC3D_SEED, type SeedDraw } from './seed';
import type { DrawRecord } from './types';

export type DataSource = 'network' | 'cache' | 'seed';

export interface HistoryResult {
  records: DrawRecord[];
  source: DataSource;
  refreshedAt?: string;
}

/** 17500 数据源：gameId → 文件名 */
const SOURCE_MAP: Record<string, string> = {
  fc3d: '3d_asc.txt',
  pl3: 'pl3_asc.txt',
  pl5: 'pl5_asc.txt',
};
const BASE_URL = 'https://data.17500.cn';

const CACHE_KEY_PREFIX = 'lottery_history_v2_';
/** 缓存 TTL：6 小时 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** 解析日期 "2002-01-01" → "2002-01-01" */
export function parseDate(raw: string): string {
  const m = /^\d{4}-\d{2}-\d{2}/.exec(raw ?? '');
  return m ? m[0] : (raw ?? '');
}

/**
 * 从 17500 抓取全量历史开奖（正序）。
 */
export async function fetchFullHistory(gameId: string): Promise<DrawRecord[]> {
  const fileName = SOURCE_MAP[gameId];
  if (!fileName) {
    throw new Error(`未配置的数据源：${gameId}`);
  }
  const url = `${BASE_URL}/${fileName}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
      Accept: 'text/plain, */*',
    },
  });
  if (!resp.ok) {
    throw new Error(`17500 HTTP ${resp.status}`);
  }
  const text = await resp.text();
  return parse17500Text(text);
}

/**
 * 解析 17500 文本格式：
 *   期号 日期 百 十 个 [其他...]
 */
export function parse17500Text(text: string): DrawRecord[] {
  const out: DrawRecord[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) continue;
    const issue = parts[0];
    const date = parseDate(parts[1]);
    const nums = [
      parseInt(parts[2], 10),
      parseInt(parts[3], 10),
      parseInt(parts[4], 10),
    ];
    if (nums.some((n) => Number.isNaN(n))) continue;
    out.push({ issue, date, nums });
  }
  // 文件本身就是正序（最旧在前），无需反转
  return out;
}

/** 内置种子（正序） */
export function getSeed(): DrawRecord[] {
  return FC3D_SEED.map((s: SeedDraw) => ({
    issue: s.issue,
    date: s.date,
    nums: [...s.nums],
  }));
}

type CachePayload = {
  records: DrawRecord[];
  ts: number;
};

/** 读取缓存 */
async function readCache(gameId: string): Promise<CachePayload | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_KEY_PREFIX}${gameId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload;
    if (!parsed || !Array.isArray(parsed.records) || parsed.records.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** 写入缓存 */
async function writeCache(gameId: string, records: DrawRecord[]): Promise<void> {
  try {
    const payload: CachePayload = { records, ts: Date.now() };
    await AsyncStorage.setItem(
      `${CACHE_KEY_PREFIX}${gameId}`,
      JSON.stringify(payload),
    );
  } catch {
    // 忽略
  }
}

/**
 * 获取历史开奖数据。
 * 1. 缓存新鲜（< 6h）→ 直接用
 * 2. 缓存过期或不存在 → 尝试 17500
 * 3. 网络失败 → 退回旧缓存或种子
 */
export async function loadHistory(
  gameId: string,
  count: number,
  opts: { forceRefresh?: boolean } = {},
): Promise<HistoryResult> {
  const cached = await readCache(gameId);

  if (!opts.forceRefresh && cached) {
    const age = Date.now() - cached.ts;
    if (age < CACHE_TTL_MS) {
      return { records: cached.records.slice(-count), source: 'cache' };
    }
    // 缓存过期，后台刷新，先用旧的
    void refreshInBackground(gameId);
    return { records: cached.records.slice(-count), source: 'cache' };
  }

  // 强制刷新 或 无缓存
  try {
    const full = await fetchFullHistory(gameId);
    await writeCache(gameId, full);
    return { records: full.slice(-count), source: 'network' };
  } catch {
    // 有旧缓存用旧缓存
    if (cached) {
      return { records: cached.records.slice(-count), source: 'cache' };
    }
    // 完全兜底种子
    const seed = getSeed();
    return { records: seed.slice(-count), source: 'seed' };
  }
}

async function refreshInBackground(gameId: string): Promise<void> {
  try {
    const full = await fetchFullHistory(gameId);
    await writeCache(gameId, full);
  } catch {
    // 静默失败
  }
}

export async function refreshHistory(
  gameId: string,
  count: number,
): Promise<HistoryResult> {
  return loadHistory(gameId, count, { forceRefresh: true });
}
