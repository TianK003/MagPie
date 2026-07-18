# Magpie — Complete Implementation Plan

*(v2 — hardened after 3-lens adversarial review: money-integrity/anti-gaming, technical fact-check, executability.)*

## Context

Magpie is a mobile-native app (Expo/React Native, Android + iOS) that pays people 5–8¢ per legitimate brand mention in real, in-person conversations: tap REC → app verifies 2+ voices → live English transcription → client-side keyword spotting fires instant UI rewards → server-side verification pays or flags each mention → cash out at $5. Gamification (friends leaderboard, streaks, badges, invites) drives retention; anti-gaming (voice gate, caps, cooldowns, natural-conversation check) and privacy (only redacted ±10s snippets ever stored) are first-class requirements.

The repo is greenfield: only design references exist. `CLAUDE.md` (repo root) is the stack source of truth; the full screen-by-screen design spec is `git show 7ca4989:README.md`; `magpie-prototype-standalone.html` is the interactive reference. Production Supabase project `wqxgqqbupmfvmalejnxj` (https://wqxgqqbupmfvmalejnxj.supabase.co) is live and empty — no local stack; migrations go straight to prod (via MCP `apply_migration`, files committed to `supabase/migrations/`). Git remote `https://github.com/TianK003/MagPie.git`; one commit per completed task, pushed to `main`. Implementation is executed by **opus subagents**; Fable coordinates. Full design documents (backend / mobile / delivery, ~97k chars) live in `C:\Users\admin\.claude\projects\C--Users-admin-Downloads-MagPie\1c78efd4-0e74-4edf-8ed2-46c3202b21e7\subagents\workflows\wf_d7ce76ae-771\journal.jsonl` (3 `result` lines: [0]=delivery, [1]=mobile, [2]=backend) — **T1 copies them into `docs/design/` and commits**, adding a `docs/design/REVIEW-DELTAS.md` noting this plan (v2) overrides them where they conflict.

## Locked decisions (user-confirmed 2026-07-18)

| Topic | Decision |
|---|---|
| Platforms | **Android-first** (no Apple Developer account). Codebase iOS-ready (bundle id, safe areas, infoPlist, EAS profiles) but no iOS builds yet. |
| Test target | User's physical Android phone (dev client). PC has Android SDK (local `expo run:android` fallback; emulator = UI only). |
| Expo | User has an account; EAS CLI to install; user runs `eas login` (U1). |
| Auth | **Email OTP** (`signInWithOtp` → `verifyOtp` type `email`). Custom SMTP optional later (U6). |
| Friends | **Invite links only** → friendship on redemption. $1/$1 bonus credits **when invitee completes their first 2-voice-verified session** (+ Sybil caps, §Backend). |
| STT | **ElevenLabs Scribe v2 Realtime primary** (single-use client token), **OpenAI Realtime fallback** (`gpt-realtime-whisper`, ephemeral `ek_` secret), **ElevenLabs batch Scribe** (`diarize:true`) for the 2-voice check. All behind one `SttStream` interface. |
| Analytics | PostHog **no-op stub** behind `src/lib/analytics.ts`; exact CLAUDE.md event names; activates when a key is set. Contract includes: **session replay + autocapture OFF on the recording route** (baked in now so a later key can't violate privacy). |
| Milestone 1 | Custom dev-client build on the user's Android phone against prod Supabase. |
| App ID | `si.magpie.app` (Android package + future iOS bundle id); URL scheme `magpie`. |
| Payouts | **Not functional in v1** (user decision at plan review): mentions deposit straight into the wallet balance (ledger credits); the "Cash out" button keeps the design UI but shows toast "payouts coming soon — your nest is safe". The `cashout` fn + `payout_requests` wiring moves to a stretch task (T24b). |
| Money | Integer cents everywhere (`bigint`); format only at render edge. User-facing display stays `$` per the design; campaign budgets are sponsor-side bookkeeping in cents (imaginary EUR). |
| Seed | **3 real-company campaigns: ElevenLabs, OpenAI, Anthropic — 5¢ flat per company-name detection, imaginary budget €5,000 (500000¢) each** (§Backend/Seed). Company names only as keywords (product names like Claude/ChatGPT deliberately excluded — say the word to add them). Note: with exactly 3 campaigns, the onboarding "pick ≥3 brands" gate means opting into all three; the locked-campaign card UI (CampaignCard locked state) is still built per design but has no seeded instance. |
| Product gaps filled | Level = lifetime paid mentions (L2:25, L3:75, L4:200); badges first_fiver/chatterbox real + brand_loyalist locked; minimal Settings screen (sign out, per-session data delete, account delete); Global leaderboard stays a toast; landing CTA → "Get started → start earning"; streak day = ≥1 voice-confirmed session (user-local day, monotonic, max one increment per server UTC day); streak bonus +5% while streak ≥ 3; weekend 2x per campaign multiplier (bounded, §credit_mention); cooldown 60s/campaign on **server** time. |

## Architecture overview

```
Expo app (dev client; SDK 57 / RN 0.86 New Arch, TS, Expo Router, NativeWind, Zustand, Reanimated)
 ├─ mic: @siteed/expo-audio-studio — dual-stream: 250ms base64 PCM 16k/16-bit/mono callbacks
 │        + 15s PCM ring buffer → WAV (JS header) for diarization audits (every ~30s, ALL session)
 ├─ STT WebSocket DIRECT to provider (token minted by edge fn; provider keys never in app)
 │        ElevenLabs: wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&token=sutkn_…
 │        OpenAI:     wss://api.openai.com/v1/realtime?intent=transcription (Bearer ek_…, RN supports WS headers)
 │        both take base64 audio in JSON frames → hot path is pass-through (no binary frames)
 ├─ keyword spotting CLIENT-SIDE on partials (instant coin pop + pending receipt)
 └─ supabase-js: Auth (email OTP), Postgres reads (RLS), functions.invoke, private
    Broadcast channel `user:{uuid}` (mention flips, ledger, leaderboard, badges)

Supabase (prod only)
 ├─ Postgres: tables + RPCs; RLS everywhere; cents move ONLY inside three RPCs —
 │   credit_mention (mention credits), apply_session_end (invite bonus), request_cashout (debit) —
 │   each a single transaction (advisory lock + cooldown + ON CONFLICT caps + ledger insert)
 ├─ Edge Functions (Deno): stt-token · session-start · diarize · verify-mention · session-end ·
 │   redeem-invite · cashout · delete-session-data · delete-account · housekeeping (+ stt-chunk, M4)
 ├─ Storage: private `diarization` bucket, signed upload URLs, delete-after-processing + cron sweep
 └─ Realtime: broadcast-from-database triggers → private per-user topics; RLS on realtime.messages
```

Trust model: client gates are UX only; **server is the paying authority, on server-observed time** — `occurred_at`, `clientDay`, `tzOffsetMinutes` are display/UX inputs, sanity-clamped, never security inputs. Only direct client writes: `opt_ins` insert/delete and `profile_private` safe columns. Everything money/session/social is edge-function + SECURITY DEFINER RPC.

## Backend design

### Tables (all RLS-enabled; text+CHECK not enums; `timestamptz`; full DDL from docs/design/backend.md as amended here)

| Table | Key columns / notes |
|---|---|
| `profiles` | PK=auth.users id; **friend-visible, non-sensitive only**: display_name, streak_current, streak_best, level (generated from lifetime_paid_mentions: 25/75/200), lifetime_paid_mentions, lifetime_earned_cents, created_at. Created by `handle_new_user` trigger. No client UPDATE except display_name (column grant). |
| `profile_private` | PK=user id; **self-only RLS**: payout_method, consent_at, onboarded_at, tz_offset_minutes (clamped ±840; set via session-start, changes rate-limited 2/week), unique 8-char invite_code, last_active_date, last_counted_server_day. Client may UPDATE payout_method/consent_at/onboarded_at only (column grants). |
| `campaigns` | slug unique, name, category, rate_cents, cap_per_day, weekend_multiplier numeric(3,1), min_level, cooldown_seconds (60), `keywords text[]`, logo_url, active, **budget_cents bigint, spent_cents bigint default 0 CHECK (spent_cents <= budget_cents)** — spent maintained inside `credit_mention`; campaign stops paying at exhaustion. |
| `opt_ins` | PK (user_id, campaign_id). Client-writable (insert gate: campaign active + level ≥ min_level). |
| `sessions` | status active/ended (partial unique: ≤1 active/user), started/ended_at, client_day, voice_confirmed (ever, for streak/summary), **last_two_voice_at** (refreshed by every ≥2-speaker audit — the paying gate), mention_count (paid), earnings_cents (denormalized; ledger is truth), stt_provider, data_deleted_at. |
| `mentions` | **unique (user_id, client_mention_id)** idempotency; session/user/campaign, keyword, occurred_at (display only), status pending/paid/flagged, flag_reason (forced/duplicate/rate/cap_reached/cooldown/voice_gate/verify_failed/budget_exhausted), redacted_snippet (client-regex-redacted at insert → LLM-redacted at verdict → NULL after data delete), amount_cents, base_rate_cents, multiplier_applied, streak_bonus_applied, verify_attempts, verified_at. Partial indexes: cooldown (paid, by verified_at), pending sweep. |
| `keyword_sightings` | (session_id, campaign_id, seen_at) — keyword occurrences the **server itself observed** in diarization-chunk transcripts (text discarded, only the sighting event stored — no PII). Soft anti-fabrication signal (§pipeline). |
| `ledger` | append-only (BEFORE UPDATE/DELETE trigger raises unless `app.allow_ledger_mutation='on'`, set only in `purge_user`); amount_cents ≠ 0 signed; kind mention/invite_bonus/payout/adjustment with CHECKs tying kind↔FK (mention_id / payout_request_id / invite pair); `week_start` generated `(date_trunc('week', created_at AT TIME ZONE 'utc'))::date` (that exact form — immutable; verified on the live DB). Balance = SUM. |
| `daily_counters` | PK (user_id, campaign_id, **day = user-local day** — same tz basis as weekend logic); paid_count. Race-free cap via `ON CONFLICT … DO UPDATE … WHERE paid_count < cap RETURNING`. |
| `weekly_stats` | PK (user_id, week_start); earned_cents, paid_mentions. Coarse aggregate so friends never read raw ledger. Maintained inside the money RPCs. |
| `payout_requests` | amount_cents ≥ 500, method, status requested/sent/failed. |
| `friendships` | ordered pair PK (user_low < user_high CHECK) + index on user_high. |
| `invite_redemptions` | PK invitee_id (one per user), inviter_id, bonus_granted_at. |
| `invite_tombstones` | sha256(lower(email)) PK — written at redemption, **survives account deletion**; blocks delete→re-signup bonus recycling. |
| `badges` / `user_badges` | first_fiver, chatterbox, brand_loyalist (seeded inactive=locked). |
| view `friends_leaderboard` | `security_invoker=true`; **self + friends from profiles/friendships LEFT JOIN weekly_stats (current UTC week) with COALESCE(earned_cents,0)** — zero-week users (incl. "you") always render. |

### RLS matrix (`(select auth.uid())` form; role `authenticated` only; "—" = denied → service-role/edge only)

- SELECT own: profile_private, opt_ins, sessions, mentions, ledger, daily_counters, payout_requests, user_badges, keyword_sightings(via session). SELECT self-or-friend (pair-EXISTS): profiles, weekly_stats. SELECT all-authenticated: campaigns (active), badges. friendships/invite_redemptions: member-only. invite_tombstones: no client access.
- Writes: only `opt_ins` (insert w/ level gate, delete own), `profiles.display_name`, and `profile_private` (payout_method, consent_at, onboarded_at) — all via column grants. **Everything else server-only.**
- `realtime.messages`: SELECT to authenticated where `realtime.topic() = 'user:' || (select auth.uid())::text and extension = 'broadcast'`; no INSERT.

### SECURITY DEFINER RPCs

All RPCs: `set search_path = ''`; **`REVOKE EXECUTE … FROM PUBLIC, anon, authenticated;` then `GRANT EXECUTE … TO service_role;`** (CREATE FUNCTION grants PUBLIC by default — revoking only anon/authenticated leaves them callable; this was the review's critical finding). T5 and T27 must include an `execute_sql` assertion (SET ROLE authenticated → expect permission denied on every RPC).

- **`credit_mention(mention_id, verdict, reason, redacted)`** — the only mention-credit mint. One tx: `pg_advisory_xact_lock(hashtextextended(user||':'||campaign,0))` → row FOR UPDATE, idempotent if not pending → verdict 'forced'→flag → **voice gate: `now() - sessions.last_two_voice_at ≤ 3 min` else flag voice_gate** (continuous, not one-shot) → **cooldown on server time: `now() - last paid mention's verified_at < cooldown_seconds` → flag** (never uses occurred_at) → daily cap ON CONFLICT counter on user-local day (NULL → flag cap_reached) → amount `v` = rate × weekend multiplier **only within local-weekend ∩ [Fri 12:00 UTC, Mon 12:00 UTC]** (bounds tz gaming), +5% if streak ≥ 3 (integer round-half-up) → **campaign budget: `UPDATE campaigns SET spent_cents = spent_cents + v WHERE id = … AND spent_cents + v <= budget_cents RETURNING` (zero rows → flag budget_exhausted)** → mentions=paid + ledger + sessions counters + weekly_stats upsert + profiles lifetime counters + badges (first_fiver ≥ 500¢ lifetime; chatterbox 5 paid/session). Flags keep row + reason (transparent). Soft signal: if session has ≥3 paid mentions for a campaign and **zero `keyword_sightings`** for it, subsequent mentions for that campaign in the session flag `verify_failed` (reason "couldn't hear that one") — partial fabrication defense (R9). |
- **`apply_session_end(session_id, client_day)`** — end session; if voice_confirmed: streak update — client_day clamped server±1 **and monotonic (≥ last_active_date), at most one increment per server UTC day** (`last_counted_server_day`); invite bonus: FOR UPDATE on invite_redemptions where bonus_granted_at null AND **inviter under caps (3 bonuses/day, 10 lifetime)** → +100¢ ledger both sides + weekly_stats.
- **`request_cashout(user, amount, method)`** — advisory lock per user; balance=SUM ≥ 500 and ≥ amount; insert payout_requests + ledger debit.
- **`redeem_invite_tx(invitee, code, email_hash)`** — resolve inviter by code; reject invalid/self/already (PK)/**tombstoned email**; insert friendship (least/greatest, ON CONFLICT DO NOTHING) + tombstone.
- **`purge_user(user)`** — sets `app.allow_ledger_mutation`, deletes user rows (tombstones stay); used by delete-account before `auth.admin.deleteUser`.

### Edge functions (`supabase/functions/<name>/index.ts` + `_shared/`; verify_jwt on except housekeeping; user-scoped client for identity, service-role for writes; envelope `{ok:true,…}|{ok:false,error:{code,message,retryable?}}`; **never log snippet/audio payloads — scrub request bodies from error paths**)

| Fn | Contract (essentials) |
|---|---|
| `stt-token` POST | `{provider?}` → ElevenLabs: `{provider:'elevenlabs', wsUrl:'wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&token=sutkn_…', expiresAt, audio:{encoding:'pcm_16000',sampleRateHz:16000}}` (mint `POST /v1/single-use-token/realtime_scribe`, xi-api-key). Auto-fallback on provider error → OpenAI: `{provider:'openai', wsUrl:'wss://api.openai.com/v1/realtime?intent=transcription', token:'ek_…', model:'gpt-realtime-whisper', audio:{encoding:'pcm16',sampleRateHz:24000}}` (mint `POST /v1/realtime/client_secrets`, session.type 'transcription'; `gpt-realtime-whisper` is the GA streaming-transcription model — `gpt-4o-mini-transcribe` is file-API only). Requires onboarded profile. |
| `session-start` POST | `{tzOffsetMinutes, sttProvider?}` → ends dangling active session, inserts new (stores clamped tz in profile_private, rate-limited 2 changes/week) → `{sessionId, startedAt, streakCurrent, streakBonusActive, campaigns:[{id,name,keywords,rateCents,capPerDay,remainingToday,cooldownSeconds,weekendMultiplier}]}`. **Temp (T16→T20): also sets voice_confirmed=true + last_two_voice_at=now() so M2 pays before diarize exists; T20 removes this and enforces the real gate.** |
| `diarize` POST | `{action:'upload-url'|'analyze', sessionId, path?}` → signed upload to private `diarization` bucket (path `{uid}/{sessionId}/{ts}.wav`, prefix-forgery guard, ≤2MB) → batch `POST /v1/speech-to-text` (scribe_v2, diarize:true) → distinct speaker_id with ≥3 words each → **every ≥2-speaker result refreshes sessions.last_two_voice_at (+ voice_confirmed once)**; extract opted-in-campaign keyword occurrences from the chunk transcript → insert `keyword_sightings`, **discard transcript text**; → `{speakerCount, voiceConfirmed, lastTwoVoiceAt}`. Storage object deleted in `finally`. Client audits at t=8s then **every 30s for the whole session** (gate needs freshness ≤3min). |
| `verify-mention` POST | `{sessionId, campaignId, clientMentionId, keyword, snippet(≤1200, client-regex-redacted), occurredAt}`. Sync: ownership + active-or-ended<2min + voice gate (last_two_voice_at ≤3min, unless temp bypass era) + opt-in + heuristics **on server arrival time** (same-snippet-hash → flagged duplicate; >6 in 60s per session → flagged rate) → server re-runs regex redaction (defense-in-depth) → insert mentions pending (ON CONFLICT (user_id, client_mention_id) → replay returns current state) → respond `{mentionId, status:'pending'}` → `EdgeRuntime.waitUntil(verdict)`. Verdict: gpt-4o-mini combined judge+redact (JSON schema, temp 0) → `credit_mention(...)`; LLM failure → verify_attempts++, housekeeping retries, flagged verify_failed at 3. Outcome reaches client via broadcast. |
| `session-end` POST | `{sessionId, clientDay}` → `apply_session_end` → `{session:{…}, streak:{current,best,todayCounted,bonusActive}, inviteBonusCents}`. Pendings may still flip on summary (channel stays open). |
| `redeem-invite` POST | `{code}` → `redeem_invite_tx` (hashes caller's email server-side) → `{inviter:{id,displayName}, friendshipCreated, bonusPendingCents:100}`. |
| `cashout` POST (**T24b stretch — payouts non-functional in v1**) | `{amountCents?, method?}` → `request_cashout` → `{payoutRequestId, amountCents, newBalanceCents}`. Until T24b lands, the wallet's Cash out button shows toast "payouts coming soon — your nest is safe" and the `cashout` analytics event ships with T24b. |
| `delete-session-data` POST | `{sessionId}` → null snippets + delete keyword_sightings for session + delete storage prefix + set data_deleted_at. Ledger amounts stay (traceability); content is what's deleted. |
| `delete-account` POST | `{confirm:'delete my account'}` → storage prefix delete → `purge_user` → `auth.admin.deleteUser`. Tombstones survive. |
| `housekeeping` POST | verify_jwt=false + `x-cron-secret`. Deletes diarization objects >60min; retries pending mentions >3min (<3 attempts). pg_cron: every 10min via `net.http_post`; separate SQL job ends sessions active >6h. |
| `stt-chunk` POST (M4/T24) | Degraded mode: `{sessionId, base64Wav(5s)}` → ElevenLabs batch STT (no diarize) → `{text}` → client pipeline as FINAL. |

### Verification & redaction pipeline

Stage 0 (client, before transmit): regex redaction — email, phone (`\+?\d[\d\s().-]{6,}\d`), URLs, @handles, 5+ digit runs → `[redacted]` (pure TS in `lib/redact.ts`, shared spec with server). Stage 1 (server): same regex re-applied. Stage 2: gpt-4o-mini single call, temp 0, strict JSON `{verdict:'natural'|'forced', reason:'≤12 words user-visible', redacted_snippet}` — judge natural conversation vs list-reading/repetition/ad-script (ambiguous → lean natural); redact person names, addresses, employers/schools, health/financial; keep brand + flavor; 2–3 few-shots. Stored ever: only `mentions.redacted_snippet` + keyword-sighting events. Raw audio: only transient diarization chunk (deleted in finally + cron). Full transcript never leaves the device. **Known residual (R9, accepted for v1): a client can fabricate natural-sounding snippet text; mitigations = voice-gate freshness, caps, cooldowns, keyword-sightings soft check, and flagged-session review — documented, not silently trusted.**

### Migrations & seed

Timestamped files `supabase/migrations/<UTC-ts>_<name>.sql`, forward-only, applied via MCP `apply_migration` (prod history == committed files; later tasks append later timestamps — realtime and cron land with T18/T19). Initial set (T5): extensions (pg_cron, pg_net) · profiles + profile_private (+trigger+grants) · campaigns+opt_ins · sessions+mentions+keyword_sightings · money (payout_requests→ledger+append-only trigger→daily_counters→weekly_stats) · social (friendships, invite_redemptions, invite_tombstones, badges) · views · RPCs (**+ REVOKE FROM PUBLIC + service_role grants + negative EXECUTE assertion**) · storage bucket (private `diarization`, 5MB, wav) · seed. T18 adds realtime triggers (all four: mention_status on mentions UPDATE OF status; leaderboard on weekly_stats to owner+friends' topics; **ledger on ledger INSERT; badge on user_badges INSERT** — all to `user:{uuid}` topics) + realtime.messages policy. T19 adds cron (Vault CRON_SECRET + 2 jobs).

**Seed** (idempotent ON CONFLICT slug; all 5¢ flat, cooldown 60s, cap 20/day, no weekend multiplier (1.0), L1, **budget_cents 500000 (€5k imaginary)**):

| slug | name | category | keywords |
|---|---|---|---|
| `elevenlabs` | ElevenLabs | AI voice | `{elevenlabs, eleven labs}` |
| `openai` | OpenAI | AI research | `{openai, open ai}` |
| `anthropic` | Anthropic | AI research | `{anthropic}` |

(Company names only per user decision; product-name variants — Claude, ChatGPT, GPT — excluded unless requested. Fuzzy matching still catches near-misses ≥5 chars, e.g. "open AI"→"openai" via normalization.) Badges: first_fiver, chatterbox, brand_loyalist(inactive).

## Mobile design

### Routes (Expo Router) & structure

```
app/_layout.tsx        fonts(SplashScreen gate) · SafeAreaProvider · auth listener + route guard · ToastHost AFTER <Stack>
app/index.tsx          Landing (session+onboarded→tabs; session→onboarding; else Landing)
app/(auth)/login.tsx + verify.tsx          email OTP (60s resend countdown)
app/(onboarding)/consent|brands|payout     Stack gestureEnabled:false + BackHandler no-op (forward-only)
app/(tabs)/index|brands|rank|wallet        custom tabBar (5 cells, center 72px gap) + RecFab (56px, top:-28, 3px paper ring)
app/session.tsx        presentation:'card' slide_from_bottom, gestureEnabled:false (NOT native modal — ToastHost stays on top)
app/summary.tsx        presentation:'transparentModal'; Sheet self-animates (40→0 + fade, 300ms) over 45% ink scrim
app/settings.tsx       account/privacy/deletions
app/invite/[code].tsx  deep link magpie://invite/CODE — code persisted to AsyncStorage if signed-out/mid-onboarding,
                       redeemed automatically after onboarding completes; Rank tab also gets a manual
                       "have a code?" entry fallback (invitee usually has no app yet — R11)
```

`src/`: components per CLAUDE.md names (NestCard, StatTile, CampaignCard, ReceiptRow, TabBar, RecFab, Toast(+Host), Sheet, Waveform, CoinPop, VoicePill, ProgressBar, BrandRow, LeaderboardRow, StreakCard, BadgePill, InviteBanner, EmptyState, OtpInput, ProgressDots, Screen, Wordmark, Button) · `lib/` (supabase.ts, stt.ts + stt/{elevenlabs,openai,chunked,scripted}.ts, audio.ts, keywords.ts, redact.ts, session/{machine,ringBuffer,wav}.ts, api.ts, realtime.ts, analytics.ts, money.ts, streak.ts) · `stores/` single zustand store, slices auth/brands/session/wallet/social/**ui (owned by T2)** · `theme/tokens.ts` (no hex outside tailwind.config.js + this file) · `types/`.

### Key interfaces

```ts
interface SttStream { start(); sendPcmBase64(chunk, sampleRate); onPartial(cb); onFinal(cb);
                      onStateChange(cb: 'connecting'|'open'|'reconnecting'|'closed'|'failed'); close(); }
interface AudioCapture { requestPermission(); start({sampleRate:16000, interval:250}, onChunk(base64)); stop(); }
```
Both providers accept **base64 audio inside JSON text frames**; audio module emits base64 → hot path is pass-through. OpenAI impl handles 16k→24k (declare pcm16@16k if accepted, else linear resample inside the impl). State truth: money/streak/leaderboard always from server; only client-computed money is the optimistic pending amount, reconciled on flip.

### NativeWind tokens

`tailwind.config.js` theme.extend exactly as designed: colors (ink #24241c, paper #fdfdfb, accent #336ca2/tint #9cc4e8/soft #eaf1f8/ondark #dbe9f5, line #e2e1d8/strong #d8d7cc/dashed #c7c6bb, muted 4 steps, rec #c23b3b, disabled), radii card 14/hero 18/row 12/pill 999/sheet 22, border 1.5, spacing screen 20/tap 44/btn 52/fab 56, fontSize 42→9.5, 6 font families (one per weight; `@expo-google-fonts/space-grotesk` + `ibm-plex-mono`, useFonts + expo-font plugin embedding). Reanimated-only: Waveform (scaleY withRepeat, withDelay i×130ms, ~1050ms), CoinPop (rise −36 + fade 1600ms, imperative `pop()`), Sheet (300ms), Toast (250ms in / 2400ms auto-dismiss, single instance), ProgressBar (400ms).

### Session state machine (`lib/session/machine.ts` — pure TS, DI'd services, unit-testable)

```
idle → requestingPerms → connecting → recording → ending → summary → idle
             ↓ denied: toast "magpie needs the mic to hear mentions" + settings deep-link → idle
```
- **connecting**: sessionStart + sttToken in parallel; audio starts immediately (5s pre-connect chunk buffer). STT open → recording. Token/WS fail ×3 → recording with transport per degraded rules below. **sessionStart failure**: retry ×3 w/ backoff → error toast → idle (no sessionId = no session).
- **recording**: 250ms chunks → ring buffer (15s, ~480KB) + stt.sendPcmBase64 (or reconnect queue 20s drop-oldest, or 5s degraded batches). Diarize audits at t=8s then **every 30s for the entire session** (server gate needs ≤3min freshness); voice pill reflects the latest audit: `detecting…`→`1 voice…`→`2 voices ✓` (may regress if a later audit hears one voice — honest UI). **Spotter hits without a fresh 2-voice state are dropped client-side; server enforces the same gate.** Audit network failures: silent, keep last pill state, retry next tick. Transcript buffer (60s rolling + partial) memory-only; only `verifyMention` may read it; snippet is client-regex-redacted (lib/redact.ts) before transmit.
- **WS resilience**: 10s no-server-message while sending = stalled; reconnect re-mints token (single-use) 0.5/1/2s backoff; 3 fails in 60s → **pre-T24: transport 'paused' — banner "connection lost — mentions paused" (hits dropped, honest); post-T24: transport 'degraded' — banner "connection is patchy — still counting"**, 5s WAV batches → stt-chunk; every 60s try WS upgrade.
- **ending**: audio.stop + stt.close → final diarize only if unconfirmed && ≥15s elapsed → wait ≤5s for in-flight verifies → session-end (retry ×3, else client-data summary marked "syncing…", reconcile on next focus) → refetch wallet/social → router.replace('/summary').

### Keyword spotter (`lib/keywords.ts` — pure TS)

Normalize (lowercase → NFKD strip marks → punctuation→space → tokenize); token-sequence matching, word-boundary by construction. Per term token: strip trailing 's/es/s → exact; if len ≥ 5 also Damerau-Levenshtein ≤ 1 (len ≤ 4 exact-only — protects "crisp"). Partial-rewrite dedupe: per-utterance occurrence counts, fire only on increase; FINAL reconciles (never retracts fired UI hits — server corrects). Per-campaign 8s client suppression window; server cooldown/caps remain authority. Hit → same frame: pending receipt + CoinPop + counter += optimistic amount; async: wait ≤3s for covering FINAL → verifyMention; flip on broadcast: paid (adjust to server amount) / flagged (decrement; grey row, mono "flagged, not paid"). `mention_paid` fires on the paid flip.

### Native adaptation & copy deltas (else verbatim from spec)

Landing CTA "Get started → start earning" (`install_cta_tap`); mono note "no follower count needed"; "log in" → real auth. Auth copy: "What's your email?"/"Send code"; "Check your inbox"/"6 digits · expires in 10 min". Gated buttons stay pressable-but-gated so invalid taps toast. Session: expo-keep-awake; Android back = End session; FGS notification "magpie is listening / recording — tap to return". Gift-cards toast → "Gift cards are coming — stack that +10%"; settings toast dropped (real screen); empty states: wallet "Nothing here yet — your first mention starts the ledger.", rank "just you so far — magpies flock together". ToastHost sibling after Stack. Analytics events (all 10 from CLAUDE.md): landing_view, install_cta_tap, onboard_consent, onboard_brands, onboard_payout, first_session_start, mention_paid, session_end, cashout, invite_share.

### app.config.ts / eas.json

`si.magpie.app`; **`scheme: 'magpie'`**; newArchEnabled; Android permissions RECORD_AUDIO, POST_NOTIFICATIONS, FOREGROUND_SERVICE, FOREGROUND_SERVICE_MICROPHONE; iOS infoPlist ready; plugins: expo-router, expo-font (embed 6 ttf — **font packages are T1 scope so the day-1 build embeds them**), `@siteed/expo-audio-studio` (bg audio + FGS notification; confirm plugin option keys at install; commented fallback block for react-native-audio-api). eas.json: development (dev client, APK) / preview (APK) / production (AAB); `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` (publishable) in profile env + committed `.env` (public-safe). Provider keys ONLY as Supabase function secrets. metro.config.js: shims for supabase-js (`ws`/`stream`) + structuredClone polyfill + `react-native-url-polyfill/auto` (verify against installed supabase-js version).

## Implementation: task DAG for opus agents

One task = one opus session = one commit to main (`T<id>: <what> — <demo note>`), gated on `npx tsc --noEmit && npx expo lint && npm test`. Backend tasks additionally: MCP apply_migration + sanity `execute_sql` + `get_advisors` clean in the same session. Lanes are path-disjoint (`src/`+`app/` vs `supabase/`); the ui slice belongs to T2; rank.tsx is sequenced T21→T22.

### Phase 1 → M1 "It's on my phone"

| ID | Task | Deps | Done criteria |
|---|---|---|---|
| T1 | Scaffold: Expo SDK 57 TS at repo root; ALL native deps (expo-dev-client, expo-router, expo-font, **@expo-google-fonts/space-grotesk + ibm-plex-mono**, @siteed/expo-audio-studio, reanimated, safe-area, screens, AsyncStorage, expo-clipboard, expo-keep-awake) so ONE dev build lasts to M4; app.config.ts (incl. **scheme**) + eas.json + metro shims + jest-expo/RNTL + .env.example + empty supabase/ dirs; copy 3 design docs → docs/design/ + REVIEW-DELTAS.md | — | quality gates pass; supabase-js smoke-import compiles |
| T2 | Tokens/theme/primitives: tailwind.config.js, fonts wired, Toast/Sheet/Button, **ui slice** | T1 | token snapshot test; gallery screen renders fonts + toast |
| T3 | Nav shell: route groups, TabBar + RecFab, session modal + summary sheet routes | T2 | all routes reachable; REC opens session |
| T4 | Lib interfaces + mocks first + store: audio.ts/stt.ts (+Mock/Scripted impls), keywords.ts + redact.ts (REAL), session/machine.ts (mock mode = prototype timing incl. denied/error paths), analytics.ts stub (replay-off contract), money.ts, slices (except ui) | T1,T2 | unit tests: matcher (fuzzy), redact, money, machine event sequence + denied path from scripted transcript |
| T5 | Initial migrations (schema+RLS+grants+RPCs+bucket+seed, §Migrations) applied to prod + committed | T1 | advisors zero errors; seed visible; **negative RPC EXECUTE assertion passes** |
| T6 | supabase.ts client + generated types + api.ts wrappers | T1,T5 | typecheck vs generated types; mocked-client query test |
| T7 | Landing + Onboarding (3 gated, forward-only, exact copy) | T3,T4 | RNTL gate tests; toasts on invalid taps |
| T8 | Home + Session overlay + Summary sheet, mock-wired; real mic permission then mock engine | T3,T4 | full fake session e2e in emulator; perm prompt (grant + deny paths) |
| T9 | Brands + Wallet screens (mock) | T3,T4 | exact copy; opt-in toggle; cashout gate test |
| T10 | Rank + Settings screens (deletion stubs) | T3,T4 | renders from mock social slice; invite toast |
| T11 | EAS dev build (fire right after T1) + install on phone | T1,**U1** | APK connects to `npx expo start --dev-client` |

### Phase 2 → M2 "Real words, real cents"

| ID | Task | Deps | Done criteria |
|---|---|---|---|
| T12 | Real AudioCapture (dual-stream, 250ms PCM, ring buffer, FGS notification, keep-awake) | T1,T4,T11,U5 | on-device debug overlay: chunk cadence + RMS with screen locked 60s |
| T13 | Auth: email OTP screens, session persistence, route guard, onboarding persistence (profiles/profile_private + opt_ins) | T6,T7,**U2** | OTP round-trip on device; kill/relaunch stays signed in |
| T14 | Edge fn stt-token (both providers + auto-fallback; ElevenLabs wsUrl incl. model_id; OpenAI model gpt-realtime-whisper) | T5,**U3** | curl smoke returns sutkn_/ek_ |
| T15 | Real SttStreams (ElevenLabs + OpenAI, reconnect/re-mint, send-queue, failover) | T12,T13,T14 | mocked-WS unit tests; on-device partials <1s |
| T16 | Edge fns session-start/session-end + verify-mention (heuristics on server time → redact → pending insert → waitUntil verdict → credit_mention incl. budget check). session-start ships the **documented temp voice-gate bypass** (removed in T20) | T5,**U3** | curl matrix: natural→paid+ledger (wallet balance grows); spam→flagged no-ledger; rapid→cooldown (server-time, forged occurredAt ineffective); PII→[redacted] |
| T17 | Real session loop: machine real mode end-to-end + analytics events; pre-T24 WS-loss behavior = 'paused' banner | T8,T13,T15,T16 | scripted-transcript integration test green; on-device conversation pays (voice pill may stay "detecting…" — gate arrives M3) |
| T18 | Realtime migration (all 4 triggers + realtime.messages policy) + realtime.ts wiring | T5,T17,**U4** | on-device receipt flips live; advisors clean |

### Phase 3 → M3 "Honest + social"

| ID | Task | Deps | Done criteria |
|---|---|---|---|
| T19 | diarize fn (audits refresh last_two_voice_at + keyword_sightings) + storage flow + cron migration + housekeeping fn | T5,**U3** | curl: 2-speaker wav→confirmed+timestamp; 1→not; chunk deleted; sightings rows appear |
| T20 | Voice-gate integration: continuous audits, honest pill, client+server accrual gate, **remove T16 bypass** | T17,T19 | solo talking never pays (even after an early 2-voice moment); two voices unlocks |
| T21 | finalize-session + wallet real: streak/badges/invite-bonus via apply_session_end; summary + rank real data; **wallet balance + history from ledger; Cash out button → "payouts coming soon — your nest is safe" toast** | T5,T17,T19,T20 | streak chip flips; badge appears; wallet == ledger SUM live; streak-math unit tests (midnight/tz/monotonic) |
| T22 | redeem-invite fn + deep link (pending-code persistence, manual code entry fallback) + friends leaderboard live | T5,T13,T18,T21 | two accounts: redeem→both on boards (zero-week rows included), live updates |
| T23 | Settings deletions: delete-session-data (+sightings) + delete-account wired | T13,T19 | SQL-verified cascade (snippets nulled, sightings+audio gone) |

### Phase 4 → M4 "Shippable"

| ID | Task | Deps | Done criteria |
|---|---|---|---|
| T24 | Degraded mode + stt-chunk fn (stretch — cut first; 'paused' copy stays if cut) | T17 | poor-network test yields delayed mentions |
| T24b | Real cashout (stretch): `cashout` fn + wallet wiring + `cashout` analytics event (RPC already in T5 migrations) | T21 | cash out over $5 → payout_requests row + ledger debit + toast "$X.XX sent — lands in 1–2 days" |
| T25 | Test hardening: full-flow scripted suite; anti-gaming matrix (cap, cooldown, voice-gate incl. confirm-once-then-solo, forged occurredAt/clientDay, flagged-not-paid, cross-user client_mention_id); ledger property: **every kind='mention' credit ↔ exactly one paid mention; invite_bonus ↔ invite_redemptions; payout ↔ payout_requests; balance == SUM** | T17,T21 | npm test green with listed coverage |
| T26 | Polish + copy audit vs `git show 7ca4989:README.md` (strings, animation timings, ≥44px targets) | T7–T10,T17 | audit checklist in commit; emulator visual pass |
| T27 | Security/perf pass: advisors green; RLS review; **re-assert RPC EXECUTE denials**; hot-path indexes | all migrations | zero advisor errors (documented exceptions only) |
| T28 | `eas build --profile preview` standalone APK | everything | full M2+M3 script passes without dev server |

## Verification

- Every commit: `npx tsc --noEmit && npx expo lint && npm test`.
- Edge fns: curl smoke tests with real user JWT (docs/design/delivery.md §6) + `execute_sql` assertions: balance == SUM; per-kind ledger↔FK integrity; flagged mentions have no ledger row; PII stored as `[redacted]`; authenticated cannot EXECUTE money RPCs.
- On-device scripts (user): **M1** (~5 min): install dev client → landing → onboarding gates → tabs → REC → mic prompt (try deny once, then grant) → fake session → summary → nest updates. **M2** (~10 min, U2+U3 done): OTP sign-in persists; 3 seeded campaigns (ElevenLabs, OpenAI, Anthropic — 5¢ each); live partials <1s; natural "I used ElevenLabs for the voiceover yesterday" → coin pop → flips paid ~5s, wallet balance +5¢ (voice pill may stay "detecting…" — gate lands M3); "anthropic anthropic anthropic" → flagged, not paid; balance == ledger; screen locked 60s keeps recording. **M3**: solo pays $0 (including after a brief 2-voice start); 2-person session pays; streak counts today; Cash out button → "payouts coming soon" toast; invite redeem (deep link AND manual code) → mutual live leaderboards; session delete provably cascades. **M4**: preview APK reruns M2+M3 with no dev machine.

## User-action checklist

| # | Action | When |
|---|---|---|
| U1 | `npm i -g eas-cli && eas login`; confirm `eas init` link when asked | right after T1 (day 1) |
| U2 | Supabase Dashboard → Auth → Email Templates: OTP template shows `{{ .Token }}` | before T13 |
| U3 | `supabase secrets set ELEVENLABS_API_KEY=… OPENAI_API_KEY=… CRON_SECRET=…`; confirm ElevenLabs plan includes realtime STT | before T14/T16/T19 |
| U4 | Dashboard → Realtime: private-channel authorization enabled | before T18 |
| U5 | Install dev-client APK on phone (EAS link/QR); same Wi-Fi or ask for `--tunnel` | at T11 |
| U6 | (Optional) custom SMTP (Resend free) when OTP limits bite | during M2 |

## Risk register

| # | Risk | Mitigation → Fallback |
|---|---|---|
| R1 | @siteed/expo-audio-studio API drift / New-Arch quirk | verify at T1 install; T12 on-device proof early → swap react-native-audio-api behind AudioCapture (one rebuild) |
| R2 | supabase-js Metro shims (ws/stream/structuredClone) on SDK 57 | pin versions, smoke-import in T1 → pin back a minor; realtime load-bearing only from T18 |
| R3 | Scribe realtime unavailable on plan / format drift | T14 day-1 curl; both providers behind SttStream → flip primary to OpenAI gpt-realtime-whisper (one line) |
| R4 | Android 14+ FGS mic dies on screen-off | config plugin FGS microphone + notification; T12 60s locked test → keep-awake + document screen-on for v1 |
| R5 | WS instability | JSON+base64 frames, reconnect+re-mint, bounded queue → T24 degraded chunk POSTs ('paused' honesty pre-T24) |
| R6 | OTP rate limits during testing | persisted sessions, 2–3 test emails, U6 SMTP → dev-only password test user via admin API |
| R7 | EAS free-tier queue delays | only 2 builds planned (T11 day 1, T28) → local `expo run:android` |
| R8 | Prod-DB-only dev pollutes prod | RLS from migration 1, forward-only migrations, idempotent seeds, test accounts, advisors each migration; cleanup SQL in supabase/scripts (manual) → `supabase db dump` before risky changes |
| R9 | **Fabricated snippets** (client invents natural text never spoken) | accepted v1 residual, documented: voice-gate freshness + caps + cooldowns + keyword_sightings soft check + flag-review; full fix (server re-transcription audits) postponed |
| R10 | **Sybil invite farming** (throwaway emails, delete-recycle) | first-verified-session gate + per-inviter caps (3/day, 10 lifetime) + email-hash tombstones surviving deletion |
| R11 | Invite link unusable for app-less invitees (custom scheme only) | manual code entry in Rank + share text includes the code; https App Links post-v1 |

## References

- `CLAUDE.md` (repo root) — stack, tokens, exact copy, analytics events, anti-gaming/privacy requirements.
- `git show 7ca4989:README.md` — full design spec (copy canonical).
- Full designs: `docs/design/{backend,mobile,delivery}.md` after T1 (+ REVIEW-DELTAS.md; this plan overrides on conflict).
- Verified API facts (re-verify at first use): ElevenLabs single-use token `POST /v1/single-use-token/realtime_scribe`; realtime WS `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&token=…` (`input_audio_chunk`/`partial_transcript`/`committed_transcript`); batch `POST /v1/speech-to-text` (scribe_v2, diarize, words[].speaker_id); OpenAI `POST /v1/realtime/client_secrets` + `wss://api.openai.com/v1/realtime?intent=transcription`, model `gpt-realtime-whisper`, no OpenAI-Beta header (GA); Supabase `realtime.send(payload,event,topic,is_private)`/`broadcast_changes`; `createSignedUploadUrl` (2h fixed); EdgeRuntime.waitUntil; pg_cron+pg_net free tier; `date_trunc('week', ts AT TIME ZONE 'utc')` immutable (verified on live DB — never bare `::timestamp`); PostgREST enforces column-level grants; Expo SDK 57 (RN 0.86, 2026-06-30).
