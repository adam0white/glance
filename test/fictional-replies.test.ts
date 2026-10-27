// @vitest-environment happy-dom
import { mkdirSync, writeFileSync } from 'node:fs';
import { precommit } from '@adam0white/human-framework';
import type { Lab } from '@adam0white/lab-client';
import { expect, it } from 'vitest';
import { Continuity } from '../src/continuity.ts';
import { discoveriesFor } from '../src/sim/cast.ts';
import { type GameState, newGame, queueInput, replay, step } from '../src/sim/dam.ts';
import { type KeeperSceneAction, keeperSceneAvailable } from '../src/sim/keeper-scenes.ts';
import type { PrivateAction } from '../src/sim/private-scenes.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';
import { required } from './required.ts';

const start = () =>
  newGame(7, undefined, { edition: 'extended-2', dam: 'valley', outcomes: 'private-scenes-1' });
const reply = 'read-fictional-reply' as PrivateAction;
function minute(s: GameState) {
  if (s.phase === 'dawn') {
    queueInput(s, { kind: 'next' });
    return;
  }
  if (s.phase !== 'watch') throw Error('Watch ended before the control reached its result');
  if (s.minute % 1440 === 1321) queueInput(s, { kind: 'ask', keeper: 'dai', job: 'gate', target: 4 });
  for (const person of discoveriesFor(s)) {
    const first = s.conversations[person];
    if (first === undefined || s.minute - first >= 20) queueInput(s, { kind: 'talk', person });
  }
  step(s);
}
function until(s: GameState, done: () => boolean, action?: () => void) {
  for (let n = 0; n < 12000 && !done(); n++) {
    action?.();
    minute(s);
  }
  expect(done()).toBe(true);
}
function privateAction(s: GameState, action: PrivateAction) {
  queueInput(s, { kind: 'private', action });
}
function familyAction(s: GameState, task: string) {
  queueInput(s, { kind: 'outcome', task: task as KeeperSceneAction });
}
function compact(s: GameState) {
  return replay(s.seed, s.inputs, s.minute, s.chapter ?? undefined, s.rules, s.applied);
}
function retain(name: string, s: GameState) {
  const dir = process.env.GLANCE_REPLY_PROOF_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${name}.json`, JSON.stringify(exportCurrent(s)));
  }
}
async function proof(s: GameState, name: string) {
  const raw = exportCurrent(s),
    text = JSON.stringify(raw);
  const full = importCurrent(raw),
    small = compact(s);
  expect(JSON.stringify(exportCurrent(full))).toBe(text);
  expect(JSON.stringify(exportCurrent(small))).toBe(text);
  retain(`${name}-initial`, s);
  const target = s.minute + 1440;
  while (s.minute < target) for (const run of [s, full, small]) minute(run);
  expect(s.minute).toBe(target);
  expect(JSON.stringify(exportCurrent(full))).toBe(JSON.stringify(exportCurrent(s)));
  expect(JSON.stringify(exportCurrent(small))).toBe(JSON.stringify(exportCurrent(s)));
  retain(`${name}-continued1440`, s);
  const controller = new Continuity({} as Lab, undefined, () => {}, true);
  const native = {
    run: exportCurrent(small),
    runId: 'synthetic-fictional-reply',
    fileOrigin: false,
    heads: [],
    sources: [],
  };
  const original = JSON.stringify(native);
  const loaded = await controller.importFile(original);
  expect(exportCurrent(loaded)).toEqual(exportCurrent(s));
  minute(loaded);
  const envelope = controller.exportSession(loaded);
  expect(envelope.original.text).toBe(original);
  expect(envelope.provenance).toEqual(native);
  const again = new Continuity({} as Lab, undefined, () => {}, true);
  expect(exportCurrent(await again.importFile(JSON.stringify(envelope)))).toEqual(exportCurrent(loaded));
  retain(`${name}-file-continued`, loaded);
}

// Causal control: posting alone cannot create a reply; actual HF choice and five attended minutes are required.
it('reads only a chosen fictional improvement to the exact posted shape, with refusal, interruption and expiry', async () => {
  const s = start();
  privateAction(s, reply);
  minute(s);
  expect(s.privateScenes?.attempts).toHaveLength(0);
  until(
    s,
    () => s.privateScenes?.active?.action === 'lamp',
    () => privateAction(s, 'lamp'),
  );
  queueInput(s, { kind: 'private', action: 'adjust-lamp', shape: 'boat', lamp: 'low' });
  minute(s);
  until(
    s,
    () => s.privateScenes?.lamp.postedAt !== undefined,
    () => {
      if (!s.privateScenes?.active) privateAction(s, 'post-shape');
    },
  );
  const posted = s.privateScenes!.lamp.postedDrawing;
  // No new input means no autonomous story reply, even after a full day.
  const silent = compact(s);
  await proof(silent, 'posted-without-reply');
  expect(silent.privateScenes?.lamp.fictionalReply).toBeUndefined();
  until(
    s,
    () => s.privateScenes?.active?.action === reply,
    () => privateAction(s, reply),
  );
  const reading = compact(s);
  const cut = compact(s);
  privateAction(cut, 'stop');
  minute(cut);
  expect(cut.privateScenes?.lamp.fictionalReply).toBeUndefined();
  expect(cut.privateScenes?.attempts.at(-1)?.stoppedAt).toBeDefined();
  expect(cut.privateScenes?.lamp.postedDrawing).toBe(posted);
  const refused = compact(cut);
  until(refused, () => refused.minute >= (refused.privateScenes?.retryAfter.bilal ?? 0));
  const bilal = refused.people.find((p) => p.id === 'bilal')!;
  precommit(bilal, {
    action: 'private-read-fictional-reply',
    bias: -100,
    from: refused.minute,
    to: refused.minute + 30,
  });
  privateAction(refused, reply);
  minute(refused);
  expect(refused.privateScenes?.decisions.at(-1)?.result).toBe('refused');
  expect(refused.privateScenes?.lamp.fictionalReply).toBeUndefined();
  until(s, () => s.privateScenes?.lamp.fictionalReply !== undefined);
  const result = s.privateScenes!.lamp.fictionalReply!;
  expect(result.edition).toBe('fictional-reply-1');
  expect(result.at - result.from).toBe(5);
  expect(result.postedDrawing).toBe(posted);
  expect(result.text).toContain('small triangular flag');
  expect(result.text).toContain('authored fiction');
  expect(s.privateScenes?.lamp.postedDrawing).toBe(posted);
  await proof(reading, 'active-reply');
  await proof(compact(s), 'completed-reply');
  const late = compact(cut);
  until(late, () => late.minute >= 6 * 1440 + 1320);
  const count = late.privateScenes!.attempts.length;
  privateAction(late, reply);
  minute(late);
  expect(late.privateScenes!.attempts.length).toBe(count);
  expect(late.privateScenes?.lamp.fictionalReply).toBeUndefined();
  expect(late.said.at(-1)?.text).toContain('visit or own routine');
});

// Negative fictional answers cannot rewrite proposals into leave, a changed rota or completed home rest.
it('retains proposals while chosen attended fictional refusals answer the remaining agency and partner questions', async () => {
  const s = start();
  until(
    s,
    () => !!s.outcomes?.keeperScenes?.daiProposal,
    () => familyAction(s, 'dai-proposal'),
  );
  until(
    s,
    () => !!s.outcomes?.keeperScenes?.callumProposal,
    () => familyAction(s, 'callum-proposal'),
  );
  const proposals = structuredClone([
    s.outcomes!.keeperScenes!.daiProposal,
    s.outcomes!.keeperScenes!.callumProposal,
  ]);
  const action = 'dai-fictional-response';
  until(s, () => keeperSceneAvailable(s, action as KeeperSceneAction));
  familyAction(s, action);
  minute(s);
  const cut = compact(s);
  familyAction(cut, 'stop-family');
  minute(cut);
  expect(cut.outcomes?.keeperScenes?.fictionalResponses).toBeUndefined();
  until(s, () => !!s.outcomes?.keeperScenes?.fictionalResponses?.dai);
  until(
    s,
    () => !!s.outcomes?.keeperScenes?.fictionalResponses?.callum,
    () => familyAction(s, 'callum-fictional-responses'),
  );
  expect([s.outcomes!.keeperScenes!.daiProposal, s.outcomes!.keeperScenes!.callumProposal]).toEqual(
    proposals,
  );
  const responses = s.outcomes!.keeperScenes!.fictionalResponses!;
  expect(required(responses.dai).at - required(responses.dai).from).toBe(5);
  expect(responses.dai?.text).toContain('No longer leave or retirement is approved');
  expect(responses.callum?.text).toContain('I cannot agree to that two-hour slot');
  expect(s.outcomes!.correction.writtenAt).toBeUndefined();
  expect(s.inputs.some((input) => input.kind === 'outcome' && input.task === 'correction')).toBe(false);
  expect(responses.callum?.text).not.toContain('Callum’s signed correction still awaits review.');
  expect(required(responses.callum).at - required(responses.callum).from).toBe(5);
  expect(responses.callum?.proposalAt).toBe(s.outcomes!.keeperScenes!.callumProposal!.at);
  await proof(compact(s), 'keeper-responses');
});
