import { renderToString } from 'react-dom/server';
import { Router } from 'wouter';
import App from './App';

// Re-exported so scripts/prerender.mjs reads the same table the client does.
export { ROUTE_META, ORIGIN, fullTitle } from './lib/route-meta';
// Same reason: the FAQPage JSON-LD is generated from the array the visible
// FAQ renders, so the two cannot disagree.
export { QS as FAQS } from './sections/FAQ';

/**
 * Server entry, used only by scripts/prerender.mjs at build time.
 *
 * The site is a client-rendered SPA, which meant a crawler fetching any URL got
 * `<div id="root"></div>` and nothing else: no H1, no copy, and the same title
 * and canonical on every route. Google can render JS on a second pass, but the
 * AI crawlers (GPTBot, PerplexityBot, ClaudeBot) largely do not, so the site was
 * invisible to them.
 *
 * We render each route to static HTML at build time and bake it into the
 * shipped index.html files. The browser still does a full client render on top
 * via createRoot (NOT hydrateRoot), so nothing here has to be hydration-stable
 * and time-dependent UI like the beta countdown is free to differ.
 */
export function render(url: string): string {
  return renderToString(
    <Router ssrPath={url}>
      <App />
    </Router>,
  );
}
