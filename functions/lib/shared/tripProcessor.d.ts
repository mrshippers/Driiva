/**
 * TRIP PROCESSOR — Single source of truth for trip duration and distance
 * ======================================================================
 * All trip-related code (Cloud Functions, server telematics, tests) must
 * use these functions so duration and distance are consistent everywhere.
 *
 * - Distance: Haversine over sequential GPS points, meters.
 * - Duration: First-to-last timestamp difference, seconds.
 */
export interface PointWithLatLng {
    lat: number;
    lng: number;
}
export interface PointWithTimestamp {
    timestamp: number;
}
/**
 * Haversine distance between two WGS84 points, in meters.
 */
export declare function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number;
/**
 * Total trip distance in meters: sum of Haversine distances between
 * consecutive points. Points must be in time order (caller's responsibility).
 */
export declare function tripDistanceMeters(points: Array<PointWithLatLng>): number;
/**
 * Trip duration in seconds: last timestamp minus first timestamp.
 * Returns at least 1 second when there are at least 2 points to avoid div-by-zero.
 */
export declare function tripDurationSeconds(points: Array<PointWithTimestamp>): number;
/**
 * Combined distance (m) and duration (s) from a single array of points
 * that have lat, lng, and timestamp.
 */
export declare function tripDistanceAndDuration<T extends PointWithLatLng & PointWithTimestamp>(points: T[]): {
    distanceMeters: number;
    durationSeconds: number;
};
//# sourceMappingURL=tripProcessor.d.ts.map