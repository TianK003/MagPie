/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: '#24241c',
        paper: '#fdfdfb',
        accent: { DEFAULT: '#336ca2', tint: '#9cc4e8', soft: '#eaf1f8', ondark: '#dbe9f5' },
        line: { DEFAULT: '#e2e1d8', strong: '#d8d7cc', dashed: '#c7c6bb' },
        muted: { DEFAULT: '#6b6b60', 2: '#8a8a80', 3: '#a3a294', 4: '#b5b4a8' },
        rec: '#c23b3b',
        disabled: { bg: '#e2e1d8', text: '#a3a294' },
      },
      borderRadius: { card: 14, hero: 18, row: 12, pill: 999, sheet: 22 },
      borderWidth: { DEFAULT: 1.5, 1.5: 1.5 },
      spacing: { screen: 20, tap: 44, btn: 52, fab: 56 },
      fontSize: {
        hero: 42,
        money: 38,
        'money-lg': 40,
        'money-sm': 36,
        title: 24,
        'title-lg': 28,
        body: 15,
        btn: 16,
        sec: 12.5,
        'sec-lg': 13.5,
        mono: 11,
        'mono-sm': 10,
        'mono-xs': 9.5,
      },
      letterSpacing: { heading: -0.8, 'heading-hero': -1.1, monowide: 0.9 }, // px (RN), ≈ −0.02/−0.03em & +.08em
      fontFamily: {
        grotesk: 'SpaceGrotesk_400Regular',
        'grotesk-medium': 'SpaceGrotesk_500Medium',
        'grotesk-semibold': 'SpaceGrotesk_600SemiBold',
        'grotesk-bold': 'SpaceGrotesk_700Bold',
        mono: 'IBMPlexMono_400Regular',
        'mono-medium': 'IBMPlexMono_500Medium',
      },
    },
  },
  plugins: [],
};
