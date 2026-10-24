import {
  admitCalendarPersona,
  DEFAULT_NORMS,
  isContinuingCommitment,
  type Person,
  projectCalendarPersona,
  restore,
  snapshot,
  validateCalendarPersona,
} from '@adam0white/human-framework';
import {
  canonicalCast,
  canonicalPersona,
  type LifePreparation,
  lifeAdmission,
  type PersonaEnvelope,
  preparePersonaLife,
} from '@adam0white/lab-client';
import { ALLOCATION as CAST } from './cast.ts';

export const RULES = 'glance-3';
export const DIALECT = 'glance-cast/1';
export const MAPPING = 'glance-calendar/1';
export type Chapter = {
  version: typeof DIALECT;
  inputs: LifePreparation[];
  claims: PersonaEnvelope[];
  initial: Record<string, Person>;
};
const same = (a: unknown, b: unknown) => canonicalPersona(a) === canonicalPersona(b);
const identity = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, key]));
const supportedActions = new Set(['rest', 'eat', 'drink', 'sleep']);

/** Finite Commonstead Nerys and native Glance maps. No clinical or duty waiver. */
export function admitResident(input: LifePreparation, opening: Person): Person {
  const p = input.parent;
  const cast = canonicalCast(p.castId);
  if (
    !CAST.some((c) => c.castId === p.castId) ||
    CAST.find((c) => c.castId === p.castId)?.id !== opening.id ||
    p.castRevision !== cast.revision ||
    p.terminal
  )
    throw new Error('Unsupported identity, edition or closed branch.');
  if (!same(preparePersonaLife(p, input.clockMs).life, input.life))
    throw new Error('Pinned life result differs.');
  const peerRole = ['hf.cast.dai.glance', 'hf.cast.nerys.glance'].includes(p.castId) ? p.castId : null;
  const forwarded = p.source.game === 'glance' && p.source.rules === RULES;
  const peer =
    ((p.source.game === 'commonstead' && p.source.rules === 'commonstead-3') || forwarded) &&
    p.transfer.castPassport === 'commonstead-cast/1' &&
    peerRole &&
    p.transfer.sourceRole === peerRole;
  const native =
    p.source.game === 'glance' &&
    p.source.rules === RULES &&
    p.transfer.castPassport === DIALECT &&
    p.transfer.sourceRole === opening.id;
  if (!peer && !native)
    throw new Error('No registered Glance semantic adapter for this source. Export or start fresh locally.');
  if (peer && opening.id === 'dai')
    throw new Error(
      'Commonstead archive does not certify current dam operating skills. Use Nerys or fresh local play.',
    );
  const portable = validateCalendarPersona(p.transfer.person);
  const sourceId = peer ? String(peerRole) : opening.id;
  const mapping = peer ? 'commonstead-calendar/1' : MAPPING;
  if (
    portable.person.mappingVersion !== mapping ||
    portable.person.source.id !== sourceId ||
    portable.person.source.engine !== '2.17.0' ||
    portable.person.name !== cast.name
  )
    throw new Error('Source role, mapping, engine or name differs.');
  const receipt = p.transfer.checkpoint as Record<string, unknown> | undefined;
  if (
    !receipt ||
    receipt.schema !== portable.person.source.schema ||
    receipt.sourceMinute !== portable.person.source.now ||
    !same(receipt.rng, portable.person.rng) ||
    typeof receipt.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(receipt.sha256)
  )
    throw new Error('Missing full-source checkpoint receipt.');
  if (portable.calendar.norms.some((norm) => !DEFAULT_NORMS.some((known) => same(known, norm))))
    throw new Error('Unknown norm meanings.');
  if (
    [...portable.calendar.commitments, ...portable.calendar.owed].some((c) =>
      [...c.actions, ...(c.violatedBy ?? [])].some((a) => !supportedActions.has(a)),
    )
  )
    throw new Error('A source obligation has no supported action here. Keep it at source.');
  const target = restore(snapshot(opening));
  const shifted = structuredClone(portable);
  const offset = target.now - portable.person.source.now;
  shifted.calendar.offset = offset;
  for (const c of shifted.calendar.commitments) {
    c.from += offset;
    c.until += offset;
    if (c.recurUntil !== undefined) c.recurUntil += offset;
    if (c.exempt) c.exempt.at += offset;
  }
  for (const d of shifted.calendar.owed) {
    d.at += offset;
    if (d.lapseSince !== undefined) d.lapseSince += offset;
  }
  if (shifted.calendar.lapse) shifted.calendar.lapse.since += offset;
  const age = portable.person.source.now - portable.person.life.bornAt;
  if (age < cast.age * 525600) throw new Error('Canonical age provenance differs.');
  target.life.bornAt = portable.person.life.bornAt + offset;
  target.body.fitness = portable.person.health.fitness;
  target.body.circadianPeak = portable.person.health.circadianPeak;
  // Retain health only through HF's strict compatible-body check; never heal a source condition.
  if (peer) {
    const skills = Object.keys(shifted.person.skills);
    shifted.person.skills = {};
    if (skills.length)
      shifted.person.limitations.push(
        `Commonstead skills stay in source archive: ${skills.join(', ')}. No dam qualification inferred.`,
      );
  }
  const hostCommitments = target.agenda.commitments;
  target.agenda.commitments = [];
  const admitted = admitCalendarPersona(shifted, target, {
    mappingVersion: mapping,
    sourceId,
    targetId: opening.id,
    targetNorms: DEFAULT_NORMS,
  }).person;
  if (hostCommitments.some((c) => admitted.agenda.commitments.some((other) => other.id === c.id)))
    throw new Error('Source and target duty calendars overlap.');
  admitted.agenda.commitments.push(...hostCommitments);
  return admitted;
}

export function checkChapter(chapter: Chapter) {
  if (
    chapter.version !== DIALECT ||
    !Array.isArray(chapter.inputs) ||
    chapter.inputs.length > 8 ||
    !Array.isArray(chapter.claims) ||
    chapter.claims.length !== chapter.inputs.length ||
    new Set(chapter.inputs.map((i) => i.parent.castId)).size !== chapter.inputs.length ||
    !same(Object.keys(chapter.initial).sort(), CAST.map((c) => c.castId).sort())
  )
    throw new Error('Invalid complete initial cast.');
  for (const input of chapter.inputs) {
    const claim = chapter.claims.find((p) => p.castId === input.parent.castId);
    if (
      !claim ||
      claim.terminal ||
      claim.castRevision !== input.parent.castRevision ||
      claim.branchId !== input.parent.branchId ||
      claim.parentRevision !== input.parent.revision ||
      claim.source.game !== 'glance' ||
      claim.source.engine !== '2.17.0' ||
      claim.source.rules !== RULES ||
      !same(claim.transfer, { ...input.parent.transfer, life: input.life })
    )
      throw new Error('Invalid pinned claim.');
  }
}

/** Capture an actual idle boundary. Full source stays local; shelf carries only finite projection. */
export async function residentTransfer(person: Person) {
  const retained = person.agenda.commitments.filter((c) => isContinuingCommitment(person.agenda, c));
  const owed = person.agenda.owed ?? [];
  const projection = projectCalendarPersona(person, {
    version: MAPPING,
    skills: identity(Object.keys(person.skills)),
    calendar: {
      version: 'hf-persona-calendar-map/1',
      offset: 0,
      sourceNorms: DEFAULT_NORMS,
      references: {
        commitments: identity([
          ...retained.flatMap((c) => [c.id, ...(c.makeUpOf ? [c.makeUpOf] : [])]),
          ...owed.flatMap((d) => [d.ofId, ...(d.scheduledAs ? [d.scheduledAs] : [])]),
        ]),
        chains: identity(retained.flatMap((c) => (c.chain ? [c.chain] : []))),
        actions: identity([
          ...retained.flatMap((c) => [...c.actions, ...(c.violatedBy ?? [])]),
          ...owed.flatMap((d) => [...d.actions, ...(d.violatedBy ?? [])]),
        ]),
        entities: identity(retained.flatMap((c) => [c.toId, c.targetId].filter((x): x is string => !!x))),
        norms: identity(DEFAULT_NORMS.map((n) => n.id)),
      },
    },
  });
  const raw = snapshot(person);
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalPersona(raw)))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  return {
    raw,
    transfer: {
      castPassport: DIALECT,
      sourceRole: person.id,
      person: projection,
      checkpoint: {
        schema: person.schema,
        sourceMinute: person.now,
        rng: structuredClone(person.rng),
        sha256,
      },
    },
    limitations: [
      ...projection.person.limitations,
      'Dam geometry, weather, source tasks, fictional discoveries, source social memories and transient body/needs remain in the full source archive. Zero-duration calendar adaptation is not travel, healing, payment or qualification.',
    ],
  };
}
export { lifeAdmission };
