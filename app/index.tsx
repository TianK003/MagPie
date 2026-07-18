import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { Wordmark } from '../src/components/Wordmark';

/**
 * TEMPORARY entry screen — replaces T2's dev gallery. Just the wordmark and a
 * button into the app so the shell is walkable end to end. T7 builds the real
 * Landing here; T13 adds the auth/onboarding redirect guard.
 */
export default function Index() {
  const router = useRouter();

  return (
    <Screen>
      <View className="flex-1 justify-center gap-6">
        <Wordmark />
        <Button label="enter the nest →" variant="dark" onPress={() => router.replace('/(tabs)')} />
      </View>
    </Screen>
  );
}
