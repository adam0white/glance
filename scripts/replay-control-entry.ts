/** Shared entry for the dev and production-minified technical replay control. */
import { type Input, PLANS, replay } from '../src/sim/dam.ts';
import { dexp } from '../src/sim/exp.ts';
import { exportCurrent } from '../src/sim/run.ts';
import { bridgeOf, rainAt } from '../src/sim/water.ts';

export { exportCurrent, importCurrent } from '../src/sim/run.ts';
export function controlRun(control: { seed: number; inputs: Input[]; until: number }) {
  const sample = (until: number) => {
    const s = replay(
      control.seed,
      control.inputs.filter((input) => input.at <= until),
      until,
    );
    return { minute: s.minute, water: s.water, bridge: bridgeOf(s.water) };
  };
  const tuesday = PLANS[1];
  if (!tuesday) throw new Error('Missing Tuesday storm');
  return {
    ex: exportCurrent(replay(control.seed, control.inputs, control.until)),
    numeric: [0, -1e-9, -0.34657359027997264, -1.069453125, -12, -55.125, -708, -745, -746].map(dexp),
    rain: rainAt(7, 2, 123, tuesday.storm),
    samples: [sample(2884), sample(3077)],
  };
}
