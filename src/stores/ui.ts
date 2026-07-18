import type { StateCreator } from 'zustand';

import { duration } from '../theme/tokens';
import type { Store } from './index';

export interface Toast {
  id: number;
  message: string;
}

export interface UiSlice {
  /** The single active toast, or undefined when none is showing. */
  toast?: Toast;
  /**
   * Show a toast. Single-instance: a new toast immediately replaces any
   * current one and resets the auto-dismiss timer.
   */
  showToast: (message: string) => void;
}

export const createUiSlice: StateCreator<Store, [], [], UiSlice> = (set) => {
  // Closure state — lives for the store's lifetime (store is created once).
  let dismissTimer: ReturnType<typeof setTimeout> | undefined;
  let nextId = 1;

  return {
    toast: undefined,
    showToast: (message: string) => {
      if (dismissTimer) {
        clearTimeout(dismissTimer);
      }
      set({ toast: { id: nextId++, message } });
      dismissTimer = setTimeout(() => {
        set({ toast: undefined });
        dismissTimer = undefined;
      }, duration.toastAuto);
    },
  };
};
