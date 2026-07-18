import {
  isRecordingScreenActive,
  setRecordingScreenActive,
  track,
  type AnalyticsEvent,
} from '../src/lib/analytics';

describe('analytics', () => {
  it('is a no-op without EXPO_PUBLIC_POSTHOG_KEY (does not throw, returns void)', () => {
    // The key is empty in the test env, so track must never do anything observable.
    expect(track('landing_view')).toBeUndefined();
    expect(track('mention_paid', { amountCents: 5 })).toBeUndefined();
  });

  it('accepts exactly the ten funnel events (union compiles)', () => {
    const events: AnalyticsEvent[] = [
      'landing_view',
      'install_cta_tap',
      'onboard_consent',
      'onboard_brands',
      'onboard_payout',
      'first_session_start',
      'mention_paid',
      'session_end',
      'cashout',
      'invite_share',
    ];
    expect(events).toHaveLength(10);
    for (const e of events) expect(track(e)).toBeUndefined();
  });

  it('tracks the recording-screen privacy flag (session replay must be off while true)', () => {
    expect(isRecordingScreenActive()).toBe(false);
    setRecordingScreenActive(true);
    expect(isRecordingScreenActive()).toBe(true);
    setRecordingScreenActive(false);
    expect(isRecordingScreenActive()).toBe(false);
  });
});
