module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // The react-native-worklets (Reanimated 4) babel plugin is injected
    // automatically by babel-preset-expo when the package is installed.
  };
};
