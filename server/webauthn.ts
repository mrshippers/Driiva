/**
 * WebAuthn server implementation for Face ID/Touch ID authentication
 * Uses @simplewebauthn/server for secure credential management
 *
 * Integration notes:
 *   - Users are looked up by EMAIL (not username — username is nullable for Firebase users)
 *   - After successful authentication, a Firebase custom token is issued so the
 *     client can call signInWithCustomToken() to establish a real Firebase session.
 *   - Challenge store uses a TTL map (5-minute expiry) to prevent memory leaks.
 *   - detectDeviceType reads the HTTP User-Agent header, not clientDataJSON.origin.
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  GenerateRegistrationOptionsOpts,
  GenerateAuthenticationOptionsOpts,
  VerifyRegistrationResponseOpts,
  VerifyAuthenticationResponseOpts,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { db } from './db';
import { users, webauthnCredentials, webauthnChallenges, type WebauthnCredential } from '@shared/schema';
import { eq, and, lt } from 'drizzle-orm';
import { getFirebaseAdmin } from './lib/firebase-admin';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RP_NAME = 'Driiva - Smart Insurance';
const RP_ID = process.env.WEBAUTHN_RP_ID ?? 'localhost';
const ORIGIN = process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:5000';
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// DB-backed challenge store — persists across server restarts
// ---------------------------------------------------------------------------

const challengeStore = {
  async set(key: string, challenge: string): Promise<void> {
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    await db
      .insert(webauthnChallenges)
      .values({ key, challenge, expiresAt })
      .onConflictDoUpdate({
        target: webauthnChallenges.key,
        set: { challenge, expiresAt },
      });
    // Sweep expired entries opportunistically
    await db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, new Date()));
  },

  async get(key: string): Promise<string | undefined> {
    const [row] = await db
      .select()
      .from(webauthnChallenges)
      .where(eq(webauthnChallenges.key, key));
    if (!row) return undefined;
    if (new Date() > row.expiresAt) {
      await db.delete(webauthnChallenges).where(eq(webauthnChallenges.key, key));
      return undefined;
    }
    return row.challenge;
  },

  async delete(key: string): Promise<void> {
    await db.delete(webauthnChallenges).where(eq(webauthnChallenges.key, key));
  },
};

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface WebAuthnService {
  generateRegistrationOptions(email: string, userAgent?: string): Promise<any>;
  verifyRegistration(email: string, response: RegistrationResponseJSON, userAgent?: string): Promise<{ verified: boolean; error?: string }>;
  generateAuthenticationOptions(email: string): Promise<any>;
  verifyAuthentication(email: string, response: AuthenticationResponseJSON): Promise<{
    verified: boolean;
    user?: any;
    customToken?: string;
    error?: string;
  }>;
  getUserCredentials(email: string): Promise<WebauthnCredential[]>;
  hasCredentials(email: string): Promise<boolean>;
  deleteCredential(credentialId: string, firebaseUid: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class SimpleWebAuthnService implements WebAuthnService {

  async generateRegistrationOptions(email: string, userAgent?: string): Promise<any> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) throw new Error('User not found');

    const existingCredentials = await db
      .select()
      .from(webauthnCredentials)
      .where(and(
        eq(webauthnCredentials.userId, user.id),
        eq(webauthnCredentials.isActive, true),
      ));

    const opts: GenerateRegistrationOptionsOpts = {
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: new TextEncoder().encode(user.id.toString()),
      userName: email,
      userDisplayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || email,
      timeout: 60000,
      attestationType: 'none',
      excludeCredentials: existingCredentials.map(cred => ({
        id: cred.credentialId,
        transports: ['internal' as const],
      })),
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      supportedAlgorithmIDs: [-7, -257],
    };

    const options = await generateRegistrationOptions(opts);
    await challengeStore.set(`reg_${email}`, options.challenge);
    return options;
  }

  async verifyRegistration(
    email: string,
    response: RegistrationResponseJSON,
    userAgent?: string,
  ): Promise<{ verified: boolean; error?: string }> {
    const expectedChallenge = await challengeStore.get(`reg_${email}`);
    if (!expectedChallenge) {
      return { verified: false, error: 'Registration challenge expired or not found' };
    }

    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) return { verified: false, error: 'User not found' };

    const opts: VerifyRegistrationResponseOpts = {
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    };

    try {
      const verification = await verifyRegistrationResponse(opts);

      if (verification.verified && verification.registrationInfo) {
        const { credential } = verification.registrationInfo;

        await db.insert(webauthnCredentials).values({
          userId: user.id,
          credentialId: Buffer.from(credential.id).toString('base64url'),
          publicKey: Buffer.from(credential.publicKey).toString('base64url'),
          counter: 0,
          deviceType: 'platform',
          deviceName: this.detectDeviceType(userAgent),
          isActive: true,
        });

        await challengeStore.delete(`reg_${email}`);
        return { verified: true };
      }

      return { verified: false, error: 'Registration verification failed' };
    } catch (error) {
      console.error('WebAuthn registration verification error:', error);
      return { verified: false, error: 'Registration verification failed' };
    }
  }

  async generateAuthenticationOptions(email: string): Promise<any> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) throw new Error('User not found');

    const userCredentials = await db
      .select()
      .from(webauthnCredentials)
      .where(and(
        eq(webauthnCredentials.userId, user.id),
        eq(webauthnCredentials.isActive, true),
      ));

    if (userCredentials.length === 0) {
      throw new Error('No biometric credentials found for this user');
    }

    const opts: GenerateAuthenticationOptionsOpts = {
      timeout: 60000,
      allowCredentials: userCredentials.map(cred => ({
        id: cred.credentialId,
        transports: ['internal' as const],
      })),
      userVerification: 'required',
      rpID: RP_ID,
    };

    const options = await generateAuthenticationOptions(opts);
    await challengeStore.set(`auth_${email}`, options.challenge);
    return options;
  }

  async verifyAuthentication(
    email: string,
    response: AuthenticationResponseJSON,
  ): Promise<{ verified: boolean; user?: any; customToken?: string; error?: string }> {
    const expectedChallenge = await challengeStore.get(`auth_${email}`);
    if (!expectedChallenge) {
      return { verified: false, error: 'Authentication challenge expired or not found' };
    }

    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) return { verified: false, error: 'User not found' };

    const [credential] = await db
      .select()
      .from(webauthnCredentials)
      .where(and(
        eq(webauthnCredentials.credentialId, response.id),
        eq(webauthnCredentials.userId, user.id),
        eq(webauthnCredentials.isActive, true),
      ));

    if (!credential) return { verified: false, error: 'Credential not found' };

    const opts: VerifyAuthenticationResponseOpts = {
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: credential.credentialId,
        publicKey: Buffer.from(credential.publicKey, 'base64url'),
        counter: credential.counter || 0,
      },
      requireUserVerification: true,
    };

    try {
      const verification = await verifyAuthenticationResponse(opts);

      if (verification.verified) {
        await db
          .update(webauthnCredentials)
          .set({
            counter: verification.authenticationInfo.newCounter,
            lastUsed: new Date(),
          })
          .where(eq(webauthnCredentials.id, credential.id));

        await challengeStore.delete(`auth_${email}`);

        // Issue a Firebase custom token so the client can call signInWithCustomToken().
        // This bridges WebAuthn auth into the Firebase session system without breaking
        // existing Firebase-JWT-protected routes.
        let customToken: string | undefined;
        if (user.firebaseUid) {
          const adminApp = getFirebaseAdmin();
          if (adminApp) {
            try {
              customToken = await adminApp.auth().createCustomToken(user.firebaseUid);
            } catch (err) {
              console.error('[WebAuthn] createCustomToken failed — user will lack Firebase session:', err);
            }
          } else {
            console.warn('[WebAuthn] Firebase Admin SDK not initialised; FIREBASE_SERVICE_ACCOUNT_KEY may be missing');
          }
        }

        const { password: _, ...userWithoutPassword } = user;
        return { verified: true, user: userWithoutPassword, customToken };
      }

      return { verified: false, error: 'Authentication verification failed' };
    } catch (error) {
      console.error('WebAuthn authentication verification error:', error);
      return { verified: false, error: 'Authentication verification failed' };
    }
  }

  async getUserCredentials(email: string): Promise<WebauthnCredential[]> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) return [];

    return db
      .select()
      .from(webauthnCredentials)
      .where(and(
        eq(webauthnCredentials.userId, user.id),
        eq(webauthnCredentials.isActive, true),
      ));
  }

  async hasCredentials(email: string): Promise<boolean> {
    try {
      const [user] = await db.select().from(users).where(eq(users.email, email));
      if (!user) return false;

      const creds = await db
        .select()
        .from(webauthnCredentials)
        .where(and(
          eq(webauthnCredentials.userId, user.id),
          eq(webauthnCredentials.isActive, true),
        ));
      return creds.length > 0;
    } catch {
      return false;
    }
  }

  async deleteCredential(credentialId: string, firebaseUid: string): Promise<boolean> {
    try {
      const [user] = await db.select().from(users).where(eq(users.firebaseUid, firebaseUid));
      if (!user) return false;

      const result = await db
        .update(webauthnCredentials)
        .set({ isActive: false })
        .where(and(
          eq(webauthnCredentials.credentialId, credentialId),
          eq(webauthnCredentials.userId, user.id),
        ));

      return (result as any).rowCount > 0;
    } catch (err) {
      console.error('[WebAuthn] deleteCredential error:', err);
      return false;
    }
  }

  /** Detect device type from the HTTP User-Agent header (not clientDataJSON.origin). */
  private detectDeviceType(userAgent?: string): string {
    if (!userAgent) return 'Biometric Authentication';
    if (/iPhone|iPad/i.test(userAgent)) return 'Face ID / Touch ID';
    if (/Macintosh/i.test(userAgent)) return 'Touch ID';
    if (/Android/i.test(userAgent)) return 'Fingerprint / Face Recognition';
    if (/Windows/i.test(userAgent)) return 'Windows Hello';
    return 'Biometric Authentication';
  }
}

export const webauthnService = new SimpleWebAuthnService();
