import { bytesToBase64 } from '../src/lib/base64';
import { PcmRingBuffer } from '../src/lib/session/ringBuffer';
import { encodeWav, wavHeader } from '../src/lib/session/wav';

describe('wav header (16 kHz / mono / 16-bit)', () => {
  it('writes the exact 44 canonical header bytes', () => {
    const dataLen = 8;
    const h = wavHeader(dataLen);
    expect(h.byteLength).toBe(44);

    const ascii = (start: number, end: number) =>
      String.fromCharCode(...Array.from(h.subarray(start, end)));
    const u32 = (o: number) => h[o] | (h[o + 1] << 8) | (h[o + 2] << 16) | (h[o + 3] << 24);
    const u16 = (o: number) => h[o] | (h[o + 1] << 8);

    expect(ascii(0, 4)).toBe('RIFF');
    expect(u32(4)).toBe(36 + dataLen); // ChunkSize
    expect(ascii(8, 12)).toBe('WAVE');
    expect(ascii(12, 16)).toBe('fmt ');
    expect(u32(16)).toBe(16); // Subchunk1Size
    expect(u16(20)).toBe(1); // PCM
    expect(u16(22)).toBe(1); // channels
    expect(u32(24)).toBe(16000); // sample rate
    expect(u32(28)).toBe(32000); // byte rate = 16000 * 1 * 2
    expect(u16(32)).toBe(2); // block align
    expect(u16(34)).toBe(16); // bits per sample
    expect(ascii(36, 40)).toBe('data');
    expect(u32(40)).toBe(dataLen); // Subchunk2Size
  });

  it('encodeWav prepends the header to the PCM payload', () => {
    const pcm = new Uint8Array([1, 2, 3, 4]);
    const wav = encodeWav(pcm);
    expect(wav.byteLength).toBe(44 + 4);
    expect(Array.from(wav.subarray(44))).toEqual([1, 2, 3, 4]);
  });
});

describe('PcmRingBuffer', () => {
  it('accepts base64 chunks and reports fill level', () => {
    const ring = new PcmRingBuffer();
    ring.push(bytesToBase64(new Uint8Array([0, 0, 0, 0])));
    expect(ring.byteLength).toBe(4);
    expect(ring.capacityBytes).toBe(15 * 16000 * 2); // 15s @ 16k/16-bit mono
  });

  it('wraps around correctly, keeping the most-recent bytes', () => {
    // Tiny buffer: capacity = 1s * 10 samples * 1 byte = 10 bytes.
    const ring = new PcmRingBuffer({
      seconds: 1,
      format: { sampleRate: 10, channels: 1, bitDepth: 8 },
    });
    ring.pushBytes(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(Array.from(ring.snapshot(1))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    ring.pushBytes(new Uint8Array([9, 10, 11, 12])); // overflows by 2
    expect(Array.from(ring.snapshot(1))).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    // Last 0.4s = 4 samples.
    expect(Array.from(ring.snapshot(0.4))).toEqual([9, 10, 11, 12]);
  });

  it('keeps only the tail when a single chunk exceeds capacity', () => {
    const ring = new PcmRingBuffer({
      seconds: 1,
      format: { sampleRate: 4, channels: 1, bitDepth: 8 },
    });
    ring.pushBytes(new Uint8Array([1, 2, 3, 4, 5, 6])); // capacity is 4
    expect(Array.from(ring.snapshot(1))).toEqual([3, 4, 5, 6]);
  });

  it('snapshotWav wraps the snapshot with a matching header', () => {
    const ring = new PcmRingBuffer({
      seconds: 1,
      format: { sampleRate: 4, channels: 1, bitDepth: 8 },
    });
    ring.pushBytes(new Uint8Array([1, 2, 3, 4]));
    const wav = ring.snapshotWav(1);
    expect(wav.byteLength).toBe(44 + 4);
    expect(Array.from(wav.subarray(44))).toEqual([1, 2, 3, 4]);
  });
});
