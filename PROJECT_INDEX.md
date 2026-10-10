# 彩票趋势分析 APP —— 项目索引

> 给 AI 的上下文恢复文档。新对话开头贴这份内容，即可恢复项目全貌。
> 最后更新：2026-10-11

---

## 0. 一句话概述

Expo + React Native + TypeScript 手机 App，模仿「奇妙三数字趋势分析 / 慧眼彩票趋势分析系统」，
支持 **福彩3D / 排列3 / 排列5 / 快乐8** 四种彩种，含趋势分析、K线家族、胆拖组号、缩水、选号工具、副图指标。

- **技术栈**：Expo 54 + RN 0.81 + expo-router + ECharts(WebView 内联) + expo-sqlite + uniwind(Tailwind) + TypeScript
- **运行环境**：Termux (Android aarch64)，`qs` 快捷命令启动 Expo Go
- **项目路径**：`~/qm3/lottery-trend-app`（monorepo: client + server）
- **主要工作目录**：`~/qm3/lottery-trend-app/client`

---

## 1. 快捷命令（`~/.bashrc`）

| 命令 | 作用 |
|------|------|
| `qs` | 启动 Expo Go（自动杀旧 Metro） |
| `qsc` | 跳 client 目录 |
| `qsroot` | 跳仓库根 |
| `qsck` | `npx tsc --noEmit` 类型检查 |
| `qstp "msg"` | git add + commit + push |

---

## 2. 目录结构（只列关键文件）

```
client/
├── app/(tabs)/_layout.tsx       # Stack 导航（无底部 tab 栏，路由全保留）
├── app/(tabs)/index.tsx          # Redirect → /(tabs)/analyze（启动页）
├── app/(tabs)/analyze.tsx        # → screens/analyze
├── app/(tabs)/shrink.tsx         # → screens/shrink（3D 缩水，入口在分析屏更多菜单「组号」）
├── app/(tabs)/pl5-shrink.tsx     # → screens/shrink/pl5
├── app/(tabs)/kl8-shrink.tsx     # → screens/shrink/kl8
├── screens/analyze/index.tsx     # ★ 主页分析（最大，~3000 行）
├── screens/shrink/index.tsx      # ★ 3D 缩水
├── screens/shrink/pl5.tsx        # PL5 缩水
├── screens/shrink/kl8.tsx        # KL8 缩水（占位）
├── components/charts/
│   ├── chartMath.ts              # ★★ 核心算法：aggregate/布林/二阶概率/出次/遗漏和
│   ├── EChartsFreqKChart.tsx     # ★ 频率K线（OHLC+影线+周期+布林+overlay）
│   ├── EChartsOmissionChart.tsx  # ★ 遗漏图（一阶/二阶/双联）
│   ├── EChartsOmissionKChart.tsx # ★ 遗漏K线（二阶概率档位+预先阴线）
│   ├── EChartsChuciChart.tsx     # 出次图 / 出次移动统计
│   ├── EChartsMissSumChart.tsx   # 遗漏和（组选/全胆/直选三口径）
│   ├── EChartsKl8Heatmap.tsx     # 快乐8 分布图形热力图（80号）
│   ├── MultiPaneChart.tsx        # 主图+副图同 WebView 多 grid（指标叠加）
│   └── EChartsRawChart.tsx       # 原始值走势（振幅等）
├── components/ui/
│   ├── Kit.tsx                   # Chip/Panel/Segmented/ChartCard/TongGrid 等
│   ├── PickSheet.tsx             # ★ 纯JS抽屉（三态：收起/悬停/满屏88%）
│   ├── BackBar.tsx               # 自绘返回行（无 tab 栏后的返回入口）
│   └── IndicatorPanel.tsx        # 副图指标设置弹窗
├── lib/charts/indicators.ts      # ★ MACD/KDJ/RSI/CCI/ADX/SAR（Wilder TR 口径）
├── lib/lottery/
│   ├── targets.ts                # ★★ 分析目标 + 概率（核心）
│   ├── analysis.ts               # 分析纯函数
│   ├── filters.ts                # ★ 3D 组号筛选
│   ├── danTuo.ts                 # 胆拖（支持任意位数 D）
│   ├── datasource.ts             # ★ 数据源（17500 + 中彩网 + SQLite）
│   ├── db.ts                     # ★ SQLite 持久化（多源校验）
│   ├── games.ts                  # 彩种定义（fc3d/pl3/pl5/kl8）
│   └── seed.ts                   # 种子数据兜底
├── hooks/useLottery.ts           # 数据加载 hook（含 allRecords）
└── lib/echartsSource.ts          # ★ 1MB 内联 ECharts 源（离线用）
```

---

## 3. 核心模块

### 3.1 `lib/lottery/targets.ts` —— 分析目标抽象

**Target 类型（8 种）**：
```ts
type Target =
  | { kind: 'digit'; digit; pos }                    // 数字 + 位置
  | { kind: 'setAttr'; attrKey; attrValue; pos }     // 集合属性
  | { kind: 'calcAttr'; calcKey; value }             // 计算属性
  | { kind: 'set'; codes: Set<string> }              // 直选集合
  | { kind: 'kl8Combo'; codes; matchMode; matchCount? } // KL8 组合（全中/任意/中N）
  | { kind: 'kl8Dantuo'; dan; tuo; danCounts; tuoCounts } // KL8 胆拖
  | { kind: 'kl8Fushi'; codes; playSize }            // KL8 复式
  | { kind: 'shapeSet'; codes; shapeLabel; mainMode } // 3D 形态（组选/组三/组六）
```

关键类型：

· Position: 'any' | 'wan' | 'qian' | 'bai' | 'shi' | 'ge'
· SamplingMode: 'independent'（3D/PL3/PL5）| 'hypergeometric'（KL8）
· ShapeMainMode: 'zhixuan' | 'zuxuan'
· ShapeFilter: 'zusan' | 'zuliu'
· CalcAttrKey：和值/合值/跨度/二码合最大/二码差最大/sumAmp/spanAmp/baiAmp/shiAmp/geAmp/qianAmp/wanAmp/sumTailAmp/front2Sum/back2Sum

核心函数：

· isHit(record, target, prevRecord?) 命中判定
· getProbability(target, V, D, samplingMode) 理论概率
· getTheoryMiss(target, V, D, mode) 理论遗漏 = (1-p)/p
· buildTargetSeries(records, target, V, D, mode) → TargetPoint[]（p/diff/omission/score 四序列）
· buildRawSeries(records, calcKey) 原始值序列
· buildShapeCodes(digits, mainMode, shapeFilters) 3D 形态集合
· getTargetLabel(target) / getTargetShortLabel(target) / posIndex(pos, digitCount)

概率公式：

· 独立抽样（3D）：p = 1-(V-1)/V^D（独胆）；p = 1/V（定位）
· 超几何（KL8）：p = D/V（单号，20/80=0.25）；组合用 logComb 防溢出

理论遗漏：

· 福彩3D 独胆 = 2.69
· 快乐8 单号 = 3.0

### 3.2 `components/charts/chartMath.ts` —— 核心算法（官方口径）

· aggregate(series, period, align) → OHLC K线聚合（前收=后开，左右对齐）
· buildBoll / lastBollTriple —— 布林带（频率K右上角 上/中/下轨）
· getSecondOrderProbability(p) → p₂ = 1−(1−p)^(floor((1−p)/p)+1)
· secondOrderFromTheory(tMiss)
· buildOmissionBars(series, theoryMiss, p2) → 遗漏K线（红 1/p₂−1、绿恒定 −1，支持 pending 阴线）
· buildChuciSeries / buildChuciMoveSeries → 出次图/出次移动统计
· missSumDropRate + MISS_SUM_REF=11 → 遗漏和（组选口径「≥11 下期 90% 回落」）

### 3.3 `lib/charts/indicators.ts` —— 副图指标

· calcMacd —— 去掉 ×2（官方口径：dif−dea）
· calcAdx/DMI —— Wilder TR（max(H−L,|H−PC|,|L−PC|)）
· calcRsi（无波动返 50）/ calcKdj / calcCci / calcSar（方向由前两期走势定）

### 3.4 图表组件

EChartsFreqKChart（频率K线）：
· Y = diff（累计实出 − 累计理论）；无影线（单期）/ OHLC+影线（周期）
· 布林通道 MA20±2σ；overlay: 'none'|'split'（黄金分割）|'equal'（四等分）
· 顶部 graphic 悬浮标题

EChartsOmissionKChart（遗漏K线）：
· 只在开出期画柱；红 1/p₂−1、绿 −1；pending 阴线半透明+虚线
· overlay 水平参考线

EChartsOmissionChart（遗漏图，一阶/二阶/双联）：
· mode: 'both' | 'level1' | 'level2'；球按"开出事件"画（非每期）
· MA5/10/20 按开出序列计算，起点延伸；MAX_SHOW = 1000
· overlay 水平参考线

EChartsChuciChart（出次图/出次移动统计）：
· 红圈曲线 + 5/10/25 均线 + 拐点值

EChartsMissSumChart（遗漏和）：
· 组选/全胆/直选三口径，参考线可配置（refValue/tip）

EChartsKl8Heatmap（快乐8 分布图形）：
· 80 号 8×10 热力图，双口径：近N期出现次数 / 当前遗漏

MultiPaneChart：
· 主图（频率K/遗漏K）+ 副图（MACD/KDJ/RSI/CCI/ADX/SAR）同 WebView 多 grid，x 轴天然对齐

### 3.5 screens/analyze/index.tsx —— 主页分析（~3000 行）

**布局（对齐慧眼参考图）**：
- 顶栏单行：`位置▼ | 彩种▼ | 期数 | 奖 | ＋`
- 底部固定图型栏：`频率K 遗漏图 遗漏K 指标 出次 周期 同屏 •••`（zIndex 30 压在抽屉上）
- 「•••」更多菜单：补充图型（二阶遗漏/出次移动/遗漏和/分布）、缩放/全屏/出图/重置、**组号**（跳缩水屏）
- 选号抽屉（PickSheet 三态：收起/悬停/满屏88%）：把手下方固定「常用/系统/定制」分组行，内容可滚

**图型模式（ChartMode，8 种）**：freq / omissionLine / omissionLine2 / omissionK / chuci / chuciMove / missSum / kl8dist

**选号 Tab（数字彩）**：常用 / 毒胆 / 胆拖 / 定位 / 复式 / 胆合积跨 / 振幅 / 组内随机 / 随机交并 / 分组胆
**KL8 Tab**：常用 / 组合 / 复式 / 连号 / 胆拖

各 Tab target 要点：
- 毒胆：matchFilterFast（循环外预计算目标集，D=5 十万次枚举零分配——切彩种卡死已修复）
- 胆拖：generateDanTuo(dan, tuo, D)（任意位数）
- 复式：定位笛卡尔积 / 不定位 noposNums
- 组内随机/随机交并/分组胆：已实现（产出可分析集合）
- 粘贴导入：解析号码串按毒胆方式切入分析

**胆码同屏（毒胆 Tab）**：
- 竖屏 2 列×5 行网格（点单格放大）
- 每格头部三行：`毒胆·N·直选X注 | 更多` / `图型▾ | MA摘要 | 查看号码` / `遗漏周期·当前遗漏·概率`
- 图型▾ 下拉：频率K/遗漏图/遗漏K（独立于全局图型栏）
- 更多竖排菜单：号码/复制/加入缩水/分割/等分/二阶
- 分割=黄金分割、等分=四等分 → 图表水平参考线（overlay prop）

**周期/窗口记忆**：
- 记忆键 = `页签:图型`（如 `dan:freq`）
- 期数/分析窗口输入框按图型各自记住（frequencyK 记 80、遗漏图记 300 互不干扰）
- 周期 Chip（1~20）同样按图型分别记忆
- 切图型/切页签自动恢复；应用后写入

**形态模式（仅 3D/PL3）**：组选（主模式）/ 组三/组六（过滤），未选=直选

### 3.6 lib/lottery/datasource.ts —— 数据源

| 彩种 | 主源 | 备源 |
|------|------|------|
| fc3d | 17500 3d_asc.txt | 中彩网 API（最多 100 期） |
| pl3 | 17500 pl3_asc.txt | 无 |
| pl5 | 17500 pl5_asc.txt | 无 |
| kl8 | 中彩网 API（2000 期） | 无 |

· loadHistory(gameId, count) → { records, allRecords, source }
· refreshHistory / fetchAllAndVerify / verifyLocalData / fetchFullHistory（三级 fallback）
· AsyncStorage 缓存（TTL 6h）+ SQLite 主存储

### 3.7 lib/lottery/db.ts —— SQLite 持久化

· draws / draws_backup / conflicts 三表
· 串行队列 enqueue + withRetry（database is locked 重试 8 次）
· 不用事务（expo-sqlite 新版事务 API 有锁库/NPE bug）

### 3.8 lib/lottery/games.ts

```ts
FC3D: 福彩3D  (digitCount: 3, digitMin: 0, digitMax: 9)
PL3:  排列3   (同上)
PL5:  排列5   (digitCount: 5, digitMin: 0, digitMax: 9)
KL8:  快乐8   (digitCount: 20, digitMin: 1, digitMax: 80)
```

---

## 4. 关键决策

| 决策 | 原因 |
|------|------|
| 图表用 ECharts + WebView | Skia 手写效果差 |
| ECharts 内联 lib/echartsSource.ts | 离线不依赖 CDN |
| 遗漏图球按"开出事件"画 | 参考图设计 |
| 超几何概率（KL8） | 20 号不重复，非独立抽样 |
| SQLite 不用事务 + 串行队列重试 | 避免 database is locked |
| 二阶概率 p₂ = 1−(1−p)^(floor((1−p)/p)+1) | 官方二阶遗漏口径 |
| 遗漏K线红 1/p₂−1、绿 −1 | 官方档位口径（官方原文/界面百分比/像素比三点互证） |
| ADX/DMI 用 Wilder TR | 与官方截图吻合到 2 位小数 |
| MACD 去掉 ×2 | 与官方原文一致 |
| 抽屉纯 JS（Animated+PanResponder） | Expo Go 下 reanimated/gesture-handler 版本写死会崩 |
| 抽屉三态：收起/悬停/满屏88% | 官方交互（满屏即原 88%） |
| 底部无 tab 栏（Stack 导航） | 官方全屏分析布局，组号入口移到更多菜单 |
| 每个 Tab+图型独立期数/周期 | 不同图表各自记忆分析窗口 |
| 毒胆枚举循环外预计算 | 排列五 D=5 十万次枚举，消除每号建 Set 卡顿 |

---

## 5. 已完成 / 未完成

✅ 已完成

- 数据层：17500 + 中彩网 + SQLite + 多源校验
- 彩种：福彩3D / 排列3 / 排列5 / 快乐8（全四位支持）
- K线家族：频率K / 遗漏K / 遗漏图（一阶/二阶/双联）/ 出次图 / 出次移动 / 遗漏和 / 周期K线 / 快乐8分布热力图
- 副图指标：MACD/KDJ/RSI/CCI/ADX/SAR（Wilder 口径）+ MA 参数
- 排列五五位全维度（毒胆/胆拖/复式 D 位通用枚举，两码合差全组合）
- 选号工具：组内随机 / 随机交并 / 分组胆 / 粘贴导入
- 胆码同屏：2 列网格 + 每格图型下拉 + 更多菜单（号码/复制/加入缩水/分割/等分/二阶）
- 形态按钮（仅3D/PL3）
- 抽屉三态 + 固定分组行 + 周期记忆
- 底部无 tab 栏，组号入口入更多菜单
- GitHub Actions 双构建 + 快捷命令

❌ 未完成

- 快乐8 选一~选十回测
- 快乐8 组号缩水
- K线家族剩余：连出K线 / 连出遗漏K线 / 号内趋势 / 大盘K线
- 统计分析与图表：分布图形/扫描图/遗漏统计搜索/遗漏出次统计出号/极冷极热出号（快乐8 分布热力图已做一部分）
- MA/EMA/BOLL 参数可配置
- 打包 APK 到应用商店

---

## 6. 常用命令

```bash
# 启动
qs                       # Expo Go 模式

# 类型检查（必须无输出）
qsck

# 提交
qstp "feat: xxx"

# 装 --no-save 依赖（易丢，谨慎）
cd ~/qm3/lottery-trend-app/client
npm install <pkg> --no-save --legacy-peer-deps --ignore-scripts --registry=https://registry.npmmirror.com
```

已知依赖坑：

- metro / metro-cache / metro-config / metro-transform-worker / metro-core / metro-resolver @0.83.8（uniwind 需要）
- react-refresh@0.14.2（babel-preset-expo 需要）
- expo-sqlite@~16.0.10（Expo 54 内置版本）

---

## 7. 已知坑

| 问题 | 解决 |
|------|------|
| --tunnel 报 ERR_INVALID_ARG_TYPE | ngrok 在 Termux 崩溃，改用 LAN 或 cloudflared |
| Expo Go 连不上 Metro | 用 Expo Go 模式 + LAN IP（REACT_NATIVE_PACKAGER_HOSTNAME） |
| database is locked | 不用事务 + 串行队列 + withRetry |
| metro-cache FileStore 找不到 | 手动 npm install metro-cache@0.83.8 |
| pnpm 在 Termux 报 flock | 用 npm 旁路装 --no-save |
| github.com:443 不可达（沙箱） | 用 GitHub Git Data API（gh auth token）推送提交 |
| WebView 永远盖住普通 View | 浮层 zIndex/elevation 提层并在 WebView 之后渲染 |
| 切彩种卡死 | 毒胆枚举循环外预计算 + 切彩种清同屏状态收抽屉 |

---

## 8. 下一步方向

- 快乐8 选一~选十回测（玩法选择 + 命中分布 + 奖金表 + 期望收益）
- 快乐8 组号缩水
- K线家族补全：连出K线 / 连出遗漏K线 / 号内趋势 / 大盘K线
- MA/EMA/BOLL 参数可配置

---

## 9. 恢复对话

新对话第一句：

```
读这个文件了解项目：[粘贴本文件内容]

当前进度：数据层 + 四彩种 + K线家族（8 图型）+ 副图指标 + 排列五五位全维度 +
选号工具 + 胆码同屏下拉 + 抽屉三态 + 周期记忆 全部完成；底部无 tab 栏，
组号入口在更多菜单。git 最新 3c49940。

现在要做：<你的需求>
```
