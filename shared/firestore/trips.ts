/**
 * The trips collection and the tripPoints subcollection.
 * Extracted verbatim from shared/firestore-types.ts, which re-exports this
 * module so every existing import keeps working.
 */

import type { Timestamp } from './timestamp';
import type {
  PlaceType,
  TripStatus,
} from './enums';
import type {
  ScoreBreakdown,
} from './users';

// ============================================================================
// TRIPS COLLECTION
// ============================================================================

/**
 * Location data with optional geocoding
 */
export interface TripLocation {
  lat: number;
  lng: number;
  address: string | null;         // Reverse geocoded
  placeType: PlaceType;
}

/**
 * Driving events captured during trip
 */
export interface TripEvents {
  hardBrakingCount: number;
  hardAccelerationCount: number;
  speedingSeconds: number;        // Total time over limit
  sharpTurnCount: number;
  phonePickupCount: number;
}

/**
 * Anomaly detection flags
 */
export interface TripAnomalyFlags {
  hasGpsJumps: boolean;
  hasImpossibleSpeed: boolean;
  isDuplicate: boolean;
  flaggedForReview: boolean;
}

/**
 * Trip context (enriched by Cloud Function)
 */
export interface TripContext {
  weatherCondition: string | null;
  isNightDriving: boolean;
  isRushHour: boolean;
}

/**
 * Trip document - immutable after completion
 * Collection: trips/{tripId}
 * Document ID: Auto-generated
 */
export interface TripDocument {
  tripId: string;
  userId: string;                   // Foreign key to users
  
  // Temporal
  startedAt: Timestamp;
  endedAt: Timestamp;
  durationSeconds: number;
  
  // Spatial
  startLocation: TripLocation;
  endLocation: TripLocation;
  distanceMeters: number;           // Integer for precision
  
  // Scoring (immutable after calculation)
  score: number;                    // 0-100 composite
  scoreBreakdown: ScoreBreakdown;
  
  // Event Counts
  events: TripEvents;
  
  // Anomaly Flags (set by Cloud Function)
  anomalies: TripAnomalyFlags;
  
  // Processing State
  status: TripStatus;
  processedAt: Timestamp | null;
  
  // Weather/Context (enriched by Cloud Function)
  context: TripContext | null;
  
  // Audit
  createdAt: Timestamp;
  createdBy: string;
  pointsCount: number;              // Reference count for tripPoints

  // Client-reported phone-pickup count, written on the recording->processing
  // transition (M2-DEC-1 Option A). NOT part of `events` above and not
  // locked by firestore.rules the same way - see functions/src/types.ts
  // TripDocument for the full rationale (that file is the server's copy of
  // this same shape). Optional: older trips and clients that predate this
  // never write it.
  clientReportedPhonePickupCount?: number;

  // How long the finalisation pipeline took, in milliseconds, written by the
  // server in the same update that sets `status` (ROADMAP TD-1). Optional: a
  // trip finalised before this landed, or one that failed, carries no
  // measurement rather than a zero. Only trustworthy on a trip the server
  // finalised - see functions/src/schema/documents.ts for why `completed` is
  // the boundary.
  pipelineLatencyMs?: number;
}

/**
 * Input for creating a new trip
 */
export interface TripCreateInput {
  userId: string;
  startedAt: Timestamp;
  endedAt: Timestamp;
  startLocation: TripLocation;
  endLocation: TripLocation;
  distanceMeters: number;
  durationSeconds: number;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  events: TripEvents;
  pointsCount: number;
  createdBy: string;
}

// ============================================================================
// TRIP POINTS COLLECTION
// ============================================================================

/**
 * Single GPS/sensor data point (compressed format)
 */
export interface TripPoint {
  t: number;                      // Timestamp offset in ms from trip start
  lat: number;
  lng: number;
  spd: number;                    // Speed in m/s * 100 (integer)
  hdg: number;                    // Heading 0-360
  acc: number;                    // Accuracy in meters
  
  // Optional sensor data
  ax?: number;                    // Accelerometer X
  ay?: number;                    // Accelerometer Y
  az?: number;                    // Accelerometer Z
  gx?: number;                    // Gyroscope X
  gy?: number;                    // Gyroscope Y
  gz?: number;                    // Gyroscope Z
}

/**
 * Trip points document (for trips < 30 min / ~1800 points)
 * Collection: tripPoints/{tripId}
 */
export interface TripPointsDocument {
  tripId: string;
  userId: string;
  
  points: TripPoint[];
  
  // Metadata
  samplingRateHz: number;
  totalPoints: number;
  compressedSize: number;           // For monitoring
  
  createdAt: Timestamp;
}

/**
 * Trip points batch (for longer trips)
 * Collection: tripPoints/{tripId}/batches/{batchIndex}
 */
export interface TripPointsBatch {
  tripId: string;
  batchIndex: number;               // 0, 1, 2...
  startOffset: number;              // First point's timestamp offset
  endOffset: number;                // Last point's timestamp offset
  points: TripPoint[];
}
