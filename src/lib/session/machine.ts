/**
 * Session state machine (mobile.md §3, plan §Session state machine). A PURE
 * reducer (`reduce`) holds the transition table; a thin orchestrator
 * (`SessionMachine`) owns the DI'd services + timers, runs the effects the
 * reducer emits, and dispatches events back. No RN imports — fully unit-testable
 * by feeding scripted services under jest fake timers.
 *
 * Two modes:
 *  - REAL: driven by injected `sttFactory` (ScriptedSttStream in tests) + `api`
 *    (MockApi in tests) + real `KeywordSpotter`. This is the crown-jewel test.
 *  - MOCK (`mock: true`): self-drives the prototype demo (voice at 3s/6s;
 *    mentions ~8s then 12s + jitter cycling campaigns; paid ~1.5s later). No STT,
 *    no spotter — powers T8's on-phone fake session.
 */

import { track, type AnalyticsEvent } from '../analytics';
import type { Api, SessionStartResponse, VerifyVerdict } from '../api';
import type { AudioCapture, AudioCaptureConfig } from '../audio';
import { KeywordSpotter, type CampaignTerms, type Hit } from '../keywords';
import { redact } from '../redact';
import type { SttState, SttStream, SttTokenResponse } from '../stt';
import { createSttStream } from '../stt';
import { realNow, realTimers, type Timers, type TimerHandle } from '../timers';
import { uuid4, type Rng } from '../uuid';
import { PcmRingBuffer } from './ringBuffer';
import type {
  Receipt,
  SessionPhase,
  SessionSummary,
  Transport,
  VoiceState,
} from '../../types/domain';

// --- timing constants (ms) --------------------------------------------------
const PRE_CONNECT_CHUNKS = 20; // ~5s @ 250ms
const SEND_QUEUE_CHUNKS = 80; // ~20s @ 250ms, drop-oldest
const DIARIZE_FIRST_MS = 8000;
const DIARIZE_INTERVAL_MS = 30000;
const VOICE_FRESH_MS = 180000; // 3 min freshness gate
const VERIFY_WAIT_MS = 3000; // wait for a covering FINAL
const SNIPPET_WINDOW_MS = 10000; // ±10s snippet
const LIVENESS_MS = 10000; // server-silence -> stalled
const RECONNECT_BACKOFF = [500, 1000, 2000];
const RECONNECT_FAIL_LIMIT = 3;
const RECONNECT_WINDOW_MS = 60000;
const ENDING_FLUSH_MS = 5000;
const FINAL_DIARIZE_MIN_MS = 15000;
const SESSION_START_RETRIES = 3;
const SESSION_END_RETRIES = 3;
const SUPPRESS_MS = 8000;

const MOCK_STT_OPEN_MS = 300;
const MOCK_VOICE_ONE_MS = 3000;
const MOCK_VOICE_TWO_MS = 6000;
const MOCK_FIRST_MENTION_MS = 8000;
const MOCK_MENTION_INTERVAL_MS = 12000;
const MOCK_MENTION_JITTER_MS = 6000;

export const PERMS_DENIED_MESSAGE = 'magpie needs the mic to hear mentions';
export const PAUSED_BANNER = 'connection lost — mentions paused';
const SESSION_START_FAIL_TOAST = "couldn't start recording — check your connection";

const AUDIO_CFG: AudioCaptureConfig = { sampleRate: 16000, interval: 250 };

// --- machine state ----------------------------------------------------------

export interface SessionMachineState {
  phase: SessionPhase;
  startedAtMs: number | null;
  elapsedMs: number;
  sessionId: string | null;
  sttOpen: boolean;
  voiceState: VoiceState;
  everConfirmed: boolean;
  lastTwoVoiceAtMs: number | null;
  transport: Transport;
  receipts: Receipt[];
  sessEarnCents: number;
  mentionCount: number;
  banner: string | null;
  error: { message: string; openSettings: boolean } | null;
  summary: SessionSummary | null;
  campaignRates: Record<string, number>;
  streakBonusActive: boolean;
  streakCurrent: number;
}

export const initialSessionState: SessionMachineState = {
  phase: 'idle',
  startedAtMs: null,
  elapsedMs: 0,
  sessionId: null,
  sttOpen: false,
  voiceState: 'detecting',
  everConfirmed: false,
  lastTwoVoiceAtMs: null,
  transport: 'connecting',
  receipts: [],
  sessEarnCents: 0,
  mentionCount: 0,
  banner: null,
  error: null,
  summary: null,
  campaignRates: {},
  streakBonusActive: false,
  streakCurrent: 0,
};

// --- events + effects -------------------------------------------------------

export type SessionEvent =
  | { t: 'PRESS_REC' }
  | { t: 'PERMS_RESULT'; granted: boolean; nowMs: number }
  | { t: 'SESSION_STARTED'; res: SessionStartResponse }
  | { t: 'SESSION_START_FAILED' }
  | { t: 'STT_OPEN' }
  | { t: 'STT_FAILED' }
  | { t: 'DIARIZE_RESULT'; speakerCount: number; nowMs: number }
  | { t: 'KEYWORD_HIT'; hit: Hit; clientMentionId: string }
  | { t: 'VERIFY_RESULT'; verdict: VerifyVerdict }
  | { t: 'STT_STALLED' }
  | { t: 'RECONNECTED' }
  | { t: 'TRANSPORT_PAUSED' }
  | { t: 'PRESS_END' }
  | { t: 'ANDROID_BACK' }
  | { t: 'FATAL_AUDIO_ERROR' }
  | { t: 'SESSION_SAVED'; summary: SessionSummary }
  | { t: 'CLOSE' };

export type Effect =
  | { k: 'requestPerms' }
  | { k: 'startAudio' }
  | { k: 'stopAudio' }
  | { k: 'connect' }
  | { k: 'flushPreConnect' }
  | { k: 'closeStt' }
  | { k: 'coinPop'; amountCents: number }
  | { k: 'verify'; clientMentionId: string; campaignId: string; keyword: string; hitAtMs: number }
  | { k: 'resetLiveness' }
  | { k: 'reconnect' }
  | { k: 'endSession' }
  | { k: 'navigateSummary' }
  | { k: 'toast'; message: string }
  | { k: 'track'; event: AnalyticsEvent }
  | { k: 'clearTimers' };

function optimisticAmount(rateCents: number, bonusActive: boolean): number {
  return Math.round(rateCents * (bonusActive ? 1.05 : 1));
}

function enterRecording(state: SessionMachineState): { state: SessionMachineState; effects: Effect[] } {
  return {
    state: { ...state, phase: 'recording', transport: 'ws', banner: null },
    effects: [{ k: 'flushPreConnect' }, { k: 'resetLiveness' }],
  };
}

/**
 * Pure transition table. Returns the next state + the side effects the
 * orchestrator must run. Never performs I/O or reads the clock (events carry
 * `nowMs` where a timestamp is needed).
 */
export function reduce(
  state: SessionMachineState,
  event: SessionEvent
): { state: SessionMachineState; effects: Effect[] } {
  switch (event.t) {
    case 'PRESS_REC':
      if (state.phase !== 'idle') return { state, effects: [] };
      return { state: { ...state, phase: 'requestingPerms' }, effects: [{ k: 'requestPerms' }] };

    case 'PERMS_RESULT':
      if (state.phase !== 'requestingPerms') return { state, effects: [] };
      if (!event.granted) {
        return {
          state: {
            ...state,
            phase: 'error',
            error: { message: PERMS_DENIED_MESSAGE, openSettings: true },
          },
          effects: [{ k: 'toast', message: PERMS_DENIED_MESSAGE }],
        };
      }
      return {
        state: {
          ...state,
          phase: 'connecting',
          transport: 'connecting',
          startedAtMs: event.nowMs,
          elapsedMs: 0,
          voiceState: 'detecting',
          everConfirmed: false,
        },
        effects: [{ k: 'startAudio' }, { k: 'connect' }, { k: 'track', event: 'first_session_start' }],
      };

    case 'SESSION_STARTED': {
      if (state.phase !== 'connecting') return { state, effects: [] };
      const rates: Record<string, number> = {};
      for (const c of event.res.campaigns) rates[c.id] = c.rateCents;
      const next: SessionMachineState = {
        ...state,
        sessionId: event.res.sessionId,
        campaignRates: rates,
        streakBonusActive: event.res.streakBonusActive,
        streakCurrent: event.res.streakCurrent,
      };
      return state.sttOpen ? enterRecording(next) : { state: next, effects: [] };
    }

    case 'SESSION_START_FAILED':
      if (state.phase !== 'connecting') return { state, effects: [] };
      return {
        state: { ...initialSessionState },
        effects: [
          { k: 'stopAudio' },
          { k: 'closeStt' },
          { k: 'clearTimers' },
          { k: 'toast', message: SESSION_START_FAIL_TOAST },
        ],
      };

    case 'STT_OPEN': {
      if (state.phase !== 'connecting') return { state, effects: [] };
      const next = { ...state, sttOpen: true };
      return next.sessionId ? enterRecording(next) : { state: next, effects: [] };
    }

    case 'STT_FAILED': {
      // Never connected: pre-T24 there is no degraded upgrade (T24), so if we
      // already have a session we record with transport 'paused' + banner.
      if (state.phase !== 'connecting') return { state, effects: [] };
      if (!state.sessionId) return { state, effects: [] };
      return {
        state: { ...state, phase: 'recording', transport: 'paused', banner: PAUSED_BANNER },
        effects: [{ k: 'resetLiveness' }],
      };
    }

    case 'DIARIZE_RESULT': {
      if (state.phase !== 'recording') return { state, effects: [] };
      const two = event.speakerCount >= 2;
      const voiceState: VoiceState = two ? 'two' : event.speakerCount === 1 ? 'one' : 'detecting';
      return {
        state: {
          ...state,
          voiceState,
          everConfirmed: state.everConfirmed || two,
          lastTwoVoiceAtMs: two ? event.nowMs : state.lastTwoVoiceAtMs,
        },
        effects: [],
      };
    }

    case 'KEYWORD_HIT': {
      if (state.phase !== 'recording') return { state, effects: [] };
      // Voice gate: latest audit must be >=2 voices AND fresh (<=3 min).
      const fresh =
        state.lastTwoVoiceAtMs !== null && event.hit.tMs - state.lastTwoVoiceAtMs <= VOICE_FRESH_MS;
      if (state.voiceState !== 'two' || !fresh) return { state, effects: [] }; // dropped

      const rate = state.campaignRates[event.hit.campaignId] ?? 5;
      const amount = optimisticAmount(rate, state.streakBonusActive);
      const receipt: Receipt = {
        clientMentionId: event.clientMentionId,
        campaignId: event.hit.campaignId,
        keyword: event.hit.keyword,
        status: 'pending',
        amountCents: amount,
        tMs: event.hit.tMs,
      };
      return {
        state: {
          ...state,
          receipts: [receipt, ...state.receipts],
          sessEarnCents: state.sessEarnCents + amount,
          mentionCount: state.mentionCount + 1,
        },
        effects: [
          { k: 'coinPop', amountCents: amount },
          {
            k: 'verify',
            clientMentionId: event.clientMentionId,
            campaignId: event.hit.campaignId,
            keyword: event.hit.keyword,
            hitAtMs: event.hit.tMs,
          },
        ],
      };
    }

    case 'VERIFY_RESULT': {
      const idx = state.receipts.findIndex(
        (r) => r.clientMentionId === event.verdict.clientMentionId
      );
      if (idx === -1) return { state, effects: [] };
      const receipt = state.receipts[idx];
      const receipts = [...state.receipts];
      if (event.verdict.status === 'paid') {
        const delta = event.verdict.amountCents - receipt.amountCents;
        receipts[idx] = {
          ...receipt,
          status: 'paid',
          amountCents: event.verdict.amountCents,
          mentionId: event.verdict.mentionId,
        };
        return {
          state: { ...state, receipts, sessEarnCents: state.sessEarnCents + delta },
          effects: [{ k: 'track', event: 'mention_paid' }],
        };
      }
      // flagged: keep the row, decrement the counter + mention count.
      receipts[idx] = {
        ...receipt,
        status: 'flagged',
        mentionId: event.verdict.mentionId,
        reason: event.verdict.reason ?? 'flagged, not paid',
      };
      return {
        state: {
          ...state,
          receipts,
          sessEarnCents: state.sessEarnCents - receipt.amountCents,
          mentionCount: Math.max(0, state.mentionCount - 1),
        },
        effects: [],
      };
    }

    case 'STT_STALLED':
      if (state.phase !== 'recording' || state.transport !== 'ws') return { state, effects: [] };
      return { state: { ...state, transport: 'reconnecting' }, effects: [{ k: 'reconnect' }] };

    case 'RECONNECTED':
      if (state.phase !== 'recording') return { state, effects: [] };
      return {
        state: { ...state, transport: 'ws', banner: null },
        effects: [{ k: 'resetLiveness' }],
      };

    case 'TRANSPORT_PAUSED':
      if (state.phase !== 'recording') return { state, effects: [] };
      return { state: { ...state, transport: 'paused', banner: PAUSED_BANNER }, effects: [] };

    case 'PRESS_END':
    case 'ANDROID_BACK':
    case 'FATAL_AUDIO_ERROR':
      if (state.phase !== 'recording' && state.phase !== 'connecting') return { state, effects: [] };
      return {
        state: { ...state, phase: 'ending' },
        effects: [{ k: 'stopAudio' }, { k: 'closeStt' }, { k: 'clearTimers' }, { k: 'endSession' }],
      };

    case 'SESSION_SAVED':
      if (state.phase !== 'ending') return { state, effects: [] };
      return {
        state: { ...state, phase: 'summary', summary: event.summary },
        effects: [{ k: 'navigateSummary' }, { k: 'track', event: 'session_end' }],
      };

    case 'CLOSE':
      return { state: { ...initialSessionState }, effects: [{ k: 'clearTimers' }] };

    default:
      return { state, effects: [] };
  }
}

// --- orchestrator -----------------------------------------------------------

export interface MachineDeps {
  audio: AudioCapture;
  api: Api;
  /** Real mode. Defaults to `createSttStream` (throws until T15). Not used in mock mode. */
  sttFactory?: (tok: SttTokenResponse) => SttStream;
  /** Override the spotter; otherwise built from session-start campaigns. */
  spotter?: KeywordSpotter;
  now?: () => number;
  timers?: Timers;
  rng?: Rng;
  mock?: boolean;
  tzOffsetMinutes?: number;
}

interface TranscriptSegment {
  text: string;
  tMs: number;
}

export class SessionMachine {
  private state: SessionMachineState = initialSessionState;
  private readonly listeners = new Set<(s: SessionMachineState) => void>();

  private readonly audio: AudioCapture;
  private readonly api: Api;
  private readonly sttFactory: (tok: SttTokenResponse) => SttStream;
  private readonly now: () => number;
  private readonly timers: Timers;
  private readonly rng: Rng;
  private readonly mock: boolean;
  private readonly tzOffsetMinutes: number;

  private spotter?: KeywordSpotter;
  private stt?: SttStream;

  // buffers / queues
  private preConnect: string[] = [];
  private sendQueue: string[] = [];
  private transcript: TranscriptSegment[] = [];
  private finalWaiters: (() => void)[] = [];

  // timer handles
  private diarizeTimer?: TimerHandle;
  private livenessTimer?: TimerHandle;
  private mockTimers: TimerHandle[] = [];
  private reconnectTimer?: TimerHandle;

  // counters
  private diarizeAuditN = 0;
  private inFlightVerifies = 0;
  private reconnectAttempts = 0;
  private reconnectWindowStart = 0;
  private mockCampaignIdx = 0;
  private disposed = false;

  // UI callbacks
  private coinPopCb?: (amountCents: number) => void;
  private navigateCb?: () => void;
  private toastCb?: (message: string) => void;
  private sessionSavedCb?: (summary: SessionSummary) => void;

  constructor(deps: MachineDeps) {
    this.audio = deps.audio;
    this.api = deps.api;
    this.sttFactory = deps.sttFactory ?? createSttStream;
    this.now = deps.now ?? realNow;
    this.timers = deps.timers ?? realTimers;
    this.rng = deps.rng ?? Math.random;
    this.mock = deps.mock ?? false;
    this.tzOffsetMinutes = deps.tzOffsetMinutes ?? 0;
    if (deps.spotter) this.spotter = deps.spotter;
  }

  // --- public API ---
  getState(): SessionMachineState {
    return this.state;
  }

  subscribe(cb: (s: SessionMachineState) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onCoinPop(cb: (amountCents: number) => void): void {
    this.coinPopCb = cb;
  }
  onNavigateSummary(cb: () => void): void {
    this.navigateCb = cb;
  }
  onToast(cb: (message: string) => void): void {
    this.toastCb = cb;
  }
  onSessionSaved(cb: (summary: SessionSummary) => void): void {
    this.sessionSavedCb = cb;
  }

  pressRec(): void {
    this.dispatch({ t: 'PRESS_REC' });
  }
  pressEnd(): void {
    this.dispatch({ t: 'PRESS_END' });
  }
  androidBack(): void {
    this.dispatch({ t: 'ANDROID_BACK' });
  }
  close(): void {
    this.dispatch({ t: 'CLOSE' });
  }

  // --- dispatch loop ---
  private dispatch(event: SessionEvent): void {
    if (this.disposed) return;
    const { state, effects } = reduce(this.state, event);
    this.state = state;
    this.notify();
    for (const e of effects) this.runEffect(e);
  }

  private notify(): void {
    for (const l of this.listeners) l(this.state);
  }

  private elapsed(): number {
    return this.state.startedAtMs === null ? 0 : this.now() - this.state.startedAtMs;
  }

  // --- effect interpreter ---
  private runEffect(e: Effect): void {
    switch (e.k) {
      case 'requestPerms':
        void this.audio
          .requestPermission()
          .then((granted) => this.dispatch({ t: 'PERMS_RESULT', granted, nowMs: this.now() }))
          .catch(() => this.dispatch({ t: 'PERMS_RESULT', granted: false, nowMs: this.now() }));
        return;
      case 'startAudio':
        void this.audio.start(AUDIO_CFG, (b64) => this.onAudioChunk(b64)).catch(() => {
          this.dispatch({ t: 'FATAL_AUDIO_ERROR' });
        });
        return;
      case 'stopAudio':
        void this.audio.stop().catch(() => {});
        return;
      case 'connect':
        this.connect();
        return;
      case 'flushPreConnect':
        this.flushPreConnect();
        return;
      case 'closeStt':
        void this.stt?.close().catch(() => {});
        this.stt = undefined;
        return;
      case 'coinPop':
        this.coinPopCb?.(e.amountCents);
        return;
      case 'verify':
        void this.runVerify(e.clientMentionId, e.campaignId, e.keyword, e.hitAtMs);
        return;
      case 'resetLiveness':
        this.resetLiveness();
        return;
      case 'reconnect':
        this.startReconnect();
        return;
      case 'endSession':
        void this.endSession();
        return;
      case 'navigateSummary':
        this.navigateCb?.();
        return;
      case 'toast':
        this.toastCb?.(e.message);
        return;
      case 'track':
        track(e.event);
        return;
      case 'clearTimers':
        this.clearAllTimers();
        return;
    }
  }

  // --- connect ---
  private connect(): void {
    void this.runSessionStart();
    if (this.mock) {
      // No STT / spotter in mock mode: open shortly, then self-drive the demo.
      this.mockTimers.push(this.timers.setTimeout(() => this.dispatch({ t: 'STT_OPEN' }), MOCK_STT_OPEN_MS));
    } else {
      void this.runSttConnect();
      this.scheduleDiarize(DIARIZE_FIRST_MS);
    }
  }

  private async runSessionStart(): Promise<void> {
    for (let attempt = 0; attempt < SESSION_START_RETRIES; attempt++) {
      try {
        const res = await this.api.sessionStart({
          tzOffsetMinutes: this.tzOffsetMinutes,
        });
        if (!this.spotter && !this.mock) {
          const terms: CampaignTerms[] = res.campaigns.map((c) => ({
            campaignId: c.id,
            keywords: c.keywords,
          }));
          this.spotter = new KeywordSpotter(terms, { suppressMs: SUPPRESS_MS });
        }
        this.dispatch({ t: 'SESSION_STARTED', res });
        if (this.mock) this.startMockDrivers(res);
        return;
      } catch {
        await this.backoff(RECONNECT_BACKOFF[Math.min(attempt, RECONNECT_BACKOFF.length - 1)]);
      }
    }
    this.dispatch({ t: 'SESSION_START_FAILED' });
  }

  private async runSttConnect(): Promise<void> {
    for (let attempt = 0; attempt < SESSION_START_RETRIES; attempt++) {
      try {
        const tok = await this.api.sttToken();
        this.stt = this.makeStt(tok);
        await this.stt.start();
        return;
      } catch {
        await this.backoff(RECONNECT_BACKOFF[Math.min(attempt, RECONNECT_BACKOFF.length - 1)]);
      }
    }
    this.dispatch({ t: 'STT_FAILED' });
  }

  private makeStt(tok: SttTokenResponse): SttStream {
    const stt = this.sttFactory(tok);
    stt.onPartial((text) => this.onPartial(text));
    stt.onFinal((text, tsMs) => this.onFinal(text, tsMs));
    stt.onStateChange((s) => this.onSttState(s));
    return stt;
  }

  private onSttState(s: SttState): void {
    if (s === 'open') {
      this.dispatch({ t: 'STT_OPEN' });
    } else if ((s === 'closed' || s === 'failed') && this.state.phase === 'recording') {
      this.dispatch({ t: 'STT_STALLED' });
    }
  }

  // --- audio routing ---
  private onAudioChunk(b64: string): void {
    if (this.disposed) return;
    // Ring buffer always retains the last 15s for diarization.
    try {
      this.ring.push(b64);
    } catch {
      /* ignore malformed chunk in tests */
    }
    if (this.state.startedAtMs !== null) {
      this.setPartial({ elapsedMs: this.elapsed() });
    }
    switch (this.state.transport) {
      case 'ws':
        this.stt?.sendPcmBase64(b64, AUDIO_CFG.sampleRate);
        break;
      case 'connecting':
        this.preConnect.push(b64);
        if (this.preConnect.length > PRE_CONNECT_CHUNKS) this.preConnect.shift();
        break;
      case 'reconnecting':
        this.sendQueue.push(b64);
        if (this.sendQueue.length > SEND_QUEUE_CHUNKS) this.sendQueue.shift();
        break;
      default:
        break; // 'paused' / 'degraded' (T24): drop
    }
  }

  private flushPreConnect(): void {
    for (const b64 of this.preConnect) this.stt?.sendPcmBase64(b64, AUDIO_CFG.sampleRate);
    for (const b64 of this.sendQueue) this.stt?.sendPcmBase64(b64, AUDIO_CFG.sampleRate);
    this.preConnect = [];
    this.sendQueue = [];
  }

  /** Light state patch that notifies without going through the reducer (hot path). */
  private setPartial(patch: Partial<SessionMachineState>): void {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  // --- transcript + spotter ---
  private onPartial(text: string): void {
    this.resetLiveness();
    if (!this.spotter) return;
    for (const hit of this.spotter.partial(text, this.elapsed())) this.fireHit(hit);
  }

  private onFinal(text: string, _tsMs: number): void {
    void _tsMs;
    this.resetLiveness();
    const tMs = this.elapsed();
    this.transcript.push({ text, tMs });
    this.pruneTranscript(tMs);
    // Release any verify calls waiting for a covering FINAL for a better snippet.
    const waiters = this.finalWaiters;
    this.finalWaiters = [];
    for (const w of waiters) w();
    if (!this.spotter) return;
    for (const hit of this.spotter.final(text, tMs)) this.fireHit(hit);
  }

  private fireHit(hit: Hit): void {
    this.dispatch({ t: 'KEYWORD_HIT', hit, clientMentionId: uuid4(this.rng) });
  }

  private pruneTranscript(nowMs: number): void {
    const cutoff = nowMs - 60000;
    this.transcript = this.transcript.filter((s) => s.tMs >= cutoff);
  }

  private snippet(hitAtMs: number): string {
    const lo = hitAtMs - SNIPPET_WINDOW_MS;
    const hi = hitAtMs + SNIPPET_WINDOW_MS;
    const text = this.transcript
      .filter((s) => s.tMs >= lo && s.tMs <= hi)
      .map((s) => s.text)
      .join(' ')
      .slice(0, 1200);
    return redact(text);
  }

  // --- verify ---
  private async runVerify(
    clientMentionId: string,
    campaignId: string,
    keyword: string,
    hitAtMs: number
  ): Promise<void> {
    this.inFlightVerifies++;
    try {
      if (!this.mock) await this.waitForCoveringFinal();
      const snippet = this.snippet(hitAtMs); // redacted before it leaves the device
      const verdict = await this.api.verifyMention({
        sessionId: this.state.sessionId ?? '',
        campaignId,
        clientMentionId,
        keyword,
        snippet,
        occurredAt: new Date(this.now()).toISOString(),
      });
      this.dispatch({ t: 'VERIFY_RESULT', verdict });
    } catch {
      // leave the receipt pending; the app-wide Broadcast subscription flips it later.
    } finally {
      this.inFlightVerifies--;
    }
  }

  private waitForCoveringFinal(): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      this.finalWaiters.push(finish);
      this.timers.setTimeout(finish, VERIFY_WAIT_MS);
    });
  }

  // --- diarization audits ---
  private scheduleDiarize(delayMs: number): void {
    this.diarizeTimer = this.timers.setTimeout(() => {
      void this.runDiarize();
      this.scheduleDiarize(DIARIZE_INTERVAL_MS);
    }, delayMs);
  }

  private async runDiarize(): Promise<void> {
    if (this.state.phase !== 'recording' || !this.state.sessionId) return;
    const n = this.diarizeAuditN++;
    try {
      const { path } = await this.api.diarizeUploadUrl(this.state.sessionId, n);
      // Real upload of ring.snapshotWav(15) to the signed URL is wired by T12/T16.
      const res = await this.api.diarizeAnalyze(this.state.sessionId, path);
      this.dispatch({ t: 'DIARIZE_RESULT', speakerCount: res.speakerCount, nowMs: this.elapsed() });
    } catch {
      // Audit failures are silent (keep last pill state); retried next tick.
    }
  }

  // --- liveness / reconnect ---
  private resetLiveness(): void {
    if (this.livenessTimer !== undefined) this.timers.clearTimeout(this.livenessTimer);
    if (this.mock) return;
    this.livenessTimer = this.timers.setTimeout(() => {
      if (this.state.phase === 'recording' && this.state.transport === 'ws') {
        this.dispatch({ t: 'STT_STALLED' });
      }
    }, LIVENESS_MS);
  }

  private startReconnect(): void {
    const now = this.now();
    if (this.reconnectAttempts === 0) this.reconnectWindowStart = now;
    this.attemptReconnect();
  }

  private attemptReconnect(): void {
    const backoff = RECONNECT_BACKOFF[Math.min(this.reconnectAttempts, RECONNECT_BACKOFF.length - 1)];
    this.reconnectTimer = this.timers.setTimeout(() => {
      void this.doReconnect();
    }, backoff);
  }

  private async doReconnect(): Promise<void> {
    if (this.state.phase !== 'recording') return;
    let opened = false;
    try {
      const tok = await this.api.sttToken(); // single-use: re-mint each attempt
      const stt = this.makeStt(tok);
      opened = await this.raceOpen(stt);
      if (opened) {
        this.stt = stt;
        this.reconnectAttempts = 0;
        this.dispatch({ t: 'RECONNECTED' });
        return;
      }
      void stt.close().catch(() => {});
    } catch {
      opened = false;
    }
    this.onReconnectFailed();
  }

  /** Resolve true if the stream reports 'open' before it fails/closes. */
  private raceOpen(stt: SttStream): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      stt.onStateChange((s) => {
        if (settled) return;
        if (s === 'open') {
          settled = true;
          resolve(true);
        } else if (s === 'failed' || s === 'closed') {
          settled = true;
          resolve(false);
        }
      });
      void stt.start().catch(() => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      });
    });
  }

  private onReconnectFailed(): void {
    this.reconnectAttempts++;
    const withinWindow = this.now() - this.reconnectWindowStart <= RECONNECT_WINDOW_MS;
    if (this.reconnectAttempts >= RECONNECT_FAIL_LIMIT && withinWindow) {
      this.reconnectAttempts = 0;
      this.dispatch({ t: 'TRANSPORT_PAUSED' });
      return;
    }
    if (!withinWindow) {
      this.reconnectAttempts = 1;
      this.reconnectWindowStart = this.now();
    }
    this.attemptReconnect();
  }

  // --- ending ---
  private async endSession(): Promise<void> {
    // Final diarize only if never confirmed and the session ran long enough.
    if (!this.state.everConfirmed && this.elapsed() >= FINAL_DIARIZE_MIN_MS && this.state.sessionId) {
      try {
        const { path } = await this.api.diarizeUploadUrl(this.state.sessionId, this.diarizeAuditN++);
        await this.api.diarizeAnalyze(this.state.sessionId, path);
      } catch {
        /* ignore */
      }
    }
    await this.waitForFlush();
    const summary = await this.finalizeSummary();
    this.sessionSavedCb?.(summary);
    this.dispatch({ t: 'SESSION_SAVED', summary });
  }

  /** Wait up to 5s for in-flight verifies to settle. */
  private waitForFlush(): Promise<void> {
    return new Promise((resolve) => {
      const start = this.now();
      const poll = () => {
        if (this.inFlightVerifies <= 0 || this.now() - start >= ENDING_FLUSH_MS) {
          resolve();
          return;
        }
        this.timers.setTimeout(poll, 100);
      };
      poll();
    });
  }

  private async finalizeSummary(): Promise<SessionSummary> {
    const clientDay = localDayKey(new Date(this.now()));
    for (let attempt = 0; attempt < SESSION_END_RETRIES; attempt++) {
      try {
        const res = await this.api.sessionEnd({ sessionId: this.state.sessionId ?? '', clientDay });
        return {
          earnedCents: res.earnedCents,
          paidMentions: res.paidMentions,
          pendingMentions: res.pendingMentions,
          flaggedMentions: res.flaggedMentions,
          durationSec: res.durationSec,
          streakCurrent: res.streakCurrent,
          streakBest: res.streakBest,
          streakSafe: res.streakSafe,
          bonusActive: res.bonusActive,
          inviteBonusCents: res.inviteBonusCents,
          syncing: false,
        };
      } catch {
        await this.backoff(RECONNECT_BACKOFF[Math.min(attempt, RECONNECT_BACKOFF.length - 1)]);
      }
    }
    return this.clientSummary();
  }

  /** Fallback summary from client data, flagged as syncing (reconcile on focus). */
  private clientSummary(): SessionSummary {
    const paid = this.state.receipts.filter((r) => r.status === 'paid').length;
    const pending = this.state.receipts.filter((r) => r.status === 'pending').length;
    const flagged = this.state.receipts.filter((r) => r.status === 'flagged').length;
    return {
      earnedCents: this.state.sessEarnCents,
      paidMentions: paid,
      pendingMentions: pending,
      flaggedMentions: flagged,
      durationSec: Math.floor(this.elapsed() / 1000),
      streakCurrent: this.state.streakCurrent,
      streakBest: this.state.streakCurrent,
      streakSafe: this.state.everConfirmed,
      bonusActive: this.state.streakBonusActive,
      inviteBonusCents: 0,
      syncing: true,
    };
  }

  // --- mock-mode drivers ---
  private startMockDrivers(res: SessionStartResponse): void {
    const campaigns = res.campaigns;
    this.mockTimers.push(
      this.timers.setTimeout(
        () => this.dispatch({ t: 'DIARIZE_RESULT', speakerCount: 1, nowMs: this.elapsed() }),
        MOCK_VOICE_ONE_MS
      )
    );
    this.mockTimers.push(
      this.timers.setTimeout(
        () => this.dispatch({ t: 'DIARIZE_RESULT', speakerCount: 2, nowMs: this.elapsed() }),
        MOCK_VOICE_TWO_MS
      )
    );
    const scheduleMention = (delay: number) => {
      const h = this.timers.setTimeout(() => {
        if (this.state.phase !== 'recording' || campaigns.length === 0) return;
        const c = campaigns[this.mockCampaignIdx % campaigns.length];
        this.mockCampaignIdx++;
        this.fireHit({
          campaignId: c.id,
          termId: `${c.id}#0`,
          keyword: c.keywords[0],
          tMs: this.elapsed(),
        });
        const jitter = Math.floor(this.rng() * MOCK_MENTION_JITTER_MS);
        scheduleMention(MOCK_MENTION_INTERVAL_MS + jitter);
      }, delay);
      this.mockTimers.push(h);
    };
    scheduleMention(MOCK_FIRST_MENTION_MS);
  }

  // --- helpers ---
  private backoff(ms: number): Promise<void> {
    return new Promise((resolve) => this.timers.setTimeout(resolve, ms));
  }

  private clearAllTimers(): void {
    if (this.diarizeTimer !== undefined) this.timers.clearTimeout(this.diarizeTimer);
    if (this.livenessTimer !== undefined) this.timers.clearTimeout(this.livenessTimer);
    if (this.reconnectTimer !== undefined) this.timers.clearTimeout(this.reconnectTimer);
    for (const h of this.mockTimers) this.timers.clearTimeout(h);
    this.diarizeTimer = undefined;
    this.livenessTimer = undefined;
    this.reconnectTimer = undefined;
    this.mockTimers = [];
    this.spotter?.reset();
  }

  private readonly ring = new PcmRingBuffer();
}

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
