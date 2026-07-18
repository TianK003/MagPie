import { Text, View } from 'react-native';

import { Screen } from '../../src/components/Screen';
import { useTabBarTotalHeight } from '../../src/components/tabBarMetrics';

// Placeholder — Home ("the nest") is built by T7. Bottom padding clears the tab bar.
export default function Home() {
  const bottom = useTabBarTotalHeight();

  return (
    <Screen>
      <View className="flex-1" style={{ paddingBottom: bottom }}>
        <Text className="font-grotesk-bold text-title tracking-heading text-ink">home</Text>
      </View>
    </Screen>
  );
}
