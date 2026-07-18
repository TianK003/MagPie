import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space } from '../theme/tokens';

/**
 * The center REC button that floats over the TabBar's middle gap: a 56px accent
 * circle with a 3px paper ring, half-overlapping above the bar (`top: -28`), with
 * a blue glow. Pressing it pushes the recording session route.
 *
 * Rendered *inside* the TabBar container (so it travels with the bar). The outer
 * View is a full-width, `box-none` layer that only intercepts touches on the
 * circle itself — the rest of the bar stays tappable.
 */
export function RecFab() {
  const router = useRouter();

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start recording session"
        onPress={() => router.push('/session')}
        style={styles.fab}
      >
        <Text className="font-grotesk-bold text-white" style={styles.label}>
          REC
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: -28,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fab: {
    width: space.fab,
    height: space.fab,
    borderRadius: radius.pill,
    backgroundColor: colors.accent.DEFAULT,
    borderWidth: 3,
    borderColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    // Blue glow — iOS shadow*, Android elevation (design spec: 0 4px 14px rgba(51,108,162,.4)).
    shadowColor: colors.accent.DEFAULT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  label: {
    fontSize: 11,
  },
});
