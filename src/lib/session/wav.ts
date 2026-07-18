/**
 * Canonical 44-byte WAV header writer for the diarization uploads
 * (mobile.md §3.2). Defaults are the capture format: 16 kHz, mono, 16-bit PCM.
 * Byte-exact — the machine wraps a ring-buffer PCM snapshot with this header
 * before uploading to the `diarization` bucket. No RN imports.
 */

export interface WavFormat {
  sampleRate: number;
  channels: number;
  bitDepth: number;
}

export const DEFAULT_WAV_FORMAT: WavFormat = {
  sampleRate: 16000,
  channels: 1,
  bitDepth: 16,
};

const HEADER_BYTES = 44;

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/** Build the 44-byte canonical WAV/PCM header for a `dataLength`-byte payload. */
export function wavHeader(dataLength: number, fmt: WavFormat = DEFAULT_WAV_FORMAT): Uint8Array {
  const { sampleRate, channels, bitDepth } = fmt;
  const blockAlign = (channels * bitDepth) / 8;
  const byteRate = sampleRate * blockAlign;

  const buf = new ArrayBuffer(HEADER_BYTES);
  const view = new DataView(buf);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true); // ChunkSize
  writeAscii(view, 8, 'WAVE');

  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (PCM)
  view.setUint16(20, 1, true); // AudioFormat = PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  writeAscii(view, 36, 'data');
  view.setUint32(40, dataLength, true); // Subchunk2Size

  return new Uint8Array(buf);
}

/** Prepend a WAV header to raw PCM bytes, returning a complete WAV file. */
export function encodeWav(pcm: Uint8Array, fmt: WavFormat = DEFAULT_WAV_FORMAT): Uint8Array {
  const header = wavHeader(pcm.byteLength, fmt);
  const out = new Uint8Array(header.byteLength + pcm.byteLength);
  out.set(header, 0);
  out.set(pcm, header.byteLength);
  return out;
}
