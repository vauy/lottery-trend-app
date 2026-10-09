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
import {
  getAllDraws,
  upsertDraws,
  countDraws,
  backupDraws,
  restoreBackupDraws,
  dropBackupDraws,
  addConflict,
  countConflicts,
} from './db';

export type DataSource = 'network' | 'cache' | 'seed';

export interface HistoryResult {
  records: DrawRecord[];
  /** 全量历史（未截断） */
  allRecords: DrawRecord[];
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
  // 快乐8 走中彩网 API
  if (gameId === 'kl8') {
    return fetchKl8History();
  }
  const fileName = SOURCE_MAP[gameId];
  if (!fileName) {
    throw new Error(`未配置的数据源：${gameId}`);
  }

  // 首选：17500
  try {
    const url = `${BASE_URL}/${fileName}`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
        Accept: 'text/plain, */*',
      },
    });
    if (resp.ok) {
      const text = await resp.text();
      const parsed = parse17500Text(text);
      if (parsed.length > 100) return parsed;
    }
  } catch {
    // 17500 失败，走备用
  }

  // 备用：福彩3D 走中彩网
  if (gameId === 'fc3d') {
    return fetch3dFromCwl();
  }

  throw new Error('所有数据源均不可用');
}

/**
 * 解析 17500 文本格式：
 *   期号 日期 百 十 个 [其他...]
 */


/** 中彩网 3D API */
const CWL_3D_API = 'https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=3d&issueCount=100';

/** 从中彩网抓取 3D 历史（正序） */
export async function fetch3dFromCwl(count = 100): Promise<DrawRecord[]> {
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=3d&issueCount=${count}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
      Accept: 'application/json, */*',
      Referer: 'https://www.cwl.gov.cn/ygkj/wqkjgg/',
    },
  });
  if (!resp.ok) throw new Error(`中彩网 3D HTTP ${resp.status}`);
  const json: any = await resp.json();
  const list: any[] = json?.result ?? [];
  return list
    .map((r) => ({
      issue: String(r.code ?? ''),
      date: String(r.date ?? '').split('(')[0],
      nums: String(r.red ?? '')
        .split(',')
        .map((x) => parseInt(x, 10))
        .filter((n) => Number.isFinite(n)),
    }))
    .filter((r) => r.nums.length === 3)
    .reverse();
}

/** 中彩网快乐8 API */
const KL8_API = 'https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=kl8&issueCount=2000';

/** 抓取快乐8 全量历史（正序，最多 2000 期） */
export async function fetchKl8History(count = 2000): Promise<DrawRecord[]> {
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=kl8&issueCount=${count}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
      Accept: 'application/json, */*',
      Referer: 'https://www.cwl.gov.cn/ygkj/wqkjgg/',
    },
  });
  if (!resp.ok) throw new Error(`中彩网 HTTP ${resp.status}`);
  const json: any = await resp.json();
  const list: any[] = json?.result ?? [];
  const out: DrawRecord[] = list
    .map((r) => ({
      issue: String(r.code ?? ''),
      date: String(r.date ?? '').split('(')[0],
      nums: String(r.red ?? '')
        .split(',')
        .map((x) => parseInt(x, 10))
        .filter((n) => Number.isFinite(n)),
    }))
    .filter((r) => r.nums.length === 20)
    .reverse(); // 转正序
  return out;
}

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
  // 1) 优先读 SQLite（永久保留）
  try {
    const dbRecords = await getAllDraws(gameId);
    if (dbRecords.length > 0 && !opts.forceRefresh) {
      if (dbRecords.length < count) {
        // 不够用，后台补拉
        void refreshInBackground(gameId);
      }
      return {
        records: dbRecords.slice(-count),
        allRecords: dbRecords,
        source: 'cache',
      };
    }
  } catch {
    // SQLite 失败就继续走网络
  }

  // 2) 网络拉全量
  try {
    const full = await fetchFullHistory(gameId);
    try { await upsertDraws(gameId, full, 'primary', false); } catch {}
    return { records: full.slice(-count), allRecords: full, source: 'network' };
  } catch {
    // 3) 网络失败 → SQLite 兜底（即使 forceRefresh 也返回旧数据）
    try {
      const dbRecords = await getAllDraws(gameId);
      if (dbRecords.length > 0) {
        return {
          records: dbRecords.slice(-count),
          allRecords: dbRecords,
          source: 'cache',
        };
      }
    } catch {}
    // 4) 完全兜底种子
    const seed = getSeed();
    return { records: seed.slice(-count), allRecords: seed, source: 'seed' };
  }
}

async function refreshInBackground(gameId: string): Promise<void> {
  try {
    const full = await fetchFullHistory(gameId);
    try { await upsertDraws(gameId, full, 'primary', false); } catch {}
    await writeCache(gameId, full);
  } catch {
    // 静默失败
  }
}

/**
 * 增量刷新：
 *   - fc3d / kl8 走中彩网 API 拉最近 N 期（秒级）
 *   - pl3 / pl5 没有官方增量接口，降级为 17500 全量
 */
export async function refreshHistory(
  gameId: string,
  count: number,
): Promise<HistoryResult> {
  // 优先尝试增量
  try {
    let fresh: DrawRecord[] = [];
    if (gameId === 'fc3d') {
      fresh = await fetch3dFromCwl(100);
    } else if (gameId === 'kl8') {
      fresh = await fetchKl8History(100);
    }
    if (fresh.length > 0) {
      await upsertDraws(gameId, fresh, 'cwl', true);
      const all = await getAllDraws(gameId);
      if (all.length > 0) {
        return {
          records: all.slice(-count),
          allRecords: all,
          source: 'network',
        };
      }
    }
  } catch {
    // 增量失败，继续走全量
  }
  // 降级：全量
  return loadHistory(gameId, count, { forceRefresh: true });
}


/** 判断两条记录是否一致（期号 + 号码） */
function sameDraw(a: DrawRecord, b: DrawRecord): boolean {
  if (a.issue !== b.issue) return false;
  if (a.nums.length !== b.nums.length) return false;
  for (let i = 0; i < a.nums.length; i += 1) {
    if (a.nums[i] !== b.nums[i]) return false;
  }
  return true;
}

export interface VerifyStats {
  total: number;       // 库里的总条数
  fromPrimary: number; // 主源拉取条数
  fromBackup: number;  // 备源对比条数
  conflicts: number;   // 冲突期数
  verified: number;    // 校验通过的期数
}

/**
 * 全量数据：备份 → 拉全量 → 双源校验 → 写库
 * 失败自动回滚
 */
export async function fetchAllAndVerify(
  gameId: string,
  onProgress?: (msg: string) => void,
): Promise<VerifyStats> {
  const stats: VerifyStats = { total: 0, fromPrimary: 0, fromBackup: 0, conflicts: 0, verified: 0 };
  onProgress?.('备份现有数据…');
  await backupDraws(gameId);

  try {
    onProgress?.('从主源拉取全量…');
    const primary = await fetchFullHistory(gameId);
    stats.fromPrimary = primary.length;
    if (primary.length === 0) throw new Error('主源无数据');

    // 双源对比：只对支持的彩种
    let backup: DrawRecord[] = [];
    if (gameId === 'fc3d') {
      onProgress?.('从中彩网拉取对比数据…');
      try { backup = await fetch3dFromCwl(100); } catch {}
    }
    stats.fromBackup = backup.length;

    // 建立 index
    const backupMap = new Map<string, DrawRecord>();
    for (const r of backup) backupMap.set(r.issue, r);

    // 逐期对比 + 标记
    const conflictBatch: { issue: string; numsA: number[]; numsB: number[] }[] = [];
    const merged: DrawRecord[] = [];
    const verifiedIssues = new Set<string>();
    for (const r of primary) {
      const b = backupMap.get(r.issue);
      if (b) {
        if (sameDraw(r, b)) {
          verifiedIssues.add(r.issue);
        } else {
          // 冲突：收集，最后批量写
          conflictBatch.push({ issue: r.issue, numsA: r.nums, numsB: b.nums });
          stats.conflicts += 1;
        }
      }
      merged.push(r);
    }
    stats.verified = verifiedIssues.size;

    // 写库
    onProgress?.('写入数据库…');
    await upsertDraws(gameId, merged, 'primary', false);
    // 校验通过的标记 verified=1
    for (const issue of verifiedIssues) {
      // 直接用 upsert 再写一遍会重置 verified 逻辑，需要单独 update
      // 简化：把 verified 期分成一个子集，一次性 upsert
    }
    // 批量标记 verified
    if (verifiedIssues.size > 0) {
      await upsertDraws(
        gameId,
        merged.filter((r) => verifiedIssues.has(r.issue)),
        'primary',
        true,
      );
    }

    onProgress?.('写入冲突记录…');
    for (const c of conflictBatch) {
      await addConflict(gameId, c.issue, c.numsA, c.numsB, 'primary', 'cwl');
    }

    onProgress?.('清理备份…');
    await dropBackupDraws(gameId);
    stats.total = merged.length;
    return stats;
  } catch (e) {
    onProgress?.('失败，回滚…');
    try { await restoreBackupDraws(gameId); } catch {}
    throw e;
  }
}

/**
 * 校验数据：不重新拉全量，仅对本地已有的期做双源对比
 */
export async function verifyLocalData(
  gameId: string,
  onProgress?: (msg: string) => void,
): Promise<{ checked: number; conflicts: number }> {
  onProgress?.('读取本地数据…');
  const local = await getAllDraws(gameId);
  if (local.length === 0) {
    return { checked: 0, conflicts: 0 };
  }

  let conflicts = 0;
  let checked = 0;

  if (gameId === 'fc3d') {
    onProgress?.('从中彩网拉取对比数据…');
    let remote: DrawRecord[] = [];
    try { remote = await fetch3dFromCwl(100); } catch {}
    const remoteMap = new Map<string, DrawRecord>();
    for (const r of remote) remoteMap.set(r.issue, r);

    onProgress?.('逐期对比…');
    const verifiedIssues: string[] = [];
    for (const r of local) {
      const b = remoteMap.get(r.issue);
      if (!b) continue;
      checked += 1;
      if (sameDraw(r, b)) {
        verifiedIssues.push(r.issue);
      } else {
        await addConflict(gameId, r.issue, r.nums, b.nums, r.source || 'local', 'cwl');
        conflicts += 1;
      }
    }
    // 标记通过
    if (verifiedIssues.length > 0) {
      const set = new Set(verifiedIssues);
      await upsertDraws(
        gameId,
        local.filter((r) => set.has(r.issue)),
        'primary',
        true,
      );
    }
  } else {
    // 无对比源，跳过
    checked = 0;
  }

  return { checked, conflicts };
}
