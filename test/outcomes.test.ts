import { expect, it } from 'vitest';
import { newGame, queueInput, step } from '../src/sim/dam.ts';
import { outcomeAvailable } from '../src/sim/outcomes.ts';

// SCOPE: no disclosure-only outcome. The source-watch proof executes the real
// twenty-minute joint transfer, later independent test and signed filing/rest.
it('gives no handover/test/correction credit before disclosure, choices and elapsed work', () => {
  const s = newGame(7);
  for (const task of ['handover', 'handover-test', 'correction'] as const) {
    expect(outcomeAvailable(s, task)).toBe(false);
    queueInput(s, { kind: 'outcome', task });
    step(s);
  }
  expect(s.outcomes?.handover.transferredAt).toBeUndefined();
  expect(s.outcomes?.handover.completedAt).toBeUndefined();
  expect(s.outcomes?.correction.filedAt).toBeUndefined();
  expect(s.outcomes?.correction.restedAt).toBeUndefined();
});
