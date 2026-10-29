/** SCOPE: one fixed source watch, ordinary public actions and no actor/clock/RNG setters.
 * Long physical lifecycle coverage replaces repeated HF3 private-setter preparation.
 * This separate causal proof does not weaken the normal suite's deadlines. */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { discoveriesFor } from '../src/sim/cast.ts';
import { newGame, queueInput, step } from '../src/sim/dam.ts';
import { outcomeAvailable } from '../src/sim/outcomes.ts';
import { privateAvailable } from '../src/sim/private-scenes.ts';
import { exportCurrent } from '../src/sim/run.ts';
import { viewingAvailable } from '../src/sim/viewing.ts';

const root = resolve(import.meta.dirname, '..') + '/';
const stem = process.argv[2];
if (!stem) throw Error('Supply a unique proof output prefix outside the source tree.');
function scan(dir: string): string[] {
  return readdirSync(root + dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? scan(dir + e.name + '/') : [dir + e.name],
  );
}
const sources = scan('src/')
  .sort()
  .map((path) => {
    const b = readFileSync(root + path);
    return { path, sha256: createHash('sha256').update(b).digest('hex'), bytes: b.length };
  });
const s = newGame(7),
  start = performance.now(),
  events: unknown[] = [];
let steps = 0,
  goal = 0,
  last = '';
const tasks = [
  'handover',
  'handover-test',
  'correction',
  'dai-proposal',
  'callum-proposal',
  'callum-home-rest',
  'rota-dai-read',
  'rota-dai-leave',
  'rota-callum-read',
  'rota-callum-home',
] as const;
const done = [
  () => s.outcomes?.handover.transferredAt !== undefined,
  () => s.outcomes?.handover.completedAt !== undefined,
  () => s.outcomes?.correction.filedAt !== undefined && s.outcomes?.correction.restedAt !== undefined,
  () => !!s.outcomes?.keeperScenes?.daiProposal,
  () => !!s.outcomes?.keeperScenes?.callumProposal,
  () => s.outcomes?.keeperScenes?.homeRequests?.some((x) => x.returnedAt !== undefined),
  () => s.outcomes?.rota?.offers.some((x) => x.person === 'dai' && x.readAt !== undefined),
  () => s.outcomes?.rota?.trips.some((x) => x.person === 'dai' && x.returnedAt !== undefined),
  () => s.outcomes?.rota?.offers.some((x) => x.person === 'callum' && x.readAt !== undefined),
  () => s.outcomes?.rota?.trips.some((x) => x.person === 'callum' && x.returnedAt !== undefined),
];
try {
  for (; steps < 7000 && s.phase !== 'end'; steps++) {
    if (s.phase === 'dawn') {
      console.log('dawn', s.night, s.minute);
      queueInput(s, { kind: 'next' });
    }
    const local = s.minute % 1440;
    if (local === 1321) queueInput(s, { kind: 'ask', keeper: 'dai', job: 'gate', target: 6 });
    if (s.treeKnown && s.minute % 20 === 0) {
      const k = s.keepers.find(
        (k) => k.on && k.place === 'hut' && !k.job && !s.people.find((p) => p.id === k.id)!.body.asleep,
      );
      if (k) queueInput(s, { kind: 'ask', keeper: k.id, job: 'clear' });
    }
    if (s.minute % 60 === 10 && s.board.gate && s.board.gate.value < 6) {
      const k = s.keepers.find(
        (k) => k.on && k.place === 'hut' && !k.job && !s.people.find((p) => p.id === k.id)!.body.asleep,
      );
      if (k) queueInput(s, { kind: 'ask', keeper: k.id, job: 'gate', target: 6 });
    }
    for (const person of discoveriesFor(s)) {
      const at = s.conversations[person];
      if (at === undefined || s.minute - at >= 20) queueInput(s, { kind: 'talk', person });
    }
    if (!s.viewing && viewingAvailable(s, 'invite') === null)
      queueInput(s, { kind: 'viewing', action: 'invite' });
    if (s.viewing?.away && s.viewing.stage === 'waiting' && viewingAvailable(s, 'return') === null)
      queueInput(s, { kind: 'viewing', action: 'return' });
    if (
      s.privateScenes?.active?.action === 'lamp' &&
      !s.privateScenes.attempts[s.privateScenes.active.index]?.adjustedAt
    )
      queueInput(s, { kind: 'private', action: 'adjust-lamp', shape: 'boat', lamp: 'low' });
    for (const action of ['lamp', 'post-shape', 'read-fictional-reply', 'appendix', 'file-appendix'] as const)
      if (privateAvailable(s, action) === null) queueInput(s, { kind: 'private', action });
    while (goal < tasks.length && done[goal]!()) {
      console.log('complete', tasks[goal], s.minute);
      events.push({ task: tasks[goal], at: s.minute });
      goal++;
    }
    if (local > 1340 && goal < tasks.length && outcomeAvailable(s, tasks[goal]!))
      queueInput(s, { kind: 'outcome', task: tasks[goal]! });
    const home = s.outcomes?.keeperScenes?.homeRequests?.at(-1);
    if (
      (home?.restCompletedAt !== undefined || home?.interruptedAt !== undefined) &&
      home.returnedAt === undefined &&
      outcomeAvailable(s, 'callum-home-return')
    )
      queueInput(s, { kind: 'outcome', task: 'callum-home-return' });
    if (
      s.outcomes?.rota?.away !== undefined &&
      (s.outcomes.rota.trips.at(-1)?.intervalFinishedAt !== undefined ||
        s.outcomes.rota.trips.at(-1)?.interruptedAt !== undefined) &&
      outcomeAvailable(s, 'rota-return')
    )
      queueInput(s, { kind: 'outcome', task: 'rota-return' });
    const checkpoint = [
      s.outcomes?.active?.task,
      s.outcomes?.rota?.reading !== undefined ? 'rota-reading' : '',
      s.outcomes?.rota?.trips.at(-1)?.departedAt,
      s.outcomes?.keeperScenes?.homeRequests?.at(-1)?.departedAt,
    ].join(':');
    if (checkpoint !== last) {
      events.push({ at: s.minute, checkpoint });
      last = checkpoint;
    }
    step(s);
    assert.ok(
      s.people.every((p) => p.now <= s.minute + 0.1),
      'No actor consumes future source minutes.',
    );
  }
  assert.deepEqual(Object.keys(s.discoveries).sort(), ['bilal', 'callum', 'dai', 'nerys', 'wren']);
  assert.equal(s.people.find((p) => p.id === 'bilal')?.skills.gate, undefined);
  assert.equal(s.people.find((p) => p.id === 'wren')?.skills.gate, undefined);
  assert.equal(s.phase, 'end');
  assert.equal(s.night, 12);
  assert.equal(s.dawns.length, 12);
  assert.equal(goal, tasks.length);
  assert.equal(s.outcomes!.handover.transferredAt! - s.outcomes!.handover.startedAt!, 20);
  assert.equal(s.outcomes!.handover.completedAt! - s.outcomes!.handover.test!.startedAt!, 10);
  assert.equal(s.outcomes!.handover.test!.passed, true);
  assert.ok(s.outcomes!.correction.filedAt);
  assert.ok(s.outcomes!.correction.restedAt);
  for (const trip of s.outcomes!.rota!.trips) {
    assert.equal(trip.arrivedAt, trip.departedAt + 10);
    assert.equal(trip.returnedAt, trip.returnFrom! + 10);
    assert.ok(trip.coveredMinutes <= 150);
  }
  for (const trip of s.outcomes!.rota!.trips) {
    if (trip.intervalFinishedAt !== undefined) {
      assert.equal(trip.attended, 120);
      if (trip.interruptedAt !== undefined) assert.ok(trip.interruptedAt >= trip.intervalFinishedAt);
    } else assert.ok(trip.interruptedAt !== undefined);
  }
  assert.ok(s.outcomes!.rota!.trips.some((trip) => trip.intervalFinishedAt !== undefined));
  const home = s.outcomes!.keeperScenes!.homeRequests!.at(-1)!;
  assert.ok(home.interruptedAt);
  assert.equal(home.completedAt, undefined);
  assert.equal(home.returnedAt, home.returnFrom! + 10);
  assert.equal(s.viewing!.arrivedAt, s.viewing!.departedAt! + 5);
  assert.equal(s.viewing!.returnedAt, s.viewing!.returnFrom! + 5);
  assert.ok(s.viewing!.attended < 20);
  assert.equal(s.viewing!.away, false);
  const lamp = s.privateScenes!.lamp;
  assert.equal(lamp.completedAt! - lamp.startedAt!, 10);
  assert.equal(lamp.postedAt! - lamp.postStartedAt!, 5);
  assert.equal(lamp.fictionalReply!.at - lamp.fictionalReply!.from, 5);
  assert.match(lamp.fictionalReply!.text, /authored fiction/);
  assert.ok(s.privateScenes!.appendix.filedAt);
  console.log('PASS actual twelve-night source controls; interrupted outcomes remain incomplete.');
} finally {
  writeFileSync(
    stem + '.json',
    JSON.stringify({
      node: process.version,
      sources,
      seed: 7,
      steps,
      elapsedMs: performance.now() - start,
      goal,
      events,
      run: exportCurrent(s),
    }),
  );
  console.log('final', s.phase, s.night, s.minute, steps, performance.now() - start, goal);
}
