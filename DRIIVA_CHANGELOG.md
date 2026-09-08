# Driiva Changelog

> Short, human-readable log of changes.
> One entry per task: what changed, why, and which manual tests passed.

## Entries

### 2026-09-08 - The web recorder only noticed phone usage when the driver left the tab

`nightly/2026-09-08`. Closes ROADMAP's TD-2 under "Tech debt lifted out of code comments".

- **What the ticket got right and wrong** - it said the web trip recorder "sets the pickup count
  without an accelerometer reading behind it", and it was lifted verbatim from a comment in
  `client/src/pages/trip-recording.tsx` claiming the count "stays 0". That comment had been wrong
  since the `visibilitychange` proxy landed underneath it: the page did count pickups, and
  `packages/scoring/src/tripMetrics.ts` has named that proxy as the web's definition of a pickup
  since M2-DEC-1. So nothing was fabricated. The accelerometer half of the complaint was real, and
  it is the half that matters: `visibilitychange` only fires when the driver leaves the tab, so a
  driver who lifted the phone, read the recording screen and put it back registered nothing at all
  against a score component named after exactly that act, worth 10%.
- **Fix** - `client/src/lib/phonePickup.ts` is a browser-side heuristic on the `devicemotion` stream
  the page already collects and already discloses, running beside the existing proxy for the length
  of the trip. Both signals feed ONE counter with one debounce, so lifting the phone and then
  switching app is one pickup rather than two. It mirrors mobile's shape (threshold, sustain window,
  debounce) and deliberately breaks the mirror in the two places the surfaces genuinely differ.
  Units: expo-sensors reports g and rests at 1g, DeviceMotion reports m/s^2 from two streams that
  rest at different values, so the deviation is taken from whichever stream the browser populates,
  Android commonly giving only the gravity-inclusive one. Sample rate: mobile samples at 5 Hz and
  ends an episode on a single quiet sample, browsers sample fast enough to resolve the oscillation
  inside a real pickup, so that rule would have ended almost every episode before it could be
  counted. A below-threshold run shorter than 200ms no longer breaks the episode, and the same
  tolerance stops a gap in the event stream itself, which is what a backgrounded page produces,
  reading as minutes of continuous handling.
- **Counting stops when the trip is paused**, which is what the proxy alone used to do by sitting
  behind a `recordingState === 'recording'` check. A paused trip accumulates no duration, and the
  phone-usage score is a rate over duration, so handling the phone during a pause would have been
  charged against time that was never measured. The gate is `shouldCount` on the detector, so it
  covers the accelerometer as well as the tab switch.
- **What is deliberately not claimed** - `sawMotionReading` records whether any usable reading ever
  arrived, so a desktop with no motion sensor stays distinguishable from a phone that measured no
  handling, and it is set even while counting is paused because sensor presence is true either way.
  Nothing invents a reading and no UI claims the sensor confirmed anything. The count is still
  client-reported, and still sanitised and rate-capped server-side by `sanitizePhonePickupCount`
  before it can move a score. Like its mobile counterpart the thresholds are reasoned rather than
  calibrated: UNVERIFIED against a real accelerometer in a moving car.
- **One correctness fix carried along** - `handleStopTrip` submitted `tripEvents` read out of a
  state closure. It now submits the count `stop()` returns, because React batches state updates and
  a pickup counted in the same tick as the stop could otherwise be dropped.
- **Kept under the ceiling** - the wiring pushed `trip-recording.tsx` to 524 lines, so it moved into
  `client/src/hooks/useTripPhonePickups.ts` following the `useTripDurationTicker` precedent from the
  same page. The page is back to 499. The page's `visibilitychange` handler now does one job,
  re-acquiring the wake lock, and the hook keeps its own listener for the pickup half.
- **Held by** `client/src/__tests__/phone-pickup-detector.test.ts` (25 tests on the rule) and
  `client/src/__tests__/trip-recording-phone-pickup.test.tsx` (7 tests on the wiring, which is the
  half that failed silently on mobile for six days in `cd35366`, where the detector existed and no
  app code ever called it). The scoring package's per-platform note, and its build-time copy in
  `functions/src/scoring/tripMetrics.ts`, were corrected in step so the two do not drift.

**Tests:** both new files red first for the right reason, then green. Six planted violations checked
afterwards, each failing only the law it breaks: mobile's reset-on-one-quiet-sample rule fails the
oscillation test, dropping the stream-gap guard fails the throttled-page test, an unshared debounce
fails the count-one-act-once test, removing the pause gate fails the paused-trip test, and building
the detector without starting it, the `cd35366` bug replanted, fails 3 of the 7 wiring tests both
before and after the hook extraction. Full suite 105 files, 1197 passing, 1 skipped, 3 todo. Root
`tsc --noEmit` at its 6 known pre-existing `firebase-admin` errors, byte-identical error set before
and after by diff, none in any file touched here. `npm run build` exit 0.

`npm run gates` ran for real three times, since Chrome was up on 9222 and both Doppler and the
Firebase CLI resolve in this clone. First and third runs all green: DESIGN LAWS on 5 of 5 routes,
AXE 0 serious or critical across 14 of 14. The second run failed law 5 on `/leaderboard` with "NO
PROSE FOUND", which is the gate refusing to call an empty measurement green rather than a violation:
that route rendered nothing at all that time, having measured 5 prose nodes and 63 figures on the
run before and after. `/leaderboard` is not on any path this change touches, and the flake is logged
as its own ROADMAP line rather than smoothed over here.

Two things are broken in this clone and neither is from this change, both proved rather than
assumed: `eslint` cannot start at all, since typescript-eslint refuses TS 7.0, which fails
identically on an untouched file; and the `functions` build cannot resolve `@driiva/contracts`,
verified by running it with and without this change and diffing the error sets, identical at 6.

---
### 2026-09-06 - The client speaks one palette, not a canonical one plus thirty aliases for it

`nightly/2026-09-06`. Closes ROADMAP's "Client SPA token alignment" ticket under "Remaining features
not yet in any sprint".

- **What the ticket actually needed** - the ticket was written against `--color-accent-primary` and
  friends, and those were already gone: the canonical block (`--app-*`, `--ink-*`, `--brand-*`,
  `--ok`/`--warn`/`--err`, `--hairline-*`) has mirrored `design-system/colors_and_type.css` in
  `client/src/index.css` since `c1e5ff4`. What was left underneath it was a "compatibility aliases"
  block of thirty legacy names, `--success-green`, `--warning-yellow`, `--error-red`,
  `--primary-blue`, `--primary-purple`, `--ease-smooth`, `--ease-bounce`, the ten `--neutral-*`
  steps, the `--glass-overlay*` pair and a dozen more, each declared as a pure `var()` indirection to
  a canonical token, plus 24 rules in the same file still written against them. Two palettes with
  one set of values is still two palettes: a rule written against `--primary-blue` reads as if the
  app had a blue, and anyone retuning the accent has to know that six other names move with it.
- **Fix** (`client/src/index.css` only) - the alias block is deleted and every rule speaks the
  canonical name: `--ok`/`--warn`/`--err` on the status and state classes, `--app-primary` on the
  focus rings, `--ease-fast`/`--spring` on the animation utilities, `--app-text-pri` on the compact
  card title, `--glass-white-8` on the loading skeleton. `.gradient-primary` had both stops aliased to
  the one accent, so it was already a flat fill and is now written as one. Computed values are
  unchanged by construction: each alias resolved to exactly the token that replaced it. Three names
  stay on purpose. `--accent` is read by Tailwind's accent colour in `tailwind.config.ts` and so by
  every shadcn primitive built on `bg-accent`, and is a canonical design-system name in its own
  right; `--radius-card` and `--radius-button` are semantic role tokens that name a place, not a
  value. `tailwind.config.ts` never used a legacy name and is untouched. No component file changed:
  every call site was inside `index.css` itself.
- **Held by** `tests/unit/web-token-aliases.test.ts`, following the `web-type-source` pattern. Two
  laws: no legacy alias is declared or referenced anywhere in `client/src` (ts, tsx or css), and
  every `var(--x)` the client reads resolves to a property the client declares or a runtime (Radix,
  Tailwind) is known to set. The second is the safety net for the rename itself, because a
  `var()` whose property is declared nowhere does not error, it silently falls back to nothing.
  Both laws are proved against planted violations.
- **Found and recorded, not fixed** - the resolution law turned up two pre-existing dangling
  references this ticket did not create: `components/ui/sidebar.tsx`, the stock shadcn sidebar
  primitive, reads `--sidebar-border` and `--sidebar-accent`, shadcn theme tokens this app's `:root`
  never declared. No route imports the sidebar, so nothing renders against the gap today. They are
  listed as the exact known exception, so a new dangling reference still fails and fixing or deleting
  the sidebar makes the list wrong and forces it to shrink.

**Tests:** the new file red first against the unmodified source, 2 of 4 failing: the alias law on all
24 real call sites plus the 30 declarations, and the resolution law on the two sidebar tokens. Green
after the fix, 4 of 4. Full suite: 93 files, 1152 passing, 1 skipped, 3 todo (1156 total, this
file's 4 included). `vite build` exit 0 and the compiled stylesheet grepped for every retired name:
0 hits, with `var(--ok)`, `var(--warn)`, `var(--err)`, `var(--app-primary)`, `var(--ease-fast)` and
`var(--spring)` present where the aliases used to be. Root `tsc --noEmit` byte-identical at its 7
pre-existing `firebase-admin` errors, by a real before/after diff of the full output rather than a
count. `npm run gates` was not run: it needs Chrome on :9222, Doppler and the Firebase emulators,
none of which the unattended clone has, and this change alters no computed value for it to measure.

---
### 2026-09-05 - Cloud Functions errors reached Sentry with no trail of what ran before them

`nightly/2026-09-05`. Closes the "Set up structured logging with Sentry breadcrumbs" ROADMAP ticket
(Code Quality & UX Fixes). Ahead of it in file order, every other unchecked ticket was gated
(Root creds, D6 pool funding, a deliberate call on the `@google-cloud/storage` major bump, the
phone-frame asset, the physical-device proof) or already taken by an open PR (#88, the `npm run
gates` ticket); a few more turned out to already be implemented under a stale checkbox (pool-share
calculation in `functions/src/scheduled/pool.ts` + `triggers/trips.ts`, the policy-page premium
display, the client CSS token rename) or now obsolete (the Tesco/Halfords/Nectar voucher thresholds
ticket predates Wave 0's removal of those named partnerships as fabricated claims - implementing it
as written would reintroduce exactly what that wave took out). `server/routes.ts` was next but was
set aside rather than split tonight: it is 1,519 lines with real Stripe webhook/idempotency logic in
it, and there is no existing test that exercises the registered Express routes at all (no supertest
anywhere in the repo) to prove a mechanical split preserves behaviour - a refactor of that size and
sensitivity deserves its own reviewed pass with route-level tests written first, not an unattended
one.

- **Root cause** - `functions/src/lib/sentry.ts` already had `wrapFunction`/`wrapTrigger` wiring
  every Cloud Function and Firestore trigger through `captureError` on failure, but nothing ever
  called `Sentry.addBreadcrumb`. The browser SDK auto-instruments console/fetch/navigation
  breadcrumbs; `@sentry/node` does not, so every server-side error Sentry ever captured arrived with
  an empty breadcrumb trail - no way to see what ran immediately before it.
- **Fix** - added `addBreadcrumb(category, message, data?)` to `sentry.ts`, guarded by the same
  `SENTRY_DSN_FUNCTIONS` + `initialized` check as `captureError`/`setSentryUser`. `wrapFunction` now
  leaves a `'function'` breadcrumb (handler name + caller uid) before invoking the handler;
  `wrapTrigger` leaves a `'trigger'` breadcrumb (handler name) before invoking its handler. Every
  function/trigger already routed through these wrappers gets the trail automatically - no call
  site elsewhere in the codebase needed touching.
- **Verified** - `functions/src/__tests__/lib/sentry.test.ts` (new, 6 tests): red first against the
  unmodified source (`addBreadcrumb is not a function`, then two assertions on zero breadcrumb calls
  from the wrappers), green after the fix, via `git stash` around the source file so the before/after
  diff is real rather than assumed. Confirms breadcrumbs no-op with no DSN configured and before
  `initSentry()` has run, and that the breadcrumb call happens before the wrapped handler runs
  (`invocationCallOrder`), not after.

**Tests:** the new file's 6 tests, isolated: 5 red / 1 passed before, 6/6 green after. Full suite
after the fix: 93 files, 1154 passing, 1 skipped, 3 todo. `functions/` suite alone: 14 files, 161
passing. Root `tsc --noEmit`: byte-identical 7 pre-existing errors before and after (confirmed with
`git stash`/`git stash pop` around a real diff, none in `sentry.ts`). `functions/` `tsc --noEmit`:
same 6 pre-existing `@driiva/contracts` module-resolution errors before and after, none in
`sentry.ts`. `npm run build` not re-run (no client/build-affecting change). `npm run gates` not run:
this is a Cloud Functions backend change with no marketing/client visual surface, so the browser
design-law gate doesn't apply here; the parent gates ticket's own status is unrelated to and
unaffected by this change.

---
### 2026-09-04 - `npm run gates` ran for real, found two more findings, and went green

`nightly/2026-09-04`. Closes ROADMAP's "`npm run gates` no longer reports INCOMPLETE" ticket. Every
prior pass at this ticket assumed the browser gate could not run in the unattended nightly clone and
held fixes as source-level pins instead. Tonight Chrome was actually up on :9222, so the gate ran the
real thing: its own throwaway browser, the QA emulator, a seeded driver, `npm run design:laws` and
`npm run axe` end to end. It found two real findings neither prior pin had caught, both from a
different code path than what was already fixed.

- **Dashboard, three more strings on the wrong floor** (`client/src/pages/dashboard.tsx`). The
  2026-09-01 dashboard pass fixed the footer and the starting-score explainer, but design-laws.mjs
  classes any element as "body" copy by its own text length (>=60 characters), independent of which
  component it lives in, and three more strings on the page matched that rule while still painted
  `text-xs` (13px, the secondary tier): the AI coaching tip body, the empty-pool "contributions start
  when the insurance product launches" note, and the "you're on track for a refund" banner. All three
  moved to `text-sm` (15px, the body floor the ladder in `tailwind.config.ts` already defines).
- **Rewards, a second locked-card contrast bug in a different component.** The 2 Sep fix removed
  `RewardsTimeline`'s whole-card `opacity-40`, which was multiplying every descendant's alpha instead
  of sitting beside it. axe still failed `/rewards` tonight with 5 SERIOUS color-contrast nodes on
  `.opacity-50.p-5.instrument-card` - not `RewardsTimeline`, but the Achievements grid on the same
  page, in `rewards.tsx`, with its own `!achievement.unlocked ? 'opacity-50' : ''` on `GlassCard`. Same
  bug shape, a component the earlier fix never touched. The card's locked state is already carried two
  other ways that don't touch text opacity - the icon switches from `--app-primary-text` to the muted
  `--app-text-sec`, and the unlocked-only green check badge is absent - so dropping the whole-card
  opacity removes only what was crushing the description's contrast, not the locked cue itself.
- **Held by tests, not just the browser run.** `tests/unit/web-dashboard-laws.test.ts` gained a new
  law-5 pin (`bodyCopyStillOnSecondaryFloor`) proved red first against the unmodified source (via
  `git stash` of the one file, not a compound command) on exactly the three offending lines, then
  green after the fix; a planted-violation case proves it still fires. A new file,
  `tests/unit/rewards-achievement-card-contrast.test.ts`, mirrors the existing RewardNode pin for the
  Achievements card: the real WCAG contrast formula against the app's own `--app-bg`/`--app-surface-1`
  tokens shows the `opacity-50` composition failing AA, a source pin against the class returning, and
  a planted-regression test proving the pin fires.
- **Then re-verified against the real thing.** A second full `npm run gates` run after the fixes:
  `DESIGN LAWS: ALL GREEN on all 5 route(s)`, `AXE: 0 serious or critical across 14 route(s) audited`,
  `gates: all green`. This is the first time this ticket has closed on a real gate result rather than
  a source-level pin standing in for one.

**Tests:** full suite 93 files, 1155 passing, 1 skipped, 3 todo (up from 1121 two nights ago), the two
new/extended test files included. Root `tsc --noEmit` unchanged at its 7 pre-existing `firebase-admin`
errors (confirmed by running before and after; my changes never touch `server/`). `npm run build` exit
0. `npm run gates` run twice, live: once to find the two findings above, once after the fix to confirm
green. Both runs' own processes and ports (5202, 9333, the throwaway Chrome profile) were confirmed
cleaned up afterwards.

### 2026-09-02 - The locked reward card's own "locked" label was the least readable thing on it

`nightly/2026-09-02`. Closes the Rewards line off ROADMAP's "npm run gates" design-law ticket: five
axe SERIOUS colour-contrast nodes, all on the locked reward cards.

- **Root cause** (`client/src/components/RewardsTimeline.tsx`) - `RewardNode` put `opacity-40` on
  the whole card whenever a tier was locked. CSS `opacity` on an ancestor does not sit beside a
  descendant's own alpha, it multiplies it, so the overlay drawn specifically to tell a driver a
  reward is locked - the Lock icon and "X days to go" label, both `text-white/60` - was the thing
  dimmed hardest on the page. Every other card on Rewards uses that same `white/60` at full strength
  with no complaint from axe; only the locked state compounded it.
- **Fix** - the whole-card `opacity-40` is gone. The blur overlay (`backdrop-blur-[2px]`) and the
  Lock icon already carry the "this is locked" signal on their own; removing the opacity does not
  remove the locked cue, it removes the thing crushing its own label's contrast.
- **Verified by computation, not by eye** - the browser gate that found this (axe-core over CDP)
  cannot run in the unattended clone: no Chrome on :9222, no Firebase emulator, no seeded driver.
  `tests/unit/rewards-locked-card-contrast.test.ts` runs the actual WCAG relative-luminance formula
  against the app's own `--app-bg` (`#0a0a14`) and `--app-surface-1` (`#12111f`) tokens, read live
  from `client/src/index.css` rather than pasted: `text-white/60` directly on the card background
  computes to 7.16:1, past the 4.5:1 AA floor; the same text composited through a 40% ancestor
  opacity - what the old code actually painted - computes to 2.06:1, confirming the finding was
  real rather than a false positive. A source pin holds the fix (no `isLocked && 'opacity-<n>'` in
  `RewardNode`'s `cardClass`) and a planted-violation test proves the pin fires.
- **Also checked, not touched** - the two other open findings under the same ROADMAP ticket were
  already handled elsewhere and are not re-done here: the dashboard three-law fix is sitting on open
  PR #84 (unmerged, do not re-implement), the leaderboard/pool-chart tabular-figures fix is sitting
  on open PR #68 (unmerged, do not re-implement), and the Sentry-CSP line was fixed on main by
  `b6fe697` under a stale checkbox that PR #84 already corrects. None of that is re-done here to keep
  this diff to the one ticket.

**Tests:** the new file's own 5 tests, run in isolation, red first against the unmodified source - one
failure, the source pin, on `isLocked && 'opacity-40'` genuinely still being present - then green
after the fix, all 5. Full suite after the fix: 90 files, 1117 passing, 1 skipped, 3 todo (1121
total, this file's 5 included). Root `tsc --noEmit` byte-identical at its 7 pre-existing
`firebase-admin` errors, confirmed with `git stash`/`git stash pop` around a real before/after diff
rather than assumed. `npm run build` exit 0. `eslint` still cannot load its config on TS 7.0.2
(pre-existing, PR #69 pending, unrelated to this change). `npm run gates` was not run: it needs
Chrome on :9222, a Firebase emulator and a seeded driver, none of which exist in the unattended
clone, and the parent gates ticket stays open for that reason - this is a source-level pin standing
in for the pixel measurement, not a replacement for it.

---
### 2026-09-01 - The dashboard obeys the design laws the gate could see but CI could not

`nightly/2026-09-01`. The dashboard design-law ticket off the "gates is still
committed INCOMPLETE" list: three laws broken on the signed-in dashboard,
found by the one real gate run and invisible to every check that runs in CI.

- **What changed** - client web only, `client/src/pages/dashboard.tsx` plus
  `client/src/components/StartingScoreExplainer.tsx`. Law 1: all five capsule
  oblongs the gate named (the indigo Beta badge, and both progress bars as
  track plus fill) re-radiused, plus the pool loading skeleton's twin bar the
  gate never saw because it only renders mid-load. Thin bars take a literal
  2px following the shimmer's own recorded precedent; the badge takes
  `rounded-xs`, the project's 4px token. `rounded-sm` was rejected after
  reading the BUILT css, not the source: it compiles to
  `calc(var(--radius) - 4px)` and `--radius` is defined nowhere in the
  bundle, so it computes to 0. Law 5: the footer row ("Trust Centre", Terms,
  Privacy) up from 11px to the 13px secondary floor, and the starting-score
  explainer's ~330-character body copy up from 13px to the 15px body floor
  in both its variants. Law 6: seven plain numeric spans (trip score, trip
  distance, total miles, pool share, safety factor twice, participants) now
  carry `.tabular`, joining the score-breakdown row that already did.
- **Why the fix is at source and the proof is a pin** - `npm run gates` needs
  Chrome on 9222, Doppler and the Firebase emulators, none of which exist in
  the unattended clone, so the browser gate could not be re-run. The fixes are
  held instead by `tests/unit/web-dashboard-laws.test.ts`: a line-level
  reading of the capsule law (painted `rounded-full` that is neither a circle
  nor an inset-0 overlay), the two type-floor literals, and a window check
  that every listed figure span carries `.tabular` - each matcher proved
  against a planted violation before the fixes went in, red first (4 law
  pins red on the real offenders, 5 plant tests green). The gate stays the
  authority: the page has drifted since the 22 Aug run and still carries
  12px long-copy law-5 debt (the AI tip body among others) for the next real
  run to enumerate, which is why the parent gates ticket stays open.
- **Left honest** - the radii and floors here are law-compliant by
  measurement of the classes and tokens, not by a rendered screenshot; no
  browser confirmed the composed page tonight.
- **Also tonight, no code** - the resume-threshold ticket (review finding 8)
  turned out to be implemented on FOUR open unmerged nightly PRs (#67, #70,
  #71, #83); tonight's run re-implemented it red-green before discovering
  the duplicates, then reverted rather than open a fifth. ROADMAP now warns
  against re-implementation and records that the Sentry-CSP ticket was
  already done on main (`b6fe697`) with a stale checkbox.
- **Tests** - 9 new in `tests/unit/web-dashboard-laws.test.ts`. Full run 1121
  passing, 1 skipped, 3 todo, up from 1112. `npm run build` exit 0, and the
  built css checked for `.rounded-xs{border-radius:var(--radius-xs)}` with
  `--radius-xs:4px` resolving, and `.rounded-\[2px\]{border-radius:2px}`.
  Root `tsc` unchanged at its 7 pre-existing TS 7.0.2 errors, byte-identical
  error set before and after. `eslint` still refuses to load its config on
  TS 7.0.2 (pre-existing, PR #69 pending). Mobile untouched.
### 2026-08-31 - Paused no longer sits over a moving car

`5810e51` on `nightly/2026-08-31`. Review finding 8 off the Fable day sprint, mobile only.

- **What changed** - resuming from PAUSED demanded `START_SPEED_MPS` (4.5 m/s) while the stationary
  clock cleared at `PAUSE_SPEED_MPS` (1.0), so between the two the car was moving, the clock knew
  it, and the state still read paused: the screen sat on "Stopped. Still recording." over a
  crawling car. `fromPaused` now resumes at `PAUSE_SPEED_MPS`, the same line the clock trusts, so
  one threshold decides stationary versus moving in both directions and the label can never
  disagree with the clock about whether the car moved.
- **Why one threshold and not a hysteresis band** - the deferred TODO offered a speed band if
  flapping at junctions was the reason for two thresholds. It is not needed, because the hysteresis
  is already in time: resuming is instant, while pausing again takes the full `PAUSE_HOLD_MS` of
  unbroken stillness, so a queue that inches forward every minute simply stays driving. A test pins
  exactly that.
- **Why the strict threshold bought nothing here** - the start-speed asymmetry prevents a walk
  being scored as a drive; on resume the trip is already open and recording either way, so a strict
  threshold could only mislabel a right trip, and did.
- **Left alone on purpose** - trip lifetimes are untouched. `drive_paused` and `drive_resumed` are
  ignored by the monitor, and ending runs off the shared movement clock in either state, so a car
  that crawls and then parks ends at the same moment it did before. Only the label and the arc
  animation see the difference.
- **Tests** - 5 new in `tests/unit/mobile-drive-detection.test.ts`, written first, 3 red against
  the old threshold including a property over the whole crawl band. Full run 1116 passing, 1
  skipped, 3 todo, up from 1111. Root `tsc` delta zero against 7 pre-existing errors, and `eslint`
  cannot run on this branch at all - both regressions arrived with the `a94ce78` dev-deps bump to
  TypeScript 7.0.2, present on the untouched baseline and flagged in the run summary rather than
  fixed, being a second ticket. Mobile `tsc` unchanged at 248 pre-existing module-resolution errors
  in a clone with no `mobile/node_modules`, verified identical before and after. `npm run gates`
  not run: it needs Firebase emulators, Doppler and Chrome on 9222, none of which exist in the
  unattended clone, and it does not exercise the mobile detector.
### 2026-08-28 - The pool chart's axis figures hold their columns, and two documentation gaps found along the way

`3660011` on `nightly/2026-08-28`. Closes one item of the "npm run gates no
longer reports INCOMPLETE" ticket in the Premium lift sprint.

- **What changed** - `PoolPanel.tsx`'s recharts XAxis/YAxis (the pool-history
  line chart, imported into `/leaderboard`) render their tick labels through a
  hand-written tick function now, instead of `tick={{ ... }}`.
- **Why the object form looked right and was not** - `tick={{ fill, fontSize,
  className: 'tabular' }}` matches recharts' public prop shape, and a read of
  its own `filterProps`/`SVGElementPropKeys`/`Text.js` says `className`
  should flow straight through to the rendered `<text>`. It does not, for a
  plain object specifically: `CartesianAxis.renderTickItem`'s default branch
  hardcodes `className: "recharts-cartesian-axis-tick-value"` on the element
  it builds from an object tick, discarding whatever the object set. A type
  check cannot see this - the discard happens one layer past the public API.
  A render test that actually walked the DOM came back with zero `.tabular`
  elements and said so.
- **The fix** - a tick function, which recharts merges a className into
  rather than overwrites, built on recharts' own exported `Text` component so
  multi-line wrapping and anchor positioning are not hand-rolled. `fill` and
  `fontSize` are set explicitly inside it, because the function form carries
  no styling from the `tick` prop at all - the object form used to supply
  both, so leaving them out would have quietly reverted the axis colour and
  size while fixing the class.
- **Not run against `npm run gates`** - it needs Chrome on :9222, a Firebase
  emulator and a seeded driver, none of which exist in the unattended nightly
  clone. The parent ticket stays recorded as committed-INCOMPLETE for the
  same reason it already was.
- **Two documentation gaps found while picking tonight's ticket, not left for
  next time** -
  1. The Sentry CSP fix (`b6fe697`, 25 Aug) was real, merged, and verified,
     but its ROADMAP checkbox was never ticked. Ticked tonight, four lines
     above this ticket in `ROADMAP.md`.
  2. `nightly/2026-08-26` had already fixed the *next* ticket down
     (`d58885d` + `f7ffb9e`, the resume-threshold labelling mismatch) two
     nights ago, cleanly and with a better fix than a first pass here
     produced independently before this was noticed - and it is still
     sitting unmerged as PR #67. Its CI is red on `Lint & Type Check`
     (repo-wide: `typescript-eslint does not support TS 7.0`, not anything in
     that diff), `Create Neon Branch` and the Claude Code Review check
     (`Bad credentials`, an expired/misconfigured GitHub App token) - all
     three are infrastructure failures, not defects in the PR's code, and all
     three would fail identically on this PR too. Flagged rather than
     silently redone: the duplicate work was caught before a second commit
     was made, not after.
- **Tests** - 90 files, 1113 passing (was 89/1112), 1 skipped, 3 todo. New
  test written red first (0 tabular ticks found against the object-tick
  attempt), green after the function-tick fix. Root `tsc` clean; the 7
  pre-existing `firebase-admin` errors are untouched, confirmed identical via
  `git stash` before and after. `npm run lint` could not run either way -
  same `typescript-eslint`/TS 7.0 repo-wide breakage as PR #67's CI, not
  attempted here since it is out of scope for one ticket.
### 2026-09-03 - The reduced-motion override is measured, not read

`74b94ee` on `nightly/2026-09-03`. The last open item on the marketing
rendered-behaviour pass. One new file, `tests/marketing-reduced-motion.mjs`,
plus two npm scripts. No product code changed.

- **What was open** - `.reveal-init` starts at opacity 0 and is made visible
  again by two independent mechanisms. The JS path, where `useReveal` and the
  hero timeline assign the resting style, has been under test since `7f1ca28`.
  The CSS path, the `.reveal-init` override inside
  `@media (prefers-reduced-motion: reduce)`, is what catches every element the
  JS never reaches, and it was covered by nothing. Reading the file said it
  resolves, the override following the base rule at equal specificity, but that
  is a source fact and the whole point of a rendered-behaviour pass is not to
  settle questions that way.
- **Why it stayed open for three weeks** - two reasons, and only one of them
  has gone away. jsdom applies no stylesheet, so a test there reports those
  elements at opacity 0 and manufactures a bug that does not exist; that is
  still true and is why this is a browser harness rather than another vitest
  file. The other reason was that Chrome on 9222 was down for the whole
  original follow-up. It is up tonight, so the run that was described as "one
  clean probe" could finally happen.
- **What the run says** - 38 `.reveal-init` elements on `/` that the JS had not
  touched compute opacity 1 under the emulated preference. The same 38 compute
  opacity 0 without it. The override holds, on the shipped stylesheet, in a
  real engine. The five legal routes carry no reveals and are reported as such
  rather than counted toward the green.
- **An incidental finding, recorded because it changes how the CSS half reads.**
  The JS path had reached none of those 38 at page load. So under reduced
  motion the CSS override is not a backstop behind the JS, it is the thing
  actually carrying the page, and the half that was already tested is the half
  that does less.
- **Why every route is measured twice** - the control run at `no-preference` is
  not decoration. If the untouched elements read opacity 1 under both
  preferences then the stylesheet is not reaching them at all, and a clean
  reduce pass would be measuring an absent rule. That case reports INCONCLUSIVE
  and exits non-zero. This harness set has been bitten twice by a gate that
  reported green on a surface it never reached, and this is the cheapest
  possible guard against a third.
- **Production build, not the dev server** - the question is rule ordering in
  the stylesheet that ships, and a dev server injects CSS a different way.
  Served by a zero-dependency static server rather than `vite preview`, so the
  check runs without `apps/marketing/node_modules`; directory requests resolve
  to the prerendered `index.html` inside them rather than falling back to the
  root one, which would have measured the home page under five other route
  names.
- **Tests** - the planted run came first and was red on all 38
  (`npm run motion:reduced:plant` injects a higher-specificity override that
  re-hides them), so the green that followed is a measurement rather than a
  no-op. Root suite 1136 passing, 1 skipped, 3 todo across 89 files, up from
  1119 - the rest of that rise is other work already on `main`, none of it
  touched here. 8 of 8 mobile source laws and 7 of 7 fabrication laws green.
  Root `tsc` unchanged at the 7 pre-existing `server/` errors from the
  firebase-admin namespace typings. `eslint` still cannot run in this clone:
  `typescript-eslint` refuses TS 7, which predates this branch.
- **Not run, and not claimed** - `npm run gates`. It needs the QA emulator,
  Doppler and a seeded driver, none of which exist in the unattended clone, and
  it audits the signed-in client app rather than the marketing site, so it
  would not reach this file. `docs/premium-lift/marketing-rendered-behaviour.md`
  still lists this check as open; that document is an audit trail and is left
  for Jamal to close.

### 2026-08-26 - A crawl in traffic is moving, and the screen now says so

`d58885d` on `nightly/2026-08-26`. Review finding 8 off the Fable day sprint, mobile only,
`mobile/lib/driveDetection.ts` alone.

- **What changed** - resuming a paused drive required `START_SPEED_MPS` (4.5 m/s, about 10 mph)
  while the stationary clock cleared at `PAUSE_SPEED_MPS` (1.0 m/s, about 2 mph). Between the two
  the car was moving, was not accumulating toward the end of the trip, and still read as paused, so
  the Drive screen could sit on "Stopped. Still recording." through an entire queue. One threshold
  now answers both, and it is renamed `MOVING_SPEED_MPS` because a constant called PAUSE_SPEED
  deciding when to resume is the same quiet disagreement the DETECTION object exists to prevent.
- **Why `START_SPEED_MPS` is deliberately left out of it** - it answers a different question. It
  decides whether a journey is a DRIVE at all: asked once, from cold, leaning toward refusing,
  because starting a trip for a walk or a bus writes a journey the driver never drove into an
  insurance record. By the time anything can pause, that decision has already been made and paid
  for. Resuming is not it being asked again; it is only "is this vehicle moving", which is exactly
  what the stationary clock already asks a line earlier in the same method.
- **No hysteresis band, and why not** - the deferred note left the door open to one if flapping at
  junctions turned out to be the reason for two numbers. It is not needed: `PAUSE_HOLD_MS` already
  is a hysteresis band. Resuming is immediate but pausing again costs a full minute of no movement,
  so the state cannot change more than once a minute however the traffic behaves. A second
  threshold would have bought nothing the hold does not already buy, at the price of the mislabelled
  band.
- **No data was ever lost** - recording continues through paused and always did, so this was a
  labelling fault throughout, not a capture one. The trip that crawls is unchanged on disk; what
  changes is what the driver is told is happening, and whether `LiveArc` stops breathing at them
  while the car is moving.
- **Tests** - 7 new in `tests/unit/mobile-drive-detection.test.ts`, written first and red first
  (7 failed, 42 passed before the change). Two are fast-check properties over the whole speed range
  rather than examples, pinning the pairing itself: every speed at or above the moving threshold
  resumes, every speed below it does not, so the two thresholds cannot drift apart again without a
  test going red. The pre-existing crawl test carried a comment describing the behaviour this
  removes; the comment is corrected and the test gained an assertion rather than losing one.
- **Verified** - full root run 1119 passing, 1 skipped, 3 todo, up from 1112. Root `tsc` unchanged
  at 7 pre-existing errors in `server/` (firebase-admin namespace typings), confirmed identical
  against a stashed tree. 8 of 8 mobile source laws and 8 of 8 fabrication laws green. `eslint`
  could not run at all: `typescript-eslint` refuses TS 7, which is a pre-existing toolchain
  incompatibility in this clone and not something this change introduced. `npm run gates` was not
  run - it needs the QA Firebase emulator, Doppler and a browser on 9222, none of which exist in
  the unattended clone, and it is already recorded as committed-INCOMPLETE. It covers rendered web
  routes and would not reach this file in any case.

### 2026-08-25 - The accelerometer stops running all day

`4af6b81` on `nightly/2026-08-25`. Review finding 7 off the Fable day sprint, mobile only.

- **What changed** - two accelerometer listeners, the gait check in
  `lib/driveMonitorInstance.ts` and `PhonePickupDetector`, were started the moment detection was
  armed and left running until it was disarmed, at 5 Hz, every waking hour. They now go up when a
  drive is in prospect and down again when it is not. `DriveMonitor.needsMotionSensing` is the
  decision and `setMotionSensingSink` carries it to the native wiring, which holds no logic of its
  own because it is the half that gets proved on a simulator rather than in CI.
- **Why** - between drives neither listener produces anything anybody reads. The gait check only
  shortens the start hold from 20s to 10s once a candidate has appeared, and the phone-pickup count
  is rebased when a trip opens, so every pickup counted beforehand is discarded by design. The
  battery was paying for two jobs that do not exist yet.
- **Why both, not just the gait one** - the finding names the gait check, but fixing that alone
  would have bought nothing measurable. `expo-sensors` shares one native sensor across listeners at
  the shortest requested interval, so the pickup detector at 200ms holds the hardware awake on its
  own.
- **The trap** - gating on the detector's state alone is wrong and quietly so. A manual trip
  deliberately bypasses detection, so the detector sits at `idle` for its whole length; a driver who
  pressed start would have had no pickup counting at all, which is the fabricated zero `cd35366`
  fixed arriving back through a different door. `needsMotionSensing` counts an open trip as well.
- **Left honest** - the gait window is cold at each candidate, so variance reads null for its first
  five seconds. Absent is not agreement, so a drive that declares itself before the window fills
  waits the full hold rather than the short one; the corroborated 10s hold is still reached once the
  window arrives, and that is now a test rather than an assumption.
- **Tests** - 12 new in `tests/unit/mobile-drive-monitor.test.ts`, written before the change and red
  first. Full run 1104 passing, 1 skipped, 3 todo, up from 1092. Root `tsc` clean, `eslint` clean on
  the three changed files, 8 of 8 mobile source laws green. `npm run gates` was not run: it needs
  Firebase emulators, Doppler and Chrome on 9222, none of which exist in the unattended clone, and
  it is already recorded as committed-INCOMPLETE. Mobile `tsc` is unchanged at 248 pre-existing
  errors, all module resolution against a clone with no `mobile/node_modules`, verified identical
  before and after.

### 2026-08-24 - Fable day: Drive becomes an instrument, and two fabricated score inputs die

`feat/fable-algo` and `feat/fable-trip` merged through `feat/fable-day` to main (`5c12303`). Mobile,
plus the two server-side faults that had been stopping any trip from ever being scored.

- **Drive rebuilt** (`d0732e9`, `05de6c5`, `3dd72be`, `418e76b`) - the big record control is gone
  rather than restyled, because a screen built around one teaches the driver that Driiva only works
  if they remember to press something. Detection is armed for the session by
  `components/DriveDetectionHost`, mounted once from the tabs layout, so a pocketed phone still
  notices a drive. The Drive screen only reports now, and says plainly when location access or an
  Expo Go preview is the reason nothing can be recorded.
- **A drive ends without being told** (`dd2a96a`, `15b2549`, `5ec52a6`, `dad3b55`) - a non-zero
  `distanceInterval` meant a parked car stopped producing fixes, so the state machine never received
  the stationary samples it reasons from and the trip stayed open, at speed, indefinitely. Both
  watches use `kCLDistanceFilterNone`, the stationary clock runs from the last time anything actually
  moved, and `tick(now)` advances wall-clock time with no sample: it invents no speed, guesses no
  position, and can only ever end a drive. Elapsed is measured from the drive rather than from the
  moment a screen observed it.
- **Phone pickups were always zero** (`cd35366`) - `onPhonePickupCount` existed, had a unit test, and
  was never called by any app code. Every trip therefore submitted a pickup count of 0, and phone
  usage, 10% of the driving score, silently contributed a perfect 100 to every score Driiva has ever
  produced. The counter now lives beside the accelerometer in `driveMonitorInstance` and the monitor
  pulls from a source rather than waiting to be handed a number, so its absence is visible instead of
  indistinguishable from a real zero. It hid twice: the detector was owned by the Drive SCREEN, which
  is exactly what is not mounted on an automatically detected drive, and the simulator has no
  accelerometer, so a real zero there looked like the right answer.
- **`closeTrip` invents nothing** (`f79c263`) - a trip with no accepted fix was writing an end
  position of 0,0, a real coordinate in the Gulf of Guinea that the server could not tell from a
  genuine ending; it is discarded as cancelled now. A failed writer flush no longer reports duration 0
  beside a real distance.
- **One drive is one trip** (`48803af`, `2ae8a00`) - a manual tap racing a queued fix could open two
  trips for one drive, only one of which can ever be closed; and `stopWatchingForDrives` cleared the
  heartbeat with a trip still open, keeping the battery cost and discarding the only mechanism that
  ends a drive. Two orphans of that shape were cleaned out of Firestore by hand during the proof.
- **Trips can be submitted at all** (`9526f1c`, `ef1fb63`) - `submitTripForScoring` batched an update
  to `trips/{id}` together with one to `tripPoints/{id}`, which `firestore.rules` denies outright, so
  the whole batch failed and every trip stranded. Fixed on mobile and on the web twin. First trip
  proved on the iOS simulator with a native dev build against real Firebase.
- **Functions could not deploy** (`6950127`) - `functions/src` had imported `@driiva/contracts` since
  `db3dcd8` with nothing declaring the dependency, so every deploy failed source analysis with
  MODULE_NOT_FOUND and prod kept running the 5 Jul build. The scorer had never seen the phone-usage
  weight or the refund cap, and a submitted trip sat in processing forever. Prebuild now compiles the
  contracts to CommonJS into `functions/vendor/contracts`.
- **Money and the refund cap** (`7d11cc0`, `c32f0a3`, `8eb389b`, `5cd76b2`, `a738b55`, `bbd73d0`) - a
  property test found four defects the example tests could not see, including a hard cap that rounded
  a limit upward; onboarding's estimate no longer widens an already-capped figure by hand;
  `MONEY_PLACEHOLDER` is no longer a literal "£0.00" rendering every absent amount as a calculated
  zero; and `totalMiles` is miles, not miles times one hundred.
- **The rest of the surface** (`86563b1`, `fef920b`, `54d956e`, `cb96a16`, `8ef2489`, `0fb1817`,
  `29eb329`, `cf1d634`, `de6ff2f`, `e45c2e3`, `60c97ab`, `a40173e`, `2fdaea8`, `7f458fc`, `5e42eac`,
  `5c12303`) - Home, Trips, trip detail and You rebuilt as instruments; Community supersedes Friends
  and Rewards leaves the tab bar; motion primitives with a testable reduced-motion guard; onboarding
  validated at the boundary; every screen on the Instrument Glass type ramp; account creation fixed;
  the Expo Go preview reaches the app it is previewing again; and Metro only watches directories that
  exist, so the EAS bundle step survives.

**Not verified:** everything above was proved on the iOS simulator. Automatic drive detection and the
phone-pickup count still need a physical-device run, and the simulator is structurally unable to give
one. Two review findings are deferred and recorded next to the code they concern (`e7febe2`): the
accelerometer's all-day 5 Hz duty cycle, and a resume threshold of 4.5 m/s against a stationary clock
that clears at 1.0 m/s, which lets the screen say "Stopped. Still recording." while the car crawls.

---

### 2026-08-24 - The QA gate could not sign in because of our own CSP

`nightly/2026-08-24`. Closes the named half of the "gates is still committed
INCOMPLETE" ticket: `npm run gates` has never once reached an authenticated
route, so the design laws and the axe audit have only ever been measuring the
signed-out surface.

- **Root cause** (`server/middleware/security.ts`) - `securityHeaders` sends
  `connect-src 'self'`. The dev server serves the page from
  `localhost:5202`; the Firebase Auth emulator answers on `127.0.0.1:9098`.
  Different origin, so Chrome refused the sign-in request outright, and the
  Firebase SDK reported the refusal as `auth/network-request-failed` - which is
  exactly what a genuine network fault looks like. That mislabelling is why the
  hunt went through browser extensions, emulator ports and env-file loading in
  turn, each of which was a real bug, fixed, and still left the gate at 1 of 5
  routes.
- **Fix** - `connect-src` gains `http://127.0.0.1:* http://localhost:*` when
  `NODE_ENV` is not production, alongside the `ws: wss:` that was already
  dev-gated there. The production policy is unchanged.
- **Diagnosis method worth keeping** - the error text was actively misleading,
  so nothing was learned by reading it. Listening for the page's own
  `securitypolicyviolation` event named the blocked URL and the violated
  directive in one line.
- **Gate script** (`scripts/run-gates.sh`) - the header no longer claims the
  extension block is the likely cause. It records the confirmed one, and says
  that a red from the gate is now a real violation rather than a reach problem.

**Verified:** `npx tsc --noEmit` clean. `npx vitest run`: 76 files, 796 tests
passing, 1 skipped, 2 todo, including five new tests in
`server/__tests__/security-headers.test.ts` that pin the dev allowance, pin the
absence of any loopback or plain-http source in production, and pin that
production `script-src` still carries no `unsafe-inline`/`unsafe-eval`. Written
before the fix and confirmed red on the right assertion. End to end in a real
browser, the seeded driver now signs in where the same probe was returning
`stuck` with a `CSP-VIOLATION` on `identitytoolkit` a minute earlier. Gate
coverage went from 1 of 5 design-law routes and 7 of 14 axe routes to 5 of 5
and 14 of 14.

**`npm run gates` is still not green, and this change is why we can see it.**
With every route reachable for the first time, the gate reports three
pre-existing product defects it was previously blind to: dashboard breaks the
capsule, type-floor and tabular-figure laws; leaderboard breaks tabular figures
on its SVG axis labels; rewards has five SERIOUS axe contrast nodes on the
`opacity-50` locked cards. None of these were introduced here and each is its
own piece of work, so they are written up as tickets rather than swept into
this diff. The roadmap ticket stays unchecked.

**Also found, not fixed:** `connect-src` has no `https://*.ingest.sentry.io` in
any environment, so every browser Sentry envelope is refused by CSP. Client
error monitoring has been reporting nothing. Ticketed rather than fixed here -
it is a production security-header change and deserves its own reviewed diff.

---

### 2026-08-18 - Phone-usage scoring wired end-to-end (M2-DEC-1 Option A)

`feat/phone-usage-detection`, merged to main 18 Aug (`f520505`). Closes the gap flagged in
`docs/rebuild/m2-dec-1-phone-usage.md`: the phone-usage 10% of every driving
score was permanently, silently hardcoded to a neutral 100 because
`phonePickupCount` never reached the server. It now does.

- **Scoring engine** (`packages/scoring/src/tripMetrics.ts`, the authored
  source; `functions/src/scoring/tripMetrics.ts` is its build-time copy) -
  `computeTripMetrics` takes an optional second parameter,
  `clientReportedPhonePickupCount`. A new `sanitizePhonePickupCount` helper
  rejects non-finite/negative values and rate-caps the rest at 6
  pickups/minute before the count can reach `events.phonePickupCount` or the
  score - there is no server-side accelerometer stream to verify it against,
  so this is a client-reported number the server sanity-checks, not one it
  independently confirms.
- **Server wiring** (`functions/src/triggers/trips.ts`) -
  `finalizeTripFromPoints` reads `tripData.clientReportedPhonePickupCount` and
  passes it through; the sanitiser above is the actual trust boundary.
- **Trip document** (`packages/contracts/src/trip.ts`,
  `functions/src/types.ts`, `shared/firestore-types.ts`) - new optional
  `clientReportedPhonePickupCount` field. Deliberately NOT added to
  `TripPoint`/the `tripPoints` collection, which would have needed a DPIA
  allowlist change (`DPIA_REVIEWED_DATA_TYPES`); this stays a top-level field
  on the trip doc instead, and is not locked by firestore.rules the way
  `events`/`score`/`scoreBreakdown` are.
- **Web** (`client/src/lib/tripService.ts`) - `endTrip()` now writes
  `clientReportedPhonePickupCount`, carrying through the `phonePickupCount`
  the trip-recording screen already tracked (a `visibilitychange` proxy: the
  app backgrounded while a trip is recording). That signal existed before
  this change; it was captured and then discarded on every trip.
- **Mobile** (new `mobile/lib/phonePickup.ts`, wired into
  `mobile/app/(tabs)/record.tsx` and `mobile/lib/trips.ts`) - an on-device
  accelerometer heuristic (`expo-sensors`): a sustained deviation in
  accelerometer magnitude from the ~1g a mounted phone reads at rest, held
  for at least 600ms, debounced 3s between counts. Documented as a heuristic,
  not a claim of accurate gesture recognition - see the file's header
  comment. `mobile/app/trust.tsx` and `client/src/pages/trust.tsx` disclosure
  copy updated to match.
- **Docs** - `docs/rebuild/m2-dec-1-phone-usage.md` marked RESOLVED with what
  actually shipped; `ARCHITECTURE.md` and `ROADMAP.md` updated to stop
  describing this as hardcoded/unimplemented.

**Verified:** `npx tsc --noEmit` clean at root, in `functions/`, and in
`packages/contracts`+`packages/scoring` (via `npm run build:packages`).
`npx vitest run` at root: 70 files, 737 tests passing (includes new
sanitisation/wiring tests in `packages/scoring/src/__tests__/` and
`functions/src/__tests__/scoring/`, plus updated payload-shape pinning tests
in `client/src/__tests__/` and `packages/contracts/src/__tests__/`). A real
Firestore-emulator integration test
(`tests/integration/trips.test.ts`, via `npm run test:integration`) drives
the actual `onTripStatusChange`/`finalizeTripFromPoints` and confirms a
reported pickup moves the stored `phoneUsageScore` away from the old
permanent 100 (1 pickup over a 5-minute trip lands at 68, not 100) and that
an implausible reported count (500 on a 10-second trip) is rate-capped
rather than trusted, with the final score staying finite and in range.

**Not verified:** mobile detection on a real device. `mobile/lib/phonePickup.ts`
has not been run against a real accelerometer in a moving car - `cd mobile &&
npx tsc --noEmit` is clean, but the thresholds are a reasoned starting point,
not a calibrated one. Needs on-device confirmation before this is called
shipped on mobile.

---

### 2026-08-18 - Removed dead Neon scoring path (POST /api/trips, TelematicsProcessor)

- **Dead-code removal** (`chore/remove-dead-scoring-path`) - deleted the confirmed-orphaned Neon/Postgres scoring path: the `POST /api/trips` route in `server/routes.ts`, `server/lib/telematics.ts` (`TelematicsProcessor`/`WorkerBackedProcessor`), `server/lib/telematics-worker.ts` (its only importer), and the standalone dev script `server/test-ai-models.ts`. No live client calls this route - Firestore's `client/src/lib/tripService.ts` is the real trip-ingestion path, per an existing characterisation-test finding. Re-verified with a fresh repo-wide grep before deleting anything.
- **Found during the sweep, not in the original brief** - `server/lib/aiRiskScoring.ts` (`AIRiskScoringEngine`) turned out to be orphaned too, its only caller anywhere in the repo being the dev script above. Removed alongside it, same commit.
- **Not dead: refund calculation** - `TelematicsProcessor.calculateRefund` was still live, used by `GET /api/dashboard/:userId` and `POST /api/simulate-refund`. Both call sites now call `calculateRefundCents` (`packages/scoring/src/refund.ts`, the canonical `@driiva/scoring` package) directly rather than through the retired wrapper class - same formula, same inputs, no behaviour change.
- **server/app.ts** - removed the now-orphaned `/api/trips` body-parser registration (`express.json({ limit: '5mb' })`).
- **Tests** - removed the dead-path assertions from `server/__tests__/api-contract.characterisation.test.ts` (the API-14 POST /api/trips block) and updated its dashboard test to assert the real computed refund instead of a mocked constant. Removed the now-pointless `../lib/telematics` mocks from four other characterisation suites (`rate-limit`, `stripe-webhook-idempotency`, `pool-contribution`, `policy-bind`) since the module no longer exists. `client/src/lib/telematics.ts` (the unrelated client-side `TelematicsCollector`, DeviceMotion capture) was untouched throughout.
- **Gates:** tsc clean, 69 test files / 716 tests passing, 1 skipped, 2 todo.

**Caveat:** no MANUAL_TEST_CHECKLIST run recorded. Pure removal plus an arithmetic-equivalent refactor (the two live call sites pass the exact same five arguments to `calculateRefundCents` that the retired wrapper did); the automated suite is the coverage.

---

### 2026-08-18 - Mobile: background trip capture wired (authored, not verified on device)

On `feat/mobile-background-trip-capture`, merged to main 18 Aug (`8156a5a`). Closes the gap `record.tsx`'s own header comment flagged: foreground GPS capture was real and working, background capture was named as missing.

- **Background task** (`lib/backgroundLocation.ts`, `lib/backgroundLocationBuffer.ts`) - `expo-task-manager` added via `npx expo install` (resolved `~14.0.9` as the SDK 54-compatible version, not hand-pinned). `TaskManager.defineTask` + `Location.startLocationUpdatesAsync` feed the exact same `TripPointWriter` the foreground watch in `record.tsx` already writes to - `setActiveWriter`/`getActiveWriter` register the one writer a trip in progress is using, so this is not a second point buffer next to the one the foreground path already streams to `tripPoints/{tripId}/batches/{n}`. That "second buffer" shape is the one this repo has already been bitten by once (duplicate trip writes), so it was designed out deliberately rather than caught in review.
- **Additive, not a replacement** - the foreground watch (`Location.watchPositionAsync`) is unchanged and stays the primary path. Background capture starts alongside it when a trip begins and is torn down in the same `teardown()` that already stops the foreground watch, the tick interval and the score listener, so every existing exit path (stop, cancel, unmount, the error branch in `beginTrip`) now also stops the background task. `defineTask` is wrapped in a `try/catch`: a JS bundle pushed via OTA update without a matching native rebuild would otherwise hit a missing native module at import time and take down the whole bundle, not just this feature.
- **Explicit, honest permission gate** - the OS "Always" prompt is never triggered blind. If "Always" is already granted, background capture starts silently; otherwise the driver sees an in-app card during recording ("Keep recording if you switch apps?") that states plainly what today's default is (foreground only, screen must stay open) and what turning it on changes, before the OS prompt appears. Declining is a real no-op: the trip continues exactly as it already did. `hooks/usePermissions.ts` gained `requestBackgroundLocation` and `markBackgroundLocationOffered`, extending the existing `permissions.*` Firestore fields on the user doc rather than adding a second permissions writer.
- **Config** - `app.json` already had `UIBackgroundModes: ["location", ...]` and `NSLocationAlwaysAndWhenInUseUsageDescription` (same wording as the existing when-in-use string, so no new claim was introduced) and Android's `ACCESS_BACKGROUND_LOCATION`/`FOREGROUND_SERVICE` - these were pre-wired ahead of this feature and were verified, not re-added. The one real gap: `FOREGROUND_SERVICE_LOCATION`, required from Android 14 for a location-type foreground service, added to `android.permissions`. Confirmed via `expo-location`'s own config plugin source that it also adds this automatically given `isAndroidBackgroundLocationEnabled: true`, so the explicit entry is belt-and-braces, not load-bearing.
- **UI honesty follow-through** - the existing `wasBackgrounded` warning ("some of the route may be missing") would have started firing a false alarm the moment background capture went live, since a background-covered gap is no longer a real gap. It now only shows when background capture was not actually active for the trip; when it was, the card says so instead ("Driiva kept recording in the background").
- **What's verified**: `cd mobile && npx tsc --noEmit` clean. `npx expo config --json` parses without error, `android.permissions` includes `FOREGROUND_SERVICE_LOCATION`, iOS `infoPlist` carries both location strings and `UIBackgroundModes`. The pure point-buffering logic (`handleBackgroundLocationData`, `toSampledLocations`, the active-writer registry) is unit tested from the root suite - `tests/unit/mobile-background-location.test.ts`, 9 tests, passing - deliberately kept free of any expo-location/expo-task-manager import so it can run without mobile's dependency tree, the same constraint `tests/unit/mobile-waitlist.test.ts` documents.
- **What's explicitly NOT verified** - everything about real background execution on a physical device: whether the OS actually keeps delivering fixes once Driiva leaves the foreground, the Android foreground-service notification, the iOS background-location status bar indicator, permission-prompt wording as the OS actually renders it, and battery impact. This environment has no physical device and no simulator with real background execution to test against. A device that already has an older Driiva build installed also needs a fresh native rebuild (EAS build) before this JS can run at all - `expo-task-manager` is a new native module an existing binary does not have, so this must not be pushed as an OTA update to existing installs without a matching native build first.

### 2026-08-17 - Dependency security sweep on main

- **Vulnerability sweep** (`fix(deps)`, `0386e00`) - `npm audit fix` with non-breaking fixes only, no `--force`. 46 vulnerabilities down to 16. Clears all three criticals: protobufjs arbitrary code execution, node-tar PAX path confusion, and websocket-driver resource limit bypass, plus 16 of the 17 highs.
- **What was left, and why** - the 16 that remain all trace to `@google-cloud/storage` through `retry-request` and `teeny-request`, and only clear on a major bump. Left as a deliberate decision rather than folded into a routine sweep.
- **Gates:** tsc clean, 63 test files and 677 tests passing, unchanged from baseline. Lockfile only, no source change.

**Caveat:** as with the 2026-08-03 batch, no MANUAL_TEST_CHECKLIST run is recorded against this entry. The dependency change is lockfile-only and the automated suite is unchanged from baseline.

---

### 2026-08-03 - Marketing Site: Scroll Performance, Text Legibility, Real Hero Screenshot

Seven commits on the marketing site, reconstructed from git history on 2026-08-04. The nightly `docs: nightly roadmap/changelog sync` job runs daily but only ever writes `ROADMAP.md`, so none of this batch reached this file at the time.

- **Scroll performance** (`fix(marketing)`, 2e76d3c) - `DriivaShaderBackground` was rendering a full-viewport WebGL mesh gradient continuously behind every page at up to 1.5x device pixel ratio, looping 10 orbs plus 5-octave noise per pixel. That GPU fill-rate competed with the compositor during scroll and produced the laggy scroll a cofounder reported. Backing-store render scale capped at 1x DPR (the canvas is CSS-stretched to 100%/100%, so displayed size and layout are unchanged, and the shader is blurred noise so the resolution drop is not perceptible), and the animation loop now stops entirely on `visibilitychange` when the tab is backgrounded.
- **Text legibility** (f5b9b0a) - replaced `background-clip:text` gradient fills with solid `--amber-2` (#f59e0b), one of the brand gradient's own stops, on the 5 selectors that used it as a text colour (`.step-num`, `.founder-quote .hl`, `.cta-final h2 .accent`, `.calc-output-value`, `.brand-statement-body h2 .hl`). All sit on the site's dark ink/glass backgrounds, giving amber-2 a contrast ratio above 9:1, well clear of WCAG AA. `--grad-brand` stays defined and is still used as a decorative background fill on 3 unrelated bar/avatar elements.
- **Hero credibility** (91bd4de) - `PhoneFrame`'s synthetic score-ring mockup replaced with the real onboarding screenshot (`apps/marketing/public/brand/app-preview.png`) so the hero reads as finished product rather than wireframe. `Hero.test.tsx` updated to assert the screenshot renders instead of the old synthetic ring markup. `FinalCTA` headline changed to the cofounder-approved copy verbatim.
- **Hero gradient, applied then reverted** (76b27a4, then f5b9b0a) - `.hero-headline .italic` was moved off a flat iris colour onto the canonical `--grad-brand` gradient-clip treatment to match the rest of the site's headline text. Superseded the same day: the legibility pass above removed gradient-clip from text entirely. Recorded rather than dropped, because the round trip is the reason the site no longer uses gradient text anywhere.

**Caveat:** these are code-level entries reconstructed from commit messages and diffs. Unlike earlier entries in this file, no MANUAL_TEST_CHECKLIST run is recorded against them, because none was captured at the time.

---

### 2026-07-21 – M2 Trips & Scoring Merge, Refund Consistency Fix, Repo Rename

- **M2 module** (`merge rebuild/m2-trips`) - the trips and scoring pipeline module merged into main.
- **Refund consistency** (`fix(m2)`, T9 whole-branch-review follow-up) - `server/lib/telematics.ts` now imports refund calculation from the canonical `@driiva/scoring` package instead of the retired `shared/refundCalculator.ts` shim (deleted, along with its test - coverage was byte-identical to the scoring package's own test). The policy page's displayed refund rate now gates on the same `projectedRefund > 0` condition and unrounded score as the projected-refund figure, fixing a case where a live rate showed next to a "no refund" result at the 69.5-70 score boundary. Display-only; no scoring or refund formula changed.
- **Email design system** (`fix(design-system)`) - the canonical email shell (`design-system/email-shell.html`) is now a full HTML document with a zero-margin, background-matched body and `bgcolor` attributes on the outer tables, fixing white dead space that receiving clients (and Outlook's rendering engine, which ignores CSS background on tables) were adding around the dark card.
- **Repo rename** - the repo is canonically `DriivaMVP` → `Driiva` (same remote, now at `~/Documents/Driiva`); the pre-existing business-docs folder (deck, financials, legal, investor docs) was merged into the same directory and is gitignored, never tracked. Stale path references updated across docs.

### 2026-06-26 – P0 Critical Blockers + Security Pass (logic-gap harness)

Seven commits landed in one batch after a logic-gap harness audit identified release-blocking issues.

- **Security** (`fix(security)`) - closed 3 critical release-blockers: trust-proxy header now set so Express sees real client IPs, input sanitise order corrected, worker crash no longer leaves trips in an unrecoverable state.
- **Pricing** (`fix(pricing)`) - server premium calculation is now the sole source of truth; client can no longer override it. Enforces a single +/-15% discount cap; duplicate discount stacking removed.
- **Trips/payments** (`fix(trips,payments)`) - atomic trip persistence via Firestore transaction; duplicate trip creation on retry now rejected; price allow-list guards payment amounts.
- **Trips** (`fix(trips)`) - point flushes serialised to prevent race writes; `startTrip` made atomic; `cancelTrip` uses a canonical state machine path.
- **Onboarding** (`fix(onboarding)`) - completion now gated on confirmed server write; draft resume flow added; consent record written with integrity check before advancing.
- **Infra/scoring** (`fix(infra,scoring)`) - deterministic scoring output verified; worker auto-recovery on crash; sanitise pipeline reordered correctly.

**Note:** all six fix commits were merged into main via `merge: land integration line + P0 critical blockers into main` on 2026-06-26.

---

### 2026-06-25 – CI Lint Gate + Secret-Safety Integration

- Wired ESLint into GitHub Actions CI - every PR now fails on lint errors.
- Fixed a false-red in the secret-safety check that was blocking clean commits.
- Both changes landed via `merge(ci): bring CI lint gate + secret-safety repair into integration line`.

---

### 2026-06-13 – Toolchain Hardening + Onboarding Palette + Brand Asset

Six discrete fixes landed on the same day.

- **TypeScript config** - removed deprecated `baseUrl` that was blocking `tsc` under TS 6.
- **ESLint** - added a real lint gate (`fix(lint)`) and fixed 6 newly surfaced errors.
- **CI** - secret-safety false-red repaired (part 2 of CI repair, companion to 2026-06-25 merge).
- **Node version** - pinned at root via `engines` in `package.json` and `.nvmrc` to prevent version drift across machines and CI.
- **Dead code** - removed duplicate-trap components that were causing confusion; package name corrected.
- **Onboarding** - repainted all onboarding screens to the Driiva instrument palette (solid dark surfaces, `#5b4dc9` accent); eliminated a re-centre jump on step transitions.
- **Brand** - sharpened gradient wordmark PNG added for use in email headers.

---

### 2026-06-08 – Marketing SEO: IndexNow + FAQPage Schema + OG Card

- Added IndexNow key file + `lastmod` fields to `sitemap.xml` for faster Google/Bing re-crawl on deploy.
- Added keyword-targeted `<meta>` description and title across all marketing pages.
- Added `FAQPage` JSON-LD schema to the marketing homepage.
- Added a 1200x630 OG card image so link previews render correctly across Slack, Twitter, and WhatsApp.
- Fixed Vercel project root directory to `apps/marketing` (was pointing to repo root, causing build failures); triggered a prod rebuild after the fix.

---

### 2026-05-28 – Marketing: WebGL Background + Glass Nav + SEO Pass

- Replaced the static gradient hero background with a WebGL shader that animates on scroll.
- Added a glassmorphic sticky navigation bar with blur effect.
- Further hero copy refinements and SEO improvements (heading hierarchy, alt text).
- Added `.vercel` to `.gitignore` to prevent CLI project link files from being committed.

---

### 2026-05-27 – Marketing Polish: Cookie Banner Removed + Footer Socials

- Removed a consent-exempt cookie banner that was unnecessary given current analytics setup.
- Completed all footer social links (Twitter/X, LinkedIn, Instagram).

---

### 2026-05-21 – Marketing Polish: Layout + Vercel Analytics

- Switched marketing analytics from Plausible to Vercel Analytics (`@vercel/analytics`). Plausible removed entirely.
- Converted hero phone mockup from horizontal to vertical orientation.
- Removed pill-shaped containers from sections to align with the instrument palette's flat-surface style.
- Type scale updated to match canonical design-system tokens.

---

### 2026-05-19 – Doppler as Canonical Secrets Source

- Adopted Doppler as the single source of truth for all secrets across `dev`, `stg`, and `prd` configs.
- Scripts added: `scripts/audit-doppler-pollution.sh` (value-free audit) and `scripts/clean-doppler-pollution.sh` (removes trailing `\n` paste pollution that was silently breaking Firebase Installations 400 responses and the ~27s auth delay).
- Marketing trust section and conversion copy polished.

---

### 2026-05-16 – Marketing Site Rebuild (apps/marketing)

- Scaffolded a new `apps/marketing/` Vite + React 18 + Wouter SPA as the live driiva.co.uk surface, replacing the legacy `marketing-site/index.html` and the Framer split-brain.
- Marketing site includes: animated hero, product evidence section, waitlist API (Firebase Admin + Resend), legal routes (`/privacy`, `/terms`, `/cookies`, `/complaints`, `/uk-survey`), and hyperframe video sections.
- Canonical Driiva design-system `ui_kit` ported into the marketing SPA.
- Wordmark anchor and headline hierarchy corrected after an investor-grade self-critique pass.
- Brand voice corrected to "AI-powered, community-driven" framing throughout.
- Vercel project `driiva-marketing` configured with `rootDirectory: apps/marketing`.

---

### 2026-05-12 – Mobile: 16-Screen Onboarding Flow + Design System Canonicalization

- Shipped 16-screen onboarding flow in `mobile/` (Expo SDK 52). Expo Go preview shim included.
- PWA path officially superseded - `mobile/` is now the canonical mobile surface.
- Design system canonicalized: `design-system/` at repo root holds `colors_and_type.css`, `README.md`, `source/` (Figma rules + Instrument philosophy), and `assets/` (14 brand PNGs including gradient and white wordmark variants).
- Hyperframes shipped: branded video compositions in `hyperframes/`.
- Logos refreshed across `client/` and `apps/marketing/`.

---

### 2026-04-18 – Design System Canonicalized + Marketing Editorial Pass

- New `design-system/` directory at repo root is now the canonical source for Driiva brand + UI tokens:
  - `design-system/colors_and_type.css` - ink ladder, brand gradient, glass surfaces, radii, shadows, motion, type stack (Inter Tight / Inter / JetBrains Mono). Matches `.h-display`, `.hero-sub`, `.eyebrow` spec used by marketing-site.
  - `design-system/README.md` - voice/tone rules (sentence case, em dashes, UK spelling, no exclamation marks/emoji), visual foundations (two philosophies: marketing glass vs. product instrument), animation curves (`--spring`, `--ease-fast`), iconography (Lucide, currentColor, 24×24, stroke-width 2).
  - `design-system/source/` - `Driiva_Instrument_Philosophy.md` (the Figma rules file lives at `.figma/design-system-rules.md`).
  - `design-system/assets/` - 14 brand PNGs (gradient + white wordmarks v1/v2/v3, ii-mark, d-mark, app-icon-artifact, gradient background 1563×1563).
- Logo propagation:
  - `marketing-site/assets/driiva-logo.png` → swapped to canonical `logo-wordmark-gradient.png` (already matching - confirmed identical bytes).
  - `marketing-site/assets/gradient-background.png` → canonical 1563×1563 brand gradient.
  - `client/src/assets/logo-wordmark-white-v3.png`, `logo-wordmark-gradient.png`, `logo-ii-mark.png` added.
  - `client/src/components/DriivaLogo.tsx` → imports `logo-wordmark-white-v3.png` (replaces legacy `driiva-logo-CLEAR-FINAL.png`).
- Marketing hero editorial pass (`marketing-site/index.html`):
  - Hero logo `max-width 280px → 200px`, `width 60% → 42%`, `margin-bottom 40px → 28px`; nav logo `height 28px → 24px`.
  - Vertical rhythm rebalanced: logo→eyebrow 28px, eyebrow→h1 28px, h1→sub 20px, sub→form 36px.
  - `.hero h1` and `.hero-sub` type specs now inherit from canonical global (`clamp(2.5rem, 6vw, 4.25rem) / -0.035em / 1.02` for h1; `clamp(1rem, 1.6vw, 1.15rem) / 1.55` for sub) - earlier tighter overrides reverted to stay within canonical `.h-display` / `.hero-sub`.

**Not yet pushed to the live Framer site** - Framer has no automation API available here. See ROADMAP → "Marketing site sync".

**Not touched yet** - mobile app theme tokens in `mobile/theme.ts` already conform to canonical "instrument" mode per design system (solid dark surfaces, single `#5b4dc9` accent). Client Vite SPA theme still uses its own variable names - a follow-up task is to align client CSS variables to `design-system/colors_and_type.css` names without breaking existing shadcn usages.

---

### 2026-03-31 – Notification Bell Fix + Post-Merge Test Alignment

- Fixed dashboard notification bell button (had no onClick handler - was a dead button)
- Added notification dropdown panel with mutual exclusion against profile dropdown
- Updated sign-in integration tests to match refactored auth flow (welcome overlay for onboarded users, ProtectedRoute-based redirect for non-onboarded)
- Fixed TypeScript type widening in trip-recording test mocks

**Tests:** 299 passing, 0 regressions.

---

### 2026-03-31 – Integration Tests for Sign-In + Trip Recording

- Created `signin-flow.test.tsx`: 15 tests covering form rendering, validation, email/password auth, username resolution, error handling (invalid creds, rate limit, timeout), Firebase-not-configured state
- Created `trip-recording-flow.test.tsx`: 37 tests + 2 todos covering idle/starting/recording/paused/stopping states, pause/resume lifecycle, trip end with score + redirect, cancel flow, demo mode (local-only), error states (permission denied, timeout)

**Tests:** 299 passing (up from 247), 2 todos for timer simulation.

---

### 2026-03-30 – Refactor, Cache, Auth Fix, PR Template

**Onboarding refactor**
- Split `quick-onboarding.tsx` (1261 lines, 12 inline steps) into 12 individual step components under `client/src/pages/onboarding/steps/`
- Parent component reduced to 390 lines; all state management stays in parent
- Created shared `OnboardingStepProps` interface in `onboarding/types.ts`

**Leaderboard cache**
- Added 60-second in-memory TTL cache for `/api/leaderboard` and dashboard leaderboard queries
- Cache invalidated automatically when scores update after trip processing
- Deduplicates Neon Postgres reads on a public, read-heavy endpoint

**Auth endpoint fix**
- Implemented `/api/auth/firebase` endpoint (was returning 501 TODO placeholder)
- Now verifies Firebase ID tokens via `verifyFirebaseToken()` and returns user info
- `FirebaseSignIn.tsx` component was already calling this endpoint

**PR template fix**
- Replaced Next.js checklist with Vite/React-appropriate checks (hooks rules, `VITE_` prefix, no `next/image`)
- Added coverage thresholds to `vitest.config.ts` (baseline: 4%/2%/7%/4%)

**Tests:** 247 passing, 0 regressions.

---

### 2026-03-28 – Premium Mobile UX Polish

- Added haptic feedback (vibration API) on button taps and score changes
- Implemented pull-to-refresh on dashboard with spring animation
- Added shimmer loading skeletons across all data cards
- Created swipeable trip cards with dismiss gesture
- Added animated number counters for score/miles/refund values
- Implemented scroll-aware header that collapses on scroll
- Added smooth tab transitions on trips page

---

### 2026-03-27 – Auth Performance + Splash Screen

- Eliminated 10-20s login delay by caching auth state in localStorage
- Added hard timeout on auth resolution (no more infinite spinners)
- Created premium first-launch splash screen with Driiva branding
- Fixed email verification redirect loop for admin users
- Admin console now bypasses onboarding/email checks

---

### 2026-03-25 – Auth Timeouts, Settings Nav, Dedup Reads

- Added 10s timeout on Firebase sign-in with user-facing timeout message
- Fixed settings page navigation (was not routing correctly)
- Deduplicated redundant Firestore reads in auth flow
- Removed debug console.log statements from production code

---

### 2026-03-20 – Observation Mode Monitoring Sprint

- Wired Sentry `wrapFunction`/`wrapTrigger` on all Cloud Functions
- Added Firebase Performance Monitoring with custom trace utility
- Added structured metrics logging with `[metric]` tags for Cloud Monitoring
- Integrated Vercel Analytics + Speed Insights (Web Vitals, page latency)
- Built `monitorTripHealth` watchdog function for failed/stuck trips
- Enhanced health endpoint with version info and dependency checks

---

### 2026-03-15 – Security Audit + CI Pipeline

- Resolved all critical and high npm vulnerabilities
- Added production deployment pipeline with manual approval gate
- Full system audit: 12 issues found and fixed across Firestore rules, PostgreSQL, Cloud Functions, API routes
- Added Claude Code automated PR review workflow
- Resolved all CI failures (type errors, missing deps, coverage step)

---

### 2026-03-08 – Dynamic Pricing + WebAuthn + NCB Onboarding

- Dynamic pricing engine scaffolded (premium calculation based on risk profile)
- Stripe payment toggle wired (not yet end-to-end)
- WebAuthn UI for passkey management added to settings
- No-Claims Bonus step added to onboarding flow (step 7)
- Phone usage detection via Page Visibility API (counts app switches as phone pickups)

---

### 2026-03-02 – Damoov Telematics + Feedback + Compliance

**Phase 1 - Damoov Integration (server-side)**
- Created `functions/src/lib/damoov.ts`: Damoov API client (user registration, trip fetch, daily stats)
- Modified `functions/src/triggers/users.ts`: silent Damoov user registration on signup; stores `damoovDeviceToken` on user doc; credentials via Firebase Secret Manager (`DAMOOV_INSTANCE_ID`, `DAMOOV_INSTANCE_KEY`)
- Created `functions/src/scheduled/damoovSync.ts`: daily scheduled function (00:30 UK time) syncs Damoov trip data to `trips/{tripId}`, updates `drivingProfile` on user doc, writes audit logs to `systemLogs/{date}/damoovSync`; `maxInstances: 10` hard cap
- Exported `syncDamoovTrips` from `functions/src/index.ts`

**Phase 2 - Feedback System**
- Created `client/src/components/FeedbackModal.tsx`: glassmorphic bottom-sheet modal with 1-5 star rating, freetext (500 char max), writes to Firestore `feedback/{autoId}` with uid, rating, message, appVersion, platform, screenContext, serverTimestamp
- Modified `client/src/pages/settings.tsx`: added "Share Feedback" tile in Account section with teal MessageSquare icon
- Created `client/src/pages/admin/feedback.tsx`: admin feedback dashboard table (rating, message, platform, version, date); sorted by timestamp desc
- Modified `client/src/App.tsx`: added `/admin/feedback` route with ProtectedRoute + AdminRoute guard
- Modified `client/src/contexts/AuthContext.tsx`: added `isAdmin` field to User interface, reads from Firestore user doc on auth state change

**Phase 3 - Firestore Security Rules**
- Appended `feedback/{docId}` rules: authenticated create only, no client reads
- Appended `systemLogs/{document=**}` rules: admin SDK only (deny all client access)

**Phase 4 - Privacy Policy + Terms Updates**
- Updated `client/src/pages/privacy.tsx`: added Section 2.3 (telematics sensor data passive collection), Section 2.4 (in-app feedback), Section 5.3 (Damoov as GDPR Article 28 data processor with deletion rights), updated Section 8 (user rights expanded for telematics + Damoov)
- Updated `client/src/pages/terms.tsx`: added Section 4a (telematics data consent clause), added rewards framing clause in Section 2 (FCA-clean: rewards are behaviour incentives, not guaranteed premium reductions)

**Phase 5 - Tests**
- Damoov sync unit test: mocked Firestore + fetch, verified trip doc structure and profile update
- Damoov registration unit test: mocked API, verified deviceToken stored, verified graceful failure
- Feedback widget test: rendered modal, selected stars, typed message, verified Firestore write
- Firestore rules tests: authenticated feedback create, unauthenticated denied, systemLogs denied
- Privacy/Terms render tests: verified "Damoov", "Article 28", telematics consent text present

**Tests:** All new tests passing. No regressions.

---

### 2026‑02‑25 – Opus Revamp Session 2 - Security + Visual Polish

**Phase 0 - Security Incident Resolution**
- Merged open PR #1 (`feat/region-refactor-and-ui-updates`) to unblock history rewrite
- Purged `.env` from entire git history via `git filter-repo --path .env --invert-paths`
- Force pushed all branches with clean history; no secrets in any commit
- Rotated Firebase API key in local `.env` to new restricted key (`AIzaSyCfm-...`)
- Secrets audit: confirmed no `AIza`, `sk-ant`, `npg_`, or hardcoded API keys in source
- Flagged for user: Anthropic API key + Neon DB password need manual rotation

**Phase 2 - Visual Polish (continued)**
- `index.css`: updated `.dashboard-glass-card` to match spec - `rgba(30, 41, 59, 0.4)` bg, `blur(16px) saturate(180%)`, `border: 1px solid rgba(255,255,255,0.1)`
- Score color consistency: standardized all `getScoreColor` functions across `trips.tsx`, `dashboard.tsx`, `TripTimeline.tsx`, `RecentTrips.tsx`, `ScoreRing.tsx` to spec thresholds (red < 60, amber 60-79, green 80+)
- `trips.tsx`: replaced spinner-only loading state with proper skeleton cards
- `trip-detail.tsx`: replaced spinner with content-matching skeleton (map, stats, score breakdown)
- `achievements.tsx`: replaced spinner with skeleton (header, category tabs, achievement cards)
- `profile.tsx`: fixed vehicle display to show existing data; phone field reads from Firestore; `CoverageTypeSection` uses real premium instead of hardcoded 1840; `useDashboardData` extended with `phoneNumber`, `vehicle`, `email` fields
- Recreated `usePushNotifications.ts` hook and `firebase-messaging-sw.js` (lost during filter-repo)

**Tests:** 180/180 passing. TypeScript: 0 new errors (2 pre-existing in `auth-flow.test.tsx`).

---

### 2026‑02‑25 – Opus Revamp (Phases 1–3)

**Phase 1 - Critical Fixes**
- `.env.example`: added `ENCRYPTION_KEY` placeholder with Firebase Secret Manager instructions
- `UserDocument` schema: added optional `vehicle?: VehicleInfo` field in `shared/firestore-types.ts` and `functions/src/types.ts`; documented in `ARCHITECTURE.md` and `CLAUDE.md`
- `profile.tsx`: full rewrite - real Firestore data via `useDashboardData`; edit mode for name/phone/vehicle with `updateDoc` writes; loading skeletons on every section; error state with retry; data privacy trust line
- `policy.tsx`: full rewrite - all values from `useDashboardData` (no hardcoded dates/premium/refund); inline skeletons; refund timeline trust line; score color consistency
- `LeafletMap.tsx`: added `routePoints` prop + "Live"/"Last Trip" toggle; polyline with start/end markers in Last Trip mode; `FitBounds` auto-fits to trace
- `dashboard.tsx`: fetches last trip's `tripPoints` and passes to LeafletMap; updated notification opt-in copy; refund progress messaging

**Phase 2 - Polish Pass**
- Loading/error/empty states audited across all pages (dashboard, trips, policy, rewards, leaderboard, profile, achievements all covered)
- Created missing `trip-detail.tsx` page (score breakdown, route map, driving events, trip context) and `TripRouteMap.tsx` component
- Navigation audit: all routes resolve; 404 catch-all confirmed; back buttons verified
- Removed hardcoded demo values: `PolicyDownload.tsx` ("1,840" → "-"), `PolicyStatusWidget.tsx` ("1,840"/"Jul 01, 2026" → "-")
- `permissions.tsx`: added notification rationale card ("So we can tell you when your trip is scored and when your refund is ready")
- `rewards.tsx`: full rewrite - real Firestore achievements via `getAchievementDefinitions` + `getUserAchievements`; pool/refund data from `useDashboardData`; loading skeletons; refund progress bar

**Phase 3 - Weather Enrichment**
- Created `functions/src/utils/weather.ts`: Open-Meteo archive API; WMO code → condition mapping (clear/cloudy/rain/snow/fog/storm); 3s timeout + null fallback
- Wired into both trip context blocks in `functions/src/triggers/trips.ts`
- Created missing Cloud Functions files: `functions/src/utils/achievements.ts` (8 achievement definitions + unlock engine), `functions/src/utils/notifications.ts` (FCM push helpers), `functions/src/scheduled/notifications.ts` (weekly summary), `functions/src/http/achievements.ts` (seed callable)
- Functions build: 0 errors (fixed all pre-existing module-not-found errors)

---

### 2026‑02‑25 – Tier 3 Animation Polish (Revolut-level)
- Files: `client/src/components/ScoreRing.tsx` (new), `client/src/components/BottomNav.tsx`, `client/src/pages/dashboard.tsx`, `client/src/pages/onboarding.tsx`, `client/src/lib/animations.ts` (unchanged, consumed)
- Changes:
  1. **Score ring / radial gauge** - Replaced the flat `h-2` progress bar on the driving score card with a dedicated `ScoreRing` SVG component. Animated arc via Framer Motion `strokeDashoffset`, animated counter (0 → score), and color-coded gradient (green ≥80, blue ≥70, amber ≥50, red below).
  2. **Staggered card entrance** - Wrapped all dashboard cards in a single `motion.div` using the existing `container`/`item` variants from `animations.ts` (`staggerChildren: 0.08`). Replaced 8 individual `transition={{ delay: 0.1n }}` props with `variants={item}`.
  3. **Bottom nav spring scale + sliding indicator** - Added `whileTap={{ scale: 0.92 }}` with spring physics (`stiffness: 400, damping: 17`). Converted the active background glow and indicator dot to `motion.div` with `layoutId` (`"nav-active-bg"`, `"nav-indicator"`), creating a smooth spring-animated slide between tabs.
  4. **Trip card hover lift** - Changed trip list rows from `<div>` to `<motion.div>` with `whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}` and spring transition.
  5. **Onboarding scaleIn** - Replaced the flat `x: 20` slide on all 4 onboarding steps with `scale: 0.92` entrance/exit using the elastic cubic-bezier `[0.34, 1.56, 0.64, 1]` from `animations.ts`.
- Reason: UI polish pass to bring micro-interactions and motion design up to fintech-grade quality (Revolut/Monzo tier). No logic, data, or scoring changes.
- Tests: Visual verification via browser automation - dashboard renders score ring, stagger fires, bottom nav indicator slides between tabs, onboarding steps scale in. No functional regressions; all existing behaviour preserved.

### 2026‑02‑22 – Architecture Agent – Refined ARCHITECTURE.md & Language Sanitation
- Files: ARCHITECTURE.md, ROADMAP.md, DRIIVA_CHANGELOG.md
- Change: Refined ARCHITECTURE.md with verified technical specifications, including event thresholds, classifier parameters, scoring weights, and refund constants. Sanitized all documentation language to maintain professional and investor-ready standards.
- Reason: To ensure documentation accurately reflects system implementation and adheres to formal business standards required for stakeholders and auditors.
- Tests: Verified technical constants in `functions/src/utils/helpers.ts`, `server/lib/telematics.ts`, and `functions-python/stop_go_classifier.py`. Manual review of documentation for tone and clarity. Passed.

### 2026-02-21 – Antigravity – Project Architecture Documentation
- Files: ARCHITECTURE.md
- Change: Created a comprehensive ARCHITECTURE.md file in the root directory providing a technical overview of the Driiva system, including stack details, data models, scoring pipelines, and AI usage rules.
- Reason: User requested a "real picture" architecture document to guide future development and ensure AI/Sonnet sessions follow established ground rules.
- Tests: No functional code changes; documentation verified for consistency with codebase layout and ROADMAP.md.

### 2026-02-23 – Antigravity – Policy Number Generation & UI Cleanup
- Files: functions/src/triggers/users.ts, functions/src/types.ts, shared/firestore-types.ts, client/src/pages/policy.tsx, client/src/pages/rewards.tsx, client/src/components/PolicyDownload.tsx, client/src/components/DashboardHeader.tsx, client/src/components/ProfileDropdown.tsx, client/src/components/PolicyStatusWidget.tsx
- Change: Implemented sequential policy number generation ("DRV-001", etc.) using Firestore transactions. Removed all hardcoded policy numbers ("DRV-2025-000001", etc.) from the UI and replaced with dynamic data fetched from user profiles and dashboard data hooks.
- Reason: Required to ensure unique, professional policy identification for users and to remove placeholder data from the production MVP UI.
- Tests: MANUAL_TEST_CHECKLIST 1.1–1.6 (Signup), 2.1–2.4 (Auth), 3.1–3.3 (Onboarding) passed; verified policy number generation in trigger code and dynamic display on Dashboard, Profile, Policy, and Rewards pages.

### 2026‑02‑19 – Antigravity – GDPR Compliance, AI Models & Trip Optimization
- Files: server/routes.ts, server/storage.ts, server/lib/aiInsights.ts, functions/src/triggers/trips.ts, client/src/components/LeafletMap.tsx, client/src/hooks/useOnboardingGuard.ts
- Change: Implemented GDPR export/delete endpoints; finalized AI risk scoring and insights engine; added trip anomaly detection (impossible speed, duplicates); optimized time-series queries with date range filters; map now uses device GPS; fixed onboarding redirect loop and implemented zero-flicker auth redirects.
- Reason: GDPR compliance is required for launch; AI insights provide the core product value; anomaly detection ensures data integrity; query optimization improves performance; UX polish for auth and onboarding.
- Tests: MANUAL_TEST_CHECKLIST 1.1–1.6, 2.1–2.4, 3.1–3.3, 4.1–4.4, 6.1-6.3 passed on Chrome desktop; verified GDPR export/delete functionality via API.

### 2026‑02‑18 – Antigravity – Auth, Scoring & Password Reset Fixes
- Files: client/src/hooks/useAuth.ts (deleted), server/lib/telematics.ts, client/src/lib/scoring.ts, client/src/pages/forgot-password.tsx, client/src/pages/signin.tsx, client/src/App.tsx
- Change: Deleted broken useAuth hook, aligned scoring weights to canonical spec (Speed 25%, Braking 25%, Accel 20%, Cornering 20%, Phone 10%), fixed refund calculations to use integer cents, and implemented the password reset flow.
- Reason: Scoring weight discrepancies caused UI/backend mismatch; password reset was missing; broken auth hook caused potential module resolution confusion.
- Tests: MANUAL_TEST_CHECKLIST 1.1–1.6, 2.1–2.4, 3.1–3.3, 4.1–4.4 passed (verified via architecture audit and automated vitest suite). 29 scoring tests passed including new deterministic audit test.

### 2026-02-10 – Antigravity – Root Integration & Backend Monitoring
- Files: functions/src/http/classifier.ts, functions/src/http/gdpr.ts, functions/src/index.ts, functions/src/utils/helpers.ts
- Change: Finalized Root Platform integration and deployed backend verification endpoints, including GDPR compliance hooks and classifier monitoring.
- Reason: Required for production-ready backend and regulatory compliance; ensures Root integration is stable.
- Tests: MANUAL_TEST_CHECKLIST 5.1-5.5 (Trip Recording/Processing) verified in production-like environment.

### 2026-02-08 – Antigravity – Onboarding Flow & UX Restore
- Files: client/src/pages/quick-onboarding.tsx, client/src/index.css
- Change: Restored the signature gradient background and fixed a broken redirect loop in the quick-onboarding flow.
- Reason: Regression in visual style and critical blocker for new user signup completions.
- Tests: MANUAL_TEST_CHECKLIST 3.1-3.3 (Onboarding) and 1.5 (Signup Redirects) passed.

### 2026-02-07 – Antigravity – Zero-Flicker Auth Refactor & Demo Mode
- Files: client/src/components/ProtectedRoute.tsx, client/src/pages/signup.tsx, client/src/index.css
- Change: Refactored ProtectedRoute to use `useLayoutEffect` for flicker-free redirects; added automatic policy creation during signup and improved demo mode handoff.
- Reason: UX polish for auth transitions and ensuring demo mode data is correctly hydrated.
- Tests: MANUAL_TEST_CHECKLIST 2.1-2.4 (Auth) and 4.1-4.4 (Protected Routes/Demo) passed.

### 2026-02-05 – Antigravity – MVP Launch: Telematics & GPS Tracking
- Files: client/src/pages/dashboard.tsx, client/src/pages/trip-recording.tsx, firestore.rules, functions/src/triggers/trips.ts, functions-python/stop_go_classifier.py
- Change: Initial MVP release including GPS tracking, Firestore schema for telematics, trip detection, scoring, and the community pool trigger.
- Reason: Core product launch requirements.
- Tests: Full MANUAL_TEST_CHECKLIST 1-6 verified on mobile and desktop devices.
