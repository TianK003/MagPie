/**
 * Edge-function API interface the session machine consumes + a MockApi that
 * reproduces mock-mode behaviour (mobile.md §1.3, plan §Edge functions). The
 * REAL api.ts (typed supabase.functions.invoke wrappers) lands in T6 against
 * these EXACT camelCased shapes. No RN imports.
 *
 * Note on verifyMention: the real edge fn responds `{status:'pending'}` then
 * delivers the verdict over the user's Broadcast topic. This interface hides
 * that: `verifyMention` resolves to the final verdict (paid/flagged). T6 bridges
 * the pending-response + broadcast into this promise; the machine stays simple.
 */

import type { SttTokenResponse } from './stt';
import type { Timers, TimerHandle } from './timers';
import { realTimers } from './timers';

export type { SttTokenResponse } from './stt';

/** A campaign as `session-start` returns it (paying params for the session). */
export interface SessionCampaign {
  id: string;
  name: string;
  keywords: string[];
  rateCents: number;
  capPerDay: number;
  remainingToday: number;
  cooldownSeconds: number;
  weekendMultiplier: number;
}

export interface SessionStartRequest {
  tzOffsetMinutes: number;
  sttProvider?: 'elevenlabs' | 'openai';
}

export interface SessionStartResponse {
  sessionId: string;
  startedAt: string;
  streakCurrent: number;
  streakBonusActive: boolean;
  campaigns: SessionCampaign[];
}

export interface DiarizeUploadUrl {
  path: string;
  token: string;
}

export interface DiarizeResult {
  speakerCount: number;
  voiceConfirmed: boolean;
  lastTwoVoiceAt: string | null;
}

export interface VerifyMentionRequest {
  sessionId: string;
  campaignId: string;
  clientMentionId: string;
  keyword: string;
  /** client-regex-redacted (<=1200 chars). */
  snippet: string;
  /** ISO timestamp of the hit. */
  occurredAt: string;
}

/** The final verdict the machine flips the receipt to. */
export interface VerifyVerdict {
  mentionId: string;
  clientMentionId: string;
  status: 'paid' | 'flagged';
  amountCents: number;
  reason?: string;
}

export interface SessionEndRequest {
  sessionId: string;
  /** device-local 'YYYY-MM-DD'. */
  clientDay: string;
}

export interface SessionEndResponse {
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
}

export interface Api {
  sttToken(provider?: 'elevenlabs' | 'openai'): Promise<SttTokenResponse>;
  sessionStart(req: SessionStartRequest): Promise<SessionStartResponse>;
  diarizeUploadUrl(sessionId: string, auditN: number): Promise<DiarizeUploadUrl>;
  diarizeAnalyze(sessionId: string, path: string): Promise<DiarizeResult>;
  verifyMention(req: VerifyMentionRequest): Promise<VerifyVerdict>;
  sessionEnd(req: SessionEndRequest): Promise<SessionEndResponse>;
  /** Degraded mode (T24); optional so pre-T24 machines don't require it. */
  sttChunk?(sessionId: string, base64Wav: string): Promise<{ text: string }>;
}

// ---------------------------------------------------------------------------

export interface MockApiOptions {
  timers?: Timers;
  campaigns?: SessionCampaign[];
  streakCurrent?: number;
  streakBonusActive?: boolean;
  /** speaker counts returned by successive diarize audits; last value repeats. */
  diarizeSpeakerSequence?: number[];
  /** ms before verifyMention resolves (default 1500 — the prototype pace). */
  verifyDelayMs?: number;
  /** amount paid on a paid verdict (default: campaign rate). */
  paidAmountCents?: number;
  /** clientMentionIds that should resolve `flagged` instead of `paid`. */
  flaggedClientMentionIds?: string[];
  /** 1-based verifyMention call indexes that should resolve `flagged`. */
  flaggedMentionSeqs?: number[];
  /** reject sessionStart this many times before succeeding (default 0). */
  failSessionStartTimes?: number;
  /** reject sessionEnd this many times before succeeding (default 0). */
  failSessionEndTimes?: number;
  sessionEndResponse?: Partial<SessionEndResponse>;
}

/**
 * In-memory Api for tests + mock mode. Deterministic under fake timers; every
 * async result is scheduled through the injected `timers`.
 */
export class MockApi implements Api {
  private readonly timers: Timers;
  private readonly opts: MockApiOptions;
  private diarizeCalls = 0;
  private sessionStartCalls = 0;
  private sessionEndCalls = 0;
  private mentionSeq = 0;

  readonly campaigns: SessionCampaign[];

  constructor(opts?: MockApiOptions) {
    this.opts = opts ?? {};
    this.timers = this.opts.timers ?? realTimers;
    this.campaigns = this.opts.campaigns ?? DEFAULT_MOCK_CAMPAIGNS;
  }

  private delay<T>(ms: number, value: T): Promise<T> {
    return new Promise((resolve) => {
      let h: TimerHandle;
      h = this.timers.setTimeout(() => {
        void h;
        resolve(value);
      }, ms);
    });
  }

  sttToken(provider: 'elevenlabs' | 'openai' = 'elevenlabs'): Promise<SttTokenResponse> {
    const res: SttTokenResponse =
      provider === 'openai'
        ? {
            provider: 'openai',
            wsUrl: 'wss://api.openai.com/v1/realtime?intent=transcription',
            token: 'ek_mock',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            model: 'gpt-realtime-whisper',
            audio: { encoding: 'pcm16', sampleRateHz: 24000 },
          }
        : {
            provider: 'elevenlabs',
            wsUrl:
              'wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&token=sutkn_mock',
            token: 'sutkn_mock',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            audio: { encoding: 'pcm_16000', sampleRateHz: 16000 },
          };
    return this.delay(0, res);
  }

  sessionStart(_req: SessionStartRequest): Promise<SessionStartResponse> {
    void _req;
    this.sessionStartCalls++;
    if (this.sessionStartCalls <= (this.opts.failSessionStartTimes ?? 0)) {
      return new Promise((_resolve, reject) => {
        this.timers.setTimeout(() => reject(new Error('mock sessionStart failure')), 0);
      });
    }
    return this.delay(0, {
      sessionId: `mock-session-${this.sessionStartCalls}`,
      startedAt: new Date().toISOString(),
      streakCurrent: this.opts.streakCurrent ?? 0,
      streakBonusActive: this.opts.streakBonusActive ?? false,
      campaigns: this.campaigns,
    });
  }

  diarizeUploadUrl(sessionId: string, auditN: number): Promise<DiarizeUploadUrl> {
    return this.delay(0, {
      path: `mock/${sessionId}/${auditN}.wav`,
      token: 'mock-upload-token',
    });
  }

  diarizeAnalyze(_sessionId: string, _path: string): Promise<DiarizeResult> {
    void _sessionId;
    void _path;
    const seq = this.opts.diarizeSpeakerSequence ?? [1, 2];
    const idx = Math.min(this.diarizeCalls, seq.length - 1);
    const speakerCount = seq[idx];
    this.diarizeCalls++;
    const voiceConfirmed = speakerCount >= 2;
    return this.delay(0, {
      speakerCount,
      voiceConfirmed,
      lastTwoVoiceAt: voiceConfirmed ? new Date().toISOString() : null,
    });
  }

  verifyMention(req: VerifyMentionRequest): Promise<VerifyVerdict> {
    this.mentionSeq++;
    const flagged =
      (this.opts.flaggedClientMentionIds ?? []).includes(req.clientMentionId) ||
      (this.opts.flaggedMentionSeqs ?? []).includes(this.mentionSeq);
    const campaign = this.campaigns.find((c) => c.id === req.campaignId);
    const amount = flagged ? 0 : this.opts.paidAmountCents ?? campaign?.rateCents ?? 5;
    const verdict: VerifyVerdict = {
      mentionId: `mock-mention-${this.mentionSeq}`,
      clientMentionId: req.clientMentionId,
      status: flagged ? 'flagged' : 'paid',
      amountCents: amount,
      reason: flagged ? 'flagged, not paid' : undefined,
    };
    return this.delay(this.opts.verifyDelayMs ?? 1500, verdict);
  }

  sessionEnd(_req: SessionEndRequest): Promise<SessionEndResponse> {
    void _req;
    this.sessionEndCalls++;
    if (this.sessionEndCalls <= (this.opts.failSessionEndTimes ?? 0)) {
      return new Promise((_resolve, reject) => {
        this.timers.setTimeout(() => reject(new Error('mock sessionEnd failure')), 0);
      });
    }
    const base: SessionEndResponse = {
      earnedCents: 0,
      paidMentions: 0,
      pendingMentions: 0,
      flaggedMentions: 0,
      durationSec: 0,
      streakCurrent: this.opts.streakCurrent ?? 0,
      streakBest: this.opts.streakCurrent ?? 0,
      streakSafe: true,
      bonusActive: this.opts.streakBonusActive ?? false,
      inviteBonusCents: 0,
    };
    return this.delay(0, { ...base, ...this.opts.sessionEndResponse });
  }
}

/** The 3 real sponsor campaigns (matches the prod seed) in session-start shape. */
export const DEFAULT_MOCK_CAMPAIGNS: SessionCampaign[] = [
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    keywords: ['elevenlabs', 'eleven labs'],
    rateCents: 5,
    capPerDay: 20,
    remainingToday: 20,
    cooldownSeconds: 60,
    weekendMultiplier: 1,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    keywords: ['openai', 'open ai'],
    rateCents: 5,
    capPerDay: 20,
    remainingToday: 20,
    cooldownSeconds: 60,
    weekendMultiplier: 1,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    keywords: ['anthropic'],
    rateCents: 5,
    capPerDay: 20,
    remainingToday: 20,
    cooldownSeconds: 60,
    weekendMultiplier: 1,
  },
];
