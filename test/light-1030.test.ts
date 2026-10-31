// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Report } from '../src/sim/dam.ts';
import { clock, exportRun, keeperOf, newGame, queueInput, replay, step } from '../src/sim/dam.ts';
import { PRIVATE_PREMISE } from '../src/sim/private-scenes.ts';
import { concernLines } from '../src/ui/concern.ts';
import { gateAfterLevel } from '../src/ui/gate-note.ts';
import { exactWords } from '../src/ui/report-words.ts';
import { riverStairsWords, weirWords } from '../src/ui/river-notes.ts';
import { catchWords } from '../src/ui/watch-copy.ts';
import { BrowserWorker, disposeBrowserWorkers } from './browser-worker.ts';

/** Transport control: while `hold` is on, every mutation request waits before the worker sees it. */
let hold = false;
const heldRequests: { worker: HeldWorker; value: unknown }[] = [];
class HeldWorker extends BrowserWorker {
  override postMessage(value: unknown) {
    if (hold && (value as { kind?: string }).kind === 'mutate') {
      heldRequests.push({ worker: this, value });
      return;
    }
    super.postMessage(value);
  }
  deliver(value: unknown) {
    super.postMessage(value);
  }
  refuse(value: unknown) {
    this.onmessage?.({
      data: { id: (value as { id: number }).id, kind: 'refused', message: 'The watch is busy.' },
    } as MessageEvent);
  }
}

vi.mock('../src/ui/lab.ts', () => ({
  lab: {
    setPersonaRecording() {},
    allowPersonaRecording() {},
    build: () => ({ c: 'test' }),
    screen() {},
    milestone() {},
    openSendDialog: vi.fn(),
    trackRun() {},
    captureSave: vi.fn(),
    sendFeedback: vi.fn(async () => 'stored-reference'),
    sendRun: vi.fn(async () => 'queued'),
    setEventsOff: vi.fn(),
    privacySignalOn: false,
    privacyOverride: false,
  },
}));
vi.mock('@adam0white/lab-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@adam0white/lab-client')>()),
  personaChannel: () => ({
    ready: Promise.resolve(true),
    enabled: false,
    setEnabled() {},
    request: async () => null,
  }),
  watchPersonaCheckpoint: () => () => {},
}));

async function settle() {
  for (let i = 0; i < 100; i++) await Promise.resolve();
}
async function click(id: string) {
  document.getElementById(id)?.click();
  await settle();
}
async function tap(button: HTMLElement) {
  button.dispatchEvent(new Event('pointerdown'));
  button.dispatchEvent(new Event('pointerup'));
  await settle();
}
async function boot() {
  const app = await import('../src/ui/app.ts');
  app.start();
  return app._debug;
}
beforeEach(() => {
  hold = false;
  heldRequests.length = 0;
  vi.stubGlobal('Worker', HeldWorker);
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));
  localStorage.clear();
  window.history.replaceState({}, '', '/?lab=1');
  document.body.innerHTML = '<div id="app"></div>';
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  disposeBrowserWorkers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('F-2198 optional chapter copy on the first screen', () => {
  it('keeps the long paragraph out of the note above the gauges and shows it once, collapsed in the log', async () => {
    const debug = await boot();
    await click('new');
    expect(document.getElementById('latest-radio')?.textContent ?? '').not.toContain('dark corners');
    const app = document.getElementById('app') as HTMLElement;
    expect(app.textContent?.split('Her three dark corners').length).toBe(2);
    const note = document.querySelector<HTMLDetailsElement>('#log details.chapter-note');
    expect(note).not.toBeNull();
    expect(note?.open).toBe(false);
    expect(note?.querySelector('summary')?.textContent).toBe('Optional chapter. Read the arrangements.');
    // Disclosure stays complete and word for word inside the collapsed note.
    expect(note?.textContent).toContain(PRIVATE_PREMISE);
    expect(note?.textContent).toContain('Neither channel sends anything outside this game.');
    // The replayed journal line is unchanged.
    expect(debug.state?.said.some((x) => x.text === PRIVATE_PREMISE && x.kind === 'journal')).toBe(true);
    expect(newGame(7).said.some((x) => x.text === PRIVATE_PREMISE)).toBe(true);
  });
  it('still shows a later radio line in the note above the gauges', async () => {
    const debug = await boot();
    await click('new');
    await debug.step(40);
    const newest = debug.state?.said.at(-1);
    expect(newest?.text).not.toBe(PRIVATE_PREMISE);
    expect(document.getElementById('latest-radio')?.textContent).toContain((newest?.text ?? '').slice(0, 20));
  });
});

describe('F-2200 first job and progressive rules', () => {
  const gate = () => (document.querySelector('[data-g="gate"]') as HTMLElement).click();
  it('opens the gate sheet with direction and no insist, forecast or caught rule yet', async () => {
    await boot();
    await click('new');
    gate();
    const sheet = document.getElementById('sheet') as HTMLElement;
    expect(sheet.textContent).toContain('More turns lower the water behind the dam.');
    expect(sheet.textContent).not.toContain('insist');
    // The rule stays reachable, collapsed, in the doubt note.
    expect(sheet.querySelector<HTMLDetailsElement>('details.catch-rule')?.open).toBe(false);
    expect(sheet.querySelector('.reading-note > p.hint')?.textContent).not.toContain('caught');
    expect(sheet.querySelector<HTMLElement>('details.fore')?.hidden).toBe(true);
  });
  it('names insist and shows the forecast at the gate once a first job has been asked', async () => {
    const debug = await boot();
    await click('new');
    await tap(document.querySelector('.first-call [data-job="level"]') as HTMLElement);
    expect(debug.state?.inputs.at(-1)).toMatchObject({ kind: 'ask', job: 'level' });
    gate();
    const sheet = document.getElementById('sheet') as HTMLElement;
    expect(sheet.querySelector('.turns + p.hint')?.textContent).toContain(
      'Tap a button to ask. Hold it to insist. He may still refuse, and insisting can reduce his trust.',
    );
    const fore = sheet.querySelector<HTMLElement>('details.fore');
    expect(fore?.hidden).toBe(false);
    // The forecast sits after the buttons and names what it forecasts, not a feeling over the options.
    const reported = debug.state?.board.gate?.value;
    const target = Math.min(6, (reported ?? 0) + 1);
    expect(fore?.querySelector('summary')?.textContent).toBe(
      `How tired Dai expects to be after the gate is set to ${target} ${target === 1 ? 'turn' : 'turns'}`,
    );
    expect(sheet.textContent).not.toContain('unconditionally');
    expect(sheet.querySelector('.turns')?.nextElementSibling?.tagName).toBe('P');
  });
  it('keeps the caught rule reachable but collapsed in the doubt note', async () => {
    const debug = await boot();
    await click('new');
    await tap(document.querySelector('.first-call [data-job="level"]') as HTMLElement);
    await debug.step(30);
    (document.querySelector('[data-g="level"]') as HTMLElement).click();
    await settle();
    const rule = document.querySelector<HTMLDetailsElement>('.reading-note details.catch-rule');
    expect(rule).not.toBeNull();
    expect(rule?.open).toBe(false);
    expect(rule?.textContent).toContain('A wrong reading counts as caught');
    expect(document.querySelector('.reading-note > p.hint')?.textContent).not.toContain('counts as caught');
  });
});

describe('F-2208 standing request wording', () => {
  it('says what saving does, offers a Save button and still promises nothing', async () => {
    const debug = await boot();
    await click('new');
    (document.querySelector('[data-watch-arrangements]') as HTMLElement).click();
    await settle();
    const dialog = document.getElementById('watch-arrangements') as HTMLElement;
    expect(document.getElementById('set-standing')?.textContent).toBe('Save this request');
    expect(dialog.textContent).not.toContain('Leave this request');
    expect(dialog.textContent).toContain('No request exists until you save it.');
    expect(dialog.textContent).toContain('The request is saved when you press the button.');
    expect(dialog.textContent).toContain('Once saved, a request waits for a new local level reading.');
    expect(dialog.textContent).toContain('These are requests, not promises.');
    expect(dialog.textContent).toContain('the keeper decides whether to do the gate work');
    const before = debug.state?.inputs.length ?? 0;
    document.getElementById('set-standing')?.click();
    await settle();
    expect(debug.state?.inputs.slice(before).map((x) => x.kind)).toEqual(['standing']);
  });
});

describe('F-2206 night one river side', () => {
  it('says on night one when the river reports begin, using the authored plan', async () => {
    await boot();
    await click('new');
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    expect(document.getElementById('sheet')?.textContent).toContain(
      'Tonight the board shows only the dam. The Bridge Inn’s river reports begin on Tuesday.',
    );
  });
});

describe('F-2203 gate reading against level reading, by written time', () => {
  const report = (gauge: 'level' | 'gate', at: number, wrote: number): Report => ({
    at,
    wrote,
    who: 'dai',
    gauge,
    value: gauge === 'gate' ? 2 : 3.5,
    truth: 0,
    conf: 1,
    clarity: 1,
    cause: 'fresh',
    skipped: false,
  });
  it('names both written times, not the delivery time of a held gate report', () => {
    // Written 22:30 (1350); delivered after a radio outage at 23:50 (1430).
    const text = gateAfterLevel(report('level', 1335, 1335), report('gate', 1430, 1350));
    expect(text).toContain('read 22:30 (as written)');
    expect(text).toContain('read 22:15 (as written)');
    expect(text).not.toContain(clock(1430));
    expect(text).not.toMatch(/because|caused|lowered|raised/);
  });
  it('says nothing when the gate reading was written before the level reading', () => {
    expect(gateAfterLevel(report('level', 1360, 1360), report('gate', 1430, 1350))).toBe('');
    expect(gateAfterLevel(undefined, report('gate', 1350, 1350))).toBe('');
  });
  it('shows it in the level sheet of a saved first night with a bounded generated fixture', async () => {
    const saved = replay(
      7,
      [
        { at: 1321, kind: 'ask', keeper: 'dai', job: 'level', insist: false },
        { at: 1335, kind: 'ask', keeper: 'dai', job: 'gate', target: 2, insist: false },
      ],
      1370,
    );
    expect(saved.board.gate?.wrote).toBeGreaterThan(saved.board.level?.wrote ?? Number.MAX_SAFE_INTEGER);
    localStorage.setItem(
      'glance-cast-local-v3',
      JSON.stringify({
        run: exportRun(saved, '4.14.0'),
        runId: 'test-run',
        heads: [],
        fileOrigin: false,
        sources: [],
      }),
    );
    await boot();
    await click('cont');
    (document.querySelector('[data-g="level"]') as HTMLElement).click();
    const note = document.querySelector('.gate-after')?.textContent ?? '';
    expect(note).toContain(`read ${clock(saved.board.gate?.wrote ?? 0)} (as written)`);
    expect(note).toContain(`read ${clock(saved.board.level?.wrote ?? 0)} (as written)`);
  });
});

describe('F-2209 what a new call does to earlier work', () => {
  const dai = (s: ReturnType<typeof newGame>) => keeperOf(s, 'dai');
  const levelReports = (s: ReturnType<typeof newGame>) =>
    s.reports.filter((r) => r.gauge === 'level').map((r) => r.at);
  const play = (second?: { job: 'level' | 'gate' | 'nap'; target?: number }, between = 3) => {
    const s = newGame(7);
    step(s);
    queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level', insist: false });
    for (let i = 0; i < between; i++) step(s);
    if (second)
      queueInput(s, {
        kind: 'ask',
        keeper: 'dai',
        job: second.job,
        ...(second.target === undefined ? {} : { target: second.target }),
        insist: false,
      });
    for (let i = 0; i < 40; i++) step(s);
    return s;
  };
  it('source: two calls with no step between leave only the second one', () => {
    const s = newGame(7);
    step(s);
    queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level', insist: false });
    queueInput(s, { kind: 'ask', keeper: 'dai', job: 'gate', target: 2, insist: false });
    expect(s.inputs.slice(s.applied).map((i) => i.kind)).toEqual(['ask', 'ask']);
    for (let i = 0; i < 40; i++) step(s);
    expect(levelReports(s)).toEqual([1320]);
    expect(s.reports.some((r) => r.gauge === 'gate' && r.at > 1320)).toBe(true);
  });
  it('source: repeating the active level call restarts it and the report comes later', () => {
    expect(levelReports(play())).toEqual([1320, 1331]);
    expect(levelReports(play({ job: 'level' }))).toEqual([1320, 1334]);
  });
  it('source: a request he does not take up still interrupts the active job and delays its report', () => {
    const s = play({ job: 'nap' });
    expect(dai(s).job?.job).not.toBe('nap');
    expect(levelReports(s)).toEqual([1320, 1334]);
  });
  it('desk: with the first call still queued the gate sheet says once that a new call replaces it', async () => {
    const debug = await boot();
    await click('new');
    await tap(document.querySelector('.first-call [data-job="level"]') as HTMLElement);
    const queued = debug.state?.inputs.slice(debug.state.applied) ?? [];
    expect(queued.map((i) => i.kind)).toEqual(['ask']);
    expect(debug.state?.keepers.find((k) => k.id === 'dai')?.pending ?? null).toBeNull();
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    const notes = document.querySelectorAll('.sheet .call-note');
    expect(notes).toHaveLength(1);
    expect((notes[0] as HTMLElement).hidden).toBe(false);
    expect(notes[0]?.textContent).toContain(
      'Your earlier call to Dai is still waiting. A new call replaces it.',
    );
    expect(notes[0]?.textContent).toContain('even if he does not agree');
    // F-2355: none of the six turn buttons repeats it.
    const buttons = [...document.querySelectorAll('.turns [data-job="gate"] .h')];
    expect(buttons).toHaveLength(6);
    for (const b of buttons)
      expect(b.textContent).not.toMatch(/interrupt|still waiting|report can come later/);
  });
  it('source (pure function on a built state, as concern.test.ts does): a live deferred request counts as waiting; an expired one does not', async () => {
    const { callExplanation } = await import('../src/ui/app.ts');
    const state = newGame(7);
    const dai = keeperOf(state, 'dai');
    expect(callExplanation(state, 'dai')).not.toContain('still waiting');
    dai.deferred = { s: { voiceId: 'engineer', strength: 0.6 }, job: 'gate', until: state.minute + 5 };
    expect(callExplanation(state, 'dai')).toContain(
      'Your earlier call to Dai is still waiting. A new call replaces it.',
    );
    state.minute += 6;
    expect(callExplanation(state, 'dai')).not.toContain('still waiting');
  });
  it('desk: during an active level job the sheet says once that a call interrupts; none before any call', async () => {
    const debug = await boot();
    await click('new');
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    expect(document.querySelector<HTMLElement>('.sheet .call-note')?.hidden).toBe(true);
    await click('x');
    await tap(document.querySelector('.first-call [data-job="level"]') as HTMLElement);
    await debug.step(3);
    expect(debug.state?.keepers.find((k) => k.id === 'dai')?.job?.job).toBe('level');
    (document.querySelector('[data-g="level"]') as HTMLElement).click();
    const again = document.querySelector('.sheet .call-note')?.textContent ?? '';
    expect(again).toContain('A call interrupts what Dai is doing now, even if he does not agree.');
    expect(again).toContain(
      'If he takes up that job again afterwards, it starts again and its report can come later.',
    );
    expect(again).not.toContain('A call for the job he is already doing starts it again.');
    expect(document.querySelector('.sheet [data-job="level"] .h')?.textContent).not.toContain('interrupts');
    await click('x');
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    expect(document.querySelectorAll('.sheet .call-note')).toHaveLength(1);
    for (const b of document.querySelectorAll('.turns [data-job="gate"] .h'))
      expect(b.textContent).not.toContain('interrupts');
  });
});

describe('F-2350 level tile after Dai reads on his own', () => {
  it('source: with no ask at all Dai reports the level again, so a later report exists', () => {
    const s = newGame(7);
    for (let i = 0; i < 80; i++) step(s);
    expect(s.inputs.some((i) => i.kind === 'ask')).toBe(false);
    const level = s.reports.filter((r) => r.gauge === 'level');
    expect(level.length).toBeGreaterThan(1);
    expect(s.board.level).toBe(level.at(-1));
  });
  it('desk: the tile shows that later reading with its written time, not "not read"', async () => {
    const state = replay(7, [], 1400);
    const later = state.board.level as Report;
    expect(later.at).toBeGreaterThan(1320);
    localStorage['glance-cast-local-v3'] = JSON.stringify({
      run: exportRun(state, '4.14.0'),
      runId: 'test-run',
      heads: [],
      fileOrigin: false,
      sources: [],
    });
    await boot();
    await click('cont');
    const tile = document.querySelector('[data-g="level"]')?.textContent ?? '';
    expect(tile).not.toContain('not read');
    expect(tile).toContain(later.value.toFixed(2));
    expect(tile).toContain(`read ${clock(later.wrote)}`);
  });
  it('desk: before any report beyond the opening the tile still holds the greeting back', async () => {
    await boot();
    await click('new');
    expect(document.querySelector('[data-g="level"]')?.textContent).toContain('not read');
  });
});

describe('F-2353 / F-2359 doubt receipt', () => {
  async function toLevelSheet() {
    const debug = await boot();
    await click('new');
    await tap(document.querySelector('.first-call [data-job="level"]') as HTMLElement);
    await debug.step(30);
    (document.querySelector('[data-g="level"]') as HTMLElement).click();
    await settle();
    return debug;
  }
  it('shows at once that the mark is waiting, then that it is recorded', async () => {
    const debug = await toLevelSheet();
    const before = debug.state?.board.level as Report;
    const index = debug.state?.reports.indexOf(before) ?? -1;
    await click('reading-note');
    const queued = debug.state?.inputs.slice(debug.state.applied) ?? [];
    expect(queued.map((i) => i.kind)).toEqual(['doubt']);
    expect(before.doubted).not.toBe(true);
    expect(document.getElementById('clock-rate')?.textContent).toContain(
      'Your doubt mark is waiting to be recorded.',
    );
    expect(document.querySelector('[data-g="level"]')?.textContent).toContain('Doubt mark waiting');
    await debug.step(1);
    expect(debug.state?.reports[index]?.doubted).toBe(true);
    expect(document.getElementById('clock-rate')?.textContent).toContain(
      'Recorded: this reading is marked for another check.',
    );
    expect(document.querySelector('[data-g="level"]')?.textContent).toContain('Marked for another check');
  });
  it('says it was not recorded when the mark was made on a reading that is no longer on the board', async () => {
    const debug = await toLevelSheet();
    const s = debug.state as ReturnType<typeof newGame>;
    const levels = s.reports.filter((r) => r.gauge === 'level');
    expect(levels.length).toBeGreaterThan(1);
    const old = levels[0] as Report;
    expect(s.board.level).not.toBe(old);
    // A sheet drawn before the newer reading arrived still points at the older one.
    document.getElementById('reading-note')?.setAttribute('data-report', String(s.reports.indexOf(old)));
    await click('reading-note');
    expect(document.getElementById('clock-rate')?.textContent).toContain(
      'Your doubt mark is waiting to be recorded.',
    );
    await debug.step(1);
    expect(debug.state?.reports[s.reports.indexOf(old)]?.doubted).not.toBe(true);
    expect(document.getElementById('clock-rate')?.textContent).toContain(
      'The doubt mark was not recorded, because that reading is no longer on the board.',
    );
  });
});

describe('F-2358 weir and bridge reference', () => {
  const weirReport = (value: number) =>
    ({
      at: 1500,
      wrote: 1490,
      who: 'dai',
      gauge: 'weir',
      value,
      truth: 9,
      conf: 0.8,
      clarity: 0.8,
      cause: 'fresh',
      skipped: false,
    }) as Report;
  it('weir words give the dial range and the reading position, and no warning figure', () => {
    const words = weirWords(weirReport(0.37));
    expect(words).toContain('runs from 0 to 1.6 m');
    expect(words).toContain(`0.37 m (read ${clock(1490)} (as written))`);
    expect(words).toContain('about a quarter of the way up');
    expect(words).toContain('Nothing on the board marks a safe or a dangerous weir figure.');
    expect(words).not.toContain('9');
    expect(weirWords(null)).not.toContain('last weir reading');
    expect(weirWords(weirReport(1.6))).toContain('at the top');
  });
  it('the stairs words repeat the step meanings Nerys already speaks', () => {
    expect(riverStairsWords()).toContain('Mill Lane floods at step 5, the top step.');
    expect(riverStairsWords()).toContain('nothing to worry about');
  });
});

describe('F-2209 / F-2353 a waiting gate request names its setting', () => {
  it('shows the setting the replacing request asks for', () => {
    const s = newGame(7);
    queueInput(s, { kind: 'ask', keeper: 'dai', job: 'gate', target: 1, insist: false });
    queueInput(s, { kind: 'ask', keeper: 'dai', job: 'gate', target: 4, insist: false });
    expect(concernLines(s).join(' ')).toContain(
      'Your request to set the gate to 4 turns is waiting for an answer.',
    );
  });
});

describe('F-2348 opening notes and the Dai strip (source candidates, geometry not measured)', () => {
  it('the opening forecast and desk notes share one folded line; the optional premise is unchanged', async () => {
    await boot();
    await click('new');
    const fold = document.querySelector<HTMLDetailsElement>('#log details.opening-note');
    expect(fold?.open).toBe(false);
    expect(fold?.textContent).toContain('The weather service expects rain over the hills');
    expect(fold?.textContent).toContain('This is my first week on the night desk.');
    expect(fold?.textContent).toContain('Every reading on this board is what Dai saw.');
    const open = [...document.querySelectorAll('#log .line')]
      .filter((l) => !l.querySelector('details'))
      .map((l) => l.textContent)
      .join(' ');
    expect(open).not.toContain('The weather service');
    expect(open).not.toContain('first week on the night desk');
    expect(open).toContain('Good evening.');
    const premise = document.querySelector('#log details.chapter-note');
    expect(premise?.querySelector('summary')?.textContent).toBe('Optional chapter. Read the arrangements.');
    expect(premise?.querySelector('span')?.textContent).toBe(PRIVATE_PREMISE);
  });
  it('a resting keeper has a long status; the chip keeps it whole in its title and the sheet shows it; phone chips wrap to two lines', async () => {
    await boot();
    await click('new');
    const debug = (await import('../src/ui/app.ts'))._debug;
    await debug.step(1);
    const line =
      concernLines(debug.state as ReturnType<typeof newGame>).find((l) => l.startsWith('Dai:')) ?? '';
    expect(line).toContain('resting by the stove');
    expect(line.length).toBeGreaterThan('Dai: He is available.'.length);
    const chip = document.querySelector<HTMLElement>('#concern [data-k="dai"]');
    expect(chip?.title).toBe(line);
    chip?.click();
    await settle();
    expect(document.querySelector('.sheet .who .soft')?.textContent).toBe(line);
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/ui/style.css', 'utf8');
    const rule = css.match(/@media \(max-width: 767px\) \{\s*#concern \.keeper-chip \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toContain('-webkit-line-clamp: 2');
    expect(rule).toContain('white-space: normal');
    expect(rule).not.toContain('nowrap');
  });
});

describe('F-2349 the existing optional talk, named without answering Morgan', () => {
  async function daiSheet(minute: number) {
    const state = replay(7, [], minute);
    localStorage['glance-cast-local-v3'] = JSON.stringify({
      run: exportRun(state, '4.14.0'),
      runId: 'test-run',
      heads: [],
      fileOrigin: false,
      sources: [],
    });
    await boot();
    await click('cont');
    (document.querySelector('#concern [data-k="dai"]') as HTMLElement).click();
    await settle();
    return state;
  }
  it('after Dai asks about Morgan the sheet says there is no answer and states the real talk availability', async () => {
    await daiSheet(1320 + 200);
    const cue = document.querySelector('.sheet .talk-cue')?.textContent ?? '';
    expect(cue).toContain('Dai asked where Morgan went. This game has no answer to that.');
    expect(cue).toContain('does not answer it');
    const talk = document.querySelector<HTMLButtonElement>('.sheet [data-talk="dai"]');
    expect(talk).not.toBeNull();
    expect(cue.includes('He is free to talk now.')).toBe(!talk?.disabled);
    if (talk?.disabled) expect(cue).toContain('only if he trusts you enough');
    expect(document.querySelector('.sheet details.fore summary')?.textContent).toContain('Talk with Dai');
  });
  it('the cue appears in an open Dai sheet when the authored question arrives, without disturbing it', async () => {
    const debug = await boot();
    await click('new');
    await debug.step(180);
    (document.querySelector('#concern [data-k="dai"]') as HTMLElement).click();
    await settle();
    const cue = document.querySelector<HTMLElement>('.sheet .talk-cue') as HTMLElement;
    const parent = cue.parentElement as HTMLElement;
    const signature = () => [...parent.children].map((c) => `${c.tagName}.${c.className}`).join('|');
    const before = signature();
    expect(cue.hidden).toBe(true);
    const button = document.querySelector<HTMLButtonElement>('.sheet .verbs button') as HTMLButtonElement;
    button.focus();
    const fold = document.querySelector<HTMLDetailsElement>('.sheet details.fore') as HTMLDetailsElement;
    fold.open = true;
    expect(debug.state?.said.some((x) => x.text.includes('Where has Morgan gone'))).toBe(false);
    for (let i = 0; i < 30 && cue.hidden; i++) await debug.step(1);
    expect(debug.state?.said.some((x) => x.text.includes('Where has Morgan gone'))).toBe(true);
    expect(cue.hidden).toBe(false);
    expect(document.querySelector('.sheet .talk-cue')).toBe(cue);
    expect(signature()).toBe(before);
    expect(document.activeElement).toBe(button);
    expect(fold.open).toBe(true);
    const talk = document.querySelector<HTMLButtonElement>('.sheet [data-talk="dai"]');
    expect(cue.textContent).toContain('This game has no answer to that.');
    expect(cue.textContent?.includes('He is free to talk now.')).toBe(!talk?.disabled);
  }, 30_000);
  it('before Dai asks there is no cue', async () => {
    await daiSheet(1320 + 60);
    expect(document.querySelector<HTMLElement>('.sheet .talk-cue')?.hidden).toBe(true);
  });
});

describe('F-2357 the caught heading says what caught means', () => {
  it('the heading is plain, the fold stays collapsed, and the rule text is unchanged', async () => {
    const debug = await boot();
    await click('new');
    await tap(document.querySelector('.first-call [data-job="level"]') as HTMLElement);
    await debug.step(30);
    (document.querySelector('[data-g="level"]') as HTMLElement).click();
    await settle();
    const rule = document.querySelector<HTMLDetailsElement>('.reading-note details.catch-rule');
    expect(rule?.open).toBe(false);
    expect(rule?.querySelector('summary')?.textContent).toBe(
      'What does “caught” mean? A wrong reading can be caught by checking it again, by lightning, or by your doubt mark. Open for the time limits.',
    );
    expect(rule?.querySelector('p')?.textContent).toBe(catchWords());
  });
});

describe('F-2360 the saved lightning drawing on a narrow screen (source candidate, size not measured)', () => {
  // Scope: happy-dom with a stubbed media query. This checks which drawing the code builds for the same
  // saved evidence; it is not live geometry, rendered size, scrolling or pointer proof.
  it('keeps the same saved time, lines and text, and only stretches the height', async () => {
    let narrow = false;
    const changes: (() => void)[] = [];
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: narrow && query.includes('767px'),
      media: query,
      addEventListener(_: string, fn: () => void) {
        changes.push(fn);
      },
      removeEventListener() {},
    }));
    window.matchMedia = globalThis.matchMedia;
    // One computed state and one native boot. The state is paused at the same minute for both drawings.
    const state = replay(7, [], 1320 + 120);
    expect(state.flashes.length).toBeGreaterThan(0);
    localStorage['glance-cast-local-v3'] = JSON.stringify({
      run: exportRun(state, '4.14.0'),
      runId: 'test-run',
      heads: [],
      fileOrigin: false,
      sources: [],
    });
    const debug = await boot();
    await click('cont');
    const openLevel = async () => {
      (document.querySelector('[data-g="level"]') as HTMLElement).click();
      await settle();
      return document.querySelector('#observation');
    };
    const wide = await openLevel();
    const wideText = wide?.textContent;
    const wideLines = [...(wide?.querySelectorAll('svg path') ?? [])].map((p) => p.getAttribute('d'));
    expect(wide?.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 300 170');
    expect(wideText).toContain(`Lightning at ${clock(state.flashes.at(-1)?.at ?? 0)}`);
    // The boundary changes with the sheet still open: only the saved drawing is redrawn.
    const mark = document.getElementById('reading-note');
    const minute = debug.state?.minute;
    narrow = true;
    for (const fn of changes) fn();
    expect(document.getElementById('reading-note')).toBe(mark);
    expect(debug.state?.minute).toBe(minute);
    expect(document.querySelector('#observation svg')?.getAttribute('viewBox')).toBe('0 0 300 238');
    // Reopen the same sheet, with no step between, once the media query matches.
    await click('x');
    const narrowSection = await openLevel();
    expect(narrowSection?.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 300 238');
    expect(narrowSection?.textContent).toBe(wideText);
    expect([...(narrowSection?.querySelectorAll('svg path') ?? [])]).toHaveLength(wideLines.length);
    expect(narrowSection?.querySelector('svg text')?.textContent).toBe('Dam crest');
  });
});

describe('RT2 doubt submission before the watch answers', () => {
  async function toLevelSheet() {
    const debug = await boot();
    await click('new');
    await tap(document.querySelector('.first-call [data-job="level"]') as HTMLElement);
    await debug.step(30);
    (document.querySelector('[data-g="level"]') as HTMLElement).click();
    await settle();
    return debug;
  }
  const status = () => document.getElementById('clock-rate')?.textContent ?? '';
  it('says it is sending, never refused or recorded, while the request is held; the timer waits for the answer', async () => {
    const debug = await toLevelSheet();
    hold = true;
    await click('reading-note');
    expect(heldRequests).toHaveLength(1);
    expect(status()).toContain('Sending your doubt mark to the watch.');
    expect(status()).not.toMatch(/no longer on the board|not recorded|did not accept|Recorded/);
    expect(document.querySelector('[data-g="level"]')?.textContent).toContain('Doubt mark waiting');
    // A long wait with no answer must not expire the receipt.
    vi.advanceTimersByTime(60_000);
    await debug.step(0);
    expect(status()).toContain('Sending your doubt mark to the watch.');
    // The answer arrives: the mark is queued, then recorded on the next minute.
    hold = false;
    for (const { worker, value } of heldRequests.splice(0)) worker.deliver(value);
    await settle();
    expect(status()).toContain('Your doubt mark is waiting to be recorded.');
    await debug.step(1);
    expect(status()).toContain('Recorded: this reading is marked for another check.');
  });
  it('shows a refusal only after the watch refuses, and then lets it expire', async () => {
    const debug = await toLevelSheet();
    hold = true;
    await click('reading-note');
    expect(status()).toContain('Sending your doubt mark to the watch.');
    const [held] = heldRequests.splice(0);
    held?.worker.refuse(held.value);
    await settle();
    expect(status()).toContain('The watch did not accept that change. Nothing changed.');
    expect(status()).not.toContain('no longer on the board');
    expect(document.querySelector('[data-g="level"]')?.textContent).not.toContain('Doubt mark waiting');
    vi.advanceTimersByTime(9_000);
    hold = false;
    await debug.step(0);
    expect(status()).not.toContain('did not accept');
  });
});

describe('RT3 the call note keeps the sheet structure while an owner-driven job starts and ends', () => {
  const signature = (el: Element) => [...el.children].map((c) => `${c.tagName}.${c.className}`).join('|');
  it('gate sheet held open: note text changes, focus, open fold and nodes stay', async () => {
    const debug = await boot();
    await click('new');
    await tap(document.querySelector('.first-call [data-job="level"]') as HTMLElement);
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    const note = document.querySelector<HTMLElement>('.sheet .call-note') as HTMLElement;
    const parent = note.parentElement as HTMLElement;
    const before = signature(parent);
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain('still waiting');
    const button = document.querySelector<HTMLButtonElement>('.turns [data-job="gate"]') as HTMLButtonElement;
    button.focus();
    const fold = document.querySelector<HTMLDetailsElement>('details.fore') as HTMLDetailsElement;
    fold.hidden = false;
    fold.open = true;
    const seen = new Set<string>([note.textContent ?? '']);
    let hiddenAgain = false;
    for (let i = 0; i < 40 && !hiddenAgain; i++) {
      await debug.step(1);
      expect(document.querySelector('.sheet .call-note')).toBe(note);
      expect(signature(parent)).toBe(before);
      expect(document.activeElement).toBe(button);
      expect(fold.open).toBe(true);
      seen.add(note.hidden ? 'HIDDEN' : (note.textContent ?? ''));
      hiddenAgain = Boolean(note.hidden);
    }
    expect(debug.state?.keepers.find((k) => k.id === 'dai')?.job?.job).not.toBe('level');
    expect([...seen].some((x) => x.includes('A call interrupts what Dai is doing now'))).toBe(true);
    expect(hiddenAgain).toBe(true);
    expect(document.querySelector('#reading-note')).not.toBeNull();
    expect(
      document.querySelector('.sheet .call-note + .fore, .sheet .call-note ~ details.fore'),
    ).not.toBeNull();
  });
});

describe('RT6 the preview names its target when the gate is fully open', () => {
  it('reported 6/6: the heading names 6 turns, not one more', async () => {
    const state = replay(
      7,
      [
        { at: 1321, kind: 'ask', keeper: 'dai', job: 'level', insist: false },
        { at: 1335, kind: 'ask', keeper: 'dai', job: 'gate', target: 6, insist: false },
      ],
      1500,
    );
    expect(state.board.gate?.value).toBe(6);
    localStorage['glance-cast-local-v3'] = JSON.stringify({
      run: exportRun(state, '4.14.0'),
      runId: 'test-run',
      heads: [],
      fileOrigin: false,
      sources: [],
    });
    await boot();
    await click('cont');
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    const summary = document.querySelector('details.fore summary')?.textContent;
    expect(summary).toBe('How tired Dai expects to be after the gate is set to 6 turns');
    expect(summary).not.toContain('one more');
  });
});

describe('RT7 first-call instruction after a volunteered level report', () => {
  it('tile and instruction agree on the same no-ask replay', async () => {
    const state = replay(7, [], 1400);
    expect(state.inputs.some((i) => i.kind === 'ask')).toBe(false);
    const later = state.board.level as Report;
    expect(later.at).toBeGreaterThan(1320);
    localStorage['glance-cast-local-v3'] = JSON.stringify({
      run: exportRun(state, '4.14.0'),
      runId: 'test-run',
      heads: [],
      fileOrigin: false,
      sources: [],
    });
    await boot();
    await click('cont');
    expect(document.querySelector('[data-g="level"]')?.textContent).not.toContain('not read');
    expect(document.querySelector('.first-call')).toBeNull();
    expect(document.getElementById('sheet')?.textContent).not.toContain('Nobody has read the level tonight');
  });
  it('a new game still shows the staged first call', async () => {
    await boot();
    await click('new');
    expect(document.querySelector('.first-call')?.textContent).toContain('Nobody has read the level tonight');
  });
});

describe('Level tile name and quoted keeper words (UI fixture: happy-dom, real worker owner, seed 7)', () => {
  async function dayOneRead(steps: number) {
    const debug = await boot();
    await click('new');
    await tap(document.querySelector('.first-call [data-job="level"]') as HTMLElement);
    await debug.step(steps);
    return debug;
  }
  it('the level tile keeps its handwriting letters but has one whole accessible name', async () => {
    const debug = await dayOneRead(15);
    const report = debug.state?.board.level as Report;
    expect(report.at).toBeGreaterThan(1320);
    const tile = document.querySelector<HTMLElement>('[data-g="level"]') as HTMLElement;
    // Visual handwriting is kept: the byline is still split into one span per letter.
    expect(tile.querySelectorAll('.by .w > span').length).toBeGreaterThan(10);
    const name = tile.getAttribute('aria-label') ?? '';
    expect(name).toBe(
      `level, ${report.value.toFixed(2)} m, Dai · read ${clock(report.wrote)} (as written)${tile.querySelector('.was')?.textContent ? `, ${tile.querySelector('.was')?.textContent}` : ''}`,
    );
    expect(name).not.toMatch(/\b\w \w \w\b/);
    expect(tile.getAttribute('aria-pressed')).toBe('false');
  });
  it('before Dai reads again the level sheet quotes his real opening sentence, not a rebuilt phrase', async () => {
    const debug = await dayOneRead(3);
    const state = debug.state as ReturnType<typeof newGame>;
    const opening = state.board.level as Report;
    expect(opening.at).toBe(1320);
    const said = state.said.find((x) => x.kind === 'report' && x.who === 'dai' && x.at === 1320);
    expect(said?.text).toMatch(/^Good evening\. The level is .*, and the gate is /);
    (document.querySelector('[data-g="level"]') as HTMLElement).click();
    await settle();
    const hint = document.getElementById('sheet')?.textContent ?? '';
    expect(hint).toContain(`“${said?.text}”`);
    expect(hint).not.toContain("I'm sure");
  });
  it('a later report is quoted only when its retained line matches; a radio-delayed one never is', async () => {
    const debug = await dayOneRead(15);
    const state = debug.state as ReturnType<typeof newGame>;
    const later = state.board.level as Report;
    const line = state.said.find((x) => x.kind === 'report' && x.who === 'dai' && x.at === later.at);
    expect(exactWords(state, later)).toBe(line?.text);
    // Same retained log, a copy of that report marked late: the association is not guessed.
    expect(exactWords(state, { ...later, late: true })).toBeNull();
    // A second line for the same keeper and minute makes the match ambiguous.
    const twice = { ...state, said: [...state.said, ...(line ? [line] : [])] } as typeof state;
    expect(exactWords(twice, later)).toBeNull();
    // Pure view fixture on those copies, not a played journey: no quotation marks, no claim about stored words.
    const { lastWords } = await import('../src/ui/app.ts');
    const unmatched = lastWords(twice, 'level');
    expect(unmatched).toContain('This panel cannot match an exact quote to this reading.');
    expect(unmatched).not.toMatch(/[“”]|not kept/);
    expect(unmatched).toContain(clock(later.wrote));
    (document.querySelector('[data-g="level"]') as HTMLElement).click();
    await settle();
    expect(document.getElementById('sheet')?.textContent).toContain(`“${line?.text}”`);
  });
});
