# CLAUDE.md — Magpie PWA

Magpie is a mobile-first PWA that pays people for mentioning sponsor brands in real conversations. Users opt into brand campaigns, tap REC before a conversation, the app verifies 2+ voices, detects brand mentions, and credits micro-rewards (5–8¢/mention) they cash out at $5.

## Design source of truth
- `design_handoff_magpie_app/README.md` — full spec: design tokens, every screen, interactions, state model. Follow it exactly; the design is high-fidelity and final.
- `design_handoff_magpie_app/magpie-prototype-standalone.html` — open in a browser to see intended look, animations, and flows. It is a **reference, not code to reuse**. The iPhone bezel in it is presentation-only.
- The prototype fakes mention detection with a timer. Everything downstream of a "mention event" (receipts, live counter, payouts, streaks) is real design; the detection itself must be built (see Audio pipeline).

## Tech stack (chosen — do not swap without asking)
- **Vite + React 18 + TypeScript** — app shell
- **vite-plugin-pwa (Workbox)** — installability, offline shell, service worker. "Add to home screen" is the core install CTA.
- **React Router** — routes: `/` (landing), `/onboarding`, `/app/{home|brands|rank|wallet}`, `/session`
- **Tailwind CSS** — map the design tokens in the README to `theme.extend` (colors: ink `#24241c`, accent `#336ca2`, tint `#9cc4e8`, etc.; fonts: Space Grotesk, IBM Plex Mono)
- **Zustand** — client state (single store; slices: auth, brands, session, wallet, social). Persist wallet/streak/opt-ins via backend, not localStorage.
- **Supabase** — auth (phone/OAuth), Postgres (users, campaigns, opt_ins, sessions, mentions, ledger), storage for transient audio chunks, RLS on everything. A plain Node/Fastify API is the fallback if Supabase is rejected.

## Audio pipeline — REAL-TIME (the hard part; build behind interfaces)
The pitch is real-time: the user sees the live counter tick DURING the conversation, not after. Architecture:

1. **Capture**: `getUserMedia` → Web Audio / `MediaRecorder` producing small Opus chunks (250ms–1s) or PCM frames.
2. **Streaming STT over WebSocket, browser → provider directly.** Vercel serverless can't hold long-lived sockets, so use the ephemeral-token pattern: `api/stt-token.ts` mints a short-lived scoped key; the browser opens the WS straight to the provider and receives partial transcripts with word timestamps in real time.
   - Primary: **ElevenLabs realtime STT** (Scribe streaming) if enabled on the account; fallback: **OpenAI Realtime transcription** (`gpt-4o-transcribe` over WS/WebRTC). Wrap both behind `src/lib/stt.ts` (`interface SttStream { onPartial(cb); onFinal(cb); close() }`) so swapping is one file.
   - Degraded mode (keep it working everywhere): if the WS fails, fall back to 5s `MediaRecorder` chunks POSTed to `api/transcribe.ts` — near-real-time, same downstream events.
3. **Keyword spotting is CLIENT-SIDE and instant**: match partial transcripts against the user's opted-in campaign terms (plus fuzzy variants) in the browser. A hit fires the UI immediately (coin pop, receipt row, `pending` state) — this is what makes it feel real-time.
4. **Verification is server-side and async**: the client sends only the ±10s TEXT snippet around the hit to `api/verify-mention.ts` → gpt-4o-mini checks natural-conversation vs. list-reading/gaming → writes the `mentions` row + ledger credit → receipt flips `pending → paid` (or `flagged, not paid`). Never block the live UI on this.
5. **2+ voices check**: streaming providers don't all diarize; run a periodic audit — every ~30s send the last audio chunk to batch **ElevenLabs Scribe with diarization** via `api/diarize.ts`. Indicator states: `detecting…` → `1 voice…` → `2 voices ✓`; mentions accrue only after ✓, and a session that never reaches ✓ pays nothing.

### Privacy & redaction (user-facing promises — not optional)
- **Only keywords are detected.** The full transcript stream lives in browser memory only; it is never persisted or sent anywhere except the ±10s snippet around a hit.
- **Redact before storing**: pass every snippet through `src/lib/redact.ts` before it touches the DB — strip names of non-users, phone numbers, emails, addresses, health/financial details (regex pass + gpt-4o-mini redaction pass; replace with `[redacted]`).
- Raw audio: never stored beyond the transient diarization chunk; delete after processing.
- Per-session "delete session data" must actually cascade (snippets + audio), and the recording screen always shows the visible REC indicator.

## Analytics — PostHog
- Init early, respect consent. Funnel events (exact names): `landing_view`, `install_cta_tap`, `onboard_consent`, `onboard_brands`, `onboard_payout`, `first_session_start`, `mention_paid`, `session_end`, `cashout`, `invite_share`.
- Use PostHog feature flags for reward pacing / copy experiments; session replay OFF on the recording screen.

## Payouts (NOT in scope for first deploy)
Do not integrate a payout API yet. Ship the wallet UI + ledger; "Cash out" creates a `payout_requests` row and shows the success toast; fulfil manually for now. Keep it ledger-first: every cent traceable to a `mentions` row (timestamp + redacted snippet). Flagged mentions are shown to the user as "flagged, not paid" — transparency is a product principle. PayPal Payouts API comes later behind the same interface.

## Deployment — Vercel, from day one
Structure the repo so it deploys the moment the GitHub repo is connected:
- **One repo**: Vite SPA at root, **`api/` folder with Vercel serverless functions** (`stt-token.ts`, `transcribe.ts`, `verify-mention.ts`, `diarize.ts`). Vercel auto-detects both.
- **`vercel.json`**: SPA rewrite — all non-`/api` routes → `/index.html`.
- **Secrets live only in serverless env vars**: `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Client-safe vars are `VITE_`-prefixed: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_POSTHOG_KEY`. NEVER put a provider key in client code — the ephemeral-token endpoint exists precisely for this.
- **Function limits**: keep bodies small (snippets are text; diarization chunk ≤30s audio via Supabase Storage URL, not inline). Assume ~10–60s timeouts on Hobby tier.
- HTTPS is automatic — required for both mic access and PWA install, so `vercel dev` + preview URLs work end-to-end.
- CI sanity: `npm run build && npm run test` must pass clean; PWA manifest + icons included from the first deploy so the install CTA works.

## Conventions
- Mobile-first, 390px design width; all tap targets ≥44px; respect `env(safe-area-inset-*)`.
- Copy tone: casual-smart, lowercase-friendly, no corporate speak, almost no emoji. Reuse exact strings from the README.
- Money in cents (integers) everywhere; format at the edge.
- No new colors/fonts — tokens only. No SVG illustrations; brand logos come from the campaigns table.
- Keep components small: `NestCard`, `StatTile`, `CampaignCard`, `ReceiptRow`, `TabBar`, `RecFab`, `Toast`, `Sheet`.

## Testing
- Vitest + React Testing Library for logic (streak math, ledger, gates: consent / ≥3 brands / payout; keyword matcher incl. fuzzy variants; redaction rules).
- Playwright for the funnel happy path: landing → onboarding → fake session (mock the `SttStream` interface — feed it scripted partial transcripts) → wallet cash-out request.
