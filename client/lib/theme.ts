/**
 * 设计 Token —— 与 prototype/ 下的网页原型 1:1 对齐
 *
 * 原型使用 oklch 色彩空间，React Native 不支持 oklch，
 * 这里的值是原型 CSS 变量经 oklch → sRGB 精确换算得到的 hex，视觉等价。
 *
 * 注意：本文件只描述「长什么样」，不包含任何业务逻辑。
 */

/** 原型原始 oklch 值 → hex（换算自 prototype/styles.css 的 :root 变量） */
export const palette = {
  /** --bg: oklch(0.17 0.012 158) */
  bg: '#0B110D',
  /** --bg-2: oklch(0.13 0.01 158) */
  bg2: '#050806',
  /** --surface: oklch(0.22 0.016 160) */
  surface: '#141D18',
  /** --surface-2: oklch(0.27 0.018 162) */
  surface2: '#1F2924',
  /** --line: oklch(0.33 0.022 161) */
  line: '#2C3932',

  /** --ink: oklch(0.94 0.008 155) */
  ink: '#E7EDE9',
  /** --ink-dim: oklch(0.68 0.018 158) */
  inkDim: '#909C94',
  /** --ink-faint: oklch(0.52 0.018 158) */
  inkFaint: '#616C65',

  /** --accent: oklch(0.80 0.16 152) 翡翠绿（延续原系统绿色基因） */
  accent: '#60DB89',
  /** --accent-ink: oklch(0.18 0.05 152) */
  accentInk: '#001706',
  /** --amber: oklch(0.82 0.13 78) 毒胆橙 */
  amber: '#F2B95A',
  /** --amber-ink: oklch(0.24 0.06 78) */
  amberInk: '#2E1B00',
  /** --red: oklch(0.68 0.17 25) 热号 */
  red: '#EF6661',
  /** --cyan: oklch(0.78 0.11 195) 冷号 / 组选 */
  cyan: '#4FCDCD',
} as const;

/** 语义色：说明「用在哪」，组件一律引用语义色而非裸 palette */
export const semantic = {
  pageBg: palette.bg2,
  contentBg: palette.bg2,
  panelBg: palette.surface,
  panelBorder: palette.line,
  controlBg: palette.surface2,
  text: palette.ink,
  textDim: palette.inkDim,
  textFaint: palette.inkFaint,
  brand: palette.accent,
  onBrand: palette.accentInk,
  /** 胆码 / 选中态 */
  dan: palette.amber,
  onDan: palette.amberInk,
  /** 热号（高频） */
  hot: palette.red,
  /** 冷号（低频） */
  cold: palette.cyan,
  divider: palette.line,
} as const;

/** 8pt 网格间距（对齐 Apple HIG） */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

/** 圆角：统一 --r: 12px */
export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  pill: 999,
} as const;

/** 触控尺寸：Apple HIG 最小 44 */
export const touch = {
  min: 44,
  digit: 44,
  button: 44,
  tab: 40,
} as const;

/** 字号层级（原型 rem 换算） */
export const fontSize = {
  micro: 11, // 0.66~0.7rem
  xs: 12, // 0.72~0.74rem
  sm: 13, // 0.8~0.82rem
  base: 14, // 0.84~0.9rem
  md: 15,
  lg: 17, // 1.02rem
  xl: 20,
  display: 24, // 1.5rem 结果数字
} as const;

/** 图表尺寸：原型竖屏 200 / 横屏 240 */
export const chartSize = {
  h: 200,
  hLandscape: 240,
  tongCell: 88,
} as const;

/** 给 hex 颜色附加透明度，返回 rgba() 字符串（RN 支持） */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** 原型 .chip.on 使用的 color-mix(accent 20%, surface) 等价色 */
export const chipOnBg = alpha(palette.accent, 0.2);
/** 原型 .result-banner 的背景 color-mix(accent 14%, surface) */
export const bannerBg = alpha(palette.accent, 0.14);
/** 原型 .bottombar 的毛玻璃底 */
export const bottomBarBg = alpha(palette.bg, 0.9);

export const theme = {
  palette,
  semantic,
  space,
  radius,
  touch,
  fontSize,
  chartSize,
  alpha,
} as const;

export default theme;
