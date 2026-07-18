/**
 * Streaming STT interface + factory (mobile.md §1.3/§3, plan §Key interfaces).
 *
 * Both providers (ElevenLabs Scribe realtime, OpenAI gpt-realtime-whisper)
 * accept base64 audio inside JSON text frames, so the hot path is pass-through:
 * `sendPcmBase64(chunk, sampleRate)` forwards the capture chunk verbatim. The
 * REAL provider implementations land in T15 (stt/elevenlabs.ts, stt/openai.ts,
 * stt/chunked.ts); this file owns the seam + the token shape. No RN imports.
 */

export type SttState = 'connecting' | 'open' | 'reconnecting' | 'closed' | 'failed';

/** Audio format the provider expects (from `stt-token`). */
export interface SttAudioConfig {
  /** e.g. 'pcm_16000' (ElevenLabs) or 'pcm16' (OpenAI). */
  encoding: string;
  sampleRateHz: number;
}

/**
 * `stt-token` edge-fn response (plan §Edge functions). The app opens the WS
 * directly with this ephemeral, single-use token — the real provider key never
 * reaches the client.
 */
export interface SttTokenResponse {
  provider: 'elevenlabs' | 'openai';
  /** Full WS URL; for ElevenLabs the token is already embedded as a query param. */
  wsUrl: string;
  token: string;
  expiresAt: string;
  /** OpenAI transcription model id, e.g. 'gpt-realtime-whisper'. */
  model?: string;
  audio: SttAudioConfig;
}

export interface SttStream {
  start(): Promise<void>;
  /** Forward a base64 PCM frame. Both providers take base64 inside JSON frames. */
  sendPcmBase64(chunk: string, sampleRate: number): void;
  onPartial(cb: (text: string) => void): void;
  onFinal(cb: (text: string, tsMs: number) => void): void;
  onStateChange(cb: (s: SttState) => void): void;
  close(): Promise<void>;
}

/**
 * Construct the provider stream chosen by the server. Real providers are wired
 * in T15; until then this throws so a miswire fails loudly rather than silently
 * producing a dead stream. Tests and the mock session use `ScriptedSttStream`
 * (stt/scripted.ts) directly.
 */
export function createSttStream(tok: SttTokenResponse): SttStream {
  throw new Error(
    `createSttStream: provider '${tok.provider}' not implemented yet (lands in T15). ` +
      `Use ScriptedSttStream for tests / mock mode.`
  );
}
