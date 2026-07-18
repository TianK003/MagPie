import { Text, View } from 'react-native';

import { Screen } from '../../src/components/Screen';
import { useTabBarTotalHeight } from '../../src/components/tabBarMetrics';

// Placeholder — Wallet (balance/ledger) is built by a later task.
export default function Wallet() {
  const bottom = useTabBarTotalHeight();

  return (
    <Screen>
      <View className="flex-1" style={{ paddingBottom: bottom }}>
        <Text className="font-grotesk-bold text-title tracking-heading text-ink">wallet</Text>
      </View>
    </Screen>
  );
}
