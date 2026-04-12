/**
 * Rate limiters for sensitive and high-impact endpoints.
 * Use in addition to global API limiter to reduce DoS and abuse risk.
 *
 * - gdprDeleteLimiter: DELETE /api/gdpr/delete/:userId — account wipe (strict)
 * - poolModificationLimiter: PUT /api/community-pool — admin pool updates
 *
 * Both are distributed-safe (backed by Upstash Redis when env vars are set).
 * See distributedRateLimit.ts for the store implementation and swap guide.
 */

import { makeRateLimiter, normalizeIp } from "./distributedRateLimit";

/** GDPR delete: very strict — 3 attempts per hour per IP. */
export const gdprDeleteLimiter = makeRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => `gdpr:${normalizeIp(req)}`,
  message: "Too many delete attempts. Try again later.",
});

/** Community pool modifications: 10 per 15 min per IP. */
export const poolModificationLimiter = makeRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `pool:${normalizeIp(req)}`,
  message: "Too many pool update attempts.",
});
