import { ExpoConfig, ConfigContext } from 'expo/config';

const APP_NAME = '臻奇妙趋势分析';

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    name: APP_NAME,
    slug: 'zqm-trend-mobile',
    version: '1.0.0',
    // default = 跟随系统自动横竖屏切换（分析图表需要横屏大视野）
    orientation: 'default',
    icon: './assets/images/icon.png',
    scheme: 'zqmtrend',
    userInterfaceStyle: 'dark',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.zqm.trend',
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#0B110D',
      },
      package: 'com.zqm.trend',
    },
    web: {
      bundler: 'metro',
      output: 'single',
      favicon: './assets/images/favicon.png',
    },
    plugins: ['expo-router'],
    experiments: {
      typedRoutes: false,
    },
  };
};
