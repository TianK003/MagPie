# Hackathon: Live speaker/mention detection demo (2-hour build)

## Context

Magpie is a greenfield Expo/RN app. A hackathon demo is in **2 hours**, **live on a real phone** (two people actually talk), and the goal is **real detection if possible with a bulletproof scripted fallback**. A custom dev client is already installed on a physical device. A friend is concurrently building the core app (nav/screens/design system already exist).

**Hard reality driving this plan:** true on-device whisper-tiny + speaker-embedding ML **cannot be implemented and tested in 2 hours** from this state (no native build proven for ML, no audio code exists, embedding/segmentation/threshold tuning is days of work). It also buys **zero visible demo value** — judges can't perceive where compute runs. So:

- **On-device ML is OUT of scope for the demo.** It becomes the roadmap + privacy/legal talking point ("we can run this on-device, ephemeral, deleted daily — that's how we stay clear of BIPA while still catching gaming").
- **"Speaker detection" for the demo is satisfied by ElevenLabs Scribe diarization** (`diarize: true` returns per-word `speaker_id`), which gives a *real* "2 voices ✓" gate + mention detection from the API we already planned to use — no custom ML.
- **The demo must never depend on the real path working live.** A scripted path drives the identical UI and is the rehearsal target + on-stage insurance.

## Architecture: one interface, two backends, a flip switch

Everything downstream (keyword spotting → coin pop → pending receipt → voice pill → summary) consumes a single interface. The source is swappable at runtime via a flag in the session store.

```
SttStream interface  (src/lib/stt.ts)
  onPartial(cb) · onFinal(cb) · onSpeakers(cb) · close()
        ├── ScriptedSttStream   (src/lib/stt-scripted.ts)  ← GUARANTEED. Timed pre-written transcript. Fallback + rehearsal.
        └── ElevenLabsSttStream  (src/lib/stt-elevenlabs.ts) ← REAL. Chunked audio → /v1/speech-to-text?diarize=true → same events.
```

Keyword spotting is **client-side** (`src/lib/keywords.ts`), fed by `onPartial`/`onFinal` from *either* source, so it is identical in scripted and real mode. The "2 voices ✓" pill is driven by `onSpeakers` — faked on a timer in scripted mode, from diarization `speaker_id` count in real mode.

## Build order (strict — guaranteed thing first)

### Gate (0:00–0:10) — verify the external dependencies NOW, not at 1:10
Three checks, in parallel, before writing feature code:
1. **Audio capture:** import `@siteed/audio-studio`, start recording on the device, confirm chunks/PCM arrive (log to console). Works → real path is on the table. Fails/module not in binary → **do NOT rebuild** (no time); go scripted-only, still a fine demo.
2. **ElevenLabs key + credits exist**, and a real sample POSTed to `/v1/speech-to-text` with `diarize:true` actually returns `speaker_id`s on this plan tier. If diarization isn't enabled, the real "2 voices" path is dead — know it at minute 5, not 1:10.
3. **Decouple from the friend's nav:** temporarily wire the recording screen as the entry route on YOUR build so it's directly launchable. Do not block on the friend's `app/index.tsx`/nav rewrite.

### Tier 0a (0:10–0:50) — MINIMAL bulletproof scripted demo (THIS IS THE DEMO)
Not a fallback — this is the thing you actually show. Pure TS/JS, no native, no network. Keep it small so it lands with time to spare:
- `src/lib/stt.ts` — the `SttStream` interface (`onPartial`/`onFinal`/`onSpeakers`/`close`).
- `src/lib/stt-scripted.ts` — emits a scripted conversation's partials on setInterval; emits speaker-count events (`detecting… → 1 voice → 2 voices ✓`).
- `src/lib/keywords.ts` — match partial text against opted-in campaign terms (+ simple fuzzy variants); fire once per hit with cooldown.
- `src/stores/session.ts` — zustand slice: session state, mention count, earnings (**cents**), `voiceConfirmed`, `sttSource: 'scripted' | 'real'` (default `'scripted'`).
- ONE recording screen: REC button, a counter that ticks on scripted hits, a "2 voices ✓" pill that flips, running cents total, stop → summary (reuse `Sheet.tsx`).

### Tier 0b (0:50–1:15) — Polish, only with time in hand
Reanimated waveform bars, `+N¢` coin-pop, receipt pending→paid transitions, `ReceiptRow`. All optional eye-candy layered on the working Tier 0a. Skip freely if behind.

### Tier 1 (only if Gate#1+#2 passed AND Tier 0a done by ~1:15) — Real ElevenLabs. ABORTABLE.
- `src/lib/stt-elevenlabs.ts` implementing `SttStream`: capture ~3–5s chunks via audio-studio → POST to ElevenLabs `/v1/speech-to-text` with `diarize:true` → `onFinal` text + `onSpeakers` (distinct `speaker_id` count). **Chunked HTTP, NOT WebSocket.**
- **Watch two traps:** (a) getting a valid WAV out of audio-studio chunks (header/sample-rate/mono) that ElevenLabs accepts is the classic "20 min → 90 min" integration; (b) **venue wifi** can fail a live cloud call in ways rehearsal won't catch.
- **Key handling:** throwaway `EXPO_PUBLIC_ELEVENLABS_KEY` for the demo, **rotate/kill right after**. Demo-only; note insecurity in a comment.
- **Hard abort rule:** if Tier 0a runs past ~1:15, **drop Tier 1 entirely** and spend the rest polishing + rehearsing scripted. Real-on-stage is upside, not the plan.

### Out of scope: WS streaming, on-device ML — do not attempt.
Last-resort fallback if everything burns: `magpie-prototype-standalone.html` already fakes detection on a timer.

### Rehearse + lock (1:35–2:00)
- Rehearse on the **actual demo phone** at least twice, end to end.
- **Default the flag to `'scripted'`.** Flip to `'real'` on stage ONLY if you got **two clean real-mode rehearsals**. It looks identical either way. Keep a one-tap flip back to scripted if real flakes mid-demo.

## Coordination with the friend (avoid collisions)
- **You own:** `src/lib/stt*.ts`, `src/lib/keywords.ts`, `src/stores/session.ts`, the recording-session screen + its sub-components.
- **Friend owns:** core nav, tabs, landing/onboarding, design system, wallet/rank. Agree on where the REC action launches your session screen.

## Verification
- Console-log confirms audio chunks arrive on device (Gate).
- Scripted run: talking through the session produces coin pops, pending→paid receipts, "2 voices ✓", and a summary sheet with correct cent totals — **in the iOS/Android simulator and on the phone**.
- Real run (if reached): actual speech into the phone produces a real transcript-driven keyword hit and a diarization-driven "2 voices ✓" within a couple seconds.
- Final gate: two clean rehearsals on the demo device before deciding the on-stage flag value.

**Honest "will we be good?" verdict:** Yes for a **scripted live demo** — if Tier 0a stays minimal and is built first. **Probably not** for real-detection-on-stage — 20 min of test time is enough to rehearse scripted twice but not to trust the cloud path against venue wifi + audio-format plumbing. Treat real detection as a bonus; default to scripted on stage.

## Explicitly NOT doing (and why)
- On-device whisper/embeddings — not buildable/testable in 2h, no visible demo value.
- WebSocket streaming STT — too fiddly for the window; chunked HTTP is enough.
- Supabase edge functions / `stt-token` / RLS backend — not needed to demo; throwaway key + rotate.
- Real payout, anti-gaming server logic — out of scope for the demo.
