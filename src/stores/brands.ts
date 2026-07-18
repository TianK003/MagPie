import type { StateCreator } from 'zustand';

import type { Campaign } from '../types/domain';
import type { Store } from './index';

/** Persist an opt-in toggle server-side; rejects to trigger rollback. */
export type OptInPersist = (campaignId: string, optedIn: boolean) => Promise<void>;

export interface BrandsSlice {
  campaigns: Campaign[];
  /** Set of opted-in campaign ids. */
  optedIn: Set<string>;
  setCampaigns: (campaigns: Campaign[]) => void;
  setOptedIn: (ids: Iterable<string>) => void;
  /**
   * Toggle an opt-in with an OPTIMISTIC local update. If `persist` is provided
   * and rejects, the change is rolled back (the caller shows the failure toast).
   * `persist` is wired to the real edge fn in T13; the seam exists now.
   */
  toggleOptIn: (campaignId: string, persist?: OptInPersist) => Promise<void>;
}

export const createBrandsSlice: StateCreator<Store, [], [], BrandsSlice> = (set, get) => ({
  campaigns: [],
  optedIn: new Set<string>(),
  setCampaigns: (campaigns) => set({ campaigns }),
  setOptedIn: (ids) => set({ optedIn: new Set(ids) }),
  toggleOptIn: async (campaignId, persist) => {
    const wasOptedIn = get().optedIn.has(campaignId);
    const nextOptedIn = !wasOptedIn;

    // Optimistic flip.
    set((s) => {
      const next = new Set(s.optedIn);
      if (nextOptedIn) next.add(campaignId);
      else next.delete(campaignId);
      return { optedIn: next };
    });

    if (!persist) return;
    try {
      await persist(campaignId, nextOptedIn);
    } catch (err) {
      // Rollback to the previous membership.
      set((s) => {
        const next = new Set(s.optedIn);
        if (wasOptedIn) next.add(campaignId);
        else next.delete(campaignId);
        return { optedIn: next };
      });
      throw err;
    }
  },
});
