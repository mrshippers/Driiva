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
  calculateDefaultScoreBreakdown,
  ActiveTrip,
  TripEvents,
} from '@/lib/tripService';
import { isFirebaseConfigured } from '@/lib/firebase';
import { useOnlineStatusContext } from '@/contexts/OnlineStatusContext';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Play,
  Square,
  Pause,
  Navigation,
  Clock,
  Zap,
  MapPin,
  AlertCircle,
  Loader2,
  Route,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

type RecordingState = 'idle' | 'starting' | 'recording' | 'paused' | 'stopping';

interface TripStats {
  distanceMeters: number;
  durationMs: number;
  pointsCount: number;
  avgSpeed: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatDistance(meters: number): string {
  const miles = meters / 1609.34;
  return miles < 0.1 ? `${Math.round(meters)} m` : `${miles.toFixed(2)} mi`;
}

function formatSpeed(metersPerSecond: number | null): string {
  if (metersPerSecond === null || metersPerSecond <= 0) return '0 mph';
  const mph = metersPerSecond * 2.237;
  return `${Math.round(mph)} mph`;
}

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
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

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

        // Detect driving events (simplified - production would be more sophisticated)
        // TODO: Implement real phone pickup detection (accelerometer pattern recognition)
        // Currently hardcoded to 0 — phone usage weight is 10% per CLAUDE.md scoring spec
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
            description: 'Please enable location access to record trips.',
            variant: 'destructive',
          });
        }
      }, [toast]),
      onStart: useCallback(() => {}, []),
      onStop: useCallback((_points: TrackedPoint[]) => {}, []),
    }
  );

  // Update duration every second while recording
  useEffect(() => {
    if (recordingState === 'recording' && tripStartTimeRef.current > 0) {
      durationIntervalRef.current = setInterval(() => {
        setTripStats(prev => ({
          ...prev,
          durationMs: Date.now() - tripStartTimeRef.current,
          distanceMeters: tracker.totalDistance,
        }));
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [recordingState, tracker.totalDistance]);

  // Wake Lock: keep the screen on while recording so GPS doesn't stop
  const acquireWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch {
      // Unsupported or denied — non-fatal; user will see the guidance text
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release();
    wakeLockRef.current = null;
  }, []);

  // Track phone pickups + re-acquire wake lock on visibility changes
  useEffect(() => {
    const handler = async () => {
      if (recordingState === 'recording') {
        if (document.visibilityState === 'hidden') {
          // Driver switched away — count as a phone pickup
          setTripEvents(prev => ({ ...prev, phonePickupCount: prev.phonePickupCount + 1 }));
        } else {
          // Tab visible again — re-acquire wake lock (browser releases it on hide)
          await acquireWakeLock();
        }
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [recordingState, acquireWakeLock]);

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

      // Stop point streamer and get final count
      let finalPointsCount = points.length;
      if (streamerRef.current) {
        finalPointsCount = await streamerRef.current.stop();
        streamerRef.current = null;
      }

      // Calculate final stats
      const finalPosition = tracker.currentPosition;
      const durationSeconds = Math.floor(tripStats.durationMs / 1000);

      // Calculate score
      const { score, breakdown } = calculateDefaultScoreBreakdown(
        tripEvents.hardBrakingCount,
        tripEvents.hardAccelerationCount,
        tripEvents.speedingSeconds,
        tripEvents.sharpTurnCount,
        tripEvents.phonePickupCount,
        durationSeconds
      );

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
              score,
              scoreBreakdown: breakdown,
              events: tripEvents,
              distanceMeters: tripStats.distanceMeters,
            },
            finalPointsCount
          );
        } catch (error) {
          console.error('[TripRecording] Failed to end trip:', error);
        }
      }

      // Show result
      toast({
        title: 'Trip Completed',
        description: `Score: ${score}/100 • Distance: ${formatDistance(tripStats.distanceMeters)} • ${finalPointsCount} points`,
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

  return (
    <div className="min-h-screen text-white safe-area pt-20">
      <div className="px-4 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Trip Recording</h1>
          <button
            onClick={handleCancelTrip}
            className="text-gray-400 hover:text-white"
            disabled={recordingState === 'starting' || recordingState === 'stopping'}
          >
            {recordingState === 'idle' ? 'Back' : 'Cancel'}
          </button>
        </div>

        {/* Status Card */}
        <div className="glass-morphism rounded-3xl p-6 mb-6">
          <div className="text-center">
            {/* Status Indicator */}
            <div
              className={`w-24 h-24 mx-auto mb-4 rounded-full flex items-center justify-center ${recordingState === 'recording'
                  ? 'bg-red-500/20 border-2 border-red-500'
                  : recordingState === 'paused'
                    ? 'bg-yellow-500/20 border-2 border-yellow-500'
                    : recordingState === 'starting' || recordingState === 'stopping'
                      ? 'bg-blue-500/20 border-2 border-blue-500'
                      : 'bg-gray-500/20 border-2 border-gray-500'
                }`}
            >
              {recordingState === 'starting' || recordingState === 'stopping' ? (
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              ) : recordingState === 'recording' ? (
                <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse" />
              ) : recordingState === 'paused' ? (
                <Pause className="w-8 h-8 text-yellow-500" />
              ) : (
                <Play className="w-8 h-8 text-gray-400" />
              )}
            </div>

            {/* Status Text */}
            <h2 className="text-xl font-semibold mb-2">
              {recordingState === 'idle' && 'Ready to Record'}
              {recordingState === 'starting' && 'Starting Trip...'}
              {recordingState === 'recording' && 'Recording Trip'}
              {recordingState === 'paused' && 'Trip Paused'}
              {recordingState === 'stopping' && 'Saving Trip...'}
            </h2>

            {/* Duration */}
            {isRecording && (
              <div className="text-4xl font-bold text-white mb-2 font-mono">
                {formatDuration(tripStats.durationMs)}
              </div>
            )}

            {/* Description */}
            <p className="text-gray-400 text-sm">
              {recordingState === 'idle' && 'Tap Start to begin recording your trip'}
              {recordingState === 'starting' && 'Setting up GPS and sensors...'}
              {recordingState === 'recording' && 'Your driving data is being recorded'}
              {recordingState === 'paused' && 'Tap Resume to continue recording'}
              {recordingState === 'stopping' && 'Calculating your score...'}
            </p>
          </div>
        </div>

        {/* Live Stats */}
        {isRecording && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="glass-card rounded-2xl p-4 text-center">
              <Route className="w-5 h-5 text-[#8B4513] mx-auto mb-2" />
              <div className="text-lg font-bold">{formatDistance(tripStats.distanceMeters)}</div>
              <div className="text-xs text-gray-400">Distance</div>
            </div>

            <div className="glass-card rounded-2xl p-4 text-center">
              <Navigation className="w-5 h-5 text-[#B87333] mx-auto mb-2" />
              <div className="text-lg font-bold">{formatSpeed(tripStats.avgSpeed)}</div>
              <div className="text-xs text-gray-400">Speed</div>
            </div>

            <div className="glass-card rounded-2xl p-4 text-center">
              <MapPin className="w-5 h-5 text-green-500 mx-auto mb-2" />
              <div className="text-lg font-bold">{tripStats.pointsCount}</div>
              <div className="text-xs text-gray-400">Points</div>
            </div>
          </div>
        )}

        {/* Sensor Status */}
        <div className="glass-card rounded-2xl p-4 mb-6">
          <h3 className="font-semibold mb-3">Sensor Status</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">GPS Location</span>
              <div
                className={`w-3 h-3 rounded-full ${tracker.currentPosition
                    ? 'bg-green-500'
                    : tracker.isPermissionDenied
                      ? 'bg-red-500'
                      : 'bg-yellow-500'
                  }`}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Motion Sensors</span>
              <div
                className={`w-3 h-3 rounded-full ${telematics.isPermissionGranted ? 'bg-green-500' : 'bg-red-500'
                  }`}
              />
            </div>
            {activeTrip && (
              <div className="flex items-center justify-between">
                <span className="text-sm">Cloud Sync</span>
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
            )}
          </div>
          {isRecording && (
            <p className="text-xs text-gray-500 mt-3">
              Keep your screen on during the trip for accurate GPS tracking.
            </p>
          )}
        </div>

        {/* Driving Events (during recording) */}
        {isRecording && tripEvents.speedingSeconds > 0 && (
          <div className="glass-card rounded-2xl p-4 mb-6">
            <h3 className="font-semibold mb-3 flex items-center">
              <Zap className="w-4 h-4 mr-2 text-yellow-500" />
              Driving Events
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {tripEvents.speedingSeconds > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Speeding</span>
                  <span>{tripEvents.speedingSeconds}s</span>
                </div>
              )}
              {tripEvents.hardBrakingCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Hard Braking</span>
                  <span>{tripEvents.hardBrakingCount}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error Display */}
        {(tracker.errorMessage || telematics.error) && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-2xl">
            <h4 className="font-semibold text-red-400 mb-2 flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" />
              Sensor Error
            </h4>
            <p className="text-sm text-red-300">
              {tracker.errorMessage || telematics.error}
            </p>
            {tracker.isPermissionDenied && (
              <Button
                onClick={() => tracker.requestPermission()}
                variant="outline"
                size="sm"
                className="mt-3 border-red-500/50 text-red-300 hover:bg-red-500/20"
              >
                Retry Permission
              </Button>
            )}
          </div>
        )}

        {/* Control Buttons */}
        <div className="space-y-4">
          {recordingState === 'idle' && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block w-full">
                    <Button
                      onClick={handleStartTrip}
                      className="w-full h-14 bg-gradient-to-r from-[#8B4513] to-[#B87333] hover:from-[#A0522D] hover:to-[#CD853F] text-white font-semibold rounded-2xl disabled:opacity-60"
                      disabled={!canStart}
                    >
                      <Play className="w-5 h-5 mr-2" />
                      Start Trip
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  {!isOnline
                    ? 'Start trip requires an internet connection. Trip data will sync when you\'re back online.'
                    : !tracker.isPermissionDenied
                      ? 'Start recording a new trip'
                      : 'Allow location access to start a trip'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {recordingState === 'starting' && (
            <Button
              disabled
              className="w-full h-14 bg-gradient-to-r from-[#8B4513] to-[#B87333] text-white font-semibold rounded-2xl opacity-70"
            >
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Starting...
            </Button>
          )}

          {isRecording && (
            <div className="grid grid-cols-2 gap-4">
              <Button
                onClick={handlePauseTrip}
                variant="outline"
                className="h-14 glass-card border-gray-600 text-white hover:bg-white/10 rounded-2xl"
              >
                {recordingState === 'paused' ? (
                  <>
                    <Play className="w-5 h-5 mr-2" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="w-5 h-5 mr-2" />
                    Pause
                  </>
                )}
              </Button>

              <Button
                onClick={handleStopTrip}
                className="h-14 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-2xl"
              >
                <Square className="w-5 h-5 mr-2" />
                End Trip
              </Button>
            </div>
          )}

          {recordingState === 'stopping' && (
            <Button
              disabled
              className="w-full h-14 bg-red-600/70 text-white font-semibold rounded-2xl"
            >
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Saving Trip...
            </Button>
          )}
        </div>

        {/* Firebase Status Warning */}
        {!isFirebaseConfigured && recordingState === 'idle' && (
          <div className="mt-6 p-4 bg-yellow-500/20 border border-yellow-500/30 rounded-2xl">
            <p className="text-sm text-yellow-300">
              <strong>Demo Mode:</strong> Trip data will not be saved to cloud.
              Configure Firebase to enable cloud sync.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
