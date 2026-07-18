import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { duration } from '../theme/tokens';

interface ToastProps {
  message: string;
}

/**
 * A single dark toast pill. Slides up + fades in over 250ms on mount.
 * Positioning, single-instance behaviour and auto-dismiss are owned by
 * `ToastHost` + the ui store slice; this component only renders + animates in.
 */
export function Toast({ message }: ToastProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: duration.toastIn });
  }, [progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 12 }],
  }));

  return (
    <Animated.View style={style}>
      <View className="rounded-pill bg-ink px-4 py-3">
        <Text className="font-grotesk-medium text-sec text-white" numberOfLines={2}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}
