import { expect, it } from 'vitest';
import { newGame, queueInput, step } from '../src/sim/dam.ts';
import { callumAway, daiAway, keeperSceneAvailable } from '../src/sim/keeper-scenes.ts';

// SCOPE: honest unopened contracts. Actual authored proposals/attendance and
// interruptions are exercised once in the current fixed-seed source proof.
it('keeps daughter permission, presence and old signed correction separate', () => {
  const s = newGame(7);
  for (const task of ['daughter-visit', 'daughter-return', 'dai-proposal', 'callum-proposal'] as const) {
    expect(keeperSceneAvailable(s, task)).toBe(false);
    queueInput(s, { kind: 'outcome', task });
    step(s);
  }
  expect(daiAway(s)).toBe(false);
  expect(callumAway(s)).toBe(false);
  expect(s.outcomes?.keeperScenes).toBeUndefined();
  expect(s.outcomes?.correction.filedAt).toBeUndefined();
});
