/**
 * Production-grade auth middleware for Driiva API.
 *
 * Protection levels:
 * - Public: no auth (e.g. POST /api/auth/login, GET /api/leaderboard, GET /api/community-pool read)
 * - requireAuth: valid Firebase JWT required; user ID comes from verified token only (never from headers)
 * - requireResourceOwner: requireAuth + path param (e.g. :userId) must match authenticated user
 * - requireAdmin: requireAuth + Firebase UID must be in ADMIN_FIREBASE_UIDS
 */

import type { Request, Response, NextFunction } from "express";
import { verifyFirebaseToken } from "../lib/firebase-admin";
import { storage } from "../storage";

/** Authenticated request: uid/email from verified Firebase token; userId from DB lookup. */
export interface AuthRequest extends Request {
  auth?: {
    uid: string;
    email?: string;
    /** Internal DB user id; undefined if the user has no record in the Neon DB yet. */
    userId: number | undefined;
  };
}

const ADMIN_UIDS = new Set(
  (process.env.ADMIN_FIREBASE_UIDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

/**
 * Verifies Firebase JWT from Authorization: Bearer <token>.
 * Sets req.auth.uid and req.auth.email from token; req.auth.userId from DB (getUserByFirebaseUid).
 * Does NOT send response — use requireAuth for 401 on missing/invalid token.
 */
export async function verifyFirebaseAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next();
    return;
  }
  const token = authHeader.slice(7);
  if (!token) {
    next();
    return;
  }

  const decoded = await verifyFirebaseToken(token);
  if (!decoded) {
    next();
    return;
  }

  const user = await storage.getUserByFirebaseUid(decoded.uid);
  if (!user) {
    // Firebase token is valid but no matching DB record — treat as unauthenticated.
    // requireAuth will return 401; avoids userId=0 matching real rows.
    next();
    return;
  }
  req.auth = {
    uid: decoded.uid,
    email: decoded.email,
    userId: user?.id,
  };
  next();
}

/**
 * Requires a valid Firebase JWT. Returns 401 for missing or invalid token.
 * User identity is taken only from the verified token (never from x-user-id or path params).
 */
export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.auth?.uid) {
    res.status(401).json({
      message: "Unauthorized",
      code: "FIREBASE_TOKEN_REQUIRED",
      authenticated: false,
    });
    return;
  }
  next();
}

/**
 * Requires the authenticated user to own the resource.
 * Use for routes with :userId (or custom param). Returns 403 if param userId !== req.auth.userId.
 * Must be used after requireAuth.
 */
export function requireResourceOwner(paramName = "userId") {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const param = req.params[paramName];
    const requestedId = param ? parseInt(String(param), 10) : NaN;
    if (Number.isNaN(requestedId) || req.auth!.userId === undefined || req.auth!.userId !== requestedId) {
      res.status(403).json({
        message: "Forbidden",
        code: "RESOURCE_OWNER_REQUIRED",
      });
      return;
    }
    next();
  };
}

/**
 * Requires admin role. Uses ADMIN_FIREBASE_UIDS env (comma-separated Firebase UIDs).
 * Returns 403 for non-admin. Must be used after requireAuth.
 */
export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.auth?.uid) {
    res.status(401).json({
      message: "Unauthorized",
      code: "FIREBASE_TOKEN_REQUIRED",
    });
    return;
  }
  if (!ADMIN_UIDS.has(req.auth.uid)) {
    res.status(403).json({
      message: "Forbidden",
      code: "ADMIN_REQUIRED",
    });
    return;
  }
  next();
}
