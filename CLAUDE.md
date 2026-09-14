# Driiva — Claude Code Configuration

> Last updated: 2026-08-18. Canonical Driiva repo: `~/Documents/Driiva` (remote `mrshippers/Driiva`). Renamed from `~/Documents/DriivaMVP` (MVP dropped from the name); the old `~/Documents/Driiva` business-docs folder (deck, financials, legal, investor material) was merged into this same directory and is gitignored (see `.gitignore`), never tracked. `~/DRIIVA` (uppercase) was a stale abandoned copy - already gone. The full rebuild strangler sequence (M0 foundations, M1 identity, M2 trips/scoring, M4 payments/policy lifecycle) is merged to `main`. M3 (pool funding) and M8 (claims) are not started, both blocked on founder decisions (D6, D11 - see `rebuild_plan.md`). The old `feat/marketing-site-v1` marketing work has landed and is superseded by `apps/marketing/`. `com.jamal.driiva-nightly-build` (launchd, off-repo) runs nightly, branch + PR only, never touches `main` directly.

## Project Context

Driiva Ltd is a telematics insurtech app targeting young UK drivers. Core proposition: telematics-driven cashback premiums, postcode penalty reduction, fraud mitigation. Sharia-compliant angle — targets young drivers and Muslim communities. Solo founder build. Pre-raise. Demo-prep phase with Keith Cheng.

**Current priorities:**

- Keith Cheng demo prep
- Core feature completion: pool funding pipe (D6-gated), real phone-usage detection, mobile background trip capture
- Waitlist growth (1,000 signups = raise accelerant)
- Pre-beta blocklist follow-through (post commit `96e2762`)
- Mobile app (Expo SDK 54) is the canonical mobile surface - PWA path superseded
- Q2–Q3 2026 raise (angels + seed, insurtech OR Muslim/ethical finance)

**The raise story:**

- 30,000 policies = ~£18M gross premium (£600 avg)
- £60M conservative valuation at 3-4x GWP multiple
- One broker/MGA letter of intent = investor gold
- Channel distribution over volume marketing post-raise

---

## Skill Router

The `skill-router` skill governs all dispatch in this project. On every task, check the skill registry below and load the appropriate SKILL.md before responding. Never answer from general knowledge when a purpose-built skill exists.

---

## Skill Registry

### Core Dispatch
| Skill | Trigger |
|---|---|
| `skill-router` | Boot sequence — runs first on every message |
| `founder-ops` | Prioritisation, sprint planning, "what next", feeling stuck |
| `planning-with-files` | Multi-step projects, >5 tool calls, complex builds |
| `dispatching-parallel-agents` | 2+ independent parallelisable tasks |

### Build & Ship
| Skill | Trigger |
|---|---|
| `stack-ship` | Deploy, Vercel, Firebase, Cloudflare DNS, Stripe, CI/CD, auth |
| `systematic-debugging` | Bugs, errors, broken flows — especially auth delay and CI failures |
| `test-driven-development` | Any new feature or bugfix — before writing code |
| `test-fixing` | Failing tests, make tests pass |
| `project-bootstrapper` | New project setup, scaffold, init |
| `plan-implementer` | Implementing from a spec or plan |
| `feature-planning` | Breaking down features into tasks |

### Quality & Review
| Skill | Trigger |
|---|---|
| `verification-quality` | Before claiming anything done, shipped, fixed, deployed |
| `code-review` | Reviewing a diff, PR, or branch for correctness/cleanup |

### GTM & Investor Relations
| Skill | Trigger |
|---|---|
| `gtm-engine` | Investor outreach, broker emails, waitlist copy, pitch materials |
| `qa-gate` | Any output with Driiva metrics, projections, policy numbers |
| `humanizer` | Long-form copy, investor emails, public-facing text |
| `internal-comms` | Internal docs, briefings, demo prep notes |

### Frontend & Design
| Skill | Trigger |
|---|---|
| `frontend-design` | UI components, onboarding flow, PWA shell, glassmorphism system |
| `web-artifacts-builder` | Complex multi-component artifacts |
| `canvas-design` | Marketing assets, pitch deck visuals |
| `dashboard-creator` | Telematics data dashboards, KPI views, investor metrics |

### Documents & Files
| Skill | Trigger |
|---|---|
| `docx` | Word documents, reports, investment memos |
| `pdf` | PDF creation and reading - pitch deck export, term sheets |
| `pptx` | Investor pitch deck |
| `xlsx` | Financial models, policy projections, cap table |

### Research & Intelligence
| Skill | Trigger |
|---|---|
| `last30days` | Insurtech trends, telematics regulation, competitor moves |
| `conversation-analyzer` | Analysing Claude Code conversation patterns |
| `code-auditor` | Codebase health, tech debt, security — pre-demo audit |
| `ensemble-orchestrator` | Architecture decisions, multiple approaches |
| `ensemble-solving` | Parallel solution generation |

### Specialist
| Skill | Trigger |
|---|---|
| `mcp-builder` | Building MCP servers - Root API, telematics data pipeline |
| `skill-creator` | Creating or editing skills |
| `prompt-engineer` | System prompt design, AI feature prompting |
| `schedule` | Demo scheduling, raise timeline planning |
| `claude-api` | Model/pricing/API questions - Claude/Anthropic named or LLM-shaped task |

---

## Stack Reference

- **Web:** React + Vite (client) on an Express server bundled via esbuild
- **Mobile:** Expo SDK 54 (canonical mobile surface — PWA path superseded)
- **Auth:** Firebase Auth (fast-path live — see Known Blockers)
- **Database:** Firebase Firestore + Neon DB
- **ORM:** Drizzle ORM
- **Payments:** Stripe
- **Insurance Platform:** Root Insurance Platform API
- **Deploy:** Vercel + Cloudflare
- **Auth Enhancement:** WebAuthn / Passkeys (fully wired, both backend and frontend - see Known Blockers, item 3 was stale)
- **Marketing site:** `apps/marketing/` — the live driiva.co.uk SPA (Vite + React 18 + wouter + animejs + Lenis), with its own serverless waitlist API (Firebase Admin + Resend), legal routes, and hyperframe video sections. Legacy `marketing-site/index.html` + Framer are superseded.
- **CI Sentinel:** `claude-sentinel/` agent-driven QA harness
- **Build:** Tailwind **v4** for the root product (CSS-first config, migrated `e90290d`); the `apps/marketing/` SPA uses **Tailwind v3.4** (`tailwind.config.js`). rolldown for bundling.
- **Analytics:** `@vercel/analytics` (swapped from Plausible, `dae8f6b`) — do not reintroduce Plausible.

---

## Repo Layout

- `client/` — main web app (React + Vite)
- `server/` — Express API server (entrypoint `server/index.ts`)
- `mobile/` — Expo SDK 54 app, 16-screen onboarding flow shipped May 2026 (commit `7b1658c`)
- `functions/` — Firebase Functions
- `api/` — Vercel API routes
- `shared/` — cross-cutting types and schemas
- `migrations/` — Drizzle migrations
- `design-system/` — canonical brand + UI tokens (authoritative — see Design System below)
- `driiva-design-system/` — packaged design-system module
- `apps/marketing/` — **active driiva.co.uk marketing SPA** (Vite + React + wouter; Tailwind v3.4; waitlist API via Firebase Admin + Resend; legal pages /privacy /terms /cookies /complaints /uk-survey)
- `hyperframes/` — branded video compositions (canonical, shipped May 2026, commit `37012a6`)
- `Driiva Marketing/` — marketing collateral
- `claude-sentinel/` — agent-driven QA harness
- `scripts/`, `docs/`, `firestore-backup/`, `Workspaces/`

---

## Commands

```bash
npm run dev               # tsx server (Express + Vite middleware)
npm run dev:staging       # same with .env.staging
npm run build             # vite build + esbuild server bundle
npm run start             # NODE_ENV=production node dist/index.js
npm run check             # tsc
npm test                  # vitest run
npm run test:watch
npm run test:coverage
npm run db:push           # drizzle-kit push to Neon
npm run db:schema         # run schema script
npm run verify:db
npm run load-test
npm run test:root-api     # Root Insurance Platform API smoke test
npm run create:user
npm run test:auth         # node test-auth.js

# Mobile
cd mobile && npm start    # Expo Go preview

# Marketing site (apps/marketing — driiva.co.uk)
cd apps/marketing && npm run dev        # Vite dev
cd apps/marketing && npm run build      # production build
cd apps/marketing && npm run preview    # preview the build
```

Pre-commit hooks run secret scanning + lint. Don't bypass with `--no-verify`.

---

## Parallel Work - One Worktree Per Task

Multiple Claude/terminal windows often run against this repo at once. They **must not share the `~/Documents/DriivaMVP` checkout** - one window's uncommitted change or branch switch bleeds into another and gets swept into an unrelated commit/PR.

**Rule:** before starting any task in a shared checkout, move into an isolated worktree via the global `wt` helper (`~/bin/wt`):

```bash
DIR="$(wt new my-task)"   # creates .worktrees/my-task on branch task/my-task off main
cd "$DIR"                  # work, commit, and PR from here
wt list                    # see all worktrees
wt rm my-task --branch     # tear down when merged
```

`.worktrees/` is excluded locally (`.git/info/exclude`). Doppler resolves automatically in a fresh worktree. Only stage files you touched - never `git add -A` in a shared tree. Before switching windows, confirm the shared root's `git status` is clean.

---

## Code Style & Architecture

- **Bounded contexts:** `server/`, `client/`, `mobile/`, `functions/` each own their domain. Shared types live in `shared/` only — never reach across contexts.
- **Routing:** Wouter on web; React Navigation on mobile. Don't introduce Next.js App Router into this project — it's Express + Vite.
- **State:** React Query for server state. Local state via React hooks. No Redux.
- **Forms:** react-hook-form + zod for validation. Validate at the schema, not in handlers.
- **Errors:** Surface user-visible errors with Radix toast + structured log. Never silent-fail auth flows — that's how the 27s delay went undiagnosed.
- **Telemetry:** Don't add new analytics surfaces without confirming retention rules — insurtech regulatory sensitivity.
- **Testing:** vitest for unit; Playwright reserved for critical flows only (no full E2E suite yet).
- **Deps:** Dependabot active — review weekly. No major version bumps without testing.
- **Files:** Match existing typing conventions in the file being edited. UK spelling everywhere, including code comments.

---

## Design System (canonical)

- **Location:** `design-system/` at repo root. Authoritative for all brand + UI decisions.
- **Tokens:** `design-system/colors_and_type.css` — ink ladder `#050509→#222238`, brand gradient (amber `#d4850a` → burnt `#a04c2a` → violet `#6b3fa0` → indigo `#3b2d8b`), iris accent `#6366f1`, score-tier green/teal/amber/red at 80/70/50/<50.
- **Two visual modes — never mix:**
  - **Marketing mode** (driiva.co.uk) — glassmorphism, `rgba(30,41,59,0.60)` + `blur(20px) saturate(180%)`, animated gradient halos, pill CTAs.
  - **Instrument mode** (mobile + client SPA) — solid dark surfaces `#12111f` on `#0a0a14`, single accent `#5b4dc9`, 16px radius, tabular figures, 270° arc gauges. No glass except hero.
- **Type:** Inter Tight (display), Inter (UI), JetBrains Mono (eyebrows/tags). Sentence case everywhere. Headlines end in full stops. UK spelling. No emoji, no exclamation marks.
- **Voice:** Plain-English confident. Never em dashes, never double hyphens, single hyphens only where naturally compound (e.g. `user-facing`, `pre-raise`). Contractions in microcopy. Forbidden: "revolutionary", "game-changing", "your journey starts here", anything that sounds like a fintech TV ad.
- **Motion:** `--spring: cubic-bezier(0.34, 1.56, 0.64, 1)` for hover/press, `--ease-fast: cubic-bezier(0.22, 1, 0.36, 1)` for reveals. Respect `prefers-reduced-motion`.
- **Icons:** Lucide inline SVG, 24×24, `stroke-width 2`, `currentColor`. Never emoji.
- **Logos:** `design-system/assets/logo-wordmark-gradient.png` (primary), `logo-wordmark-white-v3.png` (dark backgrounds), `logo-ii-mark.png` (iconmark/favicon).
- **Tailwind:** v4 (migrated commit `e90290d`). Use CSS-first config, not `tailwind.config.js`.

---

## Secrets (canonical)

**Doppler is the single source of truth for secrets across all products** (driiva, strydeos, …). Workspace: "Driiva Stryde". Do NOT set secrets directly in Vercel / Firebase / GitHub Actions — set them in Doppler, let integrations sync downstream.

- **Project:** `driiva` — Configs: `dev`, `dev_personal`, `stg`, `prd`.
- **Downstream sinks:** Vercel (via Doppler integration), Firebase Functions (via `doppler secrets download --no-file --format json` at deploy), GitHub Actions (via Doppler service token).
- **Adding/rotating a secret:** set in Doppler prd → Doppler → Vercel sync propagates within ~30s → push a trivial commit to trigger rebuild, or `vercel redeploy`.
- **NEVER** `vercel env pull` **or** `doppler secrets download` **to disk for inspection** — audit via `scripts/audit-doppler-pollution.sh` (value-free: key name + length + pollution flag only). Never echo secret values to stdout/chat/logs.
- **Known pattern:** paste pollution leaves a literal 2-char `\n` escape at value ends, silently breaks Firebase Installations (400 INVALID_ARGUMENT), CORS matching, WebAuthn origin matching. Re-run `scripts/clean-doppler-pollution.sh driiva prd` if symptoms return.

---

## Known Blockers

1. **Firebase auth latency** - fast-path + timeout messaging + Firestore dedup landed (commits `21f3d3d`, `ae0cc22`, `a4c464b`). Original "~27s signup" was Doppler pollution causing Firebase Installations 400s on every init. Re-measure before treating as a blocker.
2. **CI pipeline failures** - Firebase org policy blocking SA key creation.
3. ~~WebAuthn UI - backend complete, frontend pending~~ **RESOLVED.** Frontend is fully wired (`BiometricAuth.tsx` in `signin.tsx`, `settings.tsx`, onboarding's `StepCelebration.tsx`) against the real `server/webauthn.ts` backend. This note was stale for a while before being caught 18 Aug.
4. **Waitlist** - exists but not actively driven to 1,000 target.
5. **Marketing site** - the live driiva.co.uk is now the `apps/marketing/` Vite SPA (Vercel), which **supersedes** the old Framer + `marketing-site/index.html` split-brain. Edit `apps/marketing/`; treat `marketing-site/` and Framer as legacy.
6. **Public GitHub repo** - `github.com/mrshippers/Driiva` is public. Reconcile against the "Private repos" rule below: either flip to private, or confirm no secrets have ever been committed + scrub history. Doppler now ensures future secrets don't land in git, but historical commits may need audit.
7. **Pool has no funding pipe** - the refund/distribution side of the community pool is real and running (`functions/src/scheduled/pool.ts`); the money-in side is a documented no-op (`server/lib/poolContribution.ts` logs on Stripe payment success, never credits `contributionCents`). Blocked on D6 (pool money model) - needs Jamal's call, not more code.
8. **No sandbox creds anywhere for Root or Damoov** - checked all three Doppler `driiva` configs (dev/stg/prd) directly, 18 Aug: `ROOT_API_KEY`/`ROOT_API_URL`/`ROOT_ENVIRONMENT`/`ROOT_PRODUCT_MODULE_KEY` and `DAMOOV_INSTANCE_ID`/`DAMOOV_INSTANCE_KEY` are absent everywhere, not even placeholders. Both integrations are fully coded but cannot execute for a single real user in any environment until credentials exist.
9. **Working branch** - current work happens on short-lived feature branches off `main`, PR'd and reviewed before merge (see the nightly build loop above). `main` is the live baseline; nothing sits stacked on old `rebuild/*` branches anymore, those are all merged.

---

## Raise Context

- **Target:** Q2–Q3 2026
- **Investor profile:** Angels + seed funds in insurtech OR Muslim/ethical finance
- **Key signal:** One broker/MGA letter of intent changes investor conversations
- **Channels post-raise:** Price comparison sites, IslamicFinanceGuru, Muslim community platforms
- **Exit thesis:** Aviva, Admiral, LV pay for distribution + clean telematics data

---

## Operator Ecosystem (sibling projects)

Driiva runs under Jamal's **Shippers** operator brand (GitHub/HF: `mrshippers`) alongside StrydeOS, TradeMind, and the shippers-tt operator dashboard. Shared conventions: Doppler "Driiva Stryde" workspace, UK English, no em dashes, ship-don't-ask. Each repo has its own CLAUDE.md.

| Project | Path | What it is |
|---|---|---|
| **Driiva** (this repo) | `~/Documents/Driiva` | Telematics insurtech for young UK drivers. |
| **StrydeOS** | `~/Documents/AI/strydeos` | Clinical performance SaaS for UK private physio. Flagship. |
| **TradeMind** | `~/Documents/AI/Shippers/TradeMind` | Mobile AI for UK electricians. Client deliverable. |
| **shippers-tt** | `~/Documents/AI/Shippers/shippers-tt` | Personal operator system that tracks all ventures. |


## Constraints

- Private repos — nothing public until explicitly ready
- Security-conscious: insurtech = regulatory sensitivity, audit everything
- ADHD-optimised workflow: reduce friction, eliminate initiation overhead
- Never ask "want me to draft that?" — produce deliverables inline immediately
- Anonymous monetisation preferred — no loud personal branding
- Raise timeline is real: every week of delay = raise pushed back
