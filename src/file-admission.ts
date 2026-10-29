/** SCOPE: complete current source replay is the sole file/native authority. This
 * module runs in the owning worker; no editable marker or matching copy admits a
 * Person. Unsupported HF3, source families and ownership records are refused. */

import { exportRun, restoreRunJournal } from '@adam0white/human-framework';
import { canonicalPersona } from '@adam0white/lab-client';
import { checkPreparation, type Reservation } from './preparation-store.ts';
import type { GameState } from './sim/dam.ts';
import { chapterSources, validateChapter } from './sim/passport.ts';
import { exportCurrent, importCurrent } from './sim/run.ts';
export const FILE_BYTES = 16 * 1024 * 1024;
export function encodeText(text: string) {
  if (/[\uD800-\uDFFF]/u.test(text)) throw Error('Original text contains a lone surrogate.');
  return new TextEncoder().encode(text);
}
export async function digestBytes(bytes: Uint8Array<ArrayBuffer>) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export const digest = (text: string) => digestBytes(encodeText(text));
export function safeFile(text: string): any {
  if (encodeText(text).byteLength > FILE_BYTES) throw Error('File exceeds complete import capacity.');
  const value = JSON.parse(text.startsWith('\uFEFF') ? text.slice(1) : text);
  let nodes = 0;
  function visit(v: unknown, depth: number) {
    if (++nodes > 1_000_000 || depth > 128) throw Error('File is too complex.');
    if (typeof v === 'number' && !Number.isFinite(v)) throw Error('Nonfinite file value.');
    if (v && typeof v === 'object')
      for (const [key, child] of Object.entries(v)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw Error('Unsafe file key.');
        visit(child, depth + 1);
      }
  }
  visit(value, 0);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid saved file.');
  return value;
}
function provenance(raw: any) {
  const sources = chapterSources(raw.run?.state?.chapter);
  const heads = raw.run?.state?.chapter?.claims ?? [];
  if (
    typeof raw.runId !== 'string' ||
    !raw.runId ||
    typeof raw.fileOrigin !== 'boolean' ||
    canonicalPersona(raw.heads) !== canonicalPersona(heads) ||
    canonicalPersona(raw.sources) !== canonicalPersona(sources)
  )
    throw Error('This watch has unsupported source ownership. No history was loaded.');
  return {
    runId: raw.runId as string,
    fileOrigin: raw.fileOrigin as boolean,
    heads: structuredClone(heads),
    sources,
  };
}
export async function admitPublic(raw: any) {
  if (raw.format !== undefined) throw Error('Unsupported file format.');
  const run = raw.run ?? raw;
  await validateChapter(run.state?.chapter);
  const state = importCurrent(run);
  const sources = raw.run ? raw.sources : (raw.castSources ?? []);
  if (canonicalPersona(sources) !== canonicalPersona(chapterSources(state.chapter)))
    throw Error('This watch has unsupported source ownership. No history was loaded.');
  if (raw.run) provenance(raw);
  return { state, sources: structuredClone(sources) as ReturnType<typeof chapterSources> };
}
export async function admitNative(text: string) {
  const raw = safeFile(text);
  if (raw.journal !== undefined) {
    if (!raw.run?.state?.hf || Object.hasOwn(raw.run.state.hf, 'run')) throw Error('Invalid journal save.');
    const restored = restoreRunJournal(raw.journal);
    if (!restored.ok) throw Error('The saved journal could not be verified.');
    raw.run.state.hf.run = exportRun(restored.value.run);
  }
  const { state } = await admitPublic(raw);
  let preparation: Reservation | undefined;
  if (raw.preparation !== undefined) {
    preparation = raw.preparation;
    await checkPreparation(preparation!);
    if (preparation!.phase !== 'acknowledged') throw Error('This prepared claim is not acknowledged.');
    const prepared = safeFile(preparation!.candidate);
    if (prepared.preparation !== undefined) throw Error('Nested preparation.');
    await admitPublic(prepared);
    if (
      prepared.runId !== raw.runId ||
      canonicalPersona(prepared.heads) !== canonicalPersona(raw.heads) ||
      canonicalPersona(prepared.sources) !== canonicalPersona(raw.sources) ||
      canonicalPersona(prepared.run.state.chapter) !== canonicalPersona(state.chapter) ||
      canonicalPersona(prepared.run.inputs) !==
        canonicalPersona(raw.run.inputs.slice(0, prepared.run.inputs.length)) ||
      state.minute < prepared.run.state.minute
    )
      throw Error('Native watch differs from its prepared opening.');
  } else if (state.chapter?.inputs.length && !raw.fileOrigin)
    throw Error('This carried opening has no durable preparation context.');
  return { state, ...provenance(raw), preparation };
}
export type FileContext = {
  format: 'glance-file-session/1';
  original: { text: string; sha256: string };
  provenance: unknown;
  castSources: ReturnType<typeof chapterSources>;
};
export async function admitFile(text: string): Promise<{ state: GameState; context: FileContext }> {
  let raw = safeFile(text);
  let original = { text, sha256: await digest(text) };
  let sourceFile = raw;
  let sourceProvenance: unknown = null;
  if (raw.format === 'glance-file-session/1') {
    if (typeof raw.original?.text !== 'string' || raw.original.sha256 !== (await digest(raw.original.text)))
      throw Error('Original file digest mismatch.');
    original = raw.original;
    const source = safeFile(original.text);
    if (source.format) throw Error('Nested original file.');
    await admitPublic(source);
    sourceFile = source;
    sourceProvenance = source.run ? source : null;
    if (JSON.stringify(raw.provenance) !== JSON.stringify(sourceProvenance))
      throw Error('Source provenance mismatch.');
    if (!raw.current || raw.current.run) throw Error('Invalid current run.');
    raw = raw.current;
  } else sourceProvenance = raw.run ? raw : null;
  const { state, sources } = await admitPublic(raw);
  const sourceRun = sourceFile.run ?? sourceFile;
  const originalSources = sourceFile.run ? sourceFile.sources : (sourceFile.castSources ?? []);
  if (
    JSON.stringify(sources) !== JSON.stringify(originalSources) ||
    (raw.seed !== undefined &&
      (raw.seed !== sourceRun.seed ||
        state.minute < sourceRun.state.minute ||
        state.applied < sourceRun.state.applied ||
        JSON.stringify(raw.state?.chapter) !== JSON.stringify(sourceRun.state?.chapter) ||
        JSON.stringify(raw.state?.rules) !== JSON.stringify(sourceRun.state?.rules) ||
        JSON.stringify(raw.inputs.slice(0, sourceRun.inputs.length)) !== JSON.stringify(sourceRun.inputs)))
  )
    throw Error('Current run does not continue the original file.');
  const context: FileContext = {
    format: 'glance-file-session/1',
    original,
    provenance: sourceProvenance,
    castSources: sources,
  };
  safeFile(
    JSON.stringify({
      format: context.format,
      original,
      provenance: sourceProvenance,
      current: { ...exportCurrent(state), castSources: sources },
    }),
  );
  return { state, context };
}
