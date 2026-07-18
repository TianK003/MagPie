/**
 * AudioCapture interface + MockAudioCapture (mobile.md §1.3, plan §Key
 * interfaces). The REAL implementation (dual-stream @siteed/audio-studio, FGS
 * notification, keep-awake) lands in T12; this file owns the seam and a silent
 * mock so the machine and the on-phone fake session run without a mic. No RN
 * imports here — the mock produces silent base64 PCM on injected timers.
 */

import { bytesToBase64 } from './base64';
import { realTimers, type Timers, type TimerHandle } from './timers';

export interface AudioCaptureConfig {
  sampleRate: 16000;
  interval: 250;
}

export interface AudioCapture {
  requestPermission(): Promise<boolean>;
  start(cfg: AudioCaptureConfig, onChunk: (base64Pcm: string) => void): Promise<void>;
  stop(): Promise<void>;
}

export interface MockAudioCaptureOptions {
  /** Result returned by requestPermission (default true). */
  permission?: boolean;
  timers?: Timers;
  /** 16-bit sample count per emitted chunk; defaults to interval * sampleRate. */
  samplesPerChunk?: number;
}

/**
 * Silent-PCM mock. Emits base64-encoded, all-zero 16 kHz / mono / 16-bit PCM
 * chunks on the configured interval via injected timers. Permission result is
 * configurable so the machine's denied-path is testable.
 */
export class MockAudioCapture implements AudioCapture {
  private readonly permission: boolean;
  private readonly timers: Timers;
  private readonly samplesPerChunkOverride?: number;

  private handle?: TimerHandle;
  private running = false;

  constructor(opts?: MockAudioCaptureOptions) {
    this.permission = opts?.permission ?? true;
    this.timers = opts?.timers ?? realTimers;
    this.samplesPerChunkOverride = opts?.samplesPerChunk;
  }

  requestPermission(): Promise<boolean> {
    return Promise.resolve(this.permission);
  }

  start(cfg: AudioCaptureConfig, onChunk: (base64Pcm: string) => void): Promise<void> {
    if (this.running) return Promise.resolve();
    this.running = true;

    const samples =
      this.samplesPerChunkOverride ?? Math.round((cfg.sampleRate * cfg.interval) / 1000);
    // 16-bit mono => 2 bytes/sample; silence is all zeros.
    const silentChunk = bytesToBase64(new Uint8Array(samples * 2));

    const tick = () => {
      if (!this.running) return;
      onChunk(silentChunk);
      this.handle = this.timers.setTimeout(tick, cfg.interval);
    };
    this.handle = this.timers.setTimeout(tick, cfg.interval);
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.running = false;
    if (this.handle !== undefined) {
      this.timers.clearTimeout(this.handle);
      this.handle = undefined;
    }
    return Promise.resolve();
  }
}
