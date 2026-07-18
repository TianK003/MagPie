import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/**
 * Onboarding is forward-only (design spec §2). Gestures are disabled and the
 * Android hardware back button is swallowed so a half-completed onboarding can't
 * be reversed into an inconsistent state. Steps advance only via their CTAs.
 */
export default function OnboardingLayout() {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />;
}
