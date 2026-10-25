/** Reject a missing required value before property access. */
export function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error('A required game value is missing.');
  return value;
}
