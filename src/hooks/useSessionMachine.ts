import { useCallback, useEffect, useMemo, useRef } from 'react';

import { MockApi } from '../lib/api';
import { MockAudioCapture } from '../lib/audio';
import {
  SessionMachine,
  type MachineDeps,
  type SessionMachineState,
} from '../lib/session/machine';
import { useStore } from '../stores';
import type { SessionMirror } from '../stores/session';

/**
 * Bridges the pure `SessionMachine` to the `session` store slice (mobile.md §3).
 * This is the ONLY file in src/hooks that imports react (no react-native). T8
 * consumes it for the on-phone fake session; T17 swaps the mock deps for real
 * audio/STT via the `deps` override.
 *
 * Defaults to MOCK mode (MockAudioCapture + MockApi + self-driven demo) so the
 * recording screen runs end-to-end before any real audio exists.
 */
export interface UseSessionMachine {
  pressRec: () => void;
  pressEnd: () => void;
  androidBack: () => void;
  close: () => void;
  /** Register a coin-pop handler (the CoinPop component's imperative pop). */
  setCoinPopHandler: (cb: (amountCents: number) => void) => void;
  /** Register a "navigate to summary" handler (router.replace('/summary')). */
  setNavigateHandler: (cb: () => void) => void;
  machine: SessionMachine;
}

function toMirror(s: SessionMachineState): Partial<SessionMirror> {
  return {
    phase: s.phase,
    secs: Math.floor(s.elapsedMs / 1000),
    voiceState: s.voiceState,
    transport: s.transport,
    receipts: s.receipts,
    sessEarnCents: s.sessEarnCents,
    mentionCount: s.mentionCount,
    banner: s.banner ?? undefined,
    summary: s.summary ?? undefined,
  };
}

export function useSessionMachine(deps?: Partial<MachineDeps>): UseSessionMachine {
  const setSession = useStore((s) => s.setSession);
  const resetSession = useStore((s) => s.resetSession);
  const showToast = useStore((s) => s.showToast);

  const coinPopRef = useRef<(amountCents: number) => void>(() => {});
  const navigateRef = useRef<() => void>(() => {});

  const machine = useMemo(() => {
    const full: MachineDeps = {
      audio: deps?.audio ?? new MockAudioCapture(),
      api: deps?.api ?? new MockApi({ streakBonusActive: true, streakCurrent: 3 }),
      sttFactory: deps?.sttFactory,
      spotter: deps?.spotter,
      now: deps?.now,
      timers: deps?.timers,
      rng: deps?.rng,
      mock: deps?.mock ?? true,
      tzOffsetMinutes: deps?.tzOffsetMinutes,
    };
    return new SessionMachine(full);
    // Machine is constructed once per mount; deps are read at construction time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    machine.onToast((message) => showToast(message));
    machine.onCoinPop((amount) => coinPopRef.current(amount));
    machine.onNavigateSummary(() => navigateRef.current());
    const unsub = machine.subscribe((s) => {
      if (s.phase === 'idle') resetSession();
      else setSession(toMirror(s));
    });
    // Seed the initial mirror.
    setSession(toMirror(machine.getState()));
    return () => {
      unsub();
      machine.close();
    };
  }, [machine, setSession, resetSession, showToast]);

  const pressRec = useCallback(() => machine.pressRec(), [machine]);
  const pressEnd = useCallback(() => machine.pressEnd(), [machine]);
  const androidBack = useCallback(() => machine.androidBack(), [machine]);
  const close = useCallback(() => machine.close(), [machine]);
  const setCoinPopHandler = useCallback((cb: (amountCents: number) => void) => {
    coinPopRef.current = cb;
  }, []);
  const setNavigateHandler = useCallback((cb: () => void) => {
    navigateRef.current = cb;
  }, []);

  return {
    pressRec,
    pressEnd,
    androidBack,
    close,
    setCoinPopHandler,
    setNavigateHandler,
    machine,
  };
}
