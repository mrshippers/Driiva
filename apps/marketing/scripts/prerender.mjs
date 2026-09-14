/**
 * Build-time prerender.
 *
 * Runs after `vite build` (client) and `vite build --ssr` (server). For every
 * route it renders the real React tree to static HTML and writes a dedicated
 * dist/<route>/index.html carrying that markup plus its own title, description
 * and self-referencing canonical.
 *
 * Before this existed every route served a byte-identical 5.7 kB shell, all six
 * canonicalling to the homepage, so nothing but "/" could ever index.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dist = join(root, 'dist');

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Route table comes from src/lib/route-meta.ts via the SSR bundle, so the
// static head written here and the title the client sets after a client-side
// navigation can never drift apart.
const {
  render,
  ROUTE_META: ROUTES,
  ORIGIN,
  fullTitle,
  FAQS,
} = await import(join(root, 'dist-ssr', 'entry-server.js'));
const template = readFileSync(join(dist, 'index.html'), 'utf8');

// Guard: if the template stops matching what we rewrite, fail the build loudly
// rather than silently shipping six identical shells again.
const REQUIRED = [
  /<title>[\s\S]*?<\/title>/,
  /<meta\s+name="description"[\s\S]*?\/>/,
  /<link rel="canonical"[^>]*\/>/,
  /<div id="root"><\/div>/,
  // If the marker goes, the FAQ schema silently stops shipping. Fail instead:
  // a page with no FAQPage schema is recoverable, a page with a stale one is a
  // false regulatory claim served to a crawler.
  /<!--FAQ_JSONLD-->/,
];
for (const re of REQUIRED) {
  if (!re.test(template)) {
    throw new Error(`prerender: template no longer matches ${re}. Fix scripts/prerender.mjs.`);
  }
}

/**
 * FAQPage schema, built from the same array <FAQ /> renders.
 *
 * These answers were hand-typed into index.html as well as written in
 * src/sections/FAQ.tsx. The pair drifted, and the copy that drifted wrong was
 * the machine-readable one, so the claim Google indexed about our regulatory
 * status was stronger than the claim on the page. One source now; the schema
 * cannot say anything the visible FAQ does not.
 */
if (FAQS.length === 0) {
  throw new Error('prerender: FAQS is empty. Refusing to ship an empty FAQPage schema.');
}

const faqJsonLd = `<script type="application/ld+json">
${JSON.stringify(
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  },
  null,
  2,
)
  // A "<" inside a JSON string would end the script element early.
  .replace(/</g, '\\u003c')}
</script>`;


let written = 0;
for (const route of ROUTES) {
  const url = `${ORIGIN}${route.path}`;
  const title = fullTitle(route);
  const body = render(route.path);

  const html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(
      /<meta\s+name="description"[\s\S]*?\/>/,
      `<meta name="description" content="${esc(route.desc)}" />`,
    )
    .replace(/<link rel="canonical"[^>]*\/>/, `<link rel="canonical" href="${url}" />`)
    .replace(
      /<meta property="og:title"[^>]*\/>/,
      `<meta property="og:title" content="${esc(title)}" />`,
    )
    .replace(
      /<meta property="og:description"[^>]*\/>/,
      `<meta property="og:description" content="${esc(route.desc)}" />`,
    )
    .replace(/<meta property="og:url"[^>]*\/>/, `<meta property="og:url" content="${url}" />`)
    .replace(
      /<meta name="twitter:title"[^>]*\/>/,
      `<meta name="twitter:title" content="${esc(title)}" />`,
    )
    .replace(
      /<meta name="twitter:description"[^>]*\/>/,
      `<meta name="twitter:description" content="${esc(route.desc)}" />`,
    )
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)
    .replace('<!--FAQ_JSONLD-->', () => faqJsonLd);

  const outPath =
    route.path === '/' ? join(dist, 'index.html') : join(dist, route.path, 'index.html');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);

  const words = body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  if (words < 40) {
    throw new Error(`prerender: ${route.path} rendered only ${words} words. Refusing to ship.`);
  }
  console.log(`prerendered ${route.path.padEnd(12)} ${words} words -> ${outPath}`);
  written += 1;
}

console.log(`prerender: ${written} routes written`);
