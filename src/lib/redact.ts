/**
 * Client-side regex redaction — Stage 0 of the verification/redaction pipeline
 * (plan §Verification & redaction pipeline). Runs on the ±10s snippet BEFORE it
 * ever leaves the device; the server re-runs the same regex spec (defence in
 * depth) plus an LLM pass. The full transcript never leaves the device — only
 * the redacted snippet does.
 *
 * Rules (exact, per brief): emails, phones, URLs, @handles, 5+ digit runs.
 * Everything collapses to the single token `[redacted]`. Order-safe (all rules
 * applied) and idempotent (re-running never changes an already-redacted string,
 * because `[redacted]` contains no digit / `@` / URL / email shape).
 */

export const REDACTED = '[redacted]';

// URLs first so `http://a.com/x` doesn't get partially eaten by later rules.
const URL_RE = /https?:\/\/\S+|www\.\S+/gi;
// Emails before @handles so `a@b.com` isn't half-caught as an @handle.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Phone-ish runs: a digit, 6+ digit/space/()/./- chars, then a digit.
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;
// Social @handles (2+ word chars).
const HANDLE_RE = /@\w{2,}/g;
// Any bare run of 5+ digits (IDs, card fragments, etc.).
const DIGITS_RE = /\d{5,}/g;

/** Redact PII from a snippet. Safe to call repeatedly (idempotent). */
export function redact(input: string): string {
  return input
    .replace(URL_RE, REDACTED)
    .replace(EMAIL_RE, REDACTED)
    .replace(PHONE_RE, REDACTED)
    .replace(HANDLE_RE, REDACTED)
    .replace(DIGITS_RE, REDACTED);
}
