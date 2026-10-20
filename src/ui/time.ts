import { clock, type Report } from '../sim/dam.ts';

/** His written reading time is evidence, not a correction from the hidden simulation clock. */
export const readingTime = (r: Report): string => `read ${clock(r.wrote)} (as written)`;
