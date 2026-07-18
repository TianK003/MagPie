import type { StateCreator } from 'zustand';

import type { LedgerEntry } from '../types/domain';
import type { Store } from './index';

export interface WalletSlice {
  /** Server truth (ledger SUM). Never computed client-side except optimistic post-cashout. */
  balanceCents: number;
  weekEarnCents: number;
  history: LedgerEntry[];
  payoutPending: boolean;
  setWallet: (patch: Partial<Pick<WalletSlice, 'balanceCents' | 'weekEarnCents' | 'history' | 'payoutPending'>>) => void;
  /**
   * Optimistic cashout render: reset balance to 0 + prepend a debit row. Payouts
   * are non-functional in v1 (REVIEW-DELTAS) — this only updates the UI; the
   * ledger is refetched after. `debit` is negative cents.
   */
  optimisticCashout: (entry: LedgerEntry) => void;
}

export const createWalletSlice: StateCreator<Store, [], [], WalletSlice> = (set) => ({
  balanceCents: 0,
  weekEarnCents: 0,
  history: [],
  payoutPending: false,
  setWallet: (patch) => set(patch),
  optimisticCashout: (entry) =>
    set((s) => ({
      balanceCents: 0,
      payoutPending: true,
      history: [entry, ...s.history],
    })),
});
