/**
 * World randomness keyed by what it is for, the night and the minute (pattern from HF's The Night Watch and the
 * sibling game The Pass). Every world draw is a pure function of the seed and its key, so a replay with one input
 * removed sees the same storm, the same lightning and the same tree on the screen.
 */

/** A 32-bit mix of integers (murmur3's finaliser over each). */
export function mixSeed(...xs: number[]): number {
  let h = 0x9e3779b9;
  for (const x of xs) {
    h = Math.imul(h ^ (x | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h | 0;
}

/** A uniform draw in [0, 1) from integers alone. */
export function hashUnit(...xs: number[]): number {
  return (mixSeed(...xs) >>> 0) / 4294967296;
}

/** A standard normal draw (Box-Muller over two keyed uniforms). */
export function hashNormal(...xs: number[]): number {
  const u = Math.max(1e-9, hashUnit(...xs, 1));
  const v = hashUnit(...xs, 2);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** What a world draw is for. Each kind is its own stream. */
export const DRAW = {
  rain: 1,
  burst: 2,
  lightning: 3,
  readError: 4,
  skip: 5,
  doze: 6,
  nerys: 7,
  radio: 8,
  tree: 9,
  strain: 10,
  gate: 11,
  timeSlip: 12,
  words: 13,
} as const;
