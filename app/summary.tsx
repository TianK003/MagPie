import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '../src/components/Button';
import { Sheet } from '../src/components/Sheet';

/**
 * Placeholder session summary — T8 replaces this with the real recap (earnings,
 * mentions, streak card, receipts). Presented as a `transparentModal` so the
 * (already-updated) tabs show through; the T2 `Sheet` supplies the scrim + the
 * slide-up surface. "Back to the nest" dismisses to Home.
 */
export default function Summary() {
  const router = useRouter();
  const backToNest = () => router.dismissTo('/(tabs)');

  return (
    <Sheet onClose={backToNest}>
      <View className="gap-4 pt-2">
        <Text className="font-mono-medium text-mono uppercase tracking-monowide text-muted-2">
          session complete
        </Text>
        <Button label="Back to the nest" variant="dark" onPress={backToNest} />
      </View>
    </Sheet>
  );
}
