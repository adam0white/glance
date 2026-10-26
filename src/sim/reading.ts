/**
 * How a keeper reads a gauge. Accuracy comes from how he is (true body state through HF `readPerson`: sleepiness,
 * capacity, circadian alertness; fear through HF affect; the weather); his spoken confidence comes from how he
 * feels (the same reading of HF's perceived state). The gap between the two is the game: Dai under-feels a debt of
 * sleep decades old, so he sounds sure when he is not.
 *
 * Covers: reading error and its bias by character, the words of confidence, handwriting looseness, and the cause
 * named on the dawn page. Does not cover: lying. A keeper never reports what he believes is false; a skipped walk
 * is reported as the last figure he holds, which he believes is near enough.
 */
import { emotionLevel, estimateQuantity, type Person, readPerson } from '@adam0white/human-framework';
import type { KeeperId } from './keepers.ts';

export interface Clarity {
  /** True clarity 0..1: drives error and handwriting. */
  true: number;
  /** Felt clarity 0..1: drives the words. */
  felt: number;
  fear: number;
  /** The main thing dimming him right now, for the dawn page. */
  cause: 'fresh' | 'sleepy' | 'trough' | 'spent' | 'weather' | 'afraid';
}

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

/** `weather` 0..1: rain and wind at the gauge. */
export function clarityOf(p: Person, weather: number): Clarity {
  const b = readPerson(p).body;
  const fear = emotionLevel(p, 'fear');
  const part = (sleepy: number, fatigue: number) => {
    const s = 1 - 0.75 * clamp((sleepy - 0.45) / 0.55);
    const f = 1 - 0.35 * clamp((fatigue - 0.4) / 0.6);
    return s * f;
  };
  const alert = 0.55 + 0.45 * b.alertness;
  const cap = 0.6 + 0.4 * b.capacity;
  const wx = 1 - 0.3 * weather;
  const scare = 1 - 0.25 * fear;
  const t = clamp(part(b.sleepiness, b.fatigue) * alert * cap * wx * scare);
  // He feels his body as he perceives it, and not the hour: nobody feels the trough, only the sleepiness.
  const f = clamp(
    part(b.perceived.sleepiness, b.perceived.fatigue) * (0.85 + 0.15 * b.capacity) * (1 - 0.15 * weather),
  );
  const dims: [Clarity['cause'], number][] = [
    ['sleepy', 1 - part(b.sleepiness, 0.4)],
    ['spent', 1 - part(0.45, b.fatigue) + (1 - cap)],
    ['trough', 1 - alert],
    ['weather', 1 - wx],
    ['afraid', 1 - scare],
  ];
  dims.sort((a, b2) => b2[1] - a[1]);
  const top = dims[0] as [Clarity['cause'], number];
  return { true: t, felt: f, fear, cause: t > 0.8 ? 'fresh' : top[0] };
}

/** Bias of a reading in metres (negative reads low), by character and state. */
export function biasOf(id: KeeperId, c: Clarity): number {
  // Dai rounds the way he hopes it is: down. Callum reads high because he is frightened of missing it.
  if (id === 'bilal') return 0;
  if (id === 'dai') return -0.32 * (1 - c.true);
  return 0.18 * (1 - c.true) + 0.22 * c.fear;
}

export const errorSd = (c: Clarity) => 0.025 + 0.22 * (1 - c.true);

/** Confidence the keeper puts on a figure (felt clarity, tempered by temperament). */
export function confidenceOf(p: Person, c: Clarity): number {
  const em = p.traits.emotionality;
  return clamp(c.felt * (1.15 - 0.55 * em) - 0.2 * c.fear);
}

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
  if (conf > 0.55) return pick([`I read ${fig}, sir. I’m sure.`, `It's ${fig}. I checked twice.`]);
  if (conf > 0.38)
    return pick([`I read ${fig}, sir. I think it is ${fig}.`, `Is it ${fig}? Yes, I read ${fig}.`]);
  return pick([
    `It's… ${fig}? It could be higher, sir.`,
    `I read ${fig}, or maybe higher. It is hard to see.`,
  ]);
}

/** Extended-watch observation only. Uses the released HF estimate and its felt confidence;
 * host-authored light difficulty, character bias and fear remain local. Consumes HF RNG once
 * for an actual nonzero reading. Never call from render/forecast or for a skipped walk.
 * No truth, body-state number or calibration is returned to player-facing controls.
 */
export function estimateRead(p: Person, who: KeeperId, truth: number, weather: number, scale: number) {
  const c = clarityOf(p, weather);
  const estimate = estimateQuantity(p, { truth, difficulty: 0.35 + 0.35 * weather });
  return {
    value: estimate.value + scale * biasOf(who, c),
    confidence: estimate.confidence * confidenceOf(p, c),
  };
}
