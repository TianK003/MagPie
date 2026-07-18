import {
  colors,
  duration,
  fontFamily,
  fontSize,
  letterSpacing,
  radius,
  scrim,
  space,
} from '../src/theme/tokens';

// Guards against accidental token drift — the whole app's look hangs off these
// exact values. If a token changes here without a matching design change, this
// fails loudly.
describe('design tokens', () => {
  it('has the exact spec colors', () => {
    expect(colors.ink).toBe('#24241c');
    expect(colors.paper).toBe('#fdfdfb');
    expect(colors.accent.DEFAULT).toBe('#336ca2');
    expect(colors.accent.tint).toBe('#9cc4e8');
    expect(colors.accent.soft).toBe('#eaf1f8');
    expect(colors.accent.ondark).toBe('#dbe9f5');
    expect(colors.line.DEFAULT).toBe('#e2e1d8');
    expect(colors.line.strong).toBe('#d8d7cc');
    expect(colors.line.dashed).toBe('#c7c6bb');
    expect(colors.muted.DEFAULT).toBe('#6b6b60');
    expect(colors.muted[2]).toBe('#8a8a80');
    expect(colors.muted[3]).toBe('#a3a294');
    expect(colors.muted[4]).toBe('#b5b4a8');
    expect(colors.rec).toBe('#c23b3b');
    expect(colors.disabled.bg).toBe('#e2e1d8');
    expect(colors.disabled.text).toBe('#a3a294');
    expect(scrim).toBe('rgba(36,36,28,0.45)');
  });

  it('has the exact radii and spacing', () => {
    expect(radius).toEqual({ card: 14, hero: 18, row: 12, pill: 999, sheet: 22 });
    expect(space).toEqual({ screen: 20, tap: 44, btn: 52, fab: 56 });
  });

  it('has the exact font-size scale', () => {
    expect(fontSize.hero).toBe(42);
    expect(fontSize.money).toBe(38);
    expect(fontSize.moneyLg).toBe(40);
    expect(fontSize.moneySm).toBe(36);
    expect(fontSize.title).toBe(24);
    expect(fontSize.titleLg).toBe(28);
    expect(fontSize.body).toBe(15);
    expect(fontSize.btn).toBe(16);
    expect(fontSize.sec).toBe(12.5);
    expect(fontSize.secLg).toBe(13.5);
    expect(fontSize.mono).toBe(11);
    expect(fontSize.monoSm).toBe(10);
    expect(fontSize.monoXs).toBe(9.5);
  });

  it('has the precomputed (px) letter-spacing tokens', () => {
    expect(letterSpacing).toEqual({ heading: -0.8, headingHero: -1.1, monowide: 0.9 });
  });

  it('maps the six font families to their weight-specific names', () => {
    expect(fontFamily.grotesk).toBe('SpaceGrotesk_400Regular');
    expect(fontFamily.groteskMedium).toBe('SpaceGrotesk_500Medium');
    expect(fontFamily.groteskSemibold).toBe('SpaceGrotesk_600SemiBold');
    expect(fontFamily.groteskBold).toBe('SpaceGrotesk_700Bold');
    expect(fontFamily.mono).toBe('IBMPlexMono_400Regular');
    expect(fontFamily.monoMedium).toBe('IBMPlexMono_500Medium');
  });

  it('has the animation durations', () => {
    expect(duration).toEqual({ toastIn: 250, toastAuto: 2400, sheetIn: 300 });
  });
});
