const fs = require('node:fs');
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { createProxyMiddleware } = require('http-proxy-middleware');
const connect = require('connect');
const { withUniwindConfig } = require('uniwind/metro');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');
const config = getDefaultConfig(projectRoot);

// 安全地获取 Expo 的默认排除列表
const existingBlockList = [].concat(config.resolver.blockList || []);

config.resolver.blockList = [
  ...existingBlockList,
  /.*\/\.expo\/.*/, // Expo 的缓存和构建产物目录

  // 1. 原生代码 (Java/C++/Objective-C)
  /.*\/react-native\/ReactAndroid\/.*/,
  /.*\/react-native\/ReactCommon\/.*/,

  // 2. 纯开发和调试工具
  // 这些工具只在开发电脑上运行，不会被打包到应用中
  /.*\/@typescript-eslint\/eslint-plugin\/.*/,

  // 3. 构建时数据
  // 这个数据库只在打包过程中使用，应用运行时不需要
  /.*\/caniuse-lite\/data\/.*/,

  // 4. 通用规则
  /.*\/__tests__\/.*/, // 排除所有测试目录
  /.*\.git\/.*/, // 排除 Git 目录

  // 5. pnpm 临时目录（避免 ENOENT 错误）
  /.*node_modules\/\.pnpm\/.*_tmp_\d+.*/,

  // 6. Termux 环境：排除原生模块的 Android/iOS/Windows 源码（避免 inotify 超限）
  /.*node_modules\/.*\/android\/src\/.*/,
  /.*node_modules\/.*\/android\/build\.gradle.*/,
  /.*node_modules\/.*\/ios\/.*/,
  /.*node_modules\/.*\/windows\/.*/,
  /.*node_modules\/.*\/macos\/.*/,
  /.*node_modules\/.*\/cpp\/.*/,
  /.*node_modules\/.*\/cxx\/.*/,
];

// 软链兼容：解析真实 node_modules 路径，并把 workspaceRoot 作为 server root
const realNodeModulesPaths = [
  path.join(projectRoot, 'node_modules'),
  path.join(workspaceRoot, 'node_modules'),
]
  .filter((directory) => fs.existsSync(directory))
  .map((directory) => fs.realpathSync(directory));

const externalNodeModulesPaths = realNodeModulesPaths.filter((directory) => {
  const relativePath = path.relative(workspaceRoot, directory);
  return relativePath === '..'
    || relativePath.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativePath);
});

if (externalNodeModulesPaths.length > 0) {
  config.watchFolders = [
    ...new Set([
      ...(config.watchFolders || []),
      workspaceRoot,
      ...externalNodeModulesPaths,
    ]),
  ];
  config.resolver = {
    ...config.resolver,
    nodeModulesPaths: [
      ...new Set([
        ...(config.resolver.nodeModulesPaths || []),
        ...realNodeModulesPaths,
      ]),
    ],
  };
  config.server = {
    ...config.server,
    unstable_serverRoot: workspaceRoot,
  };
}

const DEFAULT_BACKEND_PORT = '9091';
const BACKEND_PORT = process.env.SERVER_PORT || DEFAULT_BACKEND_PORT;
const BACKEND_TARGET = `http://localhost:${BACKEND_PORT}`;

const apiProxy = createProxyMiddleware({
  target: BACKEND_TARGET,
  changeOrigin: true,
  logLevel: 'debug',
  proxyTimeout: 86400000,
  onProxyReq: (proxyReq, req) => {
    const accept = req.headers.accept || '';
    if (accept.includes('text/event-stream')) {
      proxyReq.setHeader('accept-encoding', 'identity');
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    const contentType = proxyRes.headers['content-type'] || '';
    if (contentType.includes('text/event-stream') || contentType.includes('application/stream')) {
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') {
        try { res.flushHeaders(); } catch {}
      }
    }
  },
});

const streamProxy = createProxyMiddleware({
  target: BACKEND_TARGET,
  changeOrigin: true,
  logLevel: 'debug',
  ws: true,
  proxyTimeout: 86400000,
  onProxyReq: (proxyReq, req) => {
    const upgrade = req.headers.upgrade;
    const accept = req.headers.accept || '';
    if (upgrade && upgrade.toLowerCase() === 'websocket') {
      proxyReq.setHeader('Connection', 'upgrade');
      proxyReq.setHeader('Upgrade', req.headers.upgrade);
    } else if (accept.includes('text/event-stream')) {
      proxyReq.setHeader('accept-encoding', 'identity');
      proxyReq.setHeader('Connection', 'keep-alive');
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    const contentType = proxyRes.headers['content-type'] || '';
    if (contentType.includes('text/event-stream') || contentType.includes('application/stream')) {
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') {
        try { res.flushHeaders(); } catch {}
      }
    }
  },
});

const shouldProxyToBackend = (url) => {
  if (!url) return false;
  if (/^\/api\/v\d+\//.test(url)) {
    return true;
  }
  return false;
};

const isWebSocketRequest = (req) =>
  !!(req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket');
const isSSERequest = (req) => {
  const accept = req.headers.accept || '';
  return accept.includes('text/event-stream');
};

config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware, metroServer) => {
    return connect()
      .use((req, res, next) => {
        if (shouldProxyToBackend(req.url)) {
          console.log(`[Metro Proxy] Forwarding ${req.method} ${req.url}`);

          if (isWebSocketRequest(req) || isSSERequest(req)) {
            return streamProxy(req, res, next);
          }
          return apiProxy(req, res, next);
        }
        next();
      })
      .use(metroMiddleware);
  },
};

module.exports = withUniwindConfig(config, {
  // relative path to your global.css file
  cssEntryFile: './global.css',
  // (optional) path where we gonna auto-generate typings
  // defaults to project's root
  dtsFile: './uniwind-types.d.ts'
});