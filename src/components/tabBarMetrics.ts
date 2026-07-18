import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Height of the TabBar content area (above the safe-area inset), in px.
 * The bar's full height is this plus the bottom inset (see {@link useTabBarTotalHeight}).
 */
export const TAB_BAR_HEIGHT = 64;

/**
 * Total on-screen height of the TabBar = content (64) + the device bottom inset.
 *
 * Two consumers:
 *  - tab screens pad their scroll content by this so it clears the bar
 *    (screens T7–T10 reuse this hook — do not inline the math);
 *  - `ToastHost` positions itself at this + 12 so toasts float just above the bar.
 */
export function useTabBarTotalHeight(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + insets.bottom;
}
