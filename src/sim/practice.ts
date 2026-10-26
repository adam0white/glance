/** A separate practice branch. Replays pinned actual history up to this watch, then asks HF for an
 * alternative opening gate setting. It never mutates the source, acquires shelf ownership or records play.
 * An alternative request can be refused; it does not promise an alternative gate position.
 */
import { type GameState, planOf, queueInput, replay, step, watchFrom } from './dam.ts';
export function practiceNight(actual: GameState, turns: number): GameState {
  if (actual.phase === 'watch' || !Number.isInteger(turns) || turns < 0 || turns > 6)
    throw new Error('Finish the watch before trying it again for practice.');
  const start = watchFrom(actual.night);
  const prior = actual.inputs.filter((i) => i.at < start);
  const branch = replay(actual.seed, prior, start, actual.chapter ?? undefined, actual.rules);
  if (branch.phase !== 'watch' || branch.night !== actual.night)
    throw new Error('The pinned opening of this watch could not be replayed.');
  queueInput(branch, { kind: 'ask', keeper: planOf(branch).keepers[0] ?? 'dai', job: 'gate', target: turns });
  while (branch.phase === 'watch') step(branch);
  return branch;
}
