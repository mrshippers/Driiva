/**
 * TRIP SERVICE
 * ============
 * Firestore service for managing trips and streaming GPS points.
 * 
 * Features:
 *   - Create trips with 'recording' status
 *   - Stream GPS points to Firestore during trip
 *   - Batch points for efficient writes
 *   - End trip with final scoring and status update
 *   - Automatic cleanup and error handling
 */

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import {
  COLLECTION_NAMES,
  TripDocument,
  TripLocation,
  TripEvents,
  ScoreBreakdown,
  TripPoint,
} from '../../../shared/firestore-types';
import type { TrackedPoint } from '@/hooks/useTripLocationTracker';

// ============================================================================
// TYPES
// ============================================================================

export interface TripStartInput {
  userId: string;
  startLocation: TripLocation;
}

export interface TripEndInput {
  endLocation: TripLocation;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  events: TripEvents;
  distanceMeters: number;
}

export interface ActiveTrip {
  tripId: string;
  userId: string;
  startedAt: Timestamp;
  startLocation: TripLocation;
  pointsCount: number;
  status: 'recording';
}

export interface PointsBatch {
  points: TripPoint[];
  batchIndex: number;
  tripId: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum points per batch write */
const BATCH_SIZE = 100;

/** Interval for flushing points to Firestore (ms) */
const FLUSH_INTERVAL = 10000; // 10 seconds

// ============================================================================
// TRIP POINT STREAMING SERVICE
// ============================================================================

/**
 * Manages streaming GPS points to Firestore during an active trip.
 * Buffers points and flushes them periodically for efficiency.
 */
export class TripPointStreamer {
  private tripId: string;
  private userId: string;
  private tripStartTime: number;
  private buffer: TripPoint[] = [];
  private batchIndex: number = 0;
  private totalPoints: number = 0;
  private flushInterval: NodeJS.Timeout | null = null;
  private isActive: boolean = false;
  private onError?: (error: Error) => void;

  constructor(
    tripId: string,
    userId: string,
    tripStartTime: number,
    onError?: (error: Error) => void
  ) {
    this.tripId = tripId;
    this.userId = userId;
    this.tripStartTime = tripStartTime;
    this.onError = onError;
  }

  /**
   * Start the streamer - begins periodic flushing
   */
  start(): void {
    if (this.isActive) return;
    
    this.isActive = true;
    this.flushInterval = setInterval(() => {
      this.flush().catch(err => {
        console.error('[TripPointStreamer] Flush error:', err);
        this.onError?.(err);
      });
    }, FLUSH_INTERVAL);
  }

  /**
   * Stop the streamer - flushes remaining points
   */
  async stop(): Promise<number> {
    this.isActive = false;
    
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Flush remaining points
    await this.flush();
    
    return this.totalPoints;
  }

  /**
   * Add a point to the buffer
   */
  addPoint(point: TrackedPoint): void {
    if (!this.isActive) return;

    const tripPoint: TripPoint = {
      t: point.timestamp - this.tripStartTime, // Offset from trip start
      lat: point.latitude,
      lng: point.longitude,
      spd: Math.round((point.speed ?? 0) * 100), // m/s * 100 for precision
      hdg: Math.round(point.heading ?? 0),
      acc: Math.round(point.accuracy),
    };

    this.buffer.push(tripPoint);
    this.totalPoints++;

    // Auto-flush if buffer is full
    if (this.buffer.length >= BATCH_SIZE) {
      this.flush().catch(err => {
        console.error('[TripPointStreamer] Auto-flush error:', err);
        this.onError?.(err);
      });
    }
  }

  /**
   * Flush buffer to Firestore
   */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    if (!isFirebaseConfigured || !db) {
      console.warn('[TripPointStreamer] Firestore not configured, skipping flush');
      return;
    }

    const pointsToWrite = [...this.buffer];
    this.buffer = [];

    try {
      // Write to tripPoints/{tripId}/batches/{batchIndex}
      const tripPointsRef = doc(db, COLLECTION_NAMES.TRIP_POINTS, this.tripId);
      const batchRef = doc(collection(tripPointsRef, 'batches'), String(this.batchIndex));

      await setDoc(batchRef, {
        tripId: this.tripId,
        userId: this.userId,
        batchIndex: this.batchIndex,
        startOffset: pointsToWrite[0]?.t ?? 0,
        endOffset: pointsToWrite[pointsToWrite.length - 1]?.t ?? 0,
        points: pointsToWrite,
        createdAt: serverTimestamp(),
      });

      this.batchIndex++;
    } catch (error) {
      // Put points back in buffer on error
      this.buffer = [...pointsToWrite, ...this.buffer];
      throw error;
    }
  }

  /**
   * Get current stats
   */
  getStats(): { buffered: number; flushed: number; total: number } {
    return {
      buffered: this.buffer.length,
      flushed: this.totalPoints - this.buffer.length,
      total: this.totalPoints,
    };
  }
}

// ============================================================================
// TRIP SERVICE FUNCTIONS
// ============================================================================

/**
 * Assert Firestore is configured
 */
function assertFirestore(): void {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firestore is not configured. Check Firebase environment variables.');
  }
}

/**
 * Start a new trip - creates trip document with 'recording' status
 */
export async function startTrip(input: TripStartInput): Promise<ActiveTrip> {
  assertFirestore();

  const tripsRef = collection(db!, COLLECTION_NAMES.TRIPS);
  const tripRef = doc(tripsRef);
  const tripId = tripRef.id;
  const now = Timestamp.now();

  // Create trip document
  const tripData: Partial<TripDocument> = {
    tripId,
    userId: input.userId,
    startedAt: now,
    endedAt: now, // Will be updated when trip ends
    durationSeconds: 0,
    startLocation: input.startLocation,
    endLocation: input.startLocation, // Will be updated when trip ends
    distanceMeters: 0,
    score: 0,
    scoreBreakdown: {
      speedScore: 100,
      brakingScore: 100,
      accelerationScore: 100,
      corneringScore: 100,
      phoneUsageScore: 100,
    },
    events: {
      hardBrakingCount: 0,
      hardAccelerationCount: 0,
      speedingSeconds: 0,
      sharpTurnCount: 0,
      phonePickupCount: 0,
    },
    anomalies: {
      hasGpsJumps: false,
      hasImpossibleSpeed: false,
      isDuplicate: false,
      flaggedForReview: false,
    },
    status: 'recording',
    processedAt: null,
    context: null,
    createdAt: now,
    createdBy: input.userId,
    pointsCount: 0,
  };

  await setDoc(tripRef, tripData);

  // Also create the tripPoints parent document
  const tripPointsRef = doc(db!, COLLECTION_NAMES.TRIP_POINTS, tripId);
  await setDoc(tripPointsRef, {
    tripId,
    userId: input.userId,
    points: [], // Points will be in batches subcollection
    samplingRateHz: 1,
    totalPoints: 0,
    compressedSize: 0,
    createdAt: now,
  });

  return {
    tripId,
    userId: input.userId,
    startedAt: now,
    startLocation: input.startLocation,
    pointsCount: 0,
    status: 'recording',
  };
}

/**
 * End a trip - updates trip with final data and changes status to 'processing'
 */
export async function endTrip(
  tripId: string,
  input: TripEndInput,
  pointsCount: number
): Promise<void> {
  assertFirestore();

  const tripRef = doc(db!, COLLECTION_NAMES.TRIPS, tripId);
  const tripPointsRef = doc(db!, COLLECTION_NAMES.TRIP_POINTS, tripId);
  const now = Timestamp.now();

  // Use batch write for atomicity
  const batch = writeBatch(db!);

  // Update trip document
  batch.update(tripRef, {
    endedAt: now,
    endLocation: input.endLocation,
    distanceMeters: Math.round(input.distanceMeters),
    score: input.score,
    scoreBreakdown: input.scoreBreakdown,
    events: input.events,
    status: 'processing', // Cloud Function will change to 'completed'
    pointsCount,
  });

  // Update trip points metadata
  batch.update(tripPointsRef, {
    totalPoints: pointsCount,
    compressedSize: pointsCount * 50, // Rough estimate
  });

  await batch.commit();
}

/**
 * Cancel a trip - deletes trip and points documents
 */
export async function cancelTrip(tripId: string): Promise<void> {
  assertFirestore();

  // Note: In production, you might want to mark as 'cancelled' instead of deleting
  const tripRef = doc(db!, COLLECTION_NAMES.TRIPS, tripId);
  
  await updateDoc(tripRef, {
    status: 'failed',
    processedAt: serverTimestamp(),
  });
}

/**
 * Get location from coordinates with optional reverse geocoding placeholder
 */
export function createTripLocation(
  latitude: number,
  longitude: number,
  address: string | null = null,
  placeType: 'home' | 'work' | 'other' | null = null
): TripLocation {
  return {
    lat: latitude,
    lng: longitude,
    address,
    placeType,
  };
}

/**
 * Calculate default score breakdown (placeholder for actual scoring)
 */
function computePhoneUsageScore(phonePickupCount: number, durationSeconds: number): number {
  if (durationSeconds <= 0 || phonePickupCount <= 0) return 100;
  const pickupsPerTenMin = (phonePickupCount / durationSeconds) * 600;
  return Math.max(20, Math.round(100 - pickupsPerTenMin * 16));
}

export function calculateDefaultScoreBreakdown(
  hardBrakingCount: number,
  hardAccelerationCount: number,
  speedingSeconds: number,
  sharpTurnCount: number,
  phonePickupCount: number = 0,
  durationSeconds: number = 0
): { score: number; breakdown: ScoreBreakdown } {
  // Simple scoring algorithm (production would be more sophisticated)
  const brakingScore = Math.max(0, 100 - hardBrakingCount * 5);
  const accelerationScore = Math.max(0, 100 - hardAccelerationCount * 5);
  const speedScore = Math.max(0, 100 - Math.floor(speedingSeconds / 10));
  const corneringScore = Math.max(0, 100 - sharpTurnCount * 3);
  const phoneUsageScore = computePhoneUsageScore(phonePickupCount, durationSeconds);

  const breakdown: ScoreBreakdown = {
    speedScore,
    brakingScore,
    accelerationScore,
    corneringScore,
    phoneUsageScore,
  };

  // Weighted average
  const score = Math.round(
    speedScore * 0.25 +
    brakingScore * 0.25 +
    accelerationScore * 0.2 +
    corneringScore * 0.2 +
    phoneUsageScore * 0.1
  );

  return { score, breakdown };
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { TripLocation, TripEvents, ScoreBreakdown };
