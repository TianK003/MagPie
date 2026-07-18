// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// whisper.rn: allow ggml model binaries to resolve as assets, and map
// `buffer` (pulled in by whisper.rn's WAV writer via safe-buffer -> Node core
// 'buffer') to the JS polyfill so Metro can resolve it in React Native.
config.resolver.assetExts.push('bin');
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  buffer: require.resolve('buffer/'),
};

// supabase-js 2.110.x needs no Metro resolver shims: it ships a `react-native`
// export condition (resolves to the CJS build), pulls in no Node core modules
// statically, and @supabase/realtime-js selects the runtime's global WebSocket
// (present in React Native) rather than `require('ws')`. The only runtime
// requirement is importing `react-native-url-polyfill/auto` before createClient
// (done in the smoke test and, later, in src/lib/supabase).

module.exports = withNativeWind(config, { input: './global.css' });
