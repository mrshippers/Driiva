/**
 * The admin monitoring page's two honesty rules (ROADMAP TD-1).
 *
 * The page used to publish four numbers nobody had measured. Three were the
 * literal `0` in the source; the fourth, average pipeline latency, was a 0 the
 * render happened to catch and print as "N/A", which is luck, not a guard. The
 * pipeline now stores the latency it has always measured (`pipelineLatencyMs`,
 * written by finalizeTripFromPoints), so this half is a real reading, and
 * "no reading" is `null` rather than a zero that looks like a fast pipeline.
 *
 * The trust rule is the one worth the test. firestore.rules lets a client
 * create its OWN trip document carrying any unmodelled field, so a driver can
 * write `pipelineLatencyMs: 1` onto a trip they started. What they cannot do
 * is reach `status: 'completed'` - the client's allowed transitions are
 * recording -> processing | failed, pinned in tests/rules/trips.test.ts - and
 * the server writes the latency in the same update that sets that status. So
 * `completed` is the boundary between a measurement and a claim.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import MonitoringDashboard, { averagePipelineLatencyMs } from '../pages/admin/monitoring';
import { AdminLayout } from '@/components/admin/AdminLayout';

const trip = (over: Record<string, unknown> = {}) => ({
  status: 'completed',
  pipelineLatencyMs: 400,
  ...over,
});

describe('averagePipelineLatencyMs', () => {
  it('averages the latencies the server wrote, rounded to the millisecond', () => {
    expect(averagePipelineLatencyMs([
      trip({ pipelineLatencyMs: 400 }),
      trip({ pipelineLatencyMs: 500 }),
      trip({ pipelineLatencyMs: 701 }),
    ])).toBe(534);
  });

  it('returns null rather than 0 when nothing carries a measurement', () => {
    expect(averagePipelineLatencyMs([trip({ pipelineLatencyMs: undefined })])).toBeNull();
    expect(averagePipelineLatencyMs([])).toBeNull();
  });

  it('ignores a latency on a trip the client could have written', () => {
    // Client-reachable statuses. A forged 1ms here would otherwise drag the
    // average down and make the pipeline look faster than it is.
    expect(averagePipelineLatencyMs([
      trip({ status: 'recording', pipelineLatencyMs: 1 }),
      trip({ status: 'processing', pipelineLatencyMs: 1 }),
      trip({ status: 'failed', pipelineLatencyMs: 1 }),
      trip({ pipelineLatencyMs: 600 }),
    ])).toBe(600);
  });

  it('ignores anything that is not a usable number', () => {
    expect(averagePipelineLatencyMs([
      trip({ pipelineLatencyMs: '400' }),
      trip({ pipelineLatencyMs: -5 }),
      trip({ pipelineLatencyMs: NaN }),
      trip({ pipelineLatencyMs: Infinity }),
      trip({ pipelineLatencyMs: null }),
    ])).toBeNull();
  });

  it('counts a genuine zero, which is a measurement like any other', () => {
    expect(averagePipelineLatencyMs([trip({ pipelineLatencyMs: 0 })])).toBe(0);
  });
});

/**
 * The render, driven through the real page in jsdom.
 *
 * The helper above is pure and would stay green while the page printed
 * whatever it liked, so this drives MonitoringDashboard itself with a
 * Firestore that is not there. Every fetcher fails, which is the SAME shape
 * as the permission denial this page hits in production, and the test is that
 * a failed read never looks like a reading.
 */
describe('MonitoringDashboard when Firestore cannot be read', () => {
  it('names the failure instead of publishing zeros', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MonitoringDashboard />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/The trip pipeline could not be read/)).toBeInTheDocument();
    expect(await screen.findByText(/AI spend could not be read/)).toBeInTheDocument();

    // The four cards that used to print zeros are gone with the panel, and
    // "Never" is not offered as the answer to "when was the last trip".
    expect(screen.queryByText('Total Processed')).not.toBeInTheDocument();
    expect(screen.queryByText('AI Spend (Today)')).not.toBeInTheDocument();
    expect(screen.queryByText('Never')).not.toBeInTheDocument();
    expect(screen.getByText('Unreadable')).toBeInTheDocument();
  });

  it('still shows the invocations card, saying it is not measured', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MonitoringDashboard />
      </QueryClientProvider>,
    );

    await screen.findByText(/AI spend could not be read/);
    // Cloud Monitoring is a separate gap from the read failure: it is missing
    // even when Firestore answers, so its card is not inside the panel.
    expect(screen.getByText('Function Invocations')).toBeInTheDocument();
    expect(screen.getByText('Not measured')).toBeInTheDocument();
  });
});

/**
 * The mobile menu button is `fixed top-4 left-4` and roughly 40px square, so it
 * sat on top of the page title: every admin page rendered its heading with the
 * first character or two under the button ("Live Monitoring" read as
 * "e Monitoring" at 375px). jsdom has no layout, so the pin is the class that
 * moves the title clear of it.
 */
describe('AdminLayout title clears the mobile menu button', () => {
  it('indents the heading below lg and not above it', () => {
    render(<AdminLayout title="Live Monitoring" subtitle="x">{null}</AdminLayout>);
    const wrapper = screen.getByRole('heading', { name: 'Live Monitoring' }).parentElement!;
    expect(wrapper.className).toContain('pl-14');
    expect(wrapper.className).toContain('lg:pl-0');
  });
});
