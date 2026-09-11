/**
 * TESTS: finalizeTripFromPoints - the pipeline latency it measures
 * ================================================================
 * ROADMAP TD-1. The pipeline has always MEASURED its own duration
 * (`Date.now() - pipelineStartMs`) and then thrown the number away into a log
 * line, so the only way to get it back onto the admin page was to parse Cloud
 * Logging, which needs an API nobody has enabled. It is written onto the trip
 * document now, beside the other numbers this same update computes.
 *
 * Two laws, and the second is the one that rots quietly: the trip carries the
 * latency, and the log line and the document report the SAME number. A second
 * `Date.now()` call for the log would drift from the stored value by however
 * long the write took, and then two surfaces would disagree about one
 * measurement with nothing to catch it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockGet, mockUpdate } from '../setup';
import * as functions from 'firebase-functions';

vi.mock('../../utils/weather', () => ({
  getWeatherForTrip: vi.fn().mockResolvedValue('clear'),
}));

vi.mock('../../triggers/tripSideEffects', () => ({
  checkDpiaCompliance: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@sentry/node', () => ({
  startSpan: vi.fn((_opts: unknown, cb: () => unknown) => cb()),
}));

import { finalizeTripFromPoints } from '../../triggers/tripFinalisation';
import type { TripDocument } from '../../types';

const ts = (date: Date) => ({
  toDate: () => date,
  seconds: Math.floor(date.getTime() / 1000),
  nanoseconds: 0,
});

const START = new Date('2026-09-11T10:00:00Z');
const END = new Date('2026-09-11T10:20:00Z');

/** Three plausible points a mile apart on the A40, 30s between each. */
const POINTS = [
  { t: 0, lat: 51.5074, lng: -0.1278, spd: 1200, hdg: 90, acc: 5 },
  { t: 30_000, lat: 51.5085, lng: -0.1200, spd: 1300, hdg: 92, acc: 5 },
  { t: 60_000, lat: 51.5096, lng: -0.1120, spd: 1250, hdg: 91, acc: 5 },
];

const tripData = (): TripDocument => ({
  tripId: 'trip-001',
  userId: 'user-001',
  startedAt: ts(START),
  endedAt: ts(END),
  durationSeconds: 1200,
  startLocation: { lat: 51.5074, lng: -0.1278, address: 'London', placeType: 'home' },
  endLocation: { lat: 51.5096, lng: -0.1120, address: 'London', placeType: 'work' },
  distanceMeters: 0,
  score: 0,
  scoreBreakdown: {
    speedScore: 0, brakingScore: 0, accelerationScore: 0, corneringScore: 0, phoneUsageScore: 0,
  },
  events: {
    hardBrakingCount: 0, hardAccelerationCount: 0, speedingSeconds: 0, sharpTurnCount: 0, phonePickupCount: 0,
  },
  anomalies: {
    hasGpsJumps: false, hasImpossibleSpeed: false, isDuplicate: false, flaggedForReview: false,
  },
  status: 'processing',
  processedAt: null,
  context: null,
  createdAt: ts(START),
  createdBy: 'user-001',
  pointsCount: POINTS.length,
} as unknown as TripDocument);

/** The finalising update: the one carrying the computed score. */
const finalisingUpdate = () =>
  mockUpdate.mock.calls
    .map((call: unknown[]) => call[0] as Record<string, unknown>)
    .find((payload) => 'score' in payload);

const pipelineMetricLog = () =>
  (functions.logger.info as unknown as { mock: { calls: unknown[][] } }).mock.calls
    .find((call) => call[0] === '[metric] trip_pipeline')?.[1] as Record<string, unknown> | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue({ exists: true, data: () => ({ points: POINTS }) });
});

describe('finalizeTripFromPoints: pipeline latency', () => {
  it('writes the measured latency onto the trip document', async () => {
    await finalizeTripFromPoints('trip-001', tripData());

    const update = finalisingUpdate();
    expect(update).toBeDefined();
    expect(typeof update!.pipelineLatencyMs).toBe('number');
    expect(update!.pipelineLatencyMs as number).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(update!.pipelineLatencyMs as number)).toBe(true);
  });

  it('logs the same number it stored, not a second reading of the clock', async () => {
    await finalizeTripFromPoints('trip-001', tripData());

    const logged = pipelineMetricLog();
    expect(logged).toBeDefined();
    expect(logged!.latencyMs).toBe(finalisingUpdate()!.pipelineLatencyMs);
  });

  it('still finalises the trip: status and the computed metrics are unchanged', async () => {
    await finalizeTripFromPoints('trip-001', tripData());

    const update = finalisingUpdate()!;
    expect(update.status).toBe('completed');
    expect(update.distanceMeters).toBeGreaterThan(0);
    expect(update.scoreBreakdown).toBeDefined();
  });
});
