# HANDOFF — Magpie build continuation (v3)

**Updated 2026-07-18 before a conversation reset.** Entry point for the continuing agent: read this fully, then `docs/PLAN.md`, then `.superpowers/sdd/progress.md` (the ledger). `git log` + the ledger are ground truth over any summary.

**Standing user directives (current):** FINISH THE WHOLE IMPLEMENTATION through M4 — no phase autostops. Keep committing per task (multiple commits per task fine, descriptive messages, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` footer). Annotated milestone tags at phase ends (`m1-on-device`, `m2-real-mentions`, `m3-social`, `m4-shippable`). Update HANDOFF.md at the very end (or before any stop).

## What Magpie is

Mobile-native app (Expo SDK 57 / RN 0.86, Android-first) paying 5¢ per legitimate brand mention in real conversations: REC → 2+ voices via diarization → live STT → client keyword spotting (instant coin pop, pending receipt) → server verification (LLM judge + caps/cooldowns/budget in one locked transaction) pays or flags → wallet accrues (payouts stubbed in v1: "payouts coming soon — your nest is safe"). Sponsors seeded: ElevenLabs / OpenAI / Anthropic, 5¢, cap 20/day, cooldown 60s, €5k budget each. `CLAUDE.md` = conventions; design spec = `git show 7ca4989:README.md` (copy is canonical); prototype = `magpie-prototype-standalone.html`.

## Process (continue exactly this)

Per task T{n}: write `.superpowers/sdd/task-T{n}-brief.md` → dispatch fresh **opus** implementer (template pattern: see T1–T7 briefs + any earlier dispatch in ledger dir) → implementer commits+pushes to `main`, writes `task-T{n}-report.md` → controller makes review package (`git log/diff --stat/diff -U10 BASE..HEAD > .superpowers/sdd/task-T{n}-review-package.diff`, exclude lockfiles) → opus reviewer (spec + quality verdicts) → fix subagent for Critical/Important → ledger line. Lanes: frontend (`src/`, `app/`) & backend (`supabase/` + prod DB + edge functions) may each run ONE implementer concurrently; stage-own-files-only; pull --rebase before push.

## State (git main @ `ddd8555`, all pushed, tree clean)

### Complete & reviewed
- **T1 scaffold** (`6a5b620`+`06f357f`) — all native deps for the entire project (ONE dev build lasts to M4), app.config.ts (`si.magpie.app`, scheme `magpie`), eas.json, jest.
- **T2 tokens/primitives** (`5ecfd01`) — byte-accurate tokens (hex ONLY in tailwind.config.js + src/theme/tokens.ts), fonts, Toast(single-instance)/Sheet/Button(`gated` pattern)/Screen/Wordmark, ui slice.
- **T3 nav shell** (`28a846e`) — full route tree, custom TabBar + RecFab, session (card/slide-up/gesture-locked) + summary (transparentModal+Sheet), forward-only onboarding.
- **T5 prod database** (`101cc33`) — 11 migrations applied+committed (files == prod, verified): 16 tables RLS'd, profiles/profile_private split, budgeted campaigns, append-only ledger, daily_counters (user-local day), weekly_stats, friendships/invites/tombstones, badges; 5 SECURITY DEFINER RPCs (REVOKE FROM PUBLIC confirmed on prod; credit_mention decision order verified line-by-line: lock→idempotent→forced→voice-gate(last_two_voice_at ≤3min)→cooldown(verified_at, server time)→cap→amount(bounded weekend ∩ [Fri12Z,Mon12Z], +5% streak≥3)→atomic budget→sightings soft-check w/ budget reversal→writes+badges); storage bucket `diarization`; seed verified on prod. Review: **Approved**, deviations approved as improvements.
- **T11 part 1** (`d5cca40`,`10aebe6`) — EAS project @tiank003/magpie (`828ee329-aa8b-43d6-b80f-d250600480d6`); dev-client APK built + INSTALLED on user's phone (build 6ec65b93…, page: expo.dev/accounts/tiank003/projects/magpie/builds/6ec65b93-0276-4ade-9c5b-6e1253eca102). Dev client = shell; JS loads from Metro.

### Implemented, committed, **REVIEW PENDING** (first action of next session)
- **T4 client logic** (`bcbb6a6`,`cdda09d`,`1dd8607`,`ddd8555`; 90 tests/16 suites green) — spotter (fuzzy DL≤1 on ≥5-char tokens, utterance dedupe, 8s suppression [suppression-wins]), redact.ts, money/streak, ringBuffer+WAV, `AudioCapture`/`SttStream`/`Api` interfaces + Mock/Scripted impls, session machine (pure reducer, mock mode = demo timing 3s/6s voices, denied/start-fail/stall→paused paths), all slices + mock fixtures (the 3 real sponsors), `useSessionMachine()`.
  → **Review package READY**: `.superpowers/sdd/task-T4-review-package.diff` (BASE `101cc33`, HEAD `ddd8555`); brief + report beside it. Dispatch reviewer per template (see ledger-dir examples); adjudicate; fixes if Critical/Important.

### Ready-to-dispatch briefs (already written)
- **T6** `.superpowers/sdd/task-T6-brief.md` — supabase client + generated types (MCP `generate_typescript_types`) + real `Api`. **Add to its dispatch context:** T4's `Api.verifyMention` resolves the FINAL verdict; the real edge fn fast-acks `{status:'pending'}` + broadcast flip — T6 must bridge (report the seam it chooses); and per T5 review, the pending-mention insert path (T16) must supply `base_rate_cents` (NOT NULL, no default).
- **T7** `.superpowers/sdd/task-T7-brief.md` — landing + onboarding (3 gated steps, verbatim copy) + Waveform component.
- T6 ∥ T7 may run concurrently (disjoint files) AFTER T4's review passes.

### Then (briefs to write, pattern per existing ones; specs in docs/PLAN.md §task DAG + docs/design/mobile.md §4)
T8 (home + session overlay + summary on the mock engine — real mic permission; CoinPop component) → T9 (brands + wallet) → T10 (rank + settings) → **M1 gate**: copy-audit vs spec + on-device M1 script (PLAN.md §Verification) with the user → tag `m1-on-device`. Then Phase 2 (T12–T18), Phase 3 (T19–T23), Phase 4 (T24–T28 + final whole-branch review incl. ledger minors) — details all in PLAN.md.

## User actions — status
- ✅ U1 (eas login, `tiank003`) · ✅ U5 (APK installed).
- ❓ **U2** (OTP email template `{{ .Token }}`) — asked, unconfirmed. Needed before T13.
- ❓ **U3** (`supabase secrets set ELEVENLABS_API_KEY OPENAI_API_KEY CRON_SECRET`) — asked, unconfirmed. Needed before T14/T16/T19. VERIFY before dispatching those (e.g., a probe edge fn or ask user).
- ❓ **U4** (Realtime private-channel authorization enabled) — asked, unconfirmed. Needed before T18.
- **Every fresh session: Supabase MCP needs `/mcp` re-auth by the user** (OAuth, can't be done by agents). Expo/EAS CLI auth persists.

## Gotchas (hard-won)
- Audio pkg = **`@siteed/audio-studio@3.2.1`** (NOT expo-audio-studio). FGS notification strings are runtime `startRecording` opts → T12.
- supabase-js 2.110: NO Metro shims, no structuredClone polyfill. `Tabs` from `expo-router/js-tabs`. RTL pinned 13.3.3. Jest: worklets resolver + safe-area mock; router tests via `renderRouter` + in-memory maps of REAL components. `newArchEnabled`/`edgeToEdgeEnabled` removed from SDK 57 schema. `expo-updates` not installed (channels inert; decide at T28).
- `.easignore` committed (Windows EPERM). `.env` committed BY DESIGN (EXPO_PUBLIC only). Prod migrations forward-only; `week_start` uses `AT TIME ZONE 'utc'` immutable form (prod-confirmed).
- STT facts: ElevenLabs WS needs `?model_id=scribe_v2_realtime&token=sutkn_…` (single-use token via POST /v1/single-use-token/realtime_scribe); OpenAI realtime transcription model = **`gpt-realtime-whisper`** via POST /v1/realtime/client_secrets + wss ?intent=transcription (RN can send Bearer headers). Both accept base64 audio in JSON frames (no binary WS).
- Metro is NOT currently running — restart `npx expo start --dev-client` (background) when screens land; user connects via LAN (`http://<pc-ip>:8081`) or `--tunnel`.
- Ledger minors parked for final review: listed in `.superpowers/sdd/progress.md` (T2/T3/T5 minor items; cap-slot-consumed-by-flagged is plan-mandated, keep).

## Resume checklist (next session, in order)
1. Ask user to run `/mcp` (supabase re-auth) + confirm U2/U3/U4 status.
2. `git log --oneline -12` + read ledger tail — confirm state matches this file.
3. Dispatch T4 reviewer (package ready). Adjudicate → fixes → ledger.
4. Dispatch T6 + T7 (parallel) from staged briefs (add T6 context notes above).
5. Continue: T8→T9→T10 → M1 gate + tag → Phases 2–4 per PLAN.md. Keep committing; update this file at the end.
