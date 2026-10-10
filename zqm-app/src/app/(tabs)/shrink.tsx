/**
 * 组号缩水 —— 按位选号 → 笛卡尔积展开 → 应用过滤条件 → 输出剩余组合
 *
 * 对应帮助文档的「组号工具」九大类过滤参数。此处实现最常用的几类：
 * 和值 / 跨度 / 奇数个数 / 大数个数 / 质数个数 / 文本大底。
 * 展开量受 MAX_COMBOS 保护，超过上限会给出提示而不是卡死。
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '../../components/Screen';
import { GameSwitch } from '../../components/GameSwitch';
import { NumberPicker } from '../../components/NumberPicker';
import { Chip, Divider, Empty, Field, Input, Panel, Row, Segmented, Spacer, Stat } from '../../components/ui/Kit';
import { useLottery } from '../../hooks/useLottery';
import { useResponsive } from '../../hooks/useResponsive';
import { getGame } from '../../lib/lottery/games';
import { shrink as runShrink, comboKey, parseTextBase } from '../../lib/lottery/shrink';
import type { GameId } from '../../lib/lottery/types';
import { fontSize, radius, semantic, space } from '../../lib/theme';

interface RangeCfg {
  enabled: boolean;
  min: string;
  max: string;
}

const ALL_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function ShrinkScreen() {
  const { landscape } = useResponsive();
  const [gameId, setGameId] = useState<GameId>('pl3');
  const game = useMemo(() => getGame(gameId), [gameId]);

  /** 每一位的候选数字，切换彩种时重建 */
  const [slots, setSlots] = useState<number[][]>(() => [ALL_DIGITS, ALL_DIGITS, ALL_DIGITS]);

  React.useEffect(() => {
    const n = game.style === 'keno' ? 0 : game.drawCount;
    setSlots(Array.from({ length: n }, () => [...ALL_DIGITS]));
  }, [game]);

  const [sum, setSum] = useState<RangeCfg>({ enabled: false, min: '0', max: '27' });
  const [span, setSpan] = useState<RangeCfg>({ enabled: false, min: '0', max: '9' });
  const [odd, setOdd] = useState<RangeCfg>({ enabled: false, min: '1', max: '2' });
  const [big, setBig] = useState<RangeCfg>({ enabled: false, min: '1', max: '2' });
  const [prime, setPrime] = useState<RangeCfg>({ enabled: false, min: '0', max: '2' });
  const [textBase, setTextBase] = useState('');

  const [result, setResult] = useState<ReturnType<typeof runShrink> | null>(null);
  const [busy, setBusy] = useState(false);

  const { records, source } = useLottery(gameId, 200);

  const prev = useMemo(() => (records.length > 1 ? records[records.length - 2].nums : undefined), [records]);

  const total = useMemo(
    () => slots.reduce((a, s) => a * (s?.length || 0), slots.length ? 1 : 0),
    [slots],
  );

  const isKeno = game.style === 'keno';

  const doShrink = () => {
    setBusy(true);
    const filters = [
      { id: 'sum', enabled: sum.enabled, cfg: { min: numOrUndef(sum.min), max: numOrUndef(sum.max) } },
      { id: 'span', enabled: span.enabled, cfg: { min: numOrUndef(span.min), max: numOrUndef(span.max) } },
      { id: 'odd', enabled: odd.enabled, cfg: { min: numOrUndef(odd.min), max: numOrUndef(odd.max) } },
      { id: 'big', enabled: big.enabled, cfg: { min: numOrUndef(big.min), max: numOrUndef(big.max) } },
      { id: 'prime', enabled: prime.enabled, cfg: { min: numOrUndef(prime.min), max: numOrUndef(prime.max) } },
    ];
    const res = runShrink(game, { slots, filters }, { prev });
    setResult(res);
    setBusy(false);
  };

  const copyAll = async () => {
    if (!result) return;
    await Clipboard.setStringAsync(result.list.map(comboKey).join('\n'));
  };

  return (
    <Screen>
      <GameSwitch value={gameId} onChange={setGameId} />

      {isKeno ? (
        <Panel>
          <Empty text="快乐8 为无位置彩种，不支持定位组号，请使用「K线 / 遗漏」分析" />
        </Panel>
      ) : (
        <>
          <Panel title="按位选号">
            {slots.map((sel, idx) => (
              <View key={idx} style={styles.slotBlock}>
                <Text style={styles.slotTitle}>{game.positions[idx]?.name ?? `第${idx + 1}位`}</Text>
                <NumberPicker
                  game={game}
                  value={sel}
                  onChange={(next) => {
                    const copy = [...slots];
                    copy[idx] = next;
                    setSlots(copy);
                  }}
                />
              </View>
            ))}
            <Spacer size={space.sm} />
            <Divider />
            <Spacer size={space.sm} />
            <Text style={styles.total}>展开组合数：{total.toLocaleString()}</Text>
          </Panel>

          <Spacer size={space.md} />

          <Panel title="过滤条件">
            <RangeRow label="和值" cfg={sum} onChange={setSum} />
            <Divider />
            <RangeRow label="跨度" cfg={span} onChange={setSpan} />
            <Divider />
            <RangeRow label="奇数个数" cfg={odd} onChange={setOdd} />
            <Divider />
            <RangeRow label="大数个数" cfg={big} onChange={setBig} />
            <Divider />
            <RangeRow label="质数个数" cfg={prime} onChange={setPrime} />
          </Panel>

          <Spacer size={space.md} />

          <Panel title="文本大底（可选）">
            <Text style={styles.tip}>每行或每个空格分隔一段号码，留空表示不限制。</Text>
            <Spacer size={space.xs} />
            <TextInput
              value={textBase}
              onChangeText={setTextBase}
              placeholder="如：123 456 789"
              placeholderTextColor={semantic.textFaint}
              multiline
              style={styles.textArea}
            />
          </Panel>

          <Spacer size={space.md} />

          <Row>
            <Chip label={busy ? '计算中…' : '开始缩水'} active onPress={doShrink} />
            {result ? <Chip label="复制结果" onPress={copyAll} /> : null}
            <Text style={styles.meta}>数据源：{source ?? '—'}</Text>
          </Row>

          <Spacer size={space.md} />

          {result?.error ? <Panel><Empty text={result.error} /></Panel> : null}

          {result && !result.error ? (
            <Panel title={`缩水结果：${result.kept.toLocaleString()} / ${result.total.toLocaleString()} 注`}>
              <ScrollView style={{ maxHeight: 360 }} nestedScrollEnabled>
                <Text style={styles.resultText}>
                  {result.list.slice(0, 500).map(comboKey).join(' ')}
                </Text>
                {result.list.length > 500 ? (
                  <Text style={styles.tip}>
                    …仅显示前 500 注，共 {result.kept.toLocaleString()} 注，可点击「复制结果」导出全部。
                  </Text>
                ) : null}
              </ScrollView>
            </Panel>
          ) : null}
        </>
      )}

      <Spacer size={space.xxl} />
    </Screen>
  );
}

function RangeRow({
  label,
  cfg,
  onChange,
}: {
  label: string;
  cfg: RangeCfg;
  onChange: (c: RangeCfg) => void;
}) {
  return (
    <View style={styles.rangeRow}>
      <Chip label={label} active={cfg.enabled} onPress={() => onChange({ ...cfg, enabled: !cfg.enabled })} />
      <Row gap={space.xs}>
        <Input value={cfg.min} onChangeText={(t) => onChange({ ...cfg, min: t })} keyboardType="numeric" />
        <Text style={styles.dash}>—</Text>
        <Input value={cfg.max} onChangeText={(t) => onChange({ ...cfg, max: t })} keyboardType="numeric" />
      </Row>
    </View>
  );
}

function numOrUndef(v: string): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const styles = StyleSheet.create({
  slotBlock: {
    marginBottom: space.md,
  },
  slotTitle: {
    color: semantic.textDim,
    fontSize: fontSize.sm,
    marginBottom: space.xs,
  },
  total: {
    color: semantic.brand,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  rangeRow: {
    paddingVertical: space.xs,
    gap: space.xs,
  },
  dash: {
    color: semantic.textFaint,
  },
  tip: {
    color: semantic.textFaint,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  textArea: {
    minHeight: 88,
    padding: space.sm,
    color: semantic.text,
    backgroundColor: semantic.contentBg,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    borderRadius: radius.sm,
    fontSize: fontSize.sm,
    textAlignVertical: 'top',
  },
  resultText: {
    color: semantic.text,
    fontSize: fontSize.sm,
    lineHeight: 22,
  },
  meta: {
    color: semantic.textFaint,
    fontSize: fontSize.xs,
    flexShrink: 1,
    marginLeft: 'auto',
  },
});
