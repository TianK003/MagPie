import type { StateCreator } from 'zustand';

import type {
  Receipt,
  SessionPhase,
  SessionSummary,
  Transport,
  VoiceState,
} from '../types/domain';
import type { Store } from './index';

/** The mirror of the session machine's UI-relevant state (mobile.md §1.4). */
export interface SessionMirror {
  phase: SessionPhase;
  secs: number;
  voiceState: VoiceState;
  transport: Transport;
  receipts: Receipt[];
  sessEarnCents: number;
  mentionCount: number;
  banner?: string;
  summary?: SessionSummary;
}

export const emptySessionMirror: SessionMirror = {
  phase: 'idle',
  secs: 0,
  voiceState: 'detecting',
  transport: 'connecting',
  receipts: [],
  sessEarnCents: 0,
  mentionCount: 0,
  banner: undefined,
  summary: undefined,
};

export interface SessionSlice {
  session: SessionMirror;
  /** Patch the session mirror (the useSessionMachine hook writes here). */
  setSession: (patch: Partial<SessionMirror>) => void;
  /** Wipe the session slice after the summary closes ("slice wiped"). */
  resetSession: () => void;
}

export const createSessionSlice: StateCreator<Store, [], [], SessionSlice> = (set) => ({
  session: { ...emptySessionMirror },
  setSession: (patch) => set((s) => ({ session: { ...s.session, ...patch } })),
  resetSession: () => set({ session: { ...emptySessionMirror } }),
});
