/**
 * Shared CDP session helper for the QA gates.
 *
 * Attaches to the Chrome already on :9222 (per CLAUDE.md, never launch one),
 * signs in as the seeded emulator driver, and hands back a tab that can reach
 * the authenticated surfaces.
 *
 * Signing in is done through the app's own sign-in form rather than by
 * injecting a token, so the session is exactly the one a real user gets and
 * the pages run their real auth paths.
 */

export const CDP = process.env.CDP_URL ?? 'http://localhost:9222';
export const APP = process.env.APP_URL ?? 'http://localhost:5202';
export const QA_EMAIL = process.env.QA_EMAIL ?? 'qa.driver@driiva.test';
export const QA_PASSWORD = process.env.QA_PASSWORD ?? 'qa-password-123';

export async function openTab(url) {
  const res = await fetch(`${CDP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`could not open a tab: ${res.status}`);
  return res.json();
}

export async function closeTab(id) {
  await fetch(`${CDP}/json/close/${id}`).catch(() => {});
}

export function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
  });

  return {
    ready,
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close: () => socket.close(),
  };
}

export async function evaluate(client, expression, { awaitPromise = true } = {}) {
  const { result, exceptionDetails } = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description ?? 'page threw');
  }
  return result.value;
}

/**
 * Every way this app can say "not ready yet", in one selector.
 *
 * Exported so the gate and the app are held together by a test rather than by
 * hope: tests/unit/qa-settle-busy.test.tsx renders the real loading components
 * through this exact string, so re-marking one of them fails a test instead of
 * quietly widening the window below.
 *
 * `[data-app-loading]` is BrandedLoader, and it is the entry that was missing.
 * See the comment in settle for what that cost.
 */
export const BUSY_SELECTOR =
  '.skeleton-shimmer, .loading-shimmer, [data-skeleton], [data-app-loading]';

/**
 * Polls until the page stops changing. Short probes from here rather than one
 * long in-page promise: any navigation destroys the page's execution context,
 * and a long wait inside the page is itself what throws when that happens.
 *
 * Returns true if the page came to rest, false if it ran out of time. CALLERS
 * MUST CHECK. It used to return the same nothing either way, which made a
 * timeout indistinguishable from a measurement.
 */
export async function settle(client, { timeoutMs = 20000 } = {}) {
  /*
   * The app's loading states and web fonts are part of the sample on purpose.
   *
   * Without them a page settles on its own LOADING state, and the gate then
   * measures placeholders: the design laws once reported a capsule violation
   * from the dashboard's skeleton bars and "NO PROSE FOUND", having never seen
   * the dashboard. The accessibility audit had the same weakness from the other
   * end, reporting nine colour-contrast violations on a leaderboard that was
   * still drawing its chart, then reporting none on the next run.
   *
   * Counting SKELETONS ALONE was not enough, and this is how that was found.
   * `/leaderboard` failed law 5 with "NO PROSE FOUND" on one run and passed on
   * the two either side of it, same commit, in a diff that never touched the
   * route. Logging every sample taken during a run caught the frame:
   *
   *   1:926:26:1:sk0  ->  { text: "Home\nTrips\nRewards\nProfile", loader: true }
   *
   * BrandedLoader filling the screen, and the only text on the page coming from
   * the nav underneath it. Both questions this asks gave the wrong answer: there
   * IS text, 26 characters of nav labels, and there are NO skeletons, because
   * BrandedLoader draws a pulsing logo rather than skeleton bars. Three such
   * samples in a row and the laws run against a blank screen. Every nav label is
   * shorter than the 12 characters law 5 counts as prose, so the gate reported a
   * type-floor violation on a page it had never seen.
   *
   * The fix is not a longer wait or a text-length threshold: a page is allowed
   * to be terse. It is that the loader now says so itself, so the sample counts
   * every loading surface the app has, not the one kind it happened to know.
   *
   * One definition of "settled" for all three gates, so they cannot disagree
   * about when a page is ready to be judged.
   */
  const SAMPLE = `(() => {
    const root = document.getElementById('root');
    const busy = document.querySelectorAll(${JSON.stringify(BUSY_SELECTOR)}).length;
    return (root ? root.children.length : 0) + ':' +
           document.querySelectorAll('body *').length + ':' +
           document.body.innerText.length + ':' +
           (document.fonts.status === 'loaded' ? 1 : 0) + ':' +
           'sk' + busy;
  })()`;

  let last = '';
  let stable = 0;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    let now = '';
    try {
      now = await evaluate(client, SAMPLE);
    } catch {
      last = '';
      stable = 0;
      await new Promise((r) => setTimeout(r, 300));
      continue;
    }
    // Still loading counts as not settled, whether that is an empty root, no
    // text, unloaded fonts, or anything still saying it is busy.
    const empty = now.startsWith('0:') || now.includes(':0:') || !now.endsWith(':sk0');
    stable = !empty && now === last ? stable + 1 : 0;
    last = now;
    if (stable >= 3) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/**
 * Fills and submits the sign-in form. Shared by both sign-in helpers so there
 * is one description of how this app is signed into, not two that drift.
 */
const SIGN_IN_SCRIPT = `(async () => {
  const email = document.querySelector('input[type="email"], input[placeholder*="you@" i]');
  const password = document.querySelector('input[type="password"]');
  if (!email || !password) return 'no-form';

  const setValue = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value',
    ).set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  setValue(email, ${JSON.stringify(QA_EMAIL)});
  setValue(password, ${JSON.stringify(QA_PASSWORD)});

  const button = [...document.querySelectorAll('button')].find((b) =>
    /sign in/i.test(b.textContent || ''));
  if (!button) return 'no-button';
  button.click();

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (!location.pathname.startsWith('/signin')) return 'ok';
  }
  return 'stuck:' + document.body.innerText.slice(0, 200);
})()`;

/**
 * Opens a tab, signs in through the real form, and returns { tab, client }.
 * The caller navigates onward and must call closeTab when finished.
 */
export async function signedInTab() {
  const tab = await openTab(`${APP}/signin`);
  const client = connect(tab.webSocketDebuggerUrl);
  await client.ready;
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await settle(client);

  const signedIn = await evaluate(client, SIGN_IN_SCRIPT);
  await settle(client);

  /*
   * Wait for auth to finish ENRICHING, not merely to resolve.
   *
   * AuthContext returns a user quickly and fills in onboardingComplete from
   * Firestore a moment later. Navigating in that window sends ProtectedRoute
   * to /quick-onboarding, and the audit then silently skipped every
   * authenticated route and reported a suspiciously clean score. A gate that
   * measures nothing and says PASS is worse than one that fails.
   */
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    await evaluate(
      client,
      `(() => { history.pushState({}, '', '/dashboard');
                dispatchEvent(new PopStateEvent('popstate')); return true; })()`,
      { awaitPromise: false },
    );
    await settle(client);
    const path = await evaluate(client, 'location.pathname');
    if (path === '/dashboard') break;
    await new Promise((r) => setTimeout(r, 500));
  }

  return { tab, client, signedIn };
}

/**
 * Navigates an existing signed-in tab via the SPA router and settles.
 *
 * Throws if the page never settles, so a route that is still loading is
 * reported as NOT REACHED by both gates rather than measured mid-load.
 */
export async function goto(client, path) {
  await evaluate(
    client,
    `(() => {
       history.pushState({}, '', ${JSON.stringify(path)});
       dispatchEvent(new PopStateEvent('popstate'));
       return true;
     })()`,
    { awaitPromise: false },
  );
  if (!(await settle(client))) {
    throw new Error(`never settled: still loading after navigating to ${path}`);
  }
}

/**
 * Opens a tab in a FRESH, isolated browser context: no cookies, no IndexedDB,
 * so no signed-in session.
 *
 * Needed because the audit's public routes were being measured against a
 * profile that already had a session, so "/" and "/signin" both redirected to
 * the dashboard and got audited as if they were the signed-out pages. Three
 * routes were reporting the dashboard's violations under the wrong names.
 *
 * This creates a context, not a browser: CLAUDE.md's rule is never to launch a
 * second Chrome, and Target.createBrowserContext runs inside the one already
 * attached.
 */
export async function incognitoTab(url) {
  const browserWs = (await (await fetch(`${CDP}/json/version`)).json()).webSocketDebuggerUrl;
  const browser = connect(browserWs);
  await browser.ready;

  const { browserContextId } = await browser.send('Target.createBrowserContext', {
    disposeOnDetach: false,
  });
  const { targetId } = await browser.send('Target.createTarget', { url, browserContextId });

  const targets = await (await fetch(`${CDP}/json/list`)).json();
  const tab = targets.find((t) => t.id === targetId);
  if (!tab) throw new Error('could not find the isolated tab');

  const client = connect(tab.webSocketDebuggerUrl);
  await client.ready;
  await client.send('Runtime.enable');

  return {
    client,
    async dispose() {
      client.close();
      await browser.send('Target.closeTarget', { targetId }).catch(() => {});
      await browser.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
      browser.close();
    },
  };
}

/**
 * A signed-in tab in an ISOLATED browser context.
 *
 * signedInTab() opens a tab in the shared Chrome profile, so whatever session
 * that profile is already holding decides what happens. If it holds a valid
 * session, /signin bounces to the dashboard, the sign-in form is not there,
 * and the helper returns 'no-form' having signed nobody in. If it holds a
 * STALE session, or a different user's, the harness measures that user's
 * surfaces under the seeded user's name. Either way the run depends on the
 * ambient state of a browser nobody controls, and a harness whose reach varies
 * invisibly between runs is the thing every gate here exists to prevent.
 *
 * This starts from a context with no cookies and no IndexedDB, so the sign-in
 * form is always present and the session is always the seeded driver's. It
 * costs one extra context per run and removes the entire class.
 */
export async function signedInIsolatedTab() {
  const session = await incognitoTab(`${APP}/signin`);
  const { client } = session;
  await client.send('Page.enable').catch(() => {});
  await settle(client);

  const signedIn = await evaluate(client, SIGN_IN_SCRIPT);
  await settle(client);

  // Wait for auth to finish ENRICHING, not merely to resolve: AuthContext
  // returns a user quickly and fills onboardingComplete from Firestore a
  // moment later, and navigating in that window sends ProtectedRoute to
  // /quick-onboarding.
  const deadline = Date.now() + 20000;
  let reachedDashboard = false;
  while (Date.now() < deadline) {
    await evaluate(
      client,
      `(() => { history.pushState({}, '', '/dashboard');
                dispatchEvent(new PopStateEvent('popstate')); return true; })()`,
      { awaitPromise: false },
    );
    await settle(client);
    if ((await evaluate(client, 'location.pathname')) === '/dashboard') {
      reachedDashboard = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  return { ...session, signedIn, reachedDashboard };
}
