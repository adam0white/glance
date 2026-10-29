/** SCOPE: complete host-native preparation, distinct from shelf CAS and producer retirement.
 * A successful IDB transaction and exact readback precede claim forwarding. Unknown outcomes remain. */
import { canonicalPersona, type PersonaEnvelope } from '@adam0white/lab-client';
import { digest, safeFile } from './file-admission.ts';
import { ALLOCATION } from './sim/cast.ts';
import { FRAMEWORK_VERSION } from './sim/hf4.ts';
import { RULES } from './sim/passport.ts';
export type Preparation = {
  id: string;
  generation: number;
  source: PersonaEnvelope['source'];
  expectedHeads: Record<string, string | null>;
  candidate: string;
  digest: string;
  basis: { runId: string; sha256: string } | null;
};
export type Reservation = Preparation & {
  phase: 'prepared' | 'acknowledged' | 'unknown';
  revision: number;
  dispatch: string | null;
};
export async function checkPreparation(p: Preparation, current = true) {
  if (
    !p ||
    typeof p.id !== 'string' ||
    !p.id ||
    !Number.isSafeInteger(p.generation) ||
    p.generation < 0 ||
    typeof p.candidate !== 'string'
  )
    throw Error('Invalid prepared opening.');
  if ('phase' in p) {
    const r = p as Reservation;
    if (
      !['prepared', 'acknowledged', 'unknown'].includes(r.phase) ||
      !Number.isSafeInteger(r.revision) ||
      r.revision < 0 ||
      (r.phase === 'prepared' ? r.dispatch !== null : typeof r.dispatch !== 'string' || !r.dispatch)
    )
      throw Error('Invalid preparation state.');
  }
  if (
    p.basis !== null &&
    (!p.basis || typeof p.basis.runId !== 'string' || !/^[a-f0-9]{64}$/.test(p.basis.sha256))
  )
    throw Error('Invalid prior native basis.');
  if (current && (p.source?.engine !== FRAMEWORK_VERSION || p.source?.rules !== RULES))
    throw Error('This prepared watch uses an older or unsupported version. Keep the file. Start a new game.');
  const native = safeFile(p.candidate);
  const ids = ALLOCATION.map((c) => c.castId).sort();
  if (
    p.source?.game !== 'glance' ||
    p.source.engine !== native.run?.framework ||
    p.source.rules !== native.run?.state?.hf?.run?.host?.edition ||
    !p.source.build.endsWith(`.run-${native.runId}`) ||
    canonicalPersona(Object.keys(p.expectedHeads ?? {}).sort()) !== canonicalPersona(ids) ||
    Object.values(p.expectedHeads).some((head) => head !== null && !/^[a-f0-9]{64}$/.test(head)) ||
    !native.run?.state?.chapter?.inputs?.length ||
    native.run.state.chapter.inputs.some(
      (input: { parent: { castId: string; revision: string } }) =>
        p.expectedHeads[input.parent.castId] !== input.parent.revision,
    )
  )
    throw Error('Prepared source context differs.');
  const {
    digest: _digest,
    phase: _phase,
    revision: _revision,
    dispatch: _dispatch,
    ...body
  } = p as Reservation;
  if ((await digest(canonicalPersona(body))) !== p.digest) throw Error('Prepared opening digest differs.');
}
export async function prepareRecord(body: Omit<Preparation, 'digest'>): Promise<Reservation> {
  const record = {
    ...body,
    digest: await digest(canonicalPersona(body)),
    phase: 'prepared' as const,
    revision: 0,
    dispatch: null,
  };
  await checkPreparation(record);
  return record;
}
export class PreparationStore {
  private async open() {
    if (typeof indexedDB === 'undefined')
      throw Error('This browser cannot durably prepare a carried opening. Your current game is unchanged.');
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('glance-incoming-1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('reservations', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? Error('Preparation database failed.'));
      request.onblocked = () => reject(Error('Preparation database is blocked.'));
    });
  }
  async list(): Promise<Reservation[]> {
    const db = await this.open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('reservations', 'readonly');
        const request = tx.objectStore('reservations').getAll();
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(tx.error ?? Error('Preparation read failed.'));
        tx.onerror = () => reject(tx.error ?? Error('Preparation read failed.'));
      });
    } finally {
      db.close();
    }
  }
  async read(id: string) {
    const record = (await this.list()).find((r) => r.id === id);
    if (!record) throw Error('The prepared opening is missing.');
    await checkPreparation(record, false);
    return record;
  }
  /** New reservation only. Existing operations must use an exact conditional transition. */
  async commit(record: Reservation) {
    if (record.phase !== 'prepared' || record.revision !== 0 || record.dispatch !== null)
      throw Error('Only a new prepared reservation can be inserted.');
    return this.write(record);
  }
  async transition(expected: Reservation, phase: Reservation['phase']) {
    if (
      !(
        (expected.phase === 'prepared' && phase === 'unknown') ||
        (expected.phase === 'unknown' && (phase === 'prepared' || phase === 'acknowledged'))
      )
    )
      throw Error('Invalid reservation transition.');
    const next: Reservation = {
      ...expected,
      phase,
      revision: expected.revision + 1,
      dispatch: phase === 'prepared' ? null : (expected.dispatch ?? crypto.randomUUID()),
    };
    return this.write(next, expected);
  }
  private async write(record: Reservation, expected?: Reservation) {
    await checkPreparation(record);
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('reservations', 'readwrite', { durability: 'strict' });
        const store = tx.objectStore('reservations');
        let mismatch = false;
        if (expected) {
          const read = store.get(record.id);
          read.onsuccess = () => {
            if (canonicalPersona(read.result) !== canonicalPersona(expected)) {
              mismatch = true;
              tx.abort();
            } else store.put(structuredClone(record));
          };
        } else store.add(structuredClone(record));
        tx.oncomplete = () => resolve();
        tx.onabort = () =>
          reject(
            mismatch
              ? Error('Reservation changed; this caller does not own its transition.')
              : (tx.error ?? Error('The complete preparation was not committed.')),
          );
        tx.onerror = () => reject(tx.error ?? Error('The complete preparation was not committed.'));
      });
    } finally {
      db.close();
    }
    const readback = await this.read(record.id);
    if (canonicalPersona(readback) !== canonicalPersona(record)) throw Error('Preparation readback differs.');
    return readback;
  }
}
