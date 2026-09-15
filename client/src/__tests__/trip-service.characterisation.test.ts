/**
 * CHARACTERISATION SUITE — client trip service (rebuild mission, 2026-07).
 *
 * client/src/lib/tripService.ts is the LIVE trip ingestion path (Firestore) -
 * the Neon POST /api/trips endpoint was unreachable over JSON (see findings
 * §0.4) and has since been removed outright (dead-code sweep, 2026-08-18).
 * This locks in: the TripPointStreamer batching contract, the
 * startTrip atomic write shape, endTrip's rule-lock contract (score fields
 * intentionally absent), cancelTrip's Cloud Function delegation, and the
 * client-side default scoring weights.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { fsMock } = vi.hoisted(() => {
  let autoId = 0;
  const batch = {
    set: vi.fn(),
    update: vi.fn(),
    commit: vi.fn(async () => undefined),
  };
  return {
    fsMock: {
      batch,
      autoIdReset: () => {
        autoId = 0;
      },
      collection: vi.fn((parent: unknown, name?: string) => ({ __collection: name ?? "root", parent })),
      doc: vi.fn((...args: unknown[]) => {
        if (args.length === 1) {
          autoId += 1;
          return { id: `auto-trip-${autoId}`, __ref: args[0] };
        }
        // doc(db, collectionName, id) or doc(collectionRef, id)
        return { id: String(args[args.length - 1]), __path: args.slice(1).join("/") };
      }),
      setDoc: vi.fn(async (..._args: unknown[]) => undefined),
      addDoc: vi.fn(async () => ({ id: "added" })),
      writeBatch: vi.fn(() => batch),
      serverTimestamp: vi.fn(() => "SERVER_TS"),
      Timestamp: { now: vi.fn(() => ({ seconds: 1_780_000_000, nanoseconds: 0 })) },
    },
  };
});

vi.mock("firebase/firestore", () => ({
  collection: fsMock.collection,
  doc: fsMock.doc,
  setDoc: fsMock.setDoc,
  addDoc: fsMock.addDoc,
  writeBatch: fsMock.writeBatch,
  serverTimestamp: fsMock.serverTimestamp,
  Timestamp: fsMock.Timestamp,
}));

vi.mock("@/lib/firebase", () => ({
  db: { __db: true },
  isFirebaseConfigured: true,
}));

vi.mock("@/lib/firestore", () => ({
  updateTripStatus: vi.fn(async () => undefined),
}));

import {
  TripPointStreamer,
  startTrip,
  endTrip,
  cancelTrip,
  createTripLocation,
} from "@/lib/tripService";
import { updateTripStatus } from "@/lib/firestore";

const point = (i: number, over: Record<string, unknown> = {}) => ({
  timestamp: 1_000_000 + i * 1000,
  latitude: 51.5 + i * 0.001,
  longitude: -0.12,
  speed: 13.411,
  heading: 90.4,
  accuracy: 5.6,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  fsMock.autoIdReset();
});

describe("TripPointStreamer", () => {
  it("ignores points before start() — nothing buffered, nothing counted", () => {
    const s = new TripPointStreamer("trip-1", "user-1", 1_000_000);
    s.addPoint(point(1) as never);
    expect(s.getStats()).toEqual({ buffered: 0, flushed: 0, total: 0 });
  });

  it("transforms points: t = offset from trip start, spd = m/s ×100 rounded, hdg/acc rounded, null speed → 0", async () => {
    const s = new TripPointStreamer("trip-1", "user-1", 1_000_000);
    s.start();
    s.addPoint(point(1) as never); // timestamp 1_001_000
    s.addPoint(point(2, { speed: null }) as never);
    await s.stop();

    expect(fsMock.setDoc).toHaveBeenCalledTimes(1);
    const payload = fsMock.setDoc.mock.calls[0][1] as Record<string, unknown>;
    const pts = payload.points as Array<Record<string, number>>;
    expect(pts[0]).toEqual({ t: 1000, lat: 51.501, lng: -0.12, spd: 1341, hdg: 90, acc: 6 });
    expect(pts[1].spd).toBe(0);
    expect(payload.startOffset).toBe(1000);
    expect(payload.endOffset).toBe(2000);
    expect(payload.batchIndex).toBe(0);
    expect(payload.createdAt).toBe("SERVER_TS");
  });

  it("auto-flushes at 100 buffered points into batches/{0}, second flush gets index 1", async () => {
    const s = new TripPointStreamer("trip-1", "user-1", 1_000_000);
    s.start();
    for (let i = 0; i < 100; i++) s.addPoint(point(i) as never);
    // allow the auto-flush microtask to run
    await new Promise((r) => setTimeout(r, 0));
    expect(fsMock.setDoc).toHaveBeenCalledTimes(1);
    expect((fsMock.setDoc.mock.calls[0][1] as Record<string, unknown>).batchIndex).toBe(0);

    for (let i = 100; i < 105; i++) s.addPoint(point(i) as never);
    await s.stop();
    expect(fsMock.setDoc).toHaveBeenCalledTimes(2);
    expect((fsMock.setDoc.mock.calls[1][1] as Record<string, unknown>).batchIndex).toBe(1);
    expect((fsMock.setDoc.mock.calls[1][1] as Record<string, unknown>).points).toHaveLength(5);
  });

  it("a failed flush restores points to the buffer and the next flush retries them (no data loss, index NOT reused)", async () => {
    const s = new TripPointStreamer("trip-1", "user-1", 1_000_000, () => undefined);
    s.start();
    s.addPoint(point(1) as never);
    fsMock.setDoc.mockRejectedValueOnce(new Error("firestore down"));

    // stop() flushes; first attempt fails, points return to buffer
    await expect(s.stop()).rejects.toThrow("firestore down");
    expect(s.getStats().buffered).toBe(1);

    // manual retry via a second stop-driven flush succeeds
    await s.stop();
    expect(fsMock.setDoc).toHaveBeenCalledTimes(2);
    const retried = fsMock.setDoc.mock.calls[1][1] as Record<string, unknown>;
    expect((retried.points as unknown[])).toHaveLength(1);
    // QUIRK (pinned): the failed flush already consumed batchIndex 0, so the
    // retry writes batches/{1} — indices are reserved even for failed writes.
    expect(retried.batchIndex).toBe(1);
  });

  it("stop() returns the total point count and clears the interval", async () => {
    const s = new TripPointStreamer("trip-1", "user-1", 1_000_000);
    s.start();
    s.addPoint(point(1) as never);
    s.addPoint(point(2) as never);
    await expect(s.stop()).resolves.toBe(2);
  });
});

describe("startTrip", () => {
  it("writes trip + tripPoints parent in ONE batch (atomic), returns the ActiveTrip", async () => {
    const active = await startTrip({
      userId: "user-1",
      startLocation: createTripLocation(51.5, -0.12),
    });

    expect(fsMock.writeBatch).toHaveBeenCalledTimes(1);
    expect(fsMock.batch.set).toHaveBeenCalledTimes(2);
    expect(fsMock.batch.commit).toHaveBeenCalledTimes(1);

    const tripDoc = fsMock.batch.set.mock.calls[0][1] as Record<string, unknown>;
    expect(tripDoc.status).toBe("recording");
    expect(tripDoc.score).toBe(0);
    expect(tripDoc.scoreBreakdown).toEqual({
      speedScore: 100,
      brakingScore: 100,
      accelerationScore: 100,
      corneringScore: 100,
      phoneUsageScore: 100,
    });
    // QUIRK: endedAt is initialised to the start time (not null) and
    // endLocation to the start location — a 'recording' trip reads as a
    // zero-length round trip until endTrip overwrites these.
    expect(tripDoc.endedAt).toEqual(tripDoc.startedAt);
    expect(tripDoc.endLocation).toEqual(tripDoc.startLocation);

    const pointsParent = fsMock.batch.set.mock.calls[1][1] as Record<string, unknown>;
    expect(pointsParent).toMatchObject({ tripId: active.tripId, userId: "user-1", totalPoints: 0 });
    expect(active.status).toBe("recording");
  });
});

describe("endTrip - the rule-lock contract", () => {
  it("flips status to 'processing' and NEVER writes score/scoreBreakdown/events (Cloud Function authority; client write would be permission-denied)", async () => {
    await endTrip(
      "trip-9",
      {
        endLocation: createTripLocation(51.6, -0.1),
        events: {} as never,
        distanceMeters: 12345.67,
      },
      420
    );

    // ONE update, on the trip document only. See the tripPoints assertion at
    // the end of this test for why the second one had to go.
    expect(fsMock.batch.update).toHaveBeenCalledTimes(1);
    const tripUpdate = fsMock.batch.update.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(tripUpdate).sort()).toEqual([
      "clientReportedPhonePickupCount",
      "distanceMeters",
      "endLocation",
      "endedAt",
      "pointsCount",
      "status",
    ]);
    expect(tripUpdate.status).toBe("processing");
    expect(tripUpdate.distanceMeters).toBe(12346); // rounded
    expect(tripUpdate.pointsCount).toBe(420);
    // The caller-supplied score/breakdown/events are accepted as params and DISCARDED:
    expect(tripUpdate).not.toHaveProperty("score");
    expect(tripUpdate).not.toHaveProperty("scoreBreakdown");
    expect(tripUpdate).not.toHaveProperty("events");
    // events was `{} as never` above (no phonePickupCount) - the missing
    // value is normalised to 0, not passed through as undefined/NaN.
    expect(tripUpdate.clientReportedPhonePickupCount).toBe(0);

    // THE LOAD-BEARING ONE. endTrip used to add a second update to
    // tripPoints/{tripId} in this same batch, and firestore.rules says
    // `allow update: if false` on that collection without exception. A
    // writeBatch is atomic, so the denied write took the trip update down with
    // it and the trip never left 'recording' or reached the scoring function.
    //
    // This suite could not see it: the Firestore mock above refuses nothing, so
    // the old expectation pinned a shape that always failed against real rules.
    // The mobile twin had the identical batch and is fixed on feat/fable-trip,
    // where tests/rules/trip-points.test.ts proves the denial against the
    // emulator. That rules test is the authority for this claim, not this file.
    const updatedPaths = fsMock.batch.update.mock.calls.map(
      (call) => (call[0] as { __path?: string }).__path
    );
    expect(updatedPaths).toEqual(["trips/trip-9"]);
    expect(updatedPaths.some((path) => String(path).startsWith("tripPoints/"))).toBe(false);

    expect(fsMock.batch.commit).toHaveBeenCalledTimes(1);
  });

  it("carries a real phonePickupCount from `events` through to clientReportedPhonePickupCount (M2-DEC-1 Option A: the submission payload actually carries the count)", async () => {
    await endTrip(
      "trip-10",
      {
        endLocation: createTripLocation(51.6, -0.1),
        events: {
          hardBrakingCount: 0,
          hardAccelerationCount: 0,
          speedingSeconds: 0,
          sharpTurnCount: 0,
          phonePickupCount: 3,
        },
        distanceMeters: 1000,
      },
      50
    );

    const tripUpdate = fsMock.batch.update.mock.calls[0][1] as Record<string, unknown>;
    expect(tripUpdate.clientReportedPhonePickupCount).toBe(3);
  });

  it("normalises a negative or non-finite phonePickupCount to 0 rather than writing it as-is", async () => {
    await endTrip(
      "trip-11",
      {
        endLocation: createTripLocation(51.6, -0.1),
        events: {
          hardBrakingCount: 0,
          hardAccelerationCount: 0,
          speedingSeconds: 0,
          sharpTurnCount: 0,
          phonePickupCount: -5,
        },
        distanceMeters: 1000,
      },
      50
    );

    const tripUpdate = fsMock.batch.update.mock.calls[0][1] as Record<string, unknown>;
    expect(tripUpdate.clientReportedPhonePickupCount).toBe(0);
  });
});

describe("cancelTrip", () => {
  it("delegates to updateTripStatus(tripId,'failed') — the Cloud Function cancel path, no direct Firestore writes", async () => {
    await cancelTrip("trip-9");
    expect(updateTripStatus).toHaveBeenCalledWith("trip-9", "failed");
    expect(fsMock.writeBatch).not.toHaveBeenCalled();
  });
});
