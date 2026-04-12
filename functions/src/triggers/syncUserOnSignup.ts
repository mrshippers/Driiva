/**
 * SYNC USER ON SIGNUP
 * ===================
 * Firebase Auth trigger: when a new user is created, mirror them to Neon PostgreSQL.
 * This keeps users + onboarding_complete as single source of truth in PostgreSQL.
 */

import * as functions from 'firebase-functions';
import { insertUserFromFirebase } from '../lib/neon';
import { EUROPE_LONDON } from '../lib/region';
import { wrapTrigger } from '../lib/sentry';

export const syncUserOnSignup = functions
  .region(EUROPE_LONDON)
  .runWith({ secrets: ['DATABASE_URL'] })
  .auth.user().onCreate(wrapTrigger(async (user) => {
  const { uid, email, displayName } = user;
  const emailStr = email ?? '';
  if (!emailStr) {
    functions.logger.warn('User created without email', { uid });
    return;
  }
  try {
    // 10s timeout — Neon cold-starts can take 20-27s; we abort early and let
    // the server-side upsert handle it on next login. Non-critical: Firestore is primary.
    const pgId = await Promise.race([
      insertUserFromFirebase(uid, emailStr, displayName ?? null),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Neon insert timeout after 10s')), 10_000)
      ),
    ]);
    functions.logger.info('Synced Firebase user to PostgreSQL', { uid, email: emailStr, pgUserId: pgId });
  } catch (error) {
    // Non-critical — server upserts on next authenticated request via /api/profile/me.
    // Do NOT re-throw; retrying on Neon cold-start compounds the delay for the user.
    functions.logger.error('Failed to sync user to PostgreSQL (non-fatal)', { uid, error });
  }
}));
