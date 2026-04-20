# Driiva — Claude Code Configuration

## Project Context

Driiva Ltd is a telematics insurtech app targeting young UK drivers.
Core proposition: telematics-driven cashback premiums, postcode penalty reduction, fraud mitigation.
Sharia-compliant angle — targets young drivers and Muslim communities.
Solo founder build. Pre-raise. Demo-prep phase with Keith Cheng.

**Current priorities:**
- Keith Cheng demo prep
- Firebase auth delay fix (~27s signup — critical blocker)
- CI pipeline stabilisation
- PWA conversion consideration
- Q2–Q3 2026 raise (angels + seed, insurtech OR Muslim/ethical finance)
- Waitlist growth (1,000 signups = raise accelerant)

**The raise story:**
- 30,000 policies = ~£18M gross premium (£600 avg)
- £60M conservative valuation at 3-4x GWP multiple
- One broker/MGA letter of intent = investor gold
- Channel distribution over volume marketing post-raise

---

## Skill Router

The `skill-router` skill governs all dispatch in this project. On every task, check the skill
registry below and load the appropriate SKILL.md before responding. Never answer from general
knowledge when a purpose-built skill exists.

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

### Agent Orchestration (Ruflo)
| Skill | Trigger |
|---|---|
| `sparc-methodology` | Complex reasoning tasks, structured problem solving |
| `flow-nexus-neural` | Neural agent coordination |
| `flow-nexus-platform` | Platform-level agent orchestration |
| `flow-nexus-swarm` | Swarm-mode multi-agent execution |
| `swarm-advanced` | Advanced parallel agent workflows |
| `swarm-orchestration` | Coordinating multiple agents on one task |
| `stream-chain` | Chained agent pipelines |
| `pair-programming` | Structured pair-programming mode |
| `verification-quality` | Automated output quality checking |

### Memory & Reasoning (Ruflo)
| Skill | Trigger |
|---|---|
| `v3-memory-unification` | Cross-session memory, persistent context |
| `reasoningbank-agentdb` | Agent knowledge base, persistent agent memory |
| `reasoningbank-intelligence` | Intelligence layer for reasoning tasks |
| `agentdb-advanced` | Advanced agent database operations |
| `agentdb-learning` | Agent learning patterns |
| `agentdb-memory-patterns` | Memory pattern management |
| `agentdb-optimization` | Agent performance optimisation |
| `agentdb-vector-search` | Vector search across agent knowledge |

### Architecture & Code Quality (Ruflo v3)
| Skill | Trigger |
|---|---|
| `v3-core-implementation` | Core feature implementation, clean architecture |
| `v3-ddd-architecture` | Domain-driven design — use for Root API integration layer |
| `v3-cli-modernization` | CLI tooling |
| `v3-integration-deep` | Deep integration work — Root Platform API, telematics data |
| `v3-mcp-optimization` | MCP server optimisation |
| `v3-performance-optimization` | Performance profiling — auth speed, onboarding latency |
| `v3-security-overhaul` | Security audit — critical for insurtech regulatory compliance |
| `v3-swarm-coordination` | Swarm coordination at architecture level |

### GitHub & DevOps (Ruflo)
| Skill | Trigger |
|---|---|
| `github-code-review` | PR code review |
| `github-multi-repo` | Multi-repo operations |
| `github-project-management` | GitHub Projects, issues, milestones |
| `github-release-management` | Release tagging, changelogs |
| `github-workflow-automation` | GitHub Actions, CI/CD automation — fix pipeline failures |
| `hooks-automation` | Git hooks, pre-commit, pre-push |
| `monitoring` | Monitoring setup, alerting — critical for demo readiness |

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
| `pdf` | PDF creation — pitch deck export, term sheets |
| `pdf-reading` | Reading/extracting from PDFs |
| `pptx` | Investor pitch deck |
| `xlsx` | Financial models, policy projections, cap table |
| `file-reading` | Any uploaded file not yet in context |

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
| `mcp-builder` | Building MCP servers — Root API, telematics data pipeline |
| `skill-creator` | Creating or editing skills |
| `prompt-engineer` | System prompt design, AI feature prompting |
| `schedule` | Demo scheduling, raise timeline planning |
| `sonnet-opus-prompt` | Model-specific prompting strategies |

---

## Stack Reference

- **Frontend:** Next.js / TypeScript
- **Auth:** Firebase Auth (known issue: ~27s signup delay — fix before demo)
- **Database:** Firebase Firestore + Neon DB
- **ORM:** Drizzle ORM
- **Payments:** Stripe
- **Insurance Platform:** Root Insurance Platform API
- **Deploy:** Vercel + Cloudflare
- **PWA:** Under consideration
- **Auth Enhancement:** WebAuthn / Passkeys (backend done, UI pending)

## Design System (canonical)

- **Location:** `design-system/` at repo root. Authoritative for all brand + UI decisions.
- **Tokens:** `design-system/colors_and_type.css` — ink ladder `#050509→#222238`, brand gradient (amber `#d4850a` → burnt `#a04c2a` → violet `#6b3fa0` → indigo `#3b2d8b`), iris accent `#6366f1`, score-tier green/teal/amber/red at 80/70/50/<50.
- **Two visual modes — never mix:**
  - **Marketing mode** (driiva.co.uk) — glassmorphism, `rgba(30,41,59,0.60)` + `blur(20px) saturate(180%)`, animated gradient halos, pill CTAs.
  - **Instrument mode** (mobile + client SPA) — solid dark surfaces `#12111f` on `#0a0a14`, single accent `#5b4dc9`, 16px radius, tabular figures, 270° arc gauges. No glass except hero.
- **Type:** Inter Tight (display), Inter (UI), JetBrains Mono (eyebrows/tags). Sentence case everywhere. Headlines end in full stops. UK spelling. No emoji, no exclamation marks.
- **Voice:** Plain-English confident. Em dashes liberally. Contractions in microcopy. Forbidden: "revolutionary", "game-changing", "your journey starts here", anything that sounds like a fintech TV ad.
- **Motion:** `--spring: cubic-bezier(0.34, 1.56, 0.64, 1)` for hover/press, `--ease-fast: cubic-bezier(0.22, 1, 0.36, 1)` for reveals. Respect `prefers-reduced-motion`.
- **Icons:** Lucide inline SVG, 24×24, `stroke-width 2`, `currentColor`. Never emoji.
- **Logos:** `design-system/assets/logo-wordmark-gradient.png` (primary), `logo-wordmark-white-v3.png` (dark backgrounds), `logo-ii-mark.png` (iconmark/favicon).

## Secrets (canonical)

**Doppler is the single source of truth for secrets across all products** (driiva, strydeos, …). Workspace: "Driiva Stryde". Do NOT set secrets directly in Vercel / Firebase / GitHub Actions — set them in Doppler, let integrations sync downstream.

- **Project:** `driiva` — Configs: `dev`, `dev_personal`, `stg`, `prd`.
- **Downstream sinks:** Vercel (via Doppler integration), Firebase Functions (via `doppler secrets download --no-file --format json` at deploy), GitHub Actions (via Doppler service token).
- **Adding/rotating a secret:** set in Doppler prd → Doppler → Vercel sync propagates within ~30s → push a trivial commit to trigger rebuild, or `vercel redeploy`.
- **NEVER `vercel env pull` or `doppler secrets download` to disk for inspection** — audit via `scripts/audit-doppler-pollution.sh` (value-free: key name + length + pollution flag only). Never echo secret values to stdout/chat/logs.
- **Known pattern:** paste pollution leaves a literal 2-char `\n` escape at value ends, silently breaks Firebase Installations (400 INVALID_ARGUMENT), CORS matching, WebAuthn origin matching. Re-run `scripts/clean-doppler-pollution.sh driiva prd` if symptoms return.

## Known Blockers

1. **Firebase auth delay (~27s)** — critical, must fix before Keith demo. _(Partially addressed 2026-04-18: Doppler pollution in `VITE_FIREBASE_*` was causing Installations 400s on every init, likely a major contributor. Re-measure post-cleanup.)_
2. **CI pipeline failures** — Firebase org policy blocking SA key creation
3. **WebAuthn UI** — backend complete, frontend pending
4. **Waitlist** — exists but not actively driven to 1,000 target
5. **Marketing site split-brain** — live site is on Framer (no write API available to Claude). Canonical editorial source is `marketing-site/index.html`; changes must be mirrored into Framer by hand, or the live site migrated off Framer. See ROADMAP → "Marketing site sync".
6. **Public GitHub repo** — `github.com/mrshippers/Driiva` is public. Reconcile against CLAUDE.md "Private repos" rule: either flip to private, or confirm no secrets have ever been committed + scrub history. Doppler now ensures future secrets don't land in git, but historical commits may need audit.

## Raise Context

- **Target:** Q2–Q3 2026
- **Investor profile:** Angels + seed funds in insurtech OR Muslim/ethical finance
- **Key signal:** One broker/MGA letter of intent changes investor conversations
- **Channels post-raise:** Price comparison sites, IslamicFinanceGuru, Muslim community platforms
- **Exit thesis:** Aviva, Admiral, LV pay for distribution + clean telematics data

## Constraints

- Private repos — nothing public until explicitly ready
- Security-conscious: insurtech = regulatory sensitivity, audit everything
- ADHD-optimised workflow: reduce friction, eliminate initiation overhead
- Never ask "want me to draft that?" — produce deliverables inline immediately
- Anonymous monetisation preferred — no loud personal branding
- Raise timeline is real: every week of delay = raise pushed back
