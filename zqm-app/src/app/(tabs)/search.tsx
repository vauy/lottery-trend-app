/**
 * 搜索系统 —— 指标搜索 / 遗漏搜索
 *
 *  指标搜索：选定若干指标条件（金叉、触轨、超买超卖等），按「交集 / 并集」组合，
 *            并支持容错（允许 N 个条件出错），在历史中找出所有命中的「号码 × 期号」。
 *  遗漏搜索：用「遗漏节点序列」描述任意形态，在历史遗漏图里找匹配区间。
 *
 * 结果按「命中条件数」降序排列，便于优先关注共振最强的信号。
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { GameSwitch } from '../../components/GameSwitch';
import { Chip, Divider, Empty, Field, Input, Loading, Panel, Row, Segmented, Spacer } from '../../components/ui/Kit';
import { useLottery } from '../../hooks/useLottery';
import { useResponsive } from '../../hooks/useResponsive';
import { getDigits, getGame } from '../../lib/lottery/games';
import {
  buildCountChart,
  buildFrequencySeries,
  buildOmissionNodes,
  cumulative,
} from '../../lib/lottery/analysis';
import { INDICATOR_LIST, defaultParams, resonance } from '../../lib/lottery/indicators';
import { buildHitSeries } from '../../lib/lottery/targets';
import type { GameId, PosKey } from '../../lib/lottery/types';
import { fontSize, semantic, space } from '../../lib/theme';

type SearchMode = 'indicator' | 'omission' | 'count' | 'shape' | 'position';

const MODE_OPTIONS: Array<{ value: SearchMode; label: string }> = [
  { value: 'indicator', label: '指标搜索' },
  { value: 'omission', label: '遗漏搜索' },
  { value: 'count', label: '出次搜索' },
  { value: 'shape', label: '图形搜索' },
  { value: 'position', label: '定位搜索' },
];

/** 只对带信号判定的指标开放搜索 */
const SIGNAL_INDICATORS = INDICATOR_LIST.filter((d) => !!d.signals);

export default function SearchScreen() {
  const { landscape } = useResponsive();
  const [gameId, setGameId] = useState<GameId>('fc3d');
  const game = useMemo(() => getGame(gameId), [gameId]);
  const [pos, setPos] = useState<PosKey>('ge');
  const [mode, setMode] = useState<SearchMode>('indicator');

  /** 选中的指标条件 */
  const [picked, setPicked] = useState<string[]>(['macd']);
  const [logic, setLogic] = useState<'and' | 'or'>('and');
  const [tolerance, setTolerance] = useState(0);

  /** 遗漏节点形态，逗号分隔 */
  const [pattern, setPattern] = useState('3,5,2');

  /** 出次节点形态 + 分段步长 */
  const [countPattern, setCountPattern] = useState('2,3,2');
  const [countStep, setCountStep] = useState(10);

  /** K线阴阳形态：1=阳（中出/上行），0=阴（遗漏/下行） */
  const [shapePattern, setShapePattern] = useState('101');

  /** 定位形态：如 1*2（*=任意位） */
  const [posPattern, setPosPattern] = useState('1*2');

  const { loading, error, records, source } = useLottery(gameId, 400);

  const posOptions = useMemo(() => {
    if (game.style === 'keno') return [{ value: 'any' as PosKey, label: '号码' }];
    return [
      { value: 'any' as PosKey, label: '不定位' },
      ...game.positions.map((p) => ({ value: p.id as PosKey, label: p.name })),
    ];
  }, [game]);

  /** 指标搜索结果 */
  const indicatorResults = useMemo(() => {
    if (!records.length || !picked.length) return [];
    const digits = getDigits(game);
    const out: Array<{ digit: number; issue: string; date: string; hits: number; names: string[] }> = [];

    for (const d of digits) {
      const hits = buildHitSeries(records, game, { kind: 'digit', pos, digit: d });
      const closes = cumulative(buildFrequencySeries(hits, 1 / game.hitProbability)).slice(1);

      // 每个指标在每一期是否看多
      const flags: Array<{ name: string; bull: boolean[] }> = [];
      for (const id of picked) {
        const def = SIGNAL_INDICATORS.find((x) => x.id === id);
        if (!def?.signals) continue;
        const p = defaultParams(def);
        const res = def.signals(closes, p);
        // signals 返回的是「最新一期」的判定，这里需要整段序列，逐点重算
        const bull: boolean[] = [];
        for (let k = 1; k < closes.length; k += 1) {
          const r = def.signals(closes.slice(0, k + 1), p);
          bull.push(r.bull);
        }
        flags.push({ name: def.name, bull });
      }

      const len = closes.length;
      for (let k = 0; k < len; k += 1) {
        const marks = flags.map((f) => !!f.bull[k]);
        const signal = resonance(marks, tolerance);
        if (signal === 1) {
          out.push({
            digit: d,
            issue: records[k]?.issue ?? '',
            date: records[k]?.date ?? '',
            hits: marks.filter(Boolean).length,
            names: flags.filter((f, i) => marks[i]).map((f) => f.name),
          });
        }
      }
    }

    out.sort((a, b) => b.hits - a.hits);
    return out;
  }, [records, game, pos, picked, tolerance]);

  /** 遗漏搜索结果 */
  const omissionResults = useMemo(() => {
    if (!records.length) return [];
    const seq = pattern
      .split(/[,，\s]+/)
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (!seq.length) return [];

    const digits = getDigits(game);
    const out: Array<{ digit: number; startOrder: number; values: number[] }> = [];

    for (const d of digits) {
      const hits = buildHitSeries(records, game, { kind: 'digit', pos, digit: d });
      const nodes = buildOmissionNodes(hits, records, []);
      const values = nodes.map((n) => n.value);
      for (let i = 0; i + seq.length <= values.length; i += 1) {
        let ok = true;
        for (let j = 0; j < seq.length; j += 1) {
          if (values[i + j] !== seq[j]) {
            ok = false;
            break;
          }
        }
        if (ok) out.push({ digit: d, startOrder: nodes[i].order, values: seq });
      }
    }
    return out;
  }, [records, game, pos, pattern]);

  /** 出次搜索：分段步长内出现次数序列的连续匹配（官方《出次搜索》） */
  const countResults = useMemo(() => {
    if (!records.length) return [];
    const seq = countPattern
      .split(/[,，\s]+/)
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (!seq.length) return [];
    const digits = getDigits(game);
    const out: Array<{ digit: number; start: string; values: number[] }> = [];
    for (const d of digits) {
      const hits = buildHitSeries(records, game, { kind: 'digit', pos, digit: d });
      const pts = buildCountChart(hits, records, countStep);
      const values = pts.map((p) => p.count);
      for (let i = 0; i + seq.length <= values.length; i += 1) {
        if (seq.every((v, j) => values[i + j] === v)) {
          out.push({ digit: d, start: pts[i]?.label ?? '', values: seq });
        }
      }
    }
    return out;
  }, [records, game, pos, countPattern, countStep]);

  /** 图形搜索：频率K线的阴阳（上行/下行）序列匹配（官方《图形搜索》特征码） */
  const shapeResults = useMemo(() => {
    if (!records.length) return [];
    const seq = shapePattern.replace(/阳/g, '1').replace(/阴/g, '0').replace(/[^01]/g, '');
    if (seq.length < 2) return [];
    const digits = getDigits(game);
    const out: Array<{ digit: number; issue: string; seq: string }> = [];
    for (const d of digits) {
      const hits = buildHitSeries(records, game, { kind: 'digit', pos, digit: d });
      const freq = buildFrequencySeries(hits, 1 / game.hitProbability);
      const dirs: string[] = [];
      for (let i = 1; i < freq.length; i += 1) {
        dirs.push(freq[i] > freq[i - 1] ? '1' : '0');
      }
      for (let i = 0; i + seq.length <= dirs.length; i += 1) {
        if (dirs.slice(i, i + seq.length).join('') === seq) {
          out.push({ digit: d, issue: records[i]?.issue ?? '', seq });
        }
      }
    }
    return out;
  }, [records, game, pos, shapePattern]);

  /** 定位搜索：逐位号码模式（* 为任意），如 1*2（官方《定位搜索》） */
  const positionResults = useMemo(() => {
    if (!records.length || game.style === 'keno') return [];
    const pat = posPattern.trim();
    if (pat.length !== game.drawCount) return [];
    const out: Array<{ issue: string; nums: string }> = [];
    for (const r of records) {
      let ok = true;
      for (let i = 0; i < pat.length; i += 1) {
        const c = pat[i];
        if (c === '*' || c === '?' || c === '？') continue;
        if (String(r.nums[i]) !== c) {
          ok = false;
          break;
        }
      }
      if (ok) out.push({ issue: r.issue, nums: r.nums.join('') });
    }
    return out;
  }, [records, game, posPattern]);

  const posSeg = <Segmented options={posOptions} value={pos} onChange={(v) => setPos(v)} />;

  return (
    <Screen>
      <GameSwitch value={gameId} onChange={setGameId} />

      <Panel title="搜索类型">
        <View style={styles.chipWrap}>
          {MODE_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              active={mode === o.value}
              onPress={() => setMode(o.value)}
            />
          ))}
        </View>
        <Spacer size={space.md} />
        {mode === 'position' ? null : (
          <>
            <Text style={styles.label}>位置</Text>
            {posSeg}
          </>
        )}
      </Panel>

      <Spacer size={space.md} />

      {mode === 'indicator' ? (
        <>
          <Panel title="指标条件">
            <Row>
              {SIGNAL_INDICATORS.map((d) => (
                <Chip
                  key={d.id}
                  label={d.name}
                  active={picked.includes(d.id)}
                  onPress={() =>
                    setPicked((prev) =>
                      prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id],
                    )
                  }
                />
              ))}
            </Row>
            <Spacer size={space.md} />
            <Divider />
            <Spacer size={space.sm} />
            <Text style={styles.label}>组合方式</Text>
            <Segmented
              options={[
                { value: 'and' as const, label: '交集' },
                { value: 'or' as const, label: '并集' },
              ]}
              value={logic}
              onChange={(v) => setLogic(v as 'and' | 'or')}
            />
            <Spacer size={space.md} />
            <Field label={`容错（允许出错 ${tolerance} 个）`}>
              <Row gap={space.xs}>
                {[0, 1, 2, 3].map((n) => (
                  <Chip
                    key={n}
                    label={String(n)}
                    active={tolerance === n}
                    onPress={() => setTolerance(n)}
                    style={{ width: 40, height: 36 }}
                  />
                ))}
              </Row>
            </Field>
          </Panel>

          <Spacer size={space.md} />

          <Panel
            title={`命中结果（${indicatorResults.length}）`}
          >
            {loading ? <Loading text="计算中…" /> : null}
            {!loading && !indicatorResults.length ? <Empty text="没有符合条件的记录" /> : null}
            {indicatorResults.length ? (
              <ScrollView style={{ maxHeight: 420 }} nestedScrollEnabled>
                <View style={styles.tableHead}>
                  <Text style={[styles.th, styles.c0]}>号码</Text>
                  <Text style={[styles.th, styles.c1]}>期号</Text>
                  <Text style={[styles.th, styles.c1]}>日期</Text>
                  <Text style={[styles.th, styles.c2]}>命中指标</Text>
                </View>
                {indicatorResults.slice(0, 300).map((r, i) => (
                  <View key={`${r.digit}-${r.issue}-${i}`} style={styles.tr}>
                    <Text style={[styles.td, styles.c0]}>{r.digit}</Text>
                    <Text style={[styles.td, styles.c1]}>{r.issue}</Text>
                  <Text style={[styles.td, styles.c1]}>{r.date}</Text>
                    <Text style={[styles.td, styles.c2]} numberOfLines={1}>
                      {r.names.join('、')}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </Panel>
        </>
      ) : mode === 'omission' ? (
        <>
          <Panel title="遗漏节点形态">
            <Text style={styles.tip}>
              用逗号分隔一串遗漏值，表示「连续几次开出前的遗漏分别等于多少」。
              例如 3,5,2 表示要找：某次开出前遗漏 3 期，下一次开出前遗漏 5 期，再一次遗漏 2 期。
            </Text>
            <Spacer size={space.xs} />
            <Input value={pattern} onChangeText={setPattern} placeholder="如：3,5,2" />
          </Panel>

          <Spacer size={space.md} />

          <Panel title={`匹配结果（${omissionResults.length}）`}>
            {loading ? <Loading text="计算中…" /> : null}
            {!loading && !omissionResults.length ? <Empty text="没有匹配的形态" /> : null}
            {omissionResults.length ? (
              <ScrollView style={{ maxHeight: 420 }} nestedScrollEnabled>
                {omissionResults.slice(0, 300).map((r, i) => (
                  <View key={`${r.digit}-${r.startOrder}-${i}`} style={styles.tr}>
                    <Text style={[styles.td, styles.c0]}>{r.digit}</Text>
                    <Text style={[styles.td, styles.c1]}>第 {r.startOrder} 次开出起</Text>
                    <Text style={[styles.td, styles.c2]}>{r.values.join(' → ')}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </Panel>
        </>
      ) : mode === 'count' ? (
        <>
          <Panel title="出次节点形态">
            <Text style={styles.tip}>
              按「分段步长」统计每段内的出现次数，用逗号分隔一串次数，找连续匹配的分段。
              例如步长 10、形态 2,3,2 表示：连续三个 10 期分段里出现次数依次为 2、3、2。
            </Text>
            <Spacer size={space.xs} />
            <Input value={countPattern} onChangeText={setCountPattern} placeholder="如：2,3,2" />
            <Spacer size={space.sm} />
            <Text style={styles.label}>分段步长</Text>
            <View style={styles.chipWrap}>
              {[5, 10, 20, 50].map((n) => (
                <Chip
                  key={n}
                  label={String(n)}
                  active={countStep === n}
                  onPress={() => setCountStep(n)}
                />
              ))}
            </View>
          </Panel>

          <Spacer size={space.md} />

          <Panel title={`匹配结果（${countResults.length}）`}>
            {loading ? <Loading text="计算中…" /> : null}
            {!loading && !countResults.length ? <Empty text="没有匹配的形态" /> : null}
            {countResults.length ? (
              <ScrollView style={{ maxHeight: 420 }} nestedScrollEnabled>
                {countResults.slice(0, 300).map((r, i) => (
                  <View key={`${r.digit}-${r.start}-${i}`} style={styles.tr}>
                    <Text style={[styles.td, styles.c0]}>{r.digit}</Text>
                    <Text style={[styles.td, styles.c1]}>{r.start} 起</Text>
                    <Text style={[styles.td, styles.c2]}>{r.values.join(' → ')}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </Panel>
        </>
      ) : mode === 'shape' ? (
        <>
          <Panel title="图形特征码">
            <Text style={styles.tip}>
              用频率K线的阴阳序列描述形态：1（或「阳」）= 中出/上行，0（或「阴」）= 遗漏/下行。
              例如 101 表示「阳、阴、阳」三段。可混合输入，如 阳阴阳。
            </Text>
            <Spacer size={space.xs} />
            <Input value={shapePattern} onChangeText={setShapePattern} placeholder="如：101 或 阳阴阳" />
          </Panel>

          <Spacer size={space.md} />

          <Panel title={`匹配结果（${shapeResults.length}）`}>
            {loading ? <Loading text="计算中…" /> : null}
            {!loading && !shapeResults.length ? <Empty text="没有匹配的形态" /> : null}
            {shapeResults.length ? (
              <ScrollView style={{ maxHeight: 420 }} nestedScrollEnabled>
                {shapeResults.slice(0, 300).map((r, i) => (
                  <View key={`${r.digit}-${r.issue}-${i}`} style={styles.tr}>
                    <Text style={[styles.td, styles.c0]}>{r.digit}</Text>
                    <Text style={[styles.td, styles.c1]}>{r.issue} 起</Text>
                    <Text style={[styles.td, styles.c2]}>{r.seq}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </Panel>
        </>
      ) : (
        <>
          <Panel title="定位号码形态">
            <Text style={styles.tip}>
              按位数输入号码，* 或 ？ 表示该位任意。{game.style === 'keno'
                ? '快乐8 为无位置彩种，不支持定位搜索。'
                : `本彩种共 ${game.drawCount} 位，例如 ${game.drawCount === 3 ? '1*2' : '1**2*'}。`}
            </Text>
            <Spacer size={space.xs} />
            <Input value={posPattern} onChangeText={setPosPattern} placeholder="如：1*2" />
          </Panel>

          <Spacer size={space.md} />

          <Panel title={`匹配结果（${positionResults.length}）`}>
            {loading ? <Loading text="计算中…" /> : null}
            {!loading && !positionResults.length ? <Empty text="没有匹配的记录" /> : null}
            {positionResults.length ? (
              <ScrollView style={{ maxHeight: 420 }} nestedScrollEnabled>
                {positionResults.slice(0, 300).map((r, i) => (
                  <View key={`${r.issue}-${i}`} style={styles.tr}>
                    <Text style={[styles.td, styles.c1]}>{r.issue}</Text>
                    <Text style={[styles.td, styles.c2, styles.num]}>{r.nums}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </Panel>
        </>
      )}

      <Spacer size={space.xl} />
      <Text style={styles.meta}>数据源：data.17500.cn（{source ?? '—'}）</Text>
      <Spacer size={space.xxl} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  num: {
    fontWeight: '700',
    color: semantic.brand,
    letterSpacing: 1,
  },
  label: {
    color: semantic.textDim,
    fontSize: fontSize.sm,
    marginBottom: space.xs,
  },
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
  c0: { flex: 1, minWidth: 48 },
  c1: { flex: 1.6, minWidth: 76 },
  c2: { flex: 2, minWidth: 100 },
  tip: {
    color: semantic.textFaint,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  meta: {
    color: semantic.textFaint,
    fontSize: fontSize.xs,
  },
});
