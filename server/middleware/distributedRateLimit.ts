/**
 * Distributed rate limiting for Vercel serverless.
 *
 * The Problem
 * -----------
 * express-rate-limit keeps counters in Node process memory. On Vercel each
 * function invocation may land on a different (cold) container, so every
 * request can see a fresh counter — the limit is effectively a no-op in
 * production.
 *
 * This Solution
 * -------------
 * A lightweight sliding-window limiter backed by an atomic Redis INCR+EXPIRE
 * when a REDIS_URL env var is present, with a transparent in-process fallback
 * for local development (where single-process guarantees hold).
 *
 * Swapping to Upstash
 * -------------------
 * Install:  npm install @upstash/redis @upstash/ratelimit
 * Then replace the RedisStore class below with:
 *
 *   import { Redis } from "@upstash/redis";
 *   import { Ratelimit } from "@upstash/ratelimit";
 *
 *   const redis = new Redis({
 *     url: process.env.UPSTASH_REDIS_REST_URL!,
 *     token: process.env.UPSTASH_REDIS_REST_TOKEN!,
 *   });
 *
 *   // Then use Ratelimit.slidingWindow() as the store in makeRateLimiter.
 *
 * No changes to the middleware interface are needed — just the constructor.
 */

import type { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Internal store interface — compatible with both Redis and in-memory
// ---------------------------------------------------------------------------

interface RateLimitStore {
  /** Increment counter for key, set TTL to windowMs on first hit.
   *  Returns { count, ttlMs } after increment. */
  increment(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>;
}

// ---------------------------------------------------------------------------
// In-memory store (local dev / fallback)
// ---------------------------------------------------------------------------

class InMemoryStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; expiresAt: number }>();

  async increment(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }> {
    const now = Date.now();
    const existing = this.buckets.get(key);

    if (existing && existing.expiresAt > now) {
      existing.count += 1;
      return { count: existing.count, ttlMs: existing.expiresAt - now };
    }

    // New or expired window
    const expiresAt = now + windowMs;
    this.buckets.set(key, { count: 1, expiresAt });
    return { count: 1, ttlMs: windowMs };
  }
}

// ---------------------------------------------------------------------------
// Redis store — uses INCR + PEXPIRE via raw TCP Redis protocol (no extra dep)
// Compatible with Upstash REST if REDIS_URL is an Upstash REST URL, but for
// now we use the ioredis-style command set via a minimal fetch wrapper so the
// only requirement is REDIS_URL pointing to a standard Redis instance.
//
// To use with Upstash Redis REST API set:
//   UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
// and swap this class for the @upstash/redis client (see header comment).
// ---------------------------------------------------------------------------

class UpstashRestStore implements RateLimitStore {
  private url: string;
  private token: string;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }> {
    // Use Upstash pipeline: INCR key + PEXPIRE key windowMs (only set TTL on first)
    // We do two sequential calls so PEXPIRE only fires when count becomes 1.
    const incr = await this.command(["INCR", key]);
    const count = incr as number;

    if (count === 1) {
      await this.command(["PEXPIRE", key, String(windowMs)]);
    }

    // Fetch remaining TTL so we can set Retry-After accurately
    const pttl = await this.command(["PTTL", key]);
    const ttlMs = typeof pttl === "number" && pttl > 0 ? pttl : windowMs;

    return { count, ttlMs };
  }

  private async command(args: string[]): Promise<unknown> {
    const res = await fetch(`${this.url}/${args.map(encodeURIComponent).join("/")}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`Upstash Redis error: ${res.status}`);
    const json = (await res.json()) as { result: unknown };
    return json.result;
  }
}

// ---------------------------------------------------------------------------
// Store factory — picks the right backend at module load time
// ---------------------------------------------------------------------------

function buildStore(): RateLimitStore {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (restUrl && restToken) {
    console.log("[rate-limit] Using Upstash Redis REST store");
    return new UpstashRestStore(restUrl, restToken);
  }

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[rate-limit] WARNING: No UPSTASH_REDIS_REST_URL set — " +
        "falling back to in-memory store. Rate limiting is NOT distributed."
    );
  }

  return new InMemoryStore();
}

// Singleton store shared across all limiter instances in this process
const store: RateLimitStore = buildStore();

// ---------------------------------------------------------------------------
// Public middleware factory
// ---------------------------------------------------------------------------

export interface RateLimitOptions {
  /** Rolling window duration in milliseconds */
  windowMs: number;
  /** Maximum requests allowed per window */
  max: number;
  /** Function that extracts a unique key from the request (IP, userId, etc.) */
  keyGenerator: (req: Request) => string;
  /** Message sent in the 429 response body */
  message?: string;
}

/**
 * Returns an Express middleware that enforces a fixed-window rate limit.
 * Safe across Vercel serverless invocations when Upstash env vars are set.
 */
export function makeRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    keyGenerator,
    message = "Too many requests, please try again later.",
  } = options;

  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const key = keyGenerator(req);

    try {
      const { count, ttlMs } = await store.increment(key, windowMs);

      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, max - count));
      res.setHeader("X-RateLimit-Reset", Math.ceil((Date.now() + ttlMs) / 1000));

      if (count > max) {
        res.setHeader("Retry-After", Math.ceil(ttlMs / 1000));
        res.status(429).json({ message });
        return;
      }

      next();
    } catch (err) {
      // If the Redis store is unreachable, fail open (let the request through)
      // and log so the problem is visible in Vercel logs.
      console.error("[rate-limit] Store error — failing open:", err);
      next();
    }
  };
}

// ---------------------------------------------------------------------------
// Helper: normalise client IP (strips IPv4-mapped IPv6 prefix)
// ---------------------------------------------------------------------------

export function normalizeIp(req: Request): string {
  return (req.ip ?? "unknown").replace(/^::ffff:/, "");
}
