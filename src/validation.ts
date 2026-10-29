import { admitFile, admitNative, admitPublic, type FileContext } from './file-admission.ts';
/** SCOPE: one worker owns each candidate Run and, after selection, the live Run.
 * Inspections and forecast memoization never authorize native/source admission. */
import { type GameState, newGame, type WatchRules } from './sim/dam.ts';
import {
  type DisplayOwner,
  displayOwner,
  displayState,
  type ForecastKind,
  type InspectionPacket,
} from './sim/display.ts';
import { type Chapter, validateChapter } from './sim/passport.ts';
import { importCurrent } from './sim/run.ts';

class Connection implements DisplayOwner {
  readonly worker = new Worker(new URL('./validation-worker.ts', import.meta.url), { type: 'module' });
  private sequence = 0;
  private requests = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private forecasts = new Map<string, { value?: unknown }>();
  private chain = Promise.resolve();
  private closed = false;
  revision = 0;
  state: GameState | undefined;
  file: FileContext | undefined;
  native: Awaited<ReturnType<typeof admitNative>> | undefined;
  constructor(
    private progress: (message: string) => void,
    private changed: () => void,
  ) {
    this.worker.onmessage = (event: MessageEvent) => {
      const result = event.data;
      if (result.kind === 'progress') {
        this.progress(result.message);
        return;
      }
      const pending = this.requests.get(result.id);
      if (!pending || this.closed) return;
      this.requests.delete(result.id);
      if (result.kind === 'refused') pending.reject(new Error(result.message));
      else pending.resolve(result);
    };
    this.worker.onerror = () =>
      this.dispose('The saved watch could not be checked. The current watch is unchanged.');
  }
  request(kind: string, value: unknown) {
    if (this.closed) return Promise.reject(new Error('Checking cancelled. The current watch is unchanged.'));
    const id = ++this.sequence;
    return new Promise<any>((resolve, reject) => {
      this.requests.set(id, { resolve, reject });
      this.worker.postMessage({ id, kind, value });
    });
  }
  async open(kind: 'create' | 'load' | 'file' | 'native', value: unknown) {
    const result = await this.request(kind, value);
    this.revision = result.revision;
    this.file = result.file;
    this.native = result.native;
    this.state = displayState(result.packet, this);
    return this.state;
  }
  preview(person: string, kind: ForecastKind, payload: unknown): unknown {
    const basis = this.revision,
      key = JSON.stringify({ basis, person, kind, payload });
    const previous = this.forecasts.get(key);
    if (previous) return previous.value;
    const item: { value?: unknown } = {};
    this.forecasts.set(key, item);
    void this.request('preview', { person, kind, payload, basis })
      .then((result) => {
        if (this.closed || this.revision !== basis || result.revision !== basis) return;
        item.value = result.value;
        this.changed();
      })
      .catch(() => {});
    return undefined;
  }
  practice(turns: number) {
    return this.request('practice', { turns });
  }
  mutate(request: Parameters<DisplayOwner['mutate']>[0]) {
    const next = this.chain.then(async () => {
      const result = await this.request('mutate', request);
      this.revision = result.revision;
      this.forecasts.clear();
      displayState(result.packet, this, this.state);
    });
    this.chain = next.catch(() => {});
    return next;
  }
  dispose(message = 'Checking cancelled. The current watch is unchanged.') {
    if (this.closed) return;
    this.closed = true;
    this.worker.terminate();
    for (const pending of this.requests.values()) pending.reject(new Error(message));
    this.requests.clear();
    this.forecasts.clear();
  }
}
export class CandidateValidation {
  private directFiles = new WeakMap<GameState, FileContext>();
  private directNative = new WeakMap<GameState, Awaited<ReturnType<typeof admitNative>>>();
  private connections = new Set<Connection>();
  private operations = new WeakMap<Connection, symbol>();
  private held: Connection | undefined;
  constructor(private changed: () => void = () => {}) {}
  cancel(operation?: symbol) {
    for (const candidate of this.connections)
      if (
        candidate !== this.held &&
        (operation === undefined || this.operations.get(candidate) === operation)
      ) {
        candidate.dispose();
        this.connections.delete(candidate);
      }
  }
  keep(state: GameState) {
    const selected = displayOwner(state);
    for (const candidate of this.connections)
      if (candidate !== selected) {
        candidate.dispose();
        this.connections.delete(candidate);
      }
    this.held = selected instanceof Connection ? selected : undefined;
  }
  clear() {
    for (const candidate of this.connections) candidate.dispose();
    this.connections.clear();
    this.held = undefined;
  }
  private async prepare(
    kind: 'load' | 'create' | 'file' | 'native',
    value: unknown,
    progress: (message: string) => void,
    operation?: symbol,
  ): Promise<GameState> {
    this.cancel(operation);
    // CLI engineering uses the identical full replay/core, without a browser page.
    if (typeof Worker === 'undefined') {
      if (typeof window !== 'undefined')
        throw Error('This browser cannot open the watch. The current watch and saved files are unchanged.');
      if (kind === 'file') {
        const result = await admitFile(value as string);
        const state = result.state;
        this.directFiles.set(state, result.context);
        return state;
      }
      if (kind === 'native') {
        const result = await admitNative(value as string);
        this.directNative.set(result.state, result);
        return result.state;
      }
      if (kind === 'load') return (await admitPublic(value)).state;
      await validateChapter((value as any).chapter);
      return newGame((value as any).seed, (value as any).chapter, (value as any).rules);
    }
    const connection = new Connection(progress, this.changed);
    if (operation !== undefined) this.operations.set(connection, operation);
    this.connections.add(connection);
    try {
      return await connection.open(kind, value);
    } catch (error) {
      connection.dispose();
      this.connections.delete(connection);
      throw error;
    }
  }
  fileContext(state: GameState) {
    const owner = displayOwner(state);
    return owner instanceof Connection ? owner.file : this.directFiles.get(state);
  }
  nativeContext(state: GameState) {
    const owner = displayOwner(state);
    return owner instanceof Connection ? owner.native : this.directNative.get(state);
  }
  file(text: string, progress: (message: string) => void = () => {}, operation?: symbol) {
    return this.prepare('file', text, progress, operation);
  }
  native(text: string, progress: (message: string) => void = () => {}, operation?: symbol) {
    return this.prepare('native', text, progress, operation);
  }
  load(value: unknown, progress: (message: string) => void = () => {}, operation?: symbol) {
    return this.prepare('load', value, progress, operation);
  }
  create(seed: number, chapter?: Chapter, rules?: WatchRules, operation?: symbol) {
    return this.prepare('create', { seed, chapter, rules }, () => {}, operation);
  }
}
