/** Canonical content revision 1. Complete profiles come from the published shared cast artifact.
 * Supports bounded, invited conversations, not qualifications, free reading of secrets, or travel admission.
 */
import { createPerson, MINUTES_PER_YEAR, type Person, type PersonSpec } from '@adam0white/human-framework';
import { canonicalCast, castForGame } from '@adam0white/lab-client';
import type { GameState } from './dam.ts';

export type CastId = 'dai' | 'callum' | 'nerys' | 'bilal' | 'wren';
export const CAST = {
  dai: {
    castId: 'hf.cast.dai.glance',
    name: 'Dai',
    age: 63,
    role: 'Dam keeper, thirty-one years here. Separated; his adult daughter lives nearby.',
  },
  callum: {
    castId: 'hf.cast.callum.glance',
    name: 'Callum',
    age: 24,
    role: 'Agency keeper, second week. His partner and baby are at home.',
  },
  nerys: {
    castId: 'hf.cast.nerys.glance',
    name: 'Nerys',
    age: 47,
    role: 'Bridge Inn keeper. She and her long-term partner run the inn; her river reports are observations from the steps.',
  },
  bilal: {
    castId: 'hf.cast.bilal.rope',
    name: 'Bilal',
    age: 41,
    role: 'Visiting maintenance technician. A five-day portable-lamp repair contract, with family leave and travel arranged from the Coast. Married, with a stepchild. No gate or dam-engineering authority.',
  },
  wren: {
    castId: 'hf.cast.wren.rope',
    name: 'Wren',
    age: 29,
    role: 'Visiting field ecologist from the Coast, on a five-day downstream survey with access agreed. An older sibling remains at home. No control-room engineering authority.',
  },
} as const;
export function canonicalSpec(id: CastId): Pick<PersonSpec, 'traits' | 'values'> {
  const canonical = canonicalCast(CAST[id].castId);
  if (!castForGame('glance').some((c) => c.castId === canonical.castId))
    throw new Error('Unallocated identity');
  return { traits: structuredClone(canonical.traits), values: structuredClone(canonical.values) };
}
export function makeVisitor(id: 'nerys' | 'bilal' | 'wren', seed: number, now: number): Person {
  const c = CAST[id];
  return createPerson({
    id,
    name: c.name,
    seed: seed ^ c.age,
    now,
    bornAt: now - c.age * MINUTES_PER_YEAR,
    sex: id === 'bilal' ? 'male' : 'female',
    ...canonicalSpec(id),
  });
}

/** Availability is operational, not permission to inspect somebody's private material. */
export function lifeReady(s: GameState, id: CastId): boolean {
  const firstRole = id === 'dai' ? 1320 : id === 'callum' ? 4200 : 2760;
  return !s.life[id] || !!s.life[id]?.availableForExtraWork || s.minute >= firstRole + 30;
}
export function discoveriesFor(s: GameState): CastId[] {
  if (s.phase !== 'watch' || s.radioOut) return [];
  return (Object.keys(CAST) as CastId[]).filter((id) => {
    if (!lifeReady(s, id)) return false;
    if (s.discoveries[id]) return false;
    if (id === 'nerys') return s.night >= 2 && s.nerys.ringing === null && s.nerys.goodwill >= 0.35;
    if (id === 'bilal' || id === 'wren')
      return s.night >= 2 && s.minute % 1440 >= 22 * 60 && s.minute % 1440 < 23 * 60 && s.water.level < 5;
    const k = s.keepers.find((k) => k.id === id);
    const p = s.people.find((p) => p.id === id);
    return (
      !!k?.on &&
      (!k.job || k.job.job === 'stove') &&
      !k.pending &&
      !k.deferred &&
      (!p?.activity || p.activity.affordanceId === 'stove') &&
      (p?.will.voices.find((v) => v.voiceId === 'engineer')?.trust ?? 0) >= 0.35
    );
  });
}
const invitations: Record<CastId, string> = {
  dai: 'There are checks I never wrote down. Ask me again when I have had a quiet minute; not while I am at the wheel.',
  callum: 'Could we talk about the round record? Give me a minute to get the words straight.',
  nerys:
    'That folded stand by the stairs? Mine. Let me finish with the river first; you can ask again later.',
  bilal:
    'The little folding lamp is mine, separate from the repairs. Ask later if there is a quiet minute. I may just want my tea.',
  wren: 'You can ask about my survey notes. Give me time to decide what I am willing to discuss.',
};
const discoveries: Record<CastId, string> = {
  dai: 'My handover list has a workaround for a sensor we replaced years ago. Callum needs the list, with that uncertainty written beside it. Not another rule to obey because I said so.',
  callum:
    'Before this week I signed a round after checking only part of it. Nothing happened that I know of. I need to correct the record through the proper channel, not cancel it with extra checks. The baby has kept me awake too. I need a safe rest arrangement, not another test of nerve.',
  nerys:
    'It is my telescope stand. I have three dark corners round the inn and a notebook, even for nights I saw nothing. I do not advertise it. Clear skies are not a service I can promise. My partner can cover while I take a look another evening.',
  bilal:
    'My stepchild and I make shadow animals. This is meant to be a heron. The goat is terrible. You can hold the lamp if you like; this is play, not part of the contract. I will send the new shape home after the shift.',
  wren: 'I left an ambiguous observation out of a preliminary report. I kept the field page. Here is what I actually saw, and what I cannot conclude from it. I will append it through the survey process. It does not tell you how to run the dam.',
};
/** The player's remembered disclosure, never a biography granted by opening a file. */
export function rememberedConversation(s: GameState, id: CastId): string | null {
  return s.discoveries[id] ? discoveries[id] : null;
}
export function talk(s: GameState, id: CastId): void {
  if (!Object.hasOwn(CAST, id)) return;
  if (!discoveriesFor(s).includes(id)) {
    s.said.push({
      at: s.minute,
      who: 'narrator',
      kind: 'journal',
      text: `${CAST[id].name} is not available for a private conversation. I left it there.`,
    });
    return;
  }
  const first = s.conversations[id];
  if (first === undefined) {
    s.conversations[id] = s.minute;
    s.said.push({ at: s.minute, who: id, kind: 'answer', text: invitations[id] });
  } else if (s.minute - first >= 20) {
    s.discoveries[id] = true;
    s.said.push({ at: s.minute, who: id, kind: 'answer', text: discoveries[id] });
  } else {
    s.said.push({ at: s.minute, who: id, kind: 'answer', text: 'Not yet. Please give me a quiet minute.' });
  }
}

export const ALLOCATION = Object.entries(CAST).map(([id, c]) => ({
  ...canonicalCast(c.castId),
  id: id as CastId,
}));
