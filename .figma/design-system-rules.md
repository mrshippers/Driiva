# Driiva Design System Rules — Figma Integration

## 1. Token Definitions

### Mobile (React Native / Expo) — Primary
Tokens are defined in a single file:
- **File:** `mobile/components/ui/theme.ts`
- **Format:** TypeScript const objects (`C`, `T`, `S`, `R`, `ROW`)

```typescript
// Colours — solid dark scale, NOT rgba transparency
C.bg       = '#0a0a14'    // Near-black, faint blue undertone
C.surface1 = '#12111f'    // Card backgrounds
C.surface2 = '#1a1830'    // Elevated/active states
C.surface3 = '#241f40'    // Pressed states, inputs
C.primary  = '#5b4dc9'    // THE accent colour (one-colour rule)
C.text.pri = '#e8eaf0'    // Body text (not pure white)
C.text.hero = '#f8fafc'   // Hero numbers only
C.text.sec = '#8b8b9e'    // Labels, secondary
C.text.mut = '#5c5c70'    // Timestamps, tertiary

// Score tier colours (data-driven only)
scoreColor(80+) = '#10B981'  // success/excellent
scoreColor(70+) = '#2DD4BF'  // teal/good
scoreColor(50+) = '#F59E0B'  // warning/fair
scoreColor(<50) = '#EF4444'  // error/poor

// Brand gradient stops (image asset, not CSS)
brand.amber  = '#d4850a'
brand.burnt  = '#a04c2a'
brand.violet = '#6b3fa0'
brand.indigo = '#3b2d8b'
```

### Web (React / Vite) — Secondary
- **File:** `client/src/index.css` — CSS custom properties via shadcn convention
- **File:** `tailwind.config.ts` — extends CSS vars into Tailwind utilities
- **File:** `client/src/styles/glass.css` — glassmorphism classes

No token transformation system — tokens are hardcoded in each platform. The mobile `theme.ts` is the source of truth.

---

## 2. Component Library

### Mobile Components (10 built, 16 planned)
- **Location:** `mobile/components/ui/`
- **Architecture:** Functional React components with TypeScript interfaces
- **Barrel export:** `mobile/components/ui/index.ts`

| Component | File | Purpose |
|-----------|------|---------|
| GlassCard | `GlassCard.tsx` | Foundational card surface (solid dark + border) |
| ScoreRing | `ScoreRing.tsx` | 270° arc gauge with brand gradient SVG stroke |
| AppBackground | `AppBackground.tsx` | Full-screen gradient (image asset with fallback) |
| DriivButton | `DriivButton.tsx` | CTA button (primary/secondary/ghost/danger) + haptics |
| TripCard | `TripCard.tsx` | Trip list row, fixed 72px height, score badge |
| StatCard | `StatCard.tsx` | Metric card for stat rows, tabular figures |
| ScoreBreakdownBar | `ScoreBreakdownBar.tsx` | Score dimension bar, 8px height, tier colours |
| SkeletonLoader | `SkeletonLoader.tsx` | Shimmer placeholder matching content layout |
| EmptyState | `EmptyState.tsx` | Empty state with icon, title, optional CTA |
| theme | `theme.ts` | All design tokens (C, T, S, R, ROW) |

### Web Components (47 shadcn/ui + custom)
- **Location:** `client/src/components/ui/` — 47 shadcn/ui primitives
- **Custom:** `client/src/components/` — Driiva-specific (ScoreRing, GlassCard, BottomNav, etc.)
- **Architecture:** shadcn/ui pattern (Radix primitives + Tailwind + CVA)

No Storybook. The mobile `DESIGN_SYSTEM.md` and PDF showcase serve as documentation.

---

## 3. Frameworks & Libraries

### Mobile
- **Framework:** React Native 0.81.5 via Expo SDK 54
- **Router:** Expo Router 6 (file-based, like Next.js)
- **State:** TanStack React Query 5 + React Context
- **Styling:** React Native `StyleSheet.create()` — no styling library
- **Build:** Metro bundler (Expo default)
- **SVG:** `react-native-svg` for ScoreRing gauge

### Web
- **Framework:** React 18.3 (NOT Next.js — this is Vite + React SPA)
- **Router:** Wouter 3.3
- **State:** TanStack React Query 5 + React Context
- **Styling:** Tailwind CSS 3.4 + shadcn/ui + custom CSS (`glass.css`)
- **Build:** Vite 7.3 (client) + esbuild (server bundle)
- **Animation:** Framer Motion 11
- **Maps:** Leaflet + react-leaflet

---

## 4. Asset Management

### Brand Assets
- **Gradient background:** `assets/Gradient_background.png` — THE brand surface. Never recreate with CSS.
- **App icon:** `mobile/assets/images/icon.png`
- **Splash:** `mobile/assets/images/splash-icon.png`
- **Logo marks:** Brand logo files in project root (driiva wordmark, ii monogram)

### Mobile Assets
- **Location:** `mobile/assets/`
- **Referenced via:** `require()` statements in components
- **Image loading:** Expo's asset system (bundled at build time)

### Web Assets
- **Location:** `client/src/assets/` and `client/public/`
- **Referenced via:** Vite import or public path
- **No CDN configured** — served directly from Vercel edge

---

## 5. Icon System

### Mobile
- **Library:** `@expo/vector-icons` → `Ionicons` family
- **Convention:** Outline style only (`*-outline` suffix). Never mix outline + filled.
- **Import:** `import { Ionicons } from '@expo/vector-icons'`
- **Usage:** `<Ionicons name="speedometer-outline" size={24} color={C.text.sec} />`

### Web
- **Library:** `lucide-react` (v0.453)
- **Import:** `import { Play, MapPin, Trophy } from 'lucide-react'`
- **Sizing:** Inline `size` prop, typically 16-24px

---

## 6. Styling Approach

### Mobile — StyleSheet (no library)
```typescript
// Pattern: co-located StyleSheet at bottom of component file
const styles = StyleSheet.create({
  container: {
    backgroundColor: C.surface1,  // Always reference theme tokens
    borderRadius: R.card,         // 16px universal
    borderWidth: 1,
    borderColor: C.border,
  },
  text: {
    ...T.label,                   // Spread typography preset
    color: C.text.pri,
  },
});
```

**Rules:**
- All colours from `theme.ts` — never hardcode hex in components
- All numbers use `fontVariant: ['tabular-nums']`
- Three font weights only: 400, 600, 700
- Fixed row heights from `ROW` constant (72px trips, 64px stats, 48px settings)

### Web — Tailwind + CSS Modules
```tsx
// Pattern: Tailwind utilities + glass.css classes
<div className="glass-morphism rounded-2xl p-6">
  <h2 className="text-2xl font-bold text-white">Score</h2>
</div>
```

### Responsive Design
- **Mobile app:** Single layout (390pt iOS / 360dp Android). No breakpoints.
- **Web:** Mobile-first Tailwind breakpoints (`sm:`, `md:`, `lg:`). The web app is primarily accessed on mobile browsers.

---

## 7. Project Structure

```
DriivaMVP/
├── mobile/                    # Expo React Native app (THE product)
│   ├── app/                   # Expo Router file-based routes
│   │   ├── (auth)/            # Auth group (signin, signup, forgot-password)
│   │   ├── (tabs)/            # Main tab group (dashboard, trips, record, rewards, profile)
│   │   └── _layout.tsx        # Root layout (auth gate, QueryClient, theme)
│   ├── components/
│   │   └── ui/                # Driiva component library (theme.ts is source of truth)
│   ├── contexts/              # AuthContext
│   ├── lib/                   # Firebase init
│   └── constants/             # Legacy theme (being replaced by components/ui/theme.ts)
│
├── client/                    # React web SPA (desktop/admin fallback)
│   └── src/
│       ├── components/ui/     # 47 shadcn/ui primitives
│       ├── components/        # Driiva custom (ScoreRing, BottomNav, etc.)
│       ├── pages/             # Route pages
│       ├── hooks/             # Data hooks (Firestore, geolocation)
│       ├── contexts/          # AuthContext
│       └── styles/            # glass.css, parallax.css
│
├── server/                    # Express API on Vercel
├── functions/                 # Firebase Cloud Functions
├── shared/                    # Cross-platform types + canonical algorithms
│   ├── tripProcessor.ts       # Haversine, distance, duration (single source of truth)
│   ├── refundCalculator.ts    # Refund formula (single source of truth)
│   ├── firestore-types.ts     # Firestore document types
│   └── schema.ts              # Drizzle ORM schema (Neon PostgreSQL)
│
└── api/                       # Python FastAPI classifier
```

---

## 8. Design Rules (Non-Negotiable)

These 10 rules apply to ALL Figma-to-code translations:

1. **One accent colour.** `#5b4dc9` for all interactive elements. No amber/orange buttons.
2. **Score colours are earned.** Green/amber/red appear ONLY on score-related data elements.
3. **Solid dark surfaces.** Cards use `#12111f`, not `rgba(255,255,255,0.05)`. Glass reserved for hero elements only.
4. **Three font weights.** 400 (body), 600 (labels/headings), 700 (numbers/CTAs). No 800/900.
5. **Tabular figures.** `fontVariant: ['tabular-nums']` on all numeric displays.
6. **16px radius universal.** Cards: 16px. Sheets/modals: 24px. Badges: 8px.
7. **Fixed row heights.** Trips: 72px. Stats: 64px. Settings: 48px.
8. **270° arc gauge.** ScoreRing uses a 270-degree arc (automotive gauge), not a 360° ring.
9. **Brand gradient = image asset.** The amber→indigo gradient is `Gradient_background.png`. Never recreate in CSS/code.
10. **Haptic feedback.** Light on tap, medium on confirm, success on score animation complete.

---

## 9. Figma-to-Code Mapping

When translating Figma designs to code:

| Figma Token | Mobile (RN) | Web (Tailwind) |
|-------------|-------------|----------------|
| Background | `C.bg` (#0a0a14) | `bg-[#0a0a14]` or CSS var |
| Card surface | `C.surface1` (#12111f) | `.glass-morphism` class |
| Primary button | `C.primary` (#5b4dc9) | `bg-primary` |
| Body text | `C.text.pri` (#e8eaf0) | `text-foreground` |
| Secondary text | `C.text.sec` (#8b8b9e) | `text-muted-foreground` |
| Card border | `C.border` (white 8%) | `border-border` |
| Card radius | `R.card` (16px) | `rounded-2xl` |
| Spacing md | `S.md` (16px) | `p-4` / `gap-4` |

| Figma Component | Mobile Component | Web Component |
|-----------------|-----------------|---------------|
| Score gauge | `<ScoreRing score={82} />` | `<ScoreRing score={82} />` (client/src/components/) |
| Card | `<GlassCard>` | `<div className="glass-morphism">` |
| Button (primary) | `<DriivButton title="..." />` | `<Button>` (shadcn) |
| Trip row | `<TripCard trip={...} />` | Custom trip card component |
| Stat block | `<StatCard label="..." value="..." />` | Custom stat card |
| Score bar | `<ScoreBreakdownBar label="..." value={85} />` | Custom progress bar |
