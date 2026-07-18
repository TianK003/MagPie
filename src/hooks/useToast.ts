import { useStore } from '../stores';

/**
 * Returns `showToast(message)` — the single-instance toast trigger.
 * Use for gate feedback: "invalid taps show a toast, never fail silently".
 */
export function useToast() {
  return useStore((s) => s.showToast);
}
