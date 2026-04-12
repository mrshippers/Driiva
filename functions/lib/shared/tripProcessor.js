"use strict";
/**
 * TRIP PROCESSOR — Single source of truth for trip duration and distance
 * ======================================================================
 * All trip-related code (Cloud Functions, server telematics, tests) must
 * use these functions so duration and distance are consistent everywhere.
 *
 * - Distance: Haversine over sequential GPS points, meters.
 * - Duration: First-to-last timestamp difference, seconds.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.haversineMeters = haversineMeters;
exports.tripDistanceMeters = tripDistanceMeters;
exports.tripDurationSeconds = tripDurationSeconds;
exports.tripDistanceAndDuration = tripDistanceAndDuration;
/**
 * Haversine distance between two WGS84 points, in meters.
 */
function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
/**
 * Total trip distance in meters: sum of Haversine distances between
 * consecutive points. Points must be in time order (caller's responsibility).
 */
function tripDistanceMeters(points) {
    if (points.length < 2)
        return 0;
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        total += haversineMeters(a.lat, a.lng, b.lat, b.lng);
    }
    return total;
}
/**
 * Trip duration in seconds: last timestamp minus first timestamp.
 * Returns at least 1 second when there are at least 2 points to avoid div-by-zero.
 */
function tripDurationSeconds(points) {
    if (points.length < 2)
        return 0;
    const first = points[0].timestamp;
    const last = points[points.length - 1].timestamp;
    const durationMs = last - first;
    return Math.max(1, Math.round(durationMs / 1000));
}
/**
 * Combined distance (m) and duration (s) from a single array of points
 * that have lat, lng, and timestamp.
 */
function tripDistanceAndDuration(points) {
    if (points.length < 2) {
        return { distanceMeters: 0, durationSeconds: 0 };
    }
    const distanceMeters = Math.round(tripDistanceMeters(points));
    const durationSeconds = tripDurationSeconds(points);
    return { distanceMeters, durationSeconds };
}
//# sourceMappingURL=tripProcessor.js.map