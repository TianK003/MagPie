import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { duration, scrim } from '../theme/tokens';

interface SheetProps {
  onClose: () => void;
  children: ReactNode;
}

/**
 * Generic bottom-sheet chrome: a 45% ink scrim + a paper surface with 22px top
 * radii that self-animates translateY 40→0 + fade over 300ms on mount. Tapping
 * the scrim calls `onClose`. Consumers (e.g. the session summary) supply the
 * content.
 */
export function Sheet({ onClose, children }: SheetProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: duration.sheetIn });
  }, [progress]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 40 }],
  }));

  return (
    <View className="absolute inset-0 justify-end">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: scrim }, scrimStyle]}>
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close sheet" />
      </Animated.View>
      <Animated.View style={sheetStyle}>
        <View className="rounded-t-sheet bg-paper px-screen pb-8 pt-3">{children}</View>
      </Animated.View>
    </View>
  );
}
