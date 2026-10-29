import type {
  Lab,
  LifeBatchPreparation,
  LifePreparation,
  PersonaEnvelope,
  PersonaLife,
  PersonaRequest,
} from '@adam0white/lab-client';
import {
  anchorPersonaLife,
  canonicalCast,
  canonicalPersona,
  claimCastChapterBatch,
  closePersonaBranch,
  createPersona,
  initialPersonaLife,
  type personaChannel,
  validatePersona,
} from '@adam0white/lab-client';
import { digestBytes, encodeText, safeFile } from './file-admission.ts';
import { checkPreparation, PreparationStore, prepareRecord, type Reservation } from './preparation-store.ts';
import { ALLOCATION as CAST } from './sim/cast.ts';
import type { GameState as State, WatchRules } from './sim/dam.ts';
import { displayJournal } from './sim/display.ts';
import {
  FRAMEWORK_VERSION,
  journalWatch,
  restoreWatch,
  type WatchArchive,
  watchOpenings,
} from './sim/hf4.ts';
import {
  admitResident,
  type Chapter,
  chapterSources,
  DIALECT,
  plannedClaim,
  RULES,
  residentTransfer,
} from './sim/passport.ts';
import { exportCurrent as exportRun, importCurrent as importRun } from './sim/run.ts';
import { CandidateValidation } from './validation.ts';

type Shelf = ReturnType<typeof personaChannel>;
type SourceArchive = { revision: string; source: PersonaEnvelope['source']; snapshot: unknown };
export const LOCAL_KEY = 'glance-cast-local-v3';
// Native archive capacity is serialized JSON UTF-16 code units, as on local load/import.
const maxArchive = 1_000_000;

export { fileEntry } from './entry.ts';

/** Run-scoped ownership, recording and source archive. No current shelf reads on local load. */
export class Continuity {
  inspectionChanged = () => {};
  private validation = new CandidateValidation(() => this.inspectionChanged());
  generation = 0;
  heads: PersonaEnvelope[] = [];
  fileOrigin = false;
  busy = false;
  status = 'Browser continuity and lab recording are separate choices.';
  runId: string = crypto.randomUUID();
  sources: SourceArchive[] = [];
  private key = crypto.randomUUID();
  private operation = Promise.resolve();
  private state: State | null = null;
  private preparation: Reservation | undefined;
  readonly preparations = new PreparationStore();
  constructor(
    readonly lab: Lab,
    private readonly channel: Shelf | undefined,
    readonly changed: () => void = () => {},
    readonly fileSession = false,
  ) {
    if (!fileSession && !channel) throw new Error('Native continuity requires a Shelf.');
    if (!fileSession) lab.setPersonaRecording(`startup-${this.key}`);
  }
  get shelf(): Shelf {
    if (this.fileSession || !this.channel) throw new Error('File sessions cannot use browser continuity.');
    return this.channel;
  }
  private nativeOnly() {
    if (this.fileSession) throw new Error('File sessions cannot publish or replace browser histories.');
  }
  private original: { text: string; sha256: string } | null = null;
  private provenance: unknown = null;

  source(): PersonaEnvelope['source'] {
    return {
      game: 'glance',
      build: `${String(this.lab.build().c ?? 'local')}.run-${this.runId}`,
      engine: FRAMEWORK_VERSION,
      rules: RULES,
    };
  }
  invalidate() {
    this.validation.cancel();
    this.generation++;
    this.key = crypto.randomUUID();
    if (!this.fileSession) this.lab.setPersonaRecording(this.key);
    this.changed();
  }
  clear() {
    this.nativeOnly();
    this.invalidate();
    this.validation.clear();
    this.state = null;
    this.heads = [];
    this.sources = [];
    this.preparation = undefined;
  }
  private currentNative() {
    // The title can have a saved run without an installed in-memory state.
    if (typeof localStorage !== 'undefined') return localStorage.getItem(LOCAL_KEY);
    return this.state ? this.localSave(this.state) : null;
  }
  private async nativeBasis(text: string | null): Promise<Reservation['basis']> {
    if (text === null) return null;
    const native = safeFile(text);
    return { runId: native.runId, sha256: await digestBytes(encodeText(text)) };
  }
  private activeNative() {
    return this.state ? this.localSave(this.state) : undefined;
  }
  private async basisGuard(basis: Reservation['basis'], readCurrent: () => string | null) {
    const saved = readCurrent();
    const active = this.activeNative();
    const matches =
      canonicalPersona(await this.nativeBasis(saved)) === canonicalPersona(basis) &&
      (active === undefined || canonicalPersona(await this.nativeBasis(active)) === canonicalPersona(basis));
    // Digest completion is not a live-byte check. Invoke this synchronous guard after
    // the final await, immediately before installation or dispatch, without another await.
    return () => matches && readCurrent() === saved && this.activeNative() === active;
  }
  async pendingPreparations(readCurrent = () => this.currentNative()) {
    const current = readCurrent();
    const basis = await this.nativeBasis(current);
    const active = this.state ? await this.nativeBasis(this.localSave(this.state)) : undefined;
    const installedId = current === null ? undefined : safeFile(current).preparation?.id;
    return (await this.preparations.list()).filter(
      (record) =>
        record.id !== installedId &&
        canonicalPersona(record.basis) === canonicalPersona(basis) &&
        (active === undefined || canonicalPersona(record.basis) === canonicalPersona(active)),
    );
  }
  async fresh(seed: number, localOnly = false, rules?: WatchRules) {
    this.nativeOnly();
    if (this.busy) throw new Error('A chapter is already being prepared.');
    this.busy = true;
    this.invalidate();
    const generation = this.generation;
    const operation = Symbol('fresh-validation');
    try {
      await this.shelf.ready;
      if (!localOnly && generation === this.generation && !this.shelf.enabled) {
        this.shelf.setEnabled(true);
        await this.shelf.ready;
      }
      const current = () => generation === this.generation;
      if (!current()) throw Error('The game changed before the histories could be loaded.');
      let chapter: Chapter | undefined;
      let reservation: Reservation | undefined;
      const runId = crypto.randomUUID();
      const source = { ...this.source(), build: `${String(this.lab.build().c ?? 'local')}.run-${runId}` };
      const basis = await this.nativeBasis(this.currentNative());
      const accepted = new Map<string, { initial: Chapter['initial'][string]; claim: PersonaEnvelope }>();
      let candidate: State | undefined;
      if (this.shelf.enabled && !localOnly) {
        // An unreadable inventory is not an empty inventory.
        const unresolved = await this.preparations.list();
        if (unresolved.some((record) => record.phase !== 'acknowledged'))
          throw Error(
            'A saved prepared opening needs its claim checked first. Your current watch is unchanged.',
          );
        this.status = 'Checking saved people and preparing the complete opening…';
        this.changed();
        let batch: LifeBatchPreparation | undefined;
        const staged: { kind: 'local-planning-only'; request?: PersonaRequest } = {
          kind: 'local-planning-only',
        };
        // This adapter only plans. Its local return is NOT a transport acknowledgement.
        // No shelf write occurs until the full returned SDK result has been durably prepared.
        const plan = await claimCastChapterBatch(
          {
            request: async <T>(request: PersonaRequest): Promise<T> => {
              if (request.action === 'prepareBatch') {
                const value = await this.shelf.request<LifeBatchPreparation>(request);
                const ids = CAST.map((c) => c.castId).sort();
                if (
                  canonicalPersona(Object.keys(value.expectedHeads).sort()) !== canonicalPersona(ids) ||
                  value.inputs.some(
                    (input, index) =>
                      !ids.includes(input.parent.castId) ||
                      value.inputs.findIndex((other) => other.parent.castId === input.parent.castId) !==
                        index ||
                      value.expectedHeads[input.parent.castId] !== input.parent.revision,
                  ) ||
                  Object.values(value.expectedHeads).some(
                    (head) => head !== null && !/^[a-f0-9]{64}$/.test(head),
                  )
                )
                  throw Error('The saved source heads are stale or incompatible.');
                batch = structuredClone(value);
                return value as T;
              }
              if (request.action !== 'putBatch' || staged.request)
                throw Error('Unsupported planning operation.');
              staged.request = structuredClone(request);
              return undefined as T;
            },
          },
          CAST.map((c) => c.castId),
          source,
          async (inputs) =>
            Object.fromEntries(
              inputs.map((input) => {
                const actor = accepted.get(input.parent.castId);
                if (!actor) throw Error('Missing admitted actor.');
                return [actor.initial.id, actor.initial];
              }),
            ),
          {
            isCurrent: current,
            admitPerson: async (input) => {
              const opening = watchOpenings().find(
                (a) => CAST.find((c) => c.id === a.id)?.castId === input.parent.castId,
              );
              if (!opening) throw Error('No canonical Glance role.');
              opening.biography = [];
              opening.state.agenda.commitments = [];
              const initial = admitResident(input, opening);
              const claim = await plannedClaim(input);
              if (!current()) throw Error('The game changed during actor admission.');
              await this.validation.create(
                seed,
                { version: DIALECT, inputs: [input], claims: [claim], initial: { [initial.id]: initial } },
                rules,
                operation,
              );
              if (!current()) throw Error('The game changed during actor validation.');
              accepted.set(input.parent.castId, { initial, claim });
            },
          },
        );
        if (!staged.request || !batch || !current()) throw Error('The game changed during planning.');
        if (plan) {
          // Pin the complete public SDK blocked list, including its early ownership refusals.
          chapter = {
            version: DIALECT,
            inputs: plan.inputs,
            claims: plan.claims,
            initial: plan.initial,
            blocked: plan.blocked,
          };
          if (
            canonicalPersona(plan.claims) !==
            canonicalPersona(plan.inputs.map((input) => accepted.get(input.parent.castId)!.claim))
          )
            throw Error('SDK claim differs from planned public claim.');
        }
        candidate = await this.validation.create(seed, chapter, rules, operation);
        if (!current()) throw Error('The game changed during preparation.');
        if (chapter?.inputs.length) {
          const native = JSON.stringify({
            run: exportRun(candidate),
            runId,
            fileOrigin: false,
            heads: chapter.claims,
            sources: chapterSources(chapter),
          });
          reservation = await prepareRecord({
            id: crypto.randomUUID(),
            generation,
            source,
            expectedHeads: batch.expectedHeads,
            candidate: native,
            basis,
          });
          reservation = await this.preparations.commit(reservation);
          if (!current()) throw Error('Preparation cancelled. The complete reserved opening remains saved.');
          const request = staged.request;
          if (
            canonicalPersona(request.envelopes) !== canonicalPersona(chapter.claims) ||
            canonicalPersona(request.expectedHeads) !== canonicalPersona(reservation.expectedHeads)
          )
            throw Error('SDK claim differs from durable preparation.');
          // Exact IDB compare/write grants one dispatcher. The unknown marker precedes CAS.
          reservation = await this.preparations.transition(reservation, 'unknown');
        }
        const canSend = await this.basisGuard(basis, () => this.currentNative());
        if (!current() || !canSend()) {
          if (reservation) await this.preparations.transition(reservation, 'prepared');
          throw Error('Preparation cancelled before its claim.');
        }
        try {
          // This is the only real transport call. Local SDK staging did not acknowledge it.
          await this.shelf.request(staged.request);
        } catch (error) {
          this.status = reservation
            ? 'The prepared opening remains saved. Its claim needs checking; your current watch is unchanged.'
            : String(error);
          throw error;
        }
        if (reservation) reservation = await this.preparations.transition(reservation, 'acknowledged');
      }
      if (!current())
        throw Error('The game changed. The prepared opening remains saved; the current watch is unchanged.');
      const state = candidate ?? (await this.validation.create(seed, undefined, rules, operation));
      const canInstall = await this.basisGuard(basis, () => this.currentNative());
      if (!current() || !canInstall()) throw Error('The current watch changed before the new watch started.');
      this.validation.keep(state);
      this.state = state;
      this.runId = runId;
      this.sources = chapterSources(chapter);
      this.heads = chapter?.claims ?? [];
      this.preparation = reservation;
      this.fileOrigin = false;
      const refused = chapter?.blocked ?? [];
      const reasons = refused.map((x) => x.reason).join('; ');
      this.status = chapter?.inputs.length
        ? `${chapter.inputs.length} saved ${chapter.inputs.length === 1 ? 'person continues' : 'people continue'} in this prepared opening. ${refused.length ? `Could not carry: ${reasons}. Their local roles start fresh.` : 'Other roles keep their authored local histories.'} No other game's chapter was closed.`
        : refused.length
          ? `Saved people could not be carried: ${reasons}. The local people start fresh.`
          : 'A new chapter has started with the original people. No saved histories were carried over.';
      return state;
    } finally {
      this.validation.cancel(operation);
      this.busy = false;
    }
  }
  async recoverPrepared(id: string, readCurrent = () => this.currentNative()) {
    this.nativeOnly();
    const generation = this.generation;
    const operation = Symbol('recovery-validation');
    try {
      let record = await this.preparations.read(id);
      const current = async () => {
        const guard = await this.basisGuard(record.basis, readCurrent);
        return () => {
          if (generation !== this.generation) throw Error('Recovery cancelled.');
          if (!guard())
            throw Error(
              'The current watch differs from this prepared opening’s prior native context. Keep the current watch.',
            );
        };
      };
      (await current())();
      const native = JSON.parse(record.candidate);
      await this.validation.load(native, undefined, operation);
      (await current())();
      if (record.phase === 'prepared') {
        // A historical prepared row is not current SDK permission to make an arrival write.
        for (const input of native.run.state.chapter.inputs as LifePreparation[]) {
          try {
            const claim = await plannedClaim(input);
            if (
              canonicalPersona(claim) !==
              canonicalPersona(
                native.heads.find((head: PersonaEnvelope) => head.castId === input.parent.castId),
              )
            )
              throw Error('The pinned claim differs from the public SDK claim.');
          } catch (error) {
            throw Error(`${canonicalCast(input.parent.castId).name}: ${String(error)}`);
          }
        }
        (await current())();
        record = await this.preparations.transition(record, 'unknown');
        try {
          (await current())();
        } catch (error) {
          // Only this exact dispatch token/revision can revert its still-unsent marker.
          await this.preparations.transition(record, 'prepared');
          throw error;
        }
        await this.shelf.request({
          action: 'putBatch',
          envelopes: native.heads,
          expectedHeads: record.expectedHeads,
        });
        record = await this.preparations.transition(record, 'acknowledged');
      } else if (record.phase === 'unknown') {
        const snapshot = await this.shelf.request<LifeBatchPreparation>({
          action: 'prepareBatch',
          castIds: CAST.map((c) => c.castId),
        });
        const expected = { ...record.expectedHeads };
        for (const claim of native.heads as PersonaEnvelope[]) expected[claim.castId] = claim.revision;
        if (canonicalPersona(snapshot.expectedHeads) !== canonicalPersona(expected))
          throw Error(
            'The exact prepared claims are not confirmed. Keep both histories; this opening remains saved.',
          );
        (await current())();
        record = await this.preparations.transition(record, 'acknowledged');
      }
      (await current())();
      return await this.loadLocal(JSON.stringify({ ...native, preparation: record }), () =>
        this.basisGuard(record.basis, readCurrent),
      );
    } finally {
      this.validation.cancel(operation);
    }
  }
  async loadLocal(text: string, recoveryTarget?: () => Promise<() => boolean>) {
    this.nativeOnly();
    this.invalidate();
    const generation = this.generation;
    const operation = Symbol('native-validation');
    try {
      const state = await this.validation.native(
        text,
        (message) => {
          this.status = message;
          this.changed();
        },
        operation,
      );
      const canInstall = recoveryTarget ? await recoveryTarget() : undefined;
      if (canInstall && !canInstall())
        throw Error('The current watch changed before recovery could install. Keep the current watch.');
      if (generation !== this.generation) throw Error('The game changed while it was loading.');
      const saved = this.validation.nativeContext(state);
      if (!saved) throw Error('Invalid native provenance.');
      this.validation.keep(state);
      this.state = state;
      this.runId = saved.runId;
      this.heads = structuredClone(saved.heads);
      this.fileOrigin = saved.fileOrigin;
      this.sources = structuredClone(saved.sources);
      this.preparation = saved.preparation;
      this.status = 'The complete local watch was restored. No newer browser histories were loaded.';
      return state;
    } finally {
      this.validation.cancel(operation);
    }
  }
  async importFile(text: string) {
    if (this.fileSession) return this.importSession(text, this.beginFileSelection());
    this.invalidate();
    const generation = this.generation;
    const operation = Symbol('native-file-validation');
    try {
      const state = await this.validation.load(
        JSON.parse(text),
        (message) => {
          this.status = message;
          this.changed();
        },
        operation,
      );
      if (generation !== this.generation) throw Error('The game changed while the file was loading.');
      this.validation.keep(state);
      this.state = state;
      this.heads = structuredClone(state.chapter?.claims ?? []);
      this.sources = chapterSources(state.chapter);
      this.preparation = undefined;
      this.runId = crypto.randomUUID();
      this.fileOrigin = true;
      return state;
    } finally {
      this.validation.cancel(operation);
    }
  }
  private selection = 0;
  beginFileSelection() {
    if (!this.fileSession) throw Error('Use the file entry to choose a saved file.');
    this.validation.cancel();
    return ++this.selection;
  }
  isFileSelection(selection: number) {
    return this.fileSession && selection === this.selection;
  }
  private requireSelection(selection: number) {
    if (!this.isFileSelection(selection)) throw Error('A newer file selection replaced this one.');
  }
  async importSelected(buffer: ArrayBuffer, selection: number) {
    this.requireSelection(selection);
    const bytes = new Uint8Array(buffer);
    if (bytes.byteLength > 16 * 1024 * 1024) throw Error('File exceeds complete import capacity.');
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    encodeText(text);
    await digestBytes(bytes);
    this.requireSelection(selection);
    return this.importSession(text, selection);
  }
  private async importSession(text: string, selection: number) {
    this.requireSelection(selection);
    const generation = this.generation;
    const operation = Symbol('file-session-validation');
    try {
      const state = await this.validation.file(
        text,
        (message) => {
          this.status = message;
          this.changed();
        },
        operation,
      );
      this.requireSelection(selection);
      if (generation !== this.generation) throw Error('The game changed while the file was loading.');
      const context = this.validation.fileContext(state);
      if (!context) throw Error('Invalid file provenance.');
      this.validation.keep(state);
      this.invalidate();
      this.state = state;
      this.original = structuredClone(context.original);
      this.provenance = structuredClone(context.provenance);
      this.sources = structuredClone(context.castSources);
      this.heads = structuredClone(state.chapter?.claims ?? []);
      this.preparation = undefined;
      this.fileOrigin = true;
      this.runId = crypto.randomUUID();
      this.status = 'Progress stays in memory. Download this run before closing the page.';
      return state;
    } finally {
      this.validation.cancel(operation);
    }
  }
  capacityContext() {
    if (!this.fileSession || !this.original) throw Error('No accepted file.');
    return {
      format: 'glance-file-session/1',
      original: structuredClone(this.original),
      provenance: structuredClone(this.provenance),
      castSources: structuredClone(this.sources),
    };
  }
  exportSession(state: State) {
    if (!this.fileSession || !this.original) throw new Error('No accepted file.');
    const value = {
      format: 'glance-file-session/1',
      original: this.original,
      provenance: this.provenance,
      current: this.export(state),
    };
    // Reject capacity before installing or advancing file play, never truncate to fit.
    safeFile(JSON.stringify(value));
    return structuredClone(value);
  }
  localSave(state: State) {
    this.nativeOnly();
    const run = exportRun(state);
    const journal = displayJournal(state) ?? journalWatch(state.people[0]!);
    const saved = structuredClone(run);
    delete (saved.state as any).hf.run;
    return JSON.stringify({
      run: saved,
      journal,
      runId: this.runId,
      fileOrigin: this.fileOrigin,
      heads: this.heads,
      sources: this.sources,
      ...(this.preparation ? { preparation: this.preparation } : {}),
    });
  }
  export(state: State) {
    return { ...exportRun(state), castSources: structuredClone(this.sources) };
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
    this.nativeOnly();
    this.invalidate();
    await this.shelf.ready;
    this.shelf.setEnabled(value);
    this.status =
      'Your choice about carrying people between games has changed. This loaded chapter keeps its saved people. Only a new chapter can load browser histories.';
  }
  checkpoint(_castId: string, _fork = false): Promise<never> {
    this.nativeOnly();
    // Roles exist; source suspension, reconciliation and producer retirement remain unsupported.
    // Refuse before envelope, journal, source archive, shelf or head writes.
    return Promise.reject(
      new Error(
        'These people cannot leave this watch yet. Download the complete run; no person or source history was published.',
      ),
    );
  }
  async checkpointAll() {
    this.nativeOnly();
    const generation = this.generation,
      state = this.state,
      runId = this.runId;
    const current = () => generation === this.generation && state === this.state && runId === this.runId;
    let published = 0;
    let refused = 0;
    for (const c of CAST) {
      if (!current()) break;
      try {
        const saved = await this.checkpoint(c.castId);
        if (!current()) break;
        if (saved) published++;
        else refused++;
      } catch (error) {
        if (!current()) break;
        refused++;
        this.status = String(error);
      }
    }
    if (current()) this.changed();
    return { published, refused };
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
