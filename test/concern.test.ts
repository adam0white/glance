import { describe, expect, it } from 'vitest';
import { keeperOf, newGame, personOf, queueInput, step } from '../src/sim/dam.ts';
import { concernLines, thresholdWords } from '../src/ui/concern.ts';

function reading() {
  const s = newGame(7);
  queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level', insist: true });
  step(s);
  return s;
}

describe('the desk concern', () => {
  it('shows the latest queued request before the next simulation minute', () => {
    const s = newGame(7);
    queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level' });
    expect(concernLines(s).join(' ')).toMatch(/level request waiting for an answer/);
    queueInput(s, { kind: 'ask', keeper: 'dai', job: 'weir' });
    const words = concernLines(s).join(' ');
    expect(words).toContain('weir request waiting for an answer');
    expect(words).not.toContain('level request');
    s.inputs.push({ kind: 'ask', keeper: 'dai', job: 'gate', at: s.minute + 20 });
    expect(concernLines(s).join(' ')).not.toContain('gate request');
  });

  it('shows a queued inn call without promising a river report before she answers', () => {
    const s = newGame(7);
    queueInput(s, { kind: 'ring' });
    expect(concernLines(s).join(' ')).toMatch(/Nerys.*waiting for an answer/);
    expect(concernLines(s).join(' ')).not.toMatch(/Nerys.*expected/);
  });

  it('names the current reading and approximate report time without claiming a return walk', () => {
    expect(concernLines(reading()).join(' ')).toMatch(/Dai.*level.*~22:10/);
    expect(concernLines(reading()).join(' ')).not.toMatch(/return|back at/);
  });

  it('does not disclose a skipped reading through its shortened activity or destination', () => {
    const s = reading();
    const before = concernLines(s);
    const job = keeperOf(s, 'dai').job;
    const activity = personOf(s, 'dai').activity;
    if (!job || !activity) throw new Error('Missing reading fixture');
    job.skip = true;
    job.to = 'hut';
    job.walk = 0;
    activity.endsAt = job.startedAt + 4;
    expect(concernLines(s)).toEqual(before);
    job.job = 'weir';
    expect(concernLines(s).join(' ')).toMatch(/weir.*~22:15/);
  });

  it('estimates gate work from the reported setting without revealing true gate or capacity', () => {
    const s = reading();
    const job = keeperOf(s, 'dai').job;
    const activity = personOf(s, 'dai').activity;
    if (!job || !activity) throw new Error('Missing activity fixture');
    job.job = 'gate';
    job.target = 3;
    if (!s.board.gate) throw new Error('Missing opening gate report');
    s.board.gate.value = 1;
    activity.endsAt = 1341;
    const words = concernLines(s);
    expect(words.join(' ')).toMatch(/Dai.*gate.*~22:15/);
    s.water.gate = 6;
    activity.endsAt = 1387;
    expect(concernLines(s)).toEqual(words);
  });

  it('does not invent a gate completion time without a reported setting', () => {
    const s = reading();
    const job = keeperOf(s, 'dai').job;
    if (!job) throw new Error('Missing activity fixture');
    job.job = 'gate';
    job.target = 3;
    s.board.gate = null;
    expect(concernLines(s).join(' ')).toMatch(/gate.*report expected after.*work/);
    expect(concernLines(s).join(' ')).not.toMatch(/~/);
  });

  it('distinguishes pending requests from unexpired deferred requests', () => {
    const s = newGame(7);
    const k = keeperOf(s, 'dai');
    k.pending = { s: { voiceId: 'engineer', strength: 0.6 }, job: 'weir' };
    expect(concernLines(s).join(' ')).toMatch(/weir.*waiting for.*answer/);
    k.pending = null;
    k.deferred = { s: { voiceId: 'engineer', strength: 0.6 }, job: 'gate', until: s.minute + 5 };
    expect(concernLines(s).join(' ')).toMatch(/gate.*waiting to reconsider/);
    s.minute += 6;
    expect(concernLines(s).join(' ')).not.toContain('reconsider');
  });

  it('shows sleep without promising a wake time or an active reading', () => {
    const s = reading();
    const activity = personOf(s, 'dai').activity;
    if (!activity) throw new Error('Missing activity fixture');
    activity.affordanceId = 'doze';
    expect(concernLines(s).join(' ')).toMatch(/Dai.*not answering/);
    expect(concernLines(s).join(' ')).not.toMatch(/~|reading|wake/);
    activity.affordanceId = 'nap';
    expect(concernLines(s).join(' ')).toContain('asleep, as you said');
  });

  it('names idle availability, an inn report and radio trouble separately', () => {
    const s = newGame(7);
    s.nerys.ringing = s.minute + 3;
    s.radioOut = true;
    const words = concernLines(s).join(' ');
    expect(words).toMatch(/Dai.*available/);
    expect(words).toMatch(/Nerys.*river report.*~/);
    expect(words).toMatch(/Radio.*static/);
  });

  it('uses only the reported level and observation age for the next threshold', () => {
    const s = newGame(7);
    const r = s.board.level;
    if (!r) throw new Error('Missing opening report');
    r.value = 4.8;
    r.at = s.minute - 12;
    expect(thresholdWords(s)).toMatch(/4\.80 m.*12 min.*lip 5\.0 m/);
    const words = thresholdWords(s);
    s.water.level = 6.2;
    expect(thresholdWords(s)).toBe(words);
    r.value = 5;
    expect(thresholdWords(s)).toContain('crest 6.0 m');
    r.value = 6.1;
    expect(thresholdWords(s)).toContain('above crest 6.0 m');
    s.board.level = null;
    expect(thresholdWords(s)).toMatch(/not read.*crest 6\.0 m/);
  });
});
