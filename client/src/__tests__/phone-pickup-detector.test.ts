/**
 * WEB PHONE-PICKUP DETECTION
 * ==========================
 * ROADMAP TD-2. The web trip recorder had one pickup signal, a
 * `visibilitychange` proxy that only fires when the driver leaves the tab, so
 * handling the phone with Driiva still on screen was invisible to a component
 * worth 10% of the score. These tests pin the browser-side accelerometer
 * heuristic that now runs beside it, and the shared debounce that stops one
 * physical episode being counted twice.
 *
 * The heuristic mirrors mobile/lib/phonePickup.ts in shape (threshold, sustain,
 * debounce) but not in units or sample rate, and those two differences are what
 * most of this file exists to hold: DeviceMotion reports m/s^2 rather than g,
 * and browsers deliver samples an order of magnitude faster than expo-sensors'
 * 5 Hz, fast enough that a real pickup dips under the threshold mid-episode.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PhonePickupCounter,
  WebPhonePickupDetector,
  deviationFromMotionEvent,
  DISTURBANCE_THRESHOLD_MPS2,
  MIN_SUSTAINED_MS,
  DEBOUNCE_MS,
  SUSTAIN_GAP_TOLERANCE_MS,
  GRAVITY_MPS2,
} from '@/lib/phonePickup';

/** A deviation comfortably over the threshold, as a handled phone produces. */
const HANDLED = DISTURBANCE_THRESHOLD_MPS2 + 2;
/** A deviation comfortably under it, as a phone resting in a mount produces. */
const RESTING = DISTURBANCE_THRESHOLD_MPS2 - 2;

/** Feed the counter one deviation every `stepMs` for `durationMs`. */
function feed(
  counter: PhonePickupCounter,
  deviation: number,
  fromMs: number,
  durationMs: number,
  stepMs = 16
): number {
  let now = fromMs;
  for (; now <= fromMs + durationMs; now += stepMs) {
    counter.observeDeviation(deviation, now);
  }
  return now;
}

describe('PhonePickupCounter', () => {
  it('counts a disturbance that is held for the full sustain window', () => {
    const counter = new PhonePickupCounter();
    feed(counter, HANDLED, 10_000, MIN_SUSTAINED_MS + 100);
    expect(counter.count).toBe(1);
  });

  it('does not count a spike shorter than the sustain window, which is what a pothole looks like', () => {
    const counter = new PhonePickupCounter();
    feed(counter, HANDLED, 10_000, MIN_SUSTAINED_MS - 200);
    expect(counter.count).toBe(0);
  });

  it('does not count road vibration that never reaches the threshold', () => {
    const counter = new PhonePickupCounter();
    feed(counter, RESTING, 10_000, 30_000);
    expect(counter.count).toBe(0);
  });

  it('survives a dip under the threshold shorter than the gap tolerance, because a real pickup oscillates at browser sample rates', () => {
    const counter = new PhonePickupCounter();
    // 300ms held, a 100ms dip, then 400ms held. Under mobile's rule, which
    // resets on a single quiet sample, this counts nothing at all.
    let now = feed(counter, HANDLED, 10_000, 300);
    now = feed(counter, RESTING, now, SUSTAIN_GAP_TOLERANCE_MS - 100);
    feed(counter, HANDLED, now, 400);
    expect(counter.count).toBe(1);
  });

  it('breaks the episode when the dip outlasts the gap tolerance', () => {
    const counter = new PhonePickupCounter();
    let now = feed(counter, HANDLED, 10_000, 300);
    now = feed(counter, RESTING, now, SUSTAIN_GAP_TOLERANCE_MS + 200);
    feed(counter, HANDLED, now, 400);
    expect(counter.count).toBe(0);
  });

  it('does not treat a gap in the event stream itself as sustained handling', () => {
    // Browsers stop delivering devicemotion to a throttled page. Without this,
    // one above-threshold sample either side of a two-minute pause would read
    // as two minutes of continuous handling.
    const counter = new PhonePickupCounter();
    counter.observeDeviation(HANDLED, 10_000);
    counter.observeDeviation(HANDLED, 130_000);
    expect(counter.count).toBe(0);
  });

  it('meters continuous handling by the debounce rather than counting every sample', () => {
    const counter = new PhonePickupCounter();
    // Ten seconds of unbroken handling: one count on reaching the sustain
    // window, then one per debounce interval after it.
    feed(counter, HANDLED, 10_000, 10_000);
    expect(counter.count).toBe(1 + Math.floor((10_000 - MIN_SUSTAINED_MS) / DEBOUNCE_MS));
  });

  it('counts a visibility-proxy pickup', () => {
    const counter = new PhonePickupCounter();
    counter.notePickup(10_000);
    expect(counter.count).toBe(1);
  });

  it('counts one physical episode once when both signals see it', () => {
    // The driver lifts the phone (accelerometer) and switches app
    // (visibilitychange). Two observations, one act of phone usage.
    const counter = new PhonePickupCounter();
    feed(counter, HANDLED, 10_000, MIN_SUSTAINED_MS + 100);
    expect(counter.count).toBe(1);
    counter.notePickup(10_000 + MIN_SUSTAINED_MS + 200);
    expect(counter.count).toBe(1);
  });

  it('counts a second visibility pickup once the debounce has passed', () => {
    const counter = new PhonePickupCounter();
    counter.notePickup(10_000);
    counter.notePickup(10_000 + DEBOUNCE_MS);
    expect(counter.count).toBe(2);
  });

  it('counts a pickup in the first seconds of a trip rather than waiting out a debounce against the epoch', () => {
    const counter = new PhonePickupCounter();
    counter.notePickup(5);
    expect(counter.count).toBe(1);
  });

  it('reset clears the count and the in-flight episode', () => {
    const counter = new PhonePickupCounter();
    feed(counter, HANDLED, 10_000, 400);
    counter.reset();
    feed(counter, HANDLED, 10_500, 400);
    // 400ms either side of the reset, neither run long enough on its own.
    expect(counter.count).toBe(0);
  });
});

describe('deviationFromMotionEvent', () => {
  it('reads the gravity-free stream directly, where rest is zero', () => {
    expect(deviationFromMotionEvent({ acceleration: { x: 3, y: 4, z: 0 } })).toBeCloseTo(5, 6);
  });

  it('falls back to the gravity-inclusive stream, where rest is one g', () => {
    // Android browsers commonly deliver only this one.
    const atRest = deviationFromMotionEvent({
      acceleration: null,
      accelerationIncludingGravity: { x: 0, y: 0, z: GRAVITY_MPS2 },
    });
    expect(atRest).toBeCloseTo(0, 6);
  });

  it('treats an all-null acceleration as absent rather than as a resting zero', () => {
    const deviation = deviationFromMotionEvent({
      acceleration: { x: null, y: null, z: null },
      accelerationIncludingGravity: { x: 0, y: 0, z: GRAVITY_MPS2 + 5 },
    });
    expect(deviation).toBeCloseTo(5, 6);
  });

  it('returns null when the event carries no usable reading at all', () => {
    expect(deviationFromMotionEvent({})).toBeNull();
    expect(
      deviationFromMotionEvent({ acceleration: null, accelerationIncludingGravity: null })
    ).toBeNull();
  });
});

describe('WebPhonePickupDetector', () => {
  let detector: WebPhonePickupDetector;

  function dispatchMotion(x: number, y: number, z: number): void {
    window.dispatchEvent(
      Object.assign(new Event('devicemotion'), { acceleration: { x, y, z } })
    );
  }

  beforeEach(() => {
    detector = new WebPhonePickupDetector();
  });

  afterEach(() => {
    detector.stop();
  });

  it('reports that it has seen no reading before any event arrives, so a desktop zero is not a measured zero', () => {
    detector.start();
    expect(detector.sawMotionReading).toBe(false);
    expect(detector.count).toBe(0);
  });

  it('records having seen a reading once a usable event arrives', () => {
    detector.start();
    dispatchMotion(0, 0, 0);
    expect(detector.sawMotionReading).toBe(true);
  });

  it('ignores an event with no usable reading', () => {
    detector.start();
    window.dispatchEvent(
      Object.assign(new Event('devicemotion'), {
        acceleration: null,
        accelerationIncludingGravity: null,
      })
    );
    expect(detector.sawMotionReading).toBe(false);
  });

  it('counts a pickup driven through real window events and reports it to the caller', () => {
    const seen: number[] = [];
    let now = 10_000;
    detector = new WebPhonePickupDetector({ onCount: (count) => seen.push(count) });
    detector.start(() => now);
    for (; now <= 10_000 + MIN_SUSTAINED_MS + 100; now += 16) {
      dispatchMotion(HANDLED, 0, 0);
    }
    expect(detector.count).toBe(1);
    expect(seen).toEqual([1]);
  });

  it('stops listening on stop, and stop is safe to call twice', () => {
    let now = 10_000;
    detector.start(() => now);
    for (; now <= 10_000 + 300; now += 16) dispatchMotion(HANDLED, 0, 0);
    expect(detector.stop()).toBe(0);
    for (; now <= 10_000 + 5_000; now += 16) dispatchMotion(HANDLED, 0, 0);
    expect(detector.stop()).toBe(0);
    expect(detector.count).toBe(0);
  });

  it('counts nothing while shouldCount refuses, which is how a paused trip is held out', () => {
    let counting = false;
    let now = 10_000;
    detector = new WebPhonePickupDetector({ shouldCount: () => counting });
    detector.start(() => now);
    for (; now <= 10_000 + 5_000; now += 16) dispatchMotion(HANDLED, 0, 0);
    expect(detector.count).toBe(0);

    counting = true;
    const resumedAt = now;
    for (; now <= resumedAt + MIN_SUSTAINED_MS + 100; now += 16) dispatchMotion(HANDLED, 0, 0);
    expect(detector.count).toBe(1);
  });

  it('still records that a sensor is present while shouldCount refuses, because that is true either way', () => {
    detector = new WebPhonePickupDetector({ shouldCount: () => false });
    detector.start();
    dispatchMotion(0, 0, 0);
    expect(detector.sawMotionReading).toBe(true);
    expect(detector.count).toBe(0);
  });

  it('holds out a visibility pickup too while shouldCount refuses', () => {
    detector = new WebPhonePickupDetector({ shouldCount: () => false });
    detector.start();
    detector.notePickup();
    expect(detector.count).toBe(0);
  });

  it('starts each trip from zero', () => {
    let now = 10_000;
    detector.start(() => now);
    for (; now <= 10_000 + MIN_SUSTAINED_MS + 100; now += 16) dispatchMotion(HANDLED, 0, 0);
    expect(detector.count).toBe(1);
    detector.stop();
    detector.start(() => now);
    expect(detector.count).toBe(0);
  });
});
