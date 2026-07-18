import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, Text, View } from 'react-native';

import { borderWidth, colors, space } from '../theme/tokens';
import { RecFab } from './RecFab';
import { TAB_BAR_HEIGHT } from './tabBarMetrics';

type Shape = 'square' | 'circle';

/** Per-route presentation: fixed label + icon shape (square = pages, circle = social). */
const TAB_META: Record<string, { label: string; shape: Shape }> = {
  index: { label: 'Home', shape: 'square' },
  brands: { label: 'Brands', shape: 'square' },
  rank: { label: 'Rank', shape: 'circle' },
  wallet: { label: 'Wallet', shape: 'square' },
};

/**
 * Visual order of cells. `GAP` is the fixed-width empty slot the RecFab floats
 * over. Placing cells by name (not by `state.routes` order) keeps the layout
 * stable regardless of screen declaration order.
 */
const LAYOUT: ('index' | 'brands' | 'GAP' | 'rank' | 'wallet')[] = [
  'index',
  'brands',
  'GAP',
  'rank',
  'wallet',
];

const CENTER_GAP = 72;

/** A geometric 15px tab glyph — square for pages, circle for social (Rank). */
function TabIcon({ shape, active }: { shape: Shape; active: boolean }) {
  return (
    <View
      style={{
        width: 15,
        height: 15,
        borderWidth,
        borderRadius: shape === 'circle' ? 999 : 4,
        borderColor: active ? colors.ink : colors.muted[2],
        backgroundColor: active ? colors.ink : 'transparent',
      }}
    />
  );
}

/**
 * Custom bottom tab bar for the `(tabs)` group. 5 cells — Home, Brands, a fixed
 * center gap (with the floating {@link RecFab}), Rank, Wallet — on a paper bar
 * with a 1.5px top border. Height is 64 + the bottom safe-area inset. Active
 * cells render ink + filled glyph + 700 label; inactive render muted.
 */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  return (
    <View
      className="flex-row border-t border-line-strong bg-paper"
      style={{ height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }}
    >
      {LAYOUT.map((slot) => {
        if (slot === 'GAP') {
          return <View key="GAP" testID="tab-center-gap" style={{ width: CENTER_GAP }} />;
        }

        const meta = TAB_META[slot];
        const routeIndex = state.routes.findIndex((r) => r.name === slot);
        const route = state.routes[routeIndex];
        // A declared LAYOUT slot with no matching screen would be a config bug;
        // skip defensively rather than crash the whole bar.
        if (!route) {
          return null;
        }
        const isFocused = state.index === routeIndex;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={meta.label}
            onPress={onPress}
            className="flex-1 items-center justify-center"
            style={{ minHeight: space.tap, gap: 4 }}
          >
            <TabIcon shape={meta.shape} active={isFocused} />
            <Text
              className={isFocused ? 'font-grotesk-bold text-ink' : 'font-grotesk-medium text-muted-2'}
              style={{ fontSize: 10.5 }}
            >
              {meta.label}
            </Text>
          </Pressable>
        );
      })}

      <RecFab />
    </View>
  );
}
