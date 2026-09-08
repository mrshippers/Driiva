/**
 * TESTS: Trip Recording Page - phone pickups reaching the submitted trip
 * =====================================================================
 * ROADMAP TD-2. The detector's own rules are held in
 * phone-pickup-detector.test.ts; this file holds the wiring, which is the part
 * that has silently failed before: on mobile the detector existed for six days
 * while no app code called it, so every trip submitted a pickup count of 0 and
 * phone usage, 10% of the score, returned a perfect 100 for everyone
 * (commit cd35366). These tests drive the real page and assert on what actually
 * reaches `endTrip`. Shares the mock rig in helpers/tripRecordingMocks.tsx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';

import {
  mockEndTrip,
  mockStreamerInstance,
  renderPage,
  resetTripRecordingMocks,
} from './helpers/tripRecordingMocks';

/** Comfortably past DISTURBANCE_THRESHOLD_MPS2, as a handled phone reads. */
const HANDLED_MPS2 = 6;

function dispatchMotion(): void {
  window.dispatchEvent(
    Object.assign(new Event('devicemotion'), {
      acceleration: { x: HANDLED_MPS2, y: 0, z: 0 },
    })
  );
}

/** Hold the phone for `ms`, sampling at the rate a browser delivers. */
async function handlePhoneFor(ms: number): Promise<void> {
  for (let elapsed = 0; elapsed <= ms; elapsed += 100) {
    await act(async () => {
      dispatchMotion();
      await vi.advanceTimersByTimeAsync(100);
    });
  }
}

async function switchAwayFromTab(): Promise<void> {
  Object.defineProperty(document, 'visibilityState', {
    value: 'hidden',
    configurable: true,
  });
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

async function startTrip(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /start trip/i }));
    await vi.advanceTimersByTimeAsync(2500);
  });
}

async function endTripAndReadPickupCount(): Promise<number> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /end trip/i }));
  });
  expect(mockEndTrip).toHaveBeenCalled();
  const input = mockEndTrip.mock.calls[0][1] as { events: { phonePickupCount: number } };
  return input.events.phonePickupCount;
}

describe('Trip Recording Page: phone pickups', () => {
  beforeEach(() => {
    resetTripRecordingMocks();
    mockEndTrip.mockResolvedValue(undefined);
    mockStreamerInstance.stop.mockResolvedValue(12);
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('submits a pickup the accelerometer saw while the driver stayed in the tab', async () => {
    renderPage();
    await startTrip();
    await handlePhoneFor(900);

    expect(await endTripAndReadPickupCount()).toBe(1);
  });

  it('still submits a pickup when the driver switches app, which the motion stream cannot see', async () => {
    renderPage();
    await startTrip();
    await switchAwayFromTab();

    expect(await endTripAndReadPickupCount()).toBe(1);
  });

  it('submits one pickup, not two, when the driver lifts the phone and then switches app', async () => {
    renderPage();
    await startTrip();
    await handlePhoneFor(900);
    await switchAwayFromTab();

    expect(await endTripAndReadPickupCount()).toBe(1);
  });

  it('submits zero when the phone was not touched, without claiming the sensor confirmed it', async () => {
    renderPage();
    await startTrip();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(await endTripAndReadPickupCount()).toBe(0);
  });

  it('does not count handling while the trip is paused, which accumulates no duration to rate it against', async () => {
    renderPage();
    await startTrip();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /pause/i }));
    });
    await handlePhoneFor(900);
    await switchAwayFromTab();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    });

    expect(await endTripAndReadPickupCount()).toBe(0);
  });

  it('releases the motion listener when the trip ends, so it cannot count into the next one', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    renderPage();
    await startTrip();
    await handlePhoneFor(900);
    expect(await endTripAndReadPickupCount()).toBe(1);

    expect(removeSpy).toHaveBeenCalledWith('devicemotion', expect.any(Function));
  });

  it('releases the motion listener when the page unmounts with a trip still open', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderPage();
    await startTrip();
    removeSpy.mockClear();

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('devicemotion', expect.any(Function));
  });

});
