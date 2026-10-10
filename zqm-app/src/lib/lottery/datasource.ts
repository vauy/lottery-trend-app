/**
 * 数据源层 —— 17500.cn 全量历史 + 本地缓存 + 中彩网备用 + 内置种子兜底
 *
 * 数据流：内存 → 本地缓存 → 17500.cn → 中彩网 API → 内置种子。
 * 统一对外输出「正序」records（index 0 最旧，末尾最新）。
 *
 * 17500.cn 文件格式（空格分隔，文件本身即正序）：
 *   位置型： 期号 日期 百 十 个 [其他数据...]
 *           2002001 2002-01-01 0 7 3 5 2 6 2 2 0 0 0 0 0 0 0
 *   排列五： 期号 日期 万 千 百 十 个 [其他数据...]
 *           2004001 2004-11-14 9 2 8 8 2 271814 1 100000
 *   快乐8： 期号 日期 号码×20 [销量/奖金额等...]
 *           2020001 2020-10-28 06 08 15 ... 80 16,754,776 ...
 */
import { FC3D_SEED } from './seed';
import { clearHistory, loadHistory, loadMeta, saveHistory } from './db';
import type { DrawRecord, GameId, GameTypeDef } from './types';
import { getGame } from './games';

export type DataSource = 'memory' | 'cache' | 'network' | 'seed';

export interface HistoryResult {
  /** 按 limit 截断后的记录（正序，末尾最新） */
  records: DrawRecord[];
  /** 全量历史（正序） */
  allRecords: DrawRecord[];
  source: DataSource;
  /** 缓存写入时间（仅 cache 来源有值） */
  refreshedAt?: string;
}

/** gameId → 17500 文件名 */
const SOURCE_MAP: Record<GameId, string> = {
  fc3d: '3d_asc.txt',
  pl3: 'pl3_asc.txt',
  pl5: 'pl5_asc.txt',
  kl8: 'kl8_asc.txt',
};

const BASE_URL = 'https://data.17500.cn';

/** 缓存有效期：6 小时 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const UA =
  'Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

/** 简单的并发去重：同一彩种同时只跑一个网络请求 */
const inflight = new Map<GameId, Promise<DrawRecord[]>>();

/** 规整日期字段，形如 "2002-01-01" */
export function parseDate(raw: string): string {
  const m = /^\d{4}-\d{2}-\d{2}/.exec(raw ?? '');
  return m ? m[0] : raw ?? '';
}

/**
 * 解析位置型文本（3D / 排列三 / 排列五）。
 * 前 drawCount 个数字即各位置的开奖号码，后面的是销量等附加数据，丢弃。
 */
export function parsePositionalText(text: string, drawCount: number): DrawRecord[] {
  const out: DrawRecord[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2 + drawCount) continue;

    const issue = parts[0];
    if (!/^\d{4,}$/.test(issue)) continue;
    const date = parseDate(parts[1]);
    if (!date) continue;

    const nums: number[] = [];
    let ok = true;
    for (let i = 0; i < drawCount; i += 1) {
      const n = parseInt(parts[2 + i], 10);
      if (!Number.isFinite(n)) {
        ok = false;
        break;
      }
      nums.push(n);
    }
    if (!ok) continue;
    out.push({ issue, date, nums });
  }
  return out;
}

/**
 * 解析快乐8 文本：日期后紧跟 20 个两位号码，后面是销量/奖金等附加数据。
 * 用「数值必须落在 1-80 且互不相同」来切出真正的号码段。
 */
export function parseKl8Text(text: string): DrawRecord[] {
  const out: DrawRecord[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 22) continue;

    const issue = parts[0];
    if (!/^\d{4,}$/.test(issue)) continue;
    const date = parseDate(parts[1]);
    if (!date) continue;

    const nums: number[] = [];
    const seen = new Set<number>();
    for (let i = 2; i < 22; i += 1) {
      const n = parseInt(parts[i], 10);
      if (!Number.isFinite(n) || n < 1 || n > 80 || seen.has(n)) break;
      seen.add(n);
      nums.push(n);
    }
    if (nums.length !== 20) continue;
    out.push({ issue, date, nums });
  }
  return out;
}

/** 解析 17500 文本（自动按彩种分派） */
export function parse17500Text(text: string, gameId: GameId): DrawRecord[] {
  if (gameId === 'kl8') return parseKl8Text(text);
  const game = getGame(gameId);
  return parsePositionalText(text, game.drawCount);
}

/** 从 17500 抓取全量历史（正序），失败抛错由上层兜底 */
export async function fetchFrom17500(gameId: GameId): Promise<DrawRecord[]> {
  const fileName = SOURCE_MAP[gameId];
  if (!fileName) throw new Error(`未配置的数据源：${gameId}`);

  const resp = await fetch(`${BASE_URL}/${fileName}`, {
    method: 'GET',
    headers: { 'User-Agent': UA, Accept: 'text/plain, */*' },
  });
  if (!resp.ok) throw new Error(`17500 HTTP ${resp.status}`);

  const text = await resp.text();
  const parsed = parse17500Text(text, gameId);
  if (parsed.length < 100) throw new Error(`17500 数据过少（${parsed.length} 期）`);
  return parsed;
}

/** 中彩网 3D API（备用） */
export async function fetch3dFromCwl(count = 500): Promise<DrawRecord[]> {
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=3d&issueCount=${count}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': UA, Accept: 'application/json, */*', Referer: 'https://www.cwl.gov.cn/ygkj/wqkjgg/' },
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
        .map((x: string) => parseInt(x, 10))
        .filter((n: number) => Number.isFinite(n)),
    }))
    .filter((r) => r.nums.length === 3)
    .reverse();
}

/** 中彩网快乐8 API（备用） */
export async function fetchKl8FromCwl(count = 2000): Promise<DrawRecord[]> {
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=kl8&issueCount=${count}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': UA, Accept: 'application/json, */*', Referer: 'https://www.cwl.gov.cn/ygkj/wqkjgg/' },
  });
  if (!resp.ok) throw new Error(`中彩网快乐8 HTTP ${resp.status}`);
  const json: any = await resp.json();
  const list: any[] = json?.result ?? [];
  return list
    .map((r) => ({
      issue: String(r.code ?? ''),
      date: String(r.date ?? '').split('(')[0],
      nums: String(r.red ?? '')
        .split(',')
        .map((x: string) => parseInt(x, 10))
        .filter((n: number) => Number.isFinite(n)),
    }))
    .filter((r) => r.nums.length === 20)
    .reverse();
}

/** 网络获取：17500 优先，中彩网兜底 */
async function fetchFromNetwork(gameId: GameId): Promise<DrawRecord[]> {
  try {
    return await fetchFrom17500(gameId);
  } catch {
    // 17500 不可用，走备用
  }
  if (gameId === 'fc3d') return fetch3dFromCwl();
  if (gameId === 'kl8') return fetchKl8FromCwl();
  throw new Error('所有数据源均不可用');
}

/** 内置种子（正序，仅 3D 有） */
export function getSeed(gameId: GameId): DrawRecord[] {
  if (gameId === 'fc3d') {
    return FC3D_SEED.map((s) => ({ issue: s.issue, date: s.date, nums: [...s.nums] }));
  }
  return [];
}

/** 校验一期数据是否符合彩种规则 */
export function isValidRecord(r: DrawRecord, game: GameTypeDef): boolean {
  if (!r.issue || !r.date || !Array.isArray(r.nums)) return false;
  if (r.nums.length !== game.drawCount) return false;
  return r.nums.every((n) => Number.isFinite(n) && n >= game.digitMin && n <= game.digitMax);
}

/** 去重 + 按期号排序（正序） */
export function normalizeRecords(records: DrawRecord[]): DrawRecord[] {
  const map = new Map<string, DrawRecord>();
  for (const r of records) {
    if (!r?.issue) continue;
    map.set(r.issue, r);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.issue.length !== b.issue.length) return a.issue.length - b.issue.length;
    return a.issue < b.issue ? -1 : a.issue > b.issue ? 1 : 0;
  });
}

/**
 * 获取历史数据主入口。
 *
 * @param gameId 彩种
 * @param limit  返回最近多少期（0 或负数表示不截断）
 * @param force  是否强制刷新（忽略缓存 TTL）
 */
export async function getHistory(
  gameId: GameId,
  limit = 0,
  force = false,
): Promise<HistoryResult> {
  const game = getGame(gameId);

  // 1) 先看缓存是否够新
  if (!force) {
    const meta = await loadMeta(gameId);
    const cached = await loadHistory(gameId);
    if (cached && cached.length) {
      const fresh = meta ? Date.now() - meta.ts < CACHE_TTL_MS : false;
      if (fresh) {
        return {
          allRecords: cached,
          records: limit > 0 ? cached.slice(-limit) : cached,
          source: 'cache',
          refreshedAt: meta ? new Date(meta.ts).toISOString() : undefined,
        };
      }
    }
  }

  // 2) 走网络（同彩种并发去重）
  let task = inflight.get(gameId);
  if (!task) {
    task = fetchFromNetwork(gameId);
    inflight.set(gameId, task);
  }

  let records: DrawRecord[] = [];
  let source: DataSource = 'network';
  try {
    records = await task;
  } catch {
    // 3) 网络全挂：退回缓存（即使过期）
    const cached = await loadHistory(gameId);
    if (cached && cached.length) {
      records = cached;
      source = 'cache';
    } else {
      // 4) 最后兜底：内置种子
      records = getSeed(gameId);
      source = 'seed';
    }
  } finally {
    inflight.delete(gameId);
  }

  // 校验 + 规整
  records = normalizeRecords(records.filter((r) => isValidRecord(r, game)));

  if (records.length && source === 'network') {
    await saveHistory(gameId, records);
  }

  return {
    allRecords: records,
    records: limit > 0 ? records.slice(-limit) : records,
    source,
    refreshedAt: new Date().toISOString(),
  };
}

/** 清空某彩种的本地缓存（设置页「清除缓存」用） */
export async function clearCache(gameId: GameId): Promise<void> {
  await clearHistory(gameId);
}

/** 清空全部缓存 */
export async function clearAllCache(): Promise<void> {
  const ids: GameId[] = ['fc3d', 'pl3', 'pl5', 'kl8'];
  await Promise.all(ids.map((id) => clearHistory(id)));
}

/** 强制刷新全部彩种（设置页「刷新全部」用） */
export async function refreshAll(limit = 0): Promise<void> {
  const ids: GameId[] = ['fc3d', 'pl3', 'pl5', 'kl8'];
  for (const id of ids) {
    try {
      await getHistory(id, limit, true);
    } catch {
      // 单个彩种失败不影响其他彩种
    }
  }
}

/** 各彩种缓存摘要，供设置页展示 */
export async function getCacheSummary(): Promise<
  Array<{ gameId: GameId; name: string; count: number; updatedAt: string | null }>
> {
  const ids: GameId[] = ['fc3d', 'pl3', 'pl5', 'kl8'];
  const out: Array<{ gameId: GameId; name: string; count: number; updatedAt: string | null }> = [];
  for (const id of ids) {
    const meta = await loadMeta(id);
    out.push({
      gameId: id,
      name: getGame(id).name,
      count: meta?.count ?? 0,
      updatedAt: meta ? new Date(meta.ts).toLocaleString('zh-CN') : null,
    });
  }
  return out;
}
