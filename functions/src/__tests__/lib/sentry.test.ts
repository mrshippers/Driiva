/**
 * TESTS: Sentry structured breadcrumbs
 * =====================================
 * Covers the ROADMAP "structured logging with Sentry breadcrumbs" ticket.
 * Cloud Functions errors previously arrived at Sentry with no trail at all -
 * captureError only ever attached the error itself plus a small "extra"
 * blob, and @sentry/node (unlike the browser SDK) adds no console/fetch/nav
 * breadcrumbs on its own. addBreadcrumb, and wrapFunction/wrapTrigger calling
 * it automatically, are what give a captured event a "what ran before this"
 * trail.
 *
 * SENTRY_DSN_FUNCTIONS is read once into a module-level constant on import,
 * so each test that needs it set dynamically imports the module after
 * setting the env var and resetting the module cache.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as functions from 'firebase-functions/v1';

const { mockAddBreadcrumb, mockCaptureException, mockSetUser, mockFlush, mockInit } = vi.hoisted(() => ({
  mockAddBreadcrumb: vi.fn(),
  mockCaptureException: vi.fn(),
  mockSetUser: vi.fn(),
  mockFlush: vi.fn().mockResolvedValue(undefined),
  mockInit: vi.fn(),
}));

vi.mock('@sentry/node', () => ({
  init: mockInit,
  addBreadcrumb: mockAddBreadcrumb,
  captureException: mockCaptureException,
  setUser: mockSetUser,
  flush: mockFlush,
}));

vi.mock('firebase-functions/v1', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  delete process.env.SENTRY_DSN_FUNCTIONS;
});

describe('addBreadcrumb', () => {
  it('no-ops when Sentry has never been initialised', async () => {
    process.env.SENTRY_DSN_FUNCTIONS = 'https://fake@sentry.io/1';
    const { addBreadcrumb } = await import('../../lib/sentry');
    addBreadcrumb('function', 'should not send');
    expect(mockAddBreadcrumb).not.toHaveBeenCalled();
  });

  it('no-ops with no DSN configured, even after initSentry() runs', async () => {
    delete process.env.SENTRY_DSN_FUNCTIONS;
    const { initSentry, addBreadcrumb } = await import('../../lib/sentry');
    initSentry();
    addBreadcrumb('function', 'should not send');
    expect(mockAddBreadcrumb).not.toHaveBeenCalled();
  });

  it('forwards a structured breadcrumb once Sentry is configured and initialised', async () => {
    process.env.SENTRY_DSN_FUNCTIONS = 'https://fake@sentry.io/1';
    const { initSentry, addBreadcrumb } = await import('../../lib/sentry');
    initSentry();
    addBreadcrumb('trigger', 'onTripComplete invoked', { tripId: 't1' });
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'trigger',
        message: 'onTripComplete invoked',
        data: { tripId: 't1' },
        level: 'info',
      }),
    );
  });
});

describe('wrapFunction breadcrumbs', () => {
  beforeEach(() => {
    process.env.SENTRY_DSN_FUNCTIONS = 'https://fake@sentry.io/1';
  });

  /**
   * A CallableContext with only the field wrapFunction reads. Built through the
   * real type so a change to what the wrapper reads fails here rather than
   * sliding past a cast.
   */
  function callableContext(uid?: string): functions.https.CallableContext {
    return {
      auth: uid ? { uid, token: {} } : undefined,
      rawRequest: {},
    } as unknown as functions.https.CallableContext;
  }

  it('leaves a breadcrumb before invoking the wrapped handler', async () => {
    const { wrapFunction } = await import('../../lib/sentry');
    const handler = vi.fn().mockResolvedValue('ok');
    const wrapped = wrapFunction(handler);

    await wrapped({ foo: 1 }, callableContext('u1'));

    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'function', data: { userId: 'u1' } }),
    );
    const breadcrumbOrder = mockAddBreadcrumb.mock.invocationCallOrder[0];
    const handlerOrder = handler.mock.invocationCallOrder[0];
    expect(breadcrumbOrder).toBeLessThan(handlerOrder);
  });

  it('adds no breadcrumb when Sentry is not configured', async () => {
    delete process.env.SENTRY_DSN_FUNCTIONS;
    const { wrapFunction } = await import('../../lib/sentry');
    const handler = vi.fn().mockResolvedValue('ok');
    const wrapped = wrapFunction(handler);

    await wrapped({}, callableContext());

    expect(mockAddBreadcrumb).not.toHaveBeenCalled();
  });
});

describe('wrapTrigger breadcrumbs', () => {
  beforeEach(() => {
    process.env.SENTRY_DSN_FUNCTIONS = 'https://fake@sentry.io/1';
  });

  /**
   * A CallableContext with only the field wrapFunction reads. Built through the
   * real type so a change to what the wrapper reads fails here rather than
   * sliding past a cast.
   */
  function callableContext(uid?: string): functions.https.CallableContext {
    return {
      auth: uid ? { uid, token: {} } : undefined,
      rawRequest: {},
    } as unknown as functions.https.CallableContext;
  }

  it('leaves a breadcrumb before invoking the wrapped handler', async () => {
    const { wrapTrigger } = await import('../../lib/sentry');
    const handler = vi.fn().mockResolvedValue(undefined);
    const wrapped = wrapTrigger(handler);

    await wrapped();

    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'trigger' }),
    );
    const breadcrumbOrder = mockAddBreadcrumb.mock.invocationCallOrder[0];
    const handlerOrder = handler.mock.invocationCallOrder[0];
    expect(breadcrumbOrder).toBeLessThan(handlerOrder);
  });
});
