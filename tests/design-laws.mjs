#!/usr/bin/env node
/**
 * Driiva's machine-checkable design laws, ported from the TradeMind harness
 * (web/tests/design-laws.mjs).
 *
 * Zero dependencies. It ATTACHES to the Chrome already running on :9222 per
 * CLAUDE.md (never launch a browser, never close one), opens its own tab,
 * measures, and closes only that tab.
 *
 * HOW IT REACHES THE AUTHENTICATED SURFACES, and why that changed.
 * Four of the five routes it walks are behind ProtectedRoute. This harness
 * used to reach them by writing sessionStorage['driiva-demo-mode'] = 'true',
 * which ProtectedRoute honours by rendering children unconditionally. That had
 * two consequences, both bad. When the write landed it was auditing DEMO MODE:
 * the fabricated pool, the invented participants, three trips that never
 * happened. When it did not land in time, the route bounced to /signin and the
 * run errored. So the harness alternated between measuring a fixture and
 * measuring nothing, and neither was the product.
 *
 * It now signs in as the seeded emulator driver through the app's own form,
 * the same way the accessibility audit does, via tests/qa-session.mjs. The
 * surfaces it measures are the real ones, rendering real seeded data through
 * their real auth paths.
 *
 * Usage:
 *   node tests/design-laws.mjs                     # the default routes
 *   node tests/design-laws.mjs /trips /rewards     # named routes
 *   node tests/design-laws.mjs http://host/page    # explicit URLs
 *   PLANT_VIOLATION=1 node tests/design-laws.mjs   # prove the laws can fail
 *   --allow-unreached                              # do not fail on skips
 *
 * Env: CDP_URL (default http://localhost:9222), DEV_URL / APP_URL (default
 * http://localhost:5173). Needs the QA emulator and seed:
 *   npm run qa:emulators   (one terminal)
 *   npm run qa:seed        (once)
 *   then the dev server with VITE_USE_FIREBASE_EMULATOR=true
 *
 * THE LAWS
 *   1. No capsules. No painted OBLONG element carries a radius reaching half
 *      its short side. A SQUARE box at that radius is a circle - a dot, an
 *      avatar - and is deliberate, so the box is measured before judging.
 *   2. Colour comes from tokens. Every painted colour on the page resolves to
 *      one the design system defines. The palette is read from the LIVE
 *      computed tokens at run time, never pasted here, so retuning a token
 *      cannot quietly turn this law into a no-op.
 *   3. The retired palette renders nowhere. #8B5CF6 and #3B82F6 were the
 *      client's parallel purple/blue until Wave A. Retired means gone, not
 *      documented as retired beside a live copy.
 *   4. No em dashes in rendered copy. Also catches the double hyphen that
 *      people reach for instead.
 *   5. Type floors. Body copy >= 15px, secondary >= 13px, mono micro >= 11px.
 *   6. Every figure holds its columns: numeric readouts compute tabular-nums.
 *
 * Law 2 is the one that earns its keep. A hardcoded hex passes tsc, passes
 * eslint, passes review, and is invisible until someone retunes the brand and
 * one card does not move.
 */

const CDP = process.env.CDP_URL ?? 'http://localhost:9222';
const DEV = process.env.DEV_URL ?? process.env.APP_URL ?? 'http://localhost:5173';
const PLANT = process.env.PLANT_VIOLATION === '1';

/*
 * The CDP plumbing and the sign-in flow live in tests/qa-session.mjs, shared
 * with the accessibility audit. This file used to carry its own copy of
 * openTab/connect/evaluate, which is two implementations of one thing waiting
 * to disagree.
 *
 * The import is dynamic because qa-session reads APP_URL when the module is
 * evaluated, and this harness has always been driven by DEV_URL. Setting it
 * first keeps one base URL for both rather than a second env var to remember.
 */
process.env.APP_URL ??= DEV;
const {
  evaluate, settle, signedInIsolatedTab, goto, incognitoTab,
} = await import('./qa-session.mjs');

// The planted violation and the in-page checks live in tests/design/.
import { PLANT_SCRIPT, PLANT_TARGET_LAWS } from './design/plantScript.mjs';
import { CHECKS } from './design/checks.mjs';


// ─────────────────────────────────────────────────────────────────────────────

/**
 * The product's own demo mode, entered the way the product enters it.
 *
 * Every routed surface worth linting sits behind auth, so without this the
 * harness could only ever measure /signin. These are the exact two session
 * keys client/src/pages/demo.tsx writes; AuthContext reads them and serves a
 * demo profile with no Firebase call.
 */
/**
 * Runs the laws against whatever the client is currently showing.
 *
 * Throws when the route under test is not the route on screen. A gate that
 * reports on a page it never reached is worse than no gate, because it is
 * believed: this harness once walked four authenticated routes, watched every
 * one bounce to /signin, and printed ALL GREEN having measured the sign-in
 * page four times.
 */
async function measure(client, route, { plant = false } = {}) {
  // A page that never came to rest is not a page that passed. This used to be
  // a bare `await settle(client)` whose timeout was indistinguishable from
  // success, and the laws then ran on whatever happened to be on screen.
  if (!(await settle(client))) {
    throw new Error('never settled: still loading when the laws were due to run');
  }

  const rendered = await evaluate(
    client,
    '(document.getElementById("root")?.children.length ?? 0) > 0',
  );
  if (!rendered) throw new Error('nothing rendered');

  const landed = await evaluate(client, 'location.pathname');
  if (landed !== route) {
    throw new Error(`redirected to ${landed}`);
  }

  if (plant) await evaluate(client, PLANT_SCRIPT);
  return evaluate(client, CHECKS);
}

// ─────────────────────────────────────────────────────────────────────────────
// THE RUNNER
//
// Three outcomes, reported as three different things, because they mean three
// different things and a reader scanning a log has to be able to tell them
// apart:
//
//   CLEAN        the laws ran on this route and found nothing
//   FAILING      the laws ran on this route and found something
//   NOT REACHED  the laws never ran here at all
//
// The third used to be indistinguishable from the first at a glance. That is
// the exact shape of every bug this codebase has spent a fortnight finding: a
// confident green from a check that never arrived. NOT REACHED fails the run
// unless --allow-unreached is passed, and either way it is named in the
// summary rather than left for someone to spot in the scrollback.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOW_UNREACHED = process.argv.includes('--allow-unreached');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/** Routes that render without a session. */
const PUBLIC_ROUTES = ['/'];
/** Routes behind ProtectedRoute, reached with the seeded sign-in. */
const PRIVATE_ROUTES = ['/dashboard', '/trips', '/leaderboard', '/rewards'];

const requested = args.map((a) => (a.startsWith('http') ? new URL(a).pathname : a));
const publicTargets = requested.length
  ? requested.filter((r) => PUBLIC_ROUTES.includes(r))
  : PUBLIC_ROUTES;
const privateTargets = requested.length
  ? requested.filter((r) => !PUBLIC_ROUTES.includes(r))
  : PRIVATE_ROUTES;

// Fail loudly rather than silently when Chrome is not listening: a harness
// that cannot reach the browser must never report green.
try {
  const res = await fetch(`${CDP}/json/version`);
  if (!res.ok) throw new Error(String(res.status));
} catch {
  console.log(`ERROR no Chrome on ${CDP}. Relaunch it with --remote-debugging-port=9222.`);
  process.exit(2);
}

// Same refusal for the app itself. When the dev server went down mid-session
// every route quietly became chrome-error://chromewebdata and the audit
// scored an error page.
try {
  const probe = await fetch(DEV, { redirect: 'manual' });
  if (!probe.ok && probe.status !== 304) throw new Error(`status ${probe.status}`);
} catch (err) {
  console.log(`ERROR cannot reach the app at ${DEV}: ${err.message}`);
  process.exit(2);
}

if (PLANT) console.log('PLANT_VIOLATION=1: a capsule in the retired purple is being injected.\n');

const outcomes = [];
let planted = false;

function record(route, state, laws, reason) {
  outcomes.push({ route, state, laws: laws ?? [], reason });
  if (state === 'notReached') {
    console.log(`\nNOT REACHED  ${route}\n        ${reason}`);
    return;
  }
  console.log(`\n${state === 'clean' ? 'CLEAN' : 'FAILING'}  ${route}`);
  for (const r of laws) {
    console.log(`  ${r.pass ? 'pass' : 'FAIL'}  law ${r.law}\n        ${r.detail}`);
  }
}

/** Runs the laws on one route and classifies the result. */
function classify(route, laws) {
  const broken = laws.filter((r) => !r.pass);
  record(route, broken.length ? 'failing' : 'clean', laws);
}

// ── Public routes: an isolated context, which also proves they do not
// silently depend on a session. A stale one turns "/" into the dashboard.
for (const route of publicTargets) {
  const session = await incognitoTab(`${DEV}${route}`);
  try {
    const laws = await measure(session.client, route, { plant: PLANT && !planted });
    if (PLANT) planted = true;
    classify(route, laws);
  } catch (error) {
    record(route, 'notReached', [], error.message);
  } finally {
    await session.dispose();
  }
}

// ── Private routes: one signed-in tab, navigated through the SPA router.
if (privateTargets.length) {
  let session = null;
  try {
    session = await signedInIsolatedTab();
  } catch (error) {
    for (const route of privateTargets) {
      record(route, 'notReached', [], `could not sign in: ${error.message}`);
    }
  }

  if (session) {
    const { client, signedIn, reachedDashboard } = session;
    // Two conditions, not one. `signedIn === 'ok'` says the form was submitted
    // and the route left /signin; `reachedDashboard` says ProtectedRoute
    // actually let us in once auth had finished enriching. Trusting the first
    // alone is how a run gets as far as /quick-onboarding and then reports on
    // whatever that renders.
    if (signedIn !== 'ok' || !reachedDashboard) {
      const why = signedIn !== 'ok'
        ? `sign-in did not complete: ${signedIn}`
        : 'signed in but ProtectedRoute did not admit us to /dashboard';
      for (const route of privateTargets) record(route, 'notReached', [], why);
    } else {
      for (const route of privateTargets) {
        try {
          await goto(client, route);
          const laws = await measure(client, route, { plant: PLANT && !planted });
          if (PLANT) planted = true;
          classify(route, laws);
        } catch (error) {
          record(route, 'notReached', [], error.message);
        }
      }
    }
    await session.dispose();
  }
}

// ─── SUMMARY ────────────────────────────────────────────────────────────────

const clean = outcomes.filter((o) => o.state === 'clean');
const failing = outcomes.filter((o) => o.state === 'failing');
const notReached = outcomes.filter((o) => o.state === 'notReached');

console.log('\n' + '-'.repeat(70));
console.log(
  `COVERAGE  ${clean.length + failing.length} of ${outcomes.length} routes measured` +
    (notReached.length ? `, ${notReached.length} NOT REACHED` : ''),
);
console.log(`  clean       ${clean.length}${clean.length ? '  ' + clean.map((o) => o.route).join(' ') : ''}`);
console.log(`  failing     ${failing.length}${failing.length ? '  ' + failing.map((o) => o.route).join(' ') : ''}`);
console.log(`  not reached ${notReached.length}${notReached.length ? '  ' + notReached.map((o) => o.route).join(' ') : ''}`);

if (PLANT) {
  const measured = outcomes.filter((o) => o.state !== 'notReached');
  const tripped = new Set(
    measured.flatMap((o) => o.laws.filter((r) => !r.pass).map((r) => String(r.law).split(' ')[0])),
  );
  const missed = PLANT_TARGET_LAWS.filter((law) => !tripped.has(law));

  if (!measured.length) {
    console.log('\nPLANT CHECK FAILED: no route was reached, so nothing was proven.');
    process.exit(1);
  }
  if (missed.length) {
    console.log(
      `\nPLANT CHECK FAILED: the plant went undetected by law(s) ${missed.join(', ')}. ` +
        'Those laws are not looking where the plant landed, so they are no-ops.',
    );
    process.exit(1);
  }
  console.log(
    `\nPLANT CHECK: laws ${PLANT_TARGET_LAWS.join(', ')} all caught the planted violation. The gate works.`,
  );
  process.exit(0);
}

if (failing.length) {
  console.log('\nDESIGN LAWS: FAILED, laws broken on ' + failing.length + ' route(s)');
  process.exit(1);
}
if (notReached.length && !ALLOW_UNREACHED) {
  console.log(
    '\nDESIGN LAWS: INCOMPLETE. No law was broken, but ' + notReached.length +
      ' route(s) were never measured, so this is not a pass.\n' +
      'Start the QA emulator and seed it (npm run qa:emulators, npm run qa:seed) and run the\n' +
      'dev server with VITE_USE_FIREBASE_EMULATOR=true, or pass --allow-unreached to accept the gap.',
  );
  process.exit(1);
}

console.log(
  notReached.length
    ? `\nDESIGN LAWS: ALL GREEN on ${clean.length} route(s), ${notReached.length} skipped by request`
    : `\nDESIGN LAWS: ALL GREEN on all ${clean.length} route(s)`,
);
process.exit(0);

