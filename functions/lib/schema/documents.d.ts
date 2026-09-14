/**
 * The core document interfaces: users, trips, policies, the pool and its shares.
 * Extracted verbatim from functions/src/types.ts, which re-exports this module
 * so every existing import keeps working.
 */
import type { Timestamp } from './firestoreScalars';
import type { CoverageType, LeaderboardPeriodType, PolicyStatus, PoolShareStatus, RiskTier, TripStatus } from './enums';
import type { TripSegmentationSummary } from './segmentation';
export interface ScoreBreakdown {
    speedScore: number;
    brakingScore: number;
    accelerationScore: number;
    corneringScore: number;
    phoneUsageScore: number;
}
export interface DrivingProfileData {
    currentScore: number;
    scoreBreakdown: ScoreBreakdown;
    totalTrips: number;
    totalMiles: number;
    totalDrivingMinutes: number;
    lastTripAt: Timestamp | null;
    streakDays: number;
    riskTier: RiskTier;
}
export interface TripLocation {
    lat: number;
    lng: number;
    address: string | null;
    placeType: 'home' | 'work' | 'other' | null;
}
export interface TripEvents {
    hardBrakingCount: number;
    hardAccelerationCount: number;
    speedingSeconds: number;
    sharpTurnCount: number;
    phonePickupCount: number;
}
export interface TripAnomalyFlags {
    hasGpsJumps: boolean;
    hasImpossibleSpeed: boolean;
    isDuplicate: boolean;
    flaggedForReview: boolean;
}
export interface TripContext {
    weatherCondition: string | null;
    isNightDriving: boolean;
    isRushHour: boolean;
}
export interface TripDocument {
    tripId: string;
    userId: string;
    startedAt: Timestamp;
    endedAt: Timestamp;
    durationSeconds: number;
    startLocation: TripLocation;
    endLocation: TripLocation;
    distanceMeters: number;
    score: number;
    scoreBreakdown: ScoreBreakdown;
    events: TripEvents;
    anomalies: TripAnomalyFlags;
    status: TripStatus;
    processedAt: Timestamp | null;
    context: TripContext | null;
    createdAt: Timestamp;
    createdBy: string;
    pointsCount: number;
    segmentation?: TripSegmentationSummary;
    /**
     * Phone-pickup count reported by the client on the recording->processing
     * transition (M2-DEC-1 Option A, docs/rebuild/m2-dec-1-phone-usage.md).
     * NOT locked by firestore.rules the way `events` is - it is deliberately a
     * separate field so a client can report it without touching the
     * server-computed events map. `events.phonePickupCount` (server-computed,
     * authoritative) is still the field a score is read from; this is only the
     * raw input finalizeTripFromPoints feeds into computeTripMetrics, which
     * sanity-checks and rate-caps it before it can move a score. Optional
     * because older/failed trips and any client that has not shipped this yet
     * never write it.
     */
    clientReportedPhonePickupCount?: number;
}
/**
 * Denormalized trip summary on the user doc (max 3, FIFO).
 *
 * UNIT CONVENTION (Wave 0, 0e): metres and seconds as integers, matching
 * TripDocument above and packages/contracts RecentTripSummarySchema. Miles and
 * minutes are a rendering concern only.
 */
export interface RecentTripSummary {
    tripId: string;
    startedAt: Timestamp;
    endedAt: Timestamp;
    distanceMeters: number;
    durationSeconds: number;
    score: number;
    routeSummary: string;
}
export interface PoolShareSummary {
    currentShareCents: number;
    contributionCents: number;
    sharePercentage: number;
    lastUpdatedAt: Timestamp;
}
export interface ActivePolicySummary {
    policyId: string;
    /** Null until the insurer issues one. Never invented. */
    policyNumber: string | null;
    status: PolicyStatus;
    premiumCents: number;
    coverageType: CoverageType;
    renewalDate: Timestamp;
}
export interface UserDocument {
    uid: string;
    email: string;
    displayName: string;
    photoURL: string | null;
    phoneNumber: string | null;
    age?: number;
    postcode?: string;
    vehicle?: {
        vin: string | null;
        make: string;
        model: string;
        year: number;
        color: string | null;
    } | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    drivingProfile: DrivingProfileData;
    activePolicy: ActivePolicySummary | null;
    poolShare: PoolShareSummary;
    recentTrips: RecentTripSummary[];
    fcmTokens: string[];
    settings: {
        notificationsEnabled: boolean;
        autoTripDetection: boolean;
        unitSystem: 'imperial' | 'metric';
    };
    createdBy: string;
    updatedBy: string;
}
export interface PolicyDocument {
    policyId: string;
    userId: string;
    /** Null until the insurer issues one. Never invented. */
    policyNumber: string | null;
    status: PolicyStatus;
    coverageType: CoverageType;
    /**
     * What the policy actually covers, as stated by whoever underwrote it.
     * Null when nobody has. Driiva has no underwriter, so pre-launch this is
     * null rather than a plausible set of limits: it used to be written as
     * GBP 100,000 liability with roadside assistance on every signup, and
     * nothing read it, so the numbers existed only to look real.
     */
    coverageDetails: {
        liabilityLimitCents: number;
        collisionDeductibleCents: number;
        comprehensiveDeductibleCents: number;
        includesRoadside: boolean;
        includesRental: boolean;
    } | null;
    basePremiumCents: number;
    currentPremiumCents: number;
    discountPercentage: number;
    effectiveDate: Timestamp;
    expirationDate: Timestamp;
    renewalDate: Timestamp | null;
    vehicle: {
        vin: string | null;
        make: string;
        model: string;
        year: number;
        color: string | null;
    } | null;
    billingCycle: 'monthly' | 'quarterly' | 'annual';
    stripeSubscriptionId: string | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    createdBy: string;
    updatedBy: string;
}
export interface PoolShareDocument {
    shareId: string;
    poolPeriod: string;
    userId: string;
    contributionCents: number;
    contributionCount: number;
    sharePercentage: number;
    weightedScore: number;
    baseRefundCents: number;
    projectedRefundCents: number;
    status: PoolShareStatus;
    eligibleForRefund: boolean;
    tripsIncluded: number;
    milesIncluded: number;
    averageScore: number;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    finalizedAt: Timestamp | null;
}
export interface CommunityPoolDocument {
    poolId: string;
    totalPoolCents: number;
    totalContributionsCents: number;
    totalPayoutsCents: number;
    reserveCents: number;
    activeParticipants: number;
    totalParticipantsEver: number;
    averagePoolScore: number;
    safetyFactor: number;
    claimsThisPeriod: number;
    periodStart: Timestamp;
    periodEnd: Timestamp;
    periodType: 'monthly' | 'quarterly';
    projectedRefundRate: number;
    lastCalculatedAt: Timestamp;
    version: number;
}
export interface LeaderboardRanking {
    rank: number;
    userId: string;
    displayName: string;
    photoURL: string | null;
    score: number;
    totalMiles: number;
    totalTrips: number;
    change: number;
}
export interface LeaderboardDocument {
    leaderboardId: string;
    period: string;
    periodType: LeaderboardPeriodType;
    rankings: LeaderboardRanking[];
    totalParticipants: number;
    averageScore: number;
    medianScore: number;
    calculatedAt: Timestamp;
    nextCalculationAt: Timestamp;
}
//# sourceMappingURL=documents.d.ts.map