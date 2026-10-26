import { expect, it } from 'vitest';
import { discoveriesFor } from '../src/sim/cast.ts';
import { cloneState, newGame, queueInput, restoreState, step, type WatchRules } from '../src/sim/dam.ts';

// Break caught: awarding tested credit at joint transfer, before Callum independently uses the list.
it('requires a later willing Callum-only procedure and gives no tested credit across duty interruptions', () => {
  const s = newGame(7, undefined, { edition: 'extended-2', dam: 'valley', outcomes: 'handover-1' });
  function ordinaryMinute(task: 'handover' | 'handover-test') {
    if (s.phase === 'dawn') {
      queueInput(s, { kind: 'next' });
      return;
    }
    const m = (s.minute % 1440) - 1320;
    if (m === 1 || m === -1260) queueInput(s, { kind: 'ask', keeper: 'dai', job: 'gate', target: 4 });
    for (const person of discoveriesFor(s)) {
      const first = s.conversations[person];
      if (first === undefined || s.minute - first >= 20) queueInput(s, { kind: 'talk', person });
    }
    if (s.night >= 3 && s.minute % 5 === 0) queueInput(s, { kind: 'outcome', task });
    step(s);
  }
  while (s.phase !== 'end' && !s.outcomes?.handover.transferredAt && !s.outcomes?.handover.completedAt)
    ordinaryMinute('handover');
  const h = s.outcomes?.handover;
  const between = restoreState(cloneState(s));
  queueInput(between, { kind: 'ask', keeper: 'callum', job: 'level' });
  for (let i = 0; i < 30; i++) step(between);
  expect(between.outcomes?.handover.completedAt).toBeUndefined();
  expect(between.outcomes?.handover.test).toBeUndefined();
  expect(h?.completedAt).toBeUndefined();
  expect(h?.test).toBeUndefined();
  expect(h?.transferredAt).toBe((h?.startedAt ?? 0) + 20);
  expect(h?.attendees).toEqual(['dai', 'callum']);
  let interrupted = false;
  while (s.phase !== 'end' && !s.outcomes?.handover.completedAt) {
    ordinaryMinute('handover-test');
    if (!interrupted && s.outcomes?.active?.task === 'handover-test') {
      const stopped = restoreState(cloneState(s));
      queueInput(stopped, { kind: 'ask', keeper: 'callum', job: 'level' });
      for (let i = 0; i < 15; i++) step(stopped);
      expect(stopped.outcomes?.active).toBeUndefined();
      expect(stopped.outcomes?.handover.completedAt).toBeUndefined();
      expect(stopped.outcomes?.handover.test?.stoppedAt).toBeDefined();
      expect(stopped.outcomes?.handover.test?.passed).not.toBe(true);
      interrupted = true;
    }
  }
  expect(interrupted).toBe(true);
  expect(h?.completedAt).toBeDefined();
  expect(h?.test?.startedAt).toBeGreaterThan(h?.transferredAt ?? 0);
  expect((h?.completedAt ?? 0) - (h?.test?.startedAt ?? 0)).toBe(10);
  expect(h?.test?.question).toContain('replaced sensor');
  expect(h?.test?.instruction).toBe(h?.list);
  expect(h?.test?.attendees).toEqual(['callum']);
  expect(h?.test?.answer).toContain('cannot use');
  expect(h?.test?.passed).toBe(true);
  expect(h?.sensor).toBe('marked-unverified');
});

// Break caught: disclosure alone awarding correction or rest without actual cover and elapsed rest.
it('authors Callum’s fictional correction and completes chosen rest with Dai still on duty', () => {
  const s = newGame(7, undefined, {
    edition: 'extended-2',
    dam: 'valley',
    outcomes: 'handover-1',
  } as WatchRules);
  let interrupted = false;
  while (s.phase !== 'end' && !s.outcomes?.correction.restedAt) {
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
    if (s.night >= 3 && s.minute % 5 === 0) queueInput(s, { kind: 'outcome', task: 'correction' });
    step(s);
    if (!interrupted && s.outcomes?.correction.restFrom !== undefined) {
      const stopped = restoreState(cloneState(s));
      queueInput(stopped, { kind: 'ask', keeper: 'callum', job: 'level' });
      step(stopped);
      expect(stopped.outcomes?.correction.restedAt).toBeUndefined();
      expect(stopped.outcomes?.correction.restStoppedAt).toBeDefined();
      expect(stopped.outcomes?.correction.text).toBeDefined();
      interrupted = true;
    }
  }
  expect(interrupted).toBe(true);
  const c = s.outcomes?.correction;
  expect(c?.writtenAt).toBeDefined();
  expect(c?.text).toContain('checked only part');
  expect(c?.signedBy).toBe('Callum');
  expect(c?.filedAt).toBe(c?.writtenAt);
  expect(c?.channel).toBe('fictional-agency-correction-register');
  expect(c?.status).toBe('awaiting-review');
  expect(c?.originalAccount).toContain('signed the record');
  expect(c?.text).toContain('Nothing happened that I know of');
  expect(c?.restedAt).toBe((c?.restFrom ?? 0) + 30);
  expect(c?.cover).toBe('dai');
  expect(c && Object.hasOwn(c, 'reply')).toBe(false);
});
