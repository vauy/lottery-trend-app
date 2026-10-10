/**
 * 选胆区 + 自动出号
 *
 * 对齐官方帮助《选胆》（复式/胆拖/分组胆/不定胆/两码合差跨/胆合积跨）
 * 与《自动出号》（极冷极热/遗漏出号/出次出号/位置遗漏出号）。
 *
 * 官方对自动出号的原话：「谨慎参考，任何出号工具逃不过概率限制」——
 * 本页所有输出均为历史统计口径的号码，不构成任何预测。
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '../../components/Screen';
import { GameSwitch } from '../../components/GameSwitch';
import { NumberPicker } from '../../components/NumberPicker';
import {
  Chip,
  Divider,
  Empty,
  Field,
  Input,
  Panel,
  Row,
  Spacer,
  Stat,
} from '../../components/ui/Kit';
import { useLottery } from '../../hooks/useLottery';
import { useResponsive } from '../../hooks/useResponsive';
import { getDigits, getGame } from '../../lib/lottery/games';
import { buildOmissionStats } from '../../lib/lottery/analysis';
import { comboKey } from '../../lib/lottery/shrink';
import {
  MAX_PICK_COMBOS,
  danHeJiKua,
  expandDanTuo,
  expandFushi,
  expandGroupDan,
  filterByDan,
  pickByCount,
  pickByOmission,
  pickHotCold,
  pickPosOmission,
  twoCodeCha,
  twoCodeHe,
  twoCodeKua,
} from '../../lib/lottery/pick';
import type { GameId, PosKey } from '../../lib/lottery/types';
import { fontSize, semantic, space } from '../../lib/theme';

type MainMode = 'select' | 'auto';
type SelectMode = 'fushi' | 'dantuo' | 'fenzu' | 'budingdan' | 'liangma' | 'hejikua';
type AutoMode = 'hotcold' | 'omission' | 'count' | 'posOmission';

const SELECT_OPTIONS: Array<{ value: SelectMode; label: string }> = [
  { value: 'fushi', label: '复式' },
  { value: 'dantuo', label: '胆拖' },
  { value: 'fenzu', label: '分组胆' },
  { value: 'budingdan', label: '不定胆' },
  { value: 'liangma', label: '两码合差跨' },
  { value: 'hejikua', label: '胆合积跨' },
];

const AUTO_OPTIONS: Array<{ value: AutoMode; label: string }> = [
  { value: 'hotcold', label: '极冷极热' },
  { value: 'omission', label: '遗漏出号' },
  { value: 'count', label: '出次出号' },
  { value: 'posOmission', label: '位置遗漏' },
];

function num(v: string, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function PickScreen() {
  const { landscape } = useResponsive();
  const [gameId, setGameId] = useState<GameId>('pl3');
  const game = useMemo(() => getGame(gameId), [gameId]);
  const isKeno = game.style === 'keno';

  const [mainMode, setMainMode] = useState<MainMode>('select');
  const [selectMode, setSelectMode] = useState<SelectMode>('fushi');
  const [autoMode, setAutoMode] = useState<AutoMode>('hotcold');

  const digits = useMemo(() => getDigits(game), [game]);

  /** 复式：每位置的候选 */
  const [slots, setSlots] = useState<number[][]>(() =>
    Array.from({ length: 3 }, () => [...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]]),
  );
  React.useEffect(() => {
    const n = isKeno ? 0 : game.drawCount;
    setSlots(Array.from({ length: n }, () => [...digits]));
  }, [game, isKeno, digits]);

  /** 胆拖 */
  const [dan, setDan] = useState<number[]>([1]);
  const [tuo, setTuo] = useState<number[]>([2, 3, 4, 5]);

  /** 分组胆：两组 */
  const [g1, setG1] = useState<number[]>([1, 2]);
  const [g2, setG2] = useState<number[]>([3, 4]);

  /** 不定胆 */
  const [buding, setBuding] = useState<number[]>([7]);

  /** 两码 */
  const [lmA, setLmA] = useState<number[]>([1]);
  const [lmB, setLmB] = useState<number[]>([2]);

  /** 胆合积跨 */
  const [hjkDan, setHjkDan] = useState<number[]>([1, 2, 3]);

  /** 自动出号参数 */
  const [hotColdMode, setHotColdMode] = useState<'hot' | 'cold'>('cold');
  const [hotColdCount, setHotColdCount] = useState('5');
  const [omitMin, setOmitMin] = useState('5');
  const [omitMax, setOmitMax] = useState('20');
  const [omitMaxCount, setOmitMaxCount] = useState('6');
  const [cntMin, setCntMin] = useState('1');
  const [cntMax, setCntMax] = useState('3');
  const [cntMaxCount, setCntMaxCount] = useState('6');
  const [posMin, setPosMin] = useState('5');
  const [posMax, setPosMax] = useState('20');
  const [posPerCount, setPosPerCount] = useState('3');

  const { loading, error, records, source } = useLottery(gameId, 600);

  /** 不定位口径的遗漏统计（自动出号用） */
  const stats = useMemo(() => {
    if (!records.length) return [];
    return buildOmissionStats(records, game, (digit) => ({
      kind: 'digit' as const,
      pos: 'any' as PosKey,
      digit,
    }));
  }, [records, game]);

  /** 选胆区展开结果 */
  const combos = useMemo<number[][]>(() => {
    if (isKeno) return [];
    if (selectMode === 'fushi') return expandFushi(slots);
    if (selectMode === 'dantuo') return expandDanTuo(dan, tuo, game.drawCount);
    if (selectMode === 'fenzu') return expandGroupDan([g1, g2]);
    if (selectMode === 'budingdan') {
      // 不定胆：先展开全集（允许重复），再保留含全部胆码的组合
      const all = expandFushi(
        Array.from({ length: game.drawCount }, () => [...digits]),
      );
      return filterByDan(all, buding);
    }
    return [];
  }, [isKeno, selectMode, slots, dan, tuo, game, g1, g2, buding, digits]);

  /** 自动出号结果：号码列表 */
  const picked = useMemo<number[]>(() => {
    if (!stats.length) return [];
    if (autoMode === 'hotcold') return pickHotCold(stats, hotColdMode, num(hotColdCount, 5));
    if (autoMode === 'omission')
      return pickByOmission(stats, num(omitMin, 0), num(omitMax, 99), num(omitMaxCount, 6));
    if (autoMode === 'count')
      return pickByCount(stats, num(cntMin, 0), num(cntMax, 99), num(cntMaxCount, 6));
    return [];
  }, [stats, autoMode, hotColdMode, hotColdCount, omitMin, omitMax, omitMaxCount, cntMin, cntMax, cntMaxCount]);

  /** 位置遗漏出号 */
  const posPicks = useMemo(
    () => pickPosOmission(records, game, [num(posMin, 0), num(posMax, 99)], num(posPerCount, 3)),
    [records, game, posMin, posMax, posPerCount],
  );
  const posCombos = useMemo(() => {
    if (!posPicks.length || posPicks.some((p) => !p.digits.length)) return [];
    return expandFushi(posPicks.map((p) => p.digits));
  }, [posPicks]);

  /** 两码 / 胆合积跨 的即时计算 */
  const lm = useMemo(() => {
    const a = lmA[0];
    const b = lmB[0];
    if (a === undefined || b === undefined) return null;
    return { a, b, he: twoCodeHe(a, b), cha: twoCodeCha(a, b), kua: twoCodeKua(a, b) };
  }, [lmA, lmB]);
  const hjk = useMemo(() => danHeJiKua(hjkDan), [hjkDan]);

  const copyText = async (text: string) => {
    await Clipboard.setStringAsync(text);
  };

  const renderDigits = (title: string, list: number[]) => (
    <Panel title={`${title}（${list.length}）`}>
      {list.length ? (
        <>
          <View style={styles.chipWrap}>
            {list.map((d) => (
              <Chip key={d} label={String(d)} active />
            ))}
          </View>
          <Spacer size={space.sm} />
          <Chip label="复制号码" onPress={() => copyText(list.join(isKeno ? ',' : ''))} />
        </>
      ) : (
        <Empty text="当前条件下没有符合的号码" />
      )}
    </Panel>
  );

  const renderCombos = (title: string, list: number[][]) => (
    <Panel title={`${title}：${list.length.toLocaleString()} 注`}>
      {list.length ? (
        <>
          <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled>
            <Text style={styles.resultText}>
              {list.slice(0, 400).map(comboKey).join(' ')}
            </Text>
            {list.length > 400 ? (
              <Text style={styles.tip}>…仅显示前 400 注，可点击复制导出全部。</Text>
            ) : null}
          </ScrollView>
          <Spacer size={space.sm} />
          <Chip label="复制全部" onPress={() => copyText(list.map(comboKey).join('\n'))} />
        </>
      ) : (
        <Empty text="没有生成任何组合，请检查选号" />
      )}
      {list.length >= MAX_PICK_COMBOS ? (
        <Text style={styles.warn}>已达展开上限，结果被截断，请缩小选号范围。</Text>
      ) : null}
    </Panel>
  );

  return (
    <Screen>
      <GameSwitch value={gameId} onChange={setGameId} />

      <Panel>
        <View style={styles.chipWrap}>
          <Chip label="选胆区" active={mainMode === 'select'} onPress={() => setMainMode('select')} />
          <Chip label="自动出号" active={mainMode === 'auto'} onPress={() => setMainMode('auto')} />
        </View>
      </Panel>

      <Spacer size={space.md} />

      {loading ? (
        <Panel>
          <Empty text="正在载入历史数据…" />
        </Panel>
      ) : error ? (
        <Panel>
          <Empty text={error} />
        </Panel>
      ) : mainMode === 'select' ? (
        isKeno ? (
          <Panel>
            <Empty text="快乐8 每期 20 个号码、无位置概念，定位类选胆不适用。请使用「自动出号」。" />
          </Panel>
        ) : (
          <>
            <Panel title="选胆方式">
              <View style={styles.chipWrap}>
                {SELECT_OPTIONS.map((o) => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    active={selectMode === o.value}
                    onPress={() => setSelectMode(o.value)}
                  />
                ))}
              </View>
            </Panel>

            <Spacer size={space.md} />

            {selectMode === 'fushi' ? (
              <Panel title="复式选号">
                {slots.map((sel, idx) => (
                  <View key={idx} style={styles.slotBlock}>
                    <Text style={styles.slotTitle}>{game.positions[idx]?.name ?? `第${idx + 1}位`}</Text>
                    <NumberPicker
                      game={game}
                      value={sel}
                      onChange={(next) => {
                        const c = [...slots];
                        c[idx] = next;
                        setSlots(c);
                      }}
                    />
                  </View>
                ))}
              </Panel>
            ) : null}

            {selectMode === 'dantuo' ? (
              <>
                <Panel title="胆码（每注必含）">
                  <NumberPicker game={game} value={dan} onChange={setDan} />
                </Panel>
                <Spacer size={space.md} />
                <Panel title="拖码（补足其余位）">
                  <NumberPicker game={game} value={tuo} onChange={setTuo} />
                </Panel>
              </>
            ) : null}

            {selectMode === 'fenzu' ? (
              <>
                <Panel title="第一组">
                  <NumberPicker game={game} value={g1} onChange={setG1} />
                </Panel>
                <Spacer size={space.md} />
                <Panel title="第二组">
                  <NumberPicker game={game} value={g2} onChange={setG2} />
                </Panel>
              </>
            ) : null}

            {selectMode === 'budingdan' ? (
              <Panel title="不定位胆码（号码中必须出现）">
                <NumberPicker game={game} value={buding} onChange={setBuding} />
                <Spacer size={space.sm} />
                <Text style={styles.tip}>
                  在全部 {game.drawCount} 位组合中，只保留包含所选胆码的组合（不定位）。
                </Text>
              </Panel>
            ) : null}

            {selectMode === 'liangma' ? (
              <>
                <Panel title="两码（各选一个数字）">
                  <Text style={styles.slotTitle}>第一个数字</Text>
                  <NumberPicker game={game} value={lmA} onChange={setLmA} />
                  <Spacer size={space.sm} />
                  <Text style={styles.slotTitle}>第二个数字</Text>
                  <NumberPicker game={game} value={lmB} onChange={setLmB} />
                </Panel>
                <Spacer size={space.md} />
                {lm ? (
                  <Panel title="计算结果">
                    <Row>
                      <Stat label="两码合" value={lm.he} />
                      <Stat label="两码差" value={lm.cha} />
                      <Stat label="两码跨" value={lm.kua} />
                    </Row>
                    <Spacer size={space.xs} />
                    <Text style={styles.tip}>
                      两码合 = ({lm.a}+{lm.b}) % 10；两码差 = |{lm.a}−{lm.b}|；两码跨为两码极差。
                    </Text>
                  </Panel>
                ) : null}
              </>
            ) : null}

            {selectMode === 'hejikua' ? (
              <>
                <Panel title="胆码">
                  <NumberPicker game={game} value={hjkDan} onChange={setHjkDan} />
                </Panel>
                <Spacer size={space.md} />
                <Panel title="胆合积跨">
                  <Row>
                    <Stat label="胆合(和值)" value={hjk.he} />
                    <Stat label="胆积" value={hjk.ji} />
                    <Stat label="胆跨" value={hjk.kua} />
                  </Row>
                </Panel>
              </>
            ) : null}

            <Spacer size={space.md} />
            {combos.length || selectMode === 'fushi' || selectMode === 'budingdan'
              ? renderCombos('选号结果', combos)
              : null}
          </>
        )
      ) : (
        <>
          <Panel title="出号方式">
            <View style={styles.chipWrap}>
              {AUTO_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  active={autoMode === o.value}
                  onPress={() => setAutoMode(o.value)}
                  disabled={isKeno && o.value === 'posOmission'}
                />
              ))}
            </View>
          </Panel>

          <Spacer size={space.md} />

          {autoMode === 'hotcold' ? (
            <Panel title="参数">
              <Row gap={space.xs}>
                <Chip label="极热" active={hotColdMode === 'hot'} onPress={() => setHotColdMode('hot')} />
                <Chip label="极冷" active={hotColdMode === 'cold'} onPress={() => setHotColdMode('cold')} />
              </Row>
              <Spacer size={space.sm} />
              <Field label="出号个数">
                <Input value={hotColdCount} onChangeText={setHotColdCount} keyboardType="numeric" />
              </Field>
            </Panel>
          ) : null}

          {autoMode === 'omission' ? (
            <Panel title="参数">
              <Field label="当前遗漏范围">
                <Row>
                  <Input value={omitMin} onChangeText={setOmitMin} keyboardType="numeric" placeholder="最小" />
                  <Text style={styles.dash}>—</Text>
                  <Input value={omitMax} onChangeText={setOmitMax} keyboardType="numeric" placeholder="最大" />
                </Row>
              </Field>
              <Field label="最多出号个数">
                <Input value={omitMaxCount} onChangeText={setOmitMaxCount} keyboardType="numeric" />
              </Field>
            </Panel>
          ) : null}

          {autoMode === 'count' ? (
            <Panel title="参数">
              <Field label="出次次数范围">
                <Row>
                  <Input value={cntMin} onChangeText={setCntMin} keyboardType="numeric" placeholder="最小" />
                  <Text style={styles.dash}>—</Text>
                  <Input value={cntMax} onChangeText={setCntMax} keyboardType="numeric" placeholder="最大" />
                </Row>
              </Field>
              <Field label="最多出号个数">
                <Input value={cntMaxCount} onChangeText={setCntMaxCount} keyboardType="numeric" />
              </Field>
            </Panel>
          ) : null}

          {autoMode === 'posOmission' ? (
            <Panel title="参数">
              <Field label="各位置遗漏范围">
                <Row>
                  <Input value={posMin} onChangeText={setPosMin} keyboardType="numeric" placeholder="最小" />
                  <Text style={styles.dash}>—</Text>
                  <Input value={posMax} onChangeText={setPosMax} keyboardType="numeric" placeholder="最大" />
                </Row>
              </Field>
              <Field label="每位置最多取号数">
                <Input value={posPerCount} onChangeText={setPosPerCount} keyboardType="numeric" />
              </Field>
            </Panel>
          ) : null}

          <Spacer size={space.md} />

          {autoMode === 'posOmission' ? (
            isKeno ? (
              <Panel>
                <Empty text="快乐8 无位置概念，不支持位置遗漏出号" />
              </Panel>
            ) : (
              <>
                <Panel title="各位置胆码">
                  {posPicks.map((p) => (
                    <View key={p.pos} style={styles.posRow}>
                      <Text style={styles.posName}>{p.posName}</Text>
                      <View style={styles.chipWrap}>
                        {p.digits.length ? (
                          p.digits.map((d) => <Chip key={d} label={String(d)} active />)
                        ) : (
                          <Text style={styles.tip}>无符合号码</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </Panel>
                <Spacer size={space.md} />
                {renderCombos('组合成注', posCombos)}
              </>
            )
          ) : (
            renderDigits('出号结果', picked)
          )}

          <Spacer size={space.md} />
          <Text style={styles.disclaimer}>
            自动出号仅为历史统计口径的输出，官方亦注明「任何出号工具逃不过概率限制」。
            请理性购彩，据此投注风险自负。
          </Text>
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
  slotBlock: {
    marginBottom: space.md,
  },
  slotTitle: {
    color: semantic.textDim,
    fontSize: fontSize.sm,
    marginBottom: space.xs,
  },
  posRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semantic.panelBorder,
  },
  posName: {
    color: semantic.textDim,
    fontSize: fontSize.sm,
    width: 48,
  },
  dash: {
    color: semantic.textFaint,
  },
  resultText: {
    color: semantic.text,
    fontSize: fontSize.sm,
    lineHeight: 22,
  },
  tip: {
    color: semantic.textFaint,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  warn: {
    color: semantic.warn,
    fontSize: fontSize.xs,
    marginTop: space.xs,
  },
  disclaimer: {
    color: semantic.warn,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  meta: {
    color: semantic.textFaint,
    fontSize: fontSize.xs,
  },
});
