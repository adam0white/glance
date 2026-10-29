// @vitest-environment happy-dom
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import type { Lab } from '@adam0white/lab-client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Continuity } from '../src/continuity.ts';
import { encodeText, FILE_BYTES, safeFile } from '../src/file-admission.ts';
import { newGame, queueInput, step } from '../src/sim/dam.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';
import { BrowserWorker, disposeBrowserWorkers } from './browser-worker.ts';

const lab = {
  build: () => ({ c: 'synthetic-current-file' }),
  setPersonaRecording: () => {},
} as unknown as Lab;
const legacyFixtureText = gunzipSync(
  Buffer.from(
    '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',
    'base64',
  ),
).toString('utf8');
const fixtureText = JSON.stringify({
  run: exportCurrent(newGame(7)),
  runId: 'synthetic-source-test',
  heads: [],
  fileOrigin: false,
  sources: [],
});
it('retains exact HF3 native proof and refuses it as current HF4 state', () => {
  const text = legacyFixtureText;
  expect(Buffer.byteLength(text)).toBe(32290);
  expect(createHash('sha256').update(text).digest('hex')).toBe(
    '59cc6a4bea559dc8b7aa66654b632b798d30ae17e543b388063e33640b3662de',
  );
  const raw = JSON.parse(text);
  const before = structuredClone(raw);
  expect(() => importCurrent(raw.run)).toThrow(/older|unsupported/);
  expect(raw).toEqual(before);
});

beforeEach(() => vi.stubGlobal('Worker', BrowserWorker));
afterEach(() => {
  disposeBrowserWorkers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
// SCOPE: original bytes and current complete replay are independent authorities.
it('retains BOM original and full provenance through file continuation and wrapper reimport', async () => {
  const c = new Continuity(lab, undefined, () => {}, true),
    text = '\ufeff' + fixtureText;
  const token = c.beginFileSelection();
  const s = await c.importSelected(new TextEncoder().encode(text).buffer, token);
  const owner = (await import('../src/sim/display.ts')).displayOwner(s)!;
  await owner.mutate({ input: { kind: 'ask', keeper: 'dai', job: 'level' } });
  await owner.mutate({ minutes: 2 });
  const packet = c.exportSession(s);
  expect(packet.original).toEqual({ text, sha256: createHash('sha256').update(text).digest('hex') });
  expect(packet.provenance).toEqual(JSON.parse(fixtureText));
  const other = new Continuity(lab, undefined, () => {}, true);
  const restored = await other.importFile(JSON.stringify(packet));
  expect(exportCurrent(restored)).toEqual(exportCurrent(s));
  expect(other.exportSession(restored).original).toEqual(packet.original);
  for (const forbidden of [
    () => c.localSave(s),
    () => c.clear(),
    () => c.shelf,
    () => c.checkpoint('hf.cast.dai.glance'),
  ])
    expect(forbidden).toThrow();
  await expect(c.setEnabled(true)).rejects.toThrow();
});
it('refuses unsafe bytes, malformed ownership and forged complete people without replacing the accepted file', async () => {
  const c = new Continuity(lab, undefined, () => {}, true),
    s = await c.importFile(fixtureText),
    before = c.exportSession(s);
  const forged = structuredClone(before);
  Reflect.get(forged.current.state, 'hf').run.current.people.dai.body.health = 0.2;
  const badDigest = structuredClone(before);
  badDigest.original.sha256 = '0'.repeat(64);
  const oldHeads = JSON.parse(fixtureText);
  oldHeads.heads = [{}];
  for (const text of [
    '{',
    '{"__proto__":{}}',
    '{"x":1e400}',
    JSON.stringify(forged),
    JSON.stringify(badDigest),
    JSON.stringify(oldHeads),
  ]) {
    await expect(c.importFile(text)).rejects.toThrow();
    expect(c.exportSession(s)).toEqual(before);
  }
  const t = c.beginFileSelection();
  await expect(c.importSelected(new Uint8Array([0xc3, 0x28]).buffer, t)).rejects.toThrow();
  expect(c.exportSession(s)).toEqual(before);
  expect(() => encodeText('\ud800')).toThrow();
  expect(() => safeFile('{"pad":"' + 'x'.repeat(FILE_BYTES) + '"}')).toThrow('capacity');
});
it('cancels a stale hash and a real candidate validation before accepted provenance can change', async () => {
  const c = new Continuity(lab, undefined, () => {}, true),
    s = await c.importFile(fixtureText),
    before = c.exportSession(s);
  const real = crypto.subtle.digest.bind(crypto.subtle);
  let release!: (x: ArrayBuffer) => void;
  const digest = await real('SHA-256', new TextEncoder().encode(fixtureText));
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(() => new Promise((r) => (release = r)));
  const token = c.beginFileSelection(),
    p = c.importSelected(new TextEncoder().encode(fixtureText).buffer, token);
  const rejected = expect(p).rejects.toThrow('newer file');
  c.beginFileSelection();
  release(digest);
  await rejected;
  expect(c.exportSession(s)).toEqual(before);
  vi.restoreAllMocks();
  const t = c.beginFileSelection(),
    pending = c.importSelected(new TextEncoder().encode(fixtureText).buffer, t);
  const rejection = expect(pending).rejects.toThrow();
  c.beginFileSelection();
  await rejection;
  expect(c.exportSession(s)).toEqual(before);
});
it('checks complete native metadata and retains the accepted file across a foreign source refusal', async () => {
  const c = new Continuity(lab, undefined, () => {}, true),
    s = await c.importFile(fixtureText),
    before = c.exportSession(s);
  const unknown = JSON.parse(fixtureText);
  unknown.sources = [{ revision: 'unsupported', source: { game: 'commonstead' }, snapshot: {} }];
  await expect(c.importFile(JSON.stringify(unknown))).rejects.toThrow('ownership');
  expect(c.exportSession(s)).toEqual(before);
  expect(c.heads).toEqual([]);
  expect(c.sources).toEqual([]);
});
