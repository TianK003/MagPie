import { Text } from 'react-native';

import { Screen } from '../src/components/Screen';

// Placeholder — the real Settings screen (account/privacy) is a later task.
export default function Settings() {
  return (
    <Screen>
      <Text className="font-grotesk-bold text-title tracking-heading text-ink">settings</Text>
    </Screen>
  );
}
