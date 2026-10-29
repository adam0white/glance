// @vitest-environment happy-dom
/** Scope: real App RAF callbacks, DOM controls and production Node workers.
 * Delayed delivery exposes interleaving. This does not prove browser layout or disk persistence. */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Worker as Thread } from 'node:worker_threads';
import { Window } from 'happy-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { newGame, step } from '../src/sim/dam.ts';
import type { InspectionPacket } from '../src/sim/display.ts';
import { exportCurrent } from '../src/sim/run.ts';
import { required } from './required.ts';

type Request = { id: number; kind: string; value?: unknown };
type Reply = { id: number; kind: string; packet?: InspectionPacket };
const threads = new Set<DelayedWorker>();
let onAccepted: (() => void) | undefined;
let onHeld: (() => void) | undefined;
async function acceptedAction(action: () => void) {
  const accepted = new Promise<void>((resolve) => {
    onAccepted = resolve;
  });
  action();
  await accepted;
}
class DelayedWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  thread = new Thread(resolve('test/playback-thread.ts'));
  hold = false;
  requests: Request[] = [];
  responses: Reply[] = [];
  held: Reply[] = [];
  constructor() {
    threads.add(this);
    this.thread.on('message', (data) => {
      this.responses.push(data);
      const request = this.requests.find((q) => q.id === data.id);
      if (this.hold && request?.kind === 'mutate') {
        this.held.push(data);
        onHeld?.();
        onHeld = undefined;
      } else {
        this.onmessage?.({ data } as MessageEvent);
        if (data.kind === 'accepted') {
          onAccepted?.();
          onAccepted = undefined;
        }
      }
    });
    this.thread.on('error', (error) => this.onerror?.({ error } as ErrorEvent));
  }
  postMessage(data: Request) {
    this.requests.push(structuredClone(data));
    this.thread.postMessage(data);
  }
  release() {
    this.hold = false;
    for (const data of this.held.splice(0)) this.onmessage?.({ data } as MessageEvent);
  }
  terminate() {
    return this.thread.terminate();
  }
}
let browser: Window;
let dispose: (() => void) | undefined;
let proofName = 0;
afterEach(async () => {
  dispose?.();
  if (process.env.GLANCE_PLAYBACK_PROOF_DIR)
    writeFileSync(
      resolve(process.env.GLANCE_PLAYBACK_PROOF_DIR, `playback-${++proofName}.json`),
      JSON.stringify([...threads].map((w) => ({ requests: w.requests, responses: w.responses }))),
    );
  await Promise.all([...threads].map((w) => w.terminate()));
  threads.clear();
  await browser?.happyDOM.close();
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// A missing post-await permission/identity check issues another real worker minute.
it.each([
  [360, 690, 'menu'],
  [1280, 800, 'about'],
  [360, 690, 'replacement'],
])('drops Skip carry when %s by %s playback is held by %s', async (width, height, action) => {
  browser = new Window({ url: 'http://localhost:3000/file/', width: Number(width), height: Number(height) });
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
  vi.stubGlobal('Worker', DelayedWorker);
  let next: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    next = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    next = undefined;
  });
  vi.stubGlobal('fetch', async () => new Response('', { status: 503 }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.setItem('hf-lab-player', 'a'.repeat(32));
  localStorage.setItem('hf-lab:once:telemetry-notice-v1', 'existing notice');
  // happy-dom has no popover activation. Model only native visibility, before
  // the browser's queued toggle event; App and its permission query stay real.
  let popoverOpen = false;
  const query = document.querySelector.bind(document);
  vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => {
    if (popoverOpen && selector.includes('#about:popover-open')) return query('#about');
    return query(selector);
  });
  const { start, _debug } = await import('../src/ui/app.ts');
  dispose = (await import('../src/ui/lab.ts')).lab.dispose;
  start();
  const click = (q: string) => required(document.querySelector<HTMLElement>(q)).click();
  const initial = newGame(7);
  for (let i = 0; i < 40; i++) step(initial);
  const load = (text: string) => {
    const file = required(document.querySelector<HTMLInputElement>('#file'));
    const bytes = new TextEncoder().encode(text);
    Object.defineProperty(file, 'files', {
      configurable: true,
      value: [{ size: bytes.length, arrayBuffer: async () => bytes.buffer }],
    });
    file.dispatchEvent(new window.Event('change'));
  };
  await acceptedAction(() => load(JSON.stringify(exportCurrent(initial))));
  await vi.waitFor(() => expect(_debug.state?.minute).toBe(1360));
  const heldState = required(_debug.state);
  const owner = required([...threads].at(-1));
  const minuteRequests = () =>
    owner.requests.filter((r) => r.kind === 'mutate' && (r.value as { minutes?: number })?.minutes === 1);
  click('#skip');
  const t = performance.now() + 90;
  await required(next)(t);
  expect(minuteRequests()).toHaveLength(0);
  owner.hold = true;
  const held = new Promise<void>((resolve) => {
    onHeld = resolve;
  });
  const pending = required(next)(t + 250);
  await held;
  expect(minuteRequests()).toHaveLength(1);
  if (action === 'about') {
    required(document.querySelector<HTMLElement>('#help')).addEventListener('click', () => {
      popoverOpen = true;
    });
    click('#help');
  } else {
    click('#menu');
    if (action === 'replacement') {
      click('#choose-another');
      await acceptedAction(() => load(JSON.stringify(exportCurrent(newGame(9)))));
      await vi.waitFor(() => expect(_debug.state?.seed).toBe(9));
    }
  }
  owner.release();
  await pending;
  expect(minuteRequests()).toHaveLength(1);
  // The real first minute already ran. Holding the UI does not roll it back.
  expect(
    owner.responses.find((r) => r.kind === 'accepted' && r.id === required(minuteRequests()[0]).id)?.packet
      ?.full.state.minute,
  ).toBe(1361);
  if (action !== 'replacement') expect(heldState.minute).toBe(1361);
  if (action === 'replacement') expect(_debug.state?.minute).toBe(1320);
});

// Preference invalidation cancels admission work, not this still-held Run.
it('saves the accepted minute and schedules playback after an in-flight shelf preference change', async () => {
  browser = new Window({ url: 'http://localhost:3000/', width: 360, height: 690 });
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
  vi.stubGlobal('Worker', DelayedWorker);
  let next: FrameRequestCallback | undefined;
  let frames = 0;
  let scheduledAt = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    next = callback;
    scheduledAt = performance.now();
    frames++;
    return frames;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    next = undefined;
  });
  vi.stubGlobal('fetch', async () => new Response('', { status: 503 }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.setItem('hf-lab-player', 'a'.repeat(32));
  localStorage.setItem('hf-lab:once:telemetry-notice-v1', 'existing notice');
  const initial = newGame(7);
  for (let i = 0; i < 40; i++) step(initial);
  const { LOCAL_KEY, Continuity } = await import('../src/continuity.ts');
  localStorage.setItem(
    LOCAL_KEY,
    JSON.stringify({
      run: exportCurrent(initial),
      runId: 'preference-control',
      heads: [],
      fileOrigin: false,
      sources: [],
    }),
  );
  const { start, _debug } = await import('../src/ui/app.ts');
  dispose = (await import('../src/ui/lab.ts')).lab.dispose;
  start();
  const click = (selector: string) => required(document.querySelector<HTMLElement>(selector)).click();
  await acceptedAction(() => {
    click('#cont');
  });
  await vi.waitFor(() => expect(_debug.state?.minute).toBe(1360));
  const state = required(_debug.state),
    owner = required([...threads].at(-1));
  click('#skip');
  const t = scheduledAt + 90;
  const first = required(next);
  next = undefined;
  await first(t);
  expect(owner.requests.filter((q) => q.kind === 'mutate')).toHaveLength(0);
  owner.hold = true;
  const held = new Promise<void>((resolve) => {
    onHeld = resolve;
  });
  const activeFrame = required<FrameRequestCallback>(next);
  next = undefined;
  const framesBefore = frames,
    savedBefore = localStorage.getItem(LOCAL_KEY);
  const pending = activeFrame(t + 250);
  await held;
  const invalidate = vi.spyOn(Continuity.prototype, 'invalidate');
  window.dispatchEvent(new window.Event('hf-persona-preference'));
  expect(invalidate).toHaveBeenCalled();
  // Stop Skip through its public control so the first real minute remains the
  // only in-flight work. Ordinary automatic playback must still be scheduled.
  click('#skip');
  owner.release();
  await pending;
  const savedAfter = localStorage.getItem(LOCAL_KEY);
  if (process.env.GLANCE_PREFERENCE_PROOF)
    writeFileSync(
      process.env.GLANCE_PREFERENCE_PROOF,
      JSON.stringify({
        scope:
          'Real production owner thread and App RAF; preference event retains same owner. No player or browser-disk claim.',
        sourceSHA256: createHash('sha256').update(readFileSync('src/ui/app.ts')).digest('hex'),
        testSHA256: createHash('sha256').update(readFileSync('test/async-playback.test.ts')).digest('hex'),
        savedBefore,
        savedAfter,
        framesBefore,
        framesAfter: frames,
        stateMinute: _debug.state?.minute,
        requests: owner.requests,
        responses: owner.responses,
      }),
    );
  expect(_debug.state).toBe(state);
  expect(state.minute).toBe(1361);
  expect(JSON.parse(required(savedAfter)).run.state.minute).toBe(1361);
  const accepted = owner.responses.filter((r) => r.kind === 'accepted').at(-1)!;
  expect(JSON.stringify(JSON.parse(required(savedAfter)).run) === JSON.stringify(accepted.packet!.full)).toBe(
    true,
  );
  expect(frames).toBeGreaterThan(framesBefore);
  expect(next).toBeDefined();
});
