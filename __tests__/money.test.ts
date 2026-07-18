import { fmtCents, fmtCentsPill, fmtSigned } from '../src/lib/money';

describe('money', () => {
  describe('fmtCents', () => {
    it('formats cents as dollars', () => {
      expect(fmtCents(538)).toBe('$5.38');
      expect(fmtCents(5)).toBe('$0.05');
      expect(fmtCents(0)).toBe('$0.00');
      expect(fmtCents(100)).toBe('$1.00');
      expect(fmtCents(-538)).toBe('-$5.38');
    });
    it('throws on non-integer cents', () => {
      expect(() => fmtCents(5.5)).toThrow();
    });
  });

  describe('fmtSigned', () => {
    it('signs credits and debits', () => {
      expect(fmtSigned(500)).toBe('+$5.00');
      expect(fmtSigned(-500)).toBe('-$5.00');
      expect(fmtSigned(0)).toBe('$0.00');
    });
    it('throws on non-integer cents', () => {
      expect(() => fmtSigned(-0.1)).toThrow();
    });
  });

  describe('fmtCentsPill', () => {
    it('formats the reward pill', () => {
      expect(fmtCentsPill(5)).toBe('+5¢');
      expect(fmtCentsPill(8)).toBe('+8¢');
    });
    it('throws on non-integer cents', () => {
      expect(() => fmtCentsPill(5.25)).toThrow();
    });
  });
});
