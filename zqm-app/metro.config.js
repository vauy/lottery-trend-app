// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 让 Metro 认识项目里的静态资源类型
config.resolver.assetExts = Array.from(
  new Set([...(config.resolver.assetExts || []), 'db', 'sqlite']),
);

// 终端开发时偶尔会残留缓存导致 "Unable to resolve module"，
// 这里放宽 symlink 解析以兼容 Termux 的非标准目录结构。
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
