import { describe, expect, it } from 'vitest';
import { matchesNumericFilter } from './numeric-filter.util';

describe('matchesNumericFilter', () => {
  it('supports decimal commas on both range boundaries', () => {
    expect(matchesNumericFilter(0, '-0,5..0,5')).toBe(true);
    expect(matchesNumericFilter(1, '-0,5..0,5')).toBe(false);
  });

  it('supports open and reversed ranges', () => {
    expect(matchesNumericFilter(-1, '..0')).toBe(true);
    expect(matchesNumericFilter(1, '0,5..')).toBe(true);
    expect(matchesNumericFilter(0, '1..-1')).toBe(true);
  });

  it('supports comparisons and exact values', () => {
    expect(matchesNumericFilter(1, '>= 1')).toBe(true);
    expect(matchesNumericFilter(1, '<1')).toBe(false);
    expect(matchesNumericFilter(-0.25, '-0,25')).toBe(true);
  });
});
