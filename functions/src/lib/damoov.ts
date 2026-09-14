/**
 * DAMOOV API CLIENT
 * =================
 * Server-side client for Damoov DataHub / User APIs.
 * Damoov is the telematics data collection layer - it feeds Driiva's XGBoost
 * risk model. Credentials come from Firebase Secret Manager, never hardcoded.
 *
 * API docs: https://docs.damoov.com/
 */

import * as functions from 'firebase-functions/v1';

const DAMOOV_USER_API = 'https://user.telematicssdk.com/v1';
const DAMOOV_DATAHUB_API = 'https://api.telematicssdk.com/indicators/v2';

function getCredentials(): { instanceId: string; instanceKey: string } {
  const instanceId = process.env.DAMOOV_INSTANCE_ID;
  const instanceKey = process.env.DAMOOV_INSTANCE_KEY;
  if (!instanceId || !instanceKey) {
    throw new Error('Damoov credentials not available - check Secret Manager');
  }
  return { instanceId, instanceKey };
}

export interface DamoovUserResponse {
  DeviceToken: string;
  Result: {
    IsSuccess: boolean;
    ErrorCode?: number;
    ErrorMessage?: string;
  };
}

export interface DamoovTripData {
  Id: string;
  StartDate: string;
  EndDate: string;
  DistanceKm: number;
  DurationMin: number;
  Rating100: number;
  RatingBraking100: number;
  RatingAcceleration100: number;
  RatingSpeeding100: number;
  RatingPhoneUsage100: number;
  RatingCornering100: number;
  HardBrakingCount: number;
  HardAccelerationCount: number;
  CorneringCount: number;
  Points?: Array<{ Latitude: number; Longitude: number }>;
}

export interface DamoovTripsResponse {
  Result: { IsSuccess: boolean; ErrorCode?: number; ErrorMessage?: string };
  Trips?: DamoovTripData[];
}

/**
 * Register a new user with Damoov. Returns deviceToken on success, null on failure.
 * Called silently during Firebase Auth registration - must never throw.
 */
export async function createDamoovUser(
  uid: string,
  email: string,
): Promise<string | null> {
  try {
    const { instanceId, instanceKey } = getCredentials();

    const res = await fetch(`${DAMOOV_USER_API}/registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'InstanceId': instanceId,
        'InstanceKey': instanceKey,
      },
      body: JSON.stringify({
        Email: email,
        ClientId: uid,
        FirstName: '',
        LastName: '',
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      functions.logger.warn(`Damoov user creation HTTP ${res.status} for ${uid}`);
      return null;
    }

    const data = (await res.json()) as DamoovUserResponse;
    if (!data.Result?.IsSuccess) {
      functions.logger.warn('Damoov user creation failed', {
        uid,
        error: data.Result?.ErrorMessage,
      });
      return null;
    }

    functions.logger.info(`Damoov user created for ${uid}`, {
      deviceToken: data.DeviceToken?.substring(0, 8) + '...',
    });

    return data.DeviceToken;
  } catch (error) {
    functions.logger.error('Damoov user creation exception', { uid, error });
    return null;
  }
}

/**
 * Fetch trips from Damoov DataHub for a given device token and date range.
 * Returns array of trip data or empty array on failure.
 */
export async function fetchDamoovTrips(
  deviceToken: string,
  startDate: string,
  endDate: string,
): Promise<DamoovTripData[]> {
  try {
    const { instanceId, instanceKey } = getCredentials();

    const res = await fetch(
      `${DAMOOV_DATAHUB_API}/Scores/trips?` +
        `StartDate=${encodeURIComponent(startDate)}&` +
        `EndDate=${encodeURIComponent(endDate)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'DeviceToken': deviceToken,
          'InstanceId': instanceId,
          'InstanceKey': instanceKey,
        },
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!res.ok) {
      functions.logger.warn(`Damoov trips fetch HTTP ${res.status}`, {
        deviceToken: deviceToken.substring(0, 8) + '...',
      });
      return [];
    }

    const data = (await res.json()) as DamoovTripsResponse;
    if (!data.Result?.IsSuccess) {
      functions.logger.warn('Damoov trips fetch failed', {
        error: data.Result?.ErrorMessage,
      });
      return [];
    }

    return data.Trips ?? [];
  } catch (error) {
    functions.logger.error('Damoov trips fetch exception', { error });
    return [];
  }
}

/**
 * Fetch daily driving statistics from Damoov for sparkline/trend data.
 * Returns array of daily score objects.
 */
export async function fetchDamoovDailyStats(
  deviceToken: string,
  startDate: string,
  endDate: string,
): Promise<Array<{ Date: string; Score: number }>> {
  try {
    const { instanceId, instanceKey } = getCredentials();

    const res = await fetch(
      `${DAMOOV_DATAHUB_API}/Scores/daily?` +
        `StartDate=${encodeURIComponent(startDate)}&` +
        `EndDate=${encodeURIComponent(endDate)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'DeviceToken': deviceToken,
          'InstanceId': instanceId,
          'InstanceKey': instanceKey,
        },
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!res.ok) return [];

    const data = await res.json() as {
      Result: { IsSuccess: boolean };
      DailyScores?: Array<{ Date: string; Score: number }>;
    };
    if (!data.Result?.IsSuccess) return [];

    return data.DailyScores ?? [];
  } catch (error) {
    functions.logger.error('Damoov daily stats fetch exception', { error });
    return [];
  }
}
