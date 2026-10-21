/** Optional closing-log arithmetic from recorded outcomes. No person is scored. */
import type { GameState } from '../sim/dam.ts';

export function tallyBody(s: GameState): string {
  if (s.phase !== 'end') return '';
  const held = s.dawns.filter((d) => !d.overtopped).length;
  const lane = s.dawns.filter((d) => !d.overtopped && d.mill !== 'flooded').length;
  const caught = s.dawns.reduce((n, d) => n + d.misses.filter((m) => m.caught).length, 0);
  return `<section aria-label="Closing tally"><h3>Closing tally: ${held + lane + caught}</h3><p>${held} nights the dam held + ${lane} nights Mill Lane stayed dry or was warned in time + ${caught} wrong figures caught = ${held + lane + caught}.</p><p class="soft">The game’s own reckoning of the desk’s record, not a measure of people. Each recorded night counts once in each night total; an overtopped night counts in neither.</p></section>`;
}
