/**
 * The two keepers as HF people. Who they are lives in the PersonSpec, a habit and two commitments; the game reads
 * them back through HF (predict, decide, bodyForecast, readPerson, perceive, reviewLine) and keeps no parallel
 * model of their minds. Their characters come from the wildcard consult (Gwen, docs/design.md).
 */
import { createPerson, MINUTES_PER_YEAR, type Person, promise } from '@adam0white/human-framework';

import { canonicalSpec } from './cast.ts';

export type KeeperId = 'dai' | 'callum';
export const KEEPERS: readonly KeeperId[] = ['dai', 'callum'];
export const ENGINEER = 'engineer';
export const NAMES: Record<KeeperId, string> = { dai: 'Dai', callum: 'Callum' };

/** The watch: 22:00 to 06:00. */
export const WATCH_FROM = 22 * 60;
export const WATCH_MINUTES = 8 * 60;

export const dayStart = (m: number) => Math.floor(m / 1440) * 1440;

export function makeKeeper(id: KeeperId, seed: number, now: number): Person {
  const d = dayStart(now);
  let p: Person;
  if (id === 'dai') {
    // Thirty-one years on this dam, most of them nights. Sleeps badly in the day and has for decades: a chronic
    // debt he no longer feels. "I'm grand."
    p = createPerson({
      id,
      name: NAMES[id],
      seed: seed ^ 0xda1,
      now,
      bornAt: now - 63 * MINUTES_PER_YEAR,
      sex: 'male',
      ...canonicalSpec(id),
      lexicon: { plainEnglish: true },
      skills: { gate: 0.9, gauges: 0.9 },
      body: { sleepDebt: 8, fitness: 0.55 },
      voices: [{ voiceId: ENGINEER, trust: 0.45 }],
      enable: { fatigueStore: true, review: { style: 'accounting', at: 7 * 60 } },
    });
    p.habits.push({
      cue: { placeId: 'dam' },
      action: 'level',
      strength: 0.55,
      repetitions: 9000,
      lastAt: now,
    });
  } else {
    // Agency, second week. A baby at home. Frightened of being the one who missed it; will do anything you say.
    p = createPerson({
      id,
      name: NAMES[id],
      seed: seed ^ 0xca1,
      now,
      bornAt: now - 24 * MINUTES_PER_YEAR,
      sex: 'male',
      ...canonicalSpec(id),
      lexicon: { plainEnglish: true },
      skills: { gate: 0.4, gauges: 0.5 },
      body: { sleepDebt: 4, fitness: 0.75 },
      voices: [{ voiceId: ENGINEER, trust: 0.75 }],
      enable: { fatigueStore: true, review: { style: 'ruminating', at: 7 * 60 } },
    });
  }
  // Both hold the keeper's own line: I don't sleep on the watch.
  promise(p, {
    kind: 'abstain',
    toId: ENGINEER,
    label: 'my watch',
    actions: [],
    violatedBy: ['sleep'],
    from: d + WATCH_FROM,
    until: d + WATCH_FROM + WATCH_MINUTES - 30,
    importance: 0.5,
    recurEvery: 1440,
  });
  return p;
}
