/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest-setup.ts'],
  // Reanimated 4 splits its worklet runtime into react-native-worklets, whose
  // NativeWorklets.native.ts throws under jest (no native module). This
  // vendor-provided resolver strips `.native` extensions for worklets modules
  // so the official Reanimated mock resolves its jest-safe variant instead —
  // required for ANY Reanimated component (Toast/Sheet/…) to render in tests.
  resolver: '<rootDir>/node_modules/react-native-worklets/jest/resolver.js',
  // Extends jest-expo's default transformIgnorePatterns (bare-prefix allow-list)
  // with the extra packages this project pulls in that ship untranspiled
  // ESM/Flow/TS and therefore must be run through babel-jest. The 2nd/3rd
  // entries preserve jest-expo's exclusions for babel plugins/presets.
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|nativewind|react-native-css-interop|react-native-reanimated|react-native-worklets|@supabase|@siteed|react-native-url-polyfill|base64-arraybuffer))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};
