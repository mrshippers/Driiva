/**
 * TESTS: Damoov User Registration
 * ================================
 * Tests the createDamoovUser API client function: successful registration,
 * API failure handling, and graceful error recovery.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so the mock variable is available in the hoisted vi.mock factory
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.stubGlobal('fetch', mockFetch);

vi.mock('firebase-functions/v1', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  process.env.DAMOOV_INSTANCE_ID = 'test-instance-id';
  process.env.DAMOOV_INSTANCE_KEY = 'test-instance-key';
});

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

import { createDamoovUser } from '../../lib/damoov';

// ---------------------------------------------------------------------------
// Helper to create a mock Response
// ---------------------------------------------------------------------------

function mockResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createDamoovUser', () => {
  it('returns deviceToken on successful registration', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        DeviceToken: 'fake-device-token-abc123',
        Result: { IsSuccess: true },
      }),
    );

    const token = await createDamoovUser('user-001', 'test@driiva.co.uk');

    expect(token).toBe('fake-device-token-abc123');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://user.telematicssdk.com/v1/registration',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          InstanceId: 'test-instance-id',
          InstanceKey: 'test-instance-key',
        }),
      }),
    );
  });

  it('sends correct request body with uid and email', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        DeviceToken: 'token-xyz',
        Result: { IsSuccess: true },
      }),
    );

    await createDamoovUser('uid-abc', 'driver@example.com');

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.ClientId).toBe('uid-abc');
    expect(body.Email).toBe('driver@example.com');
  });

  it('returns null on HTTP error (non-2xx)', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 500));

    const token = await createDamoovUser('user-002', 'fail@driiva.co.uk');

    expect(token).toBeNull();
  });

  it('returns null when Damoov API returns IsSuccess: false', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        DeviceToken: '',
        Result: {
          IsSuccess: false,
          ErrorCode: 1001,
          ErrorMessage: 'User already exists',
        },
      }),
    );

    const token = await createDamoovUser('user-003', 'dupe@driiva.co.uk');

    expect(token).toBeNull();
  });

  it('returns null on network error (does not throw)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

    const token = await createDamoovUser('user-004', 'timeout@driiva.co.uk');

    expect(token).toBeNull();
  });

  it('returns null when credentials are missing', async () => {
    delete process.env.DAMOOV_INSTANCE_ID;
    delete process.env.DAMOOV_INSTANCE_KEY;

    const token = await createDamoovUser('user-005', 'nocreds@driiva.co.uk');

    expect(token).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
