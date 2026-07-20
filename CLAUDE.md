# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Magpie is

Magpie is a **mobile-native app (React Native, iOS + Android, built with EAS)** that pays everyday people for mentioning sponsor brands in real, in-person conversations. The user opts into brand campaigns, taps **REC** before a conversation, the app **verifies 2+ voices are present**, transcribes speech **live (English)**, detects brand mentions, and credits a micro-reward (5–8¢) per legitimate mention. Balances cash out to real money at a $5 threshold. Gamification (leaderboards, day streaks) drives retention; **anti-gaming logic** (voice gate, per-brand daily caps, natural-conversation verification, cooldowns) is a first-class product concern — spamming keywords/company names must not pay. Target audience: Gen Z, casual-smart tone.

## Repository state (scaffolded)

The Expo app is scaffolded and runs on a **custom dev client** (Expo SDK 57 / RN 0.86, Android-first). Structure:
- `app/` — Expo Router routes. The **current app is a single-screen port** in `app/index.tsx`: a dark-theme, Nunito, full-flow demo (REC → live counter → "2 voices ✓" → summary) with a **self-contained demo engine (fake mention detection on a timer)** plus **real on-device Whisper** (`whisper.rn`) + native PCM mic wired behind it. The route-group scaffolding from the earlier multi-screen build (`(auth)`, `(onboarding)`, `(tabs)`, `session`, `summary`, `settings`, `invite`) is still present.
- `src/` — `components/` (Button, TabBar, RecFab, Sheet, Toast, …), `lib/` (keyword spotter + fuzzy variants, redaction, money/streak, session state machine, ring buffer + WAV, swappable `stt`/`audio`/`api` interfaces + mocks, `whisper`), `stores/` (Zustand slices auth/brands/session/wallet/social/ui + mock fixtures), `theme/tokens.ts`, `types/`.
- `supabase/migrations/` — 11 applied migrations (RLS'd tables, budgeted campaigns, append-only ledger, daily counters, social/badges, SECURITY DEFINER RPCs, storage bucket, seed).
- `__tests__/` — Jest suites (spotter, redaction, money, streak, session machine, stores, tokens, nav shell, supabase smoke).
- Design references (not code to port): `design_handoff_magpie_app/` (current **dark-theme** design — `magpie-standalone.html` opens in a browser), `magpie-prototype-standalone.html` (original light-theme demo, fakes mentions on a timer), `Magpie Prototype.dc.html`, and `ios-frame.jsx` (bezel wrapper — **do not implement it**).

**Design note:** the shipped app pivoted to the **dark-theme / Nunito** design in `design_handoff_magpie_app/`, which the "Design system" section below now documents. The original light-theme / Space Grotesk spec is superseded — its tokens still linger in `src/theme/tokens.ts` + `tailwind.config.js` (and in git history) but are no longer the design of record.

The **full written design spec** (screen-by-screen, exhaustive) lives in git history: `git show 7ca4989:README.md` — **stack-agnostic design intent** (follow its visuals/copy/interactions; ignore its Vite-PWA tech assumptions — this project is React Native on Supabase).

## Tech stack (chosen — do not swap without asking)

- **Expo (React Native) + TypeScript** — the app. Managed workflow with a **custom dev client** (native audio modules mean **Expo Go will not work**; a dev build is required from day one).
- **EAS Build / EAS Submit** — CI builds and store submission for iOS and Android. Profiles: `development` (dev client), `preview` (internal testers), `production`.
- **Expo Router** — file-based navigation. Route groups: onboarding stack, the 4 app tabs (`home`, `brands`, `rank`, `wallet`), and the recording session + summary presented as modals/overlays over the tabs.
- **NativeWind** (Tailwind for RN) — map the design tokens below into `tailwind.config.js` `theme.extend`. This keeps the token-driven styling from the design intact. (Plain `StyleSheet` is acceptable for the few components NativeWind can't express, e.g. animated waveform bars via `react-native-reanimated`.)
- **Zustand** — single client store, sliced: `auth`, `brands`, `session`, `wallet`, `social`, `ui` (toast). Persist wallet / streak / opt-ins via the **backend**, not device storage.
- **Supabase** — the entire backend: **Auth** (phone/OAuth), **Postgres** (schema below), **Storage** (transient audio chunks only), **RLS on every table**, and **Edge Functions (Deno)** for all privileged server logic. There is no separate API server.
- **PostHog** (`posthog-react-native`) — product analytics + feature flags (desired; wire it behind a thin `src/lib/analytics.ts` so it's optional).
- **ElevenLabs** (Scribe STT + diarization) and **OpenAI** (`gpt-4o-transcribe` fallback, `gpt-4o-mini` for verification/redaction) — available; keys live server-side only.

## Backend — Supabase (replaces the old PWA "Vercel serverless" plan)

All privileged logic runs as **Supabase Edge Functions** (Deno). Provider keys are **never** in the app bundle.

Edge functions to build (behind stable interfaces in `src/lib/`):
- `stt-token` — mints a short-lived, scoped key so the app can open a WebSocket **directly** to the STT provider. The app never holds the real provider key.
- `verify-mention` — receives the redacted ±10s **text** snippet around a keyword hit; `gpt-4o-mini` judges natural conversation vs. list-reading/keyword-spamming; on pass, inserts the `mentions` row + ledger credit; on fail, marks it `flagged` (shown to the user as "flagged, not paid").
- `diarize` — receives a short recent audio chunk (via a Supabase Storage URL, not inline); runs **ElevenLabs Scribe diarization** to confirm 2+ distinct speakers.
- `redact` — regex + `gpt-4o-mini` pass to strip PII from a snippet before it can be stored (see Privacy).

Env / secrets:
- **App (public, safe to ship)** via `app.config.ts` `extra` / `EXPO_PUBLIC_*`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_POSTHOG_KEY`.
- **Server-only** as Supabase function secrets (`supabase secrets set`) and EAS secrets for builds: `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. **Never** put a provider key in client code — the `stt-token` function exists precisely to avoid this.

### Data model (Postgres, money in **cents/integers** everywhere)
`profiles` (auth user + display data, streak, best_streak) · `campaigns` (brand, category, rate¢, cap_per_day, multiplier?, min_level) · `opt_ins` (user↔campaign) · `sessions` (start, end, voice_confirmed, mention_count, earnings¢) · `mentions` (session, campaign, ts, redacted_snippet, amount¢, status: `pending`|`paid`|`flagged`) · `ledger` (append-only credits/debits — every cent traceable to a `mentions` row) · `payout_requests` · social/leaderboard views. **RLS on all of it.**

## Audio pipeline — REAL-TIME (the hard part; build behind interfaces)

The pitch is real-time: the live counter ticks **during** the conversation, not after. This is the riskiest area — build each stage behind a swappable interface.

1. **Capture** — in the custom dev client, stream **raw PCM frames** (small chunks, ~250ms–1s) from the mic. `expo-audio` for recording; a native streaming module (e.g. `react-native-live-audio-stream` / equivalent, added via config plugin) for the live PCM feed. This is why **Expo Go is unusable** — needs an EAS dev build.
2. **Streaming STT over WebSocket, app → provider directly**, authorized by the ephemeral token from `stt-token`. Wrap both providers behind `src/lib/stt.ts` — `interface SttStream { onPartial(cb); onFinal(cb); close() }` — so swapping is one file. **Primary:** ElevenLabs Scribe streaming; **fallback:** OpenAI `gpt-4o-transcribe` realtime.
3. **Degraded mode** (keep it working everywhere): if the WS fails, fall back to short recorded chunks POSTed to an edge function — near-real-time, same downstream events.
4. **Keyword spotting is CLIENT-SIDE and instant** — match partial transcripts against the user's opted-in campaign terms **plus fuzzy variants** on-device. A hit fires the UI immediately (coin pop, receipt row in `pending`). This is what makes it feel live.
5. **Verification is server-side and async** — send only the redacted ±10s **text** snippet to `verify-mention`. Never block the live UI on it; the receipt flips `pending → paid` or `pending → flagged` when it returns.
6. **2+ voices check** — streaming STT may not diarize, so run a periodic audit (~every 30s) via `diarize`. Voice-pill states: `detecting…` → `1 voice…` → `2 voices ✓`. **Mentions accrue only after ✓**; a session that never reaches ✓ pays nothing.

### Anti-gaming (product principle, not a nice-to-have)
The user explicitly wants spam-resistance. Enforce **server-side**, and show the user why when something doesn't pay:
- **2+ voices gate** — solo talking / reading a keyword list earns nothing.
- **Per-brand daily cap** (`cap_per_day`) enforced in the ledger.
- **Natural-conversation check** in `verify-mention` — list-reading / rapid keyword repetition → `flagged, not paid`.
- **Cooldown** — minimum interval between paid credits for the same campaign (don't pay 10 "Voltz" in 5 seconds).
- Legit boosters (streak +5%, weekend 2x multipliers) coexist with caps so they can't be abused.
- **Transparency:** flagged mentions are surfaced to the user, never silently dropped.

### Privacy & redaction (user-facing promises — not optional)
- **Only keywords are detected.** The full transcript stream lives in app memory only — never persisted, never sent anywhere except the ±10s snippet around a hit.
- **Redact before storing** — every snippet goes through `redact` before it touches the DB: strip names of non-users, phone numbers, emails, addresses, health/financial details → `[redacted]`.
- **Raw audio** is never stored beyond the transient diarization chunk; delete after processing.
- The recording screen **always** shows a visible REC indicator; per-session "delete session data" must actually cascade (snippets + audio).

## Analytics — PostHog

Init early, respect consent, **session replay OFF on the recording screen**. Funnel events (keep these exact names): `landing_view`, `install_cta_tap` (native: the first-run "Get started" CTA), `onboard_consent`, `onboard_brands`, `onboard_payout`, `first_session_start`, `mention_paid`, `session_end`, `cashout`, `invite_share`. Use feature flags for reward-pacing / copy experiments.

## Payouts (NOT in scope for the first build)

Do not integrate a payout API yet. Ship the wallet UI + ledger. "Cash out" inserts a `payout_requests` row and shows the success toast; fulfil manually for now. Keep it **ledger-first** — every cent traceable to a `mentions` row (timestamp + redacted snippet). A real provider (e.g. PayPal Payouts) comes later behind the same interface.

## Design system (dark-theme, Nunito — current)

The shipped app (`app/index.tsx`) uses the **dark-theme, Nunito** design in `design_handoff_magpie_app/` (source: `Magpie.dc.html`; `magpie-standalone.html` opens in a browser). Full screen-by-screen spec: `git show 7ca4989:README.md`. Recreate remaining screens against these values, pixel-perfect.

> **Token drift:** these values are currently hardcoded as constants in `app/index.tsx`; `src/theme/tokens.ts` + `tailwind.config.js` still hold the *old* light-theme tokens. Re-map the values below into those token files before building new screens so the "hex only in tokens" rule holds again.

**Colors** — two themes, **dark is default** (light is a toggle in the You tab).
- Dark: bg `#14304a`; fg `#f2f8fb`; muted/sub `rgba(242,248,251,0.62)`; card `rgba(255,255,255,0.08)`; border/line `rgba(255,255,255,0.14)`; chip `rgba(255,255,255,0.13)`; raised button `#1d4260`.
- Light: bg `#e6f4fb`; fg `#17384c`; sub `rgba(23,56,76,0.6)`; card `#ffffff`; line `rgba(23,56,76,0.12)`; chip `#d4ecf7`; button `#ffffff`.
- Accents (flat — **no gradients**): primary blue `#4aaee0`; money-figure blue `#38ade0`; positive/active teal `#33c6a7`; cyan `#45c5e5`; gold `#ecb22e` (top-3 rank). Ink on accent surfaces (button/tile text): `#06131c`.
- Tints: blue highlight `rgba(74,174,224,0.15–0.16)` (active row / mention flash); selected-card border `rgba(74,174,224,0.65)`; teal chip `rgba(51,198,167,0.25)`; record-button glow `rgba(74,174,224,0.10)`. Status pill is teal when `listening`, muted otherwise (no separate recording-red).

**Type** — **Nunito** only (400 Regular / 500 Medium / 600 SemiBold / 700 Bold / 800 ExtraBold), via `expo-font`. No IBM Plex Mono, no Space Grotesk in the current design. Slight *positive* tracking (+0.3–0.5px) on small caps-y labels + the wordmark. Scale: 44px total-earned hero · 40px wallet money · 26px tab titles · 24px detail title · 19–21px stat values · 16–18px section/brand names · 15px body · 14–14.5px buttons/amounts · 12.5–13.5px secondary · 10.5–11.5px labels/nav.

**Shape/spacing** — radii: 22 (nav bar, wallet/profile hero cards) / 20 (standard cards) / 18 (large tile) / 16 (stat tiles, primary buttons) / 15 (rank rows) / 14 (letter tiles, mention rows) / 999 (pills); borders 1px (1.5px on selected/emphasis cards + your leaderboard row); screen padding 24px (26px on the record header/transcript); card padding 13–22px; **tap targets ≥44px**; respect safe-area insets (`react-native-safe-area-context`). Shadows minimal (record button carries a soft `#1e5a78` glow).

**Screens** — 5 destinations: **Record** (the "nest" — wordmark, live status pill, transcript strip, per-brand mention counts, session total), **Brands** (roster picker, ≤3 selected, + brand-detail view), **Ranks** (weekly leaderboard, your row highlighted), **Wallet** (available balance, cash-out, ledger rows), **You** (profile, totals, earnings-by-model, dark/light toggle). The nav is a floating rounded bar with 4 items (Brands · Ranks | Wallet · You) and a **morphing center record button** that sits large-and-centered on the Record tab and **docks into the nav gap** on the others. Onboarding (consent → ≥3 brands → payout) remains per the route scaffolding.

**Animations** (`Animated` from `react-native` in the current screen; `react-native-reanimated` still available): three concentric record rings spinning at 7.5s / 11s (reverse) / 9.2s; magpie bird bob (±7px, 2.3s ease-in-out) + fly-in/out on record toggle (~1.15s cubic); record-button dock morph (~780ms cubic); rings/glow fade with recording state (~700ms); transcript words fade in blue→fg, brand words→teal (~900ms); mention-flash row highlight (~900ms); toasts slide-up+fade, auto-dismiss 2.4s, single-instance.

## Conventions

- Copy tone: casual-smart, lowercase-friendly, no corporate speak, almost no emoji — **reuse exact strings** from the design spec.
- Money in **cents (integers)** everywhere; format only at the render edge.
- No new colors/fonts — tokens only. No SVG illustrations; brand logos come from `campaigns`.
- Keep components small and named per the design: `NestCard`, `StatTile`, `CampaignCard`, `ReceiptRow`, `TabBar`, `RecFab`, `Toast`, `Sheet`, waveform.
- Validation gates are visible: disabled buttons go grey (`#e2e1d8` / `#a3a294`); invalid taps show a toast, never fail silently. Onboarding gates: consent checked · ≥3 brands · payout chosen.

## Commands (intended toolchain — verify against `package.json` / `eas.json` once scaffolded)

```bash
# First-time scaffold (repo has no app yet):
npx create-expo-app@latest .            # TypeScript template; then add expo-router, nativewind, zustand

# Develop (custom dev client — NOT Expo Go):
npx expo start --dev-client
npx expo run:ios          # local native build + run
npx expo run:android

# Quality gates:
npx tsc --noEmit          # typecheck
npx expo lint             # eslint
npm test                  # Jest (jest-expo) + React Native Testing Library
npm test -- path/to/x.test.ts     # single file
npm test -- -t "streak math"      # single test by name

# EAS (builds & submit):
eas build --profile development --platform ios      # dev client build
eas build --profile preview --platform android      # internal testers
eas build --profile production --platform all
eas submit --platform ios

# Supabase (backend):
supabase start                        # local stack
supabase db push                      # apply migrations
supabase functions serve stt-token    # run an edge function locally
supabase functions deploy verify-mention
supabase secrets set OPENAI_API_KEY=...
```

## Testing

- **Jest + React Native Testing Library** for logic: streak math, ledger integrity (cents), onboarding gates (consent / ≥3 brands / payout), the keyword matcher incl. fuzzy variants, redaction rules, and **anti-gaming** (cap, cooldown, voice-gate, flagged-not-paid).
- **Test the audio pipeline against the interfaces** — feed the `SttStream` interface scripted partial transcripts so the whole session flow (keyword hit → pending receipt → verify → paid/flagged → summary → balances/streak/leaderboard update) is testable without a real mic or provider.

## Services you need to provision (tell me if any are missing)

Expo/EAS account · Supabase project (URL + anon + service-role keys) · ElevenLabs key (confirm Scribe **realtime streaming** is enabled on the plan; if not, OpenAI realtime is the primary) · OpenAI key · PostHog project key. If live PCM streaming needs a specific native module or a paid tier, flag it before building.
