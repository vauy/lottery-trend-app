/**
 * 彩票数据与分析 Hooks
 * - useLotteryHistory：历史开奖数据加载 / 刷新 / 来源
 * - useLotteryAnalysis：基于 records 的分析计算（遗漏 / 频率 / 冷温热等）
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadHistory, refreshHistory, type DataSource } from '@/lib/lottery/datasource';
import type { DigitStat, DrawRecord, GameTypeDef } from '@/lib/lottery/types';
import { getDigits, getGame } from '@/lib/lottery/games';
import {
  buildDigitStats,
  buildFrequencyMap,
  getColdWarmHot,
} from '@/lib/lottery/analysis';

export interface LotteryHistoryState {
  records: DrawRecord[];
  loading: boolean;
  refreshing: boolean;
  source: DataSource;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useLotteryHistory(gameId: string, count: number): LotteryHistoryState {
  const [records, setRecords] = useState<DrawRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState<DataSource>('seed');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const result = isRefresh
          ? await refreshHistory(gameId, count)
          : await loadHistory(gameId, count);
        setRecords(result.records);
        setSource(result.source);
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [gameId, count],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { records, loading, refreshing, source, error, refresh };
}

export interface LotteryAnalysis {
  digits: number[];
  stats: DigitStat[];
  coldWarmHot: { cold: number[]; warm: number[]; hot: number[] };
  freqMap: Record<number, number>;
}

export function useLotteryAnalysis(
  game: GameTypeDef,
  records: DrawRecord[],
  window: number,
): LotteryAnalysis {
  return useMemo(() => {
    const digits = getDigits(game);
    const stats = buildDigitStats(
      records,
      digits,
      window,
      game.digitCount,
      digits.length,
    );
    const coldWarmHot = getColdWarmHot(stats);
    const freqMap = buildFrequencyMap(records, digits, window);
    return { digits, stats, coldWarmHot, freqMap };
  }, [game, records, window]);
}

/** 便捷函数：按玩法 id 获取玩法定义（供页面使用） */
export function useGame(gameId: string): GameTypeDef {
  return getGame(gameId);
}