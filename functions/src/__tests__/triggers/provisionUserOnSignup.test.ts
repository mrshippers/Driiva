/**
 * TESTS: provisionUser / provisionUserOnSignup (dormant M1 trigger)
 * ====================================================================
 * Exercises the async side-effects of the unified provisioning handler:
 * the users/usernames writes, ADMIN_EMAILS auto-promotion, and
 * Damoov-registration resilience. The trigger itself is not wired into
 * functions/src/index.ts (dormant) - these tests drive `provisionUser`
 * directly, the same seam M1 T5's emulator integration test will use.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDb, mockGet, mockSet, mockUpdate, mockRunTransaction } from '../setup';

const { mockCreateDamoovUser } = vi.hoisted(() => ({
  mockCreateDamoovUser: vi.fn(),
}));

vi.mock('../../lib/damoov', () => ({
  createDamoovUser: mockCreateDamoovUser,
}));

import { provisionUser, provisionUserOnSignup } from '../../triggers/provisionUserOnSignup';

function fakeUserRecord(overrides: Partial<{ uid: string; email: string; displayName: string }> = {}) {
  return {
    uid: 'user-001',
    email: 'jamal@example.com',
    displayName: 'Jamal Driver',
    ...overrides,
  } as unknown as import('firebase-functions/v1').auth.UserRecord;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_EMAILS;

  // Idempotency guard reads users/{uid}: pretend it does not exist yet, so
  // provisioning proceeds. Individual tests override this to simulate a
  // re-run/duplicate delivery.
  mockGet.mockResolvedValue({ exists: false });

  mockCreateDamoovUser.mockResolvedValue(null);
});

describe('provisionUser', () => {
  it('writes users/{uid} and usernames/{localPart}, and NO policy', async () => {
    await provisionUser(fakeUserRecord());

    const collectionsWritten = mockDb.collection.mock.calls.map((call: unknown[]) => call[0]);
    expect(collectionsWritten).toContain('users');
    expect(collectionsWritten).toContain('usernames');

    // Wave H: signing up used to mint a policies/{id} document declaring
    // GBP 100,000 of liability cover under a sequential DRV-### number, for a
    // contract no insurer had written. Driiva is not authorised to arrange
    // cover, so an account is all a signup can honestly create.
    expect(collectionsWritten).not.toContain('policies');

    const [userDoc, usernameDoc] = mockSet.mock.calls.map((call: unknown[]) => call[0]);
    expect(userDoc).toMatchObject({ uid: 'user-001', email: 'jamal@example.com', onboardingComplete: false });
    expect(userDoc.activePolicy).toBeNull();
    expect(usernameDoc).toMatchObject({ uid: 'user-001', email: 'jamal@example.com' });
  });

  it('never touches the shared policy counter', async () => {
    await provisionUser(fakeUserRecord());

    // The DRV-### counter was shared and monotonic, so the number handed to a
    // driver also told them roughly how many customers the company had.
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('auto-promotes an ADMIN_EMAILS user to isAdmin on the written doc', async () => {
    process.env.ADMIN_EMAILS = 'jamal@example.com';

    await provisionUser(fakeUserRecord());

    const [userDoc] = mockSet.mock.calls.map((call: unknown[]) => call[0]);
    expect(userDoc.isAdmin).toBe(true);
  });

  it('does not set isAdmin for a non-admin user', async () => {
    process.env.ADMIN_EMAILS = 'someoneelse@example.com';

    await provisionUser(fakeUserRecord());

    const [userDoc] = mockSet.mock.calls.map((call: unknown[]) => call[0]);
    expect(userDoc.isAdmin).toBeUndefined();
  });

  it('stores the Damoov deviceToken when registration succeeds', async () => {
    mockCreateDamoovUser.mockResolvedValue('device-token-abc');

    await provisionUser(fakeUserRecord());

    expect(mockUpdate).toHaveBeenCalledWith({ damoovDeviceToken: 'device-token-abc' });
  });

  it('does not throw and does not update the doc when Damoov registration fails', async () => {
    mockCreateDamoovUser.mockRejectedValue(new Error('Damoov is down'));

    await expect(provisionUser(fakeUserRecord())).resolves.toBeUndefined();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not throw when a Firestore write fails (matches onUserCreate\'s never-throw posture)', async () => {
    mockSet.mockRejectedValueOnce(new Error('Firestore is down'));

    await expect(provisionUser(fakeUserRecord())).resolves.toBeUndefined();
  });

  it('skips the usernames write when the user has no email', async () => {
    await provisionUser(fakeUserRecord({ email: '' }));

    const collectionsWritten = mockDb.collection.mock.calls.map((call: unknown[]) => call[0]);
    expect(collectionsWritten).not.toContain('usernames');
  });

  // M1 T7 fix: this used to derive a fallback from the email local part,
  // which permanently wrote the wrong name for email/password signup (the
  // Auth onCreate trigger fires before the client's un-awaited
  // updateProfile lands). Writing null lets the UI's existing fallback
  // chain (`|| user?.name || 'Driver'`) resolve to the real name instead.
  it('writes displayName as null when the Auth record has none, instead of deriving the email local part', async () => {
    await provisionUser(fakeUserRecord({ displayName: undefined as unknown as string }));

    const [userDoc] = mockSet.mock.calls.map((call: unknown[]) => call[0]);
    expect(userDoc.displayName).toBeNull();
  });

  it('still writes the real displayName verbatim when the Auth record provides one (e.g. Google)', async () => {
    await provisionUser(fakeUserRecord({ displayName: 'Ada Google' }));

    const [userDoc] = mockSet.mock.calls.map((call: unknown[]) => call[0]);
    expect(userDoc.displayName).toBe('Ada Google');
  });

  it('is idempotent: a second call for the same uid does not overwrite the user doc', async () => {
    // Simulates a re-run / at-least-once duplicate delivery of the Auth
    // onCreate event. The guard now keys off the USER document, because
    // provisioning no longer creates a policy to key off; without that change
    // a redelivery would have found no policy and clobbered everything the
    // driver had accrued since signup.
    mockGet.mockResolvedValue({ exists: true });

    await provisionUser(fakeUserRecord());

    expect(mockSet).not.toHaveBeenCalled();
    expect(mockRunTransaction).not.toHaveBeenCalled();
    expect(mockCreateDamoovUser).not.toHaveBeenCalled();
  });

  it('checks for an existing user document before doing any provisioning work', async () => {
    await provisionUser(fakeUserRecord());

    const collectionsWritten = mockDb.collection.mock.calls.map((call: unknown[]) => call[0]);
    expect(collectionsWritten[0]).toBe('users');
    expect(mockGet).toHaveBeenCalled();
  });
});

describe('provisionUserOnSignup (dormant trigger export)', () => {
  it('is defined and callable, invoking the same provisioning logic as provisionUser', async () => {
    expect(provisionUserOnSignup).toBeTypeOf('function');

    await (provisionUserOnSignup as unknown as (u: unknown) => Promise<void>)(fakeUserRecord());

    const collectionsWritten = mockDb.collection.mock.calls.map((call: unknown[]) => call[0]);
    expect(collectionsWritten).toContain('users');
  });
});
