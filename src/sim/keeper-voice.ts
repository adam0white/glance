import type { SuggestionResolution } from './actor-view.ts';
import { KEEPERS, type KeeperId } from './keepers.ts';
import { DRAW, hashUnit } from './rng.ts';

const LINES: Record<KeeperId, Record<'assented' | 'complied' | 'cannot', string[]>> = {
  dai: {
    assented: [
      'Yes, I’ll do that.',
      'I’ll do that.',
      'I’m going now.',
      'Yes, I’ll look.',
      'I’m on my way.',
      'That is reasonable.',
    ],
    complied: [
      'I’ll do it if you say so.',
      'You’re in charge at the desk.',
      'Yes. I’ll do it if that’s what you want.',
      'You decide.',
    ],
    cannot: [
      'I can’t. I’m exhausted. Give me twenty minutes.',
      'I can’t do it yet. I have no energy left. Give me twenty minutes.',
    ],
  },
  bilal: {
    assented: ['I can cover a round of gauge readings.'],
    complied: ['I will check, but I need rest afterwards.'],
    cannot: ['I cannot cover that safely yet.'],
  },
  callum: {
    assented: ['I’ll do it, sir.', 'I’m going, sir.', 'I’ll do it now.', 'Yes! I’ll do it.', 'I’ll go now.'],
    complied: ['Yes, I’ll do it, sir.', 'I’ll do it if you think so, sir.', 'OK. OK, I’m going.'],
    cannot: ['I… I can’t, sir. I’m sorry. I need a minute.', 'I’m exhausted, sir. Give me a little time.'],
  },
};

/** Only change the wording of the decision the framework actually made. */
export function keeperAnswer(
  seed: number,
  night: number,
  minute: number,
  id: KeeperId,
  r: SuggestionResolution,
): string {
  const pick = (xs: string[]) =>
    xs[Math.floor(hashUnit(seed, DRAW.words, night, minute, KEEPERS.indexOf(id)) * xs.length)] ?? xs[0] ?? '';
  if (r.verdict === 'assented') return pick(LINES[id].assented);
  if (r.verdict === 'complied') return pick(LINES[id].complied);
  if (r.verdict === 'refused' && r.kind === 'cannot') return pick(LINES[id].cannot);
  if (r.verdict === 'deferred' && /sit by the stove/.test(r.counterOffer?.label ?? ''))
    return id === 'dai'
      ? pick([
          'I can’t do it yet. Let me warm my hands first.',
          'Give me a minute by the stove first.',
          'I’ll do it in a little while. The kettle is nearly boiling.',
        ])
      : pick(['Can I just warm up a minute, sir?', 'Give me two minutes, sir. I’m very cold.']);
  return r.says;
}

/** The caller supplies evidence of an actual involuntary doze during the watch. */
export function keeperReview(
  seed: number,
  night: number,
  id: KeeperId,
  line: string,
  dozedOnWatch: boolean,
): string {
  if (!dozedOnWatch || id === 'bilal') return line.replace(/^Today/, 'Tonight');
  const dai = [
    'I fell asleep by the stove. I know I did.',
    'I shut my eyes for a minute. It was longer than a minute.',
    'I never slept on watch in thirty years. Now look at me.',
    'I fell asleep. Don’t write that in the log.',
    'I slept in the chair. My dad would have scolded me.',
  ];
  const callum = [
    'I fell asleep, sir. I’m sorry. It won’t happen again.',
    'I only sat down for a second.',
    'I fell asleep at once. The baby kept me awake all day.',
  ];
  const xs = id === 'dai' ? dai : callum;
  return xs[(((night + seed) % xs.length) + xs.length) % xs.length] ?? line;
}
