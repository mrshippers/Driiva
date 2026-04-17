# Driiva Mobile — Design System & Component Plan

## Brand Identity

**Wordmark:** "driiva®" — italic bold, white, lowercase. Clean geometric with distinctive double-i.
**Gradient:** Warm amber (#d4850a) → burnt sienna (#a04c2a) → violet (#6b3fa0) → deep indigo (#3b2d8b). Left-to-right. This IS the brand — it appears on every surface that needs to feel premium.
**App Icon:** Glassmorphic rounded square, the wordmark centered over the gradient.
**Tone:** Revolut meets Monzo meets F1. Premium fintech, not friendly-quirky. Confident, fast, precise.

## Colour Palette

### Brand Gradient (primary identity)
- Amber: `#d4850a` → Burnt: `#a04c2a` → Violet: `#6b3fa0` → Indigo: `#3b2d8b`
- Used for: hero backgrounds, CTA buttons, score ring fills, premium moments

### Surfaces (dark glassmorphic)
- Background: `#0c0a1a` (near-black with indigo undertone)
- Card: `rgba(255, 255, 255, 0.05)` + `1px border rgba(255, 255, 255, 0.08)`
- Elevated: `rgba(255, 255, 255, 0.08)` (inputs, hover states)
- All cards use backdrop-blur where supported for true glassmorphism

### Text
- Primary: `#f8fafc` (almost white, not pure white)
- Secondary: `#94a3b8` (muted labels)
- Muted: `#64748b` (tertiary, timestamps)

### Semantic
- Success/Safe: `#22c55e` (green — good scores, completed trips)
- Warning: `#f59e0b` (amber — moderate scores, alerts)
- Error/Danger: `#ef4444` (red — poor scores, failures)
- Info: `#3b82f6` (blue — neutral info)

### Score Tiers
- 80-100 Excellent: `#22c55e`
- 60-79 Good: `#a3e635`
- 40-59 Fair: `#f59e0b`
- 0-39 Poor: `#ef4444`

## Typography

- **Display:** 48px, weight 900, -1px tracking (scores, hero numbers)
- **Heading 1:** 28px, weight 800 (page titles)
- **Heading 2:** 20px, weight 700 (card titles)
- **Body:** 15px, weight 400 (readable content)
- **Label:** 13px, weight 600 (input labels, metadata)
- **Caption:** 11px, weight 500 (timestamps, weights)
- **Font:** System default (SF Pro on iOS, Roboto on Android) — no custom font needed. The wordmark in images uses the brand italic; UI text stays clean and readable.

## Spacing Scale

4 / 8 / 16 / 24 / 32 / 48 (xs/sm/md/lg/xl/xxl)

## Border Radius

8 / 12 / 16 / 24 / 9999 (sm/md/lg/xl/full)

---

## Component Library (for Claude.ai Canvas)

Build each component as a self-contained React Native component with TypeScript props. Every component should support the dark glassmorphic theme. No light mode.

### 1. GlassCard
The fundamental surface. Every card in the app uses this.
```
Props: { children, style?, padding?, onPress? }
Visual: rgba(255,255,255,0.05) bg, 1px rgba(255,255,255,0.08) border, 16px radius
Variants: default, elevated (0.08 bg), interactive (onPress + subtle scale animation)
```

### 2. ScoreRing
The hero component. Shows the driving safety score as a radial gauge.
```
Props: { score: 0-100, size: 'sm' | 'md' | 'lg', animated?: boolean }
Visual: Circular border whose colour follows score tiers.
  Fill = score% of circumference, coloured by tier.
  Center: score number (display font), "Safety Score" label below.
Large: 160px diameter. Medium: 100px. Small: 52px (for trip cards).
Animation: On mount, animate the ring fill from 0 to score over 800ms (ease-out).
```

### 3. ScoreBreakdownBar
Shows one scoring dimension as a labelled progress bar.
```
Props: { label: string, weight: string, value: 0-100 }
Visual: [Label + weight] [===track===] [value]
  Track: 6px height, rounded, bg elevated. Fill coloured by score tier.
Layout: Row. Label 90px fixed width. Track flex. Value 30px fixed.
```

### 4. TripCard
A single trip in a list. Tappable.
```
Props: { trip: { score, distanceMeters, durationSeconds, routeSummary, startedAt } }
Visual: GlassCard with:
  Left: routeSummary (bold), "X.X mi · Xmin" (secondary), date (muted)
  Right: ScoreRing size="sm"
  Entire card is TouchableOpacity → navigates to /trips/:id
```

### 5. StatCard
A single metric in a row of 3.
```
Props: { label: string, value: string, icon?: string }
Visual: GlassCard, centered.
  Value: xl font, weight 800, primary text
  Label: xs font, secondary text
Used in: Dashboard stats row (Trips / Miles / Rank)
```

### 6. BrandGradient (Background)
Full-screen gradient background component.
```
Props: { children, style? }
Visual: LinearGradient from amber through violet to indigo.
  Either left→right (horizontal) or top-left→bottom-right (diagonal).
Used for: Welcome screen, splash, auth screen backgrounds, premium modals
```

### 7. DriivButton
Primary CTA button.
```
Props: { title, onPress, loading?, disabled?, variant: 'primary' | 'secondary' | 'ghost' }
Primary: Solid brand indigo (#5b4dc9), white text, 12px radius, 16px vertical padding.
  When loading: ActivityIndicator replaces text.
  When disabled: 0.6 opacity.
Secondary: Glass card bg, primary-coloured text.
Ghost: Transparent, primary-coloured text.
All variants: Haptic feedback on press (impactLight).
```

### 8. DriivInput
Text input field.
```
Props: Standard TextInput props + { label?: string, error?: string }
Visual: rgba(255,255,255,0.06) bg, 1px border, 12px radius, 14px vertical padding.
  Focused: border colour transitions to primary.
  Error: border colour transitions to error, error text below in red.
  Label above in secondary text if provided.
```

### 9. RewardTimelineItem
A single step in the rewards timeline.
```
Props: { day: string, title: string, icon: string, status: 'locked' | 'unlocked' | 'claimed' }
Visual: Timeline dot (left, coloured by status) → connecting line → GlassCard with icon, day label, title, lock/check badge.
  Locked: muted colours, lock icon.
  Unlocked: brand gradient accent on dot, primary text.
  Claimed: success green dot, checkmark badge, slightly elevated card.
```

### 10. LeaderboardRow
```
Props: { rank: number, name: string, score: number, isCurrentUser?: boolean }
Visual: Row in GlassCard.
  Rank (bold, fixed width) | Avatar circle with initial | Name (flex) | Score (coloured by tier)
  If isCurrentUser: subtle brand gradient left border accent.
  Top 3: gold/silver/bronze rank badge.
```

### 11. RecordButton
The center tab button. Also used as the main CTA on the record screen.
```
Props: { state: 'idle' | 'recording' | 'processing', onPress }
Idle: Brand indigo circle (140px on record screen, 60px in tab bar), play icon.
  Pulsing glow shadow animation.
Recording: Red circle, stop icon. Pulsing red glow.
Processing: Amber, hourglass icon, spinning. Disabled.
Haptic feedback: Heavy impact on start, success notification on stop.
```

### 12. BottomTabBar (Custom)
```
5 tabs: Home | Trips | Record | Rewards | Profile
Background: rgba(10, 14, 26, 0.95) with top border.
Record tab: Elevated circle button (see RecordButton), positioned above the bar.
Active tab: Brand indigo icon + label. Inactive: muted.
iOS safe area respected at bottom.
```

### 13. TripRouteMap
```
Props: { points: Array<{lat, lng}>, startLocation, endLocation }
Visual: react-native-maps MapView with dark style.
  Polyline in brand gradient (amber → indigo) following the route.
  Start marker: green dot. End marker: red dot.
  Map auto-fits to show the full route with padding.
```

### 14. OnboardingStep
```
Props: { title, subtitle, illustration, step: number, totalSteps: number }
Visual: Full-screen with BrandGradient background (subtle).
  Illustration area (top 50%). Title + subtitle (bottom).
  Dot indicators showing progress (step X of Y).
  "Continue" DriivButton at bottom.
Swipeable between steps (PagerView or Animated.ScrollView).
```

### 15. AchievementCard
```
Props: { title, description, icon, unlocked: boolean, unlockedAt?: string }
Visual: GlassCard.
  Left: Icon in a circle (brand gradient if unlocked, muted if locked).
  Center: Title (bold) + description (secondary).
  Right: Checkmark or lock icon.
  Unlocked cards have a subtle shimmer animation on first render.
```

### 16. CommunityPoolCard
```
Props: { totalPool: number, yourShare: number, safetyFactor: number, memberCount: number }
Visual: Large GlassCard with:
  "Community Pool" heading.
  Large number: £X,XXX.XX (total pool in formatted GBP).
  Progress bar: your share as % of pool.
  Row of mini-stats: Members | Safety Factor | Your Share.
  All money values formatted from integer cents.
```

### 17. DriivHeader
```
Props: { title?: string, showBack?: boolean, rightAction?: ReactNode }
Visual: Safe-area-aware top bar.
  Left: Back chevron (if showBack) or Driiva wordmark.
  Center: Title (if provided).
  Right: Custom action (notification bell, settings gear).
  Transparent bg, no border (content scrolls underneath).
```

### 18. SkeletonLoader
```
Props: { width, height, borderRadius? }
Visual: Animated shimmer placeholder matching card dimensions.
  Gradient sweep from left to right on loop.
  Used while Firestore data is loading.
```

### 19. EmptyState
```
Props: { icon, title, subtitle, action?: { label, onPress } }
Visual: Centered in parent.
  Large muted icon (64px).
  Title (heading 2, primary text).
  Subtitle (body, secondary text).
  Optional CTA button below.
```

### 20. PolicyStatusBadge
```
Props: { status: 'active' | 'pending' | 'expired' | 'none' }
Visual: Pill badge.
  Active: green bg, white text. Pending: amber. Expired: red. None: muted.
```

---

## Screen Compositions (How components assemble)

### Welcome Screen
BrandGradient (full diagonal) → Driiva wordmark (large, centered) → tagline → "Sign In" DriivButton (primary) → "Create Account" DriivButton (ghost)

### Dashboard
DriivHeader (wordmark left, notification bell right) → ScoreRing (lg, centered) → 3x StatCard row → ScoreBreakdownBar x5 in GlassCard → Recent TripCards → CommunityPoolCard

### Trip Recording (Full Screen)
Dark bg → State-dependent copy → RecordButton (140px, center) → Live stats (speed, distance, duration) as StatCards below when recording

### Trip Detail (Modal)
TripRouteMap (top 40%) → GlassCard: ScoreRing (md) + route summary + date → ScoreBreakdownBar x5 → Event counts (hard braking, speeding seconds, etc.) → Weather badge

### Onboarding (Swipeable, 5 steps)
Step 1: "Welcome to Driiva" + car illustration
Step 2: "Track your drives" + GPS permission request
Step 3: "Get scored" + score ring demo
Step 4: "Earn rewards" + rewards preview
Step 5: "Join the pool" + community preview + "Let's go" CTA

### Rewards
DriivHeader → RewardTimelineItem x5 (vertical timeline) → CommunityPoolCard at bottom

### Leaderboard
DriivHeader → Period tabs (Weekly / Monthly / All Time) → LeaderboardRow list → Your position highlighted

### Profile
Avatar + name + email → Settings menu (GlassCards with menu items) → Legal links → Sign out → Version
