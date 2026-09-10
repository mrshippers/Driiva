/**
 * The contract of `settle`, the one definition of "this page is ready to be
 * judged" that every visual gate shares.
 *
 * WHY THIS FILE EXISTS. `/leaderboard` failed the design laws with "NO PROSE
 * FOUND" on one run out of three and passed on the two either side, on the same
 * commit, in a diff that never touched that route. Traced by logging every
 * sample `settle` took during the run, the failing state is this frame:
 *
 *   1:926:26:1:sk0  ->  { text: "Home\nTrips\nRewards\nProfile", loader: true }
 *
 * That is `BrandedLoader` filling the screen, the app's own loading state, with
 * the only text on the page coming from the nav underneath it. `settle` scored
 * it as ready because it asks two questions and both gave the wrong answer:
 * "is there any text?" (26 characters of nav labels, so yes) and "are there any
 * skeletons?" (BrandedLoader draws a logo, not skeleton bars, so no). Three
 * such samples in a row and the laws run against a blank screen. Every nav
 * label is under the 12 characters law 5 counts as prose, so the gate reported
 * a type-floor violation on a page it had never seen.
 *
 * Two laws, matching the two halves of the fix:
 *
 *   1. Every loading state the app can show is BUSY to the gate. Asserted by
 *      rendering the real components through the real selector, not by grepping
 *      for a class name, so re-marking BrandedLoader breaks this test.
 *   2. `settle` says whether it settled. It used to return the same `undefined`
 *      whether the page came to rest or it gave up after 20 seconds, so a
 *      caller could not tell a measurement from a timeout. That is the same
 *      shape as every other bug this harness has been hardened against: a
 *      confident result from a check that never arrived.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BUSY_SELECTOR, settle } from '../qa-session.mjs';
import BrandedLoader from '@/components/BrandedLoader';
import { LeaderboardSkeleton, StatsSkeleton } from '@/components/leaderboard/skeletons';

/**
 * A CDP client that replays a scripted sequence of samples.
 *
 * `settle` only ever asks the page for one string, so a fake that returns the
 * next string in a list drives the real function through its real loop. The
 * last entry repeats, which is how a page that never comes to rest behaves.
 */
function fakeClient(samples: string[]) {
  let i = 0;
  const seen: string[] = [];
  return {
    seen,
    send: async (_method: string, _params: unknown) => {
      const value = samples[Math.min(i, samples.length - 1)];
      i += 1;
      seen.push(value);
      return { result: { value } };
    },
  };
}

/** The sample string the in-page probe builds, so the tests speak its language. */
const sample = (
  { roots = 1, els = 300, text = 1500, fonts = 1, busy = 0 } = {},
) => `${roots}:${els}:${text}:${fonts}:sk${busy}`;

describe('every loading state the app can show is busy to the gate', () => {
  it('sees BrandedLoader, which is what /leaderboard was showing when the gate judged it', () => {
    const { container } = render(<BrandedLoader />);
    expect(container.querySelector(BUSY_SELECTOR)).not.toBeNull();
  });

  it('still sees the skeletons it already knew about', () => {
    const list = render(<LeaderboardSkeleton />);
    expect(list.container.querySelector(BUSY_SELECTOR)).not.toBeNull();

    const stats = render(<StatsSkeleton />);
    expect(stats.container.querySelector(BUSY_SELECTOR)).not.toBeNull();
  });

  it('does not call a rendered page busy', () => {
    const { container } = render(
      <main>
        <h1>Leaderboard</h1>
        <p>You are ranked fourth this week across every Driiva driver.</p>
      </main>,
    );
    expect(container.querySelector(BUSY_SELECTOR)).toBeNull();
  });
});

describe('settle reports whether it settled', () => {
  it('is true once the page holds still', async () => {
    const client = fakeClient([sample()]);
    await expect(settle(client, { timeoutMs: 5000 })).resolves.toBe(true);
  });

  it('is false when the page never comes to rest', async () => {
    // A page that keeps changing: the element count moves on every sample.
    let n = 0;
    const client = {
      send: async () => ({ result: { value: sample({ els: (n += 1) }) } }),
    };
    await expect(settle(client, { timeoutMs: 900 })).resolves.toBe(false);
  });

  it('is false while a loading state is on screen, however long it is left there', async () => {
    // The exact frame that produced the false failure: text on the page from
    // the nav, no skeletons, and the branded loader over the top of it. Busy is
    // 1 because the loader now counts.
    const client = fakeClient([sample({ els: 926, text: 26, busy: 1 })]);
    await expect(settle(client, { timeoutMs: 900 })).resolves.toBe(false);
  });

  it('is false while the page has no text at all', async () => {
    const client = fakeClient([sample({ text: 0 })]);
    await expect(settle(client, { timeoutMs: 900 })).resolves.toBe(false);
  });

  it('is false while web fonts are still loading', async () => {
    const client = fakeClient([sample({ fonts: 0 })]);
    await expect(settle(client, { timeoutMs: 900 })).resolves.toBe(false);
  });

  it('waits for the loading state to clear rather than judging the frame under it', async () => {
    const client = fakeClient([
      sample({ roots: 0, text: 0 }),
      sample({ els: 926, text: 26, busy: 1 }),
      sample({ els: 926, text: 26, busy: 1 }),
      sample({ els: 123, text: 51, busy: 23 }),
      sample(),
    ]);
    await expect(settle(client, { timeoutMs: 5000 })).resolves.toBe(true);
    // It kept asking until the busy markers were gone, and rested on the page.
    expect(client.seen[client.seen.length - 1]).toBe(sample());
  });
});
