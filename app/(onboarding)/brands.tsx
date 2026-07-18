import { Text } from 'react-native';

import { Screen } from '../../src/components/Screen';

// Placeholder — step 2 "Pick your brands" (≥3 gate) is a later task.
export default function OnboardingBrands() {
  return (
    <Screen>
      <Text className="font-grotesk-bold text-title tracking-heading text-ink">pick brands</Text>
    </Screen>
  );
}
