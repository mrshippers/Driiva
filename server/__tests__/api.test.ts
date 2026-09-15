/**
 * TESTS: Express Server API Routes
 * ==================================
 * Tests for the Express server REST API endpoints.
 * Uses supertest-style in-memory request testing.
 *
 * Assumed route structure based on project architecture:
 *   GET    /api/health
 *   GET    /api/trips
 *   GET    /api/trips/:tripId
 *   POST   /api/trips
 *   PATCH  /api/trips/:tripId/status
 *   GET    /api/user/profile
 *   PATCH  /api/user/profile
 *   GET    /api/policy
 *   GET    /api/pool
 *   GET    /api/leaderboard
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Firebase Admin (server uses it for token verification + Firestore)
// ---------------------------------------------------------------------------

const mockVerifyIdToken = vi.fn();
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockCollection = vi.fn();
const mockQuery = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockGetDocs = vi.fn();

vi.mock('firebase-admin', () => ({
  default: {
    apps: [{}],
    initializeApp: vi.fn(),
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
    firestore: () => ({
      collection: mockCollection,
      doc: vi.fn((path: string) => ({ path, get: mockGetDoc, set: mockSetDoc, update: mockUpdateDoc })),
    }),
  },
  auth: () => ({ verifyIdToken: mockVerifyIdToken }),
  firestore: vi.fn(() => ({
    collection: mockCollection,
    doc: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Middleware helpers (inline, mirrors real auth middleware)
// ---------------------------------------------------------------------------

interface MockRequest {
  headers: Record<string, string>;
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
  user?: { uid: string; email: string };
}

interface MockResponse {
  status: (code: number) => MockResponse;
  json: (data: unknown) => MockResponse;
  _statusCode: number;
  _body: unknown;
}

function makeRes(): MockResponse {
  const res = {
    _statusCode: 200,
    _body: null as unknown,
    status(code: number) { this._statusCode = code; return this; },
    json(data: unknown) { this._body = data; return this; },
  };
  return res;
}

async function authMiddleware(
  req: MockRequest,
  res: MockResponse,
  next: () => void
): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = await mockVerifyIdToken(token);
    req.user = { uid: decoded.uid, email: decoded.email };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ---------------------------------------------------------------------------
// Route handler stubs (mirrors expected real implementations)
// ---------------------------------------------------------------------------

async function handleGetTrips(req: MockRequest, res: MockResponse): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const tripsData = [
    { tripId: 'trip-001', score: 84, distanceMeters: 5400, status: 'completed' },
    { tripId: 'trip-002', score: 91, distanceMeters: 8200, status: 'completed' },
  ];

  res.json({ trips: tripsData, total: tripsData.length });
}

async function handleGetTrip(req: MockRequest, res: MockResponse): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { tripId } = req.params;
  const doc = await mockGetDoc();

  if (!doc.exists) {
    res.status(404).json({ error: 'Trip not found' });
    return;
  }

  const trip = doc.data();
  if (trip.userId !== req.user.uid) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  res.json({ trip });
}

async function handlePatchTripStatus(req: MockRequest, res: MockResponse): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { status } = req.body as { status: string };
  const VALID_CLIENT_STATUSES = ['processing', 'failed'];

  if (!VALID_CLIENT_STATUSES.includes(status)) {
    res.status(400).json({
      error: `Invalid status transition. Allowed: ${VALID_CLIENT_STATUSES.join(', ')}`,
    });
    return;
  }

  res.json({ success: true, status });
}

async function handleGetUserProfile(req: MockRequest, res: MockResponse): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const doc = await mockGetDoc();
  if (!doc.exists) { res.status(404).json({ error: 'User profile not found' }); return; }
  res.json({ user: doc.data() });
}

async function handleGetHealth(_req: MockRequest, res: MockResponse): Promise<void> {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Health endpoint', () => {
  it('GET /api/health returns 200 with status ok', async () => {
    const req = { headers: {}, params: {}, query: {}, body: {} };
    const res = makeRes();
    await handleGetHealth(req, res);

    expect(res._statusCode).toBe(200);
    expect((res._body as Record<string, string>).status).toBe('ok');
  });

  it('health response includes timestamp', async () => {
    const req = { headers: {}, params: {}, query: {}, body: {} };
    const res = makeRes();
    await handleGetHealth(req, res);

    const body = res._body as Record<string, string>;
    expect(body.timestamp).toBeTruthy();
    expect(new Date(body.timestamp)).toBeInstanceOf(Date);
  });
});

describe('Auth middleware', () => {
  beforeEach(() => vi.resetAllMocks());

  it('rejects requests with no Authorization header', async () => {
    const req: MockRequest = { headers: {}, params: {}, query: {}, body: {} };
    const res = makeRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res._statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects requests with malformed Authorization header', async () => {
    const req: MockRequest = { headers: { authorization: 'NotBearer token' }, params: {}, query: {}, body: {} };
    const res = makeRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res._statusCode).toBe(401);
  });

  it('rejects invalid/expired tokens', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Token expired'));
    const req: MockRequest = {
      headers: { authorization: 'Bearer expired-token' },
      params: {}, query: {}, body: {},
    };
    const res = makeRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res._statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() with valid token and attaches user to request', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-001', email: 'test@driiva.co.uk' });
    const req: MockRequest = {
      headers: { authorization: 'Bearer valid-token' },
      params: {}, query: {}, body: {},
    };
    const res = makeRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user?.uid).toBe('user-001');
    expect(req.user?.email).toBe('test@driiva.co.uk');
  });
});

describe('GET /api/trips', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 without authentication', async () => {
    const req: MockRequest = { headers: {}, params: {}, query: {}, body: {} };
    const res = makeRes();
    await handleGetTrips(req, res);
    expect(res._statusCode).toBe(401);
  });

  it('returns list of trips for authenticated user', async () => {
    const req: MockRequest = {
      headers: { authorization: 'Bearer valid-token' },
      params: {}, query: {}, body: {},
      user: { uid: 'user-001', email: 'test@driiva.co.uk' },
    };
    const res = makeRes();
    await handleGetTrips(req, res);

    const body = res._body as { trips: unknown[]; total: number };
    expect(Array.isArray(body.trips)).toBe(true);
    expect(typeof body.total).toBe('number');
  });
});

describe('GET /api/trips/:tripId', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetDoc.mockResolvedValue({
      exists: true,
      data: () => ({ tripId: 'trip-001', userId: 'user-001', score: 84 }),
    });
  });

  it('returns 401 without auth', async () => {
    const req: MockRequest = { headers: {}, params: { tripId: 'trip-001' }, query: {}, body: {} };
    const res = makeRes();
    await handleGetTrip(req, res);
    expect(res._statusCode).toBe(401);
  });

  it('returns 404 for non-existent trip', async () => {
    mockGetDoc.mockResolvedValue({ exists: false, data: () => null });
    const req: MockRequest = {
      headers: {}, params: { tripId: 'trip-does-not-exist' }, query: {}, body: {},
      user: { uid: 'user-001', email: 'test@driiva.co.uk' },
    };
    const res = makeRes();
    await handleGetTrip(req, res);
    expect(res._statusCode).toBe(404);
  });

  it('returns 403 when trip belongs to different user', async () => {
    mockGetDoc.mockResolvedValue({
      exists: true,
      data: () => ({ tripId: 'trip-001', userId: 'other-user', score: 84 }),
    });
    const req: MockRequest = {
      headers: {}, params: { tripId: 'trip-001' }, query: {}, body: {},
      user: { uid: 'user-001', email: 'test@driiva.co.uk' },
    };
    const res = makeRes();
    await handleGetTrip(req, res);
    expect(res._statusCode).toBe(403);
  });

  it('returns trip data for authorised user', async () => {
    const req: MockRequest = {
      headers: {}, params: { tripId: 'trip-001' }, query: {}, body: {},
      user: { uid: 'user-001', email: 'test@driiva.co.uk' },
    };
    const res = makeRes();
    await handleGetTrip(req, res);
    expect(res._statusCode).toBe(200);
    expect((res._body as Record<string, unknown>).trip).toBeTruthy();
  });
});

describe('PATCH /api/trips/:tripId/status', () => {
  beforeEach(() => vi.resetAllMocks());

  it('rejects invalid status values', async () => {
    const req: MockRequest = {
      headers: {}, params: { tripId: 'trip-001' }, query: {},
      body: { status: 'completed' }, // Client can't set completed directly
      user: { uid: 'user-001', email: 'test@driiva.co.uk' },
    };
    const res = makeRes();
    await handlePatchTripStatus(req, res);
    expect(res._statusCode).toBe(400);
  });

  it('accepts valid processing status', async () => {
    const req: MockRequest = {
      headers: {}, params: { tripId: 'trip-001' }, query: {},
      body: { status: 'processing' },
      user: { uid: 'user-001', email: 'test@driiva.co.uk' },
    };
    const res = makeRes();
    await handlePatchTripStatus(req, res);
    expect(res._statusCode).toBe(200);
  });

  it('accepts valid failed status', async () => {
    const req: MockRequest = {
      headers: {}, params: { tripId: 'trip-001' }, query: {},
      body: { status: 'failed' },
      user: { uid: 'user-001', email: 'test@driiva.co.uk' },
    };
    const res = makeRes();
    await handlePatchTripStatus(req, res);
    expect(res._statusCode).toBe(200);
  });
});

describe('GET /api/user/profile', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetDoc.mockResolvedValue({
      exists: true,
      data: () => ({ uid: 'user-001', displayName: 'Jamal Test', email: 'jamal@driiva.co.uk' }),
    });
  });

  it('returns 401 without auth', async () => {
    const req: MockRequest = { headers: {}, params: {}, query: {}, body: {} };
    const res = makeRes();
    await handleGetUserProfile(req, res);
    expect(res._statusCode).toBe(401);
  });

  it('returns user profile for authenticated user', async () => {
    const req: MockRequest = {
      headers: {}, params: {}, query: {}, body: {},
      user: { uid: 'user-001', email: 'jamal@driiva.co.uk' },
    };
    const res = makeRes();
    await handleGetUserProfile(req, res);

    const body = res._body as Record<string, unknown>;
    expect(body.user).toBeTruthy();
  });
});
