// Official Reanimated jest mock — replaces native worklet calls with JS no-ops
// so components using Reanimated can render in tests (used by later tasks).
jest.mock('react-native-reanimated', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native-reanimated/mock')
);

// Official AsyncStorage jest mock — in-memory implementation.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Official safe-area-context jest mock — provides useSafeAreaInsets/Provider
// with zeroed insets so components wrapped in <Screen> (top inset) and the
// <ToastHost> (bottom inset) render in tests without a real provider tree.
jest.mock('react-native-safe-area-context', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native-safe-area-context/jest/mock').default
);
