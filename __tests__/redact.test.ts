import { redact, REDACTED } from '../src/lib/redact';

describe('redact', () => {
  it('redacts emails', () => {
    expect(redact('reach me at bob.smith@example.com ok')).toBe(`reach me at ${REDACTED} ok`);
  });

  it('redacts phone numbers', () => {
    expect(redact('call +1 (555) 123-4567 now')).toBe(`call ${REDACTED} now`);
  });

  it('redacts URLs', () => {
    expect(redact('see https://magpie.si/x and www.foo.com')).toBe(`see ${REDACTED} and ${REDACTED}`);
  });

  it('redacts @handles', () => {
    expect(redact('follow @nadia_codes please')).toBe(`follow ${REDACTED} please`);
  });

  it('redacts 5+ digit runs', () => {
    expect(redact('my id is 902133 today')).toBe(`my id is ${REDACTED} today`);
    expect(redact('room 4218 is fine')).toBe('room 4218 is fine'); // 4 digits: kept
  });

  it('handles a mixed-PII sentence', () => {
    const input = 'email a@b.com or @joe, call 5551234567, see http://x.io';
    const out = redact(input);
    expect(out).not.toMatch(/a@b\.com/);
    expect(out).not.toMatch(/@joe/);
    expect(out).not.toMatch(/5551234567/);
    expect(out).not.toMatch(/http:\/\/x\.io/);
    expect(out).toContain(REDACTED);
  });

  it('is idempotent', () => {
    const once = redact('email a@b.com and @joe and 123456');
    expect(redact(once)).toBe(once);
  });
});
