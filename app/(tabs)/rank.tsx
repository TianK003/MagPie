import { Text, View } from 'react-native';

import { Screen } from '../../src/components/Screen';
import { useTabBarTotalHeight } from '../../src/components/tabBarMetrics';

// Placeholder — Rank (leaderboard/streak/badges) is built by a later task.
export default function Rank() {
  const bottom = useTabBarTotalHeight();

  return (
    <Screen>
      <View className="flex-1" style={{ paddingBottom: bottom }}>
        <Text className="font-grotesk-bold text-title tracking-heading text-ink">rank</Text>
      </View>
    </Screen>
  );
}
