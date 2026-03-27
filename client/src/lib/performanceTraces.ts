/**
 * FIREBASE PERFORMANCE MONITORING — CLIENT TRACES
 * =================================================
 * Utility for wrapping async operations with Firebase Performance custom traces.
 *
 * Usage:
 *   import { withTrace } from '../lib/performanceTraces';
 *   const result = await withTrace('trip_load', () => fetchTrip(tripId));
 */

import { trace as fbTrace } from 'firebase/performance';
import { perf } from './firebase';

/**
 * Wrap an async operation with a Firebase Performance custom trace.
 * Safe to call even if Performance is not initialized — falls back to plain execution.
 */
export async function withTrace<T>(
  traceName: string,
  fn: () => Promise<T>,
  attributes?: Record<string, string>,
): Promise<T> {
  if (!perf) return fn();

  const t = fbTrace(perf, traceName);
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      t.putAttribute(key, value);
    }
  }

  t.start();
  try {
    const result = await fn();
    t.stop();
    return result;
  } catch (err) {
    t.stop();
    throw err;
  }
}
