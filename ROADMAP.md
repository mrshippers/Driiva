# Driiva - Current sprint (tickets)

**Last updated:** 24 August 2026
**Product Lead:** Keith Cheng (onboarded 27 June 2026)
**External memory for AI sessions:** Work on the next unchecked ticket only; update this list when done.

---

## Sprint: "P0 Release Blockers" (June 2026 - Security + Integrity)

- [x] Close 3 critical security issues found by logic-gap harness (trust proxy, sanitise order, worker recovery) - *done: commit `d7339e0` + batch merge `81d7117` on 2026-06-26*
- [x] Make pricing server-authoritative; enforce +/-15% discount cap server-side - *done: `6853a80`*
- [x] Atomic trip persistence + duplicate rejection + price allow-list - *done: `d12b0ff`*
- [x] Serialise point flushes; atomic startTrip; canonical cancelTrip state machine - *done: `889c8ba`*
- [x] Gate onboarding completion on confirmed server write; add draft resume + consent integrity - *done: `9acbb60`*
- [x] Deterministic scoring output; worker auto-recovery; sanitise pipeline reordering - *done: `611717d`*
- [x] Wire ESLint + secret-safety check into CI; repair false-red - *done: `d7339e0`, `27e1700`*
- [x] Pin Node at root via `engines` + `.nvmrc`; drop deprecated `baseUrl` for TS 6 - *done: `fc83165`, `10ecce3`*
- [x] Remove dead duplicate-trap components; correct package name - *done: `f748d7c`*
- [x] Repaint onboarding to Driiva instrument palette; eliminate re-centre jump - *done: `8fe9e29`*
- [ ] Root Platform credentials - sandbox key needed from Root to activate insurance quote/bind/policy endpoints
- [x] Stripe end-to-end - webhook handlers, idempotency, and policy lifecycle state machine merged to main 18 Aug (`702256d`) - *done, but the pool-contribution seam it emits on is still log-only, see the Stripe wiring note below*
- [ ] Pool funding pipe - Stripe payment success never credits `contributionCents` (`server/lib/poolContribution.ts` is a documented no-op); the refund/distribution side of the pool is real, the money-in side is not. Blocked on D6 (pool money model).
- [x] WebAuthn UI - *done: `client/src/components/BiometricAuth.tsx` wired into `signin.tsx`, `settings.tsx` (full passkey list/add/remove), and onboarding's `StepCelebration.tsx`, all against the real `server/webauthn.ts` backend. This ticket and CLAUDE.md/CONTEXT.md's "backend complete, frontend pending" note were stale as of 18 Aug - the frontend has been live for a while, the docs just hadn't caught up.*
- [x] Phone pickup detection - *done: `feat/phone-usage-detection`, 18 Aug 2026 (M2-DEC-1 Option A). `computeTripMetrics` takes a client-reported pickup count (web: `visibilitychange` proxy; mobile: new `mobile/lib/phonePickup.ts` accelerometer heuristic), sanitised and rate-capped server-side (`sanitizePhonePickupCount`) before it can move a score - see `docs/rebuild/m2-dec-1-phone-usage.md`. Pipeline verified end-to-end (unit tests + a real Firestore-emulator integration test). The mobile accelerometer heuristic itself is UNVERIFIED ON A REAL DEVICE - thresholds are reasoned, not calibrated against real trip data. Correction, 24 Aug 2026 (`cd35366`): on mobile the detector was never called by any app code, so every trip submitted a pickup count of 0 and phone usage, 10% of the score, contributed a silent perfect 100 to every score Driiva had produced. The counter now lives beside the accelerometer in `driveMonitorInstance` rather than being owned by the Drive screen, and the monitor pulls from a source instead of waiting to be handed a number. Still unverified on a physical device - the simulator has no accelerometer, which is how a real zero there read as the right answer.*
- [ ] Decide on the `@google-cloud/storage` major bump. The 2026-08-17 sweep (`0386e00`) took 46 vulnerabilities to 16 and cleared all three criticals, but the 16 left all trace to that package through `retry-request` and `teeny-request` and only clear on a major, so they need a deliberate call rather than another routine `npm audit fix`

## Sprint: "Marketing + SEO" (May-June 2026)

- [x] Scaffold `apps/marketing/` Vite + React 18 Wouter SPA as the live driiva.co.uk surface - *done: `c2898c8`, supersedes `marketing-site/` and Framer split-brain*
- [x] Vercel project `driiva-marketing` rootDirectory set to `apps/marketing` - *done: `87dfa96`*
- [x] Swap Plausible analytics for Vercel Analytics - *done: `dae8f6b`*
- [x] WebGL shader hero background + glass nav - *done: `6cabd27`*
- [x] IndexNow key + sitemap lastmod + FAQPage schema + 1200x630 OG card - *done: `618f495`, `6066bdd`*
- [x] Doppler adopted as canonical secrets source; paste-pollution cleanup scripts added - *done: `16b4456`, `c89415e`*
- [x] 16-screen mobile onboarding shipped in `mobile/` (Expo SDK 52); PWA path superseded - *done: `7b1658c`*
- [x] Design system canonicalized at `design-system/`; hyperframes shipped; logos refreshed - *done: `37012a6`*

## Sprint: "Marketing polish" (August 2026 - driiva.co.uk)

- [x] Swap the hero's synthetic score-ring mockup for the real onboarding screenshot, and take the cofounder-approved FinalCTA copy verbatim - *done: `91bd4de`*
- [x] Fix the scroll lag a cofounder reported: cap the WebGL shader background at 1x DPR and stop its animation loop when the tab is backgrounded - *done: `2e76d3c`*
- [x] Drop the gradient-clip text treatment for legibility - 5 selectors moved to solid `--amber-2` (>9:1 on the dark surfaces); `--grad-brand` stays as a decorative background fill - *done: `76b27a4`, `f5b9b0a`*
- [x] Fix the waitlist, which was accepting signups into a void and saying yes. Both API routes imported `./lib/waitlist-core` with no file extension, which Node's ESM resolver rejects, so each function died at import and 500'd; then with credentials present both failed at init on `require is not defined`, the module being ESM on Vercel. In production the endpoint now refuses rather than pretending, and the count returns null rather than a hardcoded 117 when the store cannot be reached - *done: `4758c61`, `6efa5d3`, `efd6d46`, `ce62818`*
- [x] Build the waitlist confirmation email on the canonical shell. It was hand-rolled and arrived blank: the card was `rgba(30,41,59,0.6)` with no `bgcolor` attribute on either table, and Outlook reads only `bgcolor`, so what landed was an empty white rectangle. Rebuilt on `design-system/email-shell.html` - *done: `72c62da`, plus `d56767c` to pick up the Resend key*
- [x] Publish the driver survey and lighten the FCA drumbeat. Our own UX survey ran to 17 responses between 08/07/25 and 03/08/25 and then sat unread in SurveyMonkey for a year; the most interesting number in it is a zero, since not one respondent picked real-time tracking. Counts live in `src/data/survey.ts` with their provenance and percentages are computed at render. `/uk-survey` publishes the results rather than inviting people to a survey that had already closed. Three promotional FCA mentions removed (TrustRibbon badge, Security card, Comparison row); every protective mention kept - *done: `f5e22d1`, `621fb9d` moved the sample size out of the headline into a marked footnote*
- [x] Rebuild the hero and the background. Wordmark roughly doubled to a 240-400px clamp and the strapline brought down from a 74px cap to 40px so the two stop cancelling each other out; the phone and `PhoneFrame` removed, leaving one centred column; Instrument Sans actually loaded, having been named as the body face since the email shell was written and never shipped; Lenis retuned from 0.9/1.1 to 0.55/1.45; the background rebuilt as a single diagonal amber-to-purple axis with noise demoted to a perturbation, after the noise-driven nebula came out uniformly violet; Amicro reveals ported rather than installed, since its components want Motion and this site ships anime.js alone - *done: `2c90f97`, `9955783`, `002fd93`; contrast measured off the composed frame behind five regions, worst 6.4x against a 4.5x floor, 14 tests and 8 of 8 fabrication laws green*
- [ ] Bring the phone frame back when there is a real app capture to put in it. It was removed rather than updated because no current render exists in the repo and inventing an app screen is not an option - *raised by `002fd93`*

## Sprint: "Premium lift" (August 2026 - waves H to M, `docs/premium-lift/`)

Integrated on `premium-lift/main` and merged to `main` on 10 August. Full record in `docs/premium-lift/progress.md`; only the ticket state lives here.

- [x] Wave H, insurance and payment honesty: a cleared card is not cover and a signup is not a policy; zeros dressed as metrics, a refund that cannot be paid, and a seed one typo from production - *done: `878cc84`, `f673600`*
- [x] Regulatory copy corrected to "working towards the FCA sandbox", not "pending authorisation" - *done: `aaaec97`*
- [x] Drivers start at 70 and the first trip moves the score either way - *done: `bf0f565`*
- [x] Wave I, brand: real app icon in place of the Expo template, body type off Tailwind defaults onto the ladder, Amicro and checklist.design actually applied, and the 404 that asked drivers about the router - *done: `17280f5`, `52036b8`, `2dfeeb8`, `a0594bd`*
- [x] Fix the iOS cold-launch crash: a non-worklet function called on the UI runtime aborted the process, which also explained the dashboard reading zeros - *done: `97d8150`, `9acad43`, `486aaf7`, `b852676`*
- [x] First on-device captures of the mobile app, dashboard included - *done: `58ba33e`, `bd388f3`, `01987d6`*
- [x] EAS build config added now the iOS app is registered in Firebase - *done: `175baea`*
- [x] Get the first iOS build through EAS and onto TestFlight. Three things had to be fixed before a build could even start, none of which had been caught because the EAS build history for `@mrshippers/driiva` was empty. `app.json` is static JSON and never expands environment variables, so `"$GOOGLE_SERVICES_PLIST"` was handed to the config plugins verbatim as a filename and entitlement introspection died on ENOENT before credentials were considered; `app.config.js` now resolves it from the builder environment and falls back to the local gitignored plist. The `ascAppId` placeholder was replaced with the real App Store Connect record (6804415109), with `com.driiva.app` registered as an App ID under team `5DYUDAB2Y3`. Prebuild then died because `with-firebase-configure` required an `import FirebaseCore` that its stated upstream no longer adds on SDK 54, so the plugin inserts the import itself and no longer depends on plugin ordering; verified with a local `expo prebuild --clean --platform ios` at exit 0. Signing pinned to local credentials, and an App Store Connect App Manager API key wired into the production submit profile so `eas submit` runs non-interactively with no Apple login. Build 4 uploaded - *done: `6801653`, `e092c89`, `53d7d51`*
- [ ] Back up `mobile/credentials/AuthKey_98J3NXKPRN.p8`. Apple allows the key to be downloaded once only, so the gitignored file in the working tree is the sole copy and wiping the tree loses non-interactive submits - *raised by `53d7d51`*
- [x] QA gate: accessibility 80 serious/critical down to 0, banned copy removed, /rewards and /achievements reconciled - *done: `3a72b86`, `6437d4c`, `67c7c3b`*
- [x] Wave K: integration suite green, and "nothing here" separated from "we do not know what is here" - *done: `ee0ca45`, `e7fd6c8`*
- [x] Wave L: the design laws now reach the real product through a seeded emulator sign-in rather than demo mode, and say so when they do not - *done: `dd182ad`*
- [x] Fabrication laws read stylesheets, not just components - the invented waitlist count was reaching the screen a third way, printed straight out of a CSS `content` declaration - *done: `e051e17`*
- [x] Marketing redesign: canonical Driiva wash rendered rather than approximated (mean absolute error 53.5 to 34.0 per channel), living background, real type hierarchy, drawn wordmark in nav, sentence case, FAQ two-column - *done: `32f8c9d`, `3d065d2`, `7661e6b`, `0742e04`, `2c3b654`, `410143d`*
- [x] Marketing accessibility: email error state clears on edit, `aria-invalid` and `aria-describedby` wired, skip link added, one focus ring defined that survives both ends of the wash - *done: `ad097c8`*
- [x] Rendered-behaviour pass on `apps/marketing`, recorded as its own document - *done: `b5a2cfe`, `7f1ca28`*
- [x] `npm run gates`, a one-command runner for the visual gates - *done: `e9dc8d9`*
- [x] The 404 no longer stamps itself with a revision date - *done: `222a5cd`*
- [x] `npm run gates` no longer reports INCOMPLETE - it reaches every route and now reports real violations instead. Sign-in was being refused by our own Content-Security-Policy: `connect-src 'self'` against a page on `localhost:5202` and an Auth emulator on `127.0.0.1:9098`, which Firebase surfaces as `auth/network-request-failed`, indistinguishable from a real network fault. That is why extensions, ports and env files each looked like the answer and none of them were. Coverage went from 1 of 5 design-law routes and 7 of 14 axe routes to 5 of 5 and 14 of 14. The ticket stayed open because a run was still not green, but on findings rather than on reach - *advanced by `316781c`, `299b131`, `69b41cf`, and the CSP fix. Closed `nightly/2026-09-04`: Chrome was actually up on :9222 in the unattended clone tonight, so the browser gate ran for real instead of being assumed blocked. It found two live findings neither prior source-level pin had caught - a fourth dashboard string plus two new ones on text-xs (13px) against the 15px body floor (the AI tip body, the empty-pool note, the refund banner), and a second, different locked-card contrast bug on `/rewards`: the Achievements grid's own `GlassCard` (not `RewardsTimeline`, already fixed 2 Sep) put `opacity-50` on the whole card, the same ancestor-alpha-multiplies-descendant bug in a place the earlier fix never reached. Both fixed at source and re-verified with a second full `npm run gates` run: DESIGN LAWS all green on 5/5 routes, AXE 0 serious/critical across 14/14 routes.*
- [x] Dashboard breaks three design laws, invisible until the gate could reach it: capsule radii on five painted oblongs (the indigo badge and both progress bars), body copy at 13px against a 15px floor on three strings plus "Trust Centre" at 11px against a 13px floor, and five non-tabular numeric readouts
- [x] Leaderboard breaks the tabular-figures law on its five SVG chart axis labels (0, 7, 14, 21, 28) - *done: `3660011`. The chart is `PoolPanel`'s pool-history line (imported into `/leaderboard`); `tick={{ className: 'tabular' }}` on XAxis/YAxis reads as correct and does nothing, because recharts' CartesianAxis discards a plain-object tick's className. Fixed with a custom tick function, which recharts merges instead. `npm run gates` still not run - see the parent ticket below.*
- [x] Rewards has five SERIOUS axe colour-contrast nodes, all of them the `opacity-50` locked reward cards - the dimming that signals "locked" is what takes the text under threshold - *done at source: `nightly/2026-09-02`. `RewardNode` put `opacity-40` on the whole card, which multiplies every descendant's alpha rather than sitting beside it - the overlay's own "days to go" label ended up the most-dimmed text on the page. Card opacity removed; the blur overlay and lock icon carry the "locked" signal alone now. Held by `tests/unit/rewards-locked-card-contrast.test.ts`: the real WCAG contrast formula run against the app's own `--app-bg`/`--app-surface-1` tokens proves the old compounded composition read 2.06:1 (fails the 4.5:1 AA floor) and the fixed one reads 7.16:1, plus a source pin against the class re-appearing. The browser gate itself still cannot run unattended, so the parent gates ticket stays open
- [x] Browser Sentry reports never leave the page. `connect-src` has no `https://*.ingest.sentry.io`, in production as well as dev, so every envelope POST is refused by CSP. Observed as a live `securitypolicyviolation` while debugging the gate. "Complete Sentry wiring" is ticked in the Observation Mode sprint and the client half of it has never delivered an event - *done: `b6fe697` (25 Aug), found stale while working the next line down tonight. `connect-src` now carries both Sentry ingest regions, including the DE region the live DSN actually uses, in every environment. Verified 89/89 files, 1112 passing at the time. This checkbox was never ticked when the fix landed - noted here so the next pass does not re-open it.*
- [x] Reduced-motion CSS path unverified: the `.reveal-init` override inside the media query catches every element the JS never reaches, and reading says it resolves, but no browser has confirmed it. jsdom applies no stylesheet so a test there would manufacture a bug. Chrome on 9222 was down for the whole follow-up attempt - *raised by `7f1ca28`; closed by `74b94ee`. Chrome on 9222 is up again, so `tests/marketing-reduced-motion.mjs` measures instead of reading: 38 untouched reveals on `/` compute opacity 1 under the emulated preference and opacity 0 without it, so the override does real work. Repeatable as `npm run motion:reduced`, with `motion:reduced:plant` to prove it can still go red. The JS path had reached none of the 38 at load, which is why the CSS half carries the page rather than backing it up.*
- [x] Extract the shared hook behind the two near-identical marketing email forms. They have drifted before and now carry the same four changes twice - *done: `3d40acc`, `useWaitlistForm` owns state, validation, submit, analytics tagging and button copy; Hero 258 lines to 163, FinalCTA 132 to 37; FinalCTA gained the three tests extraction put at risk*
- [x] Merge `task/premium-k-dashboard` (`6a01ea7`): 270 degree score gauge on web to match mobile, glass off the app surfaces (`dashboard-glass-card` renamed to `.instrument-card`, 22 glass rule blocks deleted), sentence case headings, and thirteen hand-rolled spinners collapsed onto `ArcTracer` - *done: merged to `main` in `7be1f67`, `1bbb04e`; twenty Lucide icon spinners deliberately left as a separate idiom*
- [x] Gate runner refuses to run when the dev port is already taken. `wait_for()` only checked that something answers, so another worktree's dev server got audited under this branch's name for six hours - an lsof check now turns that silent wrong answer into a loud refusal naming `GATE_PORT` as the escape hatch - *done: `ad6c16b`*
- [x] Put mobile type on the ladder and make the law reach it: 108 hardcoded `fontSize` values across `mobile/app` and `mobile/components` in 16 distinct sizes, now zero. The law had been scoped to `mobile/components/ui`, which is exactly how 108 off-ladder sizes survived a law named after them; it now covers all of `mobile/` with only the theme allowed to state a number - *done: `8fd2e21`, mobile tsc clean, 674 passing, 8 of 8 laws green against a planted violation*

## Sprint: "Fable day" (24 August 2026 - mobile, `feat/fable-day`)

Three waves merged through `feat/fable-algo` and `feat/fable-trip` into `feat/fable-day` and on to main (`5c12303`). Mobile only, plus the two server-side fixes that had been stopping any trip from ever being scored.

- [x] Rebuild Drive as an instrument rather than a record button. Jamal rejected the previous screen as a Wii button; the deeper problem was that a big record control teaches the driver Driiva only works if they remember to press something, which is the opposite of the headline claim, so the control is gone rather than restyled. Armed is a live dot and a plain sentence; driving is speed as the anchor inside a breathing 270 degree arc that encodes no value and exists so "this is working" is legible from a mounted phone; ending is a press and hold because it closes the trace and a phone in a mount gets brushed - *done: `d0732e9`, `05de6c5`, `418e76b`*
- [x] Arm detection for the session, not the screen. `components/DriveDetectionHost` mounts once from the tabs layout, so a driver can sit on Home or pocket the phone and still have the drive noticed - *done: `3dd72be`*
- [x] A drive must end even when the fixes stop arriving. `distanceInterval` meant a parked car stopped producing fixes, so the state machine never received the stationary samples it reasons from and the trip stayed open at speed; both watches now use `kCLDistanceFilterNone`, the stationary clock runs from the last time anything actually MOVED, and `tick(now)` advances wall-clock time without a sample - it invents no speed, guesses no position, and can only ever end a drive - *done: `dd2a96a`, `15b2549`, `5ec52a6`*
- [x] Elapsed is measured from the drive, not from the screen, and an automatic trip is timed from when the driver set off rather than from when detection became sure twenty seconds later - *done: `5ec52a6`*
- [x] Declare `AutomotiveNavigation` and `pausesUpdatesAutomatically: false` on the background task, and stop conflating "no fix" with "no speed" - three states are now distinguished, including a real stationary zero. Honest caveat recorded in the commit: auto-pause was never actually observed, the trip that prompted the change had been orphaned by a Metro reload - *done: `dad3b55`*
- [x] One drive is one trip, even when a tap races a queued fix. `startManually` now runs on the same promise chain as every fix and `open()` sets a synchronous flag for the length of the await, because ordering the work does not close the gap inside it - *done: `48803af`*
- [x] `closeTrip` invents neither an end position nor a duration. A trip with no accepted fix was writing 0,0, a real coordinate in the Gulf of Guinea the server could not tell from a genuine ending; it is discarded as cancelled now. A failed flush no longer reports duration 0 beside a real distance - *done: `f79c263`*
- [x] Do not claim to be watching when capture cannot run, and do not strand an open trip. A driver who granted WhenInUse but not Always saw "Watching for your next drive" over a phone that would notice nothing once locked; and `stopWatchingForDrives` cleared the heartbeat with a trip open, keeping the battery cost and throwing away the only mechanism that ends a drive. Two orphans of that shape were cleaned out of Firestore by hand during the simulator proof - *done: `2ae8a00`*
- [x] Unblock trip submission end to end. `submitTripForScoring` batched an update to `trips/{id}` with one to `tripPoints/{id}`, which `firestore.rules` denies outright, so the whole batch failed and every trip stranded; the web twin of the same bug is fixed too. First trip proved on the iOS simulator with a native dev build against real Firebase - *done: `9526f1c`, `ef1fb63`*
- [x] Vendor `@driiva/contracts` into the functions bundle. `functions/src` had imported it since `db3dcd8` with no dependency declared, so every deploy since then failed source analysis with MODULE_NOT_FOUND and prod kept running the 5 Jul build - the scorer never saw the phone-usage weight or the refund cap, and a submitted trip sat in processing forever - *done: `6950127`*
- [x] Prove the 15% refund cap by property test, and hold onboarding's estimate to it. Four defects fast-check found that the example tests could not, including a cap that rounded a limit upward, plus two screens that widened an already-capped figure by hand with `refund * 1.2` - *done: `7d11cc0`, `c32f0a3`, `8eb389b`*
- [x] One money formatter, cents in and pounds at render, with `MONEY_PLACEHOLDER` no longer a literal "£0.00" that rendered every absent amount as a calculated zero - *done: `5cd76b2`, `a738b55`, `cb96a16`*
- [x] `totalMiles` is miles, not miles times one hundred - the schema had quoted a wrong comment and would have rejected real data - *done: `bbd73d0`*
- [x] Home, Trips, trip detail and You rebuilt as instruments: Home reads the last scored trip date instead of naming the screen the driver is looking at, trip rows answer the finger and the skeleton stops pulsing at people who asked it not to, the trip detail draws the real recorded GPS trace with event marks read from the same single pass the counts come from, and You carries each row's state instead of making the driver tap to find out - *done: `86563b1`, `fef920b`, `54d956e`, `cb96a16`, `8ef2489`, `29eb329`*
- [x] Community supersedes Friends and Rewards leaves the tab bar; the rewards route stays registered with `href: null` so the achievement push notification still lands somewhere - *done: `0fb1817`*
- [x] Motion primitives with the reduced-motion guard in a module the root suite can actually test, and onboarding validation at the boundary (age and postcode coerced once), with the demo deltas given one source and a drift test - *done: `cf1d634`, `de6ff2f`, `e45c2e3`*
- [x] The Expo Go preview reaches the app it is previewing again: native module imports are lazy the way `lib/firebase.ts` already loads its own, and Metro resolves from a worktree - *done: `7f458fc`, `5e42eac`*
- [x] Every screen aligned to the Instrument Glass type ramp and judged against the review bar, including a projected refund range that had been painted in the score green that says "you drove well" - *done: `60c97ab`, `a40173e`*
- [x] Account creation fixed: the client user-doc write the rules denied whether or not the trigger's doc had landed, so signup threw after the Auth user already existed - *done: `2fdaea8`*
- [x] Metro only watches directories that exist, so the EAS bundle step survives. Build 6 failed in Bundle JavaScript while the same export succeeded locally, because the worktree-aware config derived paths from a repo-root `node_modules` the EAS builder does not have - *done: `5c12303`*
- [ ] Prove automatic drive detection on a physical device. Everything so far is the iOS simulator, which has no accelerometer, so the phone-pickup count is exactly the input the simulator cannot verify - *raised by `cd35366`, `9526f1c`*
- [x] Accelerometer duty cycle (review finding 7). Both listeners now go up when a drive is in prospect and down again when it is not, rather than running from arming to disarming at 5 Hz all day for two jobs that only exist once a candidate appears. Gating the gait check alone would have bought nothing, since expo-sensors shares one native sensor at the shortest requested interval and the pickup detector was holding it open regardless. `needsMotionSensing` counts an OPEN TRIP as well as a detector out of idle, because a manual trip bypasses detection and sits at 'idle' for its whole length - gating on state alone would have handed manual trips the fabricated pickup zero `cd35366` had just killed - *done: `4af6b81`*
- [x] Resume threshold labelling mismatch (review finding 8). Resuming from PAUSED needed 4.5 m/s while the stationary clock cleared at 1.0 m/s, so between the two the car was moving, was not accumulating toward the end of the trip, and the screen still said "Stopped. Still recording." One threshold answers both questions now: `PAUSE_SPEED_MPS` is renamed `MOVING_SPEED_MPS` and resumes the drive as well as clearing the clock, because both ask whether the vehicle is moving. `START_SPEED_MPS` is left out of it - that is the once-only, lean-toward-refusing decision about whether a journey is a drive at all, and it has already been made by the time anything can pause. No hysteresis band was added because `PAUSE_HOLD_MS` already is one: resuming is immediate, pausing again costs a full minute of no movement, so a junction cannot flap the state more than once a minute - *done: `d58885d`*

## Sprint: "Damoov & Feedback" (Week 0 - Telematics + Compliance)

- [x] Damoov telematics integration (server-side: user registration on signup, daily sync Cloud Function) - *done: `functions/src/lib/damoov.ts` API client; `onUserCreate` trigger stores deviceToken; `syncDamoovTrips` scheduled function at 00:30 UK daily with maxInstances:10*
- [x] Feedback collection system (Settings → FeedbackModal → Firestore) - *done: star rating + freetext widget in settings; writes to `feedback/{autoId}`; admin dashboard at `/admin/feedback`*
- [x] GDPR-compliant privacy/terms for telematics data - *done: Damoov named as Article 28 data processor; telematics consent clause; rewards framing (FCA-clean)*
- [x] Firestore security rules for feedback + systemLogs - *done: authenticated create on feedback; admin SDK only on systemLogs*
- [ ] XGBoost risk model wired to drivingProfile scores (next sprint)
- [ ] Community pool calculation using aggregated drivingProfile data
- [ ] Rewards eligibility logic (Tesco/Halfords/Nectar thresholds based on overallSafetyScore)

## Sprint: "Make It Real" (Week 1–2)

*If you've already done keys, Firebase login, deploy, or Root contact, check those off.*

- [ ] Create Anthropic account and set API key as Firebase secret
- [ ] Run `firebase login` and authenticate
- [ ] Deploy Cloud Functions (`firebase deploy --only functions`)
- [ ] Deploy Firestore rules and indexes
- [ ] Contact Root Platform for sandbox credentials
- [x] Fix CORS (restrict to driiva.com) - *done: server uses `CORS_ORIGINS` env, no wildcard; set to driiva.com in prod*
- [x] Add password reset flow - *done: /forgot-password page + "Forgot password?" link in signin + route registered in App.tsx*
- [ ] Test full flow: signup → onboarding → record trip → see score → see AI insights

## Sprint: "Make It Safe" (Week 3–4)

- [x] Set up Sentry for error monitoring (frontend + Cloud Functions) - *done: client/src/lib/sentry.ts + functions/src/lib/sentry.ts; SentryErrorBoundary in main.tsx; wrapFunction/wrapTrigger helpers*
- [x] Add Content Security Policy headers - *done: added to server/middleware/security.ts securityHeaders; 'unsafe-inline' for style-src documented (required by Tailwind/Leaflet)*
- [x] Set up GitHub Actions CI/CD pipeline - *done: .github/workflows/ci.yml; jobs: lint-and-typecheck, build (client+server), functions-build, test; triggers on push/PR to main*
- [x] Write first batch of tests (auth flow, scoring algorithm, trip processing) - *done: 197 tests passing across 12 files; covers auth-flow, scoring, trip-metrics, insurance, feature-flags, GDPR, AI analysis, leaderboard, pool scheduling, trip triggers, policy triggers, server API routes*
- [x] Set up staging Firebase project - *done: `driiva-staging` project provisioned; `.env.staging` configured; `.firebaserc` alias set; `build:staging`/`dev:staging` scripts added; `deploy-staging` CI job wired; Firestore rules + indexes deployed; `functions/.env.driiva-staging` created for CF staging overrides. Remaining manual steps: upgrade to Blaze plan → deploy functions; set FIREBASE_TOKEN + VERCEL_* GitHub Secrets; create Neon staging branch; create Vercel staging project.*
- [x] Add Firebase Analytics initialisation - *done: getAnalytics() in client/src/lib/firebase.ts; guarded by VITE_FIREBASE_MEASUREMENT_ID; try/catch for ad-blocker safety*
- [x] Implement email verification - *done: sendEmailVerification() in signup.tsx; emailVerified field on User type in AuthContext; ProtectedRoute hard-redirects unverified users to /verify-email (skipEmailVerificationCheck=true on /quick-onboarding and /verify-email routes); verify-email.tsx page with resend + check flow*
- [x] Backend & database security audit - *done: 12 issues found and fixed across Firestore rules, PostgreSQL, Cloud Functions, and API routes. See DRIIVA_CHANGELOG.md for full details.*

## Sprint: "Make It Payable" (Week 5–6)

- [ ] Build Stripe checkout for premium payments
- [x] Build Stripe webhook handlers (payment success, subscription changes) - *done on `rebuild/m4-payments`, merged to main 18 Aug (`702256d`): idempotent `stripe_events` table, real handlers for `payment_failed`/`subscription.deleted`/`checkout.session.completed`, policy lifecycle state machine with an audit-log trail on every transition, real premium/coverage/expiration bound from the actual Stripe invoice+subscription instead of hardcoded placeholders - `226233c`, `1cb66ef`, `1a0b2a6`, `58668a8`, `cb6bae7`*
- [ ] Wire premium payments to community pool contributions - *emit seam landed (`ba1326d`): `handleStripePaymentSucceeded` now emits a `PoolContributionEvent` carrying the Stripe event id, but M3's pool ledger consumer doesn't exist yet (blocked on D6), so it only logs today*
- [ ] Test Root Platform quote → accept → policy flow end-to-end - *RootAdapter interface seam landed (`ba1326d`): typed interface + `RootHttpAdapter` wrapping the existing HTTP calls, still unverified pending Root sandbox creds*
- [ ] Add premium amount display on policy page
- [ ] Set `ENCRYPTION_KEY` env var in production (required - server now refuses to store telematics data without it)

## Sprint: "Make It Polished" (Week 7–8)

- [x] Add push notifications (trip complete, score update, payment due) - *done: FCM init in firebase.ts, firebase-messaging-sw.js service worker, usePushNotifications hook, Cloud Function triggers on trip complete + achievement unlock, sendWeeklySummary scheduled function (Mondays 9AM UK)*
- [ ] Build service worker for offline/PWA support
- [x] Fix dashboard map - was hardcoded to London; now requests device GPS on load, handles permission denied and GPS unavailable states gracefully
- [x] Wire up profile page to real data - *done: Member since reads from Firestore createdAt; policyNumber never hardcoded; displayName falls back to fullName field; memberSince added to DashboardData*
- [x] Tier 3 animation polish (Revolut-level) - *done: ScoreRing radial gauge replaces flat bar; dashboard cards use container/item stagger variants; BottomNav has whileTap spring scale + layoutId sliding indicator; trip cards have whileHover lift; onboarding steps use scaleIn with elastic easing*
- [x] Implement trip route visualisation on map (show the actual driven path, not just current position) - *done: TripRouteMap component with Polyline + start/end markers; TripDetail page at /trips/:tripId; trip cards clickable in trips list*
- [x] AI Driving Coach feedback widget - *done: AIFeedbackWidget component with round-robin engagement comments, Perplexity API integration (8s timeout, 1 retry, silent fallback), Firebase ai_feedback_events logging, glassmorphic UI with pulsing AI orb; wired into trip-detail page*
- [x] Rewards Programme redesign - *done: 5-tier RewardsTimeline component (#Day5 Tesco £5, #Day10 RAC trial, #TeamDriiva Halfords £10, #Month3 500 Nectar pts, #Anniversary Amazon £25); vertical mobile / horizontal desktop; lock/unlock/claimed states; FCA-compliant framing; Web Share API; wired into rewards page*
- [x] Card/Default unification - *done: GlassCard component now uses dashboard-glass-card spec; unified bg/border/radius/padding/shadow across all card instances*
- [x] Phone usage detection for scoring - *done: see the "Phone pickup detection" ticket above and `docs/rebuild/m2-dec-1-phone-usage.md`.*
- [x] Build achievements backend - *done: 8 achievement definitions in functions/src/utils/achievements.ts; checkAndUnlockAchievements called after trip completion; Firestore collections (achievements/{id}, users/{uid}/achievements/{achId}); seedAchievements admin callable; frontend wired to real data*
- [x] Weather API integration - *done: Open-Meteo archive API in functions/src/utils/weather.ts; maps WMO codes to clear/cloudy/rain/snow/fog/storm; 3s timeout + graceful null fallback; wired into both trip triggers in trips.ts*

## Remaining features not yet in any sprint

These are known gaps that don't have tickets yet:

- [x] **Weather API** - *done: Open-Meteo archive API (free, no key). `functions/src/utils/weather.ts` fetches WMO weather codes and maps to clear/cloudy/rain/snow/fog/storm. Wired into trip processing triggers. 3s timeout, graceful fallback to null.*
- [ ] **Root Platform credentials** - scaffolded but not wired. Needs sandbox creds from Root to test quote → bind → policy flow. Once wired, the `/api/insurance` endpoints become live.
- [x] **Stripe wiring** - webhook handlers, idempotency, and the policy lifecycle state machine merged to main 18 Aug (`702256d`). Pool-contribution emit seam landed but has no consumer yet (blocked on M3/D6).
- [x] **Profile page real data** - *done: profile.tsx reads from useDashboardData hook; edit mode for name/phone/vehicle writes to Firestore via updateDoc; loading skeletons on every section; error state with retry*
- [x] **Trip route visualisation** - TripRouteMap component + TripDetail page wired.
- [x] **Phone pickup detection** - *done: see the "Phone pickup detection" ticket above and `docs/rebuild/m2-dec-1-phone-usage.md`.*
- [x] **Mobile background trip capture** - *done, merged 18 Aug: `expo-task-manager` + `Location.startLocationUpdatesAsync` feed the same `TripPointWriter` the foreground watch already uses, gated behind an explicit in-app ask for "Always" location before the OS prompt appears. `tsc` clean, `expo config` parses, pure buffering logic unit tested (`tests/unit/mobile-background-location.test.ts`). UNVERIFIED: all real background execution on a physical device - no device or simulator available in the authoring environment. Existing installed binaries need a fresh native (EAS) build before this JS can run at all.*
- [x] **Push notifications** - FCM wired end-to-end: trip complete, achievement unlock, weekly summary.
- [x] **Leaderboard rank recalculation** - Firestore scheduled function now filters weekly/monthly by lastTripAt period bounds and uses dense ranking for tied scores. PG table remains stale (not primary).
- [x] GDPR data export - implemented GET /api/gdpr/export/:userId; returns JSON of all user data
- [x] GDPR data delete - implemented DELETE /api/gdpr/delete/:userId; strictly rate-limited
- [x] **Achievements backend** - 8 definitions, unlock logic in Cloud Functions, frontend wired to real Firestore data.
- [x] **WebAuthn/Passkey login** - *done, see the ticket above. This line was stale.*
- [ ] **Staging environment** - `driiva-staging` project provisioned; manual steps remain (Blaze plan, deploy functions, Vercel staging). Recommended before any production payments go live.
- [ ] **Marketing site sync** - live site runs on Framer (no automation API); local `marketing-site/index.html` is the canonical source for editorial hero + waitlist copy. Decide path: (a) manually paste CSS changes into Framer code overrides, (b) migrate the live site off Framer to Vercel (the `marketing-site/` build is deployable as-is), or (c) keep Framer for visual, and serve `/early-access` from the Next app. Current blocker: Framer has no write MCP/API available in this session.
- [x] **Design system canonicalized** - `design-system/` at repo root now holds `colors_and_type.css` (ink ladder, brand gradient, glass, radii, shadows, motion, type stack), `README.md` (voice/tone/visual rules), `source/` (Figma rules + Instrument philosophy), `assets/` (14 brand PNGs). Marketing site + client DriivaLogo component switched to canonical v3 white wordmark. Mobile app theme already aligned to canonical "instrument" mode. Follow-up: rename client Vite CSS variables to match canonical token names.
- [x] **Client SPA token alignment** - *done: `nightly/2026-09-06`. The canonical block had been in `client/src/index.css` since `c1e5ff4` and the `--color-*` names this ticket was written against were already gone; what remained was a compatibility-alias block of thirty legacy names (`--success-green`, `--primary-blue`, `--ease-smooth`, `--neutral-100` and friends), each a pure `var()` indirection to a canonical token, with 24 rules in the same file still written against them. The aliases are deleted and every rule speaks the canonical name. Computed values are unchanged by construction, since each alias resolved to exactly the token that replaced it. `--accent` stays because Tailwind's accent colour in `tailwind.config.ts` reads it, and `--radius-card` and `--radius-button` stay as semantic role tokens. `tailwind.config.ts` itself needed no change; it never used a legacy name. Held by `tests/unit/web-token-aliases.test.ts`: no legacy name declared or referenced anywhere in `client/src`, and every `var(--x)` the client reads resolves to a property it declares. That second check found two never-declared shadcn `--sidebar-*` tokens in the unused sidebar primitive; they are recorded as the known pre-existing exception rather than fixed under this ticket.*

## Sprint: "Code Quality & UX Fixes" (Week 9–10)

- [x] Split quick-onboarding.tsx into 12 step components - *done: 1261 → 390 lines; 12 components in `client/src/pages/onboarding/steps/`*
- [x] Add leaderboard in-memory cache (60s TTL) - *done: deduplicates Neon reads; auto-invalidates on score update*
- [x] Implement `/api/auth/firebase` endpoint - *done: was returning 501; now verifies Firebase ID tokens*
- [x] Fix PR template (Next.js → Vite/React) - *done: corrected checklist, env prefix, image optimisation references*
- [x] Add coverage thresholds to vitest - *done: baseline 4/2/7/4%; CI will catch regressions*
- [x] Sign-in integration tests (15 tests) - *done: form validation, auth flows, username resolution, error handling*
- [x] Trip-recording integration tests (37 tests) - *done: full lifecycle, demo mode, error states*
- [x] Fix notification bell button on dashboard - *done: was dead button; now opens dropdown with mutual exclusion*
- [x] Premium mobile UX polish - *done: haptics, pull-to-refresh, shimmer skeletons, swipe cards, animated numbers*
- [x] Fix auth performance (10-20s delay) - *done: localStorage cache, hard timeout, splash screen*
- [x] Un-red CI on `main`. `mobile/tsconfig.json` extended `expo/tsconfig.base`, which resolves through `mobile/node_modules`, and CI installs at the root and in `functions/` only; the root suite imports four mobile modules on purpose, so vite found that tsconfig, could not resolve the extends, and killed five test files before a single assertion ran. Tests, Lint and E2E had been red on main because of it, so no PR could go green. Expo's base is inlined with a guard test that fails on a planted violation, and the Tests job now installs `functions/` deps too since the root suite imports `firebase-functions` at module scope - *done: `efafe39`; verified with `mobile/node_modules` absent, 5 failed / 57 passed before, 63 passed (676 tests) after*
- [ ] Split `server/routes.ts` into domain-specific route modules
- [ ] Add OpenAPI documentation for Express API
- [x] Set up structured logging with Sentry breadcrumbs - *done: `functions/src/lib/sentry.ts` gained `addBreadcrumb`, called automatically from `wrapFunction`/`wrapTrigger` before every handler invocation. @sentry/node adds no console/fetch/nav breadcrumbs on its own the way the browser SDK does, so every Cloud Functions error had arrived with no trail; now every captured event carries which function/trigger ran (plus the caller's uid on `wrapFunction`) leading up to it.*
- [ ] Add pre-commit hooks (lint + type-check)

## Sprint: "Observation Mode" (Live Monitoring)

- [x] Complete Sentry wiring - wrapFunction/wrapTrigger on all Cloud Functions; setSentryUser in AuthContext
- [x] Add Firebase Performance Monitoring - client SDK + custom trace utility (`performanceTraces.ts`)
- [x] Add structured metrics logging - trip pipeline, classifier, AI analysis with `[metric]` tags for Cloud Monitoring
- [x] Add Vercel Analytics + Speed Insights - Web Vitals, page latency, geographic distribution
- [x] Configure alerting - watchdog function (`monitorTripHealth`) for failed trips, GPS drop-off, stuck trips; health endpoint enhanced with version/checks

## Sprint: "Tech debt lifted out of code comments" (September 2026)

These were `TODO` comments sitting in source. None can be closed without a
credential or a product decision, so each is a ticket here and the code carries
a plain reference to it instead of a marker.

- [ ] **TD-1 Admin monitoring reads no real metrics.** `client/src/pages/admin/monitoring.tsx` renders `avgLatencyMs`, `functionsInvocations`, `firestoreReads` and `firestoreWrites` as hardcoded zeros. The latency figure needs parsing out of the `[metric] trip_pipeline` log lines that already exist; the other three need the Cloud Monitoring API, which needs the API enabled and a service account with `monitoring.viewer`. Until then the page shows four zeros that look like measurements and are not.
- [x] **TD-2 The web trip recorder has no phone-pickup detection.** - *done: `nightly/2026-09-08`. Half the premise was stale. The recorder did have a signal, the `visibilitychange` proxy that `packages/scoring/src/tripMetrics.ts` has named as the web's definition of a pickup since M2-DEC-1; the code comment this ticket was lifted from said the count "stays 0" and had been wrong since that proxy landed. What was genuinely missing is the thing the ticket named: an accelerometer. A driver who picked the phone up, read the recording screen and put it back was invisible to a component worth 10% of the score, because `visibilitychange` only fires on leaving the tab. `client/src/lib/phonePickup.ts` now runs a browser heuristic off `devicemotion` beside the proxy, and both feed ONE counter, so lifting the phone and then switching app is one pickup rather than two. It mirrors mobile's threshold, sustain window and debounce, and deliberately does not mirror its units or its sample-rate rule: DeviceMotion reports m/s^2 from two streams that rest at different values, and browsers sample fast enough to resolve the oscillation inside a real pickup, which mobile's reset-on-one-quiet-sample rule would read as no pickup at all. `sawMotionReading` keeps a sensorless desktop's zero distinguishable from a measured zero. Held by 22 unit tests on the heuristic and 6 page-level tests on the wiring, the half that failed silently on mobile for six days in `cd35366`.*
- [ ] **The design-law gate intermittently measures an empty `/leaderboard`.** Observed on
  `nightly/2026-09-08`: three consecutive `npm run gates` runs on the same commit, the middle one
  failing law 5 with "NO PROSE FOUND" on that route while the runs either side measured 5 prose
  nodes and 63 figures there. The gate is behaving correctly, refusing to call a measurement of
  nothing green; the route is rendering empty some of the time, most likely measured before its data
  arrives. Not investigated, and not caused by anything in that night's diff, which never touches
  `/leaderboard`. Worth pinning before a red run gets read as a real violation, or worse, ignored.

- [ ] **TD-3 Seven Cloud Functions callables have no rate limiting.** `functions/src/http/admin.ts` (initializePool, cancelTrip, contribute), `classifier.ts` (classifyTrip, batch job) and `gdpr.ts` (export, delete). Needs a decision on the limits and on where the counters live, since the Express `rateLimiter` middleware does not reach a callable.
- [ ] **TD-4 ZAR-vs-GBP conversion is an identity pass-through.** `functions/src/http/rootAdapter.ts` `resolveCurrency` returns its input unchanged: Root's sandbox models money in ZAR cents, Driiva is a GBP product, and no conversion is applied anywhere. Deliberately not guessed. Closes on either Root's UK/GBP product module key (needs sandbox credentials) or an FX rate signed off under D15. See `docs/rebuild/m4-grounding.md` sections 2 and 4.
- [ ] **TD-5 Mobile onboarding cannot launch a real quote journey.** `mobile/app/onboarding/quote.tsx` has the screen but no Root Platform call behind it. Blocked on the same Root credentials as the P0 ticket above.

## Completed (reference)

- [x] Cloud Functions build fixed
- [x] Trips page wired to real Firestore data
- [x] AI insights feature flag
- [x] Root Platform integration scaffolded
- [x] CORS fixed (origin allowlist via `CORS_ORIGINS`; no wildcard)
- [x] CLAUDE.md, ROADMAP.md, and ARCHITECTURE.md added; trip-processor source of truth; regression report and investor doc
- [x] Dashboard map now uses device GPS instead of hardcoded London coordinates
- [x] AI Risk Scoring & Insights engines finalized
- [x] GDPR export/delete endpoints live
- [x] Sentry set up (error monitoring)

---

*Update the checkbox when a ticket is done. Add new tickets at the top of the relevant sprint. Product roadmap owned by Keith Cheng.*
