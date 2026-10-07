# 彩票趋势分析 APP —— 项目索引

> 给 AI 的上下文恢复文档。新对话开头贴这份内容，即可恢复项目全貌。
> 最后更新：2026-10-03

## 0. 一句话概述

Expo + React Native + TypeScript 手机 App，模仿商业软件「奇妙三数字趋势分析」，
用于福彩3D / 排列3 的趋势分析、胆拖组号、组号缩水、K线图表。

- **技术栈**：Expo 54 + RN 0.81 + expo-router + react-native-svg + @shopify/react-native-skia + ECharts(WebView) + uniwind(Tailwind) + TypeScript
- **运行环境**：Termux (Android aarch64)，`CI=1 npx expo start --clear` + Expo Go 扫码
- **项目路径**：`~/qm3/lottery-trend-app`（monorepo: client + server）
- **主要工作目录**：`~/qm3/lottery-trend-app/client`


## 1. 目录结构

```

client/
├── app/(tabs)/          # 路由（analyze / shrink 两个 Tab）
├── screens/
│   ├── analyze/index.tsx    ★主页分析 (943行)
│   ├── shrink/index.tsx     ★组号缩水 (607行)
│   ├── trend/  picker/  omission/  # 旧页（隐藏）
├── components/charts/
│   ├── EChartsFreqKChart.tsx      ★频率K线 (240行)
│   ├── EChartsOmissionChart.tsx   ★遗漏双联图 (347行)
│   ├── EChartsOmissionKChart.tsx  ★遗漏K线 (156行)
│   ├── EChartsRawChart.tsx        ECharts原始值 (153行)
│   ├── SkiaRawChart.tsx           ★振幅图 (214行)
│   ├── FreqKChart.tsx/OmissionChart.tsx/OmissionKChart.tsx  # 旧Skia版
│   ├── StockChart.tsx/TrendChart.tsx/...  # 更旧的
│   └── chartUtils.ts
├── components/
│   ├── Screen.tsx (357行)
│   ├── SmartDateInput.tsx
│   ├── DigitSelector*.tsx
│   └── ...
├── lib/lottery/
│   ├── targets.ts        ★★分析目标 (358行)
│   ├── analysis.ts       分析纯函数 (557行)
│   ├── filters.ts        ★组号筛选 (179行)
│   ├── danTuo.ts         胆拖算法 (44行)
│   ├── shrink.ts         缩水逻辑 (211行)
│   ├── datasource.ts     ★数据源 17500 (186行)
│   ├── games.ts          彩种定义 (97行)
│   ├── seed.ts           种子数据 (130行)
│   └── types.ts
├── hooks/useLottery.ts
├── app.config.ts         (orientation: landscape)
└── metro.config.js       (Termux 排除规则)

```

## 2. 核心模块

### targets.ts

4 种 Target：
- `digit` — 数字 0-9
- `setAttr` — 集合属性（大小/奇偶/质合/阴阳/曲直/大中小/012路/对码）
- `calcAttr` — 计算属性（和值/合值/跨度/二码合最大/二码差最大/和值振幅/跨度振幅/百位振幅/十位振幅/个位振幅/前二和值/后二和值）
- `set` — 号码集合

核心函数：
- `buildTargetSeries(records, target, V, D)` → TargetPoint[]
- `buildRawSeries(records, calcKey)` → {issue, value}[]（用于振幅）
- `getTheoryMiss(target, V, D)` = (1-p)/p

TargetPoint：`{issue, hit, omission, cumHit, cumTheory, diff}`

理论遗漏（福彩3D 独胆）= 2.69，百位单数字 = 9。

### 图表

**EChartsFreqKChart**（频率K线）：
- Y = diff（累计实际出次 - 累计理论出次）
- 无影线蜡烛（custom renderItem）
- barWidth = 1.5
- 布林通道 MA20±2σ
- 支持 period（1/2/3/5/10）

**EChartsOmissionKChart**（遗漏K线）：
- 只在开出期画柱（石头剪刀布爬楼梯）
- 高度逻辑：遗漏≤T→红+1；T<M≤2T→青-1；2T<M≤3T→青-2；3T<M≤4T→青-3；4T以上循环
- barWidth = 1.5

**EChartsOmissionChart**（遗漏双联图）：
- 上：二阶遗漏；下：一阶遗漏 + MA5/10/20
- MA 算法：最近 N 期遗漏值 / N（含未开出期）
- MA 颜色：MA5=蓝#3b82f6、MA10=绿#22c55e、MA20=紫#e879f9
- 红球=峰值点，绿球=开出，蓝球=最新，紫球=?（下一期）

**SkiaRawChart**（振幅图）：
- 每期一球 + 折线 + MA5/10/20 + 总平均线（黑实线）
- 悬浮标题：`{name} 走势（历史平均:X.XXX 当前:X）`
- MA 颜色与遗漏图统一

ECharts 从 CDN 加载：`https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js`

### analyze/index.tsx (943行)

**10 个 Tab**：常用 / 毒胆 / 胆拖 / 定位 / 复式 / 胆合积跨 / 振幅 / 组内随机 / 随机交并 / 分组胆
（前 7 个可用，后 3 个占位）

**各 Tab 逻辑**：
- 常用：3 模式（数字 0-9 / 前二和值 0-18 / 后二和值 0-18）
- 毒胆：按类型（开奖号/对码/两码合/两码差/两码跨）筛选 1000 个号码
- 胆拖：generateDanTuo(胆, 拖)
- 定位：digit + pos（百/十/个）
- 复式：定位（百十个笛卡尔积）/ 不定位（每位从选中集选）
- 胆合积跨：和值/合值/跨度/二码合最大/二码差最大/前二和值/后二和值
- 振幅：buildRawSeries → SkiaRawChart（默认 80 期）

**同屏**：5×2 网格，点小图满屏，顶部可收起/展开。

### shrink/index.tsx (607行)

**筛选卡片（8 个）**：
1. 定位（百/十/个，默认全选 + 右侧"全"按钮）
2. 胆码出现次数（0-9，两行 5 个）
3. 形态（大小 / 单双 / 质合 / 大中小 10 种）
4. 最数（最小/中间/最大）
5. 和值（0-27）
6. 和值尾 / 跨度
7. 特殊形态（连号 / 成对 / 0路 / 1路 / 2路）
8. 两码（两码和尾 / 两码差 / 不定位两码 55 种）

**逻辑**：
- 胆码不选 = 全 1000 注
- 多条件叠加（AND）
- 区内多选（OR）
- 定位默认全选（length===10 视为不过滤）

**结果**：直选/组选分类显示（组三 / 组六），6 个复制按钮，交集/差集，出图跳转 analyze 页。

### datasource.ts

数据源：`https://data.17500.cn/`
- 3d_asc.txt → 福彩3D（8764 期）
- pl3_asc.txt → 排列3
- pl5_asc.txt → 排列5（预留）

格式：`期号 日期 百 十 个 [其他]`
缓存：AsyncStorage，key=`lottery_history_v2_{gameId}`，TTL 6 小时。

## 3. 已完成功能

### ✅ 数据层
- 17500 全量历史（3d/pl3/pl5）
- AsyncStorage 缓存 + 6小时TTL
- 种子数据兜底（120期）

### ✅ 图表（ECharts 版）
- 频率K线（custom + 多周期 + 布林）
- 遗漏K线（石头剪刀布 + 循环降档）
- 遗漏双联图（二阶 + 一阶 + MA5/10/20）
- 振幅图（Skia 折线 + MA5/10/20 + 总平均线）

### ✅ 分析页
- 10 Tab（7 可用）
- 常用支持 数字/前二/后二 三模式
- 胆码/配码（对码模式特殊处理）
- 彩种切换（福彩3D/排列3）
- 图表多选 + 周期 + 期数
- 同屏网格 + 满屏
- 振幅 Tab（默认 80 期）

### ✅ 组号页
- 胆拖组号（不选胆码 = 全 1000 注）
- 直选/组三/组六分类
- 6 个复制按钮
- 交集/差集
- 出图跳转
- **8 个筛选卡片**
- 摘要显示筛选条件 + 金额分开

### ❌ 未完成
- 3 个占位 Tab（组内随机 / 随机交并 / 分组胆）
- 排列5 完整支持
- MA/EMA/BOLL 参数可自定义（参考图第 1 批）
- MACD/RSI/KDJ 副图（第 2 批）
- CCI/SAR/ADX 副图 + 指标设置弹窗（第 3 批）
- 走势筛选
- 打包 APK

## 4. 关键设计决策

| 决策 | 原因 |
|------|------|
| 图表用 ECharts + WebView | Skia 手写效果差，ECharts custom 能精确控制 |
| ECharts 从 CDN 加载 | 本地 npm 包太大（10MB+），WebView 用不上 |
| 三种图表都用 custom 系列 | 支持无影线蜡烛 + 完全自定义宽度 |
| 振幅用 Skia（不用 ECharts） | WebView 折线调试成本高 |
| MA5/10/20 = 最近N期遗漏值/N | 用户确认（按期，含未开出期） |
| MA 颜色：5=蓝 10=绿 20=紫 | 对齐参考图 + 跨图统一 |
| 筛选叠加 = AND，区内 = OR | 对齐参考图 |
| 定位默认全选 | 对齐参考图，不选=不限 |
| 胆码不选 = 全 1000 注 | 支持"只用筛选"用法 |
| 底部 Tab 只留 2 个 | 老页面被分析页取代 |
| Termux 启动加 CI=1 | 绕过 inotify watcher 上限 |
| metro.config.js 排除 android/ios 源码 | 避免 ENOSPC 崩溃 |

## 5. 常用命令

```bash
cd ~/qm3/lottery-trend-app/client

# 类型检查（必须无输出）
npx tsc --noEmit

# 启动（必须加 CI=1）
pkill -f expo
pkill -f node
CI=1 npx expo start --clear

# 清 Metro 缓存
rm -rf ~/qm3/lottery-trend-app/client/node_modules/.cache
```

## 6. 用户偏好

· 沟通：中文，简洁，直接给完整代码
· 写入方式：cat > file << 'EOF'，避免 Python 脚本（容易误粘贴到终端）
· 大改动前先确认需求
· 每次改动后 npx tsc --noEmit + Expo Go 截图
· 参考图在 ~/qm3/彩票趋势APP 设计资料/ref_images

7. 下一步方向（参考图优先级）

第 1 批：MA 多周期可配置（10/20/30/45/60/90/120）+ 颜色对齐
第 2 批：MACD / RSI / KDJ 副图
第 3 批：CCI / SAR / ADX + 指标设置弹窗
其它：3 个占位 Tab / 走势筛选 / 排列5 / 打包 APK

8. 恢复对话

新对话第一句：
"读这个文件了解项目：[粘贴本文件内容]。现在我要做：<你的需求>"
