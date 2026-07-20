# Live speaker & mention detection — implementation plan

How Magpie turns a live conversation into paid brand mentions. Every stage sits behind a
swappable interface so it can be developed, tested, and replaced independently.

## Architecture: one interface, swappable backends

Everything downstream of a transcript event — client keyword spotting → coin pop → pending
receipt → "2 voices ✓" pill → session summary — consumes a single `SttStream` interface.
The source is swappable at runtime via a flag in the session store.

```
SttStream interface  (src/lib/stt.ts)
  onPartial(cb) · onFinal(cb) · onSpeakers(cb) · close()
        ├── ScriptedSttStream    — deterministic, timed transcript. Used for tests,
        │                          demos, and development without a mic or network.
        ├── WhisperSttStream      — on-device Whisper (whisper.rn) + native PCM capture.
        │                          Real transcription, no cloud, privacy-preserving.
        └── ElevenLabsSttStream   — cloud Scribe STT with diarize:true for per-word
                                    speaker_id → real "2 voices" from the API.
```

- **Keyword spotting is client-side** (`src/lib/keywords.ts`), fed by `onPartial`/`onFinal`
  from any source — identical behavior regardless of backend (fuzzy variants, cooldown).
- **The "2 voices ✓" gate** is driven by `onSpeakers`: a real distinct-`speaker_id` count in
  diarized mode, or a scripted timeline otherwise. Mentions accrue only after ✓.

## Speaker detection

Two paths satisfy the 2+ voices requirement, in order of preference:

1. **ElevenLabs Scribe diarization** (`diarize:true` returns per-word `speaker_id`) — real
   speaker counting from the STT we already use, no custom ML.
2. **On-device speaker embeddings** — the privacy-forward roadmap: segmentation + embedding
   run on-device, ephemeral, deleted after processing. This is how Magpie stays clear of
   biometric-privacy regimes (e.g. BIPA) while still catching gaming. Larger effort;
   sequenced after the diarization path proves out.

## Build order

1. **Scripted path first.** `SttStream` interface + `ScriptedSttStream` + client keyword
   spotting + session store (state, mention count, earnings in **cents**, `voiceConfirmed`,
   `sttSource`). Fully testable and demoable with no native/network dependency.
2. **On-device Whisper.** `WhisperSttStream` via `whisper.rn` + native PCM capture, behind
   the same interface. Real transcription; keyword spotting unchanged.
3. **Cloud diarization.** `ElevenLabsSttStream`: chunked audio → `/v1/speech-to-text` with
   `diarize:true` → `onFinal` text + `onSpeakers` distinct-speaker count. Provider keys stay
   server-side (see `stt-token` in `CLAUDE.md`); never ship a raw provider key in the bundle.
4. **On-device speaker embeddings** (roadmap) — replaces or augments cloud diarization.

## Traps to watch

- Producing a valid WAV from native PCM chunks (header / sample-rate / mono) that a cloud STT
  accepts is the classic time-sink — validate the format early against a real sample.
- Network calls can fail; the scripted path is the reliable fallback and the test target.

## Verification

- Scripted run produces coin pops, pending→paid receipts, "2 voices ✓", and a summary with
  correct cent totals — in the simulator and on a device.
- Real run: speech into the phone produces a transcript-driven keyword hit and a
  diarization-driven "2 voices ✓" within a couple of seconds.

## Out of scope (for now)

- WebSocket streaming STT — chunked HTTP is sufficient; revisit if latency demands it.
- Real payout provider and server-side anti-gaming enforcement — tracked separately; see
  `CLAUDE.md`.
