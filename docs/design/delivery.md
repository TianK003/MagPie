# Magpie — Delivery Plan (Opus Subagent Execution Strategy)

Scope of this document: task DAG, milestone sequencing, commit hygiene, user-action checklist, risk register, and per-phase verification. Constraints held fixed: prod Supabase `wqxgqqbupmfvmalejnxj` only, Android-first, integer cents, RLS everywhere, provider keys server-side only, per the briefing at `C:\Users\admin\.claude\plans\i-want-you-to-federated-haven.md` and `C:\Users\admin\Downloads\MagPie\CLAUDE.md`.

---

## 0. The one strategic decision everything hangs on

**Front-load every native dependency into the scaffold task (T1), kick off the EAS dev-client build immediately after T1, and never touch native config again until M4.** A dev client is a shell: all subsequent work (screens, STT, realtime, anti-gaming) is pure JS/TS loaded over Metro — no rebuilds. This is what makes "dev build on the phone ASAP" real: the build queues in the background (15–45 min on EAS free tier) while agents build tokens, schema, and screens in parallel. A rebuild is only ever needed if the audio module must be swapped (Risk R1).

Native deps locked into T1: `expo-dev-client`, `expo-router`, `expo-font`, `@siteed/audio-studio` (verify current npm name at install; config plugin with Android FGS-microphone + notification), `react-native-reanimated`, `react-native-safe-area-context`, `react-native-screens`, `@react-native-async-storage/async-storage`, `expo-clipboard`, `expo-keep-awake`. JS-only (no rebuild impact): nativewind, zustand, @supabase/supabase-js + polyfills, base64-arraybuffer, jest-expo, RNTL.

---

## 1. Task DAG

Four parallel lanes after T1: **App-shell**, **Lib/mocks**, **Backend**, **Build**. Each task = one focused opus session with a commit at the end.

```
T1 scaffold ──┬─▶ T2 tokens/theme ──▶ T3 nav shell ──┬─▶ T7 landing+onboarding ─┐
              │                                      ├─▶ T8 home+session+summary┤ (mock-wired)
              ├─▶ T4 lib interfaces + mocks ─────────┼─▶ T9 brands+wallet ──────┤
              │        │                             └─▶ T10 rank+settings ─────┘
              ├─▶ T11 EAS dev build (background; user: eas login)   ══ M1 on device
              │
              └─▶ T5 DB migration 001 (schema+RLS+seed+RPC) ─▶ T6 supabase client+types+api
T5 ─▶ T14 stt-token ─┐            T5 ─▶ T16 verify-mention
T4+T1 ─▶ T12 real AudioCapture ──┤
T6+T7 ─▶ T13 auth (email OTP)    ├─▶ T15 real SttStreams ─▶ T17 real session loop ══ M2
T16 ────────────────────────────-┘                              │
T5 ─▶ T18 realtime migration 002 + client wiring ◀──────────────┤
T5+T12 ─▶ T19 diarize fn + storage + pg_cron ─▶ T20 voice gate ─┤
T5+T17 ─▶ T21 finalize-session (streak/badges/invite bonus) ────┤ ══ M3
T5+T13 ─▶ T22 redeem-invite + friends leaderboard live ─────────┤
T13+T19 ─▶ T23 settings deletions (cascade + delete-account fn) ┘
T17 ─▶ T24 degraded mode (stretch) · T25 integration tests · T26 polish/copy audit
all migrations ─▶ T27 advisors/security pass ─▶ T28 preview build ══ M4
```

### Phase 1 tasks (→ M1)

| ID | Task | Inputs | Outputs | Done criteria | Deps | Parallel with |
|---|---|---|---|---|---|---|
| **T1** | Scaffold + native deps + EAS config | CLAUDE.md, briefing | Expo SDK 57 TS app at repo root; `app.config.ts` (`si.magpie.app`, Android perms: `RECORD_AUDIO`, `FOREGROUND_SERVICE_MICROPHONE`, `POST_NOTIFICATIONS`; audio config plugin); `eas.json` (development/preview/production); `metro.config.js` with supabase-js shims (`ws`/`stream`/`structuredClone`); jest-expo + RNTL wired; `.env.example`; empty `supabase/migrations/` + `supabase/functions/` dirs | `npx tsc --noEmit`, `npx expo lint`, `npm test` (1 smoke test) all pass; `import { createClient } from '@supabase/supabase-js'` compiles under Metro | — | — |
| **T2** | Design tokens + theme + primitives | CLAUDE.md tokens, `git show 7ca4989:README.md` | `tailwind.config.js` theme.extend (all hex tokens, radii, borders); Space Grotesk + IBM Plex Mono via expo-font; `Toast` (single-instance, 2.4s), `Sheet`, button variants incl. disabled grey; `ui` store slice | Token snapshot test; a styles gallery screen renders both fonts + toast | T1 | T4, T5, T11 |
| **T3** | Navigation shell | T2 | Expo Router groups: `(onboarding)` stack, `(tabs)` home/brands/rank/wallet, session full-screen modal, summary sheet; `TabBar` (5-cell, geometric icons) + `RecFab` (56px, glow) per spec; Toast host mounted at root | All routes reachable; tab bar pixel-matches spec; REC opens session modal | T2 | T4, T5 |
| **T4** | Lib interfaces + **mocks first** + store | CLAUDE.md pipeline section | `src/lib/audio.ts` (`AudioCapture` iface + `MockAudioCapture`), `src/lib/stt.ts` (`SttStream` iface: `onPartial/onFinal/close` + `MockSttStream` scripted transcripts), `src/lib/keywords.ts` (**real** fuzzy matcher, pure TS), `src/lib/session-engine.ts` (orchestrator; mock mode = prototype timing: voices 3s/6s, paced mentions), `src/lib/analytics.ts` (PostHog no-op stub, exact event names), `src/lib/money.ts` (cents→display); Zustand slices `auth/brands/session/wallet/social` | Unit tests: keyword matcher (incl. fuzzy variants), money formatting, engine event sequence from scripted transcript | T1 | T2, T3, T5 |
| **T5** | DB migration 001: schema + RLS + seed + RPC | Briefing schema patterns | `supabase/migrations/<ts>_core_schema.sql`: `profiles` (signup trigger), `campaigns`, `opt_ins`, `sessions` (`week_start` generated col, indexed), `mentions` (status enum), `ledger` (append-only bigint cents), `payout_requests`, `friendships` (ordered pair PK), `invites`, `daily_counters` (cap via `ON CONFLICT … WHERE count < cap`), `badges`; `request_payout()` RPC (balance≥500 check, security definer); weekly leaderboard `security_invoker` view; RLS with `(select auth.uid())` on **every** table; idempotent seed of the 5 campaigns (Voltz 8¢/20/2x-weekend, Strut 5¢/30, Nimbus 8¢/15, Crisp 5¢/25, Lumen 6¢/10/min_level 3) | Applied to prod via MCP `apply_migration`; `get_advisors` security = zero errors; seed visible via `execute_sql`; file committed | T1 (repo only) | T2–T4, T11 |
| **T6** | Supabase client + types + data layer | T5 applied | `src/lib/supabase.ts` (AsyncStorage, persistSession, AppState auto-refresh, `detectSessionInUrl:false`, publishable key); `src/types/database.ts` from `generate_typescript_types`; `src/lib/api.ts` (campaigns, opt-ins, sessions, ledger/balance, leaderboard, profile queries) | Typecheck against generated types; a query test with mocked client | T1, T5 | T7–T10 |
| **T7** | Screens: Landing + Onboarding | T3, T4 | Landing (waveform demo card, "Get started → start earning" CTA), 3 gated forward-only steps with exact copy/gates (consent / ≥3 brands / payout radio); analytics events `landing_view`, `install_cta_tap`, `onboard_*` | Gates enforced (grey disabled + toast); RNTL tests for the 3 gates | T3, T4 | T8–T10 |
| **T8** | Screens: Home + Session overlay + Summary sheet (mock-wired) | T3, T4 | Nest card, stat tiles, activity list + empty state; session overlay (REC pill, voice pill states, 7-bar waveform, live counter + coin pop, receipts feed, end button, footer copy); summary sheet (slide-up, streak card); **real mic permission request** via `AudioCapture.requestPermission()` then mock engine drives everything | Full fake session loop works end-to-end in emulator; permission prompt fires on first REC | T3, T4 | T7, T9, T10 |
| **T9** | Screens: Brands + Wallet | T3, T4 | Campaign cards (rate pill, multiplier note, join toggle, locked card 55%/toast), wallet (progress bar anim .4s, cash-out gating + toasts, history rows, gift-card toast) | Matches spec copy exactly; opt-in toggle updates store; cashout gate test | T3, T4 | T7, T8, T10 |
| **T10** | Screens: Rank + Settings | T3, T4 | Leaderboard rows + "you" row, scope pills (Global→toast), streak card + 7 day-chips, badge pills, invite banner + Share; minimal Settings (sign out, delete session data, delete account — wired to stubs for now) | Renders from mock social slice; invite copy toast works | T3, T4 | T7–T9 |
| **T11** | EAS dev-client build + install | T1; **user: `eas login`** | `eas build --profile development --platform android` kicked off right after T1 merges; install link/QR for the phone | APK installed on user's phone; app connects to `npx expo start --dev-client` (use `--tunnel` if Wi-Fi blocks LAN) | T1 + user action U1 | Everything |

**M1 = T11 build + T3/T4/T7–T10 loaded over Metro.**

### Phase 2 tasks (→ M2)

| ID | Task | Outputs | Done criteria | Deps |
|---|---|---|---|---|
| **T12** | Real `AudioCapture` | `@siteed/audio-studio` dual-stream: `onAudioStream` 250ms base64 PCM 16k/16-bit/mono; JS ring buffer (last 15s) for diarization; FGS notification on Android; keep-awake on session screen | On-device: debug overlay shows chunk cadence + RMS while phone screen locked ≥60s | T1, T4 |
| **T13** | Auth: email OTP + profile bootstrap | Sign-in screen (`signInWithOtp` → `verifyOtp` type `email`), session persistence, auth-gated routing (landing→auth→onboarding→tabs), onboarding completion + payout choice persisted to `profiles`; opt-ins persisted to `opt_ins` | OTP round-trip on device works; kill/relaunch stays signed in; **needs user actions U2 (OTP template) done first** | T6, T7 |
| **T14** | Edge fn: `stt-token` | Deno fn, `verify_jwt` on: default mints ElevenLabs single-use token (`POST /v1/single-use-token/realtime_scribe`); `?provider=openai` mints ephemeral secret (`POST /v1/realtime/client_secrets`, `session.type: "transcription"`); includes the caller's opted-in keyterms for Scribe biasing | Deployed; curl smoke test returns `sutkn_…` / `ek_…`; **needs user action U3 (secrets) first**; source committed under `supabase/functions/stt-token/` | T5, U3 |
| **T15** | Real `SttStream` impls | `ElevenLabsScribeStream` (WS `wss://…/speech-to-text/realtime?token=`, JSON `input_audio_chunk` w/ base64 — no binary frames needed; `partial_transcript`/`committed_transcript`); `OpenAIRealtimeStream` (WS w/ `Authorization: Bearer ek_…`, resample/confirm 24k vs 16k); shared reconnect + send-queue; provider selection with automatic failover | Unit tests with mocked WS; on-device: partials appear <1s while speaking | T12, T14 |
| **T16** | Edge fn: `verify-mention` (full anti-gaming) | Receives ±10s snippet + campaign + session; `_shared/redact.ts` (regex + gpt-4o-mini) **before any persistence**; gpt-4o-mini natural-conversation judge; in one transaction: `pg_advisory_xact_lock` cooldown (60s/campaign) + `daily_counters` cap upsert + `mentions` insert (`paid`/`flagged`) + `ledger` credit (streak +5%, weekend 2x applied server-side); never blocks client | Curl tests: natural snippet→`paid`+ledger row; list-reading snippet→`flagged`, no ledger; 2 rapid calls→second flagged by cooldown; PII in snippet stored as `[redacted]` | T5, U3 |
| **T17** | Real session loop wiring | `session-engine` real mode: capture→STT→keyword matcher→instant pending receipt + coin pop→fire-and-forget `verify-mention`→session row lifecycle (insert on start, finalize on end); degraded-mode hook stubbed; analytics `first_session_start`, `mention_paid`, `session_end` | On-device conversation produces paid mentions (see M2 script §6); RNTL integration test via `MockSttStream` scripted transcript covers hit→pending→paid/flagged→summary | T8, T13, T15, T16 |
| **T18** | Realtime: migration 002 + client wiring | `realtime.broadcast_changes()` triggers on `mentions` (per-user topic) + ledger/week totals (per-week leaderboard topic); RLS on `realtime.messages` via `realtime.topic()`; client `realtime.setAuth()` + private-channel subscriptions; receipts flip `pending→paid/flagged` live | On-device: receipt flips without refresh; advisors clean; **needs user action U4** | T5, T17 |

**M2 = T12–T18 complete.**

### Phase 3 tasks (→ M3)

| ID | Task | Outputs | Done criteria | Deps |
|---|---|---|---|---|
| **T19** | Edge fn: `diarize` + storage | Private `audio-chunks` bucket + storage RLS; fn issues `createSignedUploadUrl`, then diarizes uploaded WAV via batch Scribe (`scribe_v2`, `diarize:true`), counts distinct `speaker_id`, updates `sessions.voice_confirmed`, deletes chunk after processing; `pg_cron` sweep for orphans (migration 003) | Curl: upload 2-speaker WAV→confirmed true; 1-speaker→false; chunk gone after processing | T5, U3 |
| **T20** | Voice-gate integration | Ring buffer→WAV wrap (JS header)→signed upload→diarize every ~30s; voice pill `detecting…`→`1 voice…`→`2 voices ✓`; **mentions accrue only after ✓** (client gate + server rejects mentions for unconfirmed sessions) | On-device: solo talking never pays; two voices unlocks accrual | T17, T19 |
| **T21** | Edge fn: `finalize-session` | On session end (device tz sent): earnings totals, streak update (+day counted if voice-confirmed session), best_streak, badge grants (First Fiver, Chatterbox), invite $1/$1 bonus on invitee's **first voice-confirmed session**; summary sheet + rank tab consume real data | Curl + on-device: streak chip flips "today counted — +5% active"; badge appears; unit tests for streak math edge cases (midnight, tz) | T5, T17 |
| **T22** | Invites + social live | Edge fn `redeem-invite` (code→friendship, ordered pair); invite share (native Share + clipboard, `invite_share` event); friends leaderboard from view, live via T18 topic; Global stays toast | Two test accounts: redeem→friendship row→both appear on each other's boards; live update on new earnings | T5, T13, T18 |
| **T23** | Settings deletions | Delete-session-data: cascade mentions/snippets + storage chunks (RPC or fn); edge fn `delete-account` (admin API, service-role); sign out | Deleting a session removes its snippets + audio verifiably (SQL check); account delete removes auth user + rows | T13, T19 |

**M3 = T19–T23 complete.**

### Phase 4 tasks (→ M4)

| ID | Task | Outputs | Done criteria | Deps |
|---|---|---|---|---|
| **T24** | Degraded mode (stretch — cut first if behind) | WS-failure fallback: 5s recorded chunks POSTed to a small edge fn → batch STT → same downstream events | Airplane-mode-then-poor-network test still yields mentions (delayed) | T17 |
| **T25** | Test hardening | Full-flow integration suite on `MockSttStream`; anti-gaming matrix (cap, cooldown, voice gate, flagged-not-paid); ledger integrity property test (balance == SUM, every credit→mention) | `npm test` green; coverage of the listed domains | T17, T21 |
| **T26** | Polish + copy audit | Animation timings per spec (waveform 1.05s/.13s stagger, coin 1.6s, sheet .3s, progress .4s); every string diffed against `git show 7ca4989:README.md`; empty states; ≥44px tap targets | Copy audit checklist committed in PR description; emulator visual pass | T7–T10, T17 |
| **T27** | Security/perf pass | `get_advisors` (security + performance) fully green; RLS policy review; index check on hot paths (ledger sum, leaderboard) | Zero advisor errors; documented exceptions only | all migrations |
| **T28** | Preview build | `eas build --profile preview --platform android` (standalone APK, no Metro) | Installs and runs full M3 script without a dev server | everything |

---

## 2. Milestones

| Milestone | Contents | Demonstrable on the phone | Gate to next |
|---|---|---|---|
| **M1 — "It's on my phone"** (T1–T11) | Dev client installed; tokens/fonts pixel-true; full navigation; mic permission prompt; complete **fake** session loop (mock engine: waveform, voice pill theatre, coin pops, receipts, summary, balances update in-store); prod DB schema live + seeded | Tap REC → grant mic → watch a fake session earn fake cents → summary sheet → nest updates. No sign-in required (auth may land during M1 but isn't the gate) | Build installed + M1 script passes |
| **M2 — "Real words, real cents"** (T12–T18) | Email OTP sign-in; campaigns/opt-ins from prod; live ElevenLabs transcription; client keyword spotting; `verify-mention` paying/flagging with caps+cooldowns; realtime pending→paid flips | Sign in, opt into Voltz, talk about energy drinks with someone → live partials → coin pop → receipt flips to **paid** → wallet balance is a real ledger row. Spamming "Voltz" gets flagged | M2 on-device script passes; provider fallback verified once |
| **M3 — "Honest + social"** (T19–T23) | 2-voice gate live (solo pays nothing); streaks/badges/finalize; invite links + $1/$1 bonus; live friends leaderboard; settings deletions | Solo monologue earns $0; a 2-person chat pays; streak chip counts today; second test account redeems invite, both see each other on the board live; delete-session-data provably cascades | M3 script passes; anti-gaming matrix green |
| **M4 — "Shippable"** (T24–T28) | Tests hardened, copy/animation audit, advisors clean, degraded mode (if time), preview APK | Standalone preview APK runs the whole product without a dev machine | Preview build passes full script |

---

## 3. Commit/push cadence & repo hygiene

- **One commit per completed task, pushed to `main` immediately** (user's instruction). No long-lived branches; if two agents run in parallel, they touch disjoint paths by lane (app `src/` vs `supabase/`) — the DAG above is partitioned to make that safe.
- **Every commit must pass locally before push:** `npx tsc --noEmit && npx expo lint && npm test`. Backend-only commits additionally: migration applied to prod (MCP `apply_migration`) **and** `get_advisors` checked, in the same session as the commit.
- **Migrations:** always a file in `supabase/migrations/<UTC-timestamp>_<name>.sql`, forward-only, idempotent seeds (`ON CONFLICT DO NOTHING`). The file content committed must be byte-identical to what was applied to prod. Never edit an applied migration — write a new one.
- **Edge functions:** source lives in `supabase/functions/<name>/index.ts` (+ `_shared/`), committed in the same task-commit that deploys it (MCP `deploy_edge_function` or `supabase functions deploy`).
- **Secrets discipline:** `.env` git-ignored; `.env.example` documents `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_POSTHOG_KEY` only. Grep for `sk-`, `sutkn_`, service-role patterns before any push.
- Commit messages: `T<id>: <what>` + one-line demo note (e.g. `T8: home + session overlay + summary sheet (mock engine) — fake session e2e in emulator`).

---

## 4. User-action checklist (only you can do these)

| # | Action | When | Blocks |
|---|---|---|---|
| **U1** | `npm i -g eas-cli && eas login`, then confirm `eas init` project link when the agent asks | **Immediately after T1 lands** (day 1) | T11 / M1 build |
| **U2** | Supabase Dashboard → Auth → Email Templates → Magic Link/OTP: make the template contain `{{ .Token }}` (6-digit code, not link) | Before first OTP test | T13 |
| **U3** | `supabase secrets set ELEVENLABS_API_KEY=… OPENAI_API_KEY=…` (or dashboard → Edge Functions → Secrets). Confirm the ElevenLabs plan has **Scribe realtime** enabled | Before T14/T16/T19 deploy (start of M2) | all STT/verify/diarize fns |
| **U4** | Dashboard → Realtime settings: confirm **private channels / Realtime Authorization** is enabled | Before T18 | realtime flips |
| **U5** | Phone: allow browser APK installs; open the EAS build link/QR and install the dev client. Optional: Developer Options + USB debugging (only needed for local `expo run:android` fallback or `adb logcat`) | At T11 completion | M1 on-device |
| **U6** | *(Optional, recommended once OTP testing gets annoying)* Custom SMTP: Resend free tier → dashboard Auth → SMTP settings. Built-in mailer is 2 emails/hour | During M2, at first rate-limit hit | smoother T13+ testing |
| **U7** | Keep phone + PC on the same Wi-Fi for Metro, or tell the agent to use `npx expo start --dev-client --tunnel` | Every dev session | live JS reload |

---

## 5. Risk register (top 8)

| # | Risk | Mitigation | Fallback |
|---|---|---|---|
| **R1** | `@siteed/audio-studio` npm name/API drift (renamed from `expo-audio-studio`); `onAudioStream` behaves differently on New Architecture | Verify npm name + config plugin at T1 install time; T11 build includes it; T12 has an on-device debug overlay proving PCM cadence before anything depends on it | Swap to `react-native-audio-api` (float32→int16 convert in JS, `androidForegroundService: true`) behind the same `AudioCapture` interface; costs exactly one EAS rebuild |
| **R2** | supabase-js on Metro: `ws`/`stream`/`structuredClone` shim breakage on the exact SDK 57 + supabase-js combo | T1 pins versions and adds `metro.config.js` resolver shims; smoke-import test in the T1 commit gate | Pin one supabase-js minor back; worst case run REST/auth without realtime until fixed (realtime is only load-bearing from T18) |
| **R3** | Scribe v2 Realtime message-format drift / plan doesn't include realtime | Both providers behind `SttStream`; T14 curl smoke test mints a token on day 1 of M2, and T15 verifies live partials on-device immediately | Flip primary to OpenAI Realtime (`gpt-4o-mini-transcribe`) — one-line provider switch; keyterm biasing lost, acceptable |
| **R4** | Android 14+ foreground-service mic: recording dies on screen-off or notification missing | Config plugin sets FGS type `microphone` + `FOREGROUND_SERVICE_MICROPHONE` + `POST_NOTIFICATIONS` + persistent notification in T1; T12 done-criteria includes 60s screen-locked capture | Keep-awake the session screen (already planned per spec: "this screen stays visible while recording") and document screen-on requirement for v1 |
| **R5** | WS instability / binary quirks on device | Both providers use **JSON + base64 audio frames** (no binary WS frames needed); shared reconnect + bounded send-queue in T15; drop-oldest on overflow | T24 degraded mode: 5s chunk POSTs to an edge fn, same downstream events |
| **R6** | OTP rate limits torch testing (2/hr built-in mailer; 30/hr project; 60s/user) | Persisted sessions mean you sign in rarely; use 2–3 test emails; U6 custom SMTP early in M2 | Dev-only: service-role admin API creates a password test user; agents sign in with password while OTP path stays for real flows |
| **R7** | EAS free-tier queue (30–60+ min) stalls the loop | Only **two** builds in the whole plan (T11, T28) because native deps are front-loaded; T11 fires on day 1 in the background | Local `expo run:android` on the Windows PC via USB (Android SDK present) — no queue at all |
| **R8** | Prod-DB-only development: a bad migration or test data pollutes production | Forward-only committed migrations; RLS from migration 001 so blast radius = own rows; idempotent seeds; dedicated test accounts; `get_advisors` after every migration; test-data cleanup SQL kept in `supabase/scripts/` (run manually, never auto) | `supabase db dump` snapshot before any risky migration; new corrective migration (never edit history); tables are small enough to rebuild from migrations + seed at any time |

---

## 6. Verification per phase

**Every task, before commit:**
```bash
npx tsc --noEmit
npx expo lint
npm test
```

**Backend tasks additionally (agent-run):** MCP `apply_migration` → `execute_sql` sanity selects → `get_advisors` (security, then performance).

### Edge function smoke tests (M2/M3; agent-run with a real user JWT from a test sign-in)

```bash
# stt-token (expect {"token":"sutkn_...","expires_at":...})
curl -s -X POST https://wqxgqqbupmfvmalejnxj.supabase.co/functions/v1/stt-token \
  -H "Authorization: Bearer $USER_JWT" -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY"

# stt-token OpenAI fallback (expect ek_...)
curl -s -X POST ".../functions/v1/stt-token?provider=openai" -H "Authorization: Bearer $USER_JWT" -H "apikey: $ANON"

# verify-mention: natural snippet → status "paid" + ledger row; spam snippet → "flagged", no ledger row
curl -s -X POST .../functions/v1/verify-mention -H "Authorization: Bearer $USER_JWT" -H "apikey: $ANON" \
  -H 'Content-Type: application/json' \
  -d '{"session_id":"…","campaign_id":"…","snippet":"honestly the Voltz from the gas station slapped, I was up until 2am"}'
# then repeat within 60s → expect flagged (cooldown); repeat past cap → expect flagged (cap)

# diarize: mode=upload-url → PUT WAV → mode=check → {"speakers":2,"voice_confirmed":true}
```
DB assertions via MCP `execute_sql`: ledger SUM == wallet balance; every `paid` mention has exactly one ledger row; flagged mentions have none; snippets contain `[redacted]` where PII was fed in.

### On-device scripts (what you physically do)

**M1 script (~5 min):**
1. Install dev client from the EAS link (U5). Agent runs `npx expo start --dev-client` (or `--tunnel`).
2. Open app → landing renders in Space Grotesk with the animated waveform card → "Get started → start earning".
3. Walk onboarding: try continuing without consent (grey button + toast), check consent; pick 2 brands (toast), pick a 3rd; choose PayPal → "Let's go →".
4. Tabs: visit all four; Global pill on Rank → toast; gift cards → toast.
5. Tap **REC** → Android mic permission prompt appears → grant → fake session: voice pill walks `detecting… → 1 voice… → 2 voices ✓`, coins pop, receipts stack → "■ End session" → summary sheet slides up → nest balance/stat tiles/activity reflect it.
6. Pass = all of the above with no red screens.

**M2 script (~10 min, needs U2+U3 done):**
1. Sign in with your email → 6-digit code arrives → verify. Kill app, reopen → still signed in.
2. Brands tab shows the 5 seeded campaigns (Lumen locked, "unlocks at level 3"); opt into Voltz + 2 others; force-close, reopen → opt-ins persisted.
3. Tap REC with a second person (or a podcast playing): live partial transcript text appears <1s after speech.
4. Say "I tried that Voltz energy drink yesterday" naturally in conversation → coin pop + pending receipt instantly → receipt flips **paid** within ~5s without touching the screen (realtime).
5. Say "Voltz Voltz Voltz Voltz" rapidly → receipt flips **flagged, not paid**.
6. End session → wallet balance equals SUM of paid receipts; agent cross-checks the ledger in SQL.
7. Lock the phone mid-session for 60s → recording notification visible, transcription resumes/continues.

**M3 script:** solo monologue session pays $0 (pill never reaches ✓); 2-person session pays; Rank shows "today counted — streak bonus +5% active"; share invite from a second test account → redeem → both on each other's leaderboards, updating live after a session; Settings → delete a session → agent proves snippets + audio rows are gone via SQL.

**M4 script:** install the preview APK (no dev server), rerun the M2+M3 scripts end-to-end.

---

### Critical Files for Implementation

- C:\Users\admin\.claude\plans\i-want-you-to-federated-haven.md — locked decisions + verified provider/Supabase research (fixed constraints for every task)
- C:\Users\admin\Downloads\MagPie\CLAUDE.md — stack, tokens, event names, anti-gaming/privacy requirements (source of truth agents load every session)
- C:\Users\admin\Downloads\MagPie\supabase\migrations\0001_core_schema.sql *(to create, T5)* — schema+RLS+seed everything backend hangs off
- C:\Users\admin\Downloads\MagPie\src\lib\session-engine.ts *(to create, T4)* — the mock-first orchestrator that unblocks all UI work and later hosts the real pipeline
- C:\Users\admin\Downloads\MagPie\app.config.ts *(to create, T1)* — native deps/permissions/config plugins that determine the one-and-only dev build