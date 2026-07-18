import { Text } from 'react-native';

import { Screen } from '../../src/components/Screen';

// Placeholder — real 6-digit OTP verification is a later task.
export default function Verify() {
  return (
    <Screen>
      <Text className="font-grotesk-bold text-title tracking-heading text-ink">verify</Text>
    </Screen>
  );
}
