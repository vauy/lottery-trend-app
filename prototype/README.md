# 手机端 UI 原型

本目录存放基于仓库功能制作的**网页版 UI 原型**，用于设计与交互验证，**不参与 App 的原生构建**（放在仓库内便于留存与协作）。

## 文件

| 文件 | 说明 |
|---|---|
| `index.html` / `app.js` / `styles.css` / `data.js` | 彩票趋势分析 App 的响应式原型，支持**竖屏 / 横屏**。移植了 `client/lib/lottery/` 的核心算法（遗漏 / 频率 / 振幅、1000 注缩水、胆拖组号），福彩3D 数据取自仓库 `seed_fc3d.json`（其余彩种为演示用合成数据）。图表为 Canvas 手绘，对应代码中的 4 个图表组件。 |
| `彩票选码-手机版.html` | 选码出图工具的手机端单文件 UI，无外部依赖，双击即可打开。 |

## 本地预览

```bash
cd prototype
python3 -m http.server 8137
# 浏览器打开 http://localhost:8137/index.html
```

用 DevTools 的设备模式（或手机）切换横竖屏，可查看两套布局：

- **竖屏**：顶部栏 + 横向页签 + 单列内容 + 底部 Tab
- **横屏**：左侧导航 + 右侧双列图表的 master-detail 布局

> 注意：原型是 HTML，非 React Native 代码，仅用于 UI 验证；App 本体仍以 `client/` 下的 Expo 工程为准。
