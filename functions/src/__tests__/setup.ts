/**
 * GLOBAL TEST SETUP
 * =================
 * Mocks Firebase Admin SDK so unit tests run without real Firestore/Firebase.
 * All individual test files can override these mocks as needed.
 */

import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Firebase Admin mock - must be hoisted before any imports that use admin
// ---------------------------------------------------------------------------

const mockTimestamp = {
  toDate: () => new Date(),
  seconds: Math.floor(Date.now() / 1000),
  nanoseconds: 0,
};

const mockFieldValue = {
  serverTimestamp: () => ({ _type: 'SERVER_TIMESTAMP' }),
  arrayUnion: (...items: unknown[]) => ({ _type: 'ARRAY_UNION', items }),
  arrayRemove: (...items: unknown[]) => ({ _type: 'ARRAY_REMOVE', items }),
  increment: (n: number) => ({ _type: 'INCREMENT', n }),
  delete: () => ({ _type: 'DELETE' }),
};

// Build a chainable Firestore mock
export const mockGet = vi.fn();
export const mockSet = vi.fn().mockResolvedValue(undefined);
export const mockUpdate = vi.fn().mockResolvedValue(undefined);
export const mockDelete = vi.fn().mockResolvedValue(undefined);
export const mockAdd = vi.fn().mockResolvedValue({ id: 'auto-id-123' });
export const mockWhere = vi.fn();
export const mockOrderBy = vi.fn();
export const mockLimit = vi.fn();
export const mockGetAll = vi.fn();
export const mockBatchSet = vi.fn();
export const mockBatchUpdate = vi.fn();
export const mockBatchDelete = vi.fn();
export const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
export const mockRunTransaction = vi.fn();

const docRef = (path?: string) => ({
  id: path?.split('/').pop() ?? 'mock-doc-id',
  path: path ?? 'mock/doc',
  get: mockGet,
  set: mockSet,
  update: mockUpdate,
  delete: mockDelete,
  collection: vi.fn((sub: string) => collectionRef(`${path}/${sub}`)),
});

const collectionRef = (path?: string) => ({
  doc: vi.fn((id: string) => docRef(`${path}/${id}`)),
  add: mockAdd,
  where: mockWhere.mockReturnThis(),
  orderBy: mockOrderBy.mockReturnThis(),
  limit: mockLimit.mockReturnThis(),
  get: mockGet,
});

const mockBatch = {
  set: mockBatchSet,
  update: mockBatchUpdate,
  delete: mockBatchDelete,
  commit: mockBatchCommit,
};

const mockDb = {
  collection: vi.fn((path: string) => collectionRef(path)),
  doc: vi.fn((path: string) => docRef(path)),
  batch: vi.fn(() => mockBatch),
  runTransaction: mockRunTransaction,
  getAll: mockGetAll,
};

const mockTimestampNs = {
  now: () => mockTimestamp,
  fromDate: (d: Date) => ({
    ...mockTimestamp,
    seconds: Math.floor(d.getTime() / 1000),
    toDate: () => d,
  }),
  fromMillis: (ms: number) => ({
    ...mockTimestamp,
    seconds: Math.floor(ms / 1000),
    toDate: () => new Date(ms),
  }),
};

// firebase-admin v14 removed the namespaced API (admin.firestore(), admin.auth(),
// admin.apps). Production code imports the modular entry points, so the mocks
// follow it entry point by entry point.
vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => [{}]),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => mockDb),
  Timestamp: mockTimestampNs,
  FieldValue: mockFieldValue,
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    getUser: vi.fn(),
    deleteUser: vi.fn(),
    revokeRefreshTokens: vi.fn(),
  })),
}));

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: vi.fn(() => ({
    sendEachForMulticast: vi.fn().mockResolvedValue({
      successCount: 0,
      failureCount: 0,
      responses: [],
    }),
  })),
}));

vi.mock('firebase-functions/v1', () => {
  // Shared so `functions.region(...)` and `functions.default.region(...)`
  // behave identically regardless of which interop path a trigger's
  // `import * as functions from 'firebase-functions/v1'` resolves through.
  const region = vi.fn(function regionMock() {
    const builder = {
      runWith: vi.fn(() => builder),
      firestore: {
        document: vi.fn(() => ({
          onWrite: vi.fn((handler: unknown) => handler),
          onCreate: vi.fn((handler: unknown) => handler),
          onUpdate: vi.fn((handler: unknown) => handler),
        })),
      },
      https: {
        onCall: vi.fn((handler: unknown) => handler),
        onRequest: vi.fn((handler: unknown) => handler),
      },
      pubsub: {
        schedule: vi.fn(() => ({
          timeZone: vi.fn(() => ({ onRun: vi.fn((handler: unknown) => handler) })),
          onRun: vi.fn((handler: unknown) => handler),
        })),
      },
      auth: {
        user: vi.fn(() => ({ onCreate: vi.fn((handler: unknown) => handler) })),
      },
    };
    return builder;
  });

  return {
    default: {
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      firestore: {
        document: vi.fn(() => ({
          onCreate: vi.fn((handler: unknown) => handler),
          onUpdate: vi.fn((handler: unknown) => handler),
          onWrite: vi.fn((handler: unknown) => handler),
          onDelete: vi.fn((handler: unknown) => handler),
        })),
      },
      pubsub: {
        schedule: vi.fn(() => ({
          onRun: vi.fn((handler: unknown) => handler),
        })),
      },
      https: {
        onCall: vi.fn((handler: unknown) => handler),
        onRequest: vi.fn((handler: unknown) => handler),
        HttpsError: class HttpsError extends Error {
          code: string;
          constructor(code: string, message: string) {
            super(message);
            this.code = code;
          }
        },
      },
      region,
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    firestore: {
      document: vi.fn(() => ({
        onCreate: vi.fn((handler: unknown) => handler),
        onUpdate: vi.fn((handler: unknown) => handler),
        onWrite: vi.fn((handler: unknown) => handler),
      })),
    },
    https: {
      onCall: vi.fn((handler: unknown) => handler),
      onRequest: vi.fn((handler: unknown) => handler),
      HttpsError: class HttpsError extends Error {
        code: string;
        constructor(code: string, message: string) {
          super(message);
          this.code = code;
        }
      },
    },
    pubsub: {
      schedule: vi.fn(() => ({
        onRun: vi.fn((handler: unknown) => handler),
      })),
    },
    region,
  };
});

// Export the mock db so individual tests can configure return values
export { mockDb, mockTimestamp, mockFieldValue };
