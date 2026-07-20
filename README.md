# Magpie

Magpie is a **mobile-native app (React Native / Expo, iOS + Android)** that pays everyday
people for mentioning sponsor brands in real, in-person conversations. Opt into a brand
campaign, tap **REC** before a conversation, and the app verifies 2+ voices are present,
transcribes speech live, detects brand mentions, and credits a micro-reward (5–8¢) per
legitimate mention. Balances cash out to real money at a $5 threshold.

Gamification (leaderboards, day streaks) drives retention, and **anti-gaming logic** — a
2+ voices gate, per-brand daily caps, natural-conversation verification, and cooldowns — is
a first-class product concern: spamming keywords must never pay.

> Audience: Gen Z, casual-smart tone.

## Status

The app is scaffolded and runs on a **custom Expo dev client** (Expo SDK 57 / RN 0.86,
Android-first). The current build is a single-screen port of the design
(`app/index.tsx`): a dark-theme, Nunito full-flow demo (REC → live counter → "2 voices ✓"
→ session summary). It runs a **self-contained demo engine** (fake mention detection on a
timer) with **real on-device Whisper** (`whisper.rn`) and native PCM mic capture wired in
behind it. The Supabase backend schema (tables, RLS, RPCs) is migrated; the real
audio/STT/verification pipeline and payouts are still being built behind stable interfaces.

## Tech stack

- **Expo (React Native) + TypeScript** — managed workflow, custom dev client (native audio
  modules mean **Expo Go will not work**).
- **Expo Router** — file-based navigation.
- **NativeWind** (Tailwind for RN) + design tokens in `src/theme/tokens.ts`.
- **Zustand** — client store, sliced (auth / brands / session / wallet / social / ui).
- **Supabase** — Auth, Postgres (RLS on every table), Storage, Edge Functions (all
  privileged server logic). Provider keys are server-side only.
- **whisper.rn** — on-device transcription; native PCM mic streaming for the live feed.
- **ElevenLabs** (Scribe STT + diarization) and **OpenAI** — behind server-side interfaces.

## Project structure

```
app/                 Expo Router routes (current app: app/index.tsx)
src/
  components/         Button, TabBar, RecFab, Sheet, Toast, …
  lib/               keyword spotter, redaction, money/streak, session state machine,
                     ring buffer + WAV, stt/audio/api interfaces + mocks, whisper
  stores/            Zustand slices + mock fixtures
  theme/tokens.ts    design tokens
supabase/migrations/ Postgres schema, RLS, RPCs, storage, seed
__tests__/           Jest test suites
design_handoff_magpie_app/  current dark-theme design references
```

## Getting started

```bash
npm install

# Run against the custom dev client (NOT Expo Go — native modules required):
npm start                 # expo start --dev-client
npm run android           # local native build + run on Android
npm run ios               # local native build + run on iOS
```

A dev-client build is required from day one because of the native audio / Whisper modules.
Connect a device to the Metro bundler over LAN (`http://<pc-ip>:8081`) or with `--tunnel`.

### Preview the design in a browser

The app itself can't run in a plain browser (native-only modules), but the current design
is available as a self-contained bundle — open it directly:

```
design_handoff_magpie_app/magpie-standalone.html
```

## Quality gates

```bash
npm test                  # Jest (jest-expo) + React Native Testing Library
npm run lint              # eslint
npm run typecheck         # tsc --noEmit
```

## Backend & builds

- **Supabase** — schema lives in `supabase/migrations/`. See `CLAUDE.md` for the data model,
  edge functions, and the anti-gaming / privacy rules.
- **EAS Build / Submit** — profiles `development` (dev client), `preview` (internal testers),
  `production`.

## Documentation

- `CLAUDE.md` — source of truth for stack, conventions, backend, audio pipeline, anti-gaming,
  and the design system.
- `docs/` — plan and design docs.
- Full original design spec (screen-by-screen): `git show 7ca4989:README.md`.
