import { Text } from 'react-native';

interface WordmarkProps {
  /** Font size in px. 21 (default) on landing/onboarding, 19 for header variant. */
  size?: number;
}

/**
 * The magpie wordmark: "magpie" in 700 grotesk with an accent-blue period.
 */
export function Wordmark({ size = 21 }: WordmarkProps) {
  return (
    <Text
      className="font-grotesk-bold tracking-heading text-ink"
      style={{ fontSize: size }}
      accessibilityRole="header"
    >
      magpie<Text className="text-accent">.</Text>
    </Text>
  );
}
