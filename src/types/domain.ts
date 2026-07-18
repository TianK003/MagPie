/**
 * Shared client domain types (mobile.md §1.4). These are the client-facing
 * shapes the store slices, session machine, and hooks agree on. The generated
 * Supabase row types (`types/db.ts`) land in T6; these are the hand-authored
 * app-domain types independent of the DB representation.
 */

/** A campaign as the brands slice / UI holds it. */
export interface Campaign {
  id: string;
  name: string;
  category: string;
  rateCents: number;
  capPerDay: number;
  /** Weekend multiplier; 1 for the v1 seed campaigns (no weekend multiplier). */
  multiplier: number;
  minLevel: number;
  keywords: string[];
  /** Derived on the client: campaign requires a higher level than the user has. */
  locked?: boolean;
}

export type PayoutMethod = 'paypal' | 'giftcard' | 'venmo' | null;

export interface Profile {
  id: string;
  displayName: string;
  streakCurrent: number;
  streakBest: number;
  level: number;
  inviteCode: string;
  lastActiveDate: string | null;
  payoutMethod?: PayoutMethod;
}

/** Voice-gate pill state; reflects the latest diarize audit (may regress). */
export type VoiceState = 'detecting' | 'one' | 'two';

/**
 * STT transport as surfaced to the UI. 'degraded' (stt-chunk fallback) is T24;
 * pre-T24 a dead WS lands in 'paused' with the "mentions paused" banner.
 */
export type Transport = 'connecting' | 'ws' | 'reconnecting' | 'paused' | 'degraded';

export type SessionPhase =
  | 'idle'
  | 'requestingPerms'
  | 'connecting'
  | 'recording'
  | 'ending'
  | 'summary'
  | 'error';

export type ReceiptStatus = 'pending' | 'paid' | 'flagged';

/** A live receipt row in the recording feed. */
export interface Receipt {
  clientMentionId: string;
  campaignId: string;
  keyword: string;
  status: ReceiptStatus;
  /** Optimistic on create; server amount after paid; unchanged on flagged. */
  amountCents: number;
  /** Session-elapsed ms of the hit. */
  tMs: number;
  mentionId?: string;
  reason?: string;
}

export interface SessionSummary {
  earnedCents: number;
  paidMentions: number;
  pendingMentions: number;
  flaggedMentions: number;
  durationSec: number;
  streakCurrent: number;
  streakBest: number;
  streakSafe: boolean;
  bonusActive: boolean;
  inviteBonusCents: number;
  /** True when built from client data because session-end failed (reconcile on focus). */
  syncing: boolean;
}

export interface LedgerEntry {
  id: string;
  /** signed cents: credits positive, debits negative. */
  amountCents: number;
  label: string;
  createdAt: string;
}

export interface LeaderboardRow {
  userId: string;
  displayName: string;
  weekEarnCents: number;
  rank: number;
  isSelf: boolean;
}

export interface Badge {
  id: string;
  name: string;
  earned: boolean;
}
