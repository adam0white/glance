// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportRun, fingerprint, type GameState, newGame, queueInput, step } from '../src/sim/dam.ts';
import { SAMPLE_DAWN } from '../src/ui/opener.ts';
import { reportBody } from '../src/ui/report.ts';

// Notebook telemetry is external; keep the game and its DOM real.
vi.mock('../src/ui/lab.ts', () => ({
  lab: { screen() {}, milestone() {}, openSendDialog() {} },
}));

function click(id: string) {
  const button = document.getElementById(id);
  expect(button, id).not.toBeNull();
  button?.click();
}

async function boot() {
  const app = await import('../src/ui/app.ts');
  app.start();
  return app._debug;
}

function state(debug: { state: GameState | null }): GameState {
  if (!debug.state) throw new Error('No game at the desk');
  return debug.state;
}

async function importRun(run: ReturnType<typeof exportRun>) {
  const file = document.getElementById('file') as HTMLInputElement;
  Object.defineProperty(file, 'files', {
    value: [{ text: async () => JSON.stringify(run) }],
  });
  file.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(document.getElementById('file')).toBeNull());
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('alert', () => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the first page of a new week', () => {
  it('offers the first reading directly after a short goal without advancing the run', async () => {
    const debug = await boot();
    const titleWords = document.querySelector('#goal')?.textContent?.trim().split(/\s+/).length;
    expect(titleWords).toBeLessThanOrEqual(20);
    click('new');
    expect(document.querySelector('.opener')).toBeNull();
    expect(document.querySelector('[data-job="level"]')).not.toBeNull();
    expect(state(debug).inputs).toHaveLength(0);
    expect(state(debug).minute).toBe(1320);
  });

  it('keeps the old rules and sample report reachable on request', async () => {
    const debug = await boot();
    click('new');
    const before = fingerprint(state(debug));
    click('help');
    expect(document.querySelector('#about #chart')).not.toBeNull();
    expect(document.querySelector('#about')?.textContent).toContain('More gate turns');
    click('close-about');
    expect(document.querySelector('[data-job="level"]')).not.toBeNull();
    expect(fingerprint(state(debug))).toBe(before);
  });

  it('names a pending reading and replaces it with an expected report time', async () => {
    const debug = await boot();
    click('new');
    const request = document.querySelector('[data-job="level"]') as HTMLElement;
    request.dispatchEvent(new Event('pointerdown'));
    request.dispatchEvent(new Event('pointerup'));
    expect(document.querySelector('#concern')?.textContent).toContain('level request');
    expect(document.querySelector('#concern')?.textContent).toContain('waiting for an answer');
    debug.step(1);
    expect(document.querySelector('#concern')?.textContent).toMatch(/Dai.*level.*expected ~22:/);
    debug.step(20);
    expect(document.querySelector('#concern')?.textContent).not.toContain('waiting for an answer');
    expect(document.querySelector('#threshold')?.textContent).toContain('Last level');
  });

  it('keeps all gate choices and their rule together, with selection separate from attention', async () => {
    await boot();
    click('new');
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    expect(document.querySelector('.watch.sheet-open')).not.toBeNull();
    expect(document.querySelectorAll('.turns [data-job="gate"]')).toHaveLength(6);
    expect(document.querySelector('.sheet .hint')?.textContent).toContain('Hold a button');
    expect(document.querySelector('#concern.attention')).not.toBeNull();
    expect(document.querySelector('#speed [aria-pressed="true"]')).not.toBeNull();
  });

  it('skips the opener when returning to a saved desk', async () => {
    localStorage.setItem('glance-save-v1', JSON.stringify({ seed: 7, inputs: [], minute: 1340 }));
    const debug = await boot();
    click('cont');
    expect(document.querySelector('.watch')).not.toBeNull();
    expect(document.querySelector('.opener')).toBeNull();
    expect(debug.state?.minute).toBe(1340);
  });

  it('imports a replay directly without showing the opener or changing its fingerprint', async () => {
    const run = newGame(7);
    for (let n = 0; n < 20; n++) step(run);
    const debug = await boot();
    await importRun(exportRun(run, 'test'));
    expect(document.querySelector('.watch')).not.toBeNull();
    expect(document.querySelector('.opener')).toBeNull();
    expect(fingerprint(state(debug))).toBe(fingerprint(run));
  });

  it('makes an early ending explicit on the last dawn and offers the first reading again for another week', async () => {
    const debug = await boot();
    click('new');
    state(debug).water.overtopped = true;
    debug.step(1);
    expect(debug.state?.phase).toBe('end');
    expect(document.querySelector('[role="status"]')?.textContent).toContain('week ends');
    click('end');
    expect(document.querySelector('h2')?.textContent).toBe('The week is over');
    click('again');
    expect(document.querySelector('[data-job="level"]')).not.toBeNull();
  });

  it('marks completion after the last night and offers no further night', async () => {
    const run = newGame(7);
    // Keep the outlet open in this fixture so the test reaches the final dawn.
    while (run.phase !== 'end') {
      if (run.phase === 'dawn') queueInput(run, { kind: 'next' });
      else {
        run.water.gate = 4;
        step(run);
      }
    }
    expect(run.night).toBe(5);
    expect(run.dawns.at(-1)?.overtopped).toBe(false);
    localStorage.setItem('glance-save-v1', JSON.stringify({ seed: 7, inputs: [], minute: 1320 }));
    const debug = await boot();
    click('cont');
    // Display the final dawn through the same path used by an arriving watch.
    Object.assign(state(debug), run);
    debug.step(0);
    expect(document.querySelector('[role="status"]')?.textContent).toContain('after Friday night');
    expect(document.getElementById('next')).toBeNull();
    click('end');
    expect(document.querySelector('h2')?.textContent).toBe('The week is over');
  });
});

describe('clarity follow-up', () => {
  it('distinguishes written reading times from radio arrival times, including old and delayed readings', async () => {
    const debug = await boot();
    click('new');
    const run = state(debug);
    const original = run.board.level;
    if (!original) throw new Error('Missing opening reading');
    run.minute = 1410;
    run.inputs.push({ at: 1350, kind: 'ask', keeper: 'dai', job: 'level' });
    const reading = { ...original, at: 1380, wrote: 1350, late: true };
    run.reports.push(reading);
    run.board.level = reading;
    run.said.push({ at: 1400, who: 'dai', kind: 'report', text: 'Radio’s back. Three-nine.' });
    debug.step(0);
    const gauge = document.querySelector('[data-g="level"]');
    expect(gauge?.querySelector('.by')?.textContent).toContain('read 22:30 (as written)');
    expect(gauge?.querySelector('.was')?.textContent).toContain('read 22:00 (as written)');
    expect(document.querySelector('#log .line:last-child .t')?.textContent).toBe('reported 23:20');
    (gauge as HTMLElement).click();
    expect(document.querySelector('.sheet .hint')?.textContent).toContain('read 22:30 (as written)');
    expect(document.querySelector('#threshold')?.textContent).toContain('read 60 min ago (as written)');
  });

  it('does not label a tree notice as received while the radio is out', async () => {
    const debug = await boot();
    click('new');
    const run = state(debug);
    run.radioOut = true;
    run.said.push({ at: run.minute, who: 'dai', kind: 'report', text: 'A tree on the screen.' });
    debug.step(0);
    expect(document.querySelector('#log .line:last-child .t')?.textContent).toBe('22:00');
  });

  it('labels dawn reconstruction with actual reading times', async () => {
    await boot();
    click('new');
    click('help');
    expect(document.querySelector('#about .legend')?.textContent).toContain('actual reading time');
    expect(
      reportBody(
        {
          ...SAMPLE_DAWN,
          misses: [
            { at: 1380, who: 'dai', gauge: 'level', said: 3.8, truth: 4.1, cause: 'sleepy', caught: false },
          ],
        },
        false,
      ),
    ).toContain('actual read 23:00');
  });

  it('uses the same written reading label for gate details and every gauge', async () => {
    const debug = await boot();
    click('new');
    const run = state(debug);
    run.night = 3;
    const opening = run.board.level;
    if (!opening || !run.board.gate) throw new Error('Missing opening readings');
    run.board.weir = { ...opening, gauge: 'weir' };
    run.board.bridge = { ...opening, who: 'nerys', gauge: 'bridge' };
    run.board.gate.wrote = 1290;
    debug.step(0);
    expect(document.querySelectorAll('.gauge .by')).toHaveLength(4);
    for (const by of document.querySelectorAll('.gauge .by'))
      expect(by.textContent).toMatch(/read \d\d:\d\d \(as written\)/);
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    expect(document.querySelector('.sheet .who')?.textContent).toContain('read 21:30 (as written)');
    expect(document.querySelector('.sheet .who')?.textContent).not.toContain('reported 21:30');
  });

  it('reports explicit save failure and lets the player retry', async () => {
    await boot();
    click('new');
    (
      Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent === 'Game menu',
      ) as HTMLElement
    ).click();
    const set = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    const save = Array.from(document.querySelectorAll('dialog button')).find(
      (b) => b.textContent === 'Save',
    ) as HTMLElement;
    save.click();
    await vi.waitFor(() =>
      expect(document.querySelector('dialog [role="status"]')?.textContent).toContain(
        'try Download this run',
      ),
    );
    expect(document.querySelector('.watch')).not.toBeNull();
    set.mockRestore();
    save.click();
    await vi.waitFor(() =>
      expect(document.querySelector('dialog [role="status"]')?.textContent).toBe('Saved.'),
    );
    expect(JSON.parse(localStorage.getItem('glance-save-v1') ?? '{}').minute).toBe(1320);
  });

  it('separates a stale gate report from the current clock and shows inspection speed', async () => {
    const debug = await boot();
    click('new');
    debug.step(24);
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    expect(document.querySelector('.sheet .who')?.textContent).toContain('Now 22:24');
    expect(document.querySelector('.sheet .who')?.textContent).toContain('read 22:00 (as written)');
    expect(document.querySelector('.sheet')?.textContent).toContain('Inspection slowdown · steady selected');
  });

  it('keeps the forecast expanded across a running-clock minute, but resets for a new sheet', async () => {
    let frame: FrameRequestCallback = () => {};
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    const debug = await boot();
    click('new');
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    (document.querySelector('.sheet details') as HTMLDetailsElement).open = true;
    const from = performance.now();
    for (let n = 1; n <= 16; n++) frame(from + n * 250);
    expect(state(debug).minute).toBeGreaterThan(1320);
    expect((document.querySelector('.sheet details') as HTMLDetailsElement).open).toBe(true);
    click('x');
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    expect((document.querySelector('.sheet details') as HTMLDetailsElement).open).toBe(false);
  });
});

it('holds menu time without adding inputs, then resumes the selected Fast pace', async () => {
  let next: FrameRequestCallback = () => {};
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    next = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const debug = await boot();
  click('new');
  click('x');
  document.querySelector<HTMLButtonElement>('#speed [data-i="2"]')?.click();
  let now = performance.now();
  const pulse = () => {
    now += 250;
    next(now);
  };
  const inputs = JSON.stringify(state(debug).inputs);
  const before = state(debug).minute;
  document.querySelector<HTMLButtonElement>('#tools [aria-haspopup="dialog"]')?.click();
  const menu = document.querySelector<HTMLDialogElement>('.lk-notebook');
  expect(menu?.open).toBe(true);
  for (let i = 0; i < 40; i++) pulse();
  expect(state(debug).minute).toBe(before);
  expect(JSON.stringify(state(debug).inputs)).toBe(inputs);
  menu?.close();
  for (let i = 0; i < 4; i++) pulse();
  expect(state(debug).minute).toBe(before + 2);
  expect(document.querySelector('#speed [aria-pressed="true"]')?.getAttribute('data-i')).toBe('2');
  expect(JSON.stringify(state(debug).inputs)).toBe(inputs);
  const veil = document.createElement('div');
  veil.className = 'hflab-veil';
  document.body.append(veil);
  const held = state(debug).minute;
  for (let i = 0; i < 40; i++) pulse();
  expect(state(debug).minute).toBe(held);
  veil.remove();
});

it('keeps the tally off and outside run state; toggles immediately at a failed end', async () => {
  const debug = await boot();
  click('new');
  const run = state(debug);
  const before = fingerprint(run);
  const menu = () => {
    (
      Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent === 'Game menu',
      ) as HTMLElement
    ).click();
    return document.querySelector<HTMLInputElement>('#keep-tally') as HTMLInputElement;
  };
  let checkbox = menu();
  expect(checkbox.checked).toBe(false);
  expect(checkbox.parentElement?.textContent).toContain('Keep a tally');
  checkbox.click();
  expect(document.querySelector('[aria-label="Closing tally"]')).toBeNull();
  expect(fingerprint(run)).toBe(before);
  document.querySelector<HTMLDialogElement>('.lk-notebook')?.close();
  run.phase = 'end';
  run.dawns = [{ ...structuredClone(SAMPLE_DAWN), overtopped: true }];
  debug.step(0);
  expect(document.querySelector('[aria-label="Closing tally"]')?.textContent).toContain('Closing tally:');
  const ended = fingerprint(run);
  checkbox = menu();
  expect(checkbox.checked).toBe(true);
  checkbox.click();
  expect(document.querySelector('[aria-label="Closing tally"]')).toBeNull();
  checkbox.click();
  expect(document.querySelector('[aria-label="Closing tally"]')).not.toBeNull();
  expect(fingerprint(run)).toBe(ended);
});
