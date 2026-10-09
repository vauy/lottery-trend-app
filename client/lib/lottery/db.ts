/**
 * SQLite 持久化 —— 永久保留开奖数据，支持多源校验
 *
 * 表：
 *   draws         —— 开奖记录（主表）
 *   draws_backup  —— 全量刷新前的备份（成功后删除）
 *   conflicts     —— 多源冲突记录
 */
import * as SQLite from 'expo-sqlite';
import type { DrawRecord } from './types';

const DB_NAME = 'lottery.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** 串行队列：保证同时只有一个 DB 操作在执行 */
let dbQueue: Promise<unknown> = Promise.resolve();
/** 遇 database is locked 时自动重试 */
async function withRetry<T>(fn: () => Promise<T>, retries = 8, delayMs = 150): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i += 1) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes('locked')) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const wrapped = () => withRetry(task);
  const next = dbQueue.then(wrapped, wrapped);
  dbQueue = next.catch(() => {});
  return next as Promise<T>;
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await initSchema(db);
    return db;
  })();
  return dbPromise;
}

async function initSchema(d: SQLite.SQLiteDatabase): Promise<void> {
  await d.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS draws (
      game_id TEXT NOT NULL,
      issue TEXT NOT NULL,
      date TEXT,
      nums TEXT NOT NULL,
      source TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (game_id, issue)
    );
    CREATE INDEX IF NOT EXISTS idx_draws_game_date ON draws (game_id, date);

    CREATE TABLE IF NOT EXISTS draws_backup (
      game_id TEXT NOT NULL,
      issue TEXT NOT NULL,
      date TEXT,
      nums TEXT NOT NULL,
      source TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (game_id, issue)
    );

    CREATE TABLE IF NOT EXISTS conflicts (
      game_id TEXT NOT NULL,
      issue TEXT NOT NULL,
      nums_a TEXT NOT NULL,
      nums_b TEXT NOT NULL,
      source_a TEXT NOT NULL,
      source_b TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (game_id, issue)
    );
  `);
}

export type StoredDraw = DrawRecord & {
  source: string;
  verified: boolean;
};

export async function upsertDraws(
  gameId: string,
  records: DrawRecord[],
  source: string,
  verified: boolean,
): Promise<void> {
  if (records.length === 0) return;
  return enqueue(async () => {
    const d = await getDb();
    const now = Date.now();
    for (const r of records) {
      await d.runAsync(
        `INSERT INTO draws (game_id, issue, date, nums, source, verified, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(game_id, issue) DO UPDATE SET
           date = excluded.date,
           nums = excluded.nums,
           source = excluded.source,
           verified = CASE WHEN draws.verified = 1 OR excluded.verified = 1 THEN 1 ELSE 0 END,
           updated_at = excluded.updated_at`,
        [gameId, r.issue, r.date, JSON.stringify(r.nums), source, verified ? 1 : 0, now],
      );
    }
  });
}

export async function getAllDraws(gameId: string): Promise<StoredDraw[]> {  return enqueue(async () => {
  const d = await getDb();
  const rows = await d.getAllAsync<{
    issue: string; date: string; nums: string;
    source: string; verified: number;
  }>(
    `SELECT issue, date, nums, source, verified FROM draws WHERE game_id = ? ORDER BY issue ASC`,
    [gameId],
  );
  return rows.map((row) => ({
    issue: row.issue,
    date: row.date,
    nums: JSON.parse(row.nums) as number[],
    source: row.source,
    verified: row.verified === 1,
  }));
  });
}

export async function countDraws(gameId: string): Promise<number> {  return enqueue(async () => {
  const d = await getDb();
  const row = await d.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM draws WHERE game_id = ?`,
    [gameId],
  );
  return row?.c ?? 0;
  });
}

export async function backupDraws(gameId: string): Promise<void> {  return enqueue(async () => {
    const d = await getDb();
    await d.runAsync(`DELETE FROM draws_backup WHERE game_id = ?`, [gameId]);
    await d.runAsync(`INSERT INTO draws_backup SELECT * FROM draws WHERE game_id = ?`, [gameId]);
  });
}

export async function restoreBackupDraws(gameId: string): Promise<void> {  return enqueue(async () => {
    const d = await getDb();
    await d.runAsync(`DELETE FROM draws WHERE game_id = ?`, [gameId]);
    await d.runAsync(`INSERT INTO draws SELECT * FROM draws_backup WHERE game_id = ?`, [gameId]);
  });
}

export async function dropBackupDraws(gameId: string): Promise<void> {  return enqueue(async () => {
    const d = await getDb();
    await d.runAsync(`DELETE FROM draws_backup WHERE game_id = ?`, [gameId]);
  });
}

export async function addConflict(
  gameId: string, issue: string,
  numsA: number[], numsB: number[],
  sourceA: string, sourceB: string,
): Promise<void> {  return enqueue(async () => {
    const d = await getDb();
    await d.runAsync(
      `INSERT OR REPLACE INTO conflicts (game_id, issue, nums_a, nums_b, source_a, source_b, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [gameId, issue, JSON.stringify(numsA), JSON.stringify(numsB), sourceA, sourceB, Date.now()],
    );
  });
}

export async function countConflicts(gameId: string): Promise<number> {  return enqueue(async () => {
  const d = await getDb();
  const row = await d.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM conflicts WHERE game_id = ?`,
    [gameId],
  );
  return row?.c ?? 0;
  });
}
