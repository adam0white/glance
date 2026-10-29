import { expect, it } from 'vitest';
import { archiveWatch, openWatch, verifyWatch } from '../src/sim/hf4.ts';

// SCOPE: all five actors share one public Run; host inspections never own Person state.
it('authors five canonical actors and preserves the complete shared run through restore', () => {
  const watch = openWatch(7);
  expect(watch.people.map((p) => p.id)).toEqual(['dai', 'callum', 'nerys', 'bilal', 'wren']);
  const archive = archiveWatch(watch.people[0]!);
  expect(archive.run.engine.package).toBe('@adam0white/human-framework@4.8.0');
  expect(verifyWatch(watch.people[0]!).verified).toBe(true);
  expect(() => {
    (watch.people[0]!.body as { health: number }).health = 0;
  }).toThrow();
});

it('uses actual HF decisions, pending starts and one quantity event at a reached instrument', async () => {
  const { decide, begin, finish, tick, estimateQuantity, restoreWatch, readPerson } = await import(
    '../src/sim/hf4.ts'
  );
  const w = openWatch(7),
    p = w.people[0]!;
  const offer = {
    id: 'rest-check',
    action: 'rest',
    label: 'take a short rest',
    duration: 2,
    effort: 0,
    advertises: { rest: 0.5 },
  };
  const d = decide(p, [offer], {
    suggestion: { voiceId: 'engineer', affordanceId: offer.id, strength: 0.6 },
  });
  expect(d.chosenAffordanceId).toBe(offer.id);
  expect(begin(p, offer, d)).not.toBeNull();
  const active = archiveWatch(p);
  expect(archiveWatch(restoreWatch(active).people[0]!)).toEqual(active);
  tick(p, p.now + 2);
  finish(p, { action: 'rest', at: p.now, status: 'completed' });
  expect(p.activity).toBeNull();
  const q = estimateQuantity(p, { truth: 4.2, difficulty: 0.4 });
  expect(Number.isFinite(q.value)).toBe(true);
  const before = archiveWatch(p);
  readPerson(p);
  readPerson(p);
  expect(archiveWatch(p)).toEqual(before);
  expect(verifyWatch(p).verified).toBe(true);
});

// SCOPE: independent choices and partial world resolutions preserve the other
// actor's unresolved finish. No host-created decision or completion can replace it.
it('starts a conditional pair only after both decisions and records each reached finish boundary', async () => {
  const { decideTogether, beginTogether, tick, finish, archiveWatch, verifyWatch } = await import(
    '../src/sim/hf4.ts'
  );
  const w = openWatch(7);
  const people = w.people.slice(0, 2);
  const offer = {
    id: 'pair',
    action: 'read',
    label: 'read a short record',
    duration: 5,
    effort: 0.03,
    advertises: { belonging: 0.25 },
  };
  const decisions = decideTogether(people.map((person) => ({ person, affordances: [offer] })));
  expect(decisions.every((d) => d.chosenAffordanceId === offer.id)).toBe(true);
  expect(archiveWatch(people[0]!).pending?.boundary.type).toBe('world-required');
  expect(people.every((p) => !p.activity)).toBe(true);
  beginTogether(people);
  expect(people.every((p) => p.activity?.affordanceId === offer.id)).toBe(true);
  tick(people[0]!, people[0]!.activity!.endsAt);
  const first = finish(people[0]!, { action: 'read', at: people[0]!.now, status: 'completed' });
  expect(first?.status).toBe('completed');
  expect(people[0]!.activity).toBeNull();
  expect(people[1]!.activity).not.toBeNull();
  const resolved = archiveWatch(people[0]!)
    .run.history.flatMap((x) => x.inputs)
    .filter((x) => x.kind === 'action.resolved' && x.payload.stage === 'finish');
  expect(resolved).toHaveLength(2);
  expect(finish(people[1]!, { action: 'read', at: people[1]!.now, status: 'completed' })?.status).toBe(
    'completed',
  );
  expect(people.every((p) => p.activity === null)).toBe(true);
  expect(verifyWatch(people[0]!).verified).toBe(true);
});

// SCOPE: HF can reconsider after resolving the prior physical interruption. The
// request's real assent must remain evidence; later contrary choices still win.
it('retains the actual request assent across interruption of an existing activity', async () => {
  const { decideTogether, beginTogether } = await import('../src/sim/hf4.ts');
  const w = openWatch(7);
  const people = w.people.slice(0, 2);
  const stove = {
    id: 'stove',
    action: 'stove',
    label: 'rest by the stove',
    duration: 20,
    effort: 0.03,
    advertises: { rest: 0.25, water: 0.15, food: 0.05 },
  };
  decideTogether(people.map((person) => ({ person, affordances: [stove] })));
  beginTogether(people);
  expect(people.every((p) => p.activity?.affordanceId === 'stove')).toBe(true);
  const reading = {
    id: 'joint-read',
    action: 'read',
    label: 'read the received record together',
    duration: 5,
    effort: 0.03,
    advertises: { belonging: 0.25 },
  };
  const choices = decideTogether(
    people.map((person) => ({
      person,
      affordances: [reading, stove],
      options: { suggestion: { voiceId: 'engineer', affordanceId: reading.id, strength: 0.6 } },
    })),
  );
  expect(choices.map((c) => [c.chosenAffordanceId, c.suggestion?.verdict])).toEqual([
    ['joint-read', 'assented'],
    ['joint-read', 'assented'],
  ]);
  beginTogether(people);
  expect(people.every((p) => p.activity?.affordanceId === reading.id)).toBe(true);
  expect(archiveWatch(people[0]!).run.current.people.dai!.activity?.suggestion?.voiceId).toBe('engineer');
  expect(verifyWatch(people[0]!).verified).toBe(true);
});

// SCOPE: earned practice is the public HF skills owner, never a host level bonus.
it('supplies real skill demands and lets HF learn only from the reached work', async () => {
  const { decide, begin, tick, finish } = await import('../src/sim/hf4.ts');
  const w = openWatch(7),
    p = w.people[0]!;
  const offer = {
    id: 'level',
    action: 'level',
    label: 'read a reached instrument',
    duration: 3,
    effort: 0.4,
    skill: { id: 'gauges', difficulty: 0.3 },
    advertises: { competence: 0.3 },
  };
  const before = archiveWatch(p).run.current.people.dai!.skills.gauges!.practicedMs;
  const rec = decide(p, [offer]);
  expect(begin(p, offer, rec)).not.toBeNull();
  expect(archiveWatch(p).run.current.people.dai!.skills.gauges!.practicedMs).toBe(before);
  tick(p, p.activity!.endsAt);
  finish(p, { action: 'level', at: p.now, status: 'completed' });
  expect(archiveWatch(p).run.current.people.dai!.skills.gauges!.practicedMs).toBeGreaterThan(before);
  expect(verifyWatch(p).verified).toBe(true);
});
// SCOPE: an attended sleep/rest activity may sleep; only HF's involuntary doze
// boundary cancels awake attendance. Body.asleep alone cannot prove lost consent.
it('distinguishes a chosen sleep activity from involuntary doze', async () => {
  const { decide, begin, tick, readDoze } = await import('../src/sim/hf4.ts');
  const w = openWatch(7),
    p = w.people[1]!;
  const a = {
    id: 'chosen-sleep',
    action: 'sleep',
    label: 'sleep during the agreed rest',
    mode: 'sleep' as const,
    duration: 120,
    effort: 0,
    advertises: { sleep: 0.6, rest: 0.4 },
  };
  tick(p, 1440);
  const d = decide(p, [a], { suggestion: { voiceId: 'engineer', affordanceId: a.id, strength: 0.6 } });
  expect(begin(p, a, d)).not.toBeNull();
  tick(p, p.now + 1);
  expect(p.body.asleep).toBe(true);
  expect(readDoze(p)).toBeNull();
  expect(p.activity?.mode).toBe('sleep');
});
