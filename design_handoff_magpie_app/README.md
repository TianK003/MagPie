# Handoff: Magpie — conversational advertising app

## Overview
Magpie is a mobile app where users ("collectors") get paid tiny amounts for naturally mentioning brand names in real conversations. The user picks up to 3 brands, taps record, pockets the phone, and talks; speech is transcribed and each detected brand mention earns cents (either instant per-say payouts or a share of a monthly pool). This design covers the full app: Record (hero screen), Brands roster + brand detail, Leaderboard, Wallet, and Profile.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly. The task is to **recreate these designs in your target codebase's environment** (React Native / Flutter / SwiftUI + Compose, etc. — must run on both iOS and Android) using its established patterns and libraries. The HTML prototype's transcription and mention detection are **simulated**; production needs a real speech-to-text pipeline and keyword matching.

- `magpie-standalone.html` — self-contained, open in any browser to see the live design with all animations and images (390×844 phone screen).
- `Magpie.dc.html` — the source prototype (component template + logic; requires its original environment, use the standalone file for viewing).
- `assets/magpie-bird.png` — low-poly magpie render (transparent), the hero graphic.
- `assets/magpie-icon.png` — app icon / wordmark bird head (transparent).

## Fidelity
**High-fidelity.** Colors, typography, spacing, copy, and motion are final intent. Recreate pixel-perfectly, substituting your platform's native components where appropriate.

## Design Tokens

Typography: **Nunito** (Google Fonts), weights 400/500/600/700/800. UI text 11–16px, headers 24–26px/600, big money numbers 40–44px/600, tracking ~.02–.03em (no uppercase micro-labels; sentence case, bold).

Accents (flat fills, no gradients):
- Primary blue `#4aaee0`
- Teal-green `#33c6a7` (money/positive, active tab, brand-mention highlight)
- Light cyan `#45c5e5`
- Gold `#ecb22e` (top-3 leaderboard ranks)
- Alt tile colors: `#8fdcf0`, `#7fe0cc`

Dark theme (default): bg `#14304a`, text `#f2f8fb`, secondary text `rgba(242,248,251,.62)`, card `rgba(255,255,255,.08)`, hairline `rgba(255,255,255,.14)`, chip `rgba(255,255,255,.13)`, button face `#1d4260`.
Light theme: bg `#e6f4fb`, text `#17384c`, secondary `rgba(23,56,76,.6)`, card `#ffffff`, hairline `rgba(23,56,76,.12)`, chip `#d4ecf7`, button face `#ffffff`.
Theme is user-switchable (Profile → Appearance segmented control).

Radii: cards 20–22px, tiles 14–18px, chips/pills 99px, nav bar 22px. Shadows: soft blue, e.g. `0 8px 22px rgba(30,90,120,.3)`.

## Screens / Views

### 1. Record (hero)
- Header: bird-head icon (26px) + "magpie" wordmark (17px/800), right side status "ready" / "● listening" (teal when live).
- Center composition (ring center at y≈330px of the 390×844 screen):
  - **Record button**: 158px circle, flat `--btn` face, hairline border; inside a 30px squircle dot (blue `#4aaee0`; morphs circle→rounded-square when recording) and label "Tap to record"/"Tap to stop" (11px/700).
  - **Wavy rings**: 3 blobby circles (`border-radius` like `47% 53% 50% 50% / 53% 47% 54% 46%`, 2px borders in blue/teal/cyan at ~.55–.65 alpha, soft glows), each rotating (7.5s / 11s reversed / 9.2s linear infinite). Idle: scaled to 0.4 and opacity 0 (hidden behind button); recording: scale 1, opacity 1 (transition .9s cubic-bezier(.22,.9,.28,1)).
  - **Glow**: 340px radial blur behind, pulsing (5s), opacity 0 when idle.
  - **Magpie bird** (`magpie-bird.png`, 520px wide, rotated **35° default**): flies in from top-left when recording starts (translate(−320,−600)→0, 1.15s cubic-bezier(.22,.9,.28,1) + opacity .9s) and flies out to bottom-right on stop (mirror). After exit it snaps invisibly back to the top entry point so a fast restart never enters from the bottom. Gentle 4.6s bob loop while visible. Sits **behind** the button (z-order), mostly occluded.
- **Live transcript strip** (between button area and mention list): 3 stacked lines, 16px/500, left-aligned, 26px line height, container 82px tall clipped. New word every ~380ms; each word animates 0.9s from opacity 0 + blue `#4aaee0` → opacity 1 + white/fg. Brand mentions render bold 800 in teal `#33c6a7`. When the current line exceeds ~30 chars, lines shift up with a .3s translateY(26px)→0 slide and the oldest line fades to opacity 0 (.9s).
- **Mention counts**: one row per selected brand: name left; "× N" and "+X¢" (teal, 600) right. On a detected mention the row flashes `rgba(74,174,224,.16)` for ~0.9s (background transition .7s). Below, a hairline-separated "Session — N mentions · X¢" summary row.
- **Bottom nav**: pill bar (radius 22). Left: Brands, Ranks. Right: Wallet, You. Icons: 17px chunky outline shapes, 2.5px strokes; active = teal, inactive = secondary text. Center: the record button itself docks here when not on Record (see Interactions).

### 2. Brands (roster)
- Header "Your roster" + "Pick up to 3 brands to work into conversation."
- 3 slot indicator bars (34×6px, filled with accent colors per selected slot) + "N of 3 selected".
- Brand cards: 46px letter tile (flat brand color), name (16.5/600), tag line "Category · Say "Name"", payout ("2¢ / per say" or "pool / monthly", teal), Add/Drop pill button. Selected card: 1.5px blue outline (box-shadow). Add is disabled-looking when roster is full.
- Tapping a card opens **Brand detail**.

### 3. Brand detail
- "← Roster" back link, 64px letter tile + name + tag.
- Payout card: model + rate ("2¢ / say" or "≈1.4¢ / say") + explainer copy (pool split, bonus keywords, natural-mention rule).
- 3 stat tiles: Your says, You earned (teal), Collectors.
- About card: description + chips (Say "Name", Instant payout / Pool share, weekly says volume).
- Full-width CTA: "Add to roster" (teal fill, dark ink) / "Drop from roster" (outline) / "Roster full — drop one first" (disabled).

### 4. Ranks (leaderboard)
- "Leaderboard — This week · resets Sunday". Flat rows (no podium): rank number (gold `#ecb22e` for top 3, otherwise secondary), 35px initials avatar, name, "N says", money (teal). The "You" row: blue tint bg, 1.5px blue outline, updates live with session earnings (base $4.82 + session).

### 5. Wallet
- "Wallet — Every slice you've collected."
- Balance card: "Available now" + big number (40px, blue `#38ade0`) = instant earnings; "$X pending in monthly pools" subline; full-width "Cash out to Vipps ···· 82" button (blue fill).
- Transaction list: Nordbrew instant (today, live), June pool payout, cash-out (negative, plain), Voltway weekend ×2.

### 6. You (profile)
- Avatar (52px, flat blue) + name + "Collecting since March".
- Total earned card: big gradient-free number (44px, `#38ade0`) = $4.82 + session; "+X¢ today" (teal).
- 3 stat tiles: Mentions (203 + session), Brands (selected count), Rank (#12).
- Earnings by model card: Instant / Monthly pools / Payout method rows.
- Appearance card: Dark/Light segmented toggle (active segment teal fill).

## Interactions & Behavior
- **Record button is a shared element**: on non-Record tabs it docks into the nav bar center — 72px, centered on the bar's **top edge** (peeking above it, FAB-style), label hidden, dot 24px. Transition: top/width/height .8s cubic-bezier(.3,.85,.25,1). Tapping it while docked navigates to Record and slides it back up to center (y=330). The nav's center gap animates 88px→0 as the button leaves the bar so remaining items spread evenly.
- **Recording session**: starting resets session counts/cents and the transcript; a mention is detected every ~1.6–4.6s (demo pacing, tweakable); each hit increments that brand's count, adds its rate to session cents (split into instant vs pool buckets), flashes the row, and injects the brand word into the transcript. Recording continues while browsing other tabs.
- Bird entry/exit angles and the bird's rotation are **tweakable parameters** (slideAngle default 28°, birdAngle default 35°).
- Leaderboard, Wallet, and Profile numbers update live from session state.

## State Management
- `tab` ('record'|'brands'|'ranks'|'wallet'|'you'), `detail` (brand id | null)
- `recording` (bool), `birdPhase` ('in'|'outTop'|'outBottom'), session `counts` per brand, `cents`, `instant`, `pool`, `flash` (brand id)
- transcript lines `l0/l1/l2` (word arrays), word ticker
- `selected` (≤3 brand ids), `theme` ('dark'|'light')
- Data needed from backend: brand catalog (name, category, payout model, rate, pool size, keywords, weekly stats), leaderboard, user totals/transactions, live transcription events.

## Assets
- `assets/magpie-bird.png` — user-provided low-poly magpie render, background removed. Used at 520px width, rotated 35°.
- `assets/magpie-icon.png` — user-provided bird-head mark, background removed. Used at 26px in the header; also the app icon source.
- All other icons are simple geometric shapes (circles, rounded rects, bars) — recreate with your icon system or as vector primitives.

## Files
- `magpie-standalone.html` — open this to view the live prototype
- `Magpie.dc.html` — prototype source (markup + logic)
- `assets/` — graphics
