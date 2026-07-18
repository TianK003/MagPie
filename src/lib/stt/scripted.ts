/**
 * ScriptedSttStream — plays a declarative transcript script on injected timers
 * (mobile.md §5 "the crown jewel"). Feeds the machine deterministic partials
 * and finals with no mic and no network, so the whole session flow is testable.
 * Also the engine behind T8's on-phone fake session.
 */

import type { SttState, SttStream } from '../stt';
import { realTimers, type Timers, type TimerHandle } from '../timers';

export interface ScriptStep {
  /** Milliseconds after `start()` at which to emit. */
  at: number;
  partial?: string;
  /** A final commits an utterance; `tsMs` passed to onFinal defaults to `at`. */
  final?: string;
}

export interface ScriptedSttOptions {
  script: ScriptStep[];
  timers?: Timers;
  /** Delay before the stream reports 'open' (default 0). */
  openDelayMs?: number;
}

export class ScriptedSttStream implements SttStream {
  private readonly script: ScriptStep[];
  private readonly timers: Timers;
  private readonly openDelayMs: number;

  private partialCb?: (text: string) => void;
  private finalCb?: (text: string, tsMs: number) => void;
  private stateCb?: (s: SttState) => void;

  private handles: TimerHandle[] = [];
  private closed = false;

  constructor(opts: ScriptedSttOptions) {
    this.script = [...opts.script].sort((a, b) => a.at - b.at);
    this.timers = opts.timers ?? realTimers;
    this.openDelayMs = opts.openDelayMs ?? 0;
  }

  start(): Promise<void> {
    this.emitState('connecting');
    this.schedule(this.openDelayMs, () => this.emitState('open'));
    for (const step of this.script) {
      this.schedule(step.at, () => {
        if (step.partial !== undefined) this.partialCb?.(step.partial);
        if (step.final !== undefined) this.finalCb?.(step.final, step.at);
      });
    }
    return Promise.resolve();
  }

  // Scripted stream ignores audio — it plays a fixed transcript.
  sendPcmBase64(): void {}

  onPartial(cb: (text: string) => void): void {
    this.partialCb = cb;
  }

  onFinal(cb: (text: string, tsMs: number) => void): void {
    this.finalCb = cb;
  }

  onStateChange(cb: (s: SttState) => void): void {
    this.stateCb = cb;
  }

  close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.closed = true;
    for (const h of this.handles) this.timers.clearTimeout(h);
    this.handles = [];
    this.emitState('closed');
    return Promise.resolve();
  }

  private schedule(ms: number, fn: () => void): void {
    this.handles.push(
      this.timers.setTimeout(() => {
        if (!this.closed) fn();
      }, ms)
    );
  }

  private emitState(s: SttState): void {
    this.stateCb?.(s);
  }
}
