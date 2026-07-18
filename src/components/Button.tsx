import { Pressable, Text } from 'react-native';

import { space } from '../theme/tokens';

export type ButtonVariant = 'dark' | 'outline' | 'disabled';

interface ButtonProps {
  label: string;
  variant?: ButtonVariant;
  onPress?: () => void;
  /**
   * Hard-disable: renders disabled styling AND makes the button inert (no
   * press). Rare — prefer `gated` when an invalid tap should explain itself.
   */
  disabled?: boolean;
  /**
   * Gated: the button is STYLED disabled but stays pressable so a validation
   * toast can fire ("invalid taps show a toast, never fail silently"). Pass
   * `variant="disabled"` for the grey look and handle the tap in `onGatedPress`.
   */
  gated?: boolean;
  onGatedPress?: () => void;
  className?: string;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  dark: 'bg-ink',
  outline: 'border border-line-strong bg-paper',
  disabled: 'bg-disabled-bg',
};

const LABEL_CLASS: Record<ButtonVariant, string> = {
  dark: 'text-white',
  outline: 'text-ink',
  disabled: 'text-disabled-text',
};

export function Button({
  label,
  variant = 'dark',
  onPress,
  disabled = false,
  gated = false,
  onGatedPress,
  className,
}: ButtonProps) {
  const inert = disabled && !gated;
  const handlePress = gated ? onGatedPress : onPress;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inert }}
      disabled={inert}
      onPress={handlePress}
      style={{ minHeight: space.btn }}
      className={`items-center justify-center rounded-card px-4 ${VARIANT_CLASS[variant]} ${className ?? ''}`}
    >
      <Text className={`font-grotesk-bold text-btn ${LABEL_CLASS[variant]}`}>{label}</Text>
    </Pressable>
  );
}
