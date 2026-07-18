import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '../stores';
import { Toast } from './Toast';

/**
 * Renders the single active toast, bottom-centered above the tab bar.
 *
 * Mounted in `app/_layout.tsx` as a SIBLING AFTER the router `<Stack>` so it
 * overlays every screen (session/summary deliberately avoid native modal
 * presentation, so this sibling always wins — see docs/design/mobile.md §4).
 * `key={toast.id}` remounts on each new toast so the entrance animation
 * re-fires when one toast replaces another.
 */
export function ToastHost() {
  const toast = useStore((s) => s.toast);
  const insets = useSafeAreaInsets();

  if (!toast) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      className="absolute inset-x-0 items-center px-screen"
      style={{ bottom: insets.bottom + 76 }}
    >
      <Toast key={toast.id} message={toast.message} />
    </View>
  );
}
