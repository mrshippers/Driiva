#!/usr/bin/env node
/**
 * Accessibility audit: axe-core driven over CDP, against the REAL surfaces.
 *
 * Signs in as the seeded emulator driver first, because dashboard, trips,
 * leaderboard and rewards are auth-gated and auditing the signed-out shell
 * would be measuring almost nothing. That is the whole reason this runs
 * through tests/qa-session.mjs rather than opening a bare tab.
 *
 * axe-core is injected from node_modules rather than a CDN: the harness has to
 * work with no network, and pinning the version in package.json is what stops
 * a rule set changing under us and the score moving for no reason.
 *
 * Fails on SERIOUS and CRITICAL only. Minor and moderate are reported so they
 * are visible, but they do not gate: a gate that fails on colour-contrast of a
 * disabled placeholder gets switched off within a week.
 *
 * Usage:
 *   node tests/axe-audit.mjs                 # all surfaces
 *   node tests/axe-audit.mjs /trips /rewards # named routes
 *   APP_URL=http://localhost:5202 node tests/axe-audit.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import {
  signedInIsolatedTab, goto, evaluate, incognitoTab, settle, APP,
} from './qa-session.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolved rather than path-joined. A literal ../node_modules path dies with
// ENOENT inside a git worktree, whose node_modules is partial, so the audit
// could not start there at all. Node's own resolution walks up to the parent
// checkout, which is where the dependency actually lives.
const AXE_SOURCE = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);

/** Routes reachable without signing in. */
const PUBLIC_ROUTES = ['/', '/signin', '/signup', '/terms', '/privacy', '/trust', '/demo'];

/** Routes that need the seeded session. */
const PRIVATE_ROUTES = ['/dashboard', '/trips', '/leaderboard', '/rewards', '/achievements', '/settings', '/profile'];

const GATING = new Set(['serious', 'critical']);

const requested = process.argv.slice(2);

async function runAxe(client) {
  await evaluate(client, AXE_SOURCE, { awaitPromise: false });
  /*
   * Exclude nodes injected by browser EXTENSIONS. This Chrome profile has
   * Adobe Acrobat in it, which mounts #aiFabShadowRoot with nested interactive
   * controls and reports as a serious violation on every single route. It is
   * not our markup and we cannot fix it, so counting it would just train
   * everyone to ignore the number.
   */
  const raw = await evaluate(
    client,
    `axe.run({ exclude: [['#aiFabShadowRoot'], ['.acrobat-button'], ['[data-adobe-extension]']] }, {
       resultTypes: ['violations'],
       runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
     }).then((r) => JSON.stringify({
       violations: r.violations.map((v) => ({
         id: v.id,
         impact: v.impact,
         help: v.help,
         nodes: v.nodes.length,
         sample: v.nodes.slice(0, 2).map((n) => n.target.join(' ')),
       })),
     }))`,
  );
  return JSON.parse(raw).violations;
}

function report(route, violations) {
  const gating = violations.filter((v) => GATING.has(v.impact));
  const other = violations.filter((v) => !GATING.has(v.impact));

  const status = gating.length === 0 ? 'PASS' : 'FAIL';
  console.log(`\n${status}  ${route}`);
  if (gating.length) {
    for (const v of gating) {
      console.log(`      ${v.impact.toUpperCase()}  ${v.id}: ${v.help}`);
      console.log(`         ${v.nodes} node(s), e.g. ${v.sample.join(' | ')}`);
    }
  }
  if (other.length) {
    const summary = other.map((v) => `${v.id}(${v.impact},${v.nodes})`).join(', ');
    console.log(`      note, not gating: ${summary}`);
  }
  if (!gating.length && !other.length) console.log('      no violations at any impact');
  return gating.length;
}

/*
 * Refuse to run against a dead app.
 *
 * When the dev server went down mid-session every route quietly became
 * chrome-error://chromewebdata, axe found no violations on an error page, and
 * the audit printed PASS seven times. A harness that cannot reach the thing it
 * is auditing must fail loudly, not score it.
 */
try {
  const probe = await fetch(APP, { redirect: 'manual' });
  if (!probe.ok && probe.status !== 304) throw new Error(`status ${probe.status}`);
} catch (err) {
  console.error(`Cannot reach the app at ${APP}: ${err.message}`);
  console.error('Start it with the QA env (see docs) before running the audit.');
  process.exit(2);
}

let failures = 0;
const counts = {};

/*
 * A route this audit never reached is not a route that passed.
 *
 * Skips used to `continue` without being counted, and the summary then read
 * "AXE: 0 serious or critical across 9 routes" while private routes had
 * silently bounced to /signin. Anyone scanning the log saw a clean gate. The
 * three states are counted separately now and the summary names the gap.
 */
const notReached = [];

// ── Public routes: a plain tab is enough, and using one proves these do not
// silently depend on a session.
for (const route of (requested.length ? requested.filter((r) => PUBLIC_ROUTES.includes(r)) : PUBLIC_ROUTES)) {
  const session = await incognitoTab(`${APP}${route}`);
  try {
    if (!(await settle(session.client))) {
      throw new Error('never settled: still loading when the audit was due to run');
    }
    // Report where we actually LANDED. A signed-out "/" is the welcome page,
    // but a stale session turns it into the dashboard, and auditing that under
    // the name "/" is how three routes came to report identical violations.
    const href = await evaluate(session.client, 'location.href');
    if (href.startsWith('chrome-error://')) throw new Error('the app did not load');
    const landed = await evaluate(session.client, 'location.pathname');
    const label = landed === route ? route : `${route} (landed ${landed})`;
    const violations = await runAxe(session.client);
    counts[label] = violations;
    failures += report(label, violations);
  } catch (err) {
    console.log(`\nERROR ${route}: ${err.message}`);
    failures += 1;
  } finally {
    await session.dispose();
  }
}

// ── Private routes: one signed-in tab, navigated through the SPA router.
const privateTargets = requested.length
  ? requested.filter((r) => PRIVATE_ROUTES.includes(r))
  : PRIVATE_ROUTES;

if (privateTargets.length) {
  /*
   * An ISOLATED context, so the run does not depend on whatever session the
   * shared Chrome profile happens to hold. This used to accept 'no-form' as a
   * success, which is exactly what an ALREADY signed-in profile produces: the
   * form is missing because /signin bounced. That passed while auditing
   * whoever the profile belonged to, and skipped everything when it belonged
   * to nobody.
   */
  const session = await signedInIsolatedTab();
  const { client, signedIn, reachedDashboard } = session;
  if (signedIn !== 'ok' || !reachedDashboard) {
    const why = signedIn !== 'ok'
      ? `could not sign in: ${signedIn}`
      : 'signed in but ProtectedRoute did not admit us to /dashboard';
    console.log(`\nNOT REACHED  every private route, ${why}`);
    notReached.push(...privateTargets);
  } else {
    for (const route of privateTargets) {
      try {
        await goto(client, route);
        const landed = await evaluate(client, 'location.pathname');
        if (landed !== route) {
          console.log(`\nNOT REACHED  ${route}, redirected to ${landed}`);
          notReached.push(route);
          continue;
        }
        const violations = await runAxe(client);
        counts[route] = violations;
        failures += report(route, violations);
      } catch (err) {
        console.log(`\nNOT REACHED  ${route}: ${err.message}`);
        notReached.push(route);
      }
    }
  }
  await session.dispose();
}

const totalGating = Object.values(counts)
  .flat()
  .filter((v) => GATING.has(v.impact))
  .reduce((sum, v) => sum + v.nodes, 0);

const measured = Object.keys(counts).length;
const total = measured + notReached.length;

console.log('\n' + '-'.repeat(70));
console.log(
  `COVERAGE  ${measured} of ${total} routes audited` +
    (notReached.length ? `, ${notReached.length} NOT REACHED` : ''),
);
if (notReached.length) console.log(`  not reached  ${notReached.join(' ')}`);

if (failures > 0) {
  console.log(`\nAXE: FAILED, ${totalGating} serious/critical node(s) across ${failures} route(s)`);
  process.exit(1);
}
if (notReached.length && !process.argv.includes('--allow-unreached')) {
  console.log(
    `\nAXE: INCOMPLETE. Nothing serious or critical on the ${measured} route(s) audited, but ` +
      `${notReached.length} were never reached, so this is not a pass.\n` +
      'Start the QA emulator and seed it (npm run qa:emulators, npm run qa:seed) and run the dev\n' +
      'server with VITE_USE_FIREBASE_EMULATOR=true, or pass --allow-unreached to accept the gap.',
  );
  process.exit(1);
}
console.log(`\nAXE: 0 serious or critical across ${measured} route(s) audited`);
process.exit(0);
