import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '../../src/components/TabBar';

/**
 * The 4 app tabs. A custom {@link TabBar} draws the cells + the center REC FAB;
 * the default tab bar is replaced entirely via the `tabBar` prop.
 */
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="brands" />
      <Tabs.Screen name="rank" />
      <Tabs.Screen name="wallet" />
    </Tabs>
  );
}
