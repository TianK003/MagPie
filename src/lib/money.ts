/**
 * Money formatting. Money is ALWAYS integer cents everywhere in the app
 * (CLAUDE.md); formatting is the only place it becomes a string. Every helper
 * throws on non-integer input so a stray float can never silently render.
 */

function assertIntCents(cents: number): void {
  if (!Number.isInteger(cents)) {
    throw new Error(`money: expected integer cents, got ${cents}`);
  }
}

/** Split |cents| into whole dollars + zero-padded remainder, integer-only. */
function parts(cents: number): { dollars: number; rem: string } {
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, '0');
  return { dollars, rem };
}

/** `fmtCents(538) -> "$5.38"`; negatives -> `"-$5.38"`. */
export function fmtCents(cents: number): string {
  assertIntCents(cents);
  const { dollars, rem } = parts(cents);
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${dollars}.${rem}`;
}

/**
 * Signed dollar amount for ledger rows: `+$5.00` for credits, `-$5.00` for
 * debits, `$0.00` for zero (no sign).
 */
export function fmtSigned(cents: number): string {
  assertIntCents(cents);
  const { dollars, rem } = parts(cents);
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : '';
  return `${sign}$${dollars}.${rem}`;
}

/** `fmtCentsPill(5) -> "+5¢"` — the per-mention reward pill / coin pop. */
export function fmtCentsPill(cents: number): string {
  assertIntCents(cents);
  const sign = cents < 0 ? '-' : '+';
  return `${sign}${Math.abs(cents)}¢`;
}
