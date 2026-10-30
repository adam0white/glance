// @vitest-environment happy-dom

import { IDBFactory } from 'fake-indexeddb';
import { Window } from 'happy-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { BrowserWorker, disposeBrowserWorkers } from './browser-worker.ts';
import { required } from './required.ts';

// Only browser/network boundaries are synthetic. App, Continuity, HF and replay are real.
const wire = vi.hoisted(() => ({ fail: false }));
vi.mock('@adam0white/lab-client', async (original) => {
  const sdk = await original<typeof import('@adam0white/lab-client')>();
  return {
    ...sdk,
    personaChannel: () => ({
      enabled: true,
      ready: Promise.resolve(true),
      async request(request: { action: string; castIds?: string[] }) {
        if (wire.fail) throw new Error('Synthetic shelf unavailable');
        if (request.action === 'prepareBatch')
          return {
            expectedHeads: Object.fromEntries((request.castIds ?? []).map((id) => [id, null])),
            inputs: [],
            blocked: [
              { castId: 'hf.cast.dai.glance', reason: 'Unsupported saved history version.' },
              { castId: 'hf.cast.wren.rope', reason: 'Occupied source chapter.' },
            ],
          };
        if (request.action === 'putBatch') return null;
        throw new Error(`Unexpected shelf operation: ${request.action}`);
      },
    }),
    watchPersonaCheckpoint: () => () => {},
  };
});
let browser: Window;
let dispose: (() => void) | undefined;
afterEach(async () => {
  dispose?.();
  disposeBrowserWorkers();
  await browser?.happyDOM.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Removing the public default, dropping the chosen dam on retry, or clearing before
// preparation would fail this actual App control; no fake HF acceptance is supplied.
it('starts public rules directly and retains the physical dam and old save through failed preparation', async () => {
  vi.stubGlobal('Worker', BrowserWorker);
  vi.stubGlobal('indexedDB', new IDBFactory());
  browser = new Window({ url: 'http://localhost:3000/' });
  for (const key of [
    'window',
    'document',
    'location',
    'history',
    'navigator',
    'localStorage',
    'sessionStorage',
  ] as const)
    vi.stubGlobal(key, key === 'window' ? browser : browser[key]);
  for (const key of ['addEventListener', 'removeEventListener', 'dispatchEvent'] as const)
    vi.stubGlobal(key, browser[key].bind(browser));
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 503 })),
  );
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

  vi.spyOn(console, 'error').mockImplementation(() => {});
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.setItem('hf-lab-player', 'a'.repeat(32));
  sessionStorage.setItem('hf-lab-session:glance', `${'b'.repeat(32)}:1234`);
  sessionStorage.setItem('hf-lab-run:glance', 'c'.repeat(32));
  const { exportCurrent, importCurrent } = await import('../src/sim/run.ts');
  const { newGame, replay } = await import('../src/sim/dam.ts');
  const { LOCAL_KEY } = await import('../src/continuity.ts');
  let { start, _debug } = await import('../src/ui/app.ts');
  dispose = (await import('../src/ui/lab.ts')).lab.dispose;
  const click = (id: string) => required(document.getElementById(id)).click();
  start();
  expect(document.getElementById('extended-watch')).toBeNull();
  expect(document.getElementById('goal')?.textContent).toContain('twelve nights');
  expect(document.getElementById('about')?.textContent).toContain('second Friday');
  click('new');
  await vi.waitFor(() =>
    expect(_debug.state?.rules).toEqual({
      edition: 'extended-2',
      dam: 'valley',
      outcomes: 'private-scenes-1',
    }),
  );
  expect(document.querySelector('.continuity-notice')?.textContent).toContain('Dai');
  expect(document.querySelector('.continuity-notice')?.textContent).toContain('Wren');
  expect(document.querySelector('.continuity-notice')?.textContent).toContain(
    'They start this game new, without their past from other games. Their saved past stays on this device.',
  );
  const state = required(_debug.state);
  const chapter = required(state.chapter);
  state.chapter = {
    ...chapter,
    blocked: [
      ...(chapter.blocked ?? []),
      { castId: 'unrecognized-cast-id', reason: 'Synthetic unknown person.' },
    ],
  };
  click('menu');
  expect(document.querySelector('#game-menu .continuity-notice')?.textContent).toContain(
    'someone from another game',
  );
  expect(document.querySelector('#game-menu .continuity-notice')?.textContent).not.toContain(
    'unrecognized-cast-id',
  );
  state.chapter = chapter;
  expect(document.querySelector('#game-menu .continuity-notice')?.textContent).not.toContain(
    'Unsupported saved history version.',
  );
  click('dialog-back');
  history.replaceState(null, '', '?lab=1');
  click('menu');
  expect(document.querySelector('#game-menu .continuity-notice')?.textContent).toContain(
    'Unsupported saved history version.',
  );
  click('dialog-back');
  history.replaceState(null, '', '/');
  // The saved blocked identities, rather than a transient status string, survive reload.
  click('menu');
  click('to-title');
  click('cont');
  await vi.waitFor(() => expect(document.querySelector('.watch')).not.toBeNull());
  expect(document.querySelector('.continuity-notice')?.textContent).toContain('Wren');
  expect(_debug.state?.outcomes).toBeDefined();
  expect(_debug.state?.privateScenes).toBeDefined();

  const old = JSON.stringify({
    run: exportCurrent(newGame(7)),
    runId: 'old-control',
    fileOrigin: false,
    heads: [],
    sources: [],
  });
  // A new page retains an old unmarked run literally, without stamping new rules.
  localStorage.setItem(LOCAL_KEY, old);
  dispose();
  vi.resetModules();
  ({ start, _debug } = await import('../src/ui/app.ts'));
  dispose = (await import('../src/ui/lab.ts')).lab.dispose;
  start();
  click('new');
  expect(localStorage.getItem(LOCAL_KEY)).toBe(old);
  click('cancel-new');
  expect(localStorage.getItem(LOCAL_KEY)).toBe(old);
  const dam = required(document.querySelector<HTMLSelectElement>('#dam-choice'));
  dam.value = 'upper';
  wire.fail = true;
  click('new');
  click('confirm-new');
  await vi.waitFor(() => expect(document.getElementById('retry-start')).not.toBeNull());
  expect(localStorage.getItem(LOCAL_KEY)).toBe(old);
  dam.value = 'valley';
  wire.fail = false;
  click('retry-start');
  await vi.waitFor(() => expect(_debug.state?.rules?.dam).toBe('upper'));
  const current = await import('../src/sim/run.ts');
  const run = current.exportCurrent(required(_debug.state));
  expect(run.state.rules).toEqual({ edition: 'extended-2', dam: 'upper', outcomes: 'private-scenes-1' });
  expect(current.exportCurrent(current.importCurrent(run))).toEqual(run);
  expect(
    exportCurrent(
      replay(
        run.seed,
        run.inputs,
        run.state.minute,
        run.state.chapter ?? undefined,
        run.state.rules,
        run.state.applied,
      ),
    ),
  ).toEqual(run);
});
