import { create } from 'zustand';

import { createUiSlice, type UiSlice } from './ui';

/**
 * The single client store (CLAUDE.md: "single client store, sliced").
 *
 * Only the `ui` slice exists today. T4 widens this union and the compose
 * below with the remaining slices — no reshaping needed:
 *
 *   export type Store = UiSlice & AuthSlice & BrandsSlice &
 *     SessionSlice & WalletSlice & SocialSlice;
 *
 *   export const useStore = create<Store>()((...a) => ({
 *     ...createUiSlice(...a),
 *     ...createAuthSlice(...a),
 *     ...
 *   }));
 */
export type Store = UiSlice;

export const useStore = create<Store>()((...a) => ({
  ...createUiSlice(...a),
}));
