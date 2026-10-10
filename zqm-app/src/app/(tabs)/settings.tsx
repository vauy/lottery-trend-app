/**
 * 设置 —— 数据源说明、缓存管理、免责声明
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Chip, Divider, Panel, Row, Spacer, Stat } from '../../components/ui/Kit';
import { clearAllCache, getCacheSummary, refreshAll } from '../../lib/lottery/datasource';
import { GAME_ORDER, getGame } from '../../lib/lottery/games';
import { fontSize, semantic, space } from '../../lib/theme';

type Summary = Awaited<ReturnType<typeof getCacheSummary>>;

export default function SettingsScreen() {
  const [summary, setSummary] = useState<Summary>([]);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    setSummary(await getCacheSummary());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const doClear = async () => {
    await clearAllCache();
    await reload();
  };

  const doRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    await reload();
    setRefreshing(false);
  };

  return (
    <Screen>
      <Panel title="数据来源">
        <Text style={styles.text}>
          主数据源：data.17500.cn 全量历史开奖文本（福彩3D / 排列三 / 排列五 / 快乐8）。
        </Text>
        <Spacer size={space.xs} />
        <Text style={styles.text}>
          备用源：中国福利彩票官网 API（www.cwl.gov.cn），仅在 17500 不可用时启用。
        </Text>
        <Spacer size={space.sm} />
        <Text style={styles.tip}>
          数据会写入本机缓存，缓存有效期 6 小时；「强制刷新」可立即重新拉取。
        </Text>
      </Panel>

      <Spacer size={space.md} />

      <Panel title="缓存管理">
        {summary.map((s) => (
          <View key={s.gameId} style={styles.cacheRow}>
            <Text style={styles.cacheName}>{s.name}</Text>
            <Text style={styles.cacheMeta}>
              {s.count ? `${s.count.toLocaleString()} 期` : '未缓存'}
              {s.updatedAt ? ` · ${s.updatedAt}` : ''}
            </Text>
          </View>
        ))}
        <Spacer size={space.sm} />
        <Divider />
        <Spacer size={space.sm} />
        <Row>
          <Chip label={refreshing ? '刷新中…' : '刷新全部'} active onPress={doRefresh} />
          <Chip label="清除缓存" onPress={doClear} />
        </Row>
      </Panel>

      <Spacer size={space.md} />

      <Panel title="支持彩种">
        <Row>
          {GAME_ORDER.map((id) => (
            <Stat
              key={id}
              label={getGame(id).name}
              value={
                getGame(id).style === 'keno'
                  ? '1-80 开 20'
                  : `${getGame(id).drawCount} 位 0-9`
              }
            />
          ))}
        </Row>
      </Panel>

      <Spacer size={space.md} />

      <Panel title="免责声明">
        <Text style={styles.text}>
          本软件仅为历史开奖数据的可视化与技术指标展示工具。彩票每期开奖均为相互独立的随机事件，
          任何「趋势」「遗漏」「冷热」「指标共振」等方法都不能改变其中奖概率。
        </Text>
        <Spacer size={space.sm} />
        <Text style={styles.text}>
          请理性购彩，量力而行，未满 18 周岁不得购彩。据此操作，风险自负。
        </Text>
      </Panel>

      <Spacer size={space.xxl} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: {
    color: semantic.textDim,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  tip: {
    color: semantic.textFaint,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  cacheRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semantic.panelBorder,
  },
  cacheName: {
    color: semantic.text,
    fontSize: fontSize.sm,
  },
  cacheMeta: {
    color: semantic.textFaint,
    fontSize: fontSize.xs,
  },
});
