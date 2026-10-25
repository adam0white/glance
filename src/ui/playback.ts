import type { GameState } from '../sim/dam.ts';

/** UI playback only. Inspections wait; new radio words get reading time; quiet work runs briskly. */
export function playback(inspecting: boolean, reading: boolean, selectedRate = 1.4, skipping = false) {
  if (inspecting) return { rate: 0, reason: 'Time stops while you look.' };
  if (skipping) return { rate: 6, reason: 'Time speeds up until the next report.' };
  if (reading) return { rate: 0.35, reason: 'Time slows while you read the radio report.' };
  return { rate: selectedRate, reason: '' };
}

/** Observe delivered information, not unseen water state or simulated thought. */
export function eventStamp(s: GameState): string {
  return `${s.said.length}|${JSON.stringify(s.said.at(-1))}|${s.reports.length}|${s.flashes.length}`;
}
