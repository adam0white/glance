import type { Person } from './hf4.ts';
export type KeeperId = 'dai' | 'callum' | 'bilal';
export const KEEPERS: readonly KeeperId[] = ['dai', 'callum'];
export const ENGINEER = 'engineer';
export const NAMES: Record<KeeperId, string> = { dai: 'Dai', callum: 'Callum', bilal: 'Bilal' };
/** The watch: 22:00 to 06:00. */
export const WATCH_FROM = 22 * 60;
export const WATCH_MINUTES = 8 * 60;

export const dayStart = (m: number) => Math.floor(m / 1440) * 1440;
