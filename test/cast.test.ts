import { expect, it } from 'vitest';
import { CAST, discoveriesFor, rememberedConversation } from '../src/sim/cast.ts';
import { cloneState, fingerprint, newGame, queueInput, replay, step } from '../src/sim/dam.ts';

it('creates five allocated HF people without expanding the dam operating crew', () => {
  const s = newGame(7);
  expect(s.people.map((p) => p.id)).toEqual(['dai', 'callum', 'nerys', 'bilal', 'wren']);
  expect(s.keepers.map((p) => p.id)).toEqual(['dai', 'callum']);
  expect(CAST.dai.castId).toBe('hf.cast.dai.glance');
  expect(s.said.some((x) => /shadow animals|omitted an ambiguous|voicemail/.test(x.text))).toBe(false);
});

it('keeps discoveries private until a willing, available conversation and pins them in replay/save', () => {
  const s = newGame(7);
  expect(discoveriesFor(s)).toEqual(['dai']);
  queueInput(s, { kind: 'talk', person: 'wren' });
  step(s);
  expect(s.discoveries.wren).toBeUndefined();
  queueInput(s, { kind: 'talk', person: 'dai' });
  step(s);
  expect(s.discoveries.dai).toBeUndefined(); // first invitation establishes contact
  queueInput(s, { kind: 'talk', person: 'dai' });
  step(s);
  expect(s.discoveries.dai).toBeUndefined(); // no immediate click-through disclosure
  for (let i = 0; i < 20; i++) step(s);
  for (let i = 0; i < 150 && !discoveriesFor(s).includes('dai'); i++) step(s);
  queueInput(s, { kind: 'talk', person: 'dai' });
  step(s);
  expect(s.discoveries.dai).toBe(true);
  expect(s.said.some((x) => x.who === 'dai' && x.text.includes('handover'))).toBe(true);
  const b = replay(s.seed, s.inputs, s.minute);
  expect(fingerprint(b)).toBe(fingerprint(s));
  expect(cloneState(s).discoveries).toEqual(s.discoveries);
  s.night = 2;
  s.said = [];
  expect(rememberedConversation(s, 'dai')).toContain('handover');
  expect(rememberedConversation(s, 'wren')).toBeNull();
});

it('makes each allocated discovery reachable through ordinary inputs without granting operational skills', () => {
  const s = newGame(7);
  while (s.phase !== 'end') {
    if (s.phase === 'dawn') {
      queueInput(s, { kind: 'next' });
      continue;
    }
    const m = (s.minute % 1440) - 1320;
    if (m === 1 || m === -1260) queueInput(s, { kind: 'ask', keeper: 'dai', job: 'gate', target: 4 });
    for (const person of discoveriesFor(s)) {
      const first = s.conversations[person];
      if (first === undefined || s.minute - first >= 20) queueInput(s, { kind: 'talk', person });
    }
    step(s);
  }
  expect(Object.keys(s.discoveries).sort()).toEqual(['bilal', 'callum', 'dai', 'nerys', 'wren']);
  const replayed = replay(s.seed, s.inputs, s.minute);
  expect(fingerprint(replayed)).toBe(fingerprint(s));
  expect(s.people.find((p) => p.id === 'bilal')?.skills.gate).toBeUndefined();
  expect(s.people.find((p) => p.id === 'wren')?.skills.gate).toBeUndefined();
});

it('does not reopen visitor conversations after midnight', () => {
  const s = newGame(7);
  s.night = 2;
  s.minute = 1440 + 60;
  expect(discoveriesFor(s)).not.toContain('bilal');
  expect(discoveriesFor(s)).not.toContain('wren');
});
