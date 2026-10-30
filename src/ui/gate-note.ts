import type { Report } from '../sim/dam.ts';
import { readingTime } from './time.ts';

/**
 * Compare two received readings by their written times. A report held during a radio outage keeps the time
 * it was written, so the delivery time is not used. The note claims no effect of the gate.
 */
export function gateAfterLevel(level: Report | null | undefined, gate: Report | null | undefined): string {
  if (!level || !gate || gate.wrote <= level.wrote) return '';
  return `<p class="soft gate-after">The newest gate reading is ${readingTime(gate)}. This level reading is ${readingTime(level)}. The level reading may not show what the gate has done since. Ask for a new reading.</p>`;
}
