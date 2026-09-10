#!/usr/bin/env node
/**
 * Reduced motion on the marketing reveals, measured in a real browser.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT A JSDOM TEST.
 * `.reveal-init` starts at opacity 0 and is made visible again by two
 * independent mechanisms. The JS path, where `useReveal` and the hero timeline
 * assign the resting style, is already covered by `Hero.test.tsx` and runs on
 * every commit. The CSS path is the `.reveal-init` override inside
 * `@media (prefers-reduced-motion: reduce)`, and it is what catches every
 * element the JS never reaches - which is every element whose section has not
 * intersected, so most of the page on first paint.
 *
 * That half cannot be tested in jsdom. jsdom applies no stylesheet, so it
 * would report those elements at opacity 0 and manufacture a bug that does not
 * exist. Reading the source says it resolves - the override follows the base
 * rule at equal specificity - but a source fact is exactly the kind of
 * evidence the rendered-behaviour pass exists to avoid relying on. So this
 * runs a browser, emulates the preference, and reads computed style.
 *
 * THE CONTROL RUN IS NOT OPTIONAL. Every route is measured twice, once with
 * the preference set to reduce and once with it at no-preference. If the
 * untouched elements read opacity 1 in BOTH passes, the stylesheet is not
 * reaching them at all and a green here would mean nothing, so that is
 * reported as INCONCLUSIVE rather than as a pass. A gate that cannot tell the
 * difference between "the rule works" and "there is no rule" is the failure
 * mode this whole harness set was built against.
 *
 * It ATTACHES to the Chrome already on :9222 per CLAUDE.md, in an isolated
 * browser context, and closes only what it opened.
 *
 * The site is served from the PRODUCTION build, not the dev server: the
 * question is about rule ordering in the shipped stylesheet, and a dev server
 * injects CSS a different way. A zero-dependency static server is used rather
 * than `vite preview` so this runs without apps/marketing/node_modules.
 *
 * Usage:
 *   node tests/marketing-reduced-motion.mjs        # serves apps/marketing/dist
 *   PLANT_VIOLATION=1 node tests/...               # prove it can fail
 *   MARKETING_URL=http://localhost:4173 node ...   # judge a site already up
 *
 * Exit: 0 clean, 1 a route is hiding content, 2 could not measure.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { incognitoTab, evaluate, settle, CDP } from './qa-session.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'apps', 'marketing', 'dist');
const PLANT = process.env.PLANT_VIOLATION === '1';
const PORT = Number(process.env.MARKETING_PORT ?? 4184);

/** The prerendered routes. Any of them may carry reveals; none has to. */
const ROUTES = ['/', '/uk-survey', '/privacy', '/terms', '/cookies', '/complaints'];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Serves apps/marketing/dist. Directory requests resolve to the PRERENDERED
 * index.html inside them rather than falling back to the root one, because the
 * prerender is what production serves and a root-index fallback would quietly
 * measure the home page under five other route names.
 */
function serveDist() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const rel = decodeURIComponent(url.pathname);
    // Sanitised: a request must not be able to read outside dist.
    const resolved = path.resolve(DIST, `.${rel}`);
    if (resolved !== DIST && !resolved.startsWith(DIST + path.sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const candidates = rel.endsWith('/')
      ? [path.join(resolved, 'index.html')]
      : [resolved, path.join(resolved, 'index.html')];
    for (const file of candidates) {
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
        res.end(body);
        return;
      } catch { /* try the next candidate */ }
    }
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

/*
 * One reading of the page. `inlineOpacity` is how a JS-touched element is told
 * apart from one the JS never reached: useReveal and anime.js both write to
 * el.style, and only the untouched ones are evidence about the stylesheet.
 */
const MEASURE = `(() => {
  const rows = [];
  for (const el of document.querySelectorAll('.reveal-init')) {
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const cls = String(el.getAttribute('class') || '').trim().split(/\\s+/).slice(0, 3).join('.');
    rows.push({
      label: el.tagName.toLowerCase() + (cls ? '.' + cls : ''),
      touched: el.style.opacity !== '' || el.style.transform !== '',
      opacity: cs.opacity,
      transform: cs.transform,
      inViewport: box.top < innerHeight && box.bottom > 0,
    });
  }
  return JSON.stringify({
    rows,
    reduceMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
})()`;

/** The planted defect: an override the real stylesheet does not carry. */
const PLANT_STYLE = `(() => {
  const style = document.createElement('style');
  style.textContent =
    '@media (prefers-reduced-motion: reduce) {' +
    '  html body .reveal-init { opacity: 0 !important; transform: translateY(24px) !important; }' +
    '}';
  document.head.appendChild(style);
  return true;
})()`;

/**
 * Loads one route under one motion preference and reads every `.reveal-init`.
 * The preference is emulated BEFORE navigation so the page's own matchMedia
 * reads it from the first frame, not after it has already decided.
 */
async function measure(url, preference, { plant = false } = {}) {
  const session = await incognitoTab('about:blank');
  const { client } = session;
  try {
    await client.send('Page.enable');
    // A fixed viewport so "below the fold" means the same thing every run.
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
    });
    await client.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: preference }],
    });
    await client.send('Page.navigate', { url });
    if (!(await settle(client))) {
      throw new Error(`never settled: ${url} was still loading when it was due to be measured`);
    }
    if (plant) await evaluate(client, PLANT_STYLE, { awaitPromise: false });
    return JSON.parse(await evaluate(client, MEASURE, { awaitPromise: false }));
  } finally {
    await session.dispose();
  }
}

function summarise(rows) {
  const untouched = rows.filter((r) => !r.touched);
  return {
    total: rows.length,
    untouched,
    hidden: untouched.filter((r) => Number(r.opacity) < 1),
  };
}

// ─── PREFLIGHT ──────────────────────────────────────────────────────────────

try {
  const res = await fetch(`${CDP}/json/version`);
  if (!res.ok) throw new Error(String(res.status));
} catch {
  console.log(`ERROR no Chrome on ${CDP}. Relaunch it with --remote-debugging-port=9222.`);
  process.exit(2);
}

const external = process.env.MARKETING_URL;
if (!external && !existsSync(path.join(DIST, 'index.html'))) {
  console.log(
    'ERROR no build to measure at apps/marketing/dist.\n'
    + '      Run: npm --prefix apps/marketing ci && npm --prefix apps/marketing run build',
  );
  process.exit(2);
}

let server = null;
let base = external;
if (!external) {
  try {
    server = await serveDist();
    base = `http://127.0.0.1:${PORT}`;
  } catch (error) {
    console.log(`ERROR could not serve apps/marketing/dist on ${PORT}: ${error.message}`);
    console.log('      Set MARKETING_PORT, or point MARKETING_URL at a site already up.');
    process.exit(2);
  }
}

if (PLANT) {
  console.log('PLANT_VIOLATION=1: an override that re-hides .reveal-init under reduce is being injected.\n');
}
console.log(`Reduced-motion reveal check against ${base}\n`);

// ─── MEASURE ────────────────────────────────────────────────────────────────

const outcomes = [];

for (const route of ROUTES) {
  const url = `${base}${route}`;
  let reduce;
  let control;
  try {
    reduce = await measure(url, 'reduce', { plant: PLANT });
    control = await measure(url, 'no-preference');
  } catch (error) {
    outcomes.push({ route, state: 'notMeasured', reason: error.message });
    console.log(`NOT MEASURED  ${route}\n        ${error.message}`);
    continue;
  }

  if (!reduce.reduceMatches) {
    outcomes.push({ route, state: 'notMeasured', reason: 'the browser did not report the emulated preference' });
    console.log(`NOT MEASURED  ${route}\n        the browser did not report the emulated preference`);
    continue;
  }

  const under = summarise(reduce.rows);
  const plain = summarise(control.rows);

  if (under.total === 0) {
    outcomes.push({ route, state: 'noReveals' });
    console.log(`NO REVEALS    ${route}`);
    continue;
  }

  /*
   * The control has to find something hidden, or the run proves nothing: if
   * nothing is hidden without the preference then nothing needed the override
   * and a clean reduce pass is measuring an absent rule.
   */
  if (plain.hidden.length === 0) {
    const reason = plain.untouched.length === 0
      ? 'every reveal was reached by JS, so the CSS path was never exercised'
      : 'no reveal is hidden without the preference, so the base rule is not applying';
    outcomes.push({ route, state: 'inconclusive', reason });
    console.log(`INCONCLUSIVE  ${route}\n        ${reason}`);
    continue;
  }

  if (under.hidden.length) {
    outcomes.push({ route, state: 'failing', hidden: under.hidden });
    console.log(`FAILING       ${route}`);
    console.log(`        ${under.hidden.length} of ${under.untouched.length} untouched reveals stay hidden under reduce`);
    for (const row of under.hidden.slice(0, 5)) {
      console.log(`          ${row.label}  opacity ${row.opacity}  transform ${row.transform}`);
    }
    continue;
  }

  outcomes.push({ route, state: 'clean', checked: under.untouched.length });
  console.log(
    `CLEAN         ${route}\n`
    + `        ${under.untouched.length} untouched reveals visible under reduce, `
    + `${plain.hidden.length} of them hidden without it`,
  );
}

server?.close();

// ─── SUMMARY ────────────────────────────────────────────────────────────────

const clean = outcomes.filter((o) => o.state === 'clean');
const failing = outcomes.filter((o) => o.state === 'failing');
const inconclusive = outcomes.filter((o) => o.state === 'inconclusive');
const notMeasured = outcomes.filter((o) => o.state === 'notMeasured');
const noReveals = outcomes.filter((o) => o.state === 'noReveals');

console.log(
  `\n${clean.length} clean, ${failing.length} failing, ${inconclusive.length} inconclusive, `
  + `${notMeasured.length} not measured, ${noReveals.length} with no reveals`,
);

if (notMeasured.length || inconclusive.length) {
  console.log('INCOMPLETE - a route was not judged, which is not the same as a pass.');
  process.exit(1);
}
if (failing.length) {
  console.log('RED - content stays invisible for a reader who asked for less motion.');
  process.exit(1);
}
if (clean.length === 0) {
  console.log('INCOMPLETE - no route carried a reveal, so nothing was checked.');
  process.exit(1);
}
console.log('GREEN');
