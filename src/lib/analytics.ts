/**
 * PostHog analytics seam.
 *
 * Contract (CLAUDE.md §Analytics, plan §Native adaptation):
 * - `track()` is a NO-OP unless `EXPO_PUBLIC_POSTHOG_KEY` is set — analytics is
 *   optional and must never break the app when the key is absent.
 * - The event union below is EXACTLY the ten funnel events; adding/removing one
 *   is a deliberate product change, not an incidental edit.
 * - PRIVACY (baked in now, wired when PostHog lands): while the recording screen
 *   is active, session replay AND autocapture MUST be OFF. `setRecordingScreenActive`
 *   is the seam the recording route toggles; the future PostHog init reads it.
 *   This is a user-facing promise — the recording screen is never replayed.
 */

export type AnalyticsEvent =
  | 'landing_view'
  | 'install_cta_tap'
  | 'onboard_consent'
  | 'onboard_brands'
  | 'onboard_payout'
  | 'first_session_start'
  | 'mention_paid'
  | 'session_end'
  | 'cashout'
  | 'invite_share';

/** True only while the recording session screen is mounted. */
let recordingScreenActive = false;

/**
 * Toggle the recording-screen privacy flag. When PostHog is wired (later task),
 * `true` here MUST disable session replay + autocapture; `false` re-enables.
 * No-op today beyond storing the flag — the seam exists so the privacy promise
 * is impossible to forget when the real client is added.
 */
export function setRecordingScreenActive(active: boolean): void {
  recordingScreenActive = active;
}

/** Test/PostHog-init read hook for the recording-screen privacy flag. */
export function isRecordingScreenActive(): boolean {
  return recordingScreenActive;
}

/**
 * Track a funnel event. No-op unless `EXPO_PUBLIC_POSTHOG_KEY` is present.
 * When PostHog is wired, this forwards to `posthog.capture(event, props)` —
 * and MUST NOT capture anything while `isRecordingScreenActive()` is true.
 */
export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  if (!process.env.EXPO_PUBLIC_POSTHOG_KEY) return;
  // TODO(analytics task): posthog.capture(event, props) — guarded by
  // isRecordingScreenActive() for replay/autocapture. Intentionally a stub.
  void event;
  void props;
}
