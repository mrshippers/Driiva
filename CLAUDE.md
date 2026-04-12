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

## Known Blockers

1. **Firebase auth delay (~27s)** — critical, must fix before Keith demo
2. **CI pipeline failures** — Firebase org policy blocking SA key creation
3. **WebAuthn UI** — backend complete, frontend pending
4. **Waitlist** — exists but not actively driven to 1,000 target

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
