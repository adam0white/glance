/** Optional closing-log arithmetic from recorded outcomes. No person is scored. */
import type { GameState } from '../sim/dam.ts';

export function tallyBody(s: GameState): string {
  if (s.phase !== 'end') return '';
  const held = s.dawns.filter((d) => !d.overtopped).length;
  const lane = s.dawns.filter((d) => !d.overtopped && d.mill !== 'flooded').length;
  const caught = s.dawns.reduce((n, d) => n + d.misses.filter((m) => m.caught).length, 0);
  return `<section aria-label="Closing tally"><h3>Closing tally: ${held + lane + caught}</h3><p>The dam held on ${held} ${held === 1 ? 'night' : 'nights'}. Mill Lane stayed dry or was warned in time on ${lane} ${lane === 1 ? 'night' : 'nights'}. You caught ${caught} wrong ${caught === 1 ? 'reading' : 'readings'}. These add up to ${held + lane + caught}.</p><p class="soft">This tally counts the desk’s results. It does not rate the people. Each recorded night counts once in each night total. A night when water came over the top of the dam counts in neither total.</p></section>`;
}
