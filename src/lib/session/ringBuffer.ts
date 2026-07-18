/**
 * Fixed-size PCM ring buffer (mobile.md §3.2). Holds the most-recent N seconds
 * of 16 kHz / mono / 16-bit PCM (default 15s = 480 KB — trivial memory). The
 * machine pushes every 250ms base64 chunk in; diarization audits pull the last
 * 10-15s out as a WAV. Old audio is overwritten; nothing is persisted. No RN
 * imports (base64 decode is injectable for the real capture path).
 */

import { base64ToBytes } from '../base64';
import { encodeWav, type WavFormat, DEFAULT_WAV_FORMAT } from './wav';

export interface RingBufferOptions {
  seconds?: number;
  format?: WavFormat;
  /** Override base64 decode (defaults to the pure helper; node+RN safe). */
  decodeBase64?: (b64: string) => Uint8Array;
}

export class PcmRingBuffer {
  private readonly capacity: number;
  private readonly format: WavFormat;
  private readonly decode: (b64: string) => Uint8Array;
  private readonly buf: Uint8Array;

  private writePos = 0;
  /** Total bytes ever written, capped at `capacity` (i.e. current fill level). */
  private filled = 0;

  constructor(opts?: RingBufferOptions) {
    this.format = opts?.format ?? DEFAULT_WAV_FORMAT;
    const seconds = opts?.seconds ?? 15;
    const bytesPerSample = this.format.bitDepth / 8;
    this.capacity = Math.floor(seconds * this.format.sampleRate * this.format.channels * bytesPerSample);
    this.decode = opts?.decodeBase64 ?? base64ToBytes;
    this.buf = new Uint8Array(this.capacity);
  }

  /** Decode + append a base64 PCM chunk, wrapping around when full. */
  push(base64Chunk: string): void {
    this.pushBytes(this.decode(base64Chunk));
  }

  /** Append raw PCM bytes, wrapping around when full. */
  pushBytes(bytes: Uint8Array): void {
    const n = bytes.byteLength;
    if (n === 0) return;
    if (n >= this.capacity) {
      // Only the tail fits; keep the most-recent `capacity` bytes.
      this.buf.set(bytes.subarray(n - this.capacity), 0);
      this.writePos = 0;
      this.filled = this.capacity;
      return;
    }
    const first = Math.min(n, this.capacity - this.writePos);
    this.buf.set(bytes.subarray(0, first), this.writePos);
    if (first < n) {
      this.buf.set(bytes.subarray(first), 0); // wrap
    }
    this.writePos = (this.writePos + n) % this.capacity;
    this.filled = Math.min(this.filled + n, this.capacity);
  }

  /** Bytes currently retained. */
  get byteLength(): number {
    return this.filled;
  }

  /** Total capacity in bytes. */
  get capacityBytes(): number {
    return this.capacity;
  }

  /**
   * Raw PCM of the most-recent `lastNSeconds` (or everything retained, if less),
   * returned oldest-to-newest. Byte-length is clamped to a whole number of
   * samples.
   */
  snapshot(lastNSeconds: number): Uint8Array {
    const bytesPerSample = this.format.bitDepth / 8;
    let want = Math.floor(lastNSeconds * this.format.sampleRate * this.format.channels) * bytesPerSample;
    want = Math.min(want, this.filled);
    if (want <= 0) return new Uint8Array(0);

    const out = new Uint8Array(want);
    // Start = writePos - want, wrapped into [0, capacity).
    const start = (this.writePos - want + this.capacity) % this.capacity;
    const first = Math.min(want, this.capacity - start);
    out.set(this.buf.subarray(start, start + first), 0);
    if (first < want) {
      out.set(this.buf.subarray(0, want - first), first); // wrap
    }
    return out;
  }

  /** WAV-wrapped snapshot of the most-recent `lastNSeconds`. */
  snapshotWav(lastNSeconds: number): Uint8Array {
    return encodeWav(this.snapshot(lastNSeconds), this.format);
  }

  clear(): void {
    this.writePos = 0;
    this.filled = 0;
  }
}
