/** SCOPE: initial authored admission only. Public HF performs retained-state mapping.
 * Shelf claims do not suspend or retire the producer. Current outbound custody stays refused. */
import type { PersonAuthoring } from '@adam0white/human-framework';
import type { PortableAdmission } from '@adam0white/human-framework/portable';
import type { LifePreparation, PersonaEnvelope } from '@adam0white/lab-client';
import {
  admitPortablePerson,
  canonicalPersona,
  claimPortablePerson,
  createPersona,
  lifeAdmission,
  portablePersonRole,
  validatePersona,
  validatePortablePerson,
} from '@adam0white/lab-client';
import { type Person, watchOpenings } from './hf4.ts';
export const RULES = 'glance-hf414-1';
export const DIALECT = 'glance-retained/4';
export const OPENING_AT = 900 * 60_000;
export type Chapter = {
  version: typeof DIALECT;
  inputs: LifePreparation[];
  claims: PersonaEnvelope[];
  initial: Record<string, PersonAuthoring>;
  blocked?: { castId: string; reason: string }[];
};
export function admitResident(input: LifePreparation, opening: PersonAuthoring): PersonAuthoring {
  lifeAdmission(input, 'glance');
  portablePersonRole(input.parent, 'glance');
  const portable = validatePortablePerson(input.parent.transfer.portable);
  if (portable.version !== 2) throw Error('This opening requires a complete mapped version2 history.');
  const mapping: PortableAdmission['mapping'] = {
    offsetMs: OPENING_AT - portable.retained.at,
    references: [],
  };
  return admitPortablePerson(input.parent, 'glance', opening, mapping);
}
export async function plannedClaim(input: LifePreparation) {
  const { revision, ...body } = await validatePersona(input.parent);
  return createPersona({
    ...body,
    parentRevision: revision,
    transfer: { ...claimPortablePerson(input.parent, 'glance'), life: input.life },
  });
}
export function chapterSources(chapter: Chapter | null | undefined) {
  return (chapter?.inputs ?? []).map(({ parent }) => ({
    revision: parent.revision,
    source: structuredClone(parent.source),
    snapshot: structuredClone(parent),
  }));
}
export function checkChapter(chapter: Chapter) {
  if (
    chapter.version !== DIALECT ||
    !Array.isArray(chapter.inputs) ||
    !Array.isArray(chapter.claims) ||
    !chapter.initial ||
    typeof chapter.initial !== 'object'
  )
    throw Error('Unsupported chapter.');
  if (
    chapter.inputs.length !== chapter.claims.length ||
    Object.keys(chapter.initial).length !== chapter.inputs.length
  )
    throw Error('Incomplete chapter ownership.');
  const seen = new Set<string>();
  for (const input of chapter.inputs) {
    const role = portablePersonRole(input.parent, 'glance');
    if (seen.has(role) || input.clockMs !== input.life.clock.watermark * 3_600_000)
      throw Error('Invalid chapter input.');
    seen.add(role);
    const initial = chapter.initial[role];
    if (!initial || initial.id !== role || initial.identity.castId !== input.parent.castId)
      throw Error('Invalid chapter actor.');
    const opening = watchOpenings().find((a) => a.id === role);
    if (!opening) throw Error('Missing canonical authored opening.');
    opening.biography = [];
    opening.state.agenda.commitments = [];
    if (canonicalPersona(admitResident(input, opening)) !== canonicalPersona(initial))
      throw Error('Chapter mapping differs.');
    const claim = chapter.claims.find((c) => c.castId === input.parent.castId);
    if (!claim) throw Error('Missing chapter claim.');
    const { revision: _revision, ...body } = claim;
    const { revision: parentRevision, ...parent } = input.parent;
    const expected = {
      ...parent,
      parentRevision,
      // Readonly validation of a recorded SDK receipt. This never authorizes a new write.
      transfer: { ...input.parent.transfer, portableClaim: { game: 'glance' }, life: input.life },
    };
    if (canonicalPersona(body) !== canonicalPersona(expected))
      throw Error('Chapter claim differs from source.');
  }
}
export async function validateChapter(chapter: Chapter | null | undefined) {
  if (!chapter) return;
  checkChapter(chapter);
  for (const input of chapter.inputs) {
    await validatePersona(input.parent);
    const claim = chapter.claims.find((c) => c.castId === input.parent.castId);
    await validatePersona(claim);
  }
}
export async function residentTransfer(_person: Person): Promise<never> {
  throw Error('This watch cannot publish people yet. Download the complete run; no history was published.');
}
export { lifeAdmission };
