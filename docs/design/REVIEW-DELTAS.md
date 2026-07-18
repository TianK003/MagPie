# Review deltas

The approved plan (v2) at `C:\Users\admin\.claude\plans\i-want-you-to-federated-haven.md` overrides these design docs where they conflict. Key deltas from adversarial review + user revision:

- Seed campaigns are ElevenLabs / OpenAI / Anthropic — 5¢ flat, cap 20/day, cooldown 60s, no weekend multiplier, `budget_cents=500000` (imaginary €5k) each; NOT the five fictional prototype brands.
- Payouts are non-functional in v1: wallet accrual only; Cash out button → toast "payouts coming soon — your nest is safe"; `cashout` fn is stretch task T24b.
- `profiles` split: sensitive columns (payout_method, invite_code, tz_offset_minutes, consent/onboarding, streak-day bookkeeping) move to self-only `profile_private`; `profiles` keeps friend-visible fields only.
- `campaigns` gains `budget_cents`/`spent_cents` (atomic decrement inside credit_mention; exhaustion → flag `budget_exhausted`).
- Voice gate is continuous: diarize audits every 30s all session; `sessions.last_two_voice_at` freshness ≤3min required to pay (not one-shot voice_confirmed).
- Cooldown + rate heuristics run on server time (`verified_at` / arrival), never client `occurred_at`.
- All SECURITY DEFINER RPCs: `REVOKE EXECUTE FROM PUBLIC` (not just anon/authenticated) + grant to service_role + negative assertion test.
- `mentions` idempotency key is `(user_id, client_mention_id)` (not globally unique).
- `daily_counters.day` is the user-local day; weekend multiplier bounded to local-weekend ∩ [Fri 12:00 UTC, Mon 12:00 UTC].
- Invite bonus: per-inviter caps (3/day, 10 lifetime) + `invite_tombstones` (sha256 of email, survives account deletion); streak increments monotonic, max one per server UTC day.
- New `keyword_sightings` table (server-observed keyword events from diarize transcripts; text discarded) as soft anti-fabrication signal.
- STT: OpenAI realtime model is `gpt-realtime-whisper` (NOT gpt-4o-mini-transcribe); ElevenLabs WS URL requires `model_id=scribe_v2_realtime`; audio package is `@siteed/audio-studio` (canonical name verified at install — `@siteed/expo-audio-studio` is a deprecated re-export shim with no config plugin; ALWAYS import from `@siteed/audio-studio`).
- Mobile: ui zustand slice owned by T2; rank screen sequenced T21→T22; deep-link invite code persisted through auth/onboarding + manual code-entry fallback; pre-degraded-mode WS loss shows "connection lost — mentions paused".
