import { create } from 'zustand';

import { createAuthSlice, type AuthSlice } from './auth';
import { createBrandsSlice, type BrandsSlice } from './brands';
import { createSessionSlice, type SessionSlice } from './session';
import { createSocialSlice, type SocialSlice } from './social';
import { createUiSlice, type UiSlice } from './ui';
import { createWalletSlice, type WalletSlice } from './wallet';

/**
 * The single client store (CLAUDE.md: "single client store, sliced"). The `ui`
 * slice is owned by T2 and left untouched here; T4 adds the remaining five.
 */
export type Store = UiSlice &
  AuthSlice &
  BrandsSlice &
  SessionSlice &
  WalletSlice &
  SocialSlice;

export const useStore = create<Store>()((...a) => ({
  ...createUiSlice(...a),
  ...createAuthSlice(...a),
  ...createBrandsSlice(...a),
  ...createSessionSlice(...a),
  ...createWalletSlice(...a),
  ...createSocialSlice(...a),
}));
