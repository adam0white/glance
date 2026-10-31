import type { Report } from '../sim/dam.ts';
import { readingTime } from './time.ts';

const DIAL_TOP = 1.6;

/** What the weir dial means. It repeats the dial's own range and gives no hidden water figure or warning mark. */
export function weirWords(report: Report | null): string {
  const quarters = report ? Math.round(Math.max(0, Math.min(1, report.value / DIAL_TOP)) * 4) : 0;
  const place = [
    'at the bottom',
    'about a quarter of the way up',
    'about halfway up',
    'about three quarters of the way up',
    'at the top',
  ][quarters];
  return `<p class="hint weir-scale">The weir dial runs from 0 to ${DIAL_TOP} m. A higher figure means more water is coming down toward the dam. ${report ? `The last weir reading, ${report.value.toFixed(2)} m (${readingTime(report)}), sits ${place} of the dial. ` : ''}Nothing on the board marks a safe or a dangerous weir figure. A reading is what a keeper saw, and it may be wrong.</p>`;
}

/** The inn's river stairs, in the words Nerys already uses when she reports a step. */
export function riverStairsWords(): string {
  return 'The inn’s river stairs have five steps. Step 1 is the bottom step, and Nerys says there is nothing to worry about. Mill Lane floods at step 5, the top step. A reading above the steps means water is in the square. A step number is what Nerys saw, and it may be wrong.';
}
