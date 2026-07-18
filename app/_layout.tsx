import '../global.css';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastHost } from '../src/components/ToastHost';

// Keep the splash up until the custom fonts are ready — RN does not synthesize
// weights, so each weight is its own family and all must load before first paint.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  useEffect(() => {
    if (loaded) {
      void SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
        {/* Recording overlay: NOT a native modal — a slide-up card that keeps the
            sibling ToastHost on top and audio teardown deterministic (mobile.md §4). */}
        <Stack.Screen
          name="session"
          options={{ presentation: 'card', animation: 'slide_from_bottom', gestureEnabled: false }}
        />
        {/* Summary: transparent over the (already-updated) tabs; the Sheet animates itself. */}
        <Stack.Screen name="summary" options={{ presentation: 'transparentModal', animation: 'none' }} />
        <Stack.Screen name="invite/[code]" />
      </Stack>
      {/* Sibling AFTER <Stack> so it overlays every screen — see ToastHost / mobile.md §4. */}
      <ToastHost />
    </SafeAreaProvider>
  );
}
