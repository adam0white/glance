import { expect, it } from 'vitest';
import { newGame, queueInput, step } from '../src/sim/dam.ts';
import { rotaAvailable, rotaAway, rotaOccupies } from '../src/sim/rota.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';

// SCOPE: input is required; a proposal is not a received/attended agreement.
// Actual both-operator travel/cover/cancel/return are the source-watch controls.
it('adds no rota state on a current watch without a rota input', () => {
  const s = newGame(7);
  for (let n = 0; n < 3; n++) step(s);
  expect(s.outcomes?.rota).toBeUndefined();
  expect(rotaAway(s, 'dai')).toBe(false);
});
it('refuses a reading or departure without the actual source proposal', () => {
  const s = newGame(7);
  for (const task of ['rota-dai-read', 'rota-callum-home', 'rota-return'] as const) {
    expect(rotaAvailable(s, task)).not.toBeNull();
    queueInput(s, { kind: 'outcome', task });
    step(s);
  }
  expect(s.outcomes?.rota?.trips ?? []).toEqual([]);
  expect(exportCurrent(importCurrent(exportCurrent(s)))).toEqual(exportCurrent(s));
});
it('reserves reading occupancy only for Dai and Callum, preserving unrelated Bilal work', () => {
  const s = newGame(7); // Host-only occupancy fixture; never imported or published as actual history.
  s.outcomes!.rota = { offers: [], trips: [], decisions: [], reading: 0 };
  expect(rotaOccupies(s, 'dai')).toBe(true);
  expect(rotaOccupies(s, 'callum')).toBe(true);
  for (const id of ['bilal', 'nerys', 'wren']) expect(rotaOccupies(s, id)).toBe(false);
});
