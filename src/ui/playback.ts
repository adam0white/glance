import type { GameState } from '../sim/dam.ts';

/** UI playback only. Inspections wait; new radio words get reading time; quiet work runs briskly. */
export function playback(inspecting: boolean, reading: boolean, selectedRate = 1.4) {
  if (inspecting) return { rate: 0, reason: 'Reading the desk · time waits' };
  if (reading) return { rate: 0.35, reason: 'Reading the radio log' };
  return { rate: selectedRate, reason: 'The night carries on' };
}

/** Observe delivered information, not unseen water state or simulated thought. */
export function eventStamp(s: GameState): string {
  return `${s.said.length}|${JSON.stringify(s.said.at(-1))}|${s.reports.length}|${s.flashes.length}`;
}
