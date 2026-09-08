/**
 * PHONE-PICKUP DETECTION (web)
 * ============================
 * Counts phone pickups during a trip recorded on the web surface, so the
 * phone-usage 10% of the driving score (SCORE_WEIGHTS.phoneUsage in
 * packages/scoring/src/tripMetrics.ts) has more behind it than the
 * `visibilitychange` proxy the recorder shipped with. Closes ROADMAP TD-2.
 *
 * WHY BOTH SIGNALS. `visibilitychange` only fires when the driver leaves the
 * tab, so a driver who picks the phone up, reads the recording screen and puts
 * it down again was invisible to a score component named after exactly that
 * act. The accelerometer sees the handling; the visibility event still sees the
 * app switch, which the accelerometer can miss because browsers stop delivering
 * `devicemotion` to a page that is no longer visible. They are counted through
 * ONE counter with one debounce, so lifting the phone AND switching app is one
 * pickup, not two.
 *
 * WHAT THIS IS. The same deterministic threshold-and-sustain shape as
 * mobile/lib/phonePickup.ts: a deviation of total specific force from its
 * resting value, held long enough to be handling rather than a pothole, with a
 * debounce so one episode is not counted per sample. Same input, same output,
 * no model and no network call.
 *
 * WHAT IT IS NOT. Gesture recognition, and not a port of the mobile constants
 * either. Two things genuinely differ on this surface and the mirror stops
 * there:
 *
 *   UNITS. expo-sensors reports in g and rests at 1g. DeviceMotion reports in
 *   m/s^2, and its two streams rest at different values: `acceleration`
 *   excludes gravity and rests at 0, `accelerationIncludingGravity` rests at
 *   one g. Both are read, and the deviation is taken from whichever stream the
 *   browser actually populates, because Android browsers commonly deliver only
 *   the second.
 *
 *   SAMPLE RATE. Mobile samples at 5 Hz and treats a single quiet sample as the
 *   end of an episode. Browsers deliver `devicemotion` an order of magnitude
 *   faster, fast enough to resolve the oscillation inside a real pickup, so
 *   that rule would end almost every episode before it could be counted.
 *   SUSTAIN_GAP_TOLERANCE_MS below is the difference: a quiet run shorter than
 *   the tolerance does not break the episode, a longer one does.
 *
 * UNVERIFIED IN A MOVING CAR, like its mobile counterpart. The thresholds are
 * reasoned from the physics and from mobile's, not calibrated against labelled
 * trip data, and there is no ground truth on the device to calibrate them
 * against. The server does not trust the number either way: it sanitises and
 * rate-caps it in `sanitizePhonePickupCount` before it can move a score.
 */

/** Standard gravity, the resting magnitude of the gravity-inclusive stream. */
export const GRAVITY_MPS2 = 9.80665;

/**
 * Deviation of total specific force from rest, beyond which a sample counts as
 * candidate handling. Mobile's 0.4g expressed in m/s^2, so the two surfaces
 * answer "is this phone being handled" at the same physical threshold.
 */
export const DISTURBANCE_THRESHOLD_MPS2 = 0.4 * GRAVITY_MPS2;

/**
 * How long a candidate disturbance must hold before it counts as a pickup
 * rather than a bump or a kerb. Mirrors mobile.
 */
export const MIN_SUSTAINED_MS = 600;

/**
 * Minimum gap between counted pickups, so one continuous handling episode is
 * not counted many times over, and so the two signals cannot both count the
 * same act. Mirrors mobile.
 */
export const DEBOUNCE_MS = 3000;

/**
 * A run of below-threshold samples shorter than this does not end an episode.
 * Web-specific: see the SAMPLE RATE note in the file header. It doubles as the
 * guard against a gap in the event stream itself being read as sustained
 * handling, which is what a backgrounded page produces.
 */
export const SUSTAIN_GAP_TOLERANCE_MS = 200;

/** The x/y/z shape both DeviceMotion streams share. Components may be null. */
export interface MotionVector {
  x: number | null;
  y: number | null;
  z: number | null;
}

/**
 * The part of DeviceMotionEvent this module reads. Declared structurally so the
 * heuristic can be tested without constructing a real event, which jsdom does
 * not implement.
 */
export interface MotionEventLike {
  acceleration?: MotionVector | null;
  accelerationIncludingGravity?: MotionVector | null;
}

function magnitude(vector: MotionVector): number {
  const x = vector.x ?? 0;
  const y = vector.y ?? 0;
  const z = vector.z ?? 0;
  return Math.sqrt(x * x + y * y + z * z);
}

function isPopulated(vector: MotionVector | null | undefined): vector is MotionVector {
  return (
    !!vector && (vector.x !== null || vector.y !== null || vector.z !== null)
  );
}

/**
 * The deviation from rest this event reports, in m/s^2, or null when it carries
 * no usable reading. A device with no motion sensor fires no event at all on
 * most browsers and an all-null one on some, and neither is a resting zero -
 * returning null keeps that distinction, so `sawMotionReading` can tell a
 * measured zero from an absent sensor.
 */
export function deviationFromMotionEvent(event: MotionEventLike): number | null {
  if (isPopulated(event.acceleration)) {
    // Gravity already removed by the platform, so rest is zero.
    return magnitude(event.acceleration);
  }
  if (isPopulated(event.accelerationIncludingGravity)) {
    return Math.abs(magnitude(event.accelerationIncludingGravity) - GRAVITY_MPS2);
  }
  return null;
}

/**
 * The counting rule, with no DOM in it. Takes deviations and explicit
 * timestamps so it is deterministic under test and so the visibility proxy can
 * share the same debounce through `notePickup`.
 */
export class PhonePickupCounter {
  private count_ = 0;
  private episodeStartedAt: number | null = null;
  private lastAboveAt = 0;
  private lastCountedAt = Number.NEGATIVE_INFINITY;

  get count(): number {
    return this.count_;
  }

  /** Clears the count and any episode in flight. Called at the start of a trip. */
  reset(): void {
    this.count_ = 0;
    this.episodeStartedAt = null;
    this.lastAboveAt = 0;
    this.lastCountedAt = Number.NEGATIVE_INFINITY;
  }

  /** Feed one accelerometer-derived deviation, in m/s^2, observed at `now`. */
  observeDeviation(deviationMps2: number, now: number): void {
    if (!Number.isFinite(deviationMps2)) return;

    if (deviationMps2 < DISTURBANCE_THRESHOLD_MPS2) {
      if (
        this.episodeStartedAt !== null &&
        now - this.lastAboveAt > SUSTAIN_GAP_TOLERANCE_MS
      ) {
        this.episodeStartedAt = null;
      }
      return;
    }

    if (
      this.episodeStartedAt === null ||
      now - this.lastAboveAt > SUSTAIN_GAP_TOLERANCE_MS
    ) {
      // Either nothing was in flight, or the last above-threshold sample is old
      // enough that the quiet between them was not part of this episode. The
      // second case is what a throttled page produces: samples stop arriving
      // entirely, and without this the pause would read as continuous handling.
      this.episodeStartedAt = now;
    }
    this.lastAboveAt = now;

    const sustainedFor = now - this.episodeStartedAt;
    if (sustainedFor >= MIN_SUSTAINED_MS && now - this.lastCountedAt >= DEBOUNCE_MS) {
      this.count_ += 1;
      this.lastCountedAt = now;
      // Restart the sustain clock rather than leaving it running, so a
      // continued hold is metered roughly every DEBOUNCE_MS rather than firing
      // again on the very next sample.
      this.episodeStartedAt = now;
    }
  }

  /**
   * Record a pickup seen by something other than the accelerometer, today the
   * `visibilitychange` proxy. Shares the debounce, so an act both signals see
   * is counted once.
   */
  notePickup(now: number): void {
    if (now - this.lastCountedAt < DEBOUNCE_MS) return;
    this.count_ += 1;
    this.lastCountedAt = now;
  }
}

export interface WebPhonePickupDetectorOptions {
  /** Called with the running total whenever it changes, for live display. */
  onCount?: (count: number) => void;
  /**
   * Asked before anything is counted. The recorder uses it to stop counting
   * while a trip is paused: the driver has deliberately stopped recording, and
   * the duration the pickup rate is measured against stops with it, so handling
   * the phone then would be penalised against time that was never counted.
   * Sensor presence is still recorded, since that is true either way.
   */
  shouldCount?: () => boolean;
}

/**
 * Counts pickups for one trip from the browser's `devicemotion` stream. Call
 * `start()` when recording begins and `stop()` when it ends; `stop()` returns
 * the count, removes the listener and is safe to call more than once. Safe on a
 * device with no motion sensor, where the listener simply never fires - read
 * `sawMotionReading` before reporting a zero as a measurement.
 */
export class WebPhonePickupDetector {
  private counter = new PhonePickupCounter();
  private listener: ((event: Event) => void) | null = null;
  private sawReading = false;
  private clock: () => number = Date.now;
  private readonly onCount?: (count: number) => void;
  private readonly shouldCount?: () => boolean;

  constructor(options: WebPhonePickupDetectorOptions = {}) {
    this.onCount = options.onCount;
    this.shouldCount = options.shouldCount;
  }

  get count(): number {
    return this.counter.count;
  }

  /** Whether any usable motion reading has arrived since `start()`. */
  get sawMotionReading(): boolean {
    return this.sawReading;
  }

  /** `clock` is injectable so the sustain and debounce windows are testable. */
  start(clock: () => number = Date.now): void {
    this.stop();
    this.counter.reset();
    this.sawReading = false;
    this.clock = clock;

    if (typeof window === 'undefined') return;

    this.listener = (event: Event) => {
      const deviation = deviationFromMotionEvent(event as MotionEventLike);
      if (deviation === null) return;
      this.sawReading = true;
      if (this.shouldCount && !this.shouldCount()) return;
      const before = this.counter.count;
      this.counter.observeDeviation(deviation, this.clock());
      if (this.counter.count !== before) this.onCount?.(this.counter.count);
    };
    window.addEventListener('devicemotion', this.listener);
  }

  /** Record a pickup the accelerometer did not see. Shares the debounce. */
  notePickup(): void {
    if (this.shouldCount && !this.shouldCount()) return;
    const before = this.counter.count;
    this.counter.notePickup(this.clock());
    if (this.counter.count !== before) this.onCount?.(this.counter.count);
  }

  /** Stops listening and returns the pickup count for this trip. */
  stop(): number {
    if (this.listener && typeof window !== 'undefined') {
      window.removeEventListener('devicemotion', this.listener);
    }
    this.listener = null;
    return this.counter.count;
  }
}
