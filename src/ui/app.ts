/**
 * The Glance UI: DOM for the board, the radio log and the sheets; one canvas for the dam. The UI reads state and
 * queues inputs; it never changes the sim directly. Real time drives sim minutes, continuously, slowing while a
 * sheet is open. Game menus and notebook dialogs hold time.
 */

import { FRAMEWORK_VERSION } from '@adam0white/human-framework';
import { notebookMenu } from '@adam0white/lab-kit';
import {
  clock,
  type Export,
  exportRun,
  fingerprint,
  type GameState,
  type Gauge,
  type Hint,
  hint,
  type Input,
  type Job,
  keeperOf,
  NIGHTS,
  newGame,
  PLANS,
  personOf,
  planOf,
  queueInput,
  type Report,
  replay,
  reportWords,
  type Said,
  step,
  walkMinutes,
  watchFrom,
} from '../sim/dam.ts';
import { KEEPERS, type KeeperId, NAMES } from '../sim/keepers.ts';
import { CREST, LIP, TURNS } from '../sim/water.ts';
import { concernLines, thresholdWords } from './concern.ts';
import { drawDawn } from './dawn.ts';
import { lab } from './lab.ts';
import { SAMPLE_DAWN } from './opener.ts';
import { eventStamp, playback } from './playback.ts';
import { reportBody } from './report.ts';
import { drawScene, type SceneFx, sceneHit } from './scene.ts';
import { tallyBody } from './tally.ts';
import { readingTime } from './time.ts';

const SAVE = 'glance-save-v1';
const SPEEDS = [0.8, 1.4, 2.4] as const;
const SPEED_NAMES = ['slow', 'steady', 'fast'];
let speed = 1;

interface Save {
  seed: number;
  inputs: Input[];
  minute: number;
}

type Sheet =
  | { kind: 'gauge'; gauge: Gauge; who: KeeperId }
  | { kind: 'keeper'; who: KeeperId }
  | { kind: 'inn' }
  | null;

const app = document.getElementById('app') as HTMLElement;
let s: GameState | null = null;
let readUntil = 0;
let sheet: Sheet = null;
let sheetKey = '';
let raf = 0;
let last = 0;
let carry = 0;
let seenFlashes = 0;
const fx: SceneFx = { flashAt: -1e9 };
let wake: { release(): Promise<void> } | null = null;
const seen = { hold: false };

// ---------- save ----------

function readSave(): Save | null {
  try {
    const raw = localStorage.getItem(SAVE);
    return raw ? (JSON.parse(raw) as Save) : null;
  } catch {
    return null;
  }
}
function saveNow() {
  if (!s) throw new Error('No run to save');
  localStorage.setItem(SAVE, JSON.stringify({ seed: s.seed, inputs: s.inputs, minute: s.minute }));
}
function writeSave() {
  try {
    saveNow();
  } catch {}
}
function clearSave() {
  try {
    localStorage.removeItem(SAVE);
  } catch {}
}

// ---------- helpers ----------

const esc = (x: string) =>
  x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const footer = () =>
  `<div class="footer"><a href="https://human.adamwhite.work/games/">◇ all notebooks</a><br/>People by the Human Framework ${FRAMEWORK_VERSION}. What they feel, say and refuse comes from it.</div>`;
const markLink = '<a class="mark" href="https://human.adamwhite.work">◇ human framework</a>';

/** Write markup only when it changed, so a press in progress is not torn out from under the finger. */
function setHtml(el: HTMLElement, html: string): boolean {
  if (el.dataset.h === html) return false;
  el.dataset.h = html;
  el.innerHTML = html;
  return true;
}

/** Handwriting: the looser his true state, the more each letter wanders. Deterministic per key. */
function hand(text: string, loose: number, key: number): string {
  if (loose < 0.25) return esc(text);
  const a = (loose - 0.25) * 1.6;
  let i = 0;
  return text
    .split(' ')
    .map((word) => `<span class="w">${[...word].map((ch) => letter(ch, i++)).join('')}</span>`)
    .join(' ');
  function letter(ch: string, i: number): string {
    {
      const r = Math.sin(key * 7.13 + i * 3.71);
      const q = Math.cos(key * 2.31 + i * 5.17);
      return `<span style="display:inline-block;transform:translate(${(q * a).toFixed(1)}px,${(r * a * 1.6).toFixed(1)}px) rotate(${(r * a * 4).toFixed(1)}deg)">${esc(ch)}</span>`;
    }
  }
}

const GAUGES: { id: Gauge; label: string }[] = [
  { id: 'level', label: 'level' },
  { id: 'weir', label: 'weir' },
  { id: 'gate', label: 'gate' },
  { id: 'bridge', label: 'bridge' },
];

function printed(r: Report | null, g: Gauge): string {
  if (!r) return '—';
  if (g === 'level') return `${r.value.toFixed(2)} m`;
  if (g === 'weir') return `${r.value.toFixed(2)} m`;
  if (g === 'gate') return `${r.value} / ${TURNS}`;
  return `step ${r.value}`;
}

/** The lip and crest marked on the level dial, so a figure past the lip shows as past it. */
function dialTicks(): string {
  const tick = (v: number, colour: string) => {
    const a = ((-90 + ((v - 3) / 3.2) * 180) * Math.PI) / 180;
    const p = (r: number) => `${(30 + r * Math.sin(a)).toFixed(1)} ${(31 - r * Math.cos(a)).toFixed(1)}`;
    return `<path d="M${p(21)} L${p(28)}" stroke="${colour}" stroke-width="1.6"/>`;
  };
  return tick(LIP, 'var(--ink-soft)') + tick(CREST, 'var(--rope)');
}

function needleAngle(r: Report | null, g: Gauge): number {
  if (!r) return -90;
  const f =
    g === 'level'
      ? (r.value - 3) / 3.2
      : g === 'weir'
        ? r.value / 1.6
        : g === 'gate'
          ? r.value / TURNS
          : r.value / 6;
  return -90 + Math.max(0, Math.min(1, f)) * 180;
}

// ---------- title ----------

export function start() {
  if ('serviceWorker' in navigator && location.hostname !== 'localhost')
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  title();
}

function title() {
  cancelAnimationFrame(raf);
  lab.screen('title');
  const save = readSave();
  app.innerHTML = `<div class="page">
    ${markLink}
    <h1>The Glance</h1>
    <p id="goal">Keep the dam below its crest and the town dry, or warned in time.</p>
    <div class="actions">
      ${save ? '<button class="primary" id="cont">Back to the desk</button>' : ''}
      <button class="${save ? '' : 'primary'}" id="new">${save ? 'Start the week again' : 'Take the night desk'}</button>
      <button id="help" class="info" aria-label="About the desk" popovertarget="about">i</button>
      <button id="load">Load a playtest run</button>
      <input type="file" id="file" accept="application/json" hidden />
    </div>
    ${footer()}
  </div>`;
  document.getElementById('cont')?.addEventListener('click', () => {
    if (!save) return;
    s = replay(save.seed, save.inputs, save.minute);
    // Give a returning player time to read the desk.
    readUntil = performance.now() + 6000;
    enter();
  });
  document.getElementById('new')?.addEventListener('click', () => {
    beginWeek();
  });
  showAbout();
  const file = document.getElementById('file') as HTMLInputElement;
  document.getElementById('load')?.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const ex = JSON.parse(await f.text()) as Export;
      const r = replay(ex.seed, ex.inputs, ex.state?.minute);
      const same = ex.state ? fingerprint(r) === fingerprint(ex.state) : true;
      s = r;
      writeSave();
      alert(
        same
          ? 'Replayed the run: it matches the exported state.'
          : 'Replayed the run, but it differs from the export.',
      );
      enter();
    } catch {
      alert('That file is not a run from The Glance.');
    }
  });
}

/** The first request is available immediately; no input is queued until the player asks. */
function beginWeek() {
  cancelAnimationFrame(raf);
  clearSave();
  s = newGame(Date.now() >>> 0);
  enter();
  openSheet({ kind: 'gauge', gauge: 'level', who: 'dai' });
  window.scrollTo(0, 0);
}

/** Optional background and example, outside the simulation and input log. */
function showAbout() {
  document.getElementById('about')?.remove();
  const dialog = document.createElement('div');
  dialog.setAttribute('popover', 'auto');
  dialog.id = 'about';
  dialog.setAttribute('aria-labelledby', 'about-title');
  dialog.innerHTML = `<div class="page dawn">
    <button id="close-about" popovertarget="about" popovertargetaction="hide">Back to the desk</button>
    <h2 id="about-title">About the desk</h2>
    <p>The river authority, the night desk. Up the valley, one old dam above a town, and on it a keeper with a torch and a radio. Every figure on your board is what he saw.</p>
    <p>Slow, steady and fast set the night’s pace. New words slow the clock. Opening an inspection or this information holds time. Shut the page and it waits for you.</p>
    <p>Your watch ends at dawn after Friday night, or sooner if water comes over the crest.</p>
    <p>The level is water held behind the dam. The weir upstream shows water coming in. More gate turns open it wider: the dam level falls, but the river through town rises later.</p>
    <p>On the live board, “read” is the reading time as written by the keeper. “Reported” is when the radio report reached your desk. Dawn reconstructs the actual reading times.</p>
    <p>Tap a gauge to send a keeper. Let him rest between jobs. From Tuesday, ring the Bridge Inn to check the river and warn the lane if needed.</p>
    <p class="soft">A sample report, not your night. This is a good morning:</p>
    ${reportBody(SAMPLE_DAWN, false, true)}
  </div>`;
  app.append(dialog);
  dialog.addEventListener('toggle', (event) => {
    if ((event as ToggleEvent).newState === 'open')
      drawDawn(dialog.querySelector('#chart') as HTMLCanvasElement, SAMPLE_DAWN);
    carry = 0;
    last = performance.now();
  });
  dialog.querySelector('#close-about')?.addEventListener('click', () => {
    if (typeof dialog.hidePopover === 'function') dialog.hidePopover();
  });
}

function enter() {
  if (!s) return;
  seenFlashes = s.flashes.length;
  if (s.phase === 'watch') watch();
  else if (s.phase === 'dawn') dawn();
  else ending();
}

/** The shared notebook menu contains run controls only. */
function gameMenu(): HTMLButtonElement {
  return notebookMenu({
    lab,
    getRun: () => (s ? exportRun(s, FRAMEWORK_VERSION) : {}),
    filename: 'glance-playtest.json',
    onSave: saveNow,
  });
}

function updateTally() {
  const slot = document.getElementById('closing-tally');
  if (!slot || !s || s.phase !== 'end') return;
  const body = tallyBody(s);
  slot.innerHTML = body
    ? `<button id="see-tally" aria-expanded="false" aria-controls="tally-result">See tally</button><div id="tally-result" hidden>${body}</div>`
    : '';
  document.getElementById('see-tally')?.addEventListener('click', (event) => {
    const result = document.getElementById('tally-result');
    if (!result) return;
    result.hidden = !result.hidden;
    (event.currentTarget as HTMLElement).setAttribute('aria-expanded', String(!result.hidden));
  });
}

// ---------- the watch ----------

function watch() {
  if (!s) return;
  lab.screen(`night ${s.night}: watch`);
  sheet = null;
  sheetKey = '';
  requestWake();
  writeSave();
  readUntil = performance.now() + 6000;
  app.innerHTML = `<div class="watch">
    <div class="top"><span class="grow"></span><span id="night"></span><span class="clock" id="clock"></span><span class="speed" id="speed" role="group" aria-label="Speed"></span><span id="clock-rate" role="status"></span></div>
    <canvas id="scene" class="scene" aria-label="The dam, as reported"></canvas>
    <div class="board" id="board"></div>
    <div id="concern" class="attention" aria-live="polite"></div>
    <div class="log" id="log" aria-live="polite"></div>
    <div class="sheet" id="sheet"></div>
    <div class="desk-tools" id="tools"><button id="help" class="info" aria-label="About the desk" popovertarget="about">i</button></div>
  </div>`;
  showAbout();
  const sp = document.getElementById('speed') as HTMLElement;
  sp.innerHTML = SPEED_NAMES.map(
    (n, i) => `<button data-i="${i}" aria-label="${n}">${['▸', '▸▸', '▸▸▸'][i]}</button>`,
  ).join('');
  sp.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    speed = Number(b.dataset.i);
    drawTop();
  });
  document.getElementById('tools')?.prepend(gameMenu());
  document.getElementById('board')?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-g]') as HTMLElement | null;
    if (!b || !s) return;
    const g = b.dataset.g as Gauge;
    if (g === 'bridge') openSheet({ kind: 'inn' });
    else openSheet({ kind: 'gauge', gauge: g, who: freeKeeper(s) });
  });
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  canvas.addEventListener('click', (e) => {
    if (!s) return;
    const r = canvas.getBoundingClientRect();
    const hit = sceneHit(s, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    if (hit === 'inn') openSheet({ kind: 'inn' });
    else if (hit === 'dam') openSheet({ kind: 'gauge', gauge: 'level', who: freeKeeper(s) });
    else if (hit) openSheet({ kind: 'keeper', who: hit });
  });
  drawAll();
  last = performance.now();
  carry = 0;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
}

function freeKeeper(st: GameState): KeeperId {
  const on = planOf(st).keepers;
  if (sheet && sheet.kind !== 'inn' && on.includes(sheet.who)) return sheet.who;
  return (
    on.find((id) => !keeperOf(st, id).job && personOf(st, id).activity?.affordanceId !== 'doze') ??
    on[0] ??
    'dai'
  );
}

function frame(t: number) {
  if (!s) return;
  const elapsed = Math.max(0, t - last);
  const dt = Math.min(0.25, elapsed / 1000);
  const paused = !!document.querySelector('dialog[open], .hflab-veil, #about:popover-open');
  if (paused && readUntil > last) readUntil += elapsed;
  last = t;
  if (s.phase === 'watch' && !paused) {
    const { rate } = playback(sheet !== null, t < readUntil, SPEEDS[speed]);
    if (rate === 0) carry = 0;
    carry += dt * rate;
    let stepped = false;
    while (carry >= 1 && s.phase === 'watch') {
      carry -= 1;
      const before = eventStamp(s);
      step(s);
      stepped = true;
      if (eventStamp(s) !== before) {
        readUntil = t + 6000;
        carry = 0;
        break;
      }
    }
    if (s.flashes.length > seenFlashes) {
      seenFlashes = s.flashes.length;
      fx.flashAt = t;
    }
    if (stepped) {
      drawTop();
      drawBoard();
      drawLog();
      drawSheet();
      writeSave();
    }
    const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
    if (canvas) drawScene(canvas, s, fx, t);
  }
  if (s.phase !== 'watch') {
    writeSave();
    releaseWake();
    dawn();
    return;
  }
  raf = requestAnimationFrame(frame);
}

function drawAll() {
  drawTop();
  drawBoard();
  drawLog();
  drawSheet();
  const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
  if (canvas && s) drawScene(canvas, s, fx, performance.now());
}

function drawTop() {
  if (!s) return;
  const n = document.getElementById('night');
  const c = document.getElementById('clock');
  if (n) n.textContent = `${planOf(s).title} night`;
  if (c) c.textContent = clock(s.minute);
  document.querySelectorAll('#speed button').forEach((b, i) => {
    b.classList.toggle('on', i === speed);
    b.setAttribute('aria-pressed', String(i === speed));
  });
  const rate = document.getElementById('clock-rate');
  if (rate) rate.textContent = playback(sheet !== null, performance.now() < readUntil, SPEEDS[speed]).reason;
}

function drawBoard() {
  if (!s) return;
  const el = document.getElementById('board');
  if (!el) return;
  const plan = planOf(s);
  const html = GAUGES.filter((g) => (g.id === 'weir' ? plan.weir : g.id === 'bridge' ? plan.inn : true))
    .map((g) => {
      const r = s?.board[g.id] ?? null;
      const age = r && s ? s.minute - r.at : 0;
      const fade = r ? Math.max(0.35, 1 - age / 150) : 0.35;
      const who = r ? (r.who === 'nerys' ? 'Nerys' : NAMES[r.who as KeeperId]) : '';
      const doubt = r ? Math.max(0, 1 - r.conf) : 0;
      const ang = needleAngle(r, g.id);
      return `<button class="gauge" data-g="${g.id}" style="--fade:${fade.toFixed(2)};--tremble:${(doubt * 5).toFixed(1)}deg">
        <svg viewBox="0 0 60 34" aria-hidden="true"><path d="M5 31 A25 25 0 0 1 55 31" fill="none" stroke="currentColor" stroke-width="1.5"/>
        <g class="needle" style="transform-origin:30px 31px;transform:rotate(${ang.toFixed(1)}deg)"><line x1="30" y1="31" x2="30" y2="9" stroke="var(--rope)" stroke-width="2" stroke-linecap="round"/></g>
        ${g.id === 'level' ? dialTicks() : ''}<circle cx="30" cy="31" r="2" fill="currentColor"/></svg>
        <span class="lab">${g.label}</span>
        <span class="num">${printed(r, g.id)}</span>
        <span class="by hand">${r ? hand(`${who} · ${readingTime(r)}`, r.who === 'nerys' ? 0 : 1 - r.clarity, r.at) : 'not read'}</span>
        ${wasLine(r, g.id)}
      </button>`;
    })
    .join('');
  setHtml(el, html);
}

/** The figure before this one, as a desk keeps it beside the new one: two men's readings side by side. */
function wasLine(r: Report | null, g: Gauge): string {
  const empty = '<span class="was soft" aria-hidden="true"></span>';
  if (!s || !r || g === 'gate') return empty;
  const prev = s.reports
    .filter((x) => x.gauge === g && x !== r && x.at >= watchFrom(s?.night ?? 1) && x.at <= r.at)
    .at(-1);
  if (!prev) return empty;
  // Same man: "was". Another man: his name, so a disagreement shows as two names.
  const lead = prev.who === r.who ? 'was' : prev.who === 'nerys' ? 'Nerys' : NAMES[prev.who as KeeperId];
  const fig = g === 'level' ? prev.value.toFixed(1) : printed(prev, g).replace(' m', '');
  return `<span class="was soft">${lead} ${fig}, ${readingTime(prev)}</span>`;
}

function sayClass(x: Said): string {
  if (x.who === 'narrator') return 'n';
  if (x.who === 'radio') return 'r';
  return 'p';
}

function drawLog() {
  if (!s) return;
  const el = document.getElementById('log');
  if (!el) return;
  const lines = s.said.filter((x) => x.at >= watchFrom(s?.night ?? 1) - 1).slice(-7);
  const key = lines.map((x) => `${x.at}${x.text}`).join('|');
  if (el.dataset.k === key) return;
  el.dataset.k = key;
  el.innerHTML = lines
    .map((x) => {
      const who = x.who === 'narrator' || x.who === 'radio' ? '' : x.who === 'nerys' ? 'Nerys' : NAMES[x.who];
      const r =
        x.kind === 'report' && x.who !== 'nerys'
          ? [...(s?.reports ?? [])].reverse().find((q) => q.who === x.who && q.at <= x.at)
          : undefined;
      const loose = r ? 1 - r.clarity : 0;
      const body = sayClass(x) === 'p' ? hand(x.text, loose, x.at) : esc(x.text);
      // Tree notices can be stamped before delivery; only reading reports certify arrival here.
      const readingArrival = x.kind === 'report' && !x.text.includes('tree');
      const time = `${readingArrival ? 'reported ' : ''}${clock(x.at)}`;
      return `<div class="line ${sayClass(x)}"><span class="t">${time}</span>${who ? `<b>${who}</b> ` : ''}<span class="${sayClass(x) === 'p' ? 'hand' : ''}">${body}</span></div>`;
    })
    .join('');
}

// ---------- sheets ----------

function openSheet(sh: Sheet) {
  const same = JSON.stringify(sheet) === JSON.stringify(sh);
  if (!same) document.querySelector<HTMLDetailsElement>('.sheet details')?.removeAttribute('open');
  sheet = sh;
  document.querySelector('.watch')?.classList.toggle('sheet-open', sheet !== null);
  document
    .querySelector('.watch')
    ?.classList.toggle('gate-open', sheet?.kind === 'gauge' && sheet.gauge === 'gate');
  drawConcern();
  sheetKey = '';
  carry = 0;
  drawSheet();
  drawTop();
}

function drawConcern() {
  if (!s) return;
  const el = document.getElementById('concern');
  if (el)
    setHtml(
      el,
      `${concernLines(s)
        .map((line) => `<div>${esc(line)}</div>`)
        .join('')}<div id="threshold" class="soft">${esc(thresholdWords(s))}</div>`,
    );
}

function drawSheet() {
  if (!s) return;
  drawConcern();
  const el = document.getElementById('sheet');
  if (!el || el.querySelector('.holding')) return;
  if (!sheet) {
    // Keep the buttons and change only their words, so a tap is never lost to a rebuild.
    const crew = el.querySelector('.crew');
    const ids = planOf(s).keepers;
    if (
      crew &&
      crew.querySelectorAll('[data-k]').length === ids.length &&
      el.dataset.h?.startsWith('<div class="crew">')
    ) {
      for (const id of ids) {
        const span = crew.querySelector(`[data-k="${id}"] .soft`);
        const words = whereWords(id);
        if (span && span.textContent !== words) span.textContent = words;
      }
      return;
    }
    const html = `<div class="crew">${planOf(s)
      .keepers.map(
        (id) =>
          `<button data-k="${id}"><b>${NAMES[id]}</b><span class="soft">${whereWords(id)}</span></button>`,
      )
      .join(
        '',
      )}${planOf(s).inn ? '<button data-inn="1"><b>Bridge Inn</b><span class="soft">Nerys</span></button>' : ''}</div>
      `;
    if (!setHtml(el, html)) return;
    el.querySelectorAll('[data-k]').forEach((b) => {
      b.addEventListener('click', () =>
        openSheet({ kind: 'keeper', who: (b as HTMLElement).dataset.k as KeeperId }),
      );
    });
    el.querySelector('[data-inn]')?.addEventListener('click', () => openSheet({ kind: 'inn' }));
    return;
  }
  // Rebuild only when what it shows can change (each sim minute is enough).
  const k = `${JSON.stringify(sheet)}|${s.minute}`;
  if (sheetKey === k) return;
  sheetKey = k;
  if (sheet.kind === 'inn') {
    const ringing = s.nerys.ringing !== null;
    const warned = s.warnedAt !== null;
    const html = `<div class="who"><b>Bridge Inn</b><span class="soft">Nerys, by the river stairs</span><button class="x" id="x">close</button></div>
      <div class="verbs two">
        <button id="ring" ${ringing ? 'disabled' : ''}><span>Ring Nerys</span><span class="h">${ringing ? 'she’s gone to look' : 'how high is the river?'}</span></button>
        <button id="warn" ${warned ? 'disabled' : ''}><span class="fill"></span><span>Warn Mill Lane</span><span class="h">${warned ? `warned at ${clock(s.warnedAt ?? 0)}` : 'hold: the warden knocks doors'}</span></button>
      </div>`;
    if (!setHtml(el, html)) return;
    document.getElementById('x')?.addEventListener('click', () => openSheet(null));
    document.getElementById('ring')?.addEventListener('click', () => {
      if (!s) return;
      queueInput(s, { kind: 'ring' });
      writeSave();
      openSheet(null);
    });
    const w = document.getElementById('warn') as HTMLButtonElement | null;
    if (w)
      bindHold(w, (insist) => {
        if (!insist) {
          const h = w.querySelector('.h');
          if (h) h.textContent = 'keep your finger on it: the warden knocks doors';
          w.classList.add('nudge');
          return;
        }
        if (!s) return;
        queueInput(s, { kind: 'warn' });
        writeSave();
        openSheet(null);
      });
    return;
  }
  const who = sheet.who;
  const crew = planOf(s).keepers.length > 1;
  const crewRow = crew
    ? `<div class="crew small">${planOf(s)
        .keepers.map(
          (id) =>
            `<button data-k="${id}" class="${id === who ? 'on' : ''}"><b>${NAMES[id]}</b><span class="soft">${whereWords(id)}</span></button>`,
        )
        .join('')}</div>`
    : '';
  let body = '';
  let head = '';
  if (sheet.kind === 'gauge' && sheet.gauge === 'gate') {
    const report = s.board.gate;
    const reported = report?.value;
    const opts: number[] = [];
    for (let t = 0; t <= TURNS; t++) if (t !== reported) opts.push(t);
    const hs = opts.map((t) => hint(s as GameState, who, 'gate', t));
    const next = hint(s, who, 'gate', Math.min(TURNS, (reported ?? 0) + 1));
    head = `<b>Gate</b><span class="soft">Now ${clock(s.minute)} · ${report ? `last gate ${reported}/${TURNS}, ${readingTime(report)}` : 'gate not read'}</span>`;
    body = `<div class="inspection-speed soft">Reading the desk · time waits</div>${next.forecast ? `<details class="fore"><summary>${NAMES[who]}, on the round after</summary><span class="hand">“${esc(next.forecast)}”</span></details>` : ''}
      <div class="verbs turns">${hs
        .map(
          (h) =>
            `<button data-job="gate" data-t="${h.target}"><span class="fill"></span><span>${h.target === 0 ? 'shut' : `${h.target}`}</span><span class="h ${h.verdict === 'refused' ? 'no' : ''}">${esc(h.short)} · ~${h.minutes}m</span></button>`,
        )
        .join(
          '',
        )}</div><p class="hint">0–${TURNS} turns open. More turns lower the dam; the town river rises later. ${seen.hold ? '' : 'Hold a button to insist.'}</p>`;
  } else if (sheet.kind === 'gauge') {
    const job: Job = sheet.gauge === 'weir' ? 'weir' : 'level';
    const h = hint(s, who, job);
    const hi = hint(s, who, job, undefined, true);
    head = `<b>${job === 'level' ? 'Level' : 'Weir'}</b><span class="soft">${job === 'level' ? 'water held behind the dam' : 'the weir board, a long walk upstream'}</span>`;
    const firstReading = s.night === 1 && !s.inputs.some((input) => input.kind === 'ask');
    body = `${verbButtons([{ h, label: job === 'level' ? `Ask ${NAMES[who]} to read it` : `Send ${NAMES[who]} to the weir`, insist: hi }])}
      ${h.forecast && !firstReading ? `<p class="fore"><span class="soft">${NAMES[who]}, on the round after:</span> <span class="hand">“${esc(h.forecast)}”</span></p>` : ''}
      <p class="hint">${firstReading ? 'Every figure is what a keeper saw.' : lastWords(s, sheet.gauge)}</p>`;
  } else {
    head = `<b>${NAMES[who]}</b><span class="soft">${whereWords(who)}</span>`;
    const jobs: { job: Job; label: string }[] = [
      { job: 'level', label: 'Read the level' },
      { job: 'stove', label: 'Sit by the stove' },
      { job: 'nap', label: 'Get your head down' },
    ];
    if (planOf(s).weir) jobs.splice(1, 0, { job: 'weir', label: 'Go to the weir' });
    if (s.treeKnown && s.water.blocked) jobs.push({ job: 'clear', label: 'Clear the screen' });
    body = verbButtons(
      jobs.map((j) => ({ h: hint(s as GameState, who, j.job), label: j.label, insist: undefined })),
      true,
    );
  }
  const forecastOpen = el.querySelector<HTMLDetailsElement>('details.fore')?.open ?? false;
  if (!setHtml(el, `<div class="who">${head}<button class="x" id="x">close</button></div>${crewRow}${body}`))
    return;
  const forecast = el.querySelector<HTMLDetailsElement>('details.fore');
  if (forecast) forecast.open = forecastOpen;
  document.getElementById('x')?.addEventListener('click', () => openSheet(null));
  el.querySelectorAll('.crew [data-k]').forEach((b) => {
    b.addEventListener('click', () => {
      if (!sheet || sheet.kind === 'inn') return;
      openSheet({ ...sheet, who: (b as HTMLElement).dataset.k as KeeperId });
    });
  });
  el.querySelectorAll('[data-job]').forEach((b) => {
    const btn = b as HTMLButtonElement;
    bindHold(btn, (insist) => {
      const job = btn.dataset.job as Job;
      const t = btn.dataset.t !== undefined ? Number(btn.dataset.t) : undefined;
      ask(who, job, t, insist);
    });
  });
}

function verbButtons(items: { h: Hint; label: string; insist: Hint | undefined }[], grid = false): string {
  return `<div class="verbs ${grid ? 'grid' : 'one'}">${items
    .map(
      ({ h, label, insist }) =>
        `<button data-job="${h.job}"><span class="fill"></span><span>${esc(label)}</span><span class="h ${h.verdict === 'refused' ? 'no' : ''}">${esc(h.short)}${h.minutes && h.job !== 'stove' && h.job !== 'nap' ? ` · ~${h.minutes} min` : ''}${insist && insist.verdict !== h.verdict ? ` · held: ${esc(insist.short)}` : ''}</span></button>`,
    )
    .join('')}</div>`;
}

function lastWords(st: GameState, g: Gauge): string {
  const r = st.board[g];
  if (!r) return 'Nobody has read it yet tonight.';
  const who = r.who === 'nerys' ? 'Nerys' : NAMES[r.who as KeeperId];
  return `Last: ${who}, ${readingTime(r)}: “${esc(reportWords(st, r))}”`;
}

function whereWords(id: KeeperId): string {
  if (!s) return '';
  const k = keeperOf(s, id);
  const a = personOf(s, id).activity?.affordanceId;
  if (a === 'doze' || a === 'nap') return a === 'nap' ? 'asleep, as you said' : 'not answering';
  const j = k.job;
  if (j) {
    const reading = j.job === 'level' || j.job === 'weir';
    const walking =
      s.minute < j.startedAt + (reading ? walkMinutes(j.from, j.job === 'level' ? 'staff' : 'weir') : j.walk);
    const where = {
      level: 'the staff gauge',
      weir: 'the weir',
      gate: 'the wheel',
      stove: 'the hut',
      nap: 'the hut',
      clear: 'the screen',
    }[j.job];
    return walking ? `walking to ${where}` : j.job === 'stove' ? 'by the stove' : `at ${where}`;
  }
  return { hut: 'in the hut', gate: 'at the wheel', staff: 'on the dam face', weir: 'at the weir' }[k.place];
}

function bindHold(b: HTMLButtonElement, go: (insist: boolean) => void) {
  let timer = 0;
  let fired = false;
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  b.addEventListener('pointerdown', () => {
    fired = false;
    b.classList.add('holding');
    timer = window.setTimeout(() => {
      fired = true;
      b.classList.remove('holding');
      seen.hold = true;
      go(true);
    }, 500);
  });
  const cancel = () => {
    clearTimeout(timer);
    b.classList.remove('holding');
  };
  b.addEventListener('pointerleave', cancel);
  b.addEventListener('pointercancel', cancel);
  b.addEventListener('pointerup', () => {
    cancel();
    if (!fired) go(false);
  });
}

function ask(who: KeeperId, job: Job, target: number | undefined, insist: boolean) {
  if (!s) return;
  const inp =
    target === undefined
      ? { kind: 'ask' as const, keeper: who, job, insist }
      : { kind: 'ask' as const, keeper: who, job, target, insist };
  queueInput(s, inp);
  writeSave();
  openSheet(null);
}

// ---------- dawn ----------

function dawn() {
  if (!s) return;
  cancelAnimationFrame(raf);
  const d = s.dawns.at(-1);
  if (!d) return;
  const next = PLANS[d.night] ?? null;
  lab.screen(`night ${d.night}: dawn`);
  lab.milestone(`night ${d.night} done`);
  app.innerHTML = `<div class="page dawn">
    ${markLink}
    ${s.phase === 'end' ? `<p class="week-end" role="status">${d.overtopped ? 'The week ends here. Water came over the crest.' : 'First light after Friday night. The week is over; your watch is done.'}</p>` : ''}
    ${reportBody(d, planOf(s).keepers.length > 1)}
    <div id="closing-tally"></div>
    <div class="actions">
      ${s.phase === 'dawn' && next ? `<button class="primary" id="next">${esc(next.title)} night</button>` : ''}
      ${s.phase === 'end' ? '<button class="primary" id="end">Read the week’s outcome</button>' : ''}
      <button id="export">Export this run (playtest)</button>
      <button id="send">Send this run to the notebook</button>
      <button id="menu">Title page</button>
    </div>
    ${footer()}
  </div>`;
  app.querySelector('.actions')?.append(gameMenu());
  updateTally();
  const chart = document.getElementById('chart') as HTMLCanvasElement;
  drawDawn(chart, d);
  document.getElementById('next')?.addEventListener('click', () => {
    if (!s) return;
    queueInput(s, { kind: 'next' });
    writeSave();
    watch();
  });
  document.getElementById('end')?.addEventListener('click', ending);
  document.getElementById('export')?.addEventListener('click', download);
  document.getElementById('send')?.addEventListener('click', sendRun);
  document.getElementById('menu')?.addEventListener('click', title);
  window.scrollTo(0, 0);
}

// ---------- the week ----------

function ending() {
  if (!s) return;
  cancelAnimationFrame(raf);
  lab.screen('ending');
  lab.milestone('ending reached');
  const ds = s.dawns;
  const held = ds.every((d) => !d.overtopped);
  const flooded = ds.filter((d) => d.overtopped || d.mill === 'flooded').length;
  const misses = ds.reduce((a, d) => a + d.misses.length, 0);
  const caught = ds.reduce((a, d) => a + d.misses.filter((m) => m.caught).length, 0);
  const verdict = !held
    ? 'The dam went over on your watch. There will be an inquiry, and they will read the log.'
    : ds.length === NIGHTS && flooded === 0
      ? 'Five nights, and the lane never flooded unwarned. You read the men, not the gauges.'
      : `The dam held all week. Mill Lane flooded ${flooded === 1 ? 'once' : `${flooded} times`} without warning.`;
  app.innerHTML = `<div class="page dawn">
    ${markLink}
    <h2>The week is over</h2>
    <div id="closing-tally"></div>
    <p>${esc(verdict)}</p>
    <ul class="week">${ds
      .map(
        (d) =>
          `<li><b>${PLANS[d.night - 1]?.title}</b> ${d.overtopped ? 'overtopped' : d.spilled ? 'spilled' : 'held'} · Mill Lane ${d.overtopped ? 'flooded' : d.mill} · caught ${d.misses.filter((m) => m.caught).length} of ${d.misses.length}</li>`,
      )
      .join('')}</ul>
    <p class="soft">${misses ? `You caught ${caught} of ${misses} wrong figures before they cost you.` : ''}</p>
    ${(ds.at(-1)?.lines ?? []).map((l) => `<div class="keeperline"><b>${NAMES[l.id]}</b><p class="hand">${esc(l.aboutYou)}</p></div>`).join('')}
    <div class="actions">
      <button class="primary" id="again">Another week</button>
      <button id="export">Export this run (playtest)</button>
      <button id="send">Send this run to the notebook</button>
      <button id="back">Back to the last dawn</button>
    </div>
    ${footer()}
  </div>`;
  app.querySelector('.actions')?.append(gameMenu());
  updateTally();
  document.getElementById('again')?.addEventListener('click', () => {
    beginWeek();
  });
  document.getElementById('export')?.addEventListener('click', download);
  document.getElementById('send')?.addEventListener('click', sendRun);
  document.getElementById('back')?.addEventListener('click', dawn);
  window.scrollTo(0, 0);
}

function sendRun() {
  lab.openSendDialog({ getRun: () => (s ? exportRun(s, FRAMEWORK_VERSION) : {}) });
}

function download() {
  if (!s) return;
  const ex = exportRun(s, FRAMEWORK_VERSION);
  const blob = new Blob([JSON.stringify(ex)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `the-glance-${s.seed}-night${s.night}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- phone niceties ----------

async function requestWake() {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> };
    };
    if (nav.wakeLock && !wake) wake = await nav.wakeLock.request('screen');
  } catch {}
}
function releaseWake() {
  wake?.release().catch(() => {});
  wake = null;
}
window.addEventListener('pagehide', () => writeSave());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    writeSave();
    cancelAnimationFrame(raf);
  } else if (s && s.phase === 'watch' && app.querySelector('.watch')) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
    requestWake();
  }
});

export const _debug = {
  step: (n: number) => {
    for (let i = 0; i < n && s && s.phase === 'watch'; i++) step(s);
    if (s) s.phase === 'watch' ? enter() : dawn();
  },
  get state() {
    return s;
  },
  KEEPERS,
};
