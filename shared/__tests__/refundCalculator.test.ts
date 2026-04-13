import { describe, it, expect } from 'vitest';
import {
  blendedScore,
  refundRate,
  calculateRefundCents,
  projectedRefundCents,
} from '../refundCalculator';

describe('blendedScore', () => {
  it('weights 80% personal, 20% community', () => {
    expect(blendedScore(100, 100)).toBe(100);
    expect(blendedScore(0, 0)).toBe(0);
    expect(blendedScore(80, 60)).toBe(80 * 0.8 + 60 * 0.2); // 76
  });

  it('handles edge values', () => {
    expect(blendedScore(100, 0)).toBe(80);
    expect(blendedScore(0, 100)).toBe(20);
  });
});

describe('refundRate', () => {
  it('returns 5% at score 50', () => {
    expect(refundRate(50)).toBeCloseTo(0.05);
  });

  it('returns 15% at score 100', () => {
    expect(refundRate(100)).toBeCloseTo(0.15);
  });

  it('interpolates linearly between 50 and 100', () => {
    expect(refundRate(75)).toBeCloseTo(0.10);
  });

  it('clamps below 50 to 5%', () => {
    expect(refundRate(0)).toBeCloseTo(0.05);
    expect(refundRate(30)).toBeCloseTo(0.05);
  });

  it('clamps above 100 to 15%', () => {
    expect(refundRate(120)).toBeCloseTo(0.15);
  });
});

describe('calculateRefundCents', () => {
  const premiumCents = 60000; // £600
  const contributionCents = 60000;
  const communityScore = 75;

  it('returns 0 when personal score < 70', () => {
    expect(calculateRefundCents(69, communityScore, contributionCents, 0.85, premiumCents)).toBe(0);
    expect(calculateRefundCents(0, communityScore, contributionCents, 0.85, premiumCents)).toBe(0);
  });

  it('returns positive refund when personal score >= 70', () => {
    const result = calculateRefundCents(85, communityScore, contributionCents, 0.85, premiumCents);
    expect(result).toBeGreaterThan(0);
  });

  it('never exceeds 15% of premium (hard cap)', () => {
    const maxCap = Math.round(premiumCents * 0.15);
    const result = calculateRefundCents(100, 100, premiumCents * 10, 1.0, premiumCents);
    expect(result).toBeLessThanOrEqual(maxCap);
  });

  it('scales with safety factor', () => {
    const fullFactor = calculateRefundCents(85, communityScore, contributionCents, 1.0, premiumCents);
    const halfFactor = calculateRefundCents(85, communityScore, contributionCents, 0.5, premiumCents);
    expect(fullFactor).toBeGreaterThan(halfFactor);
  });

  it('returns integer cents (no fractional pennies)', () => {
    const result = calculateRefundCents(83, communityScore, 12345, 0.87, premiumCents);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('higher score = higher refund', () => {
    const low = calculateRefundCents(75, communityScore, contributionCents, 0.85, premiumCents);
    const high = calculateRefundCents(95, communityScore, contributionCents, 0.85, premiumCents);
    expect(high).toBeGreaterThan(low);
  });

  it('returns 0 for zero contribution', () => {
    expect(calculateRefundCents(90, communityScore, 0, 0.85, premiumCents)).toBe(0);
  });

  // Deterministic audit: known input → known output
  it('produces deterministic result for audit reference', () => {
    // personal=85, community=75 → blended=83 → rate=0.05+((83-50)/50)*0.10=0.116
    // raw = 60000 * 0.116 * 0.85 = 5916 → cap = 9000 → min(5916, 9000) = 5916
    const result = calculateRefundCents(85, 75, 60000, 0.85, 60000);
    expect(result).toBe(5916);
  });
});

describe('projectedRefundCents', () => {
  it('uses default community=75 and safety=0.85', () => {
    const result = projectedRefundCents(85, 60000);
    const expected = calculateRefundCents(85, 75, 60000, 0.85, 60000);
    expect(result).toBe(expected);
  });

  it('returns 0 for ineligible score', () => {
    expect(projectedRefundCents(60, 60000)).toBe(0);
  });
});
