/**
 * 指标设置面板 —— Modal 弹层
 *
 * 页签行照参考图：MA / MACD / KDJ / RSI / CCI / ADX / SAR
 *   - MA 页签：6 组均线，每组可调「周期」与「颜色」，并可整条开关；
 *   - 指标页签：显示该指标中文名 + 说明，可把它放到「副图1 / 副图2」或关闭。
 *
 * 为什么指标是「单选」而不是多选：
 *   用户明确要求「这些指标在图表只显示一个」。副图最多 2 格（参考图
 *   是 MACD + ADX 两格），所以给两个槽位，每个槽位单选一个指标，
 *   同一个指标不能同时占两格。
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  INDICATOR_META,
  INDICATOR_ORDER,
  MA_COLORS,
  MA_PERIODS,
  type IndicatorId,
  type MaConfig,
} from '@/lib/charts/indicators';
import { alpha, palette, semantic, fontSize as fs, space, radius } from '@/lib/theme';

type Slot = 1 | 2;

export interface IndicatorPanelProps {
  visible: boolean;
  onClose: () => void;
  /** 均线配置（6 组） */
  maConfigs: MaConfig[];
  onMaChange: (next: MaConfig[]) => void;
  /** 裸K模式：只画 K 线，隐藏 MA 与布林（对齐官方 avgType「裸K」） */
  bareK: boolean;
  onBareKChange: (v: boolean) => void;
  /** 副图槽位当前指标 */
  sub1: IndicatorId;
  sub2: IndicatorId;
  onSubChange: (slot: Slot, id: IndicatorId) => void;
  /** 恢复默认 */
  onReset: () => void;
}

type TabKey = 'ma' | Exclude<IndicatorId, 'none'>;

const TABS: { key: TabKey; label: string }[] = [
  { key: 'ma', label: 'MA' },
  ...INDICATOR_ORDER.map((id) => ({ key: id as TabKey, label: INDICATOR_META[id].label })),
];

export function IndicatorPanel({
  visible,
  onClose,
  maConfigs,
  onMaChange,
  bareK,
  onBareKChange,
  sub1,
  sub2,
  onSubChange,
  onReset,
}: IndicatorPanelProps) {
  const [tab, setTab] = useState<TabKey>('ma');

  const setMa = (i: number, patch: Partial<MaConfig>) => {
    onMaChange(maConfigs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };
  const stepPeriod = (i: number, dir: 1 | -1) => {
    const cur = maConfigs[i].period;
    const at = MA_PERIODS.indexOf(cur);
    const next = MA_PERIODS[
      Math.min(MA_PERIODS.length - 1, Math.max(0, (at < 0 ? 0 : at) + dir))
    ];
    setMa(i, { period: next });
  };
  const stepColor = (i: number) => {
    const cur = maConfigs[i].color;
    const at = MA_COLORS.indexOf(cur);
    setMa(i, { color: MA_COLORS[(at + 1) % MA_COLORS.length] });
  };

  /**
   * 把某个指标放到指定槽位。
   * 若它已经占了另一个槽位，则把另一个槽位清空 —— 同一个指标不重复画。
   */
  const assign = (slot: Slot, id: IndicatorId) => {
    if (slot === 1) {
      if (sub2 === id) onSubChange(2, 'none');
      onSubChange(1, id);
    } else {
      if (sub1 === id) onSubChange(1, 'none');
      onSubChange(2, id);
    }
  };

  const curId: Exclude<IndicatorId, 'none'> | null = tab === 'ma' ? null : tab;
  const activeSlot: Slot | 0 = curId ? (sub1 === curId ? 1 : sub2 === curId ? 2 : 0) : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.cardTitle}>指标设置</Text>

          {/* ───── 页签行 ───── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabScroll}
            contentContainerStyle={styles.tabScrollInner}
          >
            {TABS.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[styles.tab, tab === t.key && styles.tabOn]}
              >
                <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.divider} />

          {/* ───── MA：裸K开关 + 6 组均线 ───── */}
          {tab === 'ma' && (
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              <View style={styles.maRow}>
                <Pressable onPress={() => onBareKChange(!bareK)} style={styles.switchWrap}>
                  <View style={[styles.switch, bareK && styles.switchOn]}>
                    <View style={[styles.switchDot, bareK && styles.switchDotOn]} />
                  </View>
                </Pressable>
                <Text style={[styles.maName, bareK && styles.dim]}>裸K模式</Text>
                <Text style={styles.bareKHint} numberOfLines={1}>
                  只画K线 · 隐藏MA与布林
                </Text>
              </View>
              {maConfigs.map((c, i) => (
                <View key={i} style={styles.maRow}>
                  <Pressable
                    onPress={() => setMa(i, { enabled: !c.enabled })}
                    style={styles.switchWrap}
                  >
                    <View style={[styles.switch, c.enabled && styles.switchOn]}>
                      <View style={[styles.switchDot, c.enabled && styles.switchDotOn]} />
                    </View>
                  </Pressable>
                  <Text style={[styles.maName, !c.enabled && styles.dim]}>
                    MA{c.period}
                  </Text>
                  <View style={styles.stepper}>
                    <Pressable onPress={() => stepPeriod(i, -1)} style={styles.stepBtn}>
                      <Text style={styles.stepText}>−</Text>
                    </Pressable>
                    <Text style={styles.stepValue}>{c.period}</Text>
                    <Pressable onPress={() => stepPeriod(i, 1)} style={styles.stepBtn}>
                      <Text style={styles.stepText}>+</Text>
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={() => stepColor(i)}
                    style={[styles.colorDot, { backgroundColor: c.color }]}
                  />
                </View>
              ))}
              <Text style={styles.tip}>
                均线叠加在主图上。点圆点循环换色，点 −/+ 改周期（可选 {MA_PERIODS.join('/')}）。
              </Text>
            </ScrollView>
          )}

          {/* ───── 指标：说明 + 槽位 ───── */}
          {curId && (
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              <Text style={styles.indTitle}>{INDICATOR_META[curId].full}</Text>
              <Text style={styles.indDesc}>{INDICATOR_META[curId].desc}</Text>
              <View style={styles.slotRow}>
                {([0, 1, 2] as const).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => (s === 0 ? assign(activeSlot as Slot, 'none') : assign(s, curId))}
                    style={[styles.slotBtn, activeSlot === s && styles.slotBtnOn]}
                  >
                    <Text style={[styles.slotText, activeSlot === s && styles.slotTextOn]}>
                      {s === 0 ? '关闭' : `副图${s}`}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.tip}>
                副图叠在主图下方，最多 2 个。当前：副图1 {sub1 === 'none' ? '空' : INDICATOR_META[sub1 as Exclude<IndicatorId,'none'>].label}
                {' · '}副图2 {sub2 === 'none' ? '空' : INDICATOR_META[sub2 as Exclude<IndicatorId,'none'>].label}
              </Text>
            </ScrollView>
          )}

          {/* ───── 底部操作 ───── */}
          <View style={styles.footer}>
            <Pressable onPress={onReset} style={styles.footBtn}>
              <Text style={styles.footGhostText}>恢复默认</Text>
            </Pressable>
            <Pressable onPress={onClose} style={[styles.footBtn, styles.footMain]}>
              <Text style={styles.footMainText}>保存设置</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '86%',
    backgroundColor: semantic.panelBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    padding: space.md,
  },
  cardTitle: { fontSize: fs.base, fontWeight: '700', color: semantic.text, marginBottom: space.sm },
  tabScroll: { flexGrow: 0, flexShrink: 0 },
  tabScrollInner: { gap: space.xs, paddingBottom: space.xs },
  tab: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
  },
  tabOn: { backgroundColor: alpha(palette.accent, 0.16), borderColor: semantic.brand },
  tabText: { fontSize: fs.xs, color: semantic.textDim },
  tabTextOn: { color: semantic.brand, fontWeight: '700' },
  divider: { height: 1, backgroundColor: semantic.divider, marginVertical: space.sm },
  body: { flexGrow: 0, flexShrink: 1 },
  maRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 6,
  },
  switchWrap: { padding: 2 },
  switch: {
    width: 34,
    height: 18,
    borderRadius: 9,
    backgroundColor: semantic.panelBorder,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  switchOn: { backgroundColor: semantic.brand },
  switchDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: palette.inkFaint },
  switchDotOn: { backgroundColor: '#fff', alignSelf: 'flex-end' },
  maName: { fontSize: fs.sm, color: semantic.text, fontWeight: '600', minWidth: 54 },
  dim: { color: semantic.textFaint },
  bareKHint: { fontSize: fs.xs, color: semantic.textFaint, marginLeft: 'auto' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  stepBtn: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
  },
  stepText: { fontSize: fs.sm, color: semantic.text },
  stepValue: { fontSize: fs.sm, color: semantic.text, minWidth: 28, textAlign: 'center' },
  colorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
  },
  indTitle: { fontSize: fs.base, fontWeight: '700', color: semantic.text, marginBottom: 4 },
  indDesc: { fontSize: fs.xs, color: semantic.textDim, lineHeight: 18 },
  slotRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  slotBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    alignItems: 'center',
  },
  slotBtnOn: { backgroundColor: semantic.brand, borderColor: semantic.brand },
  slotText: { fontSize: fs.xs, color: semantic.textDim },
  slotTextOn: { color: '#fff', fontWeight: '700' },
  tip: { fontSize: fs.micro, color: semantic.textFaint, marginTop: space.sm, lineHeight: 16 },
  footer: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  footBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: semantic.panelBorder,
  },
  footMain: { backgroundColor: semantic.brand, borderColor: semantic.brand },
  footGhostText: { fontSize: fs.sm, color: semantic.textDim },
  footMainText: { fontSize: fs.sm, color: '#fff', fontWeight: '700' },
});

export default IndicatorPanel;
