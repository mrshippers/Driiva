#!/usr/bin/env node
/**
 * Fabrication laws for the WEB surfaces.
 *
 * Wave 0 swept this repo for invented data by grepping literals somebody had
 * already named: DEEP_INSIGHTS, "117", a list of fake first names. That finds
 * the lies you have already found. It walked straight past a fabricated
 * leaderboard on the first screen of mobile onboarding, a downloadable policy
 * document carrying an invented FCA registration number, and a marketing site
 * reporting the community pool as 68% funded.
 *
 * So this does not grep for known lies. It greps for the SHAPES a lie takes in
 * an insurtech that has not launched, and then requires every single hit to be
 * signed off by name in ALLOWED below. New hits fail; they do not have to be
 * false, they have to be ACKNOWLEDGED. That is the difference between a lint
 * that finds yesterday's problem and one that catches tomorrow's.
 *
 * STYLESHEETS COUNT AS SOURCE. This originally read .ts and .tsx only, and the
 * same invented waitlist figure got onto the screen three times by three routes,
 * each found by a different method and never by the previous sweep: hardcoded in
 * a component, padded at source in an env default, and finally printed straight
 * out of a stylesheet as
 *     .sticky-cta-inner::before { content: '117+ on the list'; }
 * shown to every reader under 560px while the true count was zero. A lint that
 * reads components and not the CSS beside them does not cover the surface, it
 * covers the half of it people think to look at. CSS can put words on a page
 * three ways and all three are linted here: a `content` string, `content:
 * attr()` pulling an attribute onto the screen, and text baked into an inline
 * SVG data URI.
 *
 * Usage:
 *   node tests/fabrication-laws.mjs                    # lint
 *   PLANT_VIOLATION=1 node tests/fabrication-laws.mjs  # prove it can fail
 *
 * Adding an allowlist entry is the intended workflow, not a defeat. It costs
 * one line and a reason, and the reason is the point: it forces someone to
 * write down why a number about money or a claim about regulation is true.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

function repoRoot() {
  try {
    const here = new URL('..', import.meta.url);
    if (here.protocol === 'file:') return fileURLToPath(here);
  } catch {
    // fall through to cwd
  }
  return process.cwd();
}

const ROOT = repoRoot();
// `apps/marketing/public` is here because llms.txt and robots.txt are copy too.
// A machine-readable summary written FOR AI systems is the one file guaranteed
// to be read and repeated verbatim by something that cannot check it, so an
// invented regulatory position there travels further than the same sentence in
// a component. It sat outside this lint until 10 Aug 2026 purely because it is
// not .tsx.
// `mobile/app` and `mobile/components` are here because the law could not see
// them until 26 Aug 2026, and that is where the damage was. Of the eight files
// still claiming "pending FCA authorisation" sixteen days after the sweep that
// was meant to have removed it, SEVEN were mobile screens. Widening the regex
// alone would have caught exactly one of the eight. A guard that reads two of
// the three surfaces does not cover the product, it covers the part somebody
// remembered to point it at, and the mobile app is the surface a user actually
// signs up through.
//
// HTML is here since 9 Sep 2026, and so is the single file
// `apps/marketing/index.html`. The visible FAQ said "Not yet. We are working
// towards the FCA regulatory sandbox"; the JSON-LD in the page head, two
// directories up from anything this law read, said "Application in progress
// with the FCA Regulatory Sandbox". Nothing has been submitted. Google reads
// the JSON-LD, so the structured claim a machine consumes was the false one
// and the visible claim a human reads was the true one. The law's own
// regulatory-claim shape matched that sentence on the first try once pointed
// at the file: the guard was never blind, it was aimed away from the surface.
const DIRS = [
  'client/src',
  'apps/marketing/src',
  'apps/marketing/api',
  'apps/marketing/public',
  'apps/marketing/index.html',
  'server',
  'functions/src',
  'mobile/app',
  'mobile/components',
];
const SKIP = /node_modules|__tests__|\.test\.|\.spec\.|__snapshots__/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    // A DIRS entry may name a single FILE. apps/marketing/index.html is one:
    // the site's JSON-LD lived there, told Google an FCA application was in
    // flight, and no sweep ever read it because the walker only took
    // directories and the extension filter only took .ts/.tsx/.css/.txt/.md.
    try {
      if (statSync(dir).isFile()) out.push(dir);
    } catch {
      // absent path, nothing to lint
    }
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(tsx?|css|txt|md|html)$/.test(entry) && !SKIP.test(full)) {
      out.push(full);
    }
  }
  return out;
}

// The shapes, the acknowledged hits, the source readers and the planted
// fixtures live in tests/fabrication/.
import { lineOf } from './fabrication/extract.mjs';
import { LAWS } from './fabrication/laws.mjs';
import { ALLOWED } from './fabrication/allowed.mjs';
import {
  PLANTED,
  PLANTED_CSS,
  PLANTED_LINES_THAT_MUST_TRIP,
} from './fabrication/planted.mjs';


export function runFabricationLaws({ planted = false } = {}) {
  const files = DIRS.flatMap((dir) => walk(join(ROOT, dir))).map((f) =>
    relative(ROOT, f).split('\\').join('/'),
  );

  const targets = files.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]);
  if (planted) {
    targets.push(['planted.tsx', PLANTED]);
    targets.push(['planted.css', PLANTED_CSS]);
  }

  const results = LAWS.map((law) => ({ id: law.id, title: law.title, violations: [] }));

  for (const [file, source] of targets) {
    LAWS.forEach((law, i) => {
      if (law.filesOnly && !law.filesOnly.test(file)) return;
      // A law either greps for a shape or, where a regex would drown in false
      // positives, walks the syntax itself. Both yield {index, text}.
      const hits = law.extract
        ? law.extract(source)
        : [...source.matchAll(law.pattern)].map((m) => ({ index: m.index, text: m[0] }));
      for (const hit of hits) {
        const text = hit.text.trim();
        const key = `${file}::${text.toLowerCase()}`;
        if (ALLOWED.has(key)) continue;
        results[i].violations.push({ file, line: lineOf(source, hit.index), detail: text });
      }
    });
  }

  return { fileCount: files.length, laws: results, total: results.reduce((n, l) => n + l.violations.length, 0) };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

if (!process.env.VITEST && process.argv[1] && process.argv[1].endsWith('fabrication-laws.mjs')) {
  const planted = process.env.PLANT_VIOLATION === '1';
  if (planted) console.log('PLANT_VIOLATION=1: a file breaking every law is linted alongside the real source.\n');

  const result = runFabricationLaws({ planted });
  console.log(`fabrication laws: ${result.fileCount} files\n`);

  let failed = 0;
  for (const law of result.laws) {
    if (law.violations.length === 0) {
      console.log(`  pass  ${law.title}`);
      continue;
    }
    failed += 1;
    console.log(`  FAIL  ${law.title} (${law.violations.length})`);
    for (const v of law.violations.slice(0, 15)) {
      console.log(`          ${v.file}:${v.line}  ${v.detail}`);
    }
    if (law.violations.length > 15) console.log(`          ... and ${law.violations.length - 15} more`);
  }

  console.log('');
  if (planted) {
    const quiet = result.laws.filter((l) => l.violations.length === 0);
    if (quiet.length > 0) {
      console.log(`planted run did NOT trip: ${quiet.map((l) => l.id).join(', ')}`);
      process.exit(1);
    }

    // A law firing somewhere is not the same as a law firing on the specimen
    // it was written for. Check the specimens themselves.
    const missed = PLANTED_LINES_THAT_MUST_TRIP.filter(([lawId, needle]) => {
      const law = result.laws.find((l) => l.id === lawId);
      if (!law) return true;
      const source = PLANTED.split('\n');
      return !law.violations.some(
        (v) => v.file === 'planted.tsx' && (source[v.line - 1] || '').includes(needle),
      );
    });
    if (missed.length > 0) {
      console.log('planted run missed the specimens it was written for:');
      for (const [lawId, needle] of missed) console.log(`          ${lawId}  "${needle}"`);
      process.exit(1);
    }

    console.log('planted run tripped every law, as it must.');
    console.log(`and caught all ${PLANTED_LINES_THAT_MUST_TRIP.length} named specimens by line.`);
    process.exit(0);
  }
  if (failed) {
    console.log('Each hit is either a fabrication to delete, or a true statement to add to ALLOWED with a reason.');
  }
  process.exit(failed ? 1 : 0);
}

