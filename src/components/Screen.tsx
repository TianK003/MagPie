import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenProps {
  children: ReactNode;
  className?: string;
}

/**
 * SafeArea wrapper: top safe-area inset + horizontal `screen` (20px) padding on
 * a paper background. Every screen wraps in this.
 */
export function Screen({ children, className }: ScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className={`flex-1 bg-paper px-screen ${className ?? ''}`}
      style={{ paddingTop: insets.top }}
    >
      {children}
    </View>
  );
}
