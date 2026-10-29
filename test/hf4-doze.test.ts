import { beforeAll, expect, it } from 'vitest';
import { type GameState, newGame, step } from '../src/sim/dam.ts';

// SCOPE: real public physiology may remove its interrupted activity before the
// host reads it. That cannot leave physical work active or invent a posture change.
let state: GameState;
beforeAll(() => {
  state = newGame(7);
  for (let n = 0; n < 480 && state.phase === 'watch' && state.people[0]!.body.doze?.since === undefined; n++)
    step(state);
});
it('records the actual doze boundary, clears stopped work and retains the asleep physical context', () => {
  const p = state.people[0]!,
    since = p.body.doze?.since;
  expect(since).toBeDefined();
  expect(state.keepers[0]!.job).toBeNull();
  expect(state.keepers[0]!.dozes.at(-1)?.from).toBe(since! / 60000);
  const context = structuredClone(p.body.doze?.context);
  for (let n = 0; n < 3; n++) step(state);
  expect(p.body.asleep).toBe(true);
  expect(p.body.doze?.since).toBe(since);
  expect(p.body.doze?.context).toEqual(context);
});
