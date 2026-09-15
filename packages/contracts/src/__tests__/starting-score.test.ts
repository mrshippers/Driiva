import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  STARTING_SCORE,
  STARTING_SCORE_COPY,
  scoreWeight,
  isProvisionalScore,
} from '../starting-score';
import { buildProvisionedUserDoc } from '../../../../functions/src/utils/provisionUser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const ts = { seconds: 1_770_000_000, nanoseconds: 0 };

function provisioned() {
  return buildProvisionedUserDoc({
    uid: 'uid-1',
    email: 'driver@example.com',
    displayName: 'Test Driver',
    isAdmin: false,
    now: ts as never,
  });
}

describe('starting score', () => {
  // Keith's scope doc assumed 70 and the code now writes 70. The explainer
  // quotes this constant, so this test is what stops the number users read
  // drifting away from the number provisioning writes.
  it('is exactly what provisioning writes into a new profile', () => {
    expect(provisioned().drivingProfile.currentScore).toBe(STARTING_SCORE);
  });

  it('is 70, and this test exists so changing it is a deliberate act', () => {
    expect(STARTING_SCORE).toBe(70);
  });

  // 70 only means anything if the first trip can move it EITHER WAY. At 100 it
  // could only fall, which is what made a new profile feel like a score to
  // defend rather than a position to improve from.
  it('lets the first trip move the score up as well as down', () => {
    const seeded = scoreWeight(0);
    const after = (trip: number) => (STARTING_SCORE * seeded + trip) / (seeded + 1);
    expect(after(90)).toBeGreaterThan(STARTING_SCORE);
    expect(after(50)).toBeLessThan(STARTING_SCORE);
    expect(after(70)).toBe(STARTING_SCORE);
  });

  it('lets real driving outweigh the starting position over time', () => {
    expect(scoreWeight(0)).toBe(1);
    expect(scoreWeight(19)).toBe(20);
  });

  it('matches every factor of the provisioned score breakdown', () => {
    const breakdown = provisioned().drivingProfile.scoreBreakdown;
    for (const value of Object.values(breakdown)) {
      expect(value).toBe(STARTING_SCORE);
    }
  });

  it('is provisional only while no trip has been scored', () => {
    expect(isProvisionalScore(0)).toBe(true);
    expect(isProvisionalScore(1)).toBe(false);
    expect(isProvisionalScore(42)).toBe(false);
  });

  it('quotes the real number in the copy users read', () => {
    expect(STARTING_SCORE_COPY.short).toContain(String(STARTING_SCORE));
    expect(STARTING_SCORE_COPY.long).toContain(String(STARTING_SCORE));
  });

  // The copy says the first trip is AVERAGED with the starting score. If the
  // trigger ever went back to replacing it, the copy would quietly become a
  // lie, so the claim is pinned against the trigger's own source.
  it('the copy claim matches the trigger: first trip averages, it does not replace', () => {
    // The trigger is split across sibling modules; the claim is pinned against
    // all of them so it follows the code rather than one file path.
    const trigger = [
      'functions/src/triggers/trips.ts',
      'functions/src/triggers/tripSideEffects.ts',
      'functions/src/triggers/tripFinalisation.ts',
      'functions/src/triggers/driverProfile.ts',
    ]
      .map((rel) => readFileSync(path.join(REPO_ROOT, rel), 'utf8'))
      .join('\n');
    expect(trigger).toMatch(/scoreWeight\(user\.drivingProfile\.totalTrips\)/);
    expect(trigger).not.toMatch(/oldWeight\s*===\s*0\s*\n?\s*\?\s*trip\.score/);
    expect(STARTING_SCORE_COPY.long).toMatch(/averaged with it/);
  });

  it('never promises the score can be protected or maintained', () => {
    const all = `${STARTING_SCORE_COPY.short} ${STARTING_SCORE_COPY.long}`.toLowerCase();
    for (const forbidden of ['protect', 'maintain', 'keep your']) {
      expect(all).not.toContain(forbidden);
    }
  });
});
