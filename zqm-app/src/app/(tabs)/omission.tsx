/**
 * 遗漏统计 —— 当前遗漏 / 平均遗漏 / 最大遗漏 / 欲出几率 / 冷温热
 *
 * 表格列宽按比例分配，横屏时自动放宽列数显示；快乐8 有 80 个号码，
 * 表格放在可滚动区域内，支持按「当前遗漏」或「号码」排序。
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { GameSwitch } from '../../components/GameSwitch';
import { Chip, Divider, Empty, Loading, Panel, Row, Segmented, Spacer, Stat } from '../../components/ui/Kit';
import { useLottery } from '../../hooks/useLottery';
import { useResponsive } from '../../hooks/useResponsive';
import { getGame } from '../../lib/lottery/games';
import {
  buildDrawOmission,
  buildOmissionStats,
  buildOmissionSums,
} from '../../lib/lottery/analysis';
import type { GameId, PosKey } from '../../lib/lottery/types';
import { fontSize, semantic, space, temperatureColor } from '../../lib/theme';

type SortKey = 'digit' | 'current' | 'max' | 'freq';

export default function OmissionScreen() {
  const { landscape, width } = useResponsive();
  const [gameId, setGameId] = useState<GameId>('fc3d');
  const game = useMemo(() => getGame(gameId), [gameId]);
  const [pos, setPos] = useState<PosKey>('ge');
  const [sortKey, setSortKey] = useState<SortKey>('digit');
  const [desc, setDesc] = useState(false);

  const { loading, error, records, source, refresh } = useLottery(gameId, 1000);

  /** 切换彩种时重置位置 */
  React.useEffect(() => {
    if (game.style === 'keno') setPos('any');
    else setPos((p) => (game.positions.some((x) => x.id === p) ? p : game.positions[0].id));
  }, [game]);

  const stats = useMemo(() => {
    if (!records.length) return [];
    return buildOmissionStats(records, game, (digit) => ({ kind: 'digit', pos, digit }));
  }, [records, game, pos]);

  const sorted = useMemo(() => {
    const arr = [...stats];
    arr.sort((a, b) => {
      let va: number;
      let vb: number;
      if (sortKey === 'digit') {
        va = a.digit;
        vb = b.digit;
      } else if (sortKey === 'current') {
        va = a.current;
        vb = b.current;
      } else if (sortKey === 'max') {
        va = a.maxOmission;
        vb = b.maxOmission;
      } else {
        va = a.frequency;
        vb = b.frequency;
      }
      return desc ? vb - va : va - vb;
    });
    return arr;
  }, [stats, sortKey, desc]);

  /**
   * 遗漏和三口径（对应帮助文件《遗漏和》）：
   *   组选 = 当期开奖号在不定位口径下的遗漏之和
   *   全胆 = 全部号码在不定位口径下的遗漏之和
   *   直选 = 当期开奖号按各自位置口径统计的遗漏之和
   */
  const sums = useMemo(() => {
    if (!records.length) return null;
    return buildOmissionSums(records, game, records.length - 1);
  }, [records, game]);

  /** 开出遗漏：当期开奖号各位置的「上次遗漏」 */
  const drawOmit = useMemo(() => {
    if (!records.length) return [];
    return buildDrawOmission(records, game, records.length - 1);
  }, [records, game]);

  const posOptions = useMemo(() => {
    if (game.style === 'keno') return [{ value: 'any' as PosKey, label: '号码' }];
    return [
      { value: 'any' as PosKey, label: '不定位' },
      ...game.positions.map((p) => ({ value: p.id as PosKey, label: p.name })),
    ];
  }, [game]);

  const sortOptions: Array<{ value: SortKey; label: string }> = [
    { value: 'digit', label: '按号码' },
    { value: 'current', label: '按当前遗漏' },
    { value: 'max', label: '按最大遗漏' },
    { value: 'freq', label: '按出次' },
  ];

  return (
    <Screen>
      <GameSwitch value={gameId} onChange={setGameId} />

      {loading ? (
        <Panel>
          <Loading text="正在获取历史开奖数据…" />
      </Panel>
      ) : error ? (
        <Panel>
          <Empty text={error} />
        </Panel>
      ) : !records.length ? (
        <Panel>
          <Empty text="暂无数据" />
        </Panel>
      ) : (
        <>
          <Panel title="遗漏统计">
            <Segmented options={posOptions} value={pos} onChange={(v) => setPos(v)} />
            <Spacer size={space.md} />
            <Divider />
            <Spacer size={space.sm} />
            <Row>
              <Segmented options={sortOptions} value={sortKey} onChange={(v) => setSortKey(v)} />
              <Chip label={desc ? '降序' : '升序'} active onPress={() => setDesc((v) => !v)} />
            </Row>
            <Spacer size={space.sm} />

            <View style={styles.tableHead}>
              <Text style={[styles.th, styles.c0]}>号码</Text>
              <Text style={[styles.th, styles.c1]}>当前</Text>
              <Text style={[styles.th, styles.c1]}>平均</Text>
              <Text style={[styles.th, styles.c1]}>最大</Text>
              {landscape ? <Text style={[styles.th, styles.c1]}>出次</Text> : null}
              <Text style={[styles.th, styles.c1]}>欲出</Text>
              {landscape ? <Text style={[styles.th, styles.c1]}>投资</Text> : null}
              {landscape ? <Text style={[styles.th, styles.c1]}>回补</Text> : null}
              <Text style={[styles.th, styles.c2]}>状态</Text>
            </View>

            <ScrollView
              style={{ maxHeight: landscape ? 320 : 420 }}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {sorted.map((s) => (
                <View key={s.digit} style={styles.tr}>
                  <Text style={[styles.td, styles.c0]}>{s.digit}</Text>
                  <Text
                    style={[styles.td, styles.c1, s.current > s.avgOmission * 2 && { color: semantic.hot }]}
                  >
                    {s.current}
                  </Text>
                  <Text style={[styles.td, styles.c1]}>{s.avgOmission}</Text>
                  <Text style={[styles.td, styles.c1]}>{s.maxOmission}</Text>
                  {landscape ? <Text style={[styles.td, styles.c1]}>{s.frequency}</Text> : null}
                  <Text style={[styles.td, styles.c1]}>{s.wantRatio}</Text>
                  {landscape ? <Text style={[styles.td, styles.c1]}>{s.investRatio}</Text> : null}
                  {landscape ? <Text style={[styles.td, styles.c1]}>{s.coverRatio}</Text> : null}
                  <Text style={[styles.td, styles.c2, { color: temperatureColor(s.temperature) }]}>
                    {s.temperature === 'hot' ? '热' : s.temperature === 'warm' ? '温' : '冷'}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </Panel>

          <Spacer size={space.md} />

          {sums ? (
            <Panel title="遗漏和（三种口径）">
              <Row>
                <Stat
                  label="组选遗漏和"
                  value={sums.group ?? '—'}
                  color={(sums.group ?? 0) >= 11 ? semantic.hot : semantic.text}
                />
                <Stat label="全胆遗漏和" value={sums.all ?? '—'} />
                <Stat
                  label="直选遗漏和"
                  value={sums.straight ?? '—'}
                  color={(sums.straight ?? 0) >= 11 ? semantic.hot : semantic.text}
                />
              </Row>
              <Spacer size={space.sm} />
              <Text style={styles.tip}>
                组选 = 当期开奖号在不定位口径下的遗漏之和；全胆 = 全部号码遗漏之和；
                直选 = 当期开奖号按各自位置口径统计的遗漏之和（如排列五后三【24450】
                → 3(百)+5(十)+13(个)=21）。官方经验：组选遗漏和均值约 11，≥11 时下期
                约 90% 概率回落。
              </Text>
              <Spacer size={space.xs} />
              <Text style={styles.disclaimer}>
                上述均为经验统计规律，不构成任何预测保证，请理性购彩。
              </Text>
            </Panel>
          ) : null}

          <Spacer size={space.md} />

          {drawOmit.length ? (
            <Panel title="开出遗漏（当期）">
              <Row>
                {drawOmit.map((it, i) => (
                  <Stat
                    key={`${it.pos}-${it.digit}-${i}`}
                    label={`${it.posName} ${it.digit}`}
                    value={it.lastOmission}
                    color={it.lastOmission >= 11 ? semantic.hot : semantic.text}
                  />
                ))}
              </Row>
              <Spacer size={space.sm} />
              <Text style={styles.tip}>
                开出遗漏 = 当期开奖号码各位置的「上次遗漏」：该数字上一次开出之前
                经历了多少期未出。直选口径按位置分别统计，组选口径不定位统计。
              </Text>
            </Panel>
          ) : null}
        </>
      )}

      <Spacer size={space.xl} />
      <Row>
        <Text style={styles.meta}>数据源：data.17500.cn（{source ?? '—'}）</Text>
        <Chip label="刷新" onPress={() => refresh(true)} />
      </Row>
      <Spacer size={space.xxl} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tableHead: {
    flexDirection: 'row',
    paddingVertical: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: semantic.panelBorder,
  },
  tr: {
    flexDirection: 'row',
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semantic.panelBorder,
  },
  th: {
    color: semantic.textFaint,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textAlign: 'center',
  },
  td: {
    color: semantic.text,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  c0: { flex: 1.2, minWidth: 44 },
  c1: { flex: 1, minWidth: 40 },
  c2: { flex: 1, minWidth: 40 },
  tip: {
    color: semantic.textFaint,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  disclaimer: {
    color: semantic.warn,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  meta: {
    color: semantic.textFaint,
    fontSize: fontSize.xs,
    flexShrink: 1,
  },
});
