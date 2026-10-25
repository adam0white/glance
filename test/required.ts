/** Preserve fixture assertions with a clear failure before property access. */
export function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error('Required test fixture is missing.');
  return value;
}
