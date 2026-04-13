import { describe, it, expect } from "vitest";

import {
  haversineMeters,
  tripDistanceMeters,
  tripDurationSeconds,
  tripDistanceAndDuration,
} from "../tripProcessor";

// ---------------------------------------------------------------------------
// haversineMeters
// ---------------------------------------------------------------------------
describe("haversineMeters", () => {
  it("returns 0 for the same point", () => {
    expect(haversineMeters(51.5074, -0.1278, 51.5074, -0.1278)).toBe(0);
  });

  it("computes London to Paris within ±1 000 m of ~343 500 m", () => {
    // London (51.5074 N, 0.1278 W) -> Paris (48.8566 N, 2.3522 E)
    const d = haversineMeters(51.5074, -0.1278, 48.8566, 2.3522);
    expect(d).toBeGreaterThan(342_500);
    expect(d).toBeLessThan(344_500);
  });

  it("computes antipodal points as approximately half Earth circumference", () => {
    // North pole to south pole ≈ π × R ≈ 20 015 087 m
    const d = haversineMeters(90, 0, -90, 0);
    const halfCircumference = Math.PI * 6_371_000;
    expect(d).toBeCloseTo(halfCircumference, -2); // within 100 m
  });
});

// ---------------------------------------------------------------------------
// tripDistanceMeters
// ---------------------------------------------------------------------------
describe("tripDistanceMeters", () => {
  it("returns 0 for an empty array", () => {
    expect(tripDistanceMeters([])).toBe(0);
  });

  it("returns 0 for a single point", () => {
    expect(tripDistanceMeters([{ lat: 51.5, lng: -0.1 }])).toBe(0);
  });

  it("sums sequential haversine distances for 3 points", () => {
    const points = [
      { lat: 51.5074, lng: -0.1278 }, // London
      { lat: 51.7520, lng: -1.2577 }, // Oxford
      { lat: 52.2053, lng: 0.1218 },  // Cambridge
    ];

    const seg1 = haversineMeters(points[0].lat, points[0].lng, points[1].lat, points[1].lng);
    const seg2 = haversineMeters(points[1].lat, points[1].lng, points[2].lat, points[2].lng);

    expect(tripDistanceMeters(points)).toBeCloseTo(seg1 + seg2, 5);
  });
});

// ---------------------------------------------------------------------------
// tripDurationSeconds
// ---------------------------------------------------------------------------
describe("tripDurationSeconds", () => {
  it("returns 0 for an empty array", () => {
    expect(tripDurationSeconds([])).toBe(0);
  });

  it("returns 0 for a single point", () => {
    expect(tripDurationSeconds([{ timestamp: Date.now() }])).toBe(0);
  });

  it("returns 30 for two points 30 000 ms apart", () => {
    const t0 = 1_700_000_000_000;
    const points = [{ timestamp: t0 }, { timestamp: t0 + 30_000 }];
    expect(tripDurationSeconds(points)).toBe(30);
  });

  it("returns minimum 1 second for very small timestamp differences", () => {
    const t0 = 1_700_000_000_000;
    // 1 ms apart -> rounds to 0 but clamped to 1
    const points = [{ timestamp: t0 }, { timestamp: t0 + 1 }];
    expect(tripDurationSeconds(points)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// tripDistanceAndDuration
// ---------------------------------------------------------------------------
describe("tripDistanceAndDuration", () => {
  it("returns { distanceMeters: 0, durationSeconds: 0 } for an empty array", () => {
    expect(tripDistanceAndDuration([])).toEqual({
      distanceMeters: 0,
      durationSeconds: 0,
    });
  });

  it("combines distance and duration correctly for multiple points", () => {
    const t0 = 1_700_000_000_000;
    const points = [
      { lat: 51.5074, lng: -0.1278, timestamp: t0 },
      { lat: 51.7520, lng: -1.2577, timestamp: t0 + 15_000 },
      { lat: 52.2053, lng: 0.1218, timestamp: t0 + 45_000 },
    ];

    const result = tripDistanceAndDuration(points);

    // Distance should be rounded sum of segments
    const expectedDistance = Math.round(tripDistanceMeters(points));
    expect(result.distanceMeters).toBe(expectedDistance);

    // Duration: (45 000 ms) / 1000 = 45 s
    expect(result.durationSeconds).toBe(45);
  });
});
