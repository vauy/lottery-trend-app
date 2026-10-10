module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    plugins: [
      [
        'module-resolver',
        {
          root: ['.'],
          alias: {
            '@': './src',
          },
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
        },
      ],
    ],
  };
};
