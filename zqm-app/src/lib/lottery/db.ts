/**
 * 本地缓存层
 *
 * 历史开奖数据可能有几千期，直接存 JSON 会膨胀到数 MB（AsyncStorage 单条不宜过大），
 * 因此这里用紧凑文本格式落盘：每行 `期号|日期|号码,号码,...`，读取时再解析。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DrawRecord, GameId } from './types';

const PREFIX = 'zqm.hist.v1.';
const META = 'zqm.meta.v1.';

export interface HistoryMeta {
  /** 写入时间戳 */
  ts: number;
  /** 期数 */
  count: number;
  /** 最新一期期号 */
  lastIssue: string;
}

/** 内存缓存：避免同一会话内反复解析同一彩种 */
const memory = new Map<GameId, { text: string; records: DrawRecord[] }>();

export function encodeRecords(records: DrawRecord[]): string {
  return records.map((r) => `${r.issue}|${r.date}|${r.nums.join(',')}`).join('\n');
}

export function decodeRecords(text: string): DrawRecord[] {
  const out: DrawRecord[] = [];
  if (!text) return out;
  for (const line of text.split('\n')) {
    if (!line) continue;
    const [issue, date, numsRaw] = line.split('|');
    if (!issue || !numsRaw) continue;
    const nums = numsRaw
      .split(',')
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isFinite(n));
    if (!nums.length) continue;
    out.push({ issue, date: date ?? '', nums });
  }
  return out;
}

export async function saveHistory(gameId: GameId, records: DrawRecord[]): Promise<void> {
  const text = encodeRecords(records);
  memory.set(gameId, { text, records });
  try {
    await AsyncStorage.setItem(PREFIX + gameId, text);
    const meta: HistoryMeta = {
      ts: Date.now(),
      count: records.length,
      lastIssue: records.length ? records[records.length - 1].issue : '',
    };
    await AsyncStorage.setItem(META + gameId, JSON.stringify(meta));
  } catch {
    // 存储失败不阻塞主流程（内存里仍有数据）
  }
}

export async function loadHistory(gameId: GameId): Promise<DrawRecord[] | null> {
  const cached = memory.get(gameId);
  if (cached) return cached.records;
  try {
    const text = await AsyncStorage.getItem(PREFIX + gameId);
    if (!text) return null;
    const records = decodeRecords(text);
    memory.set(gameId, { text, records });
    return records;
  } catch {
    return null;
  }
}

export async function loadMeta(gameId: GameId): Promise<HistoryMeta | null> {
  try {
    const raw = await AsyncStorage.getItem(META + gameId);
    if (!raw) return null;
    return JSON.parse(raw) as HistoryMeta;
  } catch {
    return null;
  }
}

export async function clearHistory(gameId: GameId): Promise<void> {
  memory.delete(gameId);
  try {
    await AsyncStorage.removeItem(PREFIX + gameId);
    await AsyncStorage.removeItem(META + gameId);
  } catch {
    // ignore
  }
}

/** 轻量 KV：保存用户的界面偏好 */
export async function savePref<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(`zqm.pref.${key}`, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export async function loadPref<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(`zqm.pref.${key}`);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
