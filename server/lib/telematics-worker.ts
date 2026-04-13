/**
 * Worker thread for CPU-intensive telematics processing.
 * Runs TelematicsProcessor.processTrip off the main thread to avoid
 * blocking the Express event loop during GPS anomaly detection and scoring.
 */

import { parentPort } from 'node:worker_threads';
import { TelematicsProcessor } from './telematics.js';

const processor = new TelematicsProcessor();

parentPort?.on('message', async (msg) => {
  try {
    const { id, telematicsData, userId, existingTrips, phonePickupCount } = msg;
    const result = await processor.processTrip(telematicsData, userId, existingTrips, phonePickupCount);
    parentPort?.postMessage({ id, result });
  } catch (error: any) {
    parentPort?.postMessage({ id: msg.id, error: error.message });
  }
});
