# Handoff: Magpie — mobile PWA prototype

## Overview
Magpie is a mobile PWA that pays everyday people for mentioning sponsor brands in real, in-person conversations. The user opts into brand campaigns, taps REC before a conversation (app verifies 2+ voices), and earns a micro-reward per detected mention (5–8¢), cashing out real money at a $5 threshold. Target audience: Gen Z / casual-smart tone.

This package contains the full interactive design prototype for the marketing funnel (landing → onboarding) and the app itself (dashboard, recording session, campaigns, leaderboard, wallet).

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, **not production code to copy directly**. The task is to **recreate these designs in the target codebase's environment** using its established patterns and libraries. The stack has been chosen — see `CLAUDE.md` in this folder (Vite + React + TS + vite-plugin-pwa, Tailwind, Zustand, Supabase; ElevenLabs Scribe + OpenAI for the audio pipeline; PostHog for analytics).

Important prototype-only behaviors to replace in production:
- **Mentions are simulated on a timer.** Real product needs mic capture, voice-count detection, and on-device/server mention spotting. Everything downstream of a "mention event" (receipts, live counter, payouts) is designed here and should be kept.
- The iPhone bezel (`ios-frame.jsx`) is a presentation wrapper for the demo — do not build it; the app itself is the content inside it.
- Toasts stand in for unbuilt surfaces (settings, gift-card store, global leaderboard).

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, copy, and interactions are final design intent — recreate pixel-perfectly with the codebase's component patterns.

## Design Tokens
Colors:
- Ink (near-black): `#24241c`
- Background: `#fdfdfb` (app), `#e9e7e0` (desktop backdrop, demo only)
- Accent (brand blue): `#336ca2`
- Accent tint (on dark surfaces): `#9cc4e8`; selected-row text on accent: `#dbe9f5`
- Selected surface tint: `#eaf1f8`
- Borders: `#d8d7cc` (strong), `#e2e1d8` (soft), dashed `#c7c6bb`
- Muted text: `#6b6b60` (body), `#8a8a80` (labels), `#a3a294` / `#b5b4a8` (disabled)
- Recording red: `#c23b3b`
- Disabled button: bg `#e2e1d8`, text `#a3a294`

Typography:
- Primary: **Space Grotesk** (400/500/600/700), letter-spacing −0.02em to −0.03em on headings
- Data/labels: **IBM Plex Mono** (400/500), 9.5–11px, muted color, occasionally letter-spacing .08em uppercase (e.g. "YOUR NEST")
- Scale: 42px landing hero, 36–40px money figures, 24–28px screen titles, 14–16px buttons/body, 12–13.5px secondary, 9.5–11px mono labels

Shape & spacing:
- Radii: 14px cards/buttons, 18px hero card, 12px rows, 999px pills, 22px sheet top corners
- Borders 1.5px; screen padding 20–22px horizontal; card padding 12–18px; gaps 6–16px
- All tap targets ≥ 44px (buttons 48–52px min-height)
- Safe areas: content clears status bar (~62px top in prototype) and home indicator (~32px bottom) — use `env(safe-area-inset-*)` in production

Shadows: minimal — `0 2px 12px rgba(20,20,10,.06)` on hero card, `0 4px 14px rgba(51,108,162,.4)` on REC FAB, `0 4px 14px rgba(20,20,10,.25)` on toasts.

## Screens / Views

### 1. Landing (pre-install funnel)
- Header: wordmark `magpie.` (21px/700, blue period) + `log in` mono link
- Hero: "Get paid to talk." — 42px/700; "talk." is white-on-blue chip (padding 0 8px, radius 6px). Subcopy 15px muted: "You already mention brands every day. Magpie pays you for it — **5¢+ per mention**, in real conversations."
- Demo card (180px, centered): 6 animated waveform bars (scaleY keyframe loop, 1.05s, staggered .13s; 2 bars blue), mono snippet `"…so I tried Voltz…"`, blue `+5¢` pill. A floating `+5¢` repeatedly rises and fades beside it (translateY −36px + fade, 2.2s loop).
- CTA (dark, 52px): "Add to home screen → start earning" → onboarding. Mono note: "no app store · no follower count needed". Trust pills: consent-first / cash out at $5 / you pick the brands.

### 2. Onboarding (3 steps, forward-only, progress dots 34×5px)
- **Step 1 "The honest part"** — consent checklist card (5 ✓ rows: records only on REC tap; visible indicator; must tell people + local consent laws surfaced; audio deleted after processing; only snippets kept). Tappable agreement row with 22px checkbox ("I understand — and I'll tell the people I talk with"); selected state = blue border + `#eaf1f8` bg. Continue disabled (grey) until checked.
- **Step 2 "Pick your brands"** — brand rows (logo placeholder 34px, name, mono `category · N¢/mention`, +/✓). Selected = blue border/tint. Requires ≥3; counter "N of 3 minimum picked"; toast on premature continue.
- **Step 3 "Where's the money going?"** — radio rows PayPal / Venmo / Bank transfer (mono note: instant / 1–2 days). "Let's go →" enters app.

### 3. Home ("the nest" dashboard)
- Header: wordmark + `settings` mono
- Nest card (dark `#24241c`, radius 18px): mono label `YOUR NEST`, balance 38px/700 in `#9cc4e8`, "+$X.XX this week ↗", outlined `cash out` pill (tint border/text) → Wallet tab
- 3 stat tiles: streak (Nd) / friends rank (#N) / total mentions
- "Recent activity" list: white rows — title (12.5px/600), mono meta (`18 min · 2 voices · 2 mentions`), blue `+$0.10` right-aligned. Empty state (fresh account): dashed box "No sessions yet — tap REC below to start your first one."

### 4. Tab bar + REC FAB
- 5 cells: Home, Brands, [center gap], Rank, Wallet. Geometric 15px icons (square = pages, circle = social), active = ink + filled + 700, inactive = `#8a8a80`
- REC FAB: 56px blue circle, white "REC", 3px bg-colored ring, centered over the gap, floats above home indicator; blue glow shadow

### 5. Recording session (full-screen overlay)
- Top: `● REC mm:ss` pill (red border/text, mono) + voice pill: `detecting…` → `1 voice…` (~3s) → `2 voices ✓` (~6s, blue)
- Waveform: 7 bars, 46px, same stagger animation
- Live counter: white-on-blue `$0.XX` (32px/700) that updates per mention; a `+N¢` coin pops up beside it on each mention (rises + fades, 1.6s, re-triggered per event)
- Mono line: "this session · N mentions"
- Receipts feed (newest on top): mono timestamp, transcript snippet, bold blue `+N¢`; persistent dashed "listening…" row at bottom
- "■ End session" (dark, 52px). Footer mono: "this screen stays visible while recording — everyone can see it"
- Mentions only fire once 2+ voices detected, and only from opted-in campaigns

### 6. Session summary (bottom sheet)
- Slides up (translateY 40px→0 + fade, .3s) over 45% ink scrim
- Mono `SESSION COMPLETE`, `+$X.XX` 40px blue, meta "N min · N paid mentions", receipt rows, streak card ("Streak safe · day N" / "+5% bonus active"), "Back to the nest" CTA
- On close: balance, week earnings, mention count, streak, activity, wallet history, and leaderboard position all reflect the session

### 7. Campaigns (Brands tab)
- Title "Campaigns", mono sub "opt in → mention naturally → get paid"
- Cards: logo placeholder 38px, name, mono `category · cap N/day`, blue rate pill `N¢`; bottom row: mono note (multiplier e.g. "2x weekends · pays instantly" in blue, else "pays instantly") + toggle button (`+ join` outlined / `✓ opted in` filled ink). Opted-in card gets blue border
- Locked card at 55% opacity, note "unlocks at level 3", button `locked` → toast

### 8. Rank tab
- Scope pills Friends (active, ink) / Global (toast)
- Leaderboard rows: rank #, avatar circle, name, mono weekly $. "You" row = solid blue, white text, `$X.XX · you`. Sorted live by weekly earnings
- Streak card: "Streak · N days" + "best: 11", 7 day-chips (done = blue `M✓`; today = dashed ink `F?`; future = grey), hint line flips to "today counted — streak bonus +5% active" after a session
- Badge pills: First Fiver, Chatterbox, Brand Loyalist 🔒 (dashed/locked)
- Invite banner (dark): "Invite a friend → **$1 for you, $1 for them**" (tint bold) + tint `Share` button → "Invite link copied" toast

### 9. Wallet tab
- Balance card (ink border): `$X.XX` 36px, mono threshold line ("cash-out threshold $5 · ready" or "· $X.XX to go"), 10px progress bar (blue fill, width = balance/5, animates .4s)
- Buttons: "Cash out →" (dark; disabled grey under $5 → nudge toast; over $5 → resets balance, prepends history entry, toast "$X.XX sent — lands in 1–2 days") + "gift cards / +10% bonus" (outlined, two lines, gap 2px)
- History: dashed rows, earnings blue `+$`, debits grey `−$`. Footer mono: "payouts land in 1–2 days · no fees"

## Interactions & Behavior
- Navigation: landing → onboarding (3 gated steps) → app (4 tabs + REC overlay + summary sheet). Forward-only onboarding.
- Validation gates: consent checkbox; ≥3 brands; payout chosen — disabled buttons are grey (`#e2e1d8`/`#a3a294`), invalid taps show a toast instead of failing silently.
- Toasts: dark pill, bottom-centered above tab bar, slide-up+fade in (.25s), auto-dismiss 2.4s, single-instance (new replaces old).
- Animations: waveform scaleY loop 1.05–1.1s staggered; coin pop rise+fade; sheet slide-up .3s ease-out; progress bar width .4s; CTA hover lift (translateY −1px, .15s) — desktop only.
- Recording simulation (replace in production): 1s tick; voices at t=3s/6s; mentions every `mentionPaceSecs` (+0–6s jitter) cycling through opted-in brands.

## State Management
- `screen` (landing/onboard/app), `obStep`, `consent`, `payout`
- `brands[]`: {id, name, cat, rate¢, cap/day, multiplier?, locked?, on}
- `tab`, `recording`, `secs`, `voices`, `receipts[]` {time, snippet, amt¢}, `sessEarn`
- `balance`, `weekEarn`, `mentionsTotal`, `streak`, `todayDone`, `activity[]`, `walletHist[]`, `summary`, `toast`
- Derived: leaderboard sort/rank, cash-out eligibility (balance ≥ 5), progress %, streak-day chips
- Production additions: persist to storage/backend; auth; real session upload + mention verification; anti-fraud flags (see wireframes: repeated-mention "flagged, not paid" receipts)

## Assets
- Fonts via Google Fonts: Space Grotesk, IBM Plex Mono
- No images; brand logos are dashed placeholder boxes labeled "logo" — replace with real sponsor logos
- No icon library; tab icons are simple geometric shapes (square/circle)

## Files
- `CLAUDE.md` — **copy this to the repo root** before starting Claude Code: chosen tech stack, audio pipeline, conventions, event names.
- `magpie-prototype-standalone.html` — **self-contained interactive demo** (open in any browser, works offline, all animations included). Best single file to show Claude Code.
- `Magpie Prototype.dc.html` — original prototype source (template + logic class; requires its runtime, reference only)
- `ios-frame.jsx` — iPhone bezel wrapper used for presentation (do not implement)
