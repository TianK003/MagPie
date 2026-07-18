All research is complete. Here is the mobile app architecture design.

---

# Magpie — Mobile App Architecture (Implementation-Ready Design)

Scope: the Expo app only. Backend contracts are referenced as named edge functions (`stt-token`, `diarize`, `verify-mention`, `session-start`, `session-end`, `stt-chunk`, `redact` is server-internal) — their schemas are owned by the backend slice; the shapes assumed here are stated explicitly so the two slices can be reconciled.

---

## 1. Repo & app structure

### 1.1 Expo Router route tree

Expo Router (SDK 57, New Architecture). Auth = email OTP; onboarding completion is server-truth on `profiles` (`consent_at`, `payout_method`, `onboarded_at`).

```
app/
  _layout.tsx              # Root: font loading (SplashScreen gate), SafeAreaProvider,
                           # GestureHandlerRootView, supabase auth listener, route guard,
                           # <ToastHost/> rendered as a SIBLING AFTER <Stack> (see §4 Toasts)
  index.tsx                # Landing / first-run. Redirect logic:
                           #   session + onboarded  -> /(tabs)
                           #   session + !onboarded -> /(onboarding)/consent
                           #   no session           -> render Landing
  (auth)/
    _layout.tsx            # Stack, headerShown:false
    login.tsx              # email input -> signInWithOtp
    verify.tsx             # 6-digit OtpInput -> verifyOtp
  (onboarding)/
    _layout.tsx            # Stack, headerShown:false, gestureEnabled:false (forward-only)
    consent.tsx            # step 1 "The honest part"
    brands.tsx             # step 2 "Pick your brands"
    payout.tsx             # step 3 "Where's the money going?"
  (tabs)/
    _layout.tsx            # <Tabs tabBar={props => <TabBar {...props}/>}> (custom, incl. RecFab)
    index.tsx              # Home ("the nest")
    brands.tsx             # Campaigns
    rank.tsx               # Rank
    wallet.tsx             # Wallet
  session.tsx              # Recording overlay. presentation:'card', animation:'slide_from_bottom',
                           # gestureEnabled:false  (NOT native 'modal' — keeps ToastHost on top; see §4)
  summary.tsx              # presentation:'transparentModal', animation:'none' — the Sheet component
                           # animates itself (translateY 40->0 + fade, 300ms) over 45% ink scrim,
                           # tabs visible + already updated underneath
  settings.tsx             # presentation:'card' pushed from Home header "settings"
  invite/[code].tsx        # deep link magpie://invite/CODE — stores code, redeems post-auth
```

Route-guard rules live only in `app/_layout.tsx` + `app/index.tsx` (one `useProtectedRoute`-style hook reading the auth slice). Session end does `router.replace('/summary?sessionId=…')` so the recording screen unmounts (audio fully torn down) before the sheet appears.

### 1.2 `src/` layout

```
src/
  components/
    Screen.tsx           # SafeArea wrapper: top inset + horizontal px-screen (20)
    Wordmark.tsx         # "magpie." 21px/700, blue period
    Button.tsx           # dark / outlined / disabled variants, min-h 52
    NestCard.tsx  StatTile.tsx  CampaignCard.tsx  ReceiptRow.tsx
    TabBar.tsx  RecFab.tsx  Toast.tsx (+ToastHost)  Sheet.tsx
    Waveform.tsx         # N bars, Reanimated scaleY loop (§2)
    CoinPop.tsx          # "+N¢" rise+fade, imperatively re-triggered
    VoicePill.tsx  RecTimerPill.tsx  ProgressBar.tsx
    BrandRow.tsx         # onboarding step-2 row (distinct from CampaignCard)
    LeaderboardRow.tsx  StreakCard.tsx  BadgePill.tsx  InviteBanner.tsx
    EmptyState.tsx       # dashed box, 12.5px muted centered
    OtpInput.tsx  ProgressDots.tsx
  lib/
    supabase.ts          # client + polyfills (§1.4)
    stt.ts               # SttStream interface + factory (§3)
    stt/elevenlabs.ts  stt/openai.ts  stt/chunked.ts  stt/scripted.ts
    audio.ts             # AudioCapture interface + @siteed/audio-studio impl + scripted fake
    keywords.ts          # KeywordSpotter (§3.5) — pure TS, zero RN imports
    session/machine.ts   # session state machine — pure TS, DI'd services (§3)
    session/ringBuffer.ts  session/wav.ts   # PCM ring buffer; WAV header writer
    api.ts               # typed supabase.functions.invoke wrappers for every edge fn
    realtime.ts          # private Broadcast channel subscribe (user topic), setAuth handling
    analytics.ts         # track(event, props) — no-op unless EXPO_PUBLIC_POSTHOG_KEY set
    money.ts             # fmtCents(538) -> "$5.38"; fmtSigned; "+5¢" pill fmt
    streak.ts            # pure streak math (device-tz day keys, chips derivation)
  stores/
    index.ts             # ONE zustand store composed from slice creators (CLAUDE.md: single store, sliced)
    auth.ts brands.ts session.ts wallet.ts social.ts ui.ts
  hooks/                 # useToast, useSessionMachine, useRefreshOnFocus
  theme/tokens.ts        # raw token constants for Reanimated/StyleSheet-only components
  types/db.ts            # supabase gen types; types/domain.ts
```

### 1.3 lib interfaces (exact)

```ts
// lib/stt.ts
export interface SttStream {
  start(): Promise<void>;
  sendPcmBase64(chunk: string, sampleRate: number): void; // both providers take base64 JSON frames
  onPartial(cb: (text: string) => void): void;
  onFinal(cb: (text: string, tsMs: number) => void): void;
  onStateChange(cb: (s: 'connecting'|'open'|'reconnecting'|'closed'|'failed') => void): void;
  close(): Promise<void>;
}
export function createSttStream(tok: SttTokenResponse): SttStream; // provider chosen by server

// lib/audio.ts
export interface AudioCapture {
  requestPermission(): Promise<boolean>;
  start(cfg: { sampleRate: 16000; interval: 250 },
        onChunk: (base64Pcm: string) => void): Promise<void>;
  stop(): Promise<void>;
}

// lib/api.ts — assumed edge-fn contracts (reconcile with backend slice)
sttToken(): Promise<{ provider:'elevenlabs'|'openai'; token:string; wsUrl:string; expiresAt:string }>
sessionStart(): Promise<{ sessionId: string }>
diarizeUrl(sessionId, auditN): Promise<{ path:string; token:string }>   // signed upload
diarize(sessionId, path): Promise<{ speakers:number; voiceConfirmed:boolean }>
verifyMention(req: { sessionId; campaignId; clientMentionId; snippet; hitAtMs }):
  Promise<{ mentionId; status:'paid'|'flagged'; amountCents:number; reason?:string }>
sttChunk(sessionId, base64Wav): Promise<{ text:string }>                // degraded mode
sessionEnd(sessionId): Promise<SummaryPayload>  // { earnedCents, paidMentions, pendingMentions,
                                                //   durationMin, streak, streakSafe, bonusActive }
```

Key simplification (from the research): both ElevenLabs Realtime (`input_audio_chunk` / `audio_base_64`) and OpenAI Realtime (`input_audio_buffer.append`) accept **base64 audio inside JSON text frames**, and `@siteed/audio-studio` emits **base64 PCM chunks**. The hot path is pass-through — no base64 decode, no binary WS frames. The briefing's binary-frame notes apply only if a provider changes; keep `binaryType='arraybuffer'` set anyway.

`lib/supabase.ts`: `createClient` with AsyncStorage storage, `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: false`, publishable key; `AppState` listener calling `startAutoRefresh`/`stopAutoRefresh`. Top-of-file polyfills in fixed order: `react-native-url-polyfill/auto`, `structuredClone` polyfill; Metro `resolver.unstable_conditionNames`/shims for `ws`/`stream` per the exact supabase-js version at install time (briefing: version-sensitive — verify then).

### 1.4 Zustand slices — contents, and server-truth vs client-cache

Single store, slice-creator pattern (`create<Store>()((...a) => ({ ...authSlice(...a), ... }))`).

| Slice | Holds | Truth |
|---|---|---|
| `auth` | supabase session mirror, `profile` (displayName, streak, bestStreak, level, consentAt, payoutMethod, onboardedAt), `status: 'loading'\|'signedOut'\|'needsOnboarding'\|'ready'` | **Server** (profiles row); client caches, refetch on focus/foreground |
| `brands` | `campaigns[]` (id, name, category, rateCents, capPerDay, multiplier, minLevel, keywords[], locked-derived), `optedIn: Set<id>` | **Server**; opt-in toggle is optimistic w/ rollback + toast on failure |
| `session` | live-only: machine state tag, `secs`, `voiceState`, `transport: 'ws'\|'degraded'`, `receipts[] {clientId, timeLabel, snippet, amountCents, status:'pending'\|'paid'\|'flagged'}`, `sessEarnCents`, `mentionCount`, `summary?` | **Client-origin ephemeral** during recording; becomes server-truth at `verify-mention` / `session-end`; wiped after summary closes |
| `wallet` | `balanceCents`, `weekEarnCents`, `ledger[]` (from server view), `payoutPending` | **Server** (ledger SUM); never computed client-side except optimistic post-cashout render before refetch |
| `social` | `leaderboard[]` (weekly view rows), `dayChips` (derived via `streak.ts` from profile + today's sessions), `badges[]`, `inviteCode` | **Server**; leaderboard also updates via weekly Broadcast topic |
| `ui` | `toast?: {id, message}` (single instance), `degradedBanner: boolean` | Client only |

Rule: **anything money, streak, or leaderboard is rendered from server responses**; the only client-computed money is the optimistic pending amount on a fresh keyword hit, and it is reconciled to the server's `amountCents` on verify.

---

## 2. NativeWind token mapping

`tailwind.config.js`:

```js
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: '#24241c', paper: '#fdfdfb',
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
        hero: 42, money: 38, 'money-lg': 40, 'money-sm': 36,
        title: 24, 'title-lg': 28, body: 15, btn: 16,
        sec: 12.5, 'sec-lg': 13.5, mono: 11, 'mono-sm': 10, 'mono-xs': 9.5,
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
};
```

Notes for implementers:
- RN custom fonts don't synthesize weights — **each weight is its own fontFamily**, hence the six families. Load via `@expo-google-fonts/space-grotesk` + `@expo-google-fonts/ibm-plex-mono` with `useFonts` in root layout behind `SplashScreen.preventAutoHideAsync()`; additionally list the `.ttf`s in the `expo-font` config plugin so they're embedded natively.
- RN `letterSpacing` is px, not em — tokens above are precomputed for their typical sizes; fine to inline-adjust per component when size differs.
- `src/theme/tokens.ts` re-exports the same raw values as constants for StyleSheet/Reanimated components — no hex literal may appear outside these two files.

**Reanimated-StyleSheet-only components** (everything else is NativeWind classes):
1. `Waveform` — per-bar `useAnimatedStyle` scaleY, `withRepeat(withSequence(...))`, per-bar `withDelay(i * 130)`, cycle ~1050ms; landing variant (6 bars, 2 blue) and recording variant (7 bars, 46px) via props.
2. `CoinPop` — translateY 0→−36 + opacity fade over 1600ms; imperative `pop(amountCents)` ref API so rapid mentions re-trigger cleanly.
3. `Sheet` — translateY 40→0 + fade 300ms + scrim opacity.
4. `Toast` — slide-up+fade 250ms in, auto-dismiss 2400ms.
5. `ProgressBar` (wallet) — animated width 400ms (`withTiming` on a shared value = balance/500 clamped 0–1).

Static layout/colors on these five still use `className`; only the animated properties live in `useAnimatedStyle`.

---

## 3. Recording session pipeline — client state machine

`src/lib/session/machine.ts` is a **pure TypeScript reducer + effects object**, constructed with injected services `{ audio: AudioCapture, sttFactory, api, spotter, now, timers }`. The session screen consumes it via `useSessionMachine()` which bridges machine state → `session` slice. No RN imports in the machine → fully unit-testable.

### 3.1 States and transitions

```
idle
  PRESS_REC ──────────────► requestingPerms
requestingPerms
  PERMS_GRANTED ──────────► connecting        PERMS_DENIED ► error(perms)
connecting        (parallel: api.sessionStart() + api.sttToken() → stt.start();
                   audio.start() begins IMMEDIATELY, chunks queue in a bounded
                   5s pre-connect buffer so no speech is lost)
  STT_OPEN ───────────────► recording         TOKEN_FAIL×3 / STT_FAILED ► degraded entry? no →
                                              if never connected: go straight to recording w/ transport=degraded
recording   { voice: detecting → oneVoice → confirmed (sticky) }
            { transport: ws ⇄ reconnecting → degraded }
  PRESS_END / ANDROID_BACK ► ending
  FATAL_AUDIO_ERROR ──────► ending(error)
ending
  SESSION_SAVED ──────────► summary   (router.replace('/summary'))
summary
  CLOSE ──────────────────► idle (slice wiped)
```

### 3.2 `recording` behavior

Every 250ms `AUDIO_CHUNK(base64)`:
1. Append decoded bytes to the **ring buffer** (capacity 15s @ 16kHz mono 16-bit = 480KB — trivial memory).
2. `transport === 'ws'` → `stt.sendPcmBase64(chunk, 16000)` (pass-through). `reconnecting` → push to bounded send-queue (20s, drop-oldest). `degraded` → accumulate into 5s batches.

**Diarization audits** — first at t=8s, then every 30s:
`api.diarizeUrl(sessionId, n)` → wrap last 10–15s of ring buffer with a WAV header (`session/wav.ts`) → `uploadToSignedUrl` (base64-arraybuffer) → `api.diarize(sessionId, path)` → `DIARIZE_RESULT(speakers)`.
Voice pill: `detecting…` (no result yet) → `1 voice…` (speakers < 2) → `2 voices ✓` (speakers ≥ 2, **sticky for the session**; server also persists `sessions.voice_confirmed=true` inside the `diarize` fn — server is the paying authority, the client flag only gates UI/spotting). Audit failures (network) are silent; pill keeps last state; retry next tick.

**Mention accrual gate**: the KeywordSpotter runs from t=0 (it must build utterance state), but hits emitted **before `voiceConfirmed`** are dropped — no coin, no receipt, no server call. After confirmation, hits go through the full flow. A session that never confirms shows the receipts feed with only the dashed "listening…" row and pays nothing.

**Transcript buffer**: rolling in-memory array of `{textNormalized, textRaw, tMs}` committed segments (retain 60s) + the current partial. Never persisted, never sent except the ±10s snippet — this is the privacy promise; enforce with a lint-able rule: only `verifyMention()` may read it.

### 3.3 WS failure / degraded mode

- Liveness: if no server message for 10s while we're actively sending audio → treat as `STT_STALLED` (same path as `WS_CLOSE`).
- On close/error: `transport = 'reconnecting'`; ElevenLabs tokens are **single-use**, so each attempt re-mints via `stt-token`. Backoff 0.5s → 1s → 2s; **after 3 failed attempts within 60s → `transport = 'degraded'`** and show the mono banner line "connection is patchy — still counting" (new copy, in tone).
- Degraded: every 5s, wrap the batch as WAV → `api.sttChunk()` → response text enters the pipeline as a `FINAL` event (same spotter, same receipts — near-real-time). Every 60s attempt one WS upgrade in background; on success drain and return to `ws`.
- If the server told us `provider:'openai'` (ElevenLabs down/plan issue), the same `SttStream` interface applies; OpenAI expects 24kHz by default — the client keeps capturing 16k and the OpenAI impl declares `input_audio_format` for pcm16 @ 16k if accepted, else does linear resampling 16k→24k in the impl (isolated there; verify at build time per briefing).

### 3.4 `ending`

1. `audio.stop()`; `stt.close()` (send final commit).
2. **Final diarize**: only if `!voiceConfirmed && elapsed ≥ 15s` — one last audit so a slow-confirm session isn't unfairly zeroed. If already confirmed, skip.
3. Wait ≤5s for in-flight `verify-mention` promises; unresolved receipts stay `pending` (they flip later via the user's private Broadcast topic, which `realtime.ts` keeps subscribed app-wide).
4. `api.sessionEnd(sessionId)` → server finalizes mention_count/earnings/streak → `SummaryPayload`.
5. Refresh wallet + social slices (single refetch), then `SESSION_SAVED` → `router.replace('/summary')`.

Errors: perms denied → toast "magpie needs the mic to hear mentions" + error state with a settings deep-link button. `sessionEnd` network failure → retry ×3, then show summary from client data flagged "syncing…" and reconcile on next app focus.

### 3.5 Keyword spotter (`lib/keywords.ts`)

**Inputs**: opted-in campaigns, each with `keywords: string[]` from the campaigns row (brand name + server-curated variants, e.g. `["voltz", "voltz energy"]`).

**Normalization** (applied to both terms at compile-time and transcript at match-time): lowercase → Unicode NFKD, strip combining marks → punctuation→space → collapse whitespace → tokenize. Matching is **token-sequence based and word-boundary anchored by construction** — no substring matches inside longer words, ever.

**Token match rule** (per token of a multi-token term, in order):
1. Strip a trailing `'s` / `s` / `es` from the transcript token if that yields the term token (plural/possessive).
2. Exact match → hit.
3. If term-token length ≥ 5: Damerau-Levenshtein distance ≤ 1 → hit. Length ≤ 4: exact only (protects "crisp"-class short tokens from false fuzz).

A k-token term matches at transcript position i iff tokens i..i+k−1 each pass. Precompile per campaign into `{campaignId, termId, tokens[]}`.

**Partial-rewrite dedupe** (partials mutate as the recognizer revises):
- The spotter keeps per-utterance state; an *utterance* = the text since the last `FINAL`.
- On each `PARTIAL`: count occurrences `n` of each term in the normalized utterance; if `n > firedCount[termId]`, emit `(n − firedCount)` hits and set `firedCount = n`. A revision that reorders words but keeps one occurrence fires nothing new.
- On `FINAL`: reconcile against the committed text (occurrences there are authoritative; never *retract* an already-fired UI hit — the server verify is the corrector), then reset per-utterance counters.

**Dedupe window** (one utterance ≠ multiple hits): after any hit for a campaign, suppress further hits for that campaign for **8s** ("…so I tried Voltz — yeah Voltz Energy" = one hit). This is client UX only; the server's 60s cooldown + caps remain the paying authority.

**Hit → UI → server flow**:
```
KEYWORD_HIT(campaign, tMs)
  ├─ instant (same frame):
  │    receipt prepended {clientId: uuid, status:'pending', amountCents: optimisticAmount}
  │    CoinPop.pop(amount)   live counter += amount   mentionCount++
  │    optimisticAmount = rate × (weekend&&multiplier ? multiplier : 1) × (streak≥3 ? 1.05 : 1), floored to int cents
  └─ async:
       wait ≤3s for the covering FINAL segment (better snippet), else use partial
       snippet = transcript text within ±10s of tMs   (redaction is SERVER-side in verify-mention)
       api.verifyMention({sessionId, campaignId, clientMentionId, snippet, hitAtMs})
         → paid:    receipt.status='paid'; counter adjusted by (server amount − optimistic)
         → flagged: receipt.status='flagged'; counter −= optimistic; row renders
                    grey with mono "flagged, not paid" (caps/cooldown/unnatural all land here)
       Broadcast on the user topic is the fallback flip path if the HTTP response is lost.
```

`analytics.track('mention_paid')` fires on the *paid* flip, not on the optimistic hit.

---

## 4. Screen-by-screen native adaptation notes

Only deltas from the spec — all copy, sizes, colors per `git show 7ca4989:README.md` verbatim.

- **Global**: every screen wraps in `Screen` (top safe-area inset + `px-screen`); tab screens add bottom padding = tab-bar height (64 + `insets.bottom`). StatusBar `dark` on paper. Exact toast strings from the prototype are canonical: `'Pick at least 3 brands'`, `'Pick where the money goes'`, `'Cash out unlocks at $5 — keep talking'`, `'Reach level 3 to unlock this campaign'`, `'Global board needs more magpies first'`, `'Invite link copied — $1 each when they join'`, `'{$X.XX} sent — lands in 1–2 days'`, `'Gift card store not in this prototype'` → replace with `'Gift cards are coming — stack that +10%'` (native has no "prototype"); `'Settings not in this prototype'` → dropped (settings is real now).
- **Toasts (single-instance)**: `ToastHost` rendered in root `_layout` *after* `<Stack>` (absolute, bottom = tab-bar height + 12). This stays on top because `session.tsx`/`summary.tsx` deliberately avoid **native** modal presentation (`'card'` + `slide_from_bottom` / `'transparentModal'`); on Android all screens share one window so the sibling overlay always wins. (iOS-ready note: if a true native modal is ever used, mount a second ToastHost inside it.)
- **Landing** (`app/index.tsx`): CTA copy becomes **"Get started → start earning"** (locked); fires `analytics.track('install_cta_tap')`. Mono note drops "no app store · " → "no follower count needed". Trust pills unchanged. "log in" link → `/(auth)/login` (real, not toast).
- **Auth (new, minimal)**: same visual language — title 24px, mono sub, dark 52px button. Copy: login "What's your email?" / button "Send code"; verify "Check your inbox" / mono "6 digits · expires in 10 min". 60s resend cooldown surfaces the server limit as a disabled mono countdown.
- **Onboarding**: Stack `gestureEnabled:false`; on steps 2–3, `BackHandler` returns `true` (no-op) — forward-only per spec; progress dots 34×5. Step 2 brand rows come from live `campaigns` (locked Lumen excluded from picking). Disabled continue = `bg-disabled-bg text-disabled-text`; premature tap → gate toast (buttons stay pressable-but-gated so the toast can fire, per "invalid taps show a toast, never fail silently"). Completing step 3 writes `consent_at`/`opt_ins`/`payout_method`/`onboarded_at` server-side, then `router.replace('/(tabs)')`.
- **TabBar + RecFab geometry**: custom `tabBar`: height 64 + `insets.bottom` bottom padding, top border 1.5 `line-strong`, 5 flex cells (center cell fixed 72px empty). `RecFab` absolutely positioned in the TabBar container: 56px circle, centered, `top: -28` (half-overlap above the bar), 3px ring via `borderWidth: 3, borderColor: paper`, Android `elevation: 8` + `shadowColor: '#336ca2'`. Press → `router.push('/session')`. Tab icons: plain `View`s — 15px square (outline/filled) for Home/Brands/Wallet, circle for Rank; active = ink + 700.
- **Home**: header "settings" mono link → `/settings` (real screen). Activity empty state copy verbatim: *"No sessions yet — tap REC below to start your first one."* "cash out" pill on NestCard → switch tab to Wallet.
- **Recording session** (`session.tsx`): `expo-keep-awake` while mounted; Android hardware back = same as pressing "■ End session" (never silently leaves a recording). Foreground-service persistent notification (from the audio module's config plugin) supplements the on-screen `● REC` pill — the visible-indicator promise. Footer copy verbatim. Voice pill timings are real (§3), not the 3s/6s script. Waveform: keep the scripted stagger loop for v1 (amplitude-driven bars = stretch goal). PostHog: session replay/autocapture explicitly disabled on this route.
- **Summary** (`summary.tsx`): transparentModal; scrim `rgba(36,36,28,0.45)`; "Back to the nest" → `router.dismissTo('/(tabs)')` + wipe session slice. Streak card line: "Streak safe · day N" + "+5% bonus active" verbatim. Receipts still `pending` render with a subtle mono "verifying…" and flip in place via Broadcast.
- **Rank**: Global pill → toast (verbatim). Empty leaderboard (no friends): "You" row alone + InviteBanner; add one mono line above: "just you so far — magpies flock together" (new copy, in tone). Share button uses RN `Share.share()` with the invite link; fires `invite_share`; toast verbatim after share sheet closes.
- **Wallet**: cash-out inserts `payout_requests` via edge fn, optimistic balance reset + prepend history + toast verbatim, then refetch ledger. History empty state: "Nothing here yet — your first mention starts the ledger." (new copy). Gift cards button → the replaced toast above.
- **Settings (new screen)**: header "Settings" 24px. Sections: *account* — email (mono), "Sign out" row; *privacy* — consent recap (the 5 onboarding lines, static), recent sessions list with per-session "delete session data" (calls edge fn; cascades snippets + audio; confirm via native `Alert`), and "Delete everything" (account deletion, double-confirm). Copy tone: "your data, your call".

---

## 5. Testing strategy

**Setup**: `jest-expo` preset + `@testing-library/react-native`; `transformIgnorePatterns` allowing `nativewind|react-native-css-interop|react-native-reanimated|@react-navigation|expo(nent)?|@expo|@supabase`; setup file installs the official Reanimated mock, safe-area mock (`initialWindowMetrics`), `expo-font` mock, AsyncStorage mock, and a jest mock for `@siteed/audio-studio`.

**Scripted full-session flow (the crown jewel — no mic, no network)**: the machine takes DI'd services, so:
- `ScriptedAudioCapture` emits silent base64 PCM chunks on a fake timer.
- `stt/scripted.ts` `ScriptedSttStream` plays a declarative script: `[{at: 2000, partial: 'so i tried'}, {at: 2600, partial: 'so i tried volts'}, {at: 3100, final: 'so I tried Voltz energy yesterday'}, ...]`.
- Fake `api`: `diarize` returns 1 speaker at audit 1, 2 at audit 2; `verifyMention` resolves `paid` (and one scripted `flagged`); `sessionEnd` returns a canned summary.
- Assertions across the whole chain: no hits before voice-confirmed → pending receipt + counter on the fuzzy partial hit ("volts" → Voltz, distance 1) → exactly one hit despite partial rewrites → paid flip adjusts to server amount → flagged flip decrements counter and renders "flagged, not paid" → summary payload → wallet/streak/leaderboard slices updated. Run with jest fake timers.

**Unit suites**: `keywords.ts` (exact, fuzzy ≤1 on ≥5-char tokens, short-token exactness, plural strip, boundary anchoring — "revoltzing" never matches, partial-rewrite dedupe, 8s window, multi-token terms); `streak.ts` (device-tz day keys, gap reset, ≥3 bonus flag, chips derivation incl. dashed-today); `money.ts` (cents→string, never floats, signed debits); onboarding gates (consent/≥3/payout disabled logic + gate toasts); `ringBuffer` + `wav.ts` (header bytes for 16k/mono/16-bit); machine transition table (perms denied, reconnect→degraded after 3 fails in 60s, ending flush timeout); Toast single-instance replacement; wallet progress width clamp.

**Component tests**: CampaignCard three states (join/opted/locked-55%), ReceiptRow status renders, disabled Button token colors, TabBar active states.

**CANNOT be tested without a physical device** (explicit):
- Real mic capture — actual PCM format/endianness/sample-rate from `@siteed/audio-studio`, chunk cadence, dual-stream behavior.
- Android 14+ foreground service: notification appearance, mic capture continuing when screened-off/backgrounded, Doze/battery-optimization kills.
- Runtime permission dialogs (RECORD_AUDIO, POST_NOTIFICATIONS) and the deny/again flows.
- Live provider behavior: ElevenLabs/OpenAI WS handshake with real single-use tokens, token expiry mid-session, real partial latency/rewrites, provider-side disconnects.
- Diarization accuracy on real overlapping speech; end-to-end audit latency.
- keep-awake, deep-link invite from another app, OS share sheet.
- Reanimated 60fps performance, font rendering/letter-spacing fidelity, safe-area on real hardware.
- EAS dev-client build integrity (config plugins actually applied). → Milestone 1 smoke script on the user's phone covers these.

---

## 6. `app.config.ts` / EAS setup

```ts
// app.config.ts
export default {
  name: 'magpie', slug: 'magpie', scheme: 'magpie',
  version: '1.0.0', orientation: 'portrait', userInterfaceStyle: 'light',
  newArchEnabled: true,
  android: {
    package: 'si.magpie.app',
    edgeToEdgeEnabled: true,
    permissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    ],
  },
  ios: { // iOS-ready, unbuilt (locked decision)
    bundleIdentifier: 'si.magpie.app', supportsTablet: false,
    infoPlist: { NSMicrophoneUsageDescription:
      'Magpie listens only while you record a session — you always see the REC indicator.',
      UIBackgroundModes: ['audio'] },
  },
  plugins: [
    'expo-router',
    ['expo-font', { fonts: [/* SpaceGrotesk 400/500/600/700, IBMPlexMono 400/500 .ttf paths */] }],
    ['@siteed/audio-studio', {   // verify exact npm name + option names at install (briefing)
      enableBackgroundAudio: true,
      android: { foregroundService: true, showNotification: true,
                 notificationTitle: 'magpie is listening',
                 notificationText: 'recording — tap to return' },
    }],
    // FALLBACK if audio-studio fails validation on SDK 57 (do not install both):
    // ['react-native-audio-api', { androidForegroundService: true, androidFSTypes: ['microphone'] }],
  ],
  experiments: { typedRoutes: true },
};
```

**Env**: read as `process.env.EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (publishable key value) / `EXPO_PUBLIC_POSTHOG_KEY` (optional; analytics no-ops without it). These are public-safe; commit a `.env` with the Supabase values and mirror them in `eas.json` profile `env` blocks (EXPO_PUBLIC_ vars are inlined at build time). Provider keys exist **only** as Supabase function secrets — never in this file, `.env`, or EAS.

```jsonc
// eas.json
{
  "cli": { "appVersionSource": "remote" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal",
      "android": { "buildType": "apk" }, "channel": "development",
      "env": { "EXPO_PUBLIC_SUPABASE_URL": "https://wqxgqqbupmfvmalejnxj.supabase.co",
               "EXPO_PUBLIC_SUPABASE_ANON_KEY": "<publishable>" } },
    "preview":     { "distribution": "internal", "android": { "buildType": "apk" },
                     "channel": "preview", "env": { /* same */ } },
    "production":  { "autoIncrement": true, "android": { "buildType": "app-bundle" },
                     "channel": "production", "env": { /* same */ } }
  },
  "submit": { "production": {} }
}
```

Milestone-1 path: `eas build --profile development --platform android` → install APK on the user's phone → `npx expo start --dev-client` (Expo Go is impossible — native audio module). Local `expo run:android` works as the fast loop on the Windows PC; the emulator is UI-only (no meaningful mic).

**Suggested implementation order** (dependency-driven, for the phasing slice): scaffold + tokens + fonts → supabase client + auth flow → tabs/components with mocked slices → onboarding gates → machine + spotter + scripted tests (pure TS, no device needed) → audio/STT impls → dev build on device → wire summary/streak/wallet against real edge fns → settings/invite.

### Critical Files for Implementation
- C:\Users\admin\Downloads\MagPie\src\lib\session\machine.ts — the session state machine (pure TS, DI'd services); everything risky funnels through it
- C:\Users\admin\Downloads\MagPie\src\lib\keywords.ts — keyword spotter (normalization, fuzzy match, dedupe); the instant-reward feel depends on it
- C:\Users\admin\Downloads\MagPie\src\lib\stt.ts — SttStream interface + provider factory (elevenlabs/openai/chunked/scripted behind one seam)
- C:\Users\admin\Downloads\MagPie\app\_layout.tsx — fonts, providers, auth route guard, ToastHost layering
- C:\Users\admin\Downloads\MagPie\tailwind.config.js — the entire design-token system every component consumes
- C:\Users\admin\Downloads\MagPie\app.config.ts — audio config plugin, permissions, `si.magpie.app`, env wiring