import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';

/**
 * Placeholder recording overlay — T8 replaces this with the real session (audio
 * pipeline, waveform, live counter, receipts). For now it only exercises the
 * modal flow: end → summary, plus a way back out.
 */
export default function Session() {
  const router = useRouter();

  return (
    <Screen>
      <View className="flex-1 justify-center gap-4">
        <Text className="font-grotesk-bold text-title tracking-heading text-ink">session</Text>
        <Button label="■ End session" variant="dark" onPress={() => router.replace('/summary')} />
        <Button label="close" variant="outline" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
