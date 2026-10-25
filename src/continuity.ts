import { snapshot } from '@adam0white/human-framework';
import type { Lab, LifePreparation, PersonaEnvelope, PersonaLife } from '@adam0white/lab-client';
import {
  anchorPersonaLife,
  canonicalCast,
  claimCastChapterBatch,
  closePersonaBranch,
  createPersona,
  initialPersonaLife,
  type personaChannel,
  validatePersona,
} from '@adam0white/lab-client';
import { ALLOCATION as CAST } from './sim/cast.ts';
import { newGame as createGame, type GameState as State } from './sim/dam.ts';
import { admitResident, type Chapter, DIALECT, RULES, residentTransfer } from './sim/passport.ts';
import { exportCurrent as exportRun, importCurrent as importRun } from './sim/run.ts';

type Shelf = ReturnType<typeof personaChannel>;
type SourceArchive = { revision: string; source: PersonaEnvelope['source']; snapshot: unknown };
export const LOCAL_KEY = 'glance-cast-local-v3';
const maxArchive = 1_000_000;

/** Run-scoped ownership, recording and source archive. No current shelf reads on local load. */
export class Continuity {
  generation = 0;
  heads: PersonaEnvelope[] = [];
  fileOrigin = false;
  busy = false;
  status = 'Browser continuity and lab recording are separate choices.';
  runId = crypto.randomUUID();
  sources: SourceArchive[] = [];
  private key = crypto.randomUUID();
  private operation = Promise.resolve();
  private state: State | null = null;
  constructor(
    readonly lab: Lab,
    readonly shelf: Shelf,
    readonly changed: () => void = () => {},
  ) {
    lab.setPersonaRecording(`startup-${this.key}`);
  }
  source(): PersonaEnvelope['source'] {
    return {
      game: 'glance',
      build: `${String(this.lab.build().c ?? 'local')}.run-${this.runId}`,
      engine: '2.17.0',
      rules: RULES,
    };
  }
  invalidate() {
    this.generation++;
    this.key = crypto.randomUUID();
    this.lab.setPersonaRecording(this.key);
    this.changed();
  }
  clear() {
    this.invalidate();
    this.state = null;
    this.heads = [];
    this.sources = [];
  }
  async fresh(seed: number, localOnly = false) {
    if (this.busy) throw new Error('A chapter is already being prepared.');
    this.busy = true;
    this.invalidate();
    const generation = this.generation;
    try {
      await this.shelf.ready;
      if (generation !== this.generation)
        throw new Error('The game changed before the histories could be loaded.');
      const base = createGame(seed);
      let chapter: Chapter | undefined;
      if (this.shelf.enabled && !localOnly) {
        const result = await claimCastChapterBatch(
          this.shelf,
          CAST.map((c) => c.castId),
          this.source(),
          async (inputs: LifePreparation[]) => {
            const initial = Object.fromEntries(
              base.people.map((p) => [CAST.find((c) => c.id === p.id)!.castId, structuredClone(p)]),
            );
            for (const input of inputs) {
              const opening = initial[input.parent.castId];
              if (!opening) throw new Error('This person is not part of this game.');
              initial[input.parent.castId] = admitResident(input, opening);
            }
            return initial;
          },
          { isCurrent: () => generation === this.generation },
        );
        if (result)
          chapter = {
            version: DIALECT,
            initial: result.initial,
            inputs: result.inputs,
            claims: result.claims,
          };
      }
      if (generation !== this.generation) throw new Error('The game changed. The new chapter did not start.');
      const state = createGame(seed, chapter);
      this.state = state;
      this.runId = crypto.randomUUID();
      this.sources = [];
      this.heads = chapter?.claims ?? [];
      this.fileOrigin = false;
      this.status = chapter
        ? `The game loaded ${chapter.inputs.length} matching ${chapter.inputs.length === 1 ? 'history' : 'histories'} after checking all five people together. The other people start with their original histories.`
        : localOnly
          ? 'A new local chapter has started. The histories saved in this browser are unchanged.'
          : 'A new chapter has started with the original people. No saved histories were carried over.';
      // Caller installs the prepared state before opening any recording hook.
      return state;
    } finally {
      this.busy = false;
    }
  }
  async validateRunEnvelopes(state: State) {
    if (state.chapter)
      await Promise.all(
        [...state.chapter.claims, ...state.chapter.inputs.map((i) => i.parent)].map((p) =>
          validatePersona(p),
        ),
      );
  }
  async loadLocal(text: string) {
    this.invalidate();
    const generation = this.generation;
    const saved = JSON.parse(text);
    const state = importRun(saved.run);
    await this.validateRunEnvelopes(state);
    if (
      typeof saved.runId !== 'string' ||
      typeof saved.fileOrigin !== 'boolean' ||
      !Array.isArray(saved.heads) ||
      saved.heads.length > 8 ||
      !Array.isArray(saved.sources) ||
      JSON.stringify(saved.sources).length > maxArchive
    )
      throw new Error('The local ownership records or saved source data are invalid. Start a new game.');
    const heads = await Promise.all(saved.heads.map((p: unknown) => validatePersona(p)));
    if (
      new Set(heads.map((p) => p.castId)).size !== heads.length ||
      heads.some(
        (p) =>
          !CAST.some((c) => c.castId === p.castId) ||
          p.source.game !== 'glance' ||
          p.source.rules !== RULES ||
          !(
            state.chapter?.claims.some((c) => c.revision === p.revision) || p.transfer.hostRun === saved.runId
          ),
      )
    )
      throw new Error('This ownership record belongs to another game.');
    if (generation !== this.generation) throw new Error('The game changed while it was loading.');
    this.state = state;
    this.runId = saved.runId;
    this.heads = heads;
    this.fileOrigin = saved.fileOrigin;
    this.sources = saved.sources;
    this.status =
      'The local chapter was restored with its saved people and their last accepted ownership records. No newer browser histories were loaded.';
    return state;
  }
  async importFile(text: string) {
    this.invalidate();
    const generation = this.generation;
    const raw = JSON.parse(text);
    const state = importRun(raw);
    await this.validateRunEnvelopes(state);
    const sources = raw.castSources ?? [];
    if (!Array.isArray(sources) || JSON.stringify(sources).length > maxArchive)
      throw new Error('Source archive is too large.');
    if (generation !== this.generation) throw new Error('The game changed while the file was loading.');
    this.state = state;
    this.heads = [];
    this.runId = crypto.randomUUID();
    this.sources = sources;
    this.fileOrigin = true;
    this.status =
      'The game was loaded from a file. It does not take ownership of the people saved in that file. Your menu choice controls recording and links between games.';
    return state;
  }
  localSave(state: State) {
    return JSON.stringify({
      run: exportRun(state),
      runId: this.runId,
      fileOrigin: this.fileOrigin,
      heads: this.heads,
      sources: this.sources,
    });
  }
  export(state: State) {
    return { ...(exportRun(state) as object), castSources: structuredClone(this.sources) };
  }
  pinnedHistories() {
    const group = new Map((this.state?.chapter?.claims ?? []).map((p) => [`${p.castId}/${p.branchId}`, p]));
    for (const p of this.heads) group.set(`${p.castId}/${p.branchId}`, p);
    return [...group.values()].sort((a, b) =>
      `${a.castId}/${a.branchId}`.localeCompare(`${b.castId}/${b.branchId}`),
    );
  }

  /** Legacy binding only. Recording and linkage follow the shared menu preference. */
  async recording(_allow = false) {
    this.lab.setPersonaRecording(this.key);
  }
  async deny() {
    // Historical callers cannot create a separate continuing-person recording choice.
  }

  async setEnabled(value: boolean) {
    this.invalidate();
    await this.shelf.ready;
    this.shelf.setEnabled(value);
    this.status =
      'Your choice about carrying people between games has changed. This loaded chapter keeps its saved people. Only a new chapter can load browser histories.';
  }
  checkpoint(castId: string, fork = false) {
    const generation = this.generation,
      state = this.state,
      runId = this.runId;
    const task = this.operation.then(async () => {
      const current = () => generation === this.generation && state === this.state && runId === this.runId;
      if (
        !state ||
        !current() ||
        !state.inputs.some((input) => input.kind !== 'pause' && input.kind !== 'resume') ||
        state.minute <= 1320 ||
        (!state.chapterPaused &&
          state.people.find((p) => p.id === CAST.find((c) => c.castId === castId)?.id)?.body.alive !== false)
      )
        throw new Error(
          'Play the game, then pause the chapter after the current work finishes before saving a person.',
        );
      await this.shelf.ready;
      if (!current() || !this.shelf.enabled)
        throw new Error('Carrying people between games is off, or the game has changed.');
      const person = state.people.find((p) => p.id === CAST.find((c) => c.castId === castId)?.id);
      const villager = person ? { person, name: person.name } : null;
      if (!villager || !CAST.some((c) => c.castId === castId))
        throw new Error('This person is not part of this game.');
      const parent = this.heads.find((p) => p.castId === castId);
      let envelope: PersonaEnvelope;
      let raw: unknown;
      if (!villager.person.body.alive) {
        if (!parent)
          throw new Error('This game does not own a living history for this person that it can close.');
        if (parent.terminal) return;
        raw = snapshot(villager.person);
        const closed = await closePersonaBranch(parent, this.source(), villager.person.now);
        const { revision: _revision, ...body } = closed;
        envelope = await createPersona({ ...body, transfer: { ...body.transfer, hostRun: runId } });
      } else {
        if (
          state.phase !== 'end' &&
          !(villager.person.id === 'nerys' && state.chapterPaused && state.nerys.ringing === null)
        )
          throw new Error(
            'Work and family duties still keep this person here. Finish the storm week before they leave.',
          );
        const captured = await residentTransfer(villager.person);
        raw = captured.raw;
        const branchId = fork ? crypto.randomUUID() : (parent?.branchId ?? crypto.randomUUID());
        const life =
          !fork && parent?.transfer.life
            ? anchorPersonaLife(parent.transfer.life as PersonaLife, castId, Date.now())
            : initialPersonaLife(castId, branchId, Date.now());
        envelope = await createPersona({
          format: 'hf-persona/1',
          castId,
          castRevision: canonicalCast(castId).revision,
          branchId,
          parentRevision: fork ? null : (parent?.revision ?? null),
          source: this.source(),
          transfer: { ...captured.transfer, life, hostRun: runId },
          limitations: captured.limitations,
        });
      }
      if (!current()) throw new Error('The game changed before this history could be saved.');
      // Preserve full actual source before publication, including failed CAS attempts, local only.
      if (raw) {
        this.sources.push({ revision: envelope.revision, source: envelope.source, snapshot: raw });
        while (JSON.stringify(this.sources).length > maxArchive) this.sources.shift();
        this.changed();
      }
      if (!current()) throw new Error('The game changed before this history could be saved.');
      await this.shelf.request({
        action: 'put',
        envelope,
        fork,
        authored: !fork && !parent && !this.fileOrigin && !state.chapter?.inputs.length,
      });
      if (!current()) return;
      this.heads = [...this.heads.filter((p) => p.castId !== castId), envelope].sort((a, b) =>
        a.castId.localeCompare(b.castId),
      );
      this.key = crypto.randomUUID();
      this.lab.setPersonaRecording(this.key);
      this.status = `${villager.name}: ${envelope.terminal ? 'The end of this history was saved' : 'This point in the history was saved'}. Data that other games cannot use stays in the local export.`;
      this.changed();
      await this.recording();
    });
    this.operation = task.catch(() => {});
    return task;
  }
  async checkpointAll() {
    for (const c of CAST) {
      try {
        await this.checkpoint(c.castId);
      } catch (error) {
        this.status = String(error);
      }
    }
    this.changed();
  }
}

/** Only browser-person continuity changes cancel a pending chapter. Recording does not. */
export function watchShelfPreference(invalidate: () => void, events: EventTarget = window): () => void {
  const stored = (event: Event) => {
    const key = (event as StorageEvent).key;
    if (key === null || key === 'hf-persona-opt-in') invalidate();
  };
  events.addEventListener('hf-persona-preference', invalidate);
  events.addEventListener('storage', stored);
  return () => {
    events.removeEventListener('hf-persona-preference', invalidate);
    events.removeEventListener('storage', stored);
  };
}
