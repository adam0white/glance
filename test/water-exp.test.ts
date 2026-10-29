import { expect, it } from 'vitest';
import { newGame } from '../src/sim/dam.ts';
import { dexp } from '../src/sim/exp.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';
import { dayWater, newWater } from '../src/sim/water.ts';

it('pins deterministic exp at the divergent operand and bounds error against high precision references', () => {
  // Decimal.exp at 100 decimal digits, rounded to binary64. These are accuracy references,
  // not replay tolerances. The separate browser control compares every field exactly.
  const references = [
    [0, 1],
    [-1e-9, 0.999999999],
    [-0.34657359027997264, Math.SQRT1_2],
    [-1.069453125, 0.34319615150318866],
    [-12, 6.14421235332821e-6],
    [-55.125, 1.146876582225596e-24],
    [-708, 3.307553003638408e-308],
    [-745, Number.MIN_VALUE],
    [-746, 0],
  ] as const;
  expect(dexp(-1.069453125)).toBe(0.3431961515031887);
  for (const [x, reference] of references) {
    expect(Math.abs(dexp(x) - reference)).toBeLessThanOrEqual(
      Math.max(Number.MIN_VALUE, Number.EPSILON * reference),
    );
  }
  const water = newWater();
  water.store = 100;
  dayWater(water, 14);
  expect(water.store).toBe(100 * 6.14421235332821e-6);
});

it('refuses the previous game boundary and exact current-state tampering without changing the file', () => {
  const file = exportCurrent(newGame(7));
  for (const field of ['game', 'state'] as const) {
    const old = structuredClone(file);
    if (field === 'game') old.game = 'glance@3-cast-life';
    else old.state.version = 'glance@3-cast-life';
    const saved = structuredClone(old);
    expect(() => importCurrent(old)).toThrow('older or unsupported version');
    expect(() => importCurrent(old)).toThrow('Keep the file.');
    expect(old).toEqual(saved);
  }
  file.state.water.town = Number.MIN_VALUE;
  const saved = structuredClone(file);
  expect(() => importCurrent(file)).toThrow('does not replay the same way');
  expect(file).toEqual(saved);
});
