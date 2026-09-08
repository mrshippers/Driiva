/**
 * Counts phone pickups for the length of one recorded trip, from the two
 * signals a browser offers, and keeps the page's live event counters in step.
 * Extracted from client/src/pages/trip-recording.tsx to keep that file under
 * the 500-line ceiling. ROADMAP TD-2.
 *
 * The accelerometer heuristic in @/lib/phonePickup sees the phone being
 * handled; `visibilitychange` adds the app switches it cannot see, because
 * browsers stop delivering devicemotion to a page that is no longer visible.
 * Both go through the one counter, which debounces across them, so lifting the
 * phone and then switching app is one pickup rather than two.
 *
 * Counting is held to the 'recording' state, which is the behaviour the
 * visibility proxy had before the accelerometer joined it: a paused trip
 * accumulates no duration, so a pickup counted then would be rated against
 * time that was never measured.
 */
import { useCallback, useEffect, useRef } from 'react';

import { WebPhonePickupDetector } from '@/lib/phonePickup';
import type { RecordingState } from '@/components/tripRecording/types';
import type { TripEvents } from '@/lib/tripService';

export interface TripPhonePickups {
  /** Begin counting for a new trip. Resets the count. */
  start: () => void;
  /**
   * Stop counting and return the trip's count. Read this rather than the page's
   * `tripEvents` when submitting: React batches state updates, so a pickup
   * counted in the same tick as the stop may not have reached state yet.
   */
  stop: () => number;
}

export function useTripPhonePickups(
  recordingState: RecordingState,
  setTripEvents: (update: (prev: TripEvents) => TripEvents) => void,
): TripPhonePickups {
  const detectorRef = useRef<WebPhonePickupDetector | null>(null);

  // Read through a ref so the live state is visible to a listener that was
  // attached once, at the start of the trip, rather than re-attached per state.
  const recordingStateRef = useRef(recordingState);
  recordingStateRef.current = recordingState;

  const start = useCallback(() => {
    const detector = new WebPhonePickupDetector({
      shouldCount: () => recordingStateRef.current === 'recording',
      onCount: (phonePickupCount) =>
        setTripEvents(prev => ({ ...prev, phonePickupCount })),
    });
    detector.start();
    detectorRef.current = detector;
  }, [setTripEvents]);

  const stop = useCallback(() => {
    const count = detectorRef.current?.stop() ?? 0;
    detectorRef.current = null;
    return count;
  }, []);

  // The app switch the motion stream cannot see.
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden') detectorRef.current?.notePickup();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  // Release the motion listener if the page unmounts with a trip still open.
  useEffect(() => () => {
    detectorRef.current?.stop();
    detectorRef.current = null;
  }, []);

  return { start, stop };
}
