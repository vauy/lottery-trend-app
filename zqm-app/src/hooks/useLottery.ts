/**
 * 历史开奖数据加载 hook
 *
 * 负责：首屏加载 → 缓存 → 17500.cn → 中彩网 → 种子兜底，并暴露手动刷新。
 */
import { useCallback, useEffect, useState } from 'react';
import { getHistory, type DataSource, type HistoryResult } from '../lib/lottery/datasource';
import type { DrawRecord, GameId } from '../lib/lottery/types';

export interface LotteryState {
  loading: boolean;
  error: string | null;
  source: DataSource | null;
  refreshedAt: string | null;
  /** 全部历史（正序） */
  allRecords: DrawRecord[];
  /** 按 limit 截断后的记录（正序，末尾最新） */
  records: DrawRecord[];
  refresh: (force?: boolean) => Promise<void>;
}

export function useLottery(gameId: GameId, limit = 300): LotteryState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HistoryResult | null>(null);

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getHistory(gameId, limit, force);
        setResult(res);
      } catch (e: any) {
        setError(e?.message ?? '加载失败');
      } finally {
        setLoading(false);
      }
    },
    [gameId, limit],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  return {
    loading,
    error,
    source: result?.source ?? null,
    refreshedAt: result?.refreshedAt ?? null,
    allRecords: result?.allRecords ?? [],
    records: result?.records ?? [],
    refresh: load,
  };
}
