// whisper.rn 0.6.0 ships an `exports` map without a "." entry and no
// adapters/index, so TypeScript's bundler resolution can't find these
// specifiers even though Metro resolves them fine at runtime (via the
// react-native condition / direct file paths). These ambient shims keep
// `tsc --noEmit` green. Types are intentionally loose — not best practice,
// but this build only needs transcription working on the device.
declare module 'whisper.rn' {
  export interface WhisperContext {
    release(): Promise<void>;
    [key: string]: any;
  }
  export function initWhisper(options: { filePath: string }): Promise<WhisperContext>;
  const _default: any;
  export default _default;
}

declare module 'whisper.rn/realtime-transcription/index.js' {
  export class RealtimeTranscriber {
    constructor(deps: any, options: any, callbacks: any);
    start(): Promise<void>;
    stop(): Promise<void>;
  }
}

declare module 'whisper.rn/realtime-transcription/adapters/AudioPcmStreamAdapter.js' {
  export class AudioPcmStreamAdapter {
    constructor(config?: any);
  }
}
