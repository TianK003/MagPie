/**
 * Magpie — full app, single-screen port of the design prototype
 * (design_handoff_magpie_app/Magpie.dc.html). Dark-theme-first, Nunito.
 * Self-contained demo engine (fake mention detection on a timer) so the whole
 * flow is demonstrable without the audio/STT/backend pipeline wired.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BIRD = require('../assets/magpie-bird.png');
const ICON = require('../assets/magpie-icon.png');

// ── fonts ────────────────────────────────────────────────────────────────
const F = {
  r: 'Nunito_400Regular',
  m: 'Nunito_500Medium',
  sb: 'Nunito_600SemiBold',
  b: 'Nunito_700Bold',
  xb: 'Nunito_800ExtraBold',
} as const;

// ── accents (flat, no gradients) ───────────────────────────────────────────
const BLUE = '#4aaee0';
const BLUE2 = '#38ade0';
const TEAL = '#33c6a7';
const CYAN = '#45c5e5';
const GOLD = '#ecb22e';

type Theme = {
  bg: string; fg: string; sub: string; card: string; line: string; chip: string; btn: string;
};
const DARK: Theme = {
  bg: '#14304a', fg: '#f2f8fb', sub: 'rgba(242,248,251,0.62)', card: 'rgba(255,255,255,0.08)',
  line: 'rgba(255,255,255,0.14)', chip: 'rgba(255,255,255,0.13)', btn: '#1d4260',
};
const LIGHT: Theme = {
  bg: '#e6f4fb', fg: '#17384c', sub: 'rgba(23,56,76,0.6)', card: '#ffffff',
  line: 'rgba(23,56,76,0.12)', chip: '#d4ecf7', btn: '#ffffff',
};

// ── data (from prototype) ──────────────────────────────────────────────────
type Model = 'say' | 'pool';
type Company = {
  id: string; name: string; letter: string; grad: string; ink: string; model: Model;
  rate: number; payLabel: string; paySub: string; tag: string; say: string;
  collectors: string; weekMentions: string; payNote: string; desc: string;
};
const COMPANIES: Company[] = [
  { id: 'nordbrew', name: 'Nordbrew', letter: 'N', grad: BLUE, ink: '#06131c', model: 'say', rate: 2, payLabel: '2¢', paySub: 'per say', tag: 'Cold-brew coffee', say: '"Nordbrew"', collectors: '2.4k', weekMentions: '18.2k', payNote: 'Pays instantly for every natural mention Magpie hears. Bonus keyword this week: "oat foam" (+1¢).', desc: 'Small-batch cold brew from Bergen — cans and taps across Norway. They want word-of-mouth in cafés, gyms and offices.' },
  { id: 'loop', name: 'Loop Fitness', letter: 'L', grad: CYAN, ink: '#14102e', model: 'pool', rate: 1.4, payLabel: 'pool', paySub: 'monthly', tag: 'Gym chain', say: '"Loop"', collectors: '3.1k', weekMentions: '24.7k', payNote: '$40k monthly pool split across all mentions that month — fewer talkers, bigger cut. Currently ≈1.4¢ per mention.', desc: '24/7 gym chain with 60 locations. Looking for mentions among students and young professionals.' },
  { id: 'kilter', name: 'Kilter Bank', letter: 'K', grad: TEAL, ink: '#052019', model: 'pool', rate: 1.1, payLabel: 'pool', paySub: 'monthly', tag: 'Neobank', say: '"Kilter"', collectors: '1.8k', weekMentions: '11.5k', payNote: 'Monthly pool, currently ≈1.1¢ per mention. No scripts — mentions must sound natural or they don\'t count.', desc: 'Neobank for freelancers — instant invoicing, tax pots, and same-day payouts.' },
  { id: 'voltway', name: 'Voltway', letter: 'V', grad: BLUE, ink: '#0a1226', model: 'say', rate: 2, payLabel: '2¢', paySub: 'per say', tag: 'E-scooter sharing', say: '"Voltway"', collectors: '2.9k', weekMentions: '20.3k', payNote: 'Pays 2¢ per mention instantly — double rate on weekends.', desc: 'City e-scooters in 12 cities. Weekend rides are their growth push.' },
  { id: 'solstice', name: 'Solstice', letter: 'S', grad: '#7fe0cc', ink: '#06131c', model: 'pool', rate: 1.2, payLabel: 'pool', paySub: 'monthly', tag: 'Skincare', say: '"Solstice"', collectors: '1.2k', weekMentions: '7.9k', payNote: '$25k monthly pool split across all mentions, currently ≈1.2¢ per mention.', desc: 'Nordic skincare made from glacier water and seaweed.' },
];
const COMPANY = (id: string) => COMPANIES.find((c) => c.id === id)!;

type BoardRow = { rank: number; initials: string; name: string; says: number; cents: number; you?: boolean };
const BOARD: BoardRow[] = [
  { rank: 1, initials: 'SA', name: 'Sofie A.', says: 412, cents: 1465 },
  { rank: 2, initials: 'JT', name: 'Jonas T.', says: 388, cents: 1120 },
  { rank: 3, initials: 'MK', name: 'Mina K.', says: 356, cents: 904 },
  { rank: 4, initials: 'EB', name: 'Emil B.', says: 312, cents: 791 },
  { rank: 5, initials: 'RH', name: 'Rikke H.', says: 288, cents: 710 },
  { rank: 6, initials: 'OL', name: 'Oskar L.', says: 260, cents: 644 },
  { rank: 7, initials: 'PS', name: 'Petra S.', says: 241, cents: 590 },
  { rank: 11, initials: 'HF', name: 'Hanna F.', says: 210, cents: 495 },
  { rank: 12, initials: 'MV', name: 'You', says: 203, cents: 0, you: true },
  { rank: 13, initials: 'AN', name: 'Aksel N.', says: 197, cents: 461 },
];

const FILLER = ['so', 'anyway', 'I', 'was', 'telling', 'Maja', 'about', 'that', 'place', 'downtown', 'and', 'honestly', 'the', 'cold', 'brew', 'there', 'is', 'so', 'good', 'we', 'should', 'go', 'after', 'the', 'gym', 'tomorrow', 'right', 'yeah', 'she', 'said', 'it', 'gets', 'crazy', 'busy', 'but', "it's", 'worth', 'it', 'every', 'single', 'time', 'no', 'kidding', 'plus', 'they', 'do', 'oat', 'foam', 'now', 'which', 'is', 'kind', 'of', 'amazing'];

const fmtC = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return (r % 1 ? r.toFixed(1) : String(r)) + '¢';
};
const fmtD = (cents: number) => '$' + (cents / 100).toFixed(2);

type Word = { t: string; brand: boolean; id: number };
type Tab = 'record' | 'brands' | 'ranks' | 'wallet' | 'you';

const SIM_PACE_MS = 3000;
const SLIDE_X = 319; // 680 * sin(28°)
const SLIDE_Y = 600; // 680 * cos(28°)
const BIRD_ANGLE = '35deg';

// ── word that fades in (blue → fg/teal) ─────────────────────────────────────
function WordSpan({ w, fg }: { w: Word; fg: string }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [a]);
  const color = a.interpolate({ inputRange: [0, 1], outputRange: [BLUE, w.brand ? TEAL : fg] });
  return (
    <Animated.Text
      style={{ opacity: a, color, fontFamily: w.brand ? F.xb : F.m, fontSize: 16, lineHeight: 26, marginRight: 6 }}
    >
      {w.t}
    </Animated.Text>
  );
}

export default function MagpieApp() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>('record');
  const [detail, setDetail] = useState<string | null>(null);
  const [themeName, setThemeName] = useState<'dark' | 'light'>('dark');
  const t = themeName === 'dark' ? DARK : LIGHT;
  const dark = themeName === 'dark';

  const [recording, setRecording] = useState(false);
  const [selected, setSelected] = useState<string[]>(['nordbrew', 'loop', 'kilter']);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [cents, setCents] = useState(0);
  const [instant, setInstant] = useState(0);
  const [pool, setPool] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [lines, setLines] = useState<[Word[], Word[], Word[]]>([[], [], []]);

  const wid = useRef(0);
  const fi = useRef(0);
  const hitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const selRef = useRef(selected);
  selRef.current = selected;

  // ── animations ────────────────────────────────────────────────────────────
  const dock = useRef(new Animated.Value(1)).current; // 1 = record-center, 0 = docked in nav
  const recAnim = useRef(new Animated.Value(0)).current; // 0 idle, 1 recording (rings/glow/icon)
  const spin = useRef(new Animated.Value(0)).current;
  const spin2 = useRef(new Animated.Value(0)).current;
  const spin3 = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const birdX = useRef(new Animated.Value(-SLIDE_X)).current;
  const birdY = useRef(new Animated.Value(-SLIDE_Y)).current;
  const birdOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = (v: Animated.Value, ms: number, reverse = false) =>
      Animated.loop(
        Animated.timing(v, { toValue: reverse ? -1 : 1, duration: ms, easing: Easing.linear, useNativeDriver: true }),
      );
    const l1 = loop(spin, 7500);
    const l2 = loop(spin2, 11000, true);
    const l3 = loop(spin3, 9200);
    const lb = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 2300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 2300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    l1.start(); l2.start(); l3.start(); lb.start();
    return () => { l1.stop(); l2.stop(); l3.stop(); lb.stop(); };
  }, [spin, spin2, spin3, bob]);

  useEffect(() => {
    Animated.timing(dock, { toValue: tab === 'record' ? 1 : 0, duration: 780, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [tab, dock]);

  // ── demo engine ─────────────────────────────────────────────────────────
  const pushWord = useCallback((text: string, brand: boolean) => {
    const w: Word = { t: text, brand, id: ++wid.current };
    setLines(([l0, l1, l2]) => {
      const len = l2.reduce((acc, x) => acc + x.t.length + 1, 0);
      if (len + text.length > 30) return [l1, l2, [w]];
      return [l0, l1, [...l2, w]];
    });
  }, []);

  const hit = useCallback(() => {
    const sel = selRef.current;
    if (!sel.length) return;
    const id = sel[Math.floor(Math.random() * sel.length)];
    const c = COMPANY(id);
    setCounts((p) => ({ ...p, [id]: (p[id] || 0) + 1 }));
    setCents((p) => p + c.rate);
    if (c.model === 'say') setInstant((p) => p + c.rate);
    else setPool((p) => p + c.rate);
    setFlash(id);
    pushWord(c.name, true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 900);
  }, [pushWord]);

  const schedule = useCallback(() => {
    if (hitTimer.current) clearTimeout(hitTimer.current);
    hitTimer.current = setTimeout(() => {
      hit();
      schedule();
    }, SIM_PACE_MS * (0.55 + Math.random()));
  }, [hit]);

  const stopEngine = useCallback(() => {
    if (hitTimer.current) clearTimeout(hitTimer.current);
    if (wordTimer.current) clearInterval(wordTimer.current);
    hitTimer.current = null;
    wordTimer.current = null;
  }, []);

  const toggleRec = useCallback(() => {
    if (recording) {
      stopEngine();
      setRecording(false);
      Animated.timing(recAnim, { toValue: 0, duration: 700, useNativeDriver: false }).start();
      // fly out to bottom-right, then snap invisibly back to the top entry point
      Animated.parallel([
        Animated.timing(birdX, { toValue: SLIDE_X, duration: 1150, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(birdY, { toValue: SLIDE_Y, duration: 1150, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(birdOp, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) { birdX.setValue(-SLIDE_X); birdY.setValue(-SLIDE_Y); }
      });
    } else {
      setRecording(true);
      setCounts({}); setCents(0); setInstant(0); setPool(0); setLines([[], [], []]);
      Animated.timing(recAnim, { toValue: 1, duration: 700, useNativeDriver: false }).start();
      birdX.setValue(-SLIDE_X); birdY.setValue(-SLIDE_Y); birdOp.setValue(0);
      Animated.parallel([
        Animated.timing(birdX, { toValue: 0, duration: 1150, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(birdY, { toValue: 0, duration: 1150, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(birdOp, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]).start();
      schedule();
      if (wordTimer.current) clearInterval(wordTimer.current);
      wordTimer.current = setInterval(() => pushWord(FILLER[fi.current++ % FILLER.length], false), 380);
    }
  }, [recording, stopEngine, schedule, pushWord, recAnim, birdX, birdY, birdOp]);

  useEffect(() => () => { stopEngine(); if (flashTimer.current) clearTimeout(flashTimer.current); }, [stopEngine]);

  const onBigBtn = useCallback(() => {
    if (tab !== 'record') setTab('record');
    else toggleRec();
  }, [tab, toggleRec]);

  const toggleBrand = useCallback((id: string) => {
    setSelected((p) => {
      const has = p.includes(id);
      if (!has && p.length >= 3) return p;
      return has ? p.filter((x) => x !== id) : [...p, id];
    });
  }, []);

  // ── derived ────────────────────────────────────────────────────────────
  const sessionCount = Object.values(counts).reduce((a, b) => a + b, 0);
  const youCents = 482 + cents;
  const full = selected.length >= 3;

  // ── button geometry ────────────────────────────────────────────────────
  const recordCenterY = height * 0.4;
  const navH = 62;
  const navBottom = insets.bottom + 16;
  const dockedCenterY = height - navBottom - navH;
  const btnTop = dock.interpolate({ inputRange: [0, 1], outputRange: [dockedCenterY - 36, recordCenterY - 79] });
  const btnSize = dock.interpolate({ inputRange: [0, 1], outputRange: [72, 158] });
  const btnLeft = dock.interpolate({ inputRange: [0, 1], outputRange: [-36, -79] });
  const navGap = dock.interpolate({ inputRange: [0, 1], outputRange: [88, 0] });
  const labelOp = dock.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const iconRadius = recAnim.interpolate({ inputRange: [0, 1], outputRange: [15, 8] });

  const rot = (v: Animated.Value) => v.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-360deg', '0deg', '360deg'] });
  const ringScale = recAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const bobY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });

  const contentPad = navBottom + navH + 24;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <View style={{ flex: 1 }}>
        {tab === 'record' && (
          <RecordTab t={t} recording={recording} counts={counts} cents={cents} flash={flash}
            selected={selected} lines={lines} sessionCount={sessionCount} />
        )}
        {tab === 'brands' && detail == null && (
          <BrandsTab t={t} selected={selected} full={full} pad={contentPad} onOpen={setDetail} onToggle={toggleBrand} />
        )}
        {tab === 'brands' && detail != null && (
          <BrandDetail t={t} co={COMPANY(detail)} selected={selected} counts={counts} full={full}
            pad={contentPad} onBack={() => setDetail(null)} onToggle={toggleBrand} />
        )}
        {tab === 'ranks' && <RanksTab t={t} sessionCount={sessionCount} youCents={youCents} pad={contentPad} />}
        {tab === 'wallet' && <WalletTab t={t} instant={instant} pool={pool} pad={contentPad} />}
        {tab === 'you' && (
          <YouTab t={t} dark={dark} youCents={youCents} cents={cents} sessionCount={sessionCount}
            brandCount={selected.length} instant={instant} pool={pool} pad={contentPad}
            setDark={() => setThemeName('dark')} setLight={() => setThemeName('light')} />
        )}
      </View>

      {/* rings + bird overlay (record tab only) */}
      {tab === 'record' && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 5 }}>
          {/* glow */}
          <Animated.View style={{ position: 'absolute', left: '50%', top: recordCenterY, marginLeft: -170, marginTop: -170, width: 340, height: 340, borderRadius: 170, backgroundColor: 'rgba(74,174,224,0.10)', opacity: recAnim }} />
          {/* rings */}
          <Animated.View style={{ position: 'absolute', left: '50%', top: recordCenterY, marginLeft: -119, marginTop: -119, width: 238, height: 238, opacity: recAnim, transform: [{ scale: ringScale }] }}>
            <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: 238, height: 238, borderRadius: 110, borderWidth: 2, borderColor: 'rgba(74,174,224,0.6)', transform: [{ rotate: rot(spin) }] }} />
            <Animated.View style={{ position: 'absolute', left: 9, top: 9, width: 220, height: 220, borderRadius: 100, borderWidth: 2, borderColor: 'rgba(51,198,167,0.65)', transform: [{ rotate: rot(spin2) }] }} />
            <Animated.View style={{ position: 'absolute', left: 17, top: 17, width: 204, height: 204, borderRadius: 92, borderWidth: 2, borderColor: 'rgba(69,197,229,0.55)', transform: [{ rotate: rot(spin3) }] }} />
          </Animated.View>
          {/* bird (behind the button) */}
          <View style={{ position: 'absolute', left: '50%', top: recordCenterY, width: 0, height: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={{ opacity: birdOp, transform: [{ translateX: birdX }, { translateY: birdY }] }}>
              <Animated.View style={{ transform: [{ translateY: bobY }, { rotate: BIRD_ANGLE }] }}>
                <Image source={BIRD} style={{ width: 520, height: 520, marginLeft: -260, marginTop: -286 }} resizeMode="contain" />
              </Animated.View>
            </Animated.View>
          </View>
        </View>
      )}

      {/* the shared record button */}
      <Animated.View style={{ position: 'absolute', left: '50%', top: btnTop, width: btnSize, height: btnSize, marginLeft: btnLeft, zIndex: 30 }}>
        <Pressable onPress={onBigBtn} style={{ flex: 1 }}>
          <Animated.View style={{ flex: 1, borderRadius: 999, borderWidth: 1, borderColor: t.line, backgroundColor: t.btn, alignItems: 'center', justifyContent: 'center', gap: 8,
            shadowColor: '#1e5a78', shadowOpacity: 0.3, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
            <Animated.View style={{ width: 30, height: 30, borderRadius: iconRadius, backgroundColor: BLUE }} />
            <Animated.Text style={{ fontFamily: F.b, fontSize: 11, letterSpacing: 0.5, color: t.sub, opacity: labelOp }}>
              {recording ? 'tap to stop' : 'tap to record'}
            </Animated.Text>
          </Animated.View>
        </Pressable>
      </Animated.View>

      {/* bottom nav */}
      <View style={{ marginHorizontal: 18, marginBottom: navBottom, height: navH, borderRadius: 22, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-evenly' }}>
          <NavItem label="Brands" active={tab === 'brands'} sub={t.sub} onPress={() => { setTab('brands'); setDetail(null); }} icon="brands" />
          <NavItem label="Ranks" active={tab === 'ranks'} sub={t.sub} onPress={() => setTab('ranks')} icon="ranks" />
        </View>
        <Animated.View style={{ width: navGap }} />
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-evenly' }}>
          <NavItem label="Wallet" active={tab === 'wallet'} sub={t.sub} onPress={() => setTab('wallet')} icon="wallet" />
          <NavItem label="You" active={tab === 'you'} sub={t.sub} onPress={() => setTab('you')} icon="you" />
        </View>
      </View>
    </View>
  );
}

// ── nav item with geometric icons ──────────────────────────────────────────
function NavItem({ label, active, sub, onPress, icon }: { label: string; active: boolean; sub: string; onPress: () => void; icon: string }) {
  const c = active ? TEAL : sub;
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 4, minWidth: 44 }}>
      <View style={{ width: 17, height: 17, alignItems: 'center', justifyContent: 'center' }}>
        {icon === 'brands' && <View style={{ width: 17, height: 17, borderRadius: 6, borderWidth: 2.5, borderColor: c }} />}
        {icon === 'ranks' && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 15 }}>
            <View style={{ width: 4, height: 8, backgroundColor: c, borderRadius: 2 }} />
            <View style={{ width: 4, height: 14, backgroundColor: c, borderRadius: 2 }} />
            <View style={{ width: 4, height: 5, backgroundColor: c, borderRadius: 2 }} />
          </View>
        )}
        {icon === 'wallet' && (
          <View style={{ width: 17, height: 13, borderRadius: 5, borderWidth: 2.5, borderColor: c, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 2 }}>
            <View style={{ width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: c }} />
          </View>
        )}
        {icon === 'you' && (
          <View style={{ alignItems: 'center', gap: 1.5 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, borderWidth: 2.5, borderColor: c }} />
            <View style={{ width: 13, height: 6, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderWidth: 2.5, borderBottomWidth: 0, borderColor: c }} />
          </View>
        )}
      </View>
      <Text style={{ fontFamily: F.sb, fontSize: 11, color: c, letterSpacing: 0.4 }}>{label}</Text>
    </Pressable>
  );
}

// ── record tab ──────────────────────────────────────────────────────────
function RecordTab({ t, recording, counts, cents, flash, selected, lines, sessionCount }: {
  t: Theme; recording: boolean; counts: Record<string, number>; cents: number; flash: string | null;
  selected: string[]; lines: [Word[], Word[], Word[]]; sessionCount: number;
}) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 26, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <Image source={ICON} style={{ width: 26, height: 26 }} resizeMode="contain" />
          <Text style={{ fontFamily: F.xb, fontSize: 17, letterSpacing: 0.3, color: t.sub }}>magpie</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: recording ? TEAL : t.sub }} />
          <Text style={{ fontFamily: F.sb, fontSize: 13, color: recording ? TEAL : t.sub }}>{recording ? 'listening' : 'ready'}</Text>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      {/* transcript strip */}
      <View style={{ height: 82, marginHorizontal: 26, marginBottom: 12, overflow: 'hidden', justifyContent: 'flex-end' }}>
        {lines.map((line, i) => (
          <View key={i} style={{ flexDirection: 'row', height: 26, overflow: 'hidden' }}>
            {line.map((w) => <WordSpan key={w.id} w={w} fg={t.fg} />)}
          </View>
        ))}
      </View>

      {/* mention counts */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 10 }}>
        {selected.map((id) => {
          const c = COMPANY(id);
          const n = counts[id] || 0;
          return (
            <View key={id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 16, borderRadius: 14, backgroundColor: flash === id ? 'rgba(74,174,224,0.16)' : 'transparent' }}>
              <Text style={{ fontFamily: F.m, fontSize: 15, color: t.fg }}>{c.name}</Text>
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'baseline' }}>
                <Text style={{ fontFamily: F.m, fontSize: 13.5, color: t.sub }}>× {n}</Text>
                <Text style={{ fontFamily: F.sb, fontSize: 14, color: TEAL, minWidth: 44, textAlign: 'right' }}>{n ? '+' + fmtC(n * c.rate) : '—'}</Text>
              </View>
            </View>
          );
        })}
        <View style={{ marginTop: 6, paddingTop: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: t.line, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: F.m, fontSize: 13, color: t.sub }}>Session</Text>
          <Text style={{ fontFamily: F.sb, fontSize: 13, color: t.fg }}>
            {sessionCount ? `${sessionCount} ${sessionCount === 1 ? 'mention' : 'mentions'} · ${fmtC(cents)}` : 'no mentions yet'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── letter tile ────────────────────────────────────────────────────────────
function Tile({ c, size, radius, font }: { c: Company; size: number; radius: number; font: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: c.grad, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.b, fontSize: font, color: c.ink }}>{c.letter}</Text>
    </View>
  );
}

// ── brands roster ──────────────────────────────────────────────────────────
function BrandsTab({ t, selected, full, pad, onOpen, onToggle }: {
  t: Theme; selected: string[]; full: boolean; pad: number;
  onOpen: (id: string) => void; onToggle: (id: string) => void;
}) {
  const slotOn = [BLUE, TEAL, CYAN];
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 12 }}>
        <Text style={{ fontFamily: F.sb, fontSize: 26, color: t.fg }}>Your roster</Text>
        <Text style={{ marginTop: 5, fontFamily: F.m, fontSize: 13.5, color: t.sub }}>Pick up to 3 brands to work into conversation.</Text>
        <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[0, 1, 2].map((i) => <View key={i} style={{ width: 34, height: 6, borderRadius: 3, backgroundColor: selected[i] ? slotOn[i] : t.chip }} />)}
          </View>
          <Text style={{ fontFamily: F.m, fontSize: 12, color: t.sub }}>{selected.length} of 3 selected</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 18, paddingBottom: pad, gap: 12 }}>
        {COMPANIES.map((c) => {
          const sel = selected.includes(c.id);
          return (
            <Pressable key={c.id} onPress={() => onOpen(c.id)} style={{ padding: 16, borderRadius: 20, backgroundColor: t.card, borderWidth: 1.5, borderColor: sel ? 'rgba(74,174,224,0.65)' : t.line }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
                <Tile c={c} size={46} radius={14} font={18} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sb, fontSize: 16.5, color: t.fg }}>{c.name}</Text>
                  <Text style={{ fontFamily: F.m, fontSize: 12.5, color: t.sub }}>{c.tag} · Say {c.say}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', marginRight: 4 }}>
                  <Text style={{ fontFamily: F.sb, fontSize: 14.5, color: TEAL }}>{c.payLabel}</Text>
                  <Text style={{ fontFamily: F.b, fontSize: 10.5, color: t.sub, letterSpacing: 0.3 }}>{c.paySub}</Text>
                </View>
                <Pressable onPress={() => onToggle(c.id)} hitSlop={6} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 99,
                  borderWidth: 1, borderColor: sel ? 'transparent' : t.line,
                  backgroundColor: sel ? 'rgba(51,198,167,0.25)' : 'transparent', opacity: !sel && full ? 0.4 : 1 }}>
                  <Text style={{ fontFamily: F.sb, fontSize: 12.5, color: t.fg }}>{sel ? 'Drop' : 'Add'}</Text>
                </Pressable>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── brand detail ───────────────────────────────────────────────────────────
function BrandDetail({ t, co, selected, counts, full, pad, onBack, onToggle }: {
  t: Theme; co: Company; selected: string[]; counts: Record<string, number>; full: boolean; pad: number;
  onBack: () => void; onToggle: (id: string) => void;
}) {
  const sel = selected.includes(co.id);
  const n = counts[co.id] || 0;
  const payBig = co.model === 'say' ? `${co.payLabel} / say` : `≈${co.rate}¢ / say`;
  const bigLabel = sel ? 'Drop from roster' : full ? 'Roster full — drop one first' : 'Add to roster';
  const stat = (val: string, label: string, teal?: boolean) => (
    <View style={{ flex: 1, padding: 13, borderRadius: 16, backgroundColor: t.card, alignItems: 'center' }}>
      <Text style={{ fontFamily: F.sb, fontSize: 19, color: teal ? TEAL : t.fg }}>{val}</Text>
      <Text style={{ marginTop: 3, fontFamily: F.b, fontSize: 10.5, color: t.sub, letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: pad }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 12 }}>
        <Pressable onPress={onBack} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Text style={{ fontFamily: F.sb, fontSize: 16, color: t.sub }}>←</Text>
          <Text style={{ fontFamily: F.m, fontSize: 13, color: t.sub }}>Roster</Text>
        </Pressable>
      </View>
      <View style={{ paddingHorizontal: 24, paddingTop: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Tile c={co} size={64} radius={18} font={26} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.sb, fontSize: 24, color: t.fg }}>{co.name}</Text>
          <Text style={{ marginTop: 2, fontFamily: F.m, fontSize: 13, color: t.sub }}>{co.tag} · Say {co.say}</Text>
        </View>
      </View>
      <View style={{ margin: 24, marginTop: 18, marginBottom: 0, padding: 18, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ fontFamily: F.sb, fontSize: 13, color: t.fg }}>Payout</Text>
          <Text style={{ fontFamily: F.sb, fontSize: 18, color: TEAL }}>{payBig}</Text>
        </View>
        <Text style={{ marginTop: 8, fontFamily: F.m, fontSize: 12.5, lineHeight: 20, color: t.sub }}>{co.payNote}</Text>
      </View>
      <View style={{ marginHorizontal: 24, marginTop: 12, flexDirection: 'row', gap: 10 }}>
        {stat(String(n), 'Your says')}
        {stat(n ? '+' + fmtC(n * co.rate) : '—', 'You earned', true)}
        {stat(co.collectors, 'Collectors')}
      </View>
      <View style={{ margin: 24, marginTop: 12, marginBottom: 0, padding: 18, borderRadius: 20, backgroundColor: t.card }}>
        <Text style={{ fontFamily: F.sb, fontSize: 13, color: t.fg, marginBottom: 8 }}>About</Text>
        <Text style={{ fontFamily: F.m, fontSize: 13, lineHeight: 21, color: t.sub }}>{co.desc}</Text>
        <View style={{ marginTop: 12, flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {[`Say ${co.say}`, co.model === 'say' ? 'Instant payout' : 'Pool share', `${co.weekMentions} says this week`].map((chip) => (
            <View key={chip} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 99, backgroundColor: t.chip }}>
              <Text style={{ fontFamily: F.m, fontSize: 12, color: t.fg }}>{chip}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ margin: 24, marginTop: 16 }}>
        <Pressable onPress={() => onToggle(co.id)} style={{ paddingVertical: 15, borderRadius: 16, alignItems: 'center',
          borderWidth: sel ? 1 : 0, borderColor: t.line, backgroundColor: sel ? 'transparent' : full ? t.card : BLUE, opacity: !sel && full ? 0.6 : 1 }}>
          <Text style={{ fontFamily: F.sb, fontSize: 14.5, color: sel ? t.fg : full ? t.sub : '#06131c' }}>{bigLabel}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ── ranks ──────────────────────────────────────────────────────────────────
function RanksTab({ t, sessionCount, youCents, pad }: { t: Theme; sessionCount: number; youCents: number; pad: number }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 12 }}>
        <Text style={{ fontFamily: F.sb, fontSize: 26, color: t.fg }}>Leaderboard</Text>
        <Text style={{ marginTop: 5, fontFamily: F.m, fontSize: 13.5, color: t.sub }}>This week · resets Sunday</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 18, paddingBottom: pad, gap: 9 }}>
        {BOARD.map((p) => {
          const c = p.you ? youCents : p.cents;
          const says = p.says + (p.you ? sessionCount : 0);
          return (
            <View key={p.rank} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, paddingHorizontal: 15, borderRadius: 15,
              backgroundColor: p.you ? 'rgba(74,174,224,0.15)' : t.card, borderWidth: p.you ? 1.5 : 0, borderColor: 'rgba(74,174,224,0.6)' }}>
              <Text style={{ width: 24, fontFamily: F.sb, fontSize: 13.5, color: p.rank <= 3 ? GOLD : t.sub }}>{p.rank}</Text>
              <View style={{ width: 35, height: 35, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: p.you ? BLUE : t.chip }}>
                <Text style={{ fontFamily: F.sb, fontSize: 12.5, color: p.you ? '#06131c' : t.fg }}>{p.initials}</Text>
              </View>
              <Text style={{ flex: 1, fontFamily: p.you ? F.sb : F.m, fontSize: 14.5, color: t.fg }}>{p.name}</Text>
              <Text style={{ fontFamily: F.m, fontSize: 12.5, color: t.sub }}>{says} says</Text>
              <Text style={{ fontFamily: F.sb, fontSize: 14.5, color: TEAL, minWidth: 52, textAlign: 'right' }}>{fmtD(c)}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── wallet ──────────────────────────────────────────────────────────────────
function WalletTab({ t, instant, pool, pad }: { t: Theme; instant: number; pool: number; pad: number }) {
  const rows: [string, string, string, boolean][] = [
    ['Nordbrew · instant', 'Today', '+' + fmtC(instant || 0), true],
    ['June pool payout', 'Jul 1 · Loop + Kilter', '+$1.86', true],
    ['Cash out', 'Jun 28 · Vipps', '−$3.00', false],
    ['Voltway · weekend ×2', 'Jun 27', '+$0.64', true],
  ];
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: pad }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 12 }}>
        <Text style={{ fontFamily: F.sb, fontSize: 26, color: t.fg }}>Wallet</Text>
        <Text style={{ marginTop: 5, fontFamily: F.m, fontSize: 13.5, color: t.sub }}>Every slice you&apos;ve collected.</Text>
      </View>
      <View style={{ margin: 24, marginTop: 18, marginBottom: 0, padding: 22, borderRadius: 22, backgroundColor: t.card, borderWidth: 1, borderColor: t.line }}>
        <Text style={{ fontFamily: F.b, fontSize: 12, color: t.sub, letterSpacing: 0.3 }}>Available now</Text>
        <Text style={{ marginTop: 6, fontFamily: F.sb, fontSize: 40, color: BLUE2 }}>{fmtD(210 + instant)}</Text>
        <Text style={{ marginTop: 4, fontFamily: F.m, fontSize: 13, color: t.sub }}>{fmtD(272 + pool)} pending in monthly pools</Text>
        <Pressable style={{ marginTop: 16, paddingVertical: 14, borderRadius: 14, backgroundColor: BLUE, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.sb, fontSize: 14, color: '#06131c' }}>Cash out to Vipps ···· 82</Text>
        </Pressable>
      </View>
      <View style={{ marginHorizontal: 24, marginTop: 14, paddingHorizontal: 18, borderRadius: 20, backgroundColor: t.card }}>
        {rows.map(([title, sub, amt, teal], i) => (
          <View key={title} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: t.line }}>
            <View>
              <Text style={{ fontFamily: F.m, fontSize: 14, color: t.fg }}>{title}</Text>
              <Text style={{ marginTop: 2, fontFamily: F.m, fontSize: 11.5, color: t.sub }}>{sub}</Text>
            </View>
            <Text style={{ fontFamily: F.sb, fontSize: 14, color: teal ? TEAL : t.fg }}>{amt}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ── you / profile ──────────────────────────────────────────────────────────
function YouTab({ t, dark, youCents, cents, sessionCount, brandCount, instant, pool, pad, setDark, setLight }: {
  t: Theme; dark: boolean; youCents: number; cents: number; sessionCount: number; brandCount: number;
  instant: number; pool: number; pad: number; setDark: () => void; setLight: () => void;
}) {
  const stat = (val: string, label: string) => (
    <View style={{ flex: 1, padding: 14, borderRadius: 16, backgroundColor: t.card, alignItems: 'center' }}>
      <Text style={{ fontFamily: F.sb, fontSize: 21, color: t.fg }}>{val}</Text>
      <Text style={{ marginTop: 3, fontFamily: F.b, fontSize: 10.5, color: t.sub, letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
  const seg = (label: string, on: boolean, onPress: () => void) => (
    <Pressable onPress={onPress} style={{ paddingVertical: 7, paddingHorizontal: 16, borderRadius: 99, backgroundColor: on ? BLUE : 'transparent' }}>
      <Text style={{ fontFamily: F.sb, fontSize: 12.5, color: on ? '#06131c' : t.sub }}>{label}</Text>
    </Pressable>
  );
  const row = (label: string, val: string, top: boolean) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderTopWidth: top ? 1 : 0, borderTopColor: t.line }}>
      <Text style={{ fontFamily: F.m, fontSize: 13.5, color: t.sub }}>{label}</Text>
      <Text style={{ fontFamily: F.sb, fontSize: 13.5, color: t.fg }}>{val}</Text>
    </View>
  );
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: pad }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.b, fontSize: 17, color: '#06131c' }}>MV</Text>
        </View>
        <View>
          <Text style={{ fontFamily: F.sb, fontSize: 20, color: t.fg }}>Mari V.</Text>
          <Text style={{ fontFamily: F.m, fontSize: 12.5, color: t.sub }}>Collecting since March</Text>
        </View>
      </View>
      <View style={{ margin: 24, marginTop: 20, marginBottom: 0, padding: 22, borderRadius: 22, backgroundColor: t.card, borderWidth: 1, borderColor: t.line }}>
        <Text style={{ fontFamily: F.b, fontSize: 12, color: t.sub, letterSpacing: 0.3 }}>Total earned</Text>
        <Text style={{ marginTop: 6, fontFamily: F.sb, fontSize: 44, color: BLUE2 }}>{fmtD(youCents)}</Text>
        <Text style={{ marginTop: 4, fontFamily: F.m, fontSize: 13, color: TEAL }}>{cents ? '+' + fmtC(cents) + ' today' : 'nothing yet today — go talk'}</Text>
      </View>
      <View style={{ marginHorizontal: 24, marginTop: 14, flexDirection: 'row', gap: 10 }}>
        {stat(String(203 + sessionCount), 'Mentions')}
        {stat(String(brandCount), 'Brands')}
        {stat('#12', 'Rank')}
      </View>
      <View style={{ margin: 24, marginTop: 14, marginBottom: 0, padding: 18, borderRadius: 20, backgroundColor: t.card }}>
        <Text style={{ fontFamily: F.sb, fontSize: 13, color: t.fg, marginBottom: 12 }}>Earnings by model</Text>
        {row('Instant · per say', fmtD(210 + instant), false)}
        {row('Monthly pools', fmtD(272 + pool), true)}
        {row('Payout', 'Vipps ···· 82', true)}
      </View>
      <View style={{ margin: 24, marginTop: 14, padding: 18, borderRadius: 20, backgroundColor: t.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: F.sb, fontSize: 13, color: t.fg }}>Appearance</Text>
        <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 99, backgroundColor: t.chip }}>
          {seg('Dark', dark, setDark)}
          {seg('Light', !dark, setLight)}
        </View>
      </View>
    </ScrollView>
  );
}
