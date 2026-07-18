import type { StateCreator } from 'zustand';

import type { Profile } from '../types/domain';
import type { Store } from './index';

export type AuthStatus = 'loading' | 'signedOut' | 'needsOnboarding' | 'ready';

export interface AuthSlice {
  /** Route-guard truth (mobile.md §1.4). Server-derived; client caches. */
  authStatus: AuthStatus;
  /** Profile mirror (streak/level/inviteCode). Server is truth; refetch on focus. */
  profile?: Profile;
  setAuthStatus: (status: AuthStatus) => void;
  setProfile: (profile: Profile | undefined) => void;
  /** Clear auth on sign-out. */
  signOutReset: () => void;
}

export const createAuthSlice: StateCreator<Store, [], [], AuthSlice> = (set) => ({
  authStatus: 'loading',
  profile: undefined,
  setAuthStatus: (authStatus) => set({ authStatus }),
  setProfile: (profile) => set({ profile }),
  signOutReset: () => set({ authStatus: 'signedOut', profile: undefined }),
});
