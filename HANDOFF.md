# HANDOFF — Magpie build continuation

**Written 2026-07-18 by the coordinating agent (Fable) at a user-requested stop.** This file is the entry point for any agent continuing this work. Read it fully, then read `docs/PLAN.md`, then the progress ledger, before touching anything.

## What Magpie is

A mobile-native app (Expo SDK 57 / React Native, Android-first) that pays people 5¢ per legitimate brand mention in real conversations: tap REC → 2+ voices verified via diarization → live English STT → client-side keyword spotting fires instant coin-pop rewards → server verifies (natural-conversation LLM judge + caps + cooldowns) and pays or flags → wallet accrues, friends leaderboard + streaks gamify. Privacy: only redacted ±10s text snippets are ever stored. `CLAUDE.md` = stack + conventions source of truth. Full screen-by-screen design spec: `git show 7ca4989:README.md`; interactive prototype: `magpie-prototype-standalone.html`.

## Authoritative documents (priority order)

1. **`docs/PLAN.md`** — the complete approved implementation plan (v2, adversarially reviewed + user-amended). Architecture, full backend/mobile design, task DAG T1–T28, milestones M1–M4, verification scripts, user-action checklist U1–U6, risk register. *(Copy of `C:\Users\admin\.claude\plans\i-want-you-to-federated-haven.md`.)* **The plan overrides everything below on conflict.**
2. `docs/design/REVIEW-DELTAS.md` — the amendments list (what the review changed).
3. `docs/design/{backend,mobile,delivery}.md` — full design docs (DDL detail, mobile architecture, delivery/task rationale).
4. `.superpowers/sdd/progress.md` — the **progress ledger** (what's done, commit ranges, learned facts, user directives). Per-task briefs (`task-T*-brief.md`) and implementer reports (`task-T*-report.md`) live in the same directory — the T1–T5 ones are worked examples of the process.

## Execution process being used (continue it)

Subagent-driven development: for each task **T{n}** — (1) controller writes `.superpowers/sdd/task-T{n}-brief.md` (complete requirements, exact values, sources, git etiquette); (2) dispatch a fresh **opus** implementer subagent pointed at the brief (user mandate: implementation = opus agents); (3) implementer implements, tests, commits (`T{n}: <what> — <demo note>` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` footer), pushes to `main` directly (user-approved), writes its report file; (4) controller generates a review package (`git log/diff --stat/diff -U10 BASE..HEAD` → one file, exclude lockfiles/huge extracted docs) and dispatches a reviewer subagent (spec compliance + code quality verdicts); (5) Critical/Important findings → fix subagent → re-review; minors → ledger for the final whole-branch review; (6) ledger line + next task. **Lanes**: frontend (`src/`, `app/`) and backend (`supabase/` + prod DB) may run one implementer each concurrently; never two in one lane; agents stage only their own files (no `git add -A`), pull --rebase before push. **Each phase ends with an annotated milestone tag** (`m1-on-device`, `m2-real-mentions`, `m3-social`, `m4-shippable`) and a fresh HANDOFF.md, then STOP for user go-ahead (standing user directives).

## State at handoff

### Done, reviewed clean, pushed
| Task | Commits | Notes |
|---|---|---|
| T1 scaffold | `6a5b620` (+`06f357f` docs fix) | Expo SDK 57 / RN 0.86, ALL native deps for the whole project, app.config.ts (`si.magpie.app`, scheme `magpie`), eas.json (3 profiles, EXPO_PUBLIC env), jest-expo+RTL, design docs extracted. Gates green, expo-doctor 20/20. |
| T2 tokens/primitives | `5ecfd01` | Byte-accurate design tokens (tailwind + `src/theme/tokens.ts` — the ONLY two files allowed hex), 6 font families embedded + useFonts gate, Toast/ToastHost (single-instance 2.4s), Sheet, Button (`gated`-but-pressable pattern), Screen, Wordmark, zustand store w/ `ui` slice. |
| T3 nav shell | `28a846e` | Full route tree (index, (auth), (onboarding) forward-only+BackHandler, (tabs) w/ custom TabBar + 56px RecFab over 72px center gap, session card slide-up gesture-locked, summary transparentModal+Sheet, settings, invite/[code]). ToastHost offset uses real TAB_BAR metric. |
| T11 part 1 (EAS) | `d5cca40`, `10aebe6` | EAS project **@tiank003/magpie** id `828ee329-aa8b-43d6-b80f-d250600480d6`; Android dev-client APK BUILT & INSTALLED on user's phone: https://expo.dev/accounts/tiank003/projects/magpie/builds/6ec65b93-0276-4ade-9c5b-6e1253eca102 . `.easignore` committed (Windows EPERM fix). One dev build lasts through M4 — only rebuild if native deps change. |

### In-flight at handoff (told to wrap up + commit; CHECK THEIR FINAL STATE FIRST)
- **T4 (frontend lane)** — lib interfaces + mocks + machine + slices: `SttStream`/`AudioCapture` interfaces, ScriptedSttStream, REAL keyword spotter + redact.ts, session state machine w/ mock demo mode, MockApi, money/streak, ring buffer + WAV writer, auth/brands/session/wallet/social slices, `useSessionMachine()`. → Check `git log` for `T4:` commits + `.superpowers/sdd/task-T4-report.md` (lists DONE vs NOT-DONE per deliverable). Brief: `task-T4-brief.md`. **Not yet reviewed** — run the review step before building on it.
- **T5 (backend lane)** — prod DB migrations: full schema (profiles + profile_private split, campaigns w/ budget_cents/spent_cents, sessions w/ last_two_voice_at, mentions w/ (user_id,client_mention_id) idempotency, keyword_sightings, append-only ledger, daily_counters local-day, weekly_stats, friendships, invite_redemptions + tombstones, badges), RLS everywhere, SECURITY DEFINER RPCs (credit_mention etc.) **with REVOKE FROM PUBLIC**, storage bucket `diarization`, seed (ElevenLabs/OpenAI/Anthropic — 5¢, cap 20/day, cooldown 60s, budget 500000¢ each). → Check `T5:` commits + `task-T5-report.md` for applied-vs-remaining; **rule: repo migration files must exactly match what's applied to prod** (project `wqxgqqbupmfvmalejnxj`, MCP tools: apply_migration/execute_sql/get_advisors). **Not yet reviewed.** If incomplete: finish via forward-only corrective migrations, never edit applied files.

### Phases & what remains
- **Phase 1 → M1 "It's on my phone"** (T1–T11): ~done except → **finish/review T4+T5 → T6 (supabase client + generated types + real api.ts against T4's interface) → T7 (landing+onboarding) → T8 (home+session+summary, mock engine) → T9 (brands+wallet) → T10 (rank+settings)** → M1 gate (screen copy-audit vs `git show 7ca4989:README.md`, on-device M1 script in PLAN.md §Verification) → tag `m1-on-device` → HANDOFF → stop.
- **Phase 2 → M2 "Real words, real cents"** (T12–T18): real AudioCapture (`@siteed/audio-studio` — CANONICAL NAME, not expo-audio-studio), email-OTP auth (needs **U2**), `stt-token` fn (needs **U3**; ElevenLabs wsUrl MUST include `model_id=scribe_v2_realtime`; OpenAI model `gpt-realtime-whisper`), real SttStreams, session-start/end + verify-mention fns (T16 ships a documented temp voice-gate bypass, removed in T20), realtime broadcast migration + wiring (needs **U4**).
- **Phase 3 → M3 "Honest + social"** (T19–T23): diarize fn + continuous voice gate (removes bypass), finalize-session (streak/badges/invite bonus), redeem-invite + live friends leaderboard, settings deletions (privacy cascade).
- **Phase 4 → M4 "Shippable"** (T24–T28): degraded mode (stretch), real cashout T24b (stretch — v1 Cash out button = "payouts coming soon — your nest is safe" toast), test hardening (anti-gaming matrix + ledger property tests), copy/animation audit, advisors/security pass, preview APK.

### User actions remaining (PLAN.md §User-action checklist)
**U2** (before T13): Supabase dashboard → Auth → Email template must show `{{ .Token }}`. **U3** (before T14/T16/T19): `supabase secrets set ELEVENLABS_API_KEY=… OPENAI_API_KEY=… CRON_SECRET=…`. **U4** (before T18): Realtime private-channel authorization on. **U6** (optional): custom SMTP when OTP limits bite. U1/U5 are done (EAS login + APK installed).

## Environment & gotchas (hard-won — don't re-learn)

- Windows 11; node 24; supabase CLI via scoop; EAS CLI global, logged in `tiank003`. Prod-Supabase ONLY (no local stack). Metro: `npx expo start --dev-client` (user's phone connects via LAN `http://<pc-ip>:8081` or `--tunnel`).
- Audio: **`@siteed/audio-studio@3.2.1`** (the `@siteed/expo-audio-studio` name is a deprecated shim; REVIEW-DELTAS bullet corrected). FGS notification title/text are RUNTIME `startRecording` options (not plugin config) → belongs in T12.
- supabase-js 2.110 needs **NO Metro shims** on SDK 57 (metro.config.js is just `withNativeWind`). No structuredClone polyfill needed.
- `Tabs` must import from `expo-router/js-tabs` (root export deprecated). RTL pinned **13.3.3** (v14 breaks jest-expo). Jest uses `react-native-worklets/jest/resolver.js` as resolver + safe-area mock. expo-router tests: use `renderRouter` with in-memory maps of REAL route components (root layout imports global.css which jest can't parse).
- `newArchEnabled`/`edgeToEdgeEnabled` are GONE from SDK 57 config schema (always-on). `expo-updates` NOT installed → eas.json channels inert (decide at T28).
- `.easignore` is required on Windows (EPERM symlink) — already committed. `.env` is committed BY DESIGN (public EXPO_PUBLIC_* values only); provider keys go ONLY in Supabase function secrets.
- Ledger `week_start` generated column must use `date_trunc('week', created_at AT TIME ZONE 'utc')::date` (immutable) — bare `::timestamp` fails.
- Minor findings parked for the final whole-branch review are listed in the ledger (tokens.ts dead `white` export; ui-slice closure reset; T3 modal options need device smoke-check; @types/node explicit devDep; vendored `.agents/`/`.claude/skills/` trees committed — user was asked, no objection recorded).

## How to resume (exact steps)

1. `git log --oneline -15` + read `.superpowers/sdd/progress.md` — trust these over any summary, including this file's in-flight section.
2. Check T4/T5 final reports; run the standard review step on each (reviewer prompt pattern: see any earlier dispatch; review package = log+stat+diff file); fix Critical/Important via fix subagents; ledger lines.
3. Continue the task sequence (T6 next) with the brief→implement→review loop, opus implementers, per-task commits, lane discipline.
4. At M1: run the on-device script (PLAN.md §Verification) with the user, tag `m1-on-device`, write the next HANDOFF.md, **stop and await user go-ahead** (standing directive).
