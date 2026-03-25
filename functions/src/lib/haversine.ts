/**
 * Re-export haversineMeters from the shared tripProcessor module.
 * This avoids duplicating the Haversine formula in Cloud Functions.
 *
 * The canonical implementation lives in shared/tripProcessor.ts.
 * This wrapper exists because functions/tsconfig.json does not include shared/.
 */

// Earth's radius in meters — must match shared/tripProcessor.ts
const R = 6371e3;

/**
 * Haversine distance between two WGS84 points, in meters.
 * Identical to shared/tripProcessor.ts::haversineMeters().
 * Kept as a single-file wrapper so functions/ can import without tsconfig changes.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
