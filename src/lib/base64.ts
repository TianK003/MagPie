/**
 * Tiny, dependency-free base64 <-> bytes helpers.
 *
 * The audio hot path is base64 pass-through (see docs/design/mobile.md §1.3),
 * but the ring buffer and WAV wrapping need real bytes, and the mock audio
 * capture needs to synthesise base64 PCM. These helpers work identically under
 * Node (jest, via `Buffer`) and React Native / browser (pure-JS fallback), so
 * `src/lib/` stays free of any runtime-specific imports.
 */

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Reverse lookup table (char code -> 6-bit value); -1 for non-base64 bytes.
const B64_LOOKUP: number[] = (() => {
  const table = new Array<number>(256).fill(-1);
  for (let i = 0; i < B64_CHARS.length; i++) {
    table[B64_CHARS.charCodeAt(i)] = i;
  }
  return table;
})();

/** Decode a base64 string to raw bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  return pureBase64ToBytes(b64);
}

/** Encode raw bytes to a base64 string. */
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  return pureBytesToBase64(bytes);
}

function pureBase64ToBytes(b64: string): Uint8Array {
  // Strip padding + any stray whitespace.
  let clean = '';
  for (let i = 0; i < b64.length; i++) {
    const code = b64.charCodeAt(i);
    if (code === 61 /* = */ || B64_LOOKUP[code] === -1) continue;
    clean += b64[i];
  }
  const outLen = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(outLen);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_LOOKUP[clean.charCodeAt(i)];
    const c1 = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const c2 = i + 2 < clean.length ? B64_LOOKUP[clean.charCodeAt(i + 2)] : -1;
    const c3 = i + 3 < clean.length ? B64_LOOKUP[clean.charCodeAt(i + 3)] : -1;

    out[o++] = (c0 << 2) | (c1 >> 4);
    if (c2 !== -1) out[o++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (c3 !== -1) out[o++] = ((c2 & 3) << 6) | c3;
  }
  return out;
}

function pureBytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      B64_CHARS[(n >> 18) & 63] +
      B64_CHARS[(n >> 12) & 63] +
      B64_CHARS[(n >> 6) & 63] +
      B64_CHARS[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + '==';
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out +=
      B64_CHARS[(n >> 18) & 63] +
      B64_CHARS[(n >> 12) & 63] +
      B64_CHARS[(n >> 6) & 63] +
      '=';
  }
  return out;
}
