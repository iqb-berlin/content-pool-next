export function matchesNumericFilter(value: number, rawFilter: string): boolean {
  const filter = rawFilter.trim().replace(/,/g, '.');
  const range = filter.match(/^(-?\d+(?:\.\d+)?)?\s*\.\.\s*(-?\d+(?:\.\d+)?)?$/);
  if (range) {
    const minimum = range[1] === undefined ? -Infinity : Number(range[1]);
    const maximum = range[2] === undefined ? Infinity : Number(range[2]);
    return value >= Math.min(minimum, maximum) && value <= Math.max(minimum, maximum);
  }

  const comparison = filter.match(/^(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/);
  if (comparison) {
    const expected = Number(comparison[2]);
    if (comparison[1] === '>=') return value >= expected;
    if (comparison[1] === '<=') return value <= expected;
    if (comparison[1] === '>') return value > expected;
    return value < expected;
  }

  const expected = Number(filter);
  return Number.isFinite(expected) && value === expected;
}
