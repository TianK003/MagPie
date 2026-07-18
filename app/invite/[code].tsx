import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';

import { Screen } from '../../src/components/Screen';

/**
 * Placeholder deep-link target (magpie://invite/CODE). A later task stores the
 * code and redeems it post-auth; for now it just echoes the param.
 */
export default function Invite() {
  const { code } = useLocalSearchParams<{ code: string }>();

  return (
    <Screen>
      <Text className="font-grotesk-bold text-title tracking-heading text-ink">invite {code}</Text>
    </Screen>
  );
}
