import { DEFAULT_MOCK_CAMPAIGNS, MockApi, type Api } from '../src/lib/api';
import { MockAudioCapture } from '../src/lib/audio';
import {
  PAUSED_BANNER,
  PERMS_DENIED_MESSAGE,
  SessionMachine,
} from '../src/lib/session/machine';
import { ScriptedSttStream, type ScriptStep } from '../src/lib/stt/scripted';
import type { SttState, SttStream, SttTokenResponse } from '../src/lib/stt';

/** Deterministic RNG so uuids are reproducible under test. */
function seededRng(): () => number {
  let s = 12345;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** An STT stream that reports 'failed' as soon as it starts (reconnect attempts). */
class FailingSttStream implements SttStream {
  private stateCb?: (s: SttState) => void;
  start(): Promise<void> {
    this.stateCb?.('failed');
    return Promise.resolve();
  }
  sendPcmBase64(): void {}
  onPartial(): void {}
  onFinal(): void {}
  onStateChange(cb: (s: SttState) => void): void {
    this.stateCb = cb;
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('SessionMachine — happy path (ScriptedSttStream + MockApi)', () => {
  it('runs the full session: gate, hit, paid adjust, flagged decrement, summary, wipe', async () => {
    const api = new MockApi({
      diarizeSpeakerSequence: [1, 2], // audit 1 -> 1 voice, audit 2 -> 2 voices
      streakCurrent: 3,
      streakBonusActive: true,
      paidAmountCents: 7, // server pays 7 vs optimistic 5 -> +2 adjust
      flaggedMentionSeqs: [2], // 2nd verify is flagged
      verifyDelayMs: 1500,
      sessionEndResponse: {
        earnedCents: 7,
        paidMentions: 1,
        flaggedMentions: 1,
        durationSec: 50,
        streakCurrent: 3,
        streakBest: 7,
        streakSafe: true,
        bonusActive: true,
      },
    });
    const script: ScriptStep[] = [
      { at: 200, partial: 'starting up' },
      { at: 10000, final: 'so i love anthropic' }, // pre-voice: dropped
      { at: 40000, final: 'anthropic is amazing' }, // real hit -> paid
      { at: 42000, final: 'i also use openai now' }, // real hit -> flagged
    ];
    const machine = new SessionMachine({
      audio: new MockAudioCapture(),
      api,
      sttFactory: () => new ScriptedSttStream({ script }),
      mock: false,
      rng: seededRng(),
    });

    machine.pressRec();
    await jest.advanceTimersByTimeAsync(0); // perms granted + connect kickoff

    // Before the 2nd voice audit, a keyword hit must NOT create a receipt.
    await jest.advanceTimersByTimeAsync(12000);
    expect(machine.getState().phase).toBe('recording');
    expect(machine.getState().voiceState).toBe('one');
    expect(machine.getState().receipts).toHaveLength(0);

    // Past the 2nd audit (t=38s) + both real hits (t=40s, 42s) + verifies.
    await jest.advanceTimersByTimeAsync(38000);
    const st = machine.getState();
    expect(st.voiceState).toBe('two');
    expect(st.receipts).toHaveLength(2);

    const anthropic = st.receipts.find((r) => r.campaignId === 'anthropic')!;
    const openai = st.receipts.find((r) => r.campaignId === 'openai')!;
    expect(anthropic.status).toBe('paid');
    expect(anthropic.amountCents).toBe(7); // adjusted to server amount
    expect(openai.status).toBe('flagged'); // row kept
    expect(openai.reason).toBe('flagged, not paid');

    // Counter: +5 +5 (optimistic), then +2 (paid adjust), then -5 (flagged) = 7.
    expect(st.sessEarnCents).toBe(7);
    expect(st.mentionCount).toBe(1);

    // End -> summary populated from session-end.
    machine.pressEnd();
    await jest.advanceTimersByTimeAsync(6000);
    expect(machine.getState().phase).toBe('summary');
    expect(machine.getState().summary?.earnedCents).toBe(7);
    expect(machine.getState().summary?.syncing).toBe(false);

    // Close -> slice wiped (idle).
    machine.close();
    expect(machine.getState().phase).toBe('idle');
    expect(machine.getState().receipts).toHaveLength(0);
    expect(machine.getState().sessEarnCents).toBe(0);
  });
});

describe('SessionMachine — error + resilience paths', () => {
  it('permission denied -> error (with settings flag) -> idle', async () => {
    const toasts: string[] = [];
    const machine = new SessionMachine({
      audio: new MockAudioCapture({ permission: false }),
      api: new MockApi(),
      mock: true,
    });
    machine.onToast((m) => toasts.push(m));

    machine.pressRec();
    await jest.advanceTimersByTimeAsync(0);

    const st = machine.getState();
    expect(st.phase).toBe('error');
    expect(st.error?.message).toBe(PERMS_DENIED_MESSAGE);
    expect(st.error?.openSettings).toBe(true);
    expect(toasts).toContain(PERMS_DENIED_MESSAGE);

    machine.close();
    expect(machine.getState().phase).toBe('idle');
  });

  it('sessionStart failing x3 -> idle (no session, toast)', async () => {
    const toasts: string[] = [];
    const machine = new SessionMachine({
      audio: new MockAudioCapture(),
      api: new MockApi({ failSessionStartTimes: 3 }),
      mock: true,
    });
    machine.onToast((m) => toasts.push(m));

    machine.pressRec();
    await jest.advanceTimersByTimeAsync(0);
    // Three attempts with 0.5s/1s/2s backoff.
    await jest.advanceTimersByTimeAsync(5000);

    expect(machine.getState().phase).toBe('idle');
    expect(toasts.length).toBeGreaterThan(0);
  });

  it('session-end failing x3 -> summary from client data, flagged syncing', async () => {
    const api = new MockApi({
      diarizeSpeakerSequence: [2, 2],
      streakCurrent: 3,
      streakBonusActive: true,
      failSessionEndTimes: 99, // always fail -> client-data fallback
    });
    const machine = new SessionMachine({
      audio: new MockAudioCapture(),
      api,
      sttFactory: () => new ScriptedSttStream({ script: [{ at: 10000, final: 'anthropic rocks' }] }),
      mock: false,
      rng: seededRng(),
    });

    machine.pressRec();
    await jest.advanceTimersByTimeAsync(12000); // voice confirmed (audit@8s=2), hit@10s
    expect(machine.getState().receipts.length).toBeGreaterThanOrEqual(1);

    machine.pressEnd();
    await jest.advanceTimersByTimeAsync(10000); // flush + 3 sessionEnd retries fail
    const st = machine.getState();
    expect(st.phase).toBe('summary');
    expect(st.summary?.syncing).toBe(true);
  });

  it('redacts the snippet BEFORE calling verifyMention (privacy promise)', async () => {
    const snippets: string[] = [];
    const api: Api = {
      sttToken: () =>
        Promise.resolve({
          provider: 'elevenlabs',
          wsUrl: '',
          token: '',
          expiresAt: '',
          audio: { encoding: 'pcm_16000', sampleRateHz: 16000 },
        }),
      sessionStart: () =>
        Promise.resolve({
          sessionId: 's1',
          startedAt: '',
          streakCurrent: 3,
          streakBonusActive: true,
          campaigns: DEFAULT_MOCK_CAMPAIGNS,
        }),
      diarizeUploadUrl: () => Promise.resolve({ path: 'p', token: 't' }),
      diarizeAnalyze: () =>
        Promise.resolve({ speakerCount: 2, voiceConfirmed: true, lastTwoVoiceAt: null }),
      verifyMention: (req) => {
        snippets.push(req.snippet);
        return Promise.resolve({
          mentionId: 'm1',
          clientMentionId: req.clientMentionId,
          status: 'paid',
          amountCents: 5,
        });
      },
      sessionEnd: () =>
        Promise.resolve({
          earnedCents: 5,
          paidMentions: 1,
          pendingMentions: 0,
          flaggedMentions: 0,
          durationSec: 15,
          streakCurrent: 3,
          streakBest: 3,
          streakSafe: true,
          bonusActive: true,
          inviteBonusCents: 0,
        }),
    };
    const machine = new SessionMachine({
      audio: new MockAudioCapture(),
      api,
      sttFactory: () =>
        new ScriptedSttStream({
          script: [{ at: 10000, final: 'call me at 5551234567 about anthropic please' }],
        }),
      mock: false,
      rng: seededRng(),
    });

    machine.pressRec();
    await jest.advanceTimersByTimeAsync(16000); // voice@8s, hit@10s, +3s wait, verify
    expect(snippets.length).toBeGreaterThanOrEqual(1);
    expect(snippets[0]).not.toContain('5551234567');
    expect(snippets[0]).toContain('[redacted]');
    expect(snippets[0]).toContain('anthropic'); // brand kept
  });

  it('10s server silence -> reconnecting -> 3 fails -> paused (banner exact)', async () => {
    let sttCalls = 0;
    const machine = new SessionMachine({
      audio: new MockAudioCapture(),
      api: new MockApi({ diarizeSpeakerSequence: [1, 1] }),
      sttFactory: (_tok: SttTokenResponse) => {
        sttCalls++;
        // First stream opens (no messages -> goes silent); reconnects fail.
        return sttCalls === 1 ? new ScriptedSttStream({ script: [] }) : new FailingSttStream();
      },
      mock: false,
    });

    machine.pressRec();
    await jest.advanceTimersByTimeAsync(500); // settle perms + sttToken + STT_OPEN
    expect(machine.getState().phase).toBe('recording');
    expect(machine.getState().transport).toBe('ws');

    // 10s liveness stall -> reconnecting.
    await jest.advanceTimersByTimeAsync(10000);
    expect(machine.getState().transport).toBe('reconnecting');

    // Reconnect backoffs 0.5 + 1 + 2s, all fail -> paused.
    await jest.advanceTimersByTimeAsync(4000);
    expect(machine.getState().transport).toBe('paused');
    expect(machine.getState().banner).toBe(PAUSED_BANNER);
  });
});

describe('SessionMachine — MOCK mode (prototype demo timing)', () => {
  it('voice at 3s/6s, first mention ~8s, paid ~1.5s later', async () => {
    const machine = new SessionMachine({
      audio: new MockAudioCapture(),
      api: new MockApi({ streakBonusActive: true, streakCurrent: 3, verifyDelayMs: 1500 }),
      mock: true,
      rng: seededRng(),
    });

    machine.pressRec();
    await jest.advanceTimersByTimeAsync(0);

    await jest.advanceTimersByTimeAsync(3200);
    expect(machine.getState().voiceState).toBe('one');

    await jest.advanceTimersByTimeAsync(3000); // ~6.2s
    expect(machine.getState().voiceState).toBe('two');

    await jest.advanceTimersByTimeAsync(2200); // ~8.4s: first mention fired
    const afterHit = machine.getState();
    expect(afterHit.receipts.length).toBeGreaterThanOrEqual(1);
    expect(afterHit.receipts[0].status).toBe('pending');

    await jest.advanceTimersByTimeAsync(2000); // ~10.4s: verify resolves paid
    expect(machine.getState().receipts.some((r) => r.status === 'paid')).toBe(true);
  });
});
