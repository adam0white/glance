/** HF4 owns quantity error and felt confidence. The host owns scale, light difficulty,
 * rounding and spoken digits; render never asks for a new observation. */
import { estimateQuantity, type Person, readPerson } from './hf4.ts';
import type { KeeperId } from './keepers.ts';
export type Clarity = {
  true: number;
  felt: number;
  fear: number;
  cause: 'fresh' | 'sleepy' | 'trough' | 'spent' | 'weather' | 'afraid' | 'unattributed';
};
const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** "four point three" for 4.3. */
export function spoken(x: number): string {
  const tenths = Math.round(x * 10);
  const a = Math.floor(tenths / 10);
  const b = tenths % 10;
  return `${DIGITS[a] ?? String(a)} point ${DIGITS[b] ?? String(b)}`;
}

/** A weir figure in two places, digit by digit: 1.98 is "one point nine eight", 0.52 "zero point five two". */
export function spokenFine(x: number): string {
  const [a = '0', b = '00'] = Math.max(0, x).toFixed(2).split('.');
  const say = (d: string) => DIGITS[Number(d)] ?? d;
  return `${a.length > 1 ? a : say(a)} point ${[...b].map(say).join(' ')}`;
}

/** The words around a figure, by confidence. Deterministic pick by `k`. */
export function hedge(id: KeeperId, conf: number, fig: string, k: number): string {
  const pick = (xs: string[]) => xs[Math.abs(k) % xs.length] as string;
  if (id === 'bilal') return conf > 0.55 ? `I read ${fig}.` : `I make it about ${fig}. I am not sure.`;
  if (id === 'dai') {
    if (conf > 0.62)
      return pick([
        `I read ${fig}. I’m sure of it.`,
        `I read ${fig}. It looks steady.`,
        `I read ${fig}. It looks fine.`,
      ]);
    if (conf > 0.45)
      return pick([
        `I read ${fig}, or close to it.`,
        `I would call it ${fig}.`,
        `I read approximately ${fig}.`,
      ]);
    return pick([
      `I read ${fig}… I think.`,
      `I read about ${fig}. The flashlight is getting dim.`,
      `I read ${fig}. Wait a moment. Yes, I read ${fig}.`,
    ]);
  }
  if (conf > 0.55) return pick([`I read ${fig}, sir. I’m sure.`, `I checked twice. I read ${fig}.`]);
  if (conf > 0.38)
    return pick([`I read ${fig}, sir. I think it is ${fig}.`, `Is it ${fig}? Yes, I read ${fig}.`]);
  return pick([
    `It's… ${fig}? It could be higher, sir.`,
    `I read ${fig}, or maybe higher. It is hard to see.`,
  ]);
}

/** Public HF body evidence supplies the dawn explanation; no diagnosis is inferred. */
export function clarityOf(p: Person, weather: number): Clarity {
  const b = readPerson(p).body;
  const dims: [Clarity['cause'], number][] = [
    ['sleepy', 0.75 * Math.max(0, (b.sleepiness - 0.45) / 0.55)],
    ['spent', 0.35 * b.fatigue + 0.4 * (1 - b.capacity)],
    ['trough', 0.45 * (1 - b.alertness)],
    ['weather', 0.3 * weather],
  ];
  const trueClarity = dims.reduce((v, [, dim]) => v * (1 - dim), 1);
  dims.sort((a, b) => b[1] - a[1]);
  return {
    true: trueClarity,
    felt: 1 - b.perceived.sleepiness,
    fear: 0,
    cause: trueClarity > 0.8 ? 'fresh' : dims[0]![0],
  };
}

/** A physical shortcut: recent remembered figure, real HF sleepiness and temperament.
 * The caller supplies an independent keyed world draw, never an actor RNG draw. */
export function skipsWalk(p: Person, job: string, age: number, draw: number): boolean {
  if ((job !== 'level' && job !== 'weir') || age < 0 || age >= 90) return false;
  const sleepy = readPerson(p).body.sleepiness;
  const reluctance = Math.max(0, 1 - 0.6 * p.traits.conscientiousness - 0.5 * p.traits.emotionality);
  return sleepy > 0.72 && draw < (sleepy - 0.68) * 2.5 * (job === 'weir' ? 1 : 0.45) * reluctance;
}

/** One reached-instrument observation. HF owns the draw and confidence. The spoken
 * offset varies continuously with HF temperament and current impairment, not name. */
export function estimateRead(p: Person, _who: KeeperId, truth: number, weather: number, scale: number) {
  const c = clarityOf(p, weather);
  const estimate = estimateQuantity(p, { truth, difficulty: 0.35 + 0.35 * weather });
  return {
    ...estimate,
    value: estimate.value + scale * 0.8 * (p.traits.emotionality - 0.5) * (1 - c.true),
    clarity: c.true,
    cause: c.cause,
  };
}
