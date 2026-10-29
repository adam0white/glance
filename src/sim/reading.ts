/** HF4 owns quantity error and felt confidence. The host owns scale, light difficulty,
 * rounding and spoken digits; render never asks for a new observation. */
import { estimateQuantity, type Person } from './hf4.ts';
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
      `I read about ${fig}. I am not sure.`,
      `I read ${fig}. Wait a moment. Yes, I read ${fig}.`,
    ]);
  }
  if (conf > 0.55) return pick([`I read ${fig}, sir. I’m sure.`, `That is what I read: ${fig}.`]);
  if (conf > 0.38)
    return pick([`I read ${fig}, sir. I think it is ${fig}.`, `Is it ${fig}? Yes, I read ${fig}.`]);
  return pick([
    `It's… ${fig}? It could be higher, sir.`,
    `I read ${fig}, or maybe higher. It is hard to see.`,
  ]);
}

/** One real reached-instrument observation. No host cognitive calibration or RNG. */
export function estimateRead(p: Person, _who: KeeperId, truth: number, weather: number, _scale: number) {
  return estimateQuantity(p, { truth, difficulty: 0.35 + 0.35 * weather });
}
