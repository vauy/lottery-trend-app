# Termux + Expo Go 开发指南

在安卓手机上直接用 Termux 起开发服务器，配合 Expo Go 扫码热更新——不需要电脑。

---

## 0. 为什么本项目能在 Expo Go 里跑

**Expo Go 是一个「固定运行时」**：它是一个预编译好的 App，里面只打包了 Expo 官方选定的那批原生模块。
任何**自定义原生模块**都不在其中，一旦代码里引用，App 启动时会直接崩溃（红屏 / 闪退）。

因此本项目做了两条硬性约束：

| 约束 | 说明 |
|------|------|
| **不引用任何自定义原生模块** | 已彻底移除 Skia 等需要 dev client 的绘图库 |
| **图表走 WebView + ECharts** | ECharts 是纯 JS，内联进 HTML 交给系统 WebView 渲染，零原生依赖 |

依赖里只保留了 Expo Go 内置的官方模块：`expo-router`、`react-native-webview`、
`@react-native-async-storage/async-storage`、`expo-clipboard`、`expo-status-bar` 等。

> 判断标准：只要 `npx expo-doctor` 里出现 "not available in Expo Go"，就不能直接用。

---

## 1. 安装 Termux

从 **F-Droid** 安装 [Termux](https://f-droid.org/packages/com.termux/) 与 **Termux:API**（可选）。
Google Play 上的 Termux 已停止更新，不要用。

首次进入后执行：

```bash
pkg upgrade -y
pkg install -y git nodejs-lts
node -v   # 需 >= 20
```

如果 `nodejs-lts` 版本太旧，可改装：

```bash
pkg install -y nodejs
```

---

## 2. 获取代码

本项目位于仓库的 **`zqm-app/` 子目录**、分支 **`feat/fresh-expo-go`**
（仓库根目录还保留着旧版 `client/` `server/`，与本 App 无关）。

### 2.1 首次获取（推荐：只拉该分支最新一次提交，最快最省流量）

```bash
cd ~
git clone --depth 1 -b feat/fresh-expo-go https://github.com/vauy/lottery-trend-app.git
cd lottery-trend-app/zqm-app
```

### 2.2 更省流量：只要 `zqm-app/` 这一个目录

```bash
cd ~
git clone --depth 1 --filter=blob:none --sparse -b feat/fresh-expo-go \
  https://github.com/vauy/lottery-trend-app.git
cd lottery-trend-app
git sparse-checkout set zqm-app
cd zqm-app
```

### 2.3 已有仓库，只想拉最新改动

```bash
cd ~/lottery-trend-app
git fetch --depth 1 origin feat/fresh-expo-go
git reset --hard origin/feat/fresh-expo-go
cd zqm-app
npm install        # package.json 有变动时才必须；无变动时幂等，可放心执行
```

> 浅克隆（`--depth 1`）后用 `git pull` 偶尔会因历史不全报错，
> 用上面的 `fetch + reset --hard` 组合最稳。

### 2.4 拉完代码后

新增/删除了文件（例如新增「选胆」页签）时，**必须重启 Metro** 才能生效：
先在运行中的终端按 `Ctrl+C` 停掉，再重新启动；遇到界面异常时加 `--clear`：

```bash
npm run clear      # expo start --clear
```

若网络受限导致 `git clone` 失败，可在手机浏览器打开仓库页面下载 ZIP，
再用 `termux-setup-storage` 授权后从 `~/storage/downloads` 拷进来。

---

## 3. 安装依赖

Termux 的文件系统对符号链接支持不稳定，项目根目录已放好 `.npmrc`（`node-linker=hoisted`）。

```bash
npm install
```

若安装极慢或中断，换国内源：

```bash
npm config set registry https://registry.npmmirror.com
npm install
```

> 不要用 `pnpm` 的默认 `symlinked` 模式，Termux 下容易出问题；
> 如坚持用 pnpm，请先执行 `pnpm config set node-linker hoisted`。

---

## 4. 启动开发服务器

```bash
npm start                 # 默认
npm run tunnel            # 推荐：expo start --tunnel（跨网络也能连）
npm run lan               # 同一 Wi-Fi 下用
npm run localhost         # 仅手机本机（Termux 与 Expo Go 同机时最快）
```

**在 Termux 里直接跑、Expo Go 也装在同一台手机上时，用 `npm run localhost` 最稳**，
不依赖任何局域网或外网穿透。

启动后终端会出现二维码；Expo Go 里扫码即可。二维码扫不了就手动输入下面那行 `exp://...` 地址。

---

## 5. 常用调试

| 场景 | 做法 |
|------|------|
| 代码改了没生效 | 在 Expo Go 里下拉触发手动刷新；或在终端按 `r` |
| 缓存导致奇怪报错 | `npm run clear`（`expo start --clear`） |
| 依赖装崩了 | `rm -rf node_modules && npm install` |
| 看运行时日志 | 终端里直接输出；或 Expo Go 摇一摇 → Debug |
| 端口被占用 | `expo start --port 8082` |
| 类型检查 | `npm run typecheck` |

---

## 6. 数据与网络

| 项 | 值 |
|----|-----|
| 主数据源 | `https://data.17500.cn/{3d,pl3,pl5,kl8}_asc.txt` |
| 备用源 | `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice` |
| 兜底 | 内置福彩3D 种子（120 期） |
| 缓存有效期 | 6 小时 |
| 缓存位置 | AsyncStorage（键前缀 `zqm.hist.v1.`） |

首次进入某个彩种会拉取全量历史（快乐8 约 1MB），之后走本地缓存。
可在「设置」页查看每个彩种的缓存期数与更新时间，或强制刷新。

---

## 7. 打包正式 APK（可选）

Termux 里**不能**直接跑 Gradle 构建 Android（缺少 Android SDK / NDK 工具链）。
需要正式安装包时，用 GitHub Actions 云端构建，或在一台装了 Android Studio 的电脑上执行：

```bash
npx expo prebuild
cd android && ./gradlew assembleRelease
```
