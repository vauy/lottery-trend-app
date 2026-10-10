# Termux + Expo Go 开发指南（安卓真机热更新）

本分支的目标是：**在 Android 手机的 Termux 终端里跑起 Metro，手机用 Expo Go 扫码即可热更新**，无需本机装 Android SDK / Xcode，也不走 `expo prebuild`。

## 为什么能在 Expo Go 上跑

Expo Go 是一个固定运行时的 App，只包含 Expo 官方打包好的一组原生模块。
**自定义原生模块（如 `@shopify/react-native-skia`）在 Expo Go 里不存在，引用即崩溃。**

本分支已做的关键改动：

- 移除了 `@shopify/react-native-skia` 依赖，所有图表改用 **ECharts（WebView 渲染）** 或 **react-native-svg**，二者都是 Expo Go 标准能力。
- 保留的原生依赖（reanimated / gesture-handler / svg / webview / async-storage / sqlite / camera / image-picker / location / screens / navigation）均为 Expo Go 内置。
- 横竖屏：`app.config.ts` 已设 `orientation: "default"`，自动旋转。

> 若之后要引入新的自定义原生模块（如改回 Skia、或加蓝牙等），就必须改用 `expo prebuild` + 开发构建（dev build），那已超出 Expo Go 热更新范围。

## 在 Termux 上启动

```bash
# 1) 安装 Node（仓库要求 Node >= 20；Expo SDK 54 实测 20/22 均可）
pkg update
pkg install nodejs corepack
node -v            # 确认 >= 20

# 2) 进入 client 目录（仓库是 pnpm workspace 单体仓库）
cd lottery-trend-app/client

# 3) 安装依赖（Termux 上推荐 pnpm；若用 npm 请在 client 下 npm install）
corepack enable
pnpm install

# 4) 启动 Metro（不要加 prebuild）
npx expo start
```

终端会打印一个 `exp://192.168.x.x:8081` 的二维码。

## 手机端

1. 在手机上安装 **Expo Go**（Google Play / APK）。
2. 手机与运行 Termux 的设备**同一 Wi-Fi**，用 Expo Go 扫码即可加载。
3. 若不在同一网络，改用隧道模式（Termux 设备无需公网 IP）：

   ```bash
   npx expo start --tunnel
   ```

   此时二维码是 `exp+tunnel://...`，只要手机能联网即可。

## 数据来源

开奖数据在 App 内通过 `lib/lottery/datasource.ts` 直接抓取：

- 福彩3D / 排列三 / 排列五：`https://data.17500.cn/{3d,pl3,pl5}_asc.txt`
- 快乐8 / 3D 增量：中彩网 API

首次打开会自动拉取并写入本地 SQLite/AsyncStorage 缓存（6 小时 TTL），之后离线也能看。
**需要联网**才能首次拉取或刷新。

## 调试技巧

- 手机上**摇晃**打开 Expo Go 调试菜单：Reload、Go to Expo Go、Enable Fast Refresh。
- 改完 `client/` 下任意 TSX，Metro 会热替换，无需重新扫码。
- 若白屏/报错：在 Termux 终端 `Ctrl+C` 停掉 `expo start`，重新 `npx expo start`。
- 清缓存：`npx expo start -c`。

## 打包成独立 APK（不走 Expo Go）

如需脱离 Expo Go 的安装包，仓库已配好 GitHub Actions 云端构建：
见根目录 `.github/workflows/build-apk.yml`（推到仓库即自动出已签名的 `app-release.apk`）。

## 支持范围

| 彩种 | 状态 |
| --- | --- |
| 福彩3D | ✅ 全体 / 各位置分析、图表、组号 |
| 排列三 | ✅ 同上 |
| 排列五 | ✅ 万/千/百/十/个 五位分析、定位复式、组号 |
| 快乐8 | ✅ 选号/组合/复式/连号/胆拖 |

无卡密 / 无授权系统。
