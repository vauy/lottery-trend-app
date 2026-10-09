```bash
cd ~/qm3/lottery-trend-app

cat > PROJECT_INDEX.md << 'MDEOF'
# 彩票趋势分析 APP —— 项目索引

> 给 AI 的上下文恢复文档。新对话开头贴这份内容，即可恢复项目全貌。
> 最后更新：2026-10-10

---

## 0. 一句话概述

Expo + React Native + TypeScript 手机 App，模仿「奇妙三数字趋势分析」，
支持 **福彩3D / 排列3 / 排列5 / 快乐8** 四种彩种，含趋势分析、胆拖组号、缩水、K线图。

- **技术栈**：Expo 54 + RN 0.81 + expo-router + @shopify/react-native-skia + ECharts(WebView 内联) + expo-sqlite + uniwind(Tailwind) + TypeScript
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
├── app/(tabs)/_layout.tsx       # 底部 Tab（分析 / 组号 ▲），组号 Tab 点击弹彩种菜单
├── app/(tabs)/index.tsx          # Redirect → /(tabs)/analyze（启动页）
├── app/(tabs)/analyze.tsx        # → screens/analyze
├── app/(tabs)/shrink.tsx         # → screens/shrink（3D 缩水）
├── app/(tabs)/pl5-shrink.tsx     # → screens/shrink/pl5
├── app/(tabs)/kl8-shrink.tsx     # → screens/shrink/kl8（占位）
├── screens/analyze/index.tsx     # ★ 主页分析（~1900 行，最大）
├── screens/shrink/index.tsx      # ★ 3D 缩水（607 行）
├── screens/shrink/pl5.tsx        # PL5 缩水（独立）
├── components/charts/
│   ├── EChartsFreqKChart.tsx     # ★ 频率K线（ECharts custom）
│   ├── EChartsOmissionChart.tsx  # ★ 遗漏图（一阶/二阶/双联）
│   ├── EChartsOmissionKChart.tsx # ★ 遗漏K线
│   ├── SkiaRawChart.tsx          # ★ 振幅图（Skia + highlightValue）
│   └── EChartsRawChart.tsx       # ECharts 原始值（备用）
├── lib/lottery/
│   ├── targets.ts                # ★★ 分析目标 + 概率（~600 行，核心）
│   ├── analysis.ts               # 分析纯函数
│   ├── filters.ts                # ★ 3D 组号筛选（179 行）
│   ├── danTuo.ts                 # 3D 胆拖算法
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

**Target 类型（7 种）**：
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
· buildTargetSeries(records, target, V, D, mode) → TargetPoint[]
· buildRawSeries(records, calcKey) 原始值序列
· buildShapeCodes(digits, mainMode, shapeFilters) 3D 形态集合
· getTargetLabel(target) / getTargetShortLabel(target)

概率公式：

· 独立抽样（3D）：p = 1-(V-1)/V^D（独胆）；p = 1/V（定位）
· 超几何（KL8）：p = D/V（单号，20/80=0.25）；组合用 logComb 防溢出

理论遗漏：

· 福彩3D 独胆 = 2.69
· 快乐8 单号 = 3.0

3.2 图表组件（4 种 ECharts + 1 种 Skia）

EChartsFreqKChart（频率K线）：

· Y = diff（累计实出 - 累计理论）
· 无影线蜡烛（custom renderItem）
· 布林通道 MA20±2σ
· 顶部 graphic 悬浮标题：targetLabel + 走势

EChartsOmissionKChart（遗漏K线）：

· 只在开出期画柱（石头剪刀布爬楼梯）
· 高度逻辑：遗漏≤T→红+1；T<M≤2T→青-1；...
· 顶部 graphic 悬浮标题

EChartsOmissionChart（遗漏图，一阶/二阶/双联）：

· mode: 'both' | 'level1' | 'level2'
· 球按"开出事件"画（不是每期都画）
  · 每球 y = 该次开出的遗漏值（距上次开出的期数）
  · 结尾追加"当前期"蓝球 + ? 紫球
  · 从右数第 5/10/20 个球 → 蓝/绿/紫标记（MA 起点）
· MA5/10/20 按"开出序列"计算，起点延伸（前 N-1 位置用现有球平均）
· MAX_SHOW = 1000（超出截断）
· 一阶标题：{targetLabel}  一阶遗漏图（历史最大: 出次: 平均: 理论: 当前:）
· 二阶标题：{targetLabel}  二阶遗漏图（遗漏范围 X-Y）
· 折线延伸到 ? 球位置

SkiaRawChart（振幅图）：

· 每期一球 + 折线 + MA5/10/20 + 总平均线（黑实线）
· highlightValue：只画 value === highlightValue 的球（折线全画）
· 悬浮标题：{targetLabel}  {title}（历史平均:X 当前:Y）

ECharts 离线：

· 源码内联在 lib/echartsSource.ts（1MB），不依赖 CDN

3.3 screens/analyze/index.tsx —— 主页分析（~1900 行）

顶部工具栏（renderTabBar）：

```
[彩种▼] [Tab1] [Tab2] ... | 形态 [组选] [组三] [组六] | [期数] [应用] [刷新] [状态]
```

3D / PL3 Tabs：常用 / 毒胆 / 胆拖 / 定位 / 复式 / 胆合积跨 / 振幅 / 组内随机 / 随机交并 / 分组胆
KL8 Tabs：常用 / 组合 / 复式 / 连号 / 胆拖

各 Tab target：

Tab 说明
常用 3D: 数字/前二/后二；KL8: 数字网格 + 尾号/012路/4区/8区
毒胆 按类型（开奖号/对码/两码合/两码差/两码跨）筛选 1000 号
胆拖 3D: generateDanTuo；有类型行
定位 digit + pos（3D: 百十个；PL5: 万千百十个）
复式 定位（笛卡尔积）/ 不定位（noposNums）
胆合积跨 calcAttr
振幅 buildRawSeries + SkiaRawChart + highlightValue
KL8 组合 kl8Combo（全中/任意/中N个，号码多选最多 20，N 1~10）
KL8 复式 kl8Fushi（玩法 选1~选10）
KL8 连号 类型（连/奇/偶/质/合/0路/1路/2路）+ 长度 2~8
KL8 胆拖 胆（最多9）+ 拖，中N个多选

形态模式（仅 3D/PL3）：

· 不点任何形态 = 默认直选
· 组选（toggle 主模式）：命中判定排序后比较
· 组三/组六（多选 filter）：
  · 未选组选时 = 直选 + 组三/组六过滤（展开成直选排列）
  · 选了组选时 = 组选 + 组三/组六过滤（排序形式）
· 数字来源按 Tab 提取：
  · 毒胆 → dan
  · 胆拖 → dtDan + dtTuo
  · 常用 → commonDigit（单数字）
  · 定位 → posDigit
  · 复式 → multiMode==='pos' ? bai+shi+ge : noposNums
· 不选数字 = 全 0-9
· buildShapeCodes(digits, mainMode, shapeFilters)

同屏功能（毒胆 Tab）：

· 5×2 网格，点小图满屏，顶部可收起

每个 tab 独立期数：

· countMap: Record<TabId, number>（默认 common/dan/... 500，amp 80，kl8* 200）
· 切 Tab 时输入框同步为该 Tab 值

彩种下拉（点「彩种▼」）：

· 福彩3D / 排列3 / 排列5 / 快乐8
· 全量数据（绿）→ 重新拉全量 + 多源校验
· 校验数据（紫）→ 本地 vs 远程对比，标冲突

3.4 lib/lottery/datasource.ts —— 数据源

数据来源：

彩种 主源 备源
fc3d 17500 3d_asc.txt 中彩网 API（最多 100 期）
pl3 17500 pl3_asc.txt 无
pl5 17500 pl5_asc.txt 无
kl8 中彩网 API（2000 期） 无

API：

· loadHistory(gameId, count) → { records, allRecords, source }
· refreshHistory(gameId, count) → 增量刷新（fc3d/kl8 走中彩网 100 期，其他降级全量）
· fetchAllAndVerify(gameId, onProgress) → 备份 + 拉全量 + 双源校验 + 写库
· verifyLocalData(gameId, onProgress) → 只校验本地
· fetchFullHistory(gameId) → 拉全量（含 17500 → 中彩网 → seed 三级 fallback）

缓存：

· AsyncStorage key = lottery_history_v2_{gameId}（TTL 6h，作为 SQLite 的补充）
· SQLite 是主存储（永久保留）

3.5 lib/lottery/db.ts —— SQLite 持久化

表：

· draws(game_id, issue, date, nums, source, verified, updated_at) 主表
· draws_backup 备份表（全量刷前备份，成功删）
· conflicts(game_id, issue, nums_a, nums_b, source_a, source_b, created_at)

关键设计：

· 串行队列 enqueue + withRetry（遇 database is locked 重试 8 次，间隔 150ms）
· 不用事务（withExclusiveTransactionAsync 会 NPE，withTransactionAsync 会锁库）
· 所有写操作走 enqueue 串行化

导出：

· upsertDraws / getAllDraws / countDraws
· backupDraws / restoreBackupDraws / dropBackupDraws
· addConflict / countConflicts

3.6 lib/lottery/games.ts

```ts
FC3D: 福彩3D  (digitCount: 3, digitMin: 0, digitMax: 9)
PL3:  排列3   (同上)
PL5:  排列5   (digitCount: 5, digitMin: 0, digitMax: 9)
KL8:  快乐8   (digitCount: 20, digitMin: 1, digitMax: 80)
```

---

4. 关键决策

决策 原因
图表用 ECharts + WebView Skia 手写效果差
ECharts 内联到 lib/echartsSource.ts 离线 APK 不依赖 CDN
遗漏图球按"开出事件"画 参考图设计：每球代表一次开出
超几何概率（KL8） 20 个号不重复，非独立抽样
SQLite 不用事务 expo-sqlite 新版事务 API 有 bug（锁库/NPE）
串行队列 + 重试 避免 database is locked
形态按钮两组独立 直选/组选（主模式），组三/组六（过滤）
组选统一用排序形式 概率按覆盖率（组三覆盖3，组六覆盖6）
每个 Tab 独立期数 振幅用 80，其他用 500
彩种 Tab 按 gameId 过滤 KL8 专属 Tab 不给 3D 显示
主源优先 + 备源校验 17500 挂时用中彩网，冲突记 conflicts 表

---

5. 已完成 / 未完成

✅ 已完成

· 数据层：17500 + 中彩网 + SQLite 持久化 + 多源校验
· 彩种：福彩3D / 排列3 / 排列5（分析页）/ 快乐8（完整）
· 图表：频率K线 / 遗漏K线 / 遗漏图（一阶/二阶/双联）/ 振幅图
· 分析页：10 + 5 Tab（3D 10个，KL8 5个）
· 形态按钮（仅3D/PL3）：组选/组三/组六 + 多选
· 组号页：3D 完整 + PL5 基础
· 每个 Tab 独立期数 + 状态栏显示
· 顶部悬浮标题（4 张图）
· 振幅 highlightValue
· GitHub Actions 双构建（dev + release）
· 快捷命令

❌ 未完成

· 快乐8 选一~选十回测（下一步）
· 快乐8 组号缩水
· 组内随机 / 随机交并 / 分组胆（占位 Tab）
· MA/EMA/BOLL 参数可配置
· MACD/RSI/KDJ 副图
· CCI/SAR/ADX 副图 + 指标设置弹窗
· 打包 APK 到应用商店

---

6. 常用命令

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

· metro / metro-cache / metro-config / metro-transform-worker / metro-core / metro-resolver @0.83.8（uniwind 需要）
· react-refresh@0.14.2（babel-preset-expo 需要）
· expo-sqlite@~16.0.10（Expo 54 内置版本）
· 这些包建议写进 package.json（否则被 npm 清掉）

---

7. 已知坑

问题 解决
--tunnel 报 ERR_INVALID_ARG_TYPE ngrok 在 Termux 崩溃，改用 LAN 或 cloudflared
Expo Go 连不上 Metro Android 网络隔离，需 Expo Go 模式 + LAN IP（REACT_NATIVE_PACKAGER_HOSTNAME）
database is locked 不用事务 + 串行队列 + withRetry
metro-cache/private/stores/FileStore 找不到 手动 npm install metro-cache@0.83.8
pnpm 在 Termux 报 flock 错误 用 npm 旁路装 --no-save
GitHub push 失败 HTTPS 被墙，用 SSH git@github.com:vauy/lottery-trend-app.git
.bak 文件被提交 已加 *.bak* 到 .gitignore

---

8. 下一步方向

立即做：快乐8 选一~选十回测

· 新增「回测」Tab（仅快乐8）
· 玩法选择（选一~选十）
· 号码多选（最多 10 个）
· 输出：
  · 命中分布柱状图
  · 官方奖金表（选一 4.6 元 ~ 选十 500 万）
  · 期望收益 / 回报率
  · 累计盈亏折线

后续：

· 快乐8 组号缩水
· 组内随机 / 随机交并 / 分组胆
· MA/EMA/BOLL 参数可配置
· MACD/RSI/KDJ 副图
· CCI/SAR/ADX + 指标设置弹窗

---

9. 恢复对话

新对话第一句：

```
读这个文件了解项目：[粘贴本文件内容]

当前进度：快乐8 数据层 + 5 个 Tab 完成，SQLite 持久化完成，
形态按钮完成。git 最新 fc34c72。

现在要做：<你的需求>
```

MDEOF

wc -l PROJECT_INDEX.md
head -20 PROJECT_INDEX.md

```

跑完贴输出。