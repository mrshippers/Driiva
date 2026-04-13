import { describe, it, expect, vi, beforeEach } from "vitest";

// Set ADMIN env before the auth module loads (it reads env at import time).
vi.hoisted(() => {
  process.env.ADMIN_FIREBASE_UIDS = "admin-uid-1,admin-uid-2";
});

import type { Response, NextFunction } from "express";
import {
  verifyFirebaseAuth,
  requireAuth,
  requireResourceOwner,
  requireAdmin,
  AuthRequest,
} from "../middleware/auth";

vi.mock("../lib/firebase-admin", () => ({
  verifyFirebaseToken: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: { getUserByFirebaseUid: vi.fn() },
}));

import { verifyFirebaseToken } from "../lib/firebase-admin";
import { storage } from "../storage";

const mockedVerify = vi.mocked(verifyFirebaseToken);
const mockedGetUser = vi.mocked(storage.getUserByFirebaseUid);

function mockReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    headers: {},
    params: {},
    ...overrides,
  } as AuthRequest;
}

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe("verifyFirebaseAuth", () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();
  });

  it("calls next without setting req.auth when no auth header", async () => {
    const req = mockReq();
    await verifyFirebaseAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.auth).toBeUndefined();
  });

  it("calls next without setting req.auth for invalid token", async () => {
    mockedVerify.mockResolvedValue(null as any);
    const req = mockReq({ headers: { authorization: "Bearer bad-token" } } as any);
    await verifyFirebaseAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.auth).toBeUndefined();
  });

  it("sets req.auth when token is valid and user exists in DB", async () => {
    mockedVerify.mockResolvedValue({ uid: "fb-123", email: "test@driiva.com" } as any);
    mockedGetUser.mockResolvedValue({ id: 42 } as any);
    const req = mockReq({ headers: { authorization: "Bearer valid-token" } } as any);
    await verifyFirebaseAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.auth).toEqual({ uid: "fb-123", email: "test@driiva.com", userId: 42 });
  });

  it("does not set req.auth when token is valid but no DB user", async () => {
    mockedVerify.mockResolvedValue({ uid: "fb-999", email: "ghost@driiva.com" } as any);
    mockedGetUser.mockResolvedValue(null as any);
    const req = mockReq({ headers: { authorization: "Bearer valid-token" } } as any);
    await verifyFirebaseAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.auth).toBeUndefined();
  });
});

describe("requireAuth", () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it("calls next when req.auth.uid is present", () => {
    const req = mockReq({ auth: { uid: "fb-123", email: "a@b.com", userId: 1 } } as any);
    const res = mockRes();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 when req.auth is missing", () => {
    const req = mockReq();
    const res = mockRes();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "FIREBASE_TOKEN_REQUIRED" }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireResourceOwner", () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it("calls next when userId param matches req.auth.userId", () => {
    const req = mockReq({
      auth: { uid: "fb-1", userId: 7 },
      params: { userId: "7" },
    } as any);
    const res = mockRes();
    requireResourceOwner()(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("returns 403 when userId param does not match", () => {
    const req = mockReq({
      auth: { uid: "fb-1", userId: 7 },
      params: { userId: "99" },
    } as any);
    const res = mockRes();
    requireResourceOwner()(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "RESOURCE_OWNER_REQUIRED" }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireAdmin", () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it("calls next when uid is in ADMIN_UIDS", () => {
    const req = mockReq({ auth: { uid: "admin-uid-1", userId: 1 } } as any);
    const res = mockRes();
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 403 when uid is not in ADMIN_UIDS", () => {
    const req = mockReq({ auth: { uid: "not-an-admin", userId: 1 } } as any);
    const res = mockRes();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ADMIN_REQUIRED" }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
