import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { Sheet } from '../src/components/Sheet';
import { Wordmark } from '../src/components/Wordmark';
import { useToast } from '../src/hooks/useToast';

// TEMPORARY dev gallery for T2 — exercises the fonts + primitives. T3 replaces
// this route with the real Landing screen. Kept self-contained on purpose.
export default function Index() {
  const showToast = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-6 py-6" showsVerticalScrollIndicator={false}>
        <View className="gap-2">
          <Wordmark />
          <Wordmark size={19} />
        </View>

        <View className="gap-1">
          <Text className="font-mono-medium text-mono uppercase tracking-monowide text-muted-2">
            type scale
          </Text>
          <Text className="font-grotesk-bold text-hero tracking-heading-hero text-ink">42 hero</Text>
          <Text className="font-grotesk-bold text-title-lg tracking-heading text-ink">28 title</Text>
          <Text className="font-grotesk-semibold text-title tracking-heading text-ink">24 title</Text>
          <Text className="font-grotesk text-body text-ink">15 body — space grotesk</Text>
          <Text className="font-mono text-sec text-muted">12.5 secondary — plex mono</Text>
          <Text className="font-mono text-mono-xs text-muted-3">9.5 mono label</Text>
        </View>

        <View className="gap-3">
          <Text className="font-mono-medium text-mono uppercase tracking-monowide text-muted-2">
            buttons
          </Text>
          <Button label="dark" variant="dark" onPress={() => showToast('dark button pressed')} />
          <Button label="outline" variant="outline" onPress={() => showToast('outline button pressed')} />
          <Button
            label="gated"
            variant="disabled"
            gated
            onGatedPress={() => showToast('Pick at least 3 brands')}
          />
        </View>

        <View className="gap-3">
          <Button label="show toast" variant="dark" onPress={() => showToast('hello from the nest')} />
          <Button label="open sheet" variant="outline" onPress={() => setSheetOpen(true)} />
        </View>
      </ScrollView>

      {sheetOpen ? (
        <Sheet onClose={() => setSheetOpen(false)}>
          <View className="gap-4 pt-2">
            <Text className="font-grotesk-bold text-title tracking-heading text-ink">a sheet</Text>
            <Text className="font-grotesk text-body text-muted">
              slides up over a 45% ink scrim. tap outside or the button to close.
            </Text>
            <Button label="close" variant="dark" onPress={() => setSheetOpen(false)} />
          </View>
        </Sheet>
      ) : null}
    </Screen>
  );
}
