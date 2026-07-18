import type { ExpoConfig } from 'expo/config';

const MIC_USAGE =
  'Magpie listens only while you record a session — you always see the REC indicator.';

const config: ExpoConfig = {
  name: 'magpie',
  slug: 'magpie',
  scheme: 'magpie',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  // New Architecture is always-on in SDK 57 (RN 0.86); the former
  // `newArchEnabled` flag was removed from the config schema.
  icon: './assets/icon.png',
  android: {
    // Edge-to-edge is always-on in SDK 57 (RN 0.86 / targetSdk 35); the former
    // `edgeToEdgeEnabled` flag was removed from the config schema.
    package: 'si.magpie.app',
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    ],
  },
  ios: {
    bundleIdentifier: 'si.magpie.app',
    supportsTablet: false,
    infoPlist: {
      NSMicrophoneUsageDescription: MIC_USAGE,
      UIBackgroundModes: ['audio'],
    },
  },
  plugins: [
    'expo-router',
    [
      'expo-font',
      {
        fonts: [
          './assets/fonts/SpaceGrotesk_400Regular.ttf',
          './assets/fonts/SpaceGrotesk_500Medium.ttf',
          './assets/fonts/SpaceGrotesk_600SemiBold.ttf',
          './assets/fonts/SpaceGrotesk_700Bold.ttf',
          './assets/fonts/IBMPlexMono_400Regular.ttf',
          './assets/fonts/IBMPlexMono_500Medium.ttf',
        ],
      },
    ],
    // Live-PCM mic module. `@siteed/expo-audio-studio` (the name in the plan/design
    // docs) is now a deprecated re-export shim for `@siteed/audio-studio`; the native
    // module + this config plugin live in `@siteed/audio-studio`, so we reference it
    // directly. Android foreground-service mic (FOREGROUND_SERVICE +
    // FOREGROUND_SERVICE_MICROPHONE + WAKE_LOCK + microphone service) comes from
    // enableBackgroundAudio; POST_NOTIFICATIONS from enableNotifications; iOS
    // UIBackgroundModes 'audio' from iosBackgroundModes.useAudio. Phone-state and
    // device-detection permissions are disabled — not needed by Magpie.
    // NOTE: this plugin version exposes no notification title/body options; the
    // foreground-service notification strings ('magpie is listening' /
    // 'recording — tap to return') are set at runtime in the recording-session task
    // when calling startRecording, not at config time.
    [
      '@siteed/audio-studio',
      {
        enablePhoneStateHandling: false,
        enableNotifications: true,
        enableBackgroundAudio: true,
        enableDeviceDetection: false,
        iosBackgroundModes: {
          useAudio: true,
        },
        iosConfig: {
          microphoneUsageDescription: MIC_USAGE,
        },
      },
    ],
    // Documented fallback if @siteed/audio-studio ever fails to build on this SDK:
    // swap the block above for react-native-audio-api (Software Mansion).
    // [
    //   'react-native-audio-api',
    //   {
    //     androidForegroundService: true,
    //     androidFSTypes: ['microphone'],
    //   },
    // ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
