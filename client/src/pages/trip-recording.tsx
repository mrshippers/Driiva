/**
 * TRIP RECORDING PAGE
 * ===================
 * Full-featured trip recording with GPS tracking and Firestore streaming.
 * 
 * Features:
 *   - Real-time GPS tracking with useTripLocationTracker hook
 *   - Streams points to Firestore during trip
 *   - Start/Pause/Resume/Stop controls
 *   - Live stats (distance, duration, points)
 *   - Permission handling with user-friendly errors
 *   - Integration with telematics for sensor data
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useTripLocationTracker, TrackedPoint } from '@/hooks/useTripLocationTracker';
import { useTelematics } from '@/hooks/useTelematics';
import { useToast } from '@/hooks/use-toast';
import {
  TripPointStreamer,
  startTrip,
  endTrip,
  cancelTrip,
  createTripLocation,
  ActiveTrip,
  TripEvents,
} from '@/lib/tripService';
import { isFirebaseConfigured } from '@/lib/firebase';
import { useOnlineStatusContext } from '@/contexts/OnlineStatusContext';
import type { RecordingState, TripStats } from '@/components/tripRecording/types';
import { formatDistance, formatDuration } from '@/components/tripRecording/formatters';
import { StatusCard } from '@/components/tripRecording/StatusCard';
import { LiveStats } from '@/components/tripRecording/LiveStats';
import { SensorStatus } from '@/components/tripRecording/SensorStatus';
import { DrivingEvents } from '@/components/tripRecording/DrivingEvents';
import { ControlButtons } from '@/components/tripRecording/ControlButtons';
import { SensorErrorPanel } from '@/components/tripRecording/SensorErrorPanel';
import { DemoModeNotice } from '@/components/tripRecording/DemoModeNotice';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useTripPhonePickups } from '@/hooks/useTripPhonePickups';
import { useTripDurationTicker } from '@/hooks/useTripDurationTicker';
// ============================================================================
// COMPONENT
// ============================================================================

export default function TripRecording() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { isOnline } = useOnlineStatusContext();

  // State
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [tripStats, setTripStats] = useState<TripStats>({
    distanceMeters: 0,
    durationMs: 0,
    pointsCount: 0,
    avgSpeed: 0,
  });
  const [tripEvents, setTripEvents] = useState<TripEvents>({
    hardBrakingCount: 0,
    hardAccelerationCount: 0,
    speedingSeconds: 0,
    sharpTurnCount: 0,
    phonePickupCount: 0,
  });

  // Refs
  const streamerRef = useRef<TripPointStreamer | null>(null);
  const tripStartTimeRef = useRef<number>(0);

  // Telematics hook (for sensor data)
  const telematics = useTelematics();

  // GPS tracker hook with callbacks
  const tracker = useTripLocationTracker(
    {
      enableHighAccuracy: true,
      minInterval: 1000,
      minDistance: 5,
    },
    {
      onPoint: useCallback((point: TrackedPoint) => {
        // Stream point to Firestore
        if (streamerRef.current) {
          streamerRef.current.addPoint(point);
        }

        // Update local stats
        setTripStats(prev => ({
          ...prev,
          pointsCount: prev.pointsCount + 1,
          avgSpeed: point.speed ?? prev.avgSpeed,
        }));

        // Detect driving events (simplified - production would be more sophisticated).
        // Phone pickups are not derivable from a GPS fix. They come from the
        // accelerometer and the tab switch, both counted by useTripPhonePickups.
        if (point.speed !== null) {
          const speedMph = point.speed * 2.237;
          if (speedMph > 75) {
            setTripEvents(prev => ({
              ...prev,
              speedingSeconds: prev.speedingSeconds + 1,
            }));
          }
        }
      }, []),
      onError: useCallback((error: GeolocationPositionError) => {
        console.error('[TripRecording] GPS error:', error);
        if (error.code === 1) {
          toast({
            title: 'Location Access Denied',
            description: 'Please Enable location access to record trips.',
            variant: 'destructive',
          });
        }
      }, [toast]),
      onStart: useCallback(() => {}, []),
      onStop: useCallback((_points: TrackedPoint[]) => {}, []),
    }
  );

  // Update duration every second while recording
  useTripDurationTicker(recordingState, tripStartTimeRef, tracker.totalDistance, setTripStats);

  // Wake Lock: keep the screen on while recording so GPS doesn't stop
  const { acquireWakeLock, releaseWakeLock } = useWakeLock();

  // Re-acquire the wake lock when the tab returns, since the browser released
  // it on hide. Pickups hang off this event too, in useTripPhonePickups.
  useEffect(() => {
    const handler = async () => {
      if (recordingState === 'recording' && document.visibilityState !== 'hidden') {
        await acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [recordingState, acquireWakeLock]);

  // Phone pickups: accelerometer plus tab switches, counted while recording.
  const phonePickups = useTripPhonePickups(recordingState, setTripEvents);

  // Get user ID (handle demo mode)
  const getUserId = useCallback((): string => {
    if (user?.id) return user.id;
    // Demo mode fallback
    const demoUser = sessionStorage.getItem('driiva-demo-user');
    if (demoUser) {
      try {
        return JSON.parse(demoUser).id || 'demo-user';
      } catch {
        return 'demo-user';
      }
    }
    return 'demo-user';
  }, [user]);

  // Start trip
  const handleStartTrip = async () => {
    setRecordingState('starting');

    try {
      // Timeout: if setup takes >25s, show error (e.g. location permission blocked)
      const timeoutMs = 25000;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Setup timed out. Please allow location access and try again.')), timeoutMs)
      );

      const runStart = async () => {
        // Request permissions first
        const permissionGranted = await tracker.requestPermission();
        if (!permissionGranted) {
          setRecordingState('idle');
          return;
        }

        // Request telematics permissions
        await telematics.requestPermissions();

        // Get initial position for start location
        const initialPosition = tracker.currentPosition;
        if (!initialPosition) {
          // Wait a moment for first position
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const startPosition = tracker.currentPosition;
        const userId = getUserId();
        const now = Date.now();
        tripStartTimeRef.current = now;

        // Demo mode: skip Firestore (no auth.uid = permission denied). Record locally only.
        const isDemoMode = typeof window !== 'undefined' && sessionStorage.getItem('driiva-demo-mode') === 'true';

        // Create trip in Firestore (skip if not configured or demo mode)
        let trip: ActiveTrip | null = null;
        if (isFirebaseConfigured && !isDemoMode) {
          try {
            trip = await startTrip({
              userId,
              startLocation: createTripLocation(
                startPosition?.latitude ?? 0,
                startPosition?.longitude ?? 0
              ),
            });
            setActiveTrip(trip);

            // Initialize point streamer
            streamerRef.current = new TripPointStreamer(
              trip.tripId,
              userId,
              now,
              (error) => {
                console.error('[TripRecording] Streamer error:', error);
                toast({
                  title: 'Sync Error',
                  description: 'Failed to save some GPS points. Trip will continue.',
                  variant: 'destructive',
                });
              }
            );
            streamerRef.current.start();
          } catch (error) {
            console.error('[TripRecording] Failed to create trip:', error);
            toast({
              title: 'Trip Start Error',
              description: 'Failed to save trip to cloud. Recording locally.',
              variant: 'destructive',
            });
          }
        }

        // Start GPS tracking
        await tracker.start();

        // Start telematics collection
        await telematics.startCollection();

        // Reset stats
        setTripStats({
          distanceMeters: 0,
          durationMs: 0,
          pointsCount: 0,
          avgSpeed: 0,
        });
        setTripEvents({
          hardBrakingCount: 0,
          hardAccelerationCount: 0,
          speedingSeconds: 0,
          sharpTurnCount: 0,
          phonePickupCount: 0,
        });

        // After the event reset above, so its first count is not clobbered by
        // it. With no motion sensor the visibility proxy carries it alone.
        phonePickups.start();

        setRecordingState('recording');
        await acquireWakeLock();

        toast({
          title: 'Trip Started',
          description: isDemoMode ? 'Demo mode: recording locally (not saved to cloud).' : 'Recording your drive. Stay safe!',
        });
      };

      await Promise.race([runStart(), timeoutPromise]);
    } catch (error) {
      console.error('[TripRecording] Start error:', error);
      setRecordingState('idle');
      toast({
        title: 'Failed to Start',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  // Pause trip
  const handlePauseTrip = () => {
    if (recordingState === 'recording') {
      tracker.pause();
      setRecordingState('paused');
      toast({
        title: 'Trip Paused',
        description: 'Tap resume to continue recording.',
      });
    } else if (recordingState === 'paused') {
      tracker.resume();
      setRecordingState('recording');
      toast({
        title: 'Trip Resumed',
        description: 'Continuing to record your drive.',
      });
    }
  };

  // Stop trip
  const handleStopTrip = async () => {
    setRecordingState('stopping');

    try {
      // Stop tracking
      const points = tracker.stop();

      // Stop telematics
      const telematicsData = await telematics.stopCollection();

      // The count the detector returns is authoritative, not the one in
      // tripEvents: React batches state updates, so a pickup counted in the
      // same tick as the stop may not have reached state yet.
      const phonePickupCount = phonePickups.stop();

      // Stop point streamer and get final count
      let finalPointsCount = points.length;
      if (streamerRef.current) {
        finalPointsCount = await streamerRef.current.stop();
        streamerRef.current = null;
      }

      // Calculate final stats
      const finalPosition = tracker.currentPosition;

      // End trip in Firestore
      if (activeTrip && isFirebaseConfigured) {
        try {
          await endTrip(
            activeTrip.tripId,
            {
              endLocation: createTripLocation(
                finalPosition?.latitude ?? 0,
                finalPosition?.longitude ?? 0
              ),
              events: { ...tripEvents, phonePickupCount },
              distanceMeters: tripStats.distanceMeters,
            },
            finalPointsCount
          );
        } catch (error) {
          console.error('[TripRecording] Failed to end trip:', error);
        }
      }

      // Show result. The score is computed server-side (Cloud Function) after
      // processing GPS points, so it is not known here; show only what is
      // client-side true and let the trip detail view surface the real score.
      toast({
        title: 'Trip Completed',
        description: `Distance: ${formatDistance(tripStats.distanceMeters)} • ${formatDuration(tripStats.durationMs)} • ${finalPointsCount} points`,
      });

      // Reset state
      releaseWakeLock();
      setRecordingState('idle');
      setActiveTrip(null);
      tripStartTimeRef.current = 0;

      // Navigate back to dashboard
      setTimeout(() => setLocation('/'), 1500);
    } catch (error) {
      console.error('[TripRecording] Stop error:', error);
      releaseWakeLock();
      setRecordingState('idle');
      toast({
        title: 'Error Ending Trip',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  // Cancel trip (discard without saving)
  const handleCancelTrip = async () => {
    if (recordingState === 'idle') {
      setLocation('/');
      return;
    }

    // Stop tracking without saving
    tracker.stop();
    telematics.stopCollection();

    if (streamerRef.current) {
      await streamerRef.current.stop();
      streamerRef.current = null;
    }

    phonePickups.stop();

    // Mark trip as cancelled in Firestore
    if (activeTrip && isFirebaseConfigured) {
      try {
        await cancelTrip(activeTrip.tripId);
      } catch (error) {
        console.error('[TripRecording] Failed to cancel trip:', error);
      }
    }

    releaseWakeLock();
    setRecordingState('idle');
    setActiveTrip(null);
    tripStartTimeRef.current = 0;

    toast({
      title: 'Trip Cancelled',
      description: 'Your trip data was discarded.',
    });

    setLocation('/');
  };

  // Check if can start
  const canStart =
    recordingState === 'idle' &&
    !tracker.isPermissionDenied &&
    isOnline;
  const isRecording = recordingState === 'recording' || recordingState === 'paused';

  /* One tone per state, taken from tokens. Red is capture, amber is held, the
     accent is work in progress, and idle stays muted because nothing has
     happened yet and nothing has been earned. */
  const statusTone =
    recordingState === 'recording'
      ? 'var(--err)'
      : recordingState === 'paused'
        ? 'var(--warn)'
        : recordingState === 'starting' || recordingState === 'stopping'
          ? 'var(--app-primary)'
          : 'var(--app-text-mut)';

  return (
    <div className="min-h-screen text-white safe-area pt-20">
      <div className="px-4 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Trip recording</h1>
          <button
            onClick={handleCancelTrip}
            className="text-gray-400 hover:text-white"
            disabled={recordingState === 'starting' || recordingState === 'stopping'}
          >
            {recordingState === 'idle' ? 'Back' : 'Cancel'}
          </button>
        </div>
        {/* Status Card */}
        <StatusCard
          recordingState={recordingState}
          isRecording={isRecording}
          statusTone={statusTone}
          tripStats={tripStats}
        />

        {/* Live Stats */}
        {isRecording && <LiveStats tripStats={tripStats} />}
        {/* Sensor Status */}
        <SensorStatus
          hasPosition={tracker.currentPosition !== null}
          isPermissionDenied={tracker.isPermissionDenied}
          motionPermissionGranted={telematics.isPermissionGranted}
          hasActiveTrip={activeTrip !== null}
          isRecording={isRecording}
        />

        {/* Driving Events (during recording) */}
        {isRecording && tripEvents.speedingSeconds > 0 && (
          <DrivingEvents tripEvents={tripEvents} />
        )}
        {/* Error Display */}
        {(tracker.errorMessage || telematics.error) && (
          <SensorErrorPanel
            message={tracker.errorMessage || telematics.error || ''}
            isPermissionDenied={tracker.isPermissionDenied}
            requestPermission={() => tracker.requestPermission()}
          />
        )}

        {/* Control Buttons */}
        <ControlButtons
          recordingState={recordingState}
          isRecording={isRecording}
          canStart={canStart}
          isOnline={isOnline}
          isPermissionDenied={tracker.isPermissionDenied}
          handleStartTrip={handleStartTrip}
          handlePauseTrip={handlePauseTrip}
          handleStopTrip={handleStopTrip}
        />

        {/* Firebase Status Warning */}
        {!isFirebaseConfigured && recordingState === 'idle' && <DemoModeNotice />}
      </div>
    </div>
  );
}
