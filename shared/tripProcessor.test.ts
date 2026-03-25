import { describe, it, expect } from 'vitest';
import {
  haversineMeters,
  tripDistanceMeters,
  tripDurationSeconds,
  tripDistanceAndDuration,
} from './tripProcessor';

// =============================================================================
// haversineMeters
// =============================================================================

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters(51.5074, -0.1278, 51.5074, -0.1278)).toBe(0);
  });

  it('is symmetric (A→B === B→A)', () => {
    const ab = haversineMeters(51.5074, -0.1278, 48.8566, 2.3522);
    const ba = haversineMeters(48.8566, 2.3522, 51.5074, -0.1278);
    expect(ab).toBeCloseTo(ba, 6);
  });

  it('calculates London to Paris (~343 km)', () => {
    const dist = haversineMeters(51.5074, -0.1278, 48.8566, 2.3522);
    expect(dist).toBeGreaterThan(340_000);
    expect(dist).toBeLessThan(350_000);
  });

  it('calculates London to Birmingham (~163 km)', () => {
    const dist = haversineMeters(51.5074, -0.1278, 52.4862, -1.8904);
    expect(dist).toBeGreaterThan(158_000);
    expect(dist).toBeLessThan(168_000);
  });

  it('handles equator crossing', () => {
    const dist = haversineMeters(1, 0, -1, 0);
    // 2 degrees of latitude ≈ 222 km
    expect(dist).toBeGreaterThan(220_000);
    expect(dist).toBeLessThan(225_000);
  });

  it('handles anti-meridian crossing (179° to -179°)', () => {
    const dist = haversineMeters(0, 179, 0, -179);
    // 2 degrees of longitude at equator ≈ 222 km
    expect(dist).toBeGreaterThan(220_000);
    expect(dist).toBeLessThan(225_000);
  });

  it('handles same-street distances (~100m)', () => {
    // Two points ~111m apart (0.001° latitude at London)
    const dist = haversineMeters(51.5074, -0.1278, 51.5084, -0.1278);
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(120);
  });

  it('handles poles', () => {
    const dist = haversineMeters(90, 0, -90, 0);
    // Pole to pole ≈ 20,015 km
    expect(dist).toBeGreaterThan(20_000_000);
    expect(dist).toBeLessThan(20_100_000);
  });
});

// =============================================================================
// tripDistanceMeters
// =============================================================================

describe('tripDistanceMeters', () => {
  it('returns 0 for empty array', () => {
    expect(tripDistanceMeters([])).toBe(0);
  });

  it('returns 0 for single point', () => {
    expect(tripDistanceMeters([{ lat: 51.5, lng: -0.1 }])).toBe(0);
  });

  it('sums distances between sequential points', () => {
    const points = [
      { lat: 51.5000, lng: -0.1 },
      { lat: 51.5010, lng: -0.1 },
      { lat: 51.5020, lng: -0.1 },
    ];
    const dist = tripDistanceMeters(points);
    // Two segments of ~111m each
    expect(dist).toBeGreaterThan(200);
    expect(dist).toBeLessThan(250);
  });

  it('handles out-and-back route (distance > 0 even if start === end)', () => {
    const points = [
      { lat: 51.5, lng: -0.1 },
      { lat: 51.6, lng: -0.1 },
      { lat: 51.5, lng: -0.1 },
    ];
    const dist = tripDistanceMeters(points);
    // ~11km each way = ~22km total
    expect(dist).toBeGreaterThan(20_000);
    expect(dist).toBeLessThan(24_000);
  });
});

// =============================================================================
// tripDurationSeconds
// =============================================================================

describe('tripDurationSeconds', () => {
  it('returns 0 for empty array', () => {
    expect(tripDurationSeconds([])).toBe(0);
  });

  it('returns 0 for single point', () => {
    expect(tripDurationSeconds([{ timestamp: 1000 }])).toBe(0);
  });

  it('returns at least 1 second for two points', () => {
    const points = [{ timestamp: 1000 }, { timestamp: 1500 }];
    expect(tripDurationSeconds(points)).toBe(1);
  });

  it('calculates duration from first to last point (ignoring middle)', () => {
    const points = [
      { timestamp: 0 },
      { timestamp: 30000 },
      { timestamp: 60000 },
    ];
    expect(tripDurationSeconds(points)).toBe(60);
  });

  it('handles large durations (1 hour trip)', () => {
    const points = [
      { timestamp: 0 },
      { timestamp: 3_600_000 },
    ];
    expect(tripDurationSeconds(points)).toBe(3600);
  });
});

// =============================================================================
// tripDistanceAndDuration (combined)
// =============================================================================

describe('tripDistanceAndDuration', () => {
  it('returns zeros for empty array', () => {
    expect(tripDistanceAndDuration([])).toEqual({
      distanceMeters: 0,
      durationSeconds: 0,
    });
  });

  it('returns zeros for single point', () => {
    const result = tripDistanceAndDuration([{ lat: 51.5, lng: -0.1, timestamp: 0 }]);
    expect(result).toEqual({ distanceMeters: 0, durationSeconds: 0 });
  });

  it('returns combined distance and duration', () => {
    const points = [
      { lat: 51.5000, lng: -0.1, timestamp: 0 },
      { lat: 51.5010, lng: -0.1, timestamp: 60000 },
    ];
    const result = tripDistanceAndDuration(points);
    expect(result.distanceMeters).toBeGreaterThan(100);
    expect(result.durationSeconds).toBe(60);
  });

  it('rounds distanceMeters to integer', () => {
    const points = [
      { lat: 51.5, lng: -0.1, timestamp: 0 },
      { lat: 51.5001, lng: -0.1, timestamp: 10000 },
    ];
    const result = tripDistanceAndDuration(points);
    expect(Number.isInteger(result.distanceMeters)).toBe(true);
  });

  it('is deterministic — same input always produces same output', () => {
    const points = [
      { lat: 51.5074, lng: -0.1278, timestamp: 0 },
      { lat: 51.5100, lng: -0.1300, timestamp: 30000 },
      { lat: 51.5150, lng: -0.1350, timestamp: 60000 },
    ];
    const r1 = tripDistanceAndDuration(points);
    const r2 = tripDistanceAndDuration(points);
    const r3 = tripDistanceAndDuration(points);
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });
});
