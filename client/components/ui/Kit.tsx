/**
 * UI 基础组件 —— 与 prototype/ 网页原型 1:1 对应的 React Native 实现
 *
 * 只负责「长什么样 / 怎么摆」，不含任何彩票业务逻辑。
 * 所有屏幕统一从这里取组件，保证视觉一致。
 */
import { createContext, useContext, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  alpha,
  fontSize as fs,
  palette,
  radius,
  semantic,
  space,
  touch,
} from '@/lib/theme';

/* ─────────────── UI 密度 ─────────────── */

/**
 * regular：横屏 / 宽屏，按钮保持标准尺寸，好点按；
 * compact：竖屏，屏幕高度紧张，按钮/页签整体降一档，
 *          省下来的高度留给图表，让图表占据更大屏幕空间。
 */
export type UiDensity = 'regular' | 'compact';

const DensityContext = createContext<UiDensity>('regular');

export function DensityProvider({
  value,
  children,
}: {
  value: UiDensity;
  children: ReactNode;
}) {
  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>;
}

/** 组件内部读取当前密度，自行决定是否套用紧凑样式 */
export function useDensity(): UiDensity {
  return useContext(DensityContext);
}

/* ─────────────── 容器 ─────────────── */

/** 原型 .panel */
export function Panel({
  label,
  right,
  children,
  style,
}: {
  label?: string;
  right?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.panel, style]}>
      {label ? (
        <View style={styles.panelLabelRow}>
          <Text style={styles.panelLabel}>{label}</Text>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** 原型 .panel > .label 下方的字段块：标题 + 内容 */
export function Field({
  caption,
  children,
}: {
  caption?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      {caption ? <Text style={styles.fieldCaption}>{caption}</Text> : null}
      {children}
    </View>
  );
}

/* ─────────────── 分段控件 .seg-inline / .prinav .seg ─────────────── */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  equalWidth,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** 等分铺满（主导航用）；否则自适应宽度（字段内用） */
  equalWidth?: boolean;
}) {
  const dense = useDensity() === 'compact';
  return (
    <View style={styles.segWrap}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[
              styles.segBtn,
              dense && styles.segBtnCompact,
              equalWidth ? { flex: 1 } : undefined,
              on && styles.segBtnOn,
            ]}
            accessibilityState={{ selected: on }}
          >
            <Text
              style={[
                styles.segText,
                dense && styles.segTextCompact,
                on && styles.segTextOn,
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ─────────────── 子页签 .subtabs ─────────────── */

export function SubTabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const dense = useDensity() === 'compact';
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      /**
       * 必须加 alignSelf:'flex-start'：
       * ScrollView 纵向默认会拉伸填满父容器，而子页签里放的是固定高度的
       * Pressable，横屏下这一行就会被撑成 50dp 高的大色块（实测截图如此）。
       * 让容器按内容高度收缩，页签才是正常的小胶囊。
       */
      style={styles.subtabScroll}
      contentContainerStyle={styles.subtabRow}
    >
      {items.map((it) => {
        const on = it.id === value;
        return (
          <Pressable
            key={it.id}
            onPress={() => onChange(it.id)}
            style={[styles.subtab, dense && styles.subtabCompact, on && styles.subtabOn]}
            accessibilityState={{ selected: on }}
          >
            <Text
              style={[
                styles.subtabText,
                dense && styles.subtabTextCompact,
                on && styles.subtabTextOn,
              ]}
            >
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ─────────────── 数字格 .digit-grid ─────────────── */

export type DigitMark = 'hot' | 'cold' | 'none';

/** 原型 .digit：44px 触控、选中为毒胆橙、热号红环、冷号青环 */
export function DigitGrid({
  digits,
  selected,
  onToggle,
  marks,
  columns,
}: {
  digits: number[];
  selected: number[];
  onToggle: (d: number) => void;
  /** 每个数字的冷热标记，缺省 none */
  marks?: Record<number, DigitMark>;
  /** 列数，默认自适应（RN 用固定列数模拟 auto-fill） */
  columns?: number;
}) {
  const dense = useDensity() === 'compact';
  const cols = columns ?? Math.min(digits.length, 10);
  const rows: number[][] = [];
  for (let i = 0; i < digits.length; i += cols) {
    rows.push(digits.slice(i, i + cols));
  }
  return (
    <View style={styles.digitGrid}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.digitRow}>
          {row.map((d) => {
            const on = selected.includes(d);
            const mark = marks?.[d] ?? 'none';
            return (
              <Pressable
                key={d}
                onPress={() => onToggle(d)}
                style={({ pressed }) => [
                  styles.digit,
                  dense && styles.digitCompact,
                  on && styles.digitOn,
                  mark === 'hot' && styles.digitHot,
                  mark === 'cold' && styles.digitCold,
                  pressed && styles.digitPressed,
                ]}
                accessibilityState={{ selected: on }}
              >
                <Text
                  style={[
                    styles.digitText,
                    dense && styles.digitTextCompact,
                    on && styles.digitTextOn,
                  ]}
                >
                  {d}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/* ─────────────── Chip .chip ─────────────── */

export function Chip({
  label,
  active,
  onPress,
  pill,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  /**
   * 参考图那种「小胶囊」样式：更矮、更窄、圆角更大、字号更小，
   * 用于指标栏 / 周期 / 范围这类密集排布的一行按钮。
   */
  pill?: boolean;
}) {
  const dense = useDensity() === 'compact';
  return (
    <Pressable
      onPress={onPress}
      style={[
        pill ? styles.chipPill : styles.chip,
        !pill && dense && styles.chipCompact,
        pill && dense && styles.chipPillCompact,
        active && (pill ? styles.chipPillOn : styles.chipOn),
      ]}
      accessibilityState={{ selected: active }}
    >
      <Text
        style={[
          pill ? styles.chipPillText : styles.chipText,
          !pill && dense && styles.chipTextCompact,
          active && (pill ? styles.chipPillTextOn : styles.chipTextOn),
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* ─────────────── 图表卡片 .chart-card ─────────────── */

export function ChartCard({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.chartCard}>
      <View style={styles.chartTitleRow}>
        <Text style={styles.chartTitle}>{title}</Text>
        {meta ? <Text style={styles.chartMeta}>{meta}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/* ─────────────── 毒胆同屏网格 .tong-grid ─────────────── */

export function TongGrid({
  children,
  columns = 1,
}: {
  children: ReactNode;
  /**
   * 同屏列数。
   * 竖屏默认 1 列（十行排满 0-9），横屏/宽屏才用 2 列。
   * 之前写死 2 列导致单格宽度只有 ~48%，但高度固定 88px，
   * 宽高比失衡把 K 线压扁，波形完全失真。
   */
  columns?: number;
}) {
  return (
    <View style={[styles.tongGrid, columns >= 2 && styles.tongGridMulti]}>
      {children}
    </View>
  );
}

export function TongCell({
  digit,
  children,
  width,
}: {
  digit: number | string;
  children: ReactNode;
  /** 单格宽度（由父级按列数与内容宽度算好后传入，保证宽高比正常） */
  width?: number;
}) {
  return (
    <View style={[styles.tongCell, width ? { width } : null]}>
      <Text style={styles.tongCellLabel}>{digit}</Text>
      {children}
    </View>
  );
}

/* ─────────────── 结果横幅 .result-banner ─────────────── */

export function ResultBanner({
  items,
}: {
  items: { value: string; label: string }[];
}) {
  return (
    <View style={styles.banner}>
      {items.map((it) => (
        <View key={it.label} style={styles.bannerItem}>
          <Text style={styles.bannerBig}>{it.value}</Text>
          <Text style={styles.bannerLabel}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

/* ─────────────── 号码 pill .code ─────────────── */

export function CodePill({
  code,
  kind,
}: {
  code: string;
  /** zu = 组选（青色） */
  kind?: 'normal' | 'zu';
}) {
  return (
    <View style={styles.code}>
      <Text style={[styles.codeText, kind === 'zu' && styles.codeTextZu]}>
        {code}
      </Text>
    </View>
  );
}

/* ─────────────── 状态药丸 .status-pill ─────────────── */

export function StatPill({ children }: { children: ReactNode }) {
  return <View style={styles.statPill}>{children}</View>;
}

/* ─────────────── 底部操作栏 .bottombar ─────────────── */

export function BottomBar({
  primaryLabel,
  onPrimary,
  ghostLabel,
  onGhost,
  hint,
  vertical,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  ghostLabel?: string;
  onGhost?: () => void;
  hint?: string;
  /**
   * @deprecated 横屏不再竖排。
   * 竖排会把「重置 + 出图」拆成上下两行、各占 flex:1 撑满高度，
   * 横屏本来就只有 ~360dp 高，底栏会吃掉大半屏；且出图按钮被压成
   * 没有文字的绿条。保留该参数只为兼容调用处，传了也不改变布局。
   */
  vertical?: boolean;
}) {
  // 图表占据主要空间时，底栏收到一条细高度，把纵向空间让给图表
  const compact = useDensity() === 'compact';
  return (
    <View style={[styles.bottomBar, compact && styles.bottomBarCompact]}>
      <Pressable
        onPress={onPrimary}
        style={({ pressed }) => [
          styles.btnMain,
          compact && styles.btnCompact,
          pressed && styles.btnMainPressed,
        ]}
      >
        <Text style={[styles.btnMainText, compact && styles.btnTextCompact]}>
          {primaryLabel}
        </Text>
      </Pressable>
      {ghostLabel ? (
        <Pressable
          onPress={onGhost}
          style={[styles.btnGhost, compact && styles.btnCompactGhost]}
        >
          <Text style={[styles.btnGhostText, compact && styles.btnTextCompact]}>
            {ghostLabel}
          </Text>
        </Pressable>
      ) : null}
      {hint ? (
        <Text style={[styles.hint, styles.hintFlex]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/* ─────────────── 图例 .legend ─────────────── */

export function Legend({
  items,
}: {
  items: { color: string; label: string }[];
}) {
  return (
    <View style={styles.legend}>
      {items.map((it) => (
        <View key={it.label} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: it.color }]} />
          <Text style={styles.legendText}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

/* ─────────────── 样式 ─────────────── */

const styles = StyleSheet.create({
  panel: {
    backgroundColor: semantic.panelBg,
    borderColor: semantic.panelBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 13,
  },
  panelLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  panelLabel: {
    fontSize: fs.xs,
    letterSpacing: 1.6,
    color: semantic.textFaint,
  },
  field: { marginBottom: space.md },
  fieldCaption: {
    fontSize: fs.xs,
    color: semantic.textDim,
    marginBottom: 7,
  },

  segWrap: {
    flexDirection: 'row',
    gap: space.xs,
    flexWrap: 'wrap',
  },
  segBtn: {
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    backgroundColor: semantic.controlBg,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segBtnOn: {
    backgroundColor: semantic.brand,
    borderColor: semantic.brand,
  },
  segText: { fontSize: fs.sm, color: semantic.textDim },
  segTextOn: { color: semantic.onBrand, fontWeight: '600' },
  /** 竖屏紧凑档：内边距与字号各降一档 */
  segBtnCompact: { paddingVertical: 6, paddingHorizontal: 9, minHeight: 32 },
  segTextCompact: { fontSize: fs.xs },

  subtabScroll: { flexGrow: 0, flexShrink: 0 },
  subtabRow: { gap: 5, paddingBottom: 2, alignItems: 'center' },
  subtab: {
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    backgroundColor: semantic.panelBg,
  },
  subtabOn: {
    backgroundColor: semantic.controlBg,
    borderColor: semantic.brand,
  },
  subtabText: { fontSize: fs.sm, color: semantic.textDim },
  subtabTextOn: { color: semantic.brand, fontWeight: '600' },
  /** 竖屏紧凑档 */
  subtabCompact: { paddingVertical: 6, paddingHorizontal: 10 },
  subtabTextCompact: { fontSize: fs.xs },

  digitGrid: { gap: 6 },
  digitRow: { flexDirection: 'row', gap: 6 },
  digit: {
    flex: 1,
    height: touch.digit,
    minWidth: touch.digit,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    backgroundColor: semantic.controlBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitOn: {
    backgroundColor: semantic.dan,
    borderColor: semantic.dan,
  },
  digitHot: { borderColor: alpha(palette.red, 0.6), borderWidth: 1.5 },
  digitCold: { borderColor: alpha(palette.cyan, 0.6), borderWidth: 1.5 },
  digitPressed: { transform: [{ scale: 0.9 }] },
  digitText: {
    fontSize: fs.base,
    fontWeight: '600',
    color: semantic.text,
  },
  digitTextOn: { color: semantic.onDan },
  /** 竖屏紧凑档：高度 44 → 38，仍高于最小可点按面积的实用下限 */
  digitCompact: { height: 38, minWidth: 38 },
  digitTextCompact: { fontSize: fs.sm },

  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    backgroundColor: 'transparent',
  },
  chipOn: { backgroundColor: alpha(palette.accent, 0.2), borderColor: semantic.brand },
  chipText: { fontSize: fs.sm, color: semantic.textDim },
  chipTextOn: { color: semantic.brand, fontWeight: '600' },
  /** 竖屏紧凑档 */
  chipCompact: { paddingVertical: 6, paddingHorizontal: 10 },
  chipTextCompact: { fontSize: fs.xs },
  /** 参考图的小胶囊按钮：矮、窄、大圆角、小字 */
  chipPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    backgroundColor: 'transparent',
  },
  chipPillCompact: { paddingVertical: 2, paddingHorizontal: 7 },
  chipPillOn: { backgroundColor: semantic.brand, borderColor: semantic.brand },
  chipPillText: { fontSize: fs.micro, color: semantic.textDim },
  chipPillTextOn: { color: semantic.onBrand, fontWeight: '700' },

  chartCard: {
    alignSelf: 'stretch',
    width: '100%',
    backgroundColor: semantic.panelBg,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    borderRadius: radius.md,
    // 8dp：原 12dp 在窄屏上把绘图区又吃掉 8dp 横向空间
    padding: 8,
  },
  chartTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  chartTitle: { fontSize: fs.xs, color: semantic.textDim, fontWeight: '600' },
  chartMeta: { fontSize: fs.micro, color: semantic.textFaint },

  tongGrid: { flexDirection: 'column', gap: 8, alignSelf: 'stretch', width: '100%' },
  /** 多列（横屏）：两列并排 */
  tongGridMulti: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  tongCell: {
    // 宽度由调用方按列数计算后传入；此处兜底为撑满可用宽度（竖屏一列）
    alignSelf: 'stretch',
    backgroundColor: semantic.controlBg,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    borderRadius: 9,
    padding: 6,
    position: 'relative',
  },
  tongCellLabel: {
    fontSize: fs.xs,
    fontWeight: '700',
    color: semantic.dan,
    marginBottom: 2,
  },

  banner: {
    flexDirection: 'row',
    gap: space.lg,
    alignItems: 'center',
    padding: space.md,
    borderRadius: 10,
    backgroundColor: alpha(palette.accent, 0.14),
    borderWidth: 1,
    borderColor: alpha(palette.accent, 0.4),
    flexWrap: 'wrap',
  },
  bannerItem: { gap: 2 },
  bannerBig: {
    fontSize: fs.display,
    fontWeight: '800',
    color: semantic.brand,
    fontVariant: ['tabular-nums'],
  },
  bannerLabel: { fontSize: fs.xs, color: semantic.textDim },

  code: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 7,
    backgroundColor: semantic.controlBg,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: fs.sm,
    color: semantic.text,
    letterSpacing: 0.6,
  },
  codeTextZu: { color: semantic.cold },

  statPill: {
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },

  bottomBar: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: 10,
    backgroundColor: alpha(palette.bg, 0.9),
    borderTopWidth: 1,
    borderTopColor: semantic.divider,
  },
  /** 紧凑底栏：单行、矮高度，出图按钮按内容宽而非 flex 撑满 */
  bottomBarCompact: { paddingVertical: 5, gap: space.sm },
  btnCompact: { flex: 0, paddingHorizontal: space.xl, paddingVertical: 9 },
  btnCompactGhost: { paddingHorizontal: space.lg, paddingVertical: 9 },
  btnTextCompact: { fontSize: fs.sm },
  /** 提示文字占据剩余宽度并截断，避免把按钮挤走 */
  hintFlex: { flex: 1, textAlign: 'right' },
  btnGhost: {
    paddingVertical: 13,
    paddingHorizontal: space.lg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    backgroundColor: semantic.panelBg,
    alignItems: 'center',
  },
  btnGhostText: { fontSize: fs.base, color: semantic.text },
  btnMain: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: semantic.brand,
    alignItems: 'center',
    /**
     * 不允许被压缩到 0：竖排底栏时父容器是 column + 固定高度，
     * flex:1 会把按钮当成「可压缩块」按比例削高，文字行随之被裁掉，
     * 渲染出来就是一条没有文字的绿色空条（实测截图即如此）。
     */
    minHeight: 44,
  },
  btnMainPressed: { transform: [{ scale: 0.97 }] },
  btnMainText: {
    color: semantic.onBrand,
    fontWeight: '700',
    letterSpacing: 2,
    fontSize: fs.base,
  },
  hint: { fontSize: fs.xs, color: semantic.textFaint, lineHeight: 18 },

  legend: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 3, borderRadius: 2 },
  legendText: { fontSize: fs.micro, color: semantic.textFaint },
});
