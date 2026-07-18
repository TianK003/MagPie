/**
 * Tiny RFC-4122 v4 UUID generator with an injectable RNG.
 *
 * No new dependencies (brief: "use a tiny local uuid4 from Math.random seeded
 * via injected rng for testability"). The session machine injects a
 * deterministic `rng` in tests so `clientMentionId`s are reproducible.
 */

export type Rng = () => number;

/** Generate a v4 UUID. `rng` should return a float in [0, 1). */
export function uuid4(rng: Rng = Math.random): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Math.floor(rng() * 256) & 0xff;
  }
  // Version (4) and variant (10xx) bits per RFC 4122 §4.4.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) {
    hex.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}
