/**
 * 通用 UI 组件库
 *
 * 只依赖 react-native 原生能力 + 本项目的设计 token，
 * 不含任何自定义原生模块，因此在 Expo Go 里可直接热更新。
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { alpha, fontSize, radius, semantic, space, touch } from '../../lib/theme';

/* ---------------------------------- 基础 ---------------------------------- */

export function Row({
  children,
  gap = space.sm,
  wrap = true,
  align = 'center',
  justify,
  style,
}: {
  children?: React.ReactNode;
  gap?: number;
  wrap?: boolean;
  align?: 'center' | 'flex-start' | 'flex-end' | 'baseline';
  justify?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          flexWrap: wrap ? 'wrap' : 'nowrap',
          gap,
          alignItems: align,
          justifyContent: justify,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Spacer({ size = space.md }: { size?: number }) {
  return <View style={{ height: size, width: size }} />;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: semantic.divider, width: '100%' }, style]} />;
}

/* ---------------------------------- 面板 ---------------------------------- */

export function Panel({
  title,
  extra,
  children,
  style,
  bodyStyle,
  compact,
}: {
  title?: string;
  extra?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  /** 紧凑模式（横屏侧栏用）：标题行与内边距减半 */
  compact?: boolean;
}) {
  return (
    <View style={[styles.panel, style]}>
      {title ? (
        <View style={[styles.panelHead, compact && styles.panelHeadCompact]}>
          <Text style={[styles.panelTitle, compact && styles.panelTitleCompact]} numberOfLines={1}>
            {title}
          </Text>
          {extra}
        </View>
      ) : null}
      <View style={[{ padding: compact ? space.sm : space.md }, bodyStyle]}>{children}</View>
    </View>
  );
}

/* --------------------------------- 分段控件 -------------------------------- */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
  compact,
}: {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
  /** 紧凑模式（横屏侧栏用）：允许换行、减小左右内边距 */
  compact?: boolean;
}) {
  return (
    <View style={[styles.segmented, compact && styles.segmentedCompact, style]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.segItem,
              compact && styles.segItemCompact,
              active && styles.segItemActive,
              pressed && { opacity: 0.75 },
            ]}
          >
            <Text
              style={[styles.segText, compact && styles.segTextCompact, active && styles.segTextActive]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------------------------------- 标签 ---------------------------------- */

export function Chip({
  label,
  active,
  color,
  onPress,
  style,
  disabled,
  compact,
}: {
  label: string;
  active?: boolean;
  color?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** 置灰不可点（如快乐8 下不支持的功能入口） */
  disabled?: boolean;
  /** 紧凑模式（横屏侧栏用）：减小内边距与圆角 */
  compact?: boolean;
}) {
  const tint = color ?? semantic.brand;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        compact && styles.chipCompact,
        active && !disabled && { backgroundColor: alpha(tint, 0.18), borderColor: tint },
        pressed && !disabled && { opacity: 0.75 },
        disabled && { opacity: 0.35, borderColor: semantic.panelBorder },
        style,
      ]}
    >
      <Text
        style={[
          styles.chipText,
          compact && styles.chipTextCompact,
          active && !disabled && { color: tint },
          disabled && { color: semantic.textFaint },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* --------------------------------- 数字选择 -------------------------------- */

export function DigitButton({
  value,
  active,
  onPress,
  size = 44,
  color,
}: {
  value: string | number;
  active?: boolean;
  onPress?: () => void;
  size?: number;
  color?: string;
}) {
  const tint = color ?? semantic.brand;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.digit,
        {
          width: size,
          height: size,
          borderRadius: radius.sm,
        },
        active && { backgroundColor: tint, borderColor: tint },
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={[styles.digitText, active && { color: semantic.onBrand }]}>{value}</Text>
    </Pressable>
  );
}

export function DigitGrid({
  digits,
  selected,
  onToggle,
  columns = 6,
  size = 44,
  color,
}: {
  digits: number[];
  selected: number[];
  onToggle: (d: number) => void;
  columns?: number;
  size?: number;
  color?: string;
}) {
  return (
    <View style={styles.digitGrid}>
      {digits.map((d) => (
        <DigitButton
          key={d}
          value={d}
          size={size}
          color={color}
          active={selected.includes(d)}
          onPress={() => onToggle(d)}
        />
      ))}
    </View>
  );
}

/* ---------------------------------- 按钮 ---------------------------------- */

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    variant === 'primary' ? semantic.brand : variant === 'danger' ? semantic.hot : 'transparent';
  const fg = variant === 'primary' ? semantic.onBrand : variant === 'danger' ? semantic.hot : semantic.brand;
  const border = variant === 'ghost' ? semantic.brand : variant === 'danger' ? semantic.hot : bg;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: border },
        disabled && { opacity: 0.4 },
        pressed && !disabled && { opacity: 0.8 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
  </Pressable>
  );
}

/* --------------------------------- 统计数值 -------------------------------- */

export function Stat({
  label,
  value,
  color,
  style,
}: {
  label: string;
  value: string | number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.stat, style]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/* --------------------------------- 表单行 --------------------------------- */

export function Field({
  label,
  children,
  style,
  compact,
}: {
  label: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 紧凑模式（横屏侧栏用）：标签在左上、控件占满整行 */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <View style={[styles.fieldStack, style]}>
        <Text style={[styles.fieldLabel, styles.fieldLabelCompact]} numberOfLines={1}>
          {label}
        </Text>
        <View style={{ alignSelf: 'stretch' }}>{children}</View>
      </View>
    );
  }
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={{ flexShrink: 1 }}>{children}</View>
    </View>
  );
}

export function Input({
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  style,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  style?: StyleProp<TextStyle>;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={semantic.textFaint}
      keyboardType={keyboardType}
      style={[styles.input, style]}
    />
  );
}

/* ------------------------------ 空态 / 加载态 ----------------------------- */

export function Empty({ text = '暂无数据' }: { text?: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function Loading({ text = '加载中…' }: { text?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={semantic.brand} />
      <Spacer size={space.sm} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

/* ---------------------------------- 样式 ---------------------------------- */

const styles = StyleSheet.create({
  panel: {
    backgroundColor: semantic.panelBg,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: semantic.controlBg,
    borderBottomWidth: 1,
    borderBottomColor: semantic.panelBorder,
  },
  panelHeadCompact: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  panelTitle: {
    color: semantic.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  panelTitleCompact: {
    fontSize: fontSize.sm,
    flexShrink: 1,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: semantic.controlBg,
    borderRadius: radius.sm,
    padding: 3,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
  },
  segmentedCompact: {
    flexWrap: 'wrap',
    padding: 2,
    gap: 2,
  },
  segItem: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: touch.sm,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm - 2,
  },
  segItemCompact: {
    minHeight: 28,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    paddingHorizontal: space.sm,
    borderRadius: 4,
  },
  segItemActive: {
    backgroundColor: semantic.brand,
  },
  segText: {
    color: semantic.textDim,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  segTextCompact: {
    fontSize: fontSize.xs,
  },
  segTextActive: {
    color: semantic.onBrand,
  },
  chip: {
    minHeight: touch.sm,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    backgroundColor: semantic.controlBg,
  },
  chipCompact: {
    minHeight: 28,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
  },
  chipText: {
    color: semantic.textDim,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  chipTextCompact: {
    fontSize: fontSize.xs,
  },
  digitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  digit: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.controlBg,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
  },
  digitText: {
    color: semantic.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  button: {
    minHeight: touch.min,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  buttonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  stat: {
    flexBasis: '30%',
    flexGrow: 1,
    minWidth: 96,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    backgroundColor: semantic.controlBg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
  },
  statLabel: {
    color: semantic.textFaint,
    fontSize: fontSize.xs,
    marginBottom: 2,
  },
  statValue: {
    color: semantic.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touch.min,
    paddingVertical: space.xs,
    gap: space.sm,
  },
  fieldStack: {
    paddingVertical: space.xs,
    gap: 3,
  },
  fieldLabel: {
    color: semantic.textDim,
    fontSize: fontSize.sm,
    flexShrink: 0,
  },
  fieldLabelCompact: {
    fontSize: fontSize.xs,
  },
  input: {
    minHeight: touch.sm,
    paddingHorizontal: space.sm,
    color: semantic.text,
    backgroundColor: semantic.contentBg,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    borderRadius: radius.sm,
    fontSize: fontSize.sm,
    minWidth: 96,
  },
  center: {
    padding: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: semantic.textFaint,
    fontSize: fontSize.sm,
  },
});
