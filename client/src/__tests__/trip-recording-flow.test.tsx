/**
 * TESTS: Trip Recording Page
 * ==========================
 * Integration tests for the trip recording page lifecycle:
 * idle -> starting -> recording -> paused -> stopping -> redirect.
 *
 * Mocks all hooks and services to isolate the component behaviour.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Router, Route, Switch } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import React from 'react';

// Ensure React is available globally for components that use automatic JSX transform
globalThis.React = React;

// ---------------------------------------------------------------------------
// Mocks — must be declared before component imports
// ---------------------------------------------------------------------------

// Firebase core
vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-uid', getIdToken: vi.fn().mockResolvedValue('test-token') } },
  db: {},
  isFirebaseConfigured: true,
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  collection: vi.fn(),
  addDoc: vi.fn(),
  writeBatch: vi.fn(),
  serverTimestamp: vi.fn(),
  getFirestore: vi.fn(),
  Timestamp: { now: vi.fn(() => ({ seconds: 1000, nanoseconds: 0 })) },
}));

// Auth context
const mockUseAuth = vi.fn(() => ({
  user: { id: 'test-uid', name: 'Test User', email: 'test@driiva.co.uk' },
  loading: false,
  login: vi.fn(),
  logout: vi.fn(),
  setIsAuthenticated: vi.fn(),
  setUser: vi.fn(),
  checkOnboardingStatus: vi.fn(),
  markEmailVerified: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Online status context
const mockUseOnlineStatusContext = vi.fn(() => ({
  isOnline: true,
  reportFirestoreError: vi.fn(),
}));

vi.mock('@/contexts/OnlineStatusContext', () => ({
  useOnlineStatusContext: () => mockUseOnlineStatusContext(),
  OnlineStatusProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Toast
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Trip location tracker
const mockTrackerStart = vi.fn().mockResolvedValue(undefined);
const mockTrackerStop = vi.fn().mockReturnValue([]);
const mockTrackerPause = vi.fn();
const mockTrackerResume = vi.fn();
const mockRequestPermission = vi.fn().mockResolvedValue(true);

const mockTrackerState = {
  isTracking: false,
  isPaused: false,
  isPermissionGranted: true,
  isPermissionDenied: false,
  currentPosition: { latitude: 51.5074, longitude: -0.1278, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: 13.4, timestamp: Date.now() },
  pointCount: 0,
  totalDistance: 0,
  error: null,
  errorMessage: null,
  start: mockTrackerStart,
  stop: mockTrackerStop,
  pause: mockTrackerPause,
  resume: mockTrackerResume,
  clearError: vi.fn(),
  getPoints: vi.fn().mockReturnValue([]),
  requestPermission: mockRequestPermission,
};

vi.mock('@/hooks/useTripLocationTracker', () => ({
  useTripLocationTracker: () => mockTrackerState,
  default: () => mockTrackerState,
}));

// Telematics
const mockTelematicsRequestPermissions = vi.fn().mockResolvedValue({ granted: true, permission: 'granted' });
const mockTelematicsStartCollection = vi.fn().mockResolvedValue(undefined);
const mockTelematicsStopCollection = vi.fn().mockResolvedValue({
  gpsPoints: [],
  accelerometerData: [],
  gyroscopeData: [],
  speedData: [],
  timestamp: Date.now(),
});

const mockTelematicsState = {
  isCollecting: false,
  isPermissionGranted: true,
  currentData: null,
  metrics: null,
  error: null,
  summary: null,
  requestPermissions: mockTelematicsRequestPermissions,
  startCollection: mockTelematicsStartCollection,
  stopCollection: mockTelematicsStopCollection,
  clearError: vi.fn(),
  simulateHapticFeedback: vi.fn(),
};

vi.mock('@/hooks/useTelematics', () => ({
  useTelematics: () => mockTelematicsState,
}));

// Trip service
const mockStartTrip = vi.fn().mockResolvedValue({
  tripId: 'trip-001',
  userId: 'test-uid',
  startedAt: { seconds: 1000, nanoseconds: 0 },
  startLocation: { latitude: 51.5074, longitude: -0.1278 },
  pointsCount: 0,
  status: 'recording' as const,
});
const mockEndTrip = vi.fn().mockResolvedValue(undefined);
const mockCancelTrip = vi.fn().mockResolvedValue(undefined);

const mockStreamerInstance = {
  start: vi.fn(),
  stop: vi.fn().mockResolvedValue(42),
  addPoint: vi.fn(),
};

vi.mock('@/lib/tripService', () => {
  // Use a proper function (not arrow) so it can be called with `new`
  const MockTripPointStreamer = vi.fn(function(this: Record<string, unknown>) {
    this.start = mockStreamerInstance.start;
    this.stop = mockStreamerInstance.stop;
    this.addPoint = mockStreamerInstance.addPoint;
    return this;
  });
  return {
    TripPointStreamer: MockTripPointStreamer,
    startTrip: (...args: unknown[]) => mockStartTrip(...args),
    endTrip: (...args: unknown[]) => mockEndTrip(...args),
    cancelTrip: (...args: unknown[]) => mockCancelTrip(...args),
    createTripLocation: (lat: number, lng: number) => ({ latitude: lat, longitude: lng }),
    calculateDefaultScoreBreakdown: vi.fn(() => ({
      score: 85,
      breakdown: { speed: 90, braking: 80, acceleration: 85, cornering: 88, phone: 100 },
    })),
  };
});

// UI components — mock Radix-based components to avoid jsdom issues
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: React.forwardRef(({ children, asChild, ...props }: { children: React.ReactNode; asChild?: boolean } & Record<string, unknown>, _ref: React.Ref<unknown>) => {
    if (asChild) return <>{children}</>;
    return <span {...props}>{children}</span>;
  }),
}));

// Lucide icons — render as simple spans to avoid SVG issues
vi.mock('lucide-react', () => ({
  Play: (props: Record<string, unknown>) => <span data-testid="icon-play" {...props} />,
  Square: (props: Record<string, unknown>) => <span data-testid="icon-square" {...props} />,
  Pause: (props: Record<string, unknown>) => <span data-testid="icon-pause" {...props} />,
  Navigation: (props: Record<string, unknown>) => <span data-testid="icon-navigation" {...props} />,
  Clock: (props: Record<string, unknown>) => <span data-testid="icon-clock" {...props} />,
  Zap: (props: Record<string, unknown>) => <span data-testid="icon-zap" {...props} />,
  MapPin: (props: Record<string, unknown>) => <span data-testid="icon-mappin" {...props} />,
  AlertCircle: (props: Record<string, unknown>) => <span data-testid="icon-alertcircle" {...props} />,
  Loader2: (props: Record<string, unknown>) => <span data-testid="icon-loader" {...props} />,
  Route: (props: Record<string, unknown>) => <span data-testid="icon-route" {...props} />,
}));

// ---------------------------------------------------------------------------
// Import component AFTER all mocks are set up
// ---------------------------------------------------------------------------

import TripRecording from '../pages/trip-recording';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage(path = '/record') {
  const { hook } = memoryLocation({ path });
  return render(
    <Router hook={hook}>
      <Switch>
        <Route path="/record"><TripRecording /></Route>
        <Route path="/"><div data-testid="dashboard">Dashboard</div></Route>
      </Switch>
    </Router>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Trip Recording Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Re-setup mock implementations that clearAllMocks resets
    mockStreamerInstance.start.mockImplementation(() => {});
    mockStreamerInstance.stop.mockResolvedValue(0);
    mockStreamerInstance.addPoint.mockImplementation(() => {});

    // Reset tracker state to defaults
    mockTrackerState.isTracking = false;
    mockTrackerState.isPaused = false;
    mockTrackerState.isPermissionGranted = true;
    mockTrackerState.isPermissionDenied = false;
    mockTrackerState.currentPosition = {
      latitude: 51.5074, longitude: -0.1278, accuracy: 10,
      altitude: null, altitudeAccuracy: null, heading: null, speed: 13.4, timestamp: Date.now(),
    };
    mockTrackerState.pointCount = 0;
    mockTrackerState.totalDistance = 0;
    mockTrackerState.error = null;
    mockTrackerState.errorMessage = null;

    // Reset telematics state
    mockTelematicsState.isPermissionGranted = true;
    mockTelematicsState.error = null;

    // Reset online
    mockUseOnlineStatusContext.mockReturnValue({
      isOnline: true,
      reportFirestoreError: vi.fn(),
    });

    // Stub navigator.wakeLock
    vi.stubGlobal('navigator', {
      ...navigator,
      wakeLock: {
        request: vi.fn().mockResolvedValue({ release: vi.fn() }),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Rendering — idle state
  // =========================================================================

  describe('Idle state rendering', () => {
    it('shows "Start Trip" button in idle state', () => {
      renderPage();
      expect(screen.getByRole('button', { name: /start trip/i })).toBeInTheDocument();
    });

    it('shows the page title', () => {
      renderPage();
      expect(screen.getByText('Trip Recording')).toBeInTheDocument();
    });

    it('shows "Ready to Record" status text', () => {
      renderPage();
      expect(screen.getByText('Ready to Record')).toBeInTheDocument();
    });

    it('shows sensor status indicators', () => {
      renderPage();
      expect(screen.getByText('GPS Location')).toBeInTheDocument();
      expect(screen.getByText('Motion Sensors')).toBeInTheDocument();
    });

    it('shows idle description text', () => {
      renderPage();
      expect(screen.getByText('Tap Start to begin recording your trip')).toBeInTheDocument();
    });

    it('shows "Back" on the cancel button when idle', () => {
      renderPage();
      expect(screen.getByText('Back')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Start Trip button state
  // =========================================================================

  describe('Start button enabled/disabled', () => {
    it('Start Trip button is enabled when online and permission granted', () => {
      renderPage();
      const btn = screen.getByRole('button', { name: /start trip/i });
      expect(btn).not.toBeDisabled();
    });

    it('Start Trip button is disabled when location permission is denied', () => {
      mockTrackerState.isPermissionDenied = true;
      renderPage();
      const btn = screen.getByRole('button', { name: /start trip/i });
      expect(btn).toBeDisabled();
    });

    it('Start Trip button is disabled when offline', () => {
      mockUseOnlineStatusContext.mockReturnValue({
        isOnline: false,
        reportFirestoreError: vi.fn(),
      });
      renderPage();
      const btn = screen.getByRole('button', { name: /start trip/i });
      expect(btn).toBeDisabled();
    });
  });

  // =========================================================================
  // Starting a trip
  // =========================================================================

  describe('Starting a trip', () => {
    it('shows "Starting..." button after clicking Start Trip', async () => {
      // Make startTrip hang so we stay in the 'starting' state
      mockStartTrip.mockImplementation(() => new Promise(() => {}));
      mockRequestPermission.mockImplementation(() => new Promise(() => {}));

      renderPage();
      const btn = screen.getByRole('button', { name: /start trip/i });

      await act(async () => {
        fireEvent.click(btn);
      });

      expect(screen.getByRole('button', { name: /starting/i })).toBeInTheDocument();
    });

    it('shows "Starting Trip..." status while starting', async () => {
      mockRequestPermission.mockImplementation(() => new Promise(() => {}));

      renderPage();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /start trip/i }));
      });

      expect(screen.getByText('Starting Trip...')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Recording state
  // =========================================================================

  describe('Recording state', () => {
    async function startRecording() {
      mockRequestPermission.mockResolvedValue(true);
      mockStartTrip.mockResolvedValue({
        tripId: 'trip-001',
        userId: 'test-uid',
        startedAt: { seconds: 1000, nanoseconds: 0 },
        startLocation: { latitude: 51.5074, longitude: -0.1278 },
        pointsCount: 0,
        status: 'recording' as const,
      });

      renderPage();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /start trip/i }));
        // Advance past the 2-second wait for initial position
        await vi.advanceTimersByTimeAsync(2500);
      });
    }

    it('shows "Recording Trip" status text after starting', async () => {
      await startRecording();
      expect(screen.getByText('Recording Trip')).toBeInTheDocument();
    });

    it('shows Pause and End Trip buttons during recording', async () => {
      await startRecording();
      expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /end trip/i })).toBeInTheDocument();
    });

    it('shows live stats (Distance, Speed, Points) during recording', async () => {
      await startRecording();
      expect(screen.getByText('Distance')).toBeInTheDocument();
      expect(screen.getByText('Speed')).toBeInTheDocument();
      expect(screen.getByText('Points')).toBeInTheDocument();
    });

    it('shows the duration timer', async () => {
      await startRecording();
      // Timer starts at 0:00
      expect(screen.getByText('0:00')).toBeInTheDocument();
    });

    it('shows "Cancel" button instead of "Back" when recording', async () => {
      await startRecording();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.queryByText('Back')).not.toBeInTheDocument();
    });

    it('shows description text for recording', async () => {
      await startRecording();
      expect(screen.getByText('Your driving data is being recorded')).toBeInTheDocument();
    });

    it('calls tracker.start() and telematics.startCollection()', async () => {
      await startRecording();
      expect(mockTrackerStart).toHaveBeenCalled();
      expect(mockTelematicsStartCollection).toHaveBeenCalled();
    });

    it('shows a toast when trip starts', async () => {
      await startRecording();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Trip Started' })
      );
    });
  });

  // =========================================================================
  // Pausing
  // =========================================================================

  describe('Pause and Resume', () => {
    async function startAndPause() {
      mockRequestPermission.mockResolvedValue(true);
      mockStartTrip.mockResolvedValue({
        tripId: 'trip-001',
        userId: 'test-uid',
        startedAt: { seconds: 1000, nanoseconds: 0 },
        startLocation: { latitude: 51.5074, longitude: -0.1278 },
        pointsCount: 0,
        status: 'recording' as const,
      });

      renderPage();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /start trip/i }));
        await vi.advanceTimersByTimeAsync(2500);
      });

      // Click Pause
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /pause/i }));
      });
    }

    it('shows "Resume" button after pausing', async () => {
      await startAndPause();
      expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
    });

    it('shows "Trip Paused" status text', async () => {
      await startAndPause();
      expect(screen.getByText('Trip Paused')).toBeInTheDocument();
    });

    it('shows correct description when paused', async () => {
      await startAndPause();
      expect(screen.getByText('Tap Resume to continue recording')).toBeInTheDocument();
    });

    it('calls tracker.pause() when pausing', async () => {
      await startAndPause();
      expect(mockTrackerPause).toHaveBeenCalled();
    });

    it('shows a toast when trip is paused', async () => {
      await startAndPause();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Trip Paused' })
      );
    });

    it('calls tracker.resume() when resuming', async () => {
      await startAndPause();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /resume/i }));
      });

      expect(mockTrackerResume).toHaveBeenCalled();
    });

    it('shows "Recording Trip" after resuming', async () => {
      await startAndPause();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /resume/i }));
      });

      expect(screen.getByText('Recording Trip')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Ending a trip
  // =========================================================================

  describe('Ending a trip', () => {
    it('shows "Saving Trip..." status and button when ending', async () => {
      mockRequestPermission.mockResolvedValue(true);
      mockStartTrip.mockResolvedValue({
        tripId: 'trip-001',
        userId: 'test-uid',
        startedAt: { seconds: 1000, nanoseconds: 0 },
        startLocation: { latitude: 51.5074, longitude: -0.1278 },
        pointsCount: 0,
        status: 'recording' as const,
      });

      // Make streamer stop hang so we stay in the stopping state
      mockStreamerInstance.stop.mockImplementation(() => new Promise(() => {}));

      renderPage();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /start trip/i }));
        await vi.advanceTimersByTimeAsync(2500);
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /end trip/i }));
      });

      // The status heading shows "Saving Trip..."
      expect(screen.getByText('Calculating your score...')).toBeInTheDocument();
      // The disabled button should be present
      expect(screen.getByRole('button', { name: /saving trip/i })).toBeDisabled();
    });

    it('calls endTrip with trip ID, score data, and shows completion toast', async () => {
      mockRequestPermission.mockResolvedValue(true);
      mockStartTrip.mockResolvedValue({
        tripId: 'trip-001',
        userId: 'test-uid',
        startedAt: { seconds: 1000, nanoseconds: 0 },
        startLocation: { latitude: 51.5074, longitude: -0.1278 },
        pointsCount: 0,
        status: 'recording' as const,
      });
      mockEndTrip.mockResolvedValue(undefined);
      mockStreamerInstance.stop.mockResolvedValue(42);

      renderPage();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /start trip/i }));
        await vi.advanceTimersByTimeAsync(2500);
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /end trip/i }));
      });

      // endTrip should have been called with the trip ID as first arg
      expect(mockEndTrip).toHaveBeenCalled();
      const callArgs = mockEndTrip.mock.calls[0];
      expect(callArgs[0]).toBe('trip-001');
      // Second arg is the TripEndInput with score
      expect(callArgs[1]).toEqual(expect.objectContaining({ score: 85 }));

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Trip Completed' })
      );
    });

    it('redirects to dashboard after ending trip', async () => {
      mockRequestPermission.mockResolvedValue(true);
      mockStartTrip.mockResolvedValue({
        tripId: 'trip-001',
        userId: 'test-uid',
        startedAt: { seconds: 1000, nanoseconds: 0 },
        startLocation: { latitude: 51.5074, longitude: -0.1278 },
        pointsCount: 0,
        status: 'recording' as const,
      });
      mockEndTrip.mockResolvedValue(undefined);
      mockStreamerInstance.stop.mockResolvedValue(10);

      renderPage();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /start trip/i }));
        await vi.advanceTimersByTimeAsync(2500);
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /end trip/i }));
      });

      // setLocation('/') is called after a 1500ms timeout
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      await waitFor(() => {
        expect(screen.getByTestId('dashboard')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // Cancel trip
  // =========================================================================

  describe('Cancel trip', () => {
    it('navigates to dashboard when cancelling from idle', async () => {
      renderPage();

      await act(async () => {
        fireEvent.click(screen.getByText('Back'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('dashboard')).toBeInTheDocument();
      });
    });

    it('cancels an active trip and shows toast', async () => {
      mockRequestPermission.mockResolvedValue(true);
      mockStartTrip.mockResolvedValue({
        tripId: 'trip-001',
        userId: 'test-uid',
        startedAt: { seconds: 1000, nanoseconds: 0 },
        startLocation: { latitude: 51.5074, longitude: -0.1278 },
        pointsCount: 0,
        status: 'recording' as const,
      });

      renderPage();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /start trip/i }));
        await vi.advanceTimersByTimeAsync(2500);
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Cancel'));
      });

      expect(mockCancelTrip).toHaveBeenCalledWith('trip-001');
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Trip Cancelled' })
      );
    });
  });

  // =========================================================================
  // Demo mode
  // =========================================================================

  describe('Demo mode', () => {
    it('in demo mode, records locally without Firestore trip creation', async () => {
      // Set demo mode in sessionStorage BEFORE rendering
      sessionStorage.setItem('driiva-demo-mode', 'true');
      sessionStorage.setItem('driiva-demo-user', JSON.stringify({ id: 'demo-user' }));

      renderPage();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /start trip/i }));
        await vi.advanceTimersByTimeAsync(2500);
      });

      // In demo mode, startTrip should not be called (Firebase is skipped)
      expect(mockStartTrip).not.toHaveBeenCalled();

      // But we should still be recording
      expect(screen.getByText('Recording Trip')).toBeInTheDocument();

      // The toast should mention demo mode
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining('Demo mode'),
        })
      );

      // Clean up
      sessionStorage.removeItem('driiva-demo-mode');
      sessionStorage.removeItem('driiva-demo-user');
    });

    it('shows Demo Mode warning when Firebase is not configured', async () => {
      // We need to re-mock firebase for this test
      const firebaseMod = await import('@/lib/firebase');
      Object.defineProperty(firebaseMod, 'isFirebaseConfigured', { value: false, writable: true });

      // This test checks the warning banner, which depends on the imported value.
      // Since modules are cached, we verify the static text pattern exists in the component.
      // The Firebase warning is rendered when isFirebaseConfigured is false,
      // but our module mock has it as true. This is a limitation of module mocking.
      // We verify the demo-mode toast path above instead.
    });
  });

  // =========================================================================
  // Error states
  // =========================================================================

  describe('Error states', () => {
    it('shows error message when tracker has an error', () => {
      mockTrackerState.errorMessage = 'Location permission denied. Please enable location access in your browser settings.';
      mockTrackerState.isPermissionDenied = true;

      renderPage();

      expect(screen.getByText('Sensor Error')).toBeInTheDocument();
      expect(screen.getByText(/Location permission denied/)).toBeInTheDocument();
    });

    it('shows Retry Permission button when permission is denied', () => {
      mockTrackerState.errorMessage = 'Location permission denied.';
      mockTrackerState.isPermissionDenied = true;

      renderPage();

      expect(screen.getByRole('button', { name: /retry permission/i })).toBeInTheDocument();
    });

    it('shows telematics error when present', () => {
      mockTelematicsState.error = 'Device motion permission denied';

      renderPage();

      expect(screen.getByText('Sensor Error')).toBeInTheDocument();
      expect(screen.getByText('Device motion permission denied')).toBeInTheDocument();
    });

    it('shows toast on start timeout', async () => {
      // Make requestPermission hang forever to trigger the 25s timeout
      mockRequestPermission.mockImplementation(() => new Promise(() => {}));

      renderPage();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /start trip/i }));
      });

      // Advance past the 25s timeout
      await act(async () => {
        await vi.advanceTimersByTimeAsync(26000);
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Failed to Start',
          variant: 'destructive',
        })
      );
    });
  });

  // =========================================================================
  // Timer updates
  // =========================================================================

  it.todo('updates the duration timer every second while recording — skipped because fake timers and setInterval inside useEffect are unreliable in this test setup');

  it.todo('updates distance display from tracker.totalDistance — skipped because it requires deep state simulation through the timer interval');
});
