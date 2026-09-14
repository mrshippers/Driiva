/**
 * Rolling the finished trip into the driver's profile and their pool share,
 * transactionally. Extracted verbatim from functions/src/triggers/trips.ts.
 */
import * as functions from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import { scoreWeight } from '@driiva/contracts';
import {
  COLLECTION_NAMES,
  TripDocument,
  UserDocument,
  PoolShareDocument,
  RecentTripSummary,
  ScoreBreakdown,
} from '../types';
import {
  buildRouteSummary,
  weightedAverage,
  calculateRiskTier,
  getCurrentPoolPeriod,
  getShareId,
} from '../utils/helpers';
import { db } from '../lib/db';


/**
 * Update driver profile and pool share after trip completion
 * This is the main business logic for trip processing
 */
// Exported for the M2 emulator integration test - see finalizeTripFromPoints above.
export async function updateDriverProfileAndPoolShare(
  trip: TripDocument,
  tripId: string
): Promise<void> {
  const period = getCurrentPoolPeriod();
  
  await db.runTransaction(async (transaction) => {
    // References
    const userRef = db.collection(COLLECTION_NAMES.USERS).doc(trip.userId);
    const poolShareRef = db.collection(COLLECTION_NAMES.POOL_SHARES).doc(getShareId(trip.userId, period));
    const tripRef = db.collection(COLLECTION_NAMES.TRIPS).doc(tripId);

    // Read current state
    const [userDoc, poolShareDoc, tripDoc] = await Promise.all([
      transaction.get(userRef),
      transaction.get(poolShareRef),
      transaction.get(tripRef),
    ]);

    // Idempotency: score each trip into the profile exactly once. Write B's
    // status flip can re-trigger this via onTripStatusChange CASE 2, and a
    // crashed invocation can be retried by the Cloud Functions runtime. The
    // per-trip marker is checked and set in this SAME transaction as the
    // profile update, so the check-and-set is atomic and race-safe.
    if (tripDoc.exists && tripDoc.data()?.profileApplied === true) {
      functions.logger.info(`Trip ${tripId} already applied to profile, skipping duplicate`);
      return;
    }

    if (!userDoc.exists) {
      functions.logger.error(`User ${trip.userId} not found for trip ${tripId}`);
      throw new Error(`User ${trip.userId} not found`);
    }
    
    const user = userDoc.data() as UserDocument;
    const poolShare = poolShareDoc.exists ? poolShareDoc.data() as PoolShareDocument : null;
    
    // Calculate new profile values
    const distanceMiles = trip.distanceMeters / 1609.34;
    const durationMinutes = trip.durationSeconds / 60;
    
    const newTotalTrips = user.drivingProfile.totalTrips + 1;
    const newTotalMiles = user.drivingProfile.totalMiles + distanceMiles;
    const newTotalMinutes = user.drivingProfile.totalDrivingMinutes + durationMinutes;
    
    // Recalculate weighted average score.
    // The weight is scoreWeight(), not totalTrips: the starting score carries
    // the weight of a notional trip, so a driver's first real trip is averaged
    // WITH their starting position rather than replacing it. Using totalTrips
    // here would silently discard the starting score on trip one, which is the
    // behaviour that made a new profile only ever able to move downwards.
    const oldWeight = scoreWeight(user.drivingProfile.totalTrips);
    const newScore =
      (user.drivingProfile.currentScore * oldWeight + trip.score) / (oldWeight + 1);
    
    // Update score breakdown (weighted average)
    const newScoreBreakdown: ScoreBreakdown = {
      speedScore: weightedAverage(
        user.drivingProfile.scoreBreakdown.speedScore, 
        trip.scoreBreakdown.speedScore, 
        oldWeight
      ),
      brakingScore: weightedAverage(
        user.drivingProfile.scoreBreakdown.brakingScore, 
        trip.scoreBreakdown.brakingScore, 
        oldWeight
      ),
      accelerationScore: weightedAverage(
        user.drivingProfile.scoreBreakdown.accelerationScore, 
        trip.scoreBreakdown.accelerationScore, 
        oldWeight
      ),
      corneringScore: weightedAverage(
        user.drivingProfile.scoreBreakdown.corneringScore, 
        trip.scoreBreakdown.corneringScore, 
        oldWeight
      ),
      phoneUsageScore: weightedAverage(
        user.drivingProfile.scoreBreakdown.phoneUsageScore, 
        trip.scoreBreakdown.phoneUsageScore, 
        oldWeight
      ),
    };
    
    // Determine risk tier
    const riskTier = calculateRiskTier(newScore);
    
    // Update recent trips (FIFO, max 3)
    const tripSummary: RecentTripSummary = {
      tripId,
      startedAt: trip.startedAt,
      endedAt: trip.endedAt,
      // Metres and seconds, straight off the trip document. See the unit
      // convention on RecentTripSummary in ../types.ts.
      distanceMeters: Math.round(trip.distanceMeters),
      durationSeconds: Math.round(trip.durationSeconds),
      score: trip.score,
      routeSummary: buildRouteSummary(trip.startLocation, trip.endLocation),
    };
    
    const newRecentTrips = [tripSummary, ...user.recentTrips].slice(0, 3);
    
    // Calculate streak days
    let streakDays = user.drivingProfile.streakDays;
    if (user.drivingProfile.lastTripAt) {
      const lastTripDate = user.drivingProfile.lastTripAt.toDate();
      const currentTripDate = trip.endedAt.toDate();
      const daysDiff = Math.floor(
        (currentTripDate.getTime() - lastTripDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (daysDiff <= 1 && trip.score >= 70) {
        streakDays += 1;
      } else if (daysDiff > 1) {
        streakDays = trip.score >= 70 ? 1 : 0;
      }
    } else {
      streakDays = trip.score >= 70 ? 1 : 0;
    }
    
    // Write: Update user profile
    transaction.update(userRef, {
      'drivingProfile.currentScore': Math.round(newScore * 100) / 100,
      'drivingProfile.scoreBreakdown': newScoreBreakdown,
      'drivingProfile.totalTrips': newTotalTrips,
      'drivingProfile.totalMiles': Math.round(newTotalMiles * 100) / 100,
      'drivingProfile.totalDrivingMinutes': Math.round(newTotalMinutes),
      'drivingProfile.lastTripAt': trip.endedAt,
      'drivingProfile.riskTier': riskTier,
      'drivingProfile.streakDays': streakDays,
      recentTrips: newRecentTrips,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'cloud-function',
    });
    
    // Write: Update pool share (if exists)
    if (poolShare) {
      const newShareTrips = poolShare.tripsIncluded + 1;
      const newShareMiles = poolShare.milesIncluded + distanceMiles;
      const newShareAvgScore = (poolShare.averageScore * poolShare.tripsIncluded + trip.score) / newShareTrips;
      
      transaction.update(poolShareRef, {
        tripsIncluded: newShareTrips,
        milesIncluded: Math.round(newShareMiles * 100) / 100,
        averageScore: Math.round(newShareAvgScore * 100) / 100,
        weightedScore: Math.round(newShareAvgScore * poolShare.contributionCents / 100),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Mark this trip as applied so any re-delivery of the same completion is a
    // no-op (see the idempotency check at the top of this transaction). Use a
    // merge set rather than update so a caller that reaches here before the trip
    // doc exists (e.g. a future manual-review path) does not throw.
    transaction.set(tripRef, { profileApplied: true }, { merge: true });

    functions.logger.info(`Updated profile for user ${trip.userId}`, {
      newScore: Math.round(newScore * 100) / 100,
      totalTrips: newTotalTrips,
      totalMiles: Math.round(newTotalMiles * 100) / 100,
      riskTier,
      streakDays,
    });
  });
}
