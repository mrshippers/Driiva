/**
 * Neon PostgreSQL client for Cloud Functions.
 * Set DATABASE_URL in Firebase config: firebase functions:config:set db.url="postgresql://..."
 * Or set DATABASE_URL in .env when running locally.
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import { WebSocket } from 'ws';

// The class itself: under esModuleInterop a namespace import (`import * as ws`)
// compiles to a wrapper object, which @neondatabase/serverless 1.x rejects by
// type and which is not constructible at runtime.
neonConfig.webSocketConstructor = WebSocket;

let pool: Pool | null = null;

function getPool(): Pool {
  const url = process.env.DATABASE_URL ?? '';
  if (!url || url.startsWith('file:')) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string. Set it via Firebase Secrets (functions:secrets:set DATABASE_URL).');
  }
  if (!pool) {
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

export async function getPgUserIdByFirebaseUid(firebaseUid: string): Promise<number | null> {
  const p = getPool();
  const r = await p.query('SELECT id FROM users WHERE firebase_uid = $1 LIMIT 1', [firebaseUid]);
  const row = (r as { rows: { id: number }[] }).rows?.[0];
  return row ? row.id : null;
}

export async function insertUserFromFirebase(firebaseUid: string, email: string, displayName: string | null): Promise<number> {
  const p = getPool();
  // Append last 4 chars of Firebase UID to prevent username collisions between
  // users who share the same email prefix (e.g. user@gmail.com vs user@yahoo.com).
  const emailPrefix = email.includes('@') ? email.split('@')[0].toLowerCase() : email.toLowerCase();
  const username = `${emailPrefix}_${firebaseUid.slice(-4)}`;
  const r = await p.query(
    `INSERT INTO users (firebase_uid, email, display_name, username, onboarding_complete, created_by, updated_by)
     VALUES ($1, $2, $3, $4, false, 'firebase-auth', 'firebase-auth')
     ON CONFLICT (firebase_uid) DO UPDATE SET email = EXCLUDED.email, display_name = COALESCE(EXCLUDED.display_name, users.display_name), username = COALESCE(EXCLUDED.username, users.username), updated_at = NOW()
     RETURNING id`,
    [firebaseUid, email, displayName, username]
  );
  const rows = (r as { rows: { id: number }[] }).rows;
  const row = rows?.[0];
  if (!row) throw new Error('Insert user failed');
  const userId = row.id;
  await p.query(
    `INSERT INTO driving_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
  return userId;
}
