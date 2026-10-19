/**
 * The Glance UI: DOM for the board, the radio log and the sheets; one canvas for the dam. The UI reads state and
 * queues inputs; it never changes the sim directly. Real time drives sim minutes, continuously, slowing while a
 * sheet is open (tactical slowdown, no pause).
 */
import { FRAMEWORK_VERSION } from '@adam0white/human-framework';
import {
  clock,
  type Dawn,
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
  watchFrom,
} from '../sim/dam.ts';
import { KEEPERS, type KeeperId, NAMES } from '../sim/keepers.ts';
import { spoken } from '../sim/reading.ts';
import { TURNS } from '../sim/water.ts';
import { drawDawn } from './dawn.ts';
import { drawScene, SCENE_H, type SceneFx, sceneHit } from './scene.ts';

const SAVE = 'glance-save-v1';
/** Sim minutes per real second. */
const SPEEDS = [0.8, 1.4, 3.5] as const;
const SPEED_NAMES = ['slow', 'steady', 'fast'];
const SLOWDOWN = 0.35;

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
let speed = 1;
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
function writeSave() {
  if (!s) return;
  try {
    localStorage.setItem(SAVE, JSON.stringify({ seed: s.seed, inputs: s.inputs, minute: s.minute }));
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
  const save = readSave();
  app.innerHTML = `<div class="page">
    ${markLink}
    <h1>The Glance</h1>
    <p class="soft">a storm week on the night desk</p>
    <p>The river authority, the night desk. Up the valley, one old dam above a town, and on it a keeper with a torch and a radio.</p>
    <p>Every figure on your board is what he saw.</p>
    <div class="actions">
      ${save ? '<button class="primary" id="cont">Back to the desk</button>' : ''}
      <button class="${save ? '' : 'primary'}" id="new">${save ? 'Start the week again' : 'Take the night desk'}</button>
      <button id="load">Load a playtest run</button>
      <input type="file" id="file" accept="application/json" hidden />
    </div>
    ${footer()}
  </div>`;
  document.getElementById('cont')?.addEventListener('click', () => {
    if (!save) return;
    s = replay(save.seed, save.inputs, save.minute);
    enter();
  });
  document.getElementById('new')?.addEventListener('click', () => {
    clearSave();
    s = newGame((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    enter();
  });
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

function enter() {
  if (!s) return;
  seenFlashes = s.flashes.length;
  if (s.phase === 'watch') watch();
  else if (s.phase === 'dawn') dawn();
  else ending();
}

// ---------- the watch ----------

function watch() {
  if (!s) return;
  sheet = null;
  sheetKey = '';
  requestWake();
  app.innerHTML = `<div class="watch">
    <div class="top"><a class="mark" href="https://human.adamwhite.work" aria-label="human framework">◇</a><span class="grow"></span><span id="night"></span><span class="clock" id="clock"></span><span class="speed" id="speed"></span></div>
    <canvas id="scene" class="scene" style="height:${SCENE_H}px" aria-label="The dam, as reported"></canvas>
    <div class="board" id="board"></div>
    <div class="log" id="log" aria-live="polite"></div>
    <div class="sheet" id="sheet"></div>
  </div>`;
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
    const hit = sceneHit(s, e.clientX - r.left, e.clientY - r.top, r.width);
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
  const dt = Math.min(0.25, (t - last) / 1000);
  last = t;
  if (s.phase === 'watch') {
    const base = SPEEDS[speed] ?? 1.4;
    const rate = sheet ? Math.min(base, SLOWDOWN) : base;
    carry += dt * rate;
    let stepped = false;
    while (carry >= 1 && s.phase === 'watch') {
      carry -= 1;
      step(s);
      stepped = true;
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
      if (s.minute % 10 === 0) writeSave();
    }
    const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
    if (canvas) drawScene(canvas, s, fx, t);
  }
  if (s.phase !== 'watch') {
    writeSave();
    releaseWake();
    if (s.phase === 'dawn') dawn();
    else ending();
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
  if (n) n.textContent = planOf(s).title;
  if (c) c.textContent = clock(s.minute);
  document.querySelectorAll('#speed button').forEach((b, i) => {
    b.classList.toggle('on', i === speed);
  });
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
        <circle cx="30" cy="31" r="2" fill="currentColor"/></svg>
        <span class="lab">${g.label}</span>
        <span class="num">${printed(r, g.id)}</span>
        <span class="by hand">${r ? hand(`${who} ${clock(r.wrote)}`, r.who === 'nerys' ? 0 : 1 - r.clarity, r.at) : 'not read'}</span>
      </button>`;
    })
    .join('');
  setHtml(el, html);
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
      return `<div class="line ${sayClass(x)}"><span class="t">${clock(x.at)}</span>${who ? `<b>${who}</b> ` : ''}<span class="${sayClass(x) === 'p' ? 'hand' : ''}">${body}</span></div>`;
    })
    .join('');
}

// ---------- sheets ----------

function openSheet(sh: Sheet) {
  sheet = sh;
  sheetKey = '';
  drawSheet();
}

function drawSheet() {
  if (!s) return;
  const el = document.getElementById('sheet');
  if (!el || el.querySelector('.holding')) return;
  if (!sheet) {
    const html = `<div class="crew">${planOf(s)
      .keepers.map(
        (id) =>
          `<button data-k="${id}"><b>${NAMES[id]}</b><span class="soft">${whereWords(id)}</span></button>`,
      )
      .join(
        '',
      )}${planOf(s).inn ? '<button data-inn="1"><b>Bridge Inn</b><span class="soft">Nerys</span></button>' : ''}</div>
      <p class="hint">Tap a gauge to have it read. Tap a keeper to talk to him.</p>`;
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
        if (!insist || !s) return;
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
    const g = Math.round(s.water.gate);
    const reported = s.board.gate?.value ?? g;
    const opts: number[] = [];
    for (let t = 0; t <= TURNS; t++) if (t !== reported) opts.push(t);
    const hs = opts.map((t) => hint(s as GameState, who, 'gate', t));
    const next = hint(s, who, 'gate', Math.min(TURNS, reported + 1));
    head = `<b>Gate</b><span class="soft">${NAMES[who]} turns it by hand</span>`;
    body = `${next.forecast ? `<p class="fore hand">“${esc(next.forecast)}”</p>` : ''}
      <div class="verbs turns">${hs
        .map(
          (h) =>
            `<button data-job="gate" data-t="${h.target}"><span class="fill"></span><span>${h.target === 0 ? 'shut' : `${h.target}`}</span><span class="h ${h.verdict === 'refused' ? 'no' : ''}">${esc(h.short)}</span></button>`,
        )
        .join(
          '',
        )}</div><p class="hint">Turns open, out of ${TURNS}. ${seen.hold ? '' : 'Hold a button to insist.'}</p>`;
  } else if (sheet.kind === 'gauge') {
    const job: Job = sheet.gauge === 'weir' ? 'weir' : 'level';
    const h = hint(s, who, job);
    const hi = hint(s, who, job, undefined, true);
    head = `<b>${job === 'level' ? 'Level' : 'Weir'}</b><span class="soft">${job === 'level' ? 'the staff gauge on the dam face' : 'the weir board, a long walk upstream'}</span>`;
    body = `${verbButtons([{ h, label: job === 'level' ? `Ask ${NAMES[who]} to read it` : `Send ${NAMES[who]} to the weir`, insist: hi }])}
      ${h.forecast ? `<p class="fore hand">“${esc(h.forecast)}”</p>` : ''}
      <p class="hint">${lastWords(s, sheet.gauge)}</p>`;
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
  if (!setHtml(el, `<div class="who">${head}<button class="x" id="x">close</button></div>${crewRow}${body}`))
    return;
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
        `<button data-job="${h.job}"><span class="fill"></span><span>${esc(label)}</span><span class="h ${h.verdict === 'refused' ? 'no' : ''}">${esc(h.short)}${insist && insist.verdict !== h.verdict ? ` · held: ${esc(insist.short)}` : ''}</span></button>`,
    )
    .join('')}</div>`;
}

function lastWords(st: GameState, g: Gauge): string {
  const r = st.board[g];
  if (!r) return 'Nobody has read it yet tonight.';
  const who = r.who === 'nerys' ? 'Nerys' : NAMES[r.who as KeeperId];
  const ago = st.minute - r.at;
  return `Last: ${who}, ${ago < 3 ? 'just now' : `${ago} minutes ago`}: “${esc(reportWords(st, r))}”`;
}

function whereWords(id: KeeperId): string {
  if (!s) return '';
  const k = keeperOf(s, id);
  const a = personOf(s, id).activity?.affordanceId;
  if (a === 'doze' || a === 'nap') return a === 'nap' ? 'asleep, as you said' : 'not answering';
  const j = k.job;
  if (j) {
    const walking = s.minute < j.startedAt + j.walk;
    const where = {
      level: 'the staff gauge',
      weir: 'the weir',
      gate: 'the wheel',
      stove: 'the hut',
      nap: 'the hut',
      clear: 'the screen',
    }[j.job];
    if (j.skip) return 'in the hut';
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

const CAUSE: Record<string, string> = {
  fresh: 'A plain misread',
  sleepy: 'He was short of sleep, and further behind than he felt',
  trough: 'The small hours, when the body is at its lowest',
  spent: 'He was spent from the wheel',
  weather: 'Rain in his face and a weak torch',
  afraid: 'He was frightened',
  skipped: 'He never walked there; he gave you the last figure',
  gossip: '',
};

const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const count = (n: number) => WORDS[n] ?? String(n);

function houseRow(n: number, fate: Dawn['mill']): string {
  return Array.from(
    { length: n },
    (_, i) =>
      `<svg class="house ${fate}" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 18 V9 L10 3 L17 9 V18 Z" fill="${fate === 'flooded' ? 'var(--sky)' : 'none'}" fill-opacity="${fate === 'flooded' ? 0.45 : 0}" stroke="currentColor" stroke-width="1.4"/>${fate === 'saved' ? `<line x1="4" y1="15" x2="16" y2="${15 + (i % 2)}" stroke="var(--sky)" stroke-width="1.4"/>` : ''}</svg>`,
  ).join('');
}

function fateWords(d: Dawn): string {
  if (d.overtopped) return 'Water came over the crest of the dam.';
  const parts: string[] = [];
  parts.push(
    d.mill === 'dry'
      ? 'Mill Lane slept dry.'
      : d.mill === 'saved'
        ? 'Mill Lane took water, but they had their things upstairs.'
        : 'Mill Lane flooded before anyone knocked.',
  );
  if (d.square !== 'dry')
    parts.push(d.square === 'saved' ? 'The square went under; they were ready.' : 'The square went under.');
  if (d.falseAlarm) parts.push('The warning was for nothing. The lane will remember.');
  if (d.spilled && !d.overtopped) parts.push('The dam went over its lip and the spillway ran.');
  return parts.join(' ');
}

function missLine(m: Dawn['misses'][number]): string {
  const who = NAMES[m.who];
  const f = m.gauge === 'level' ? spoken(m.said) : m.said.toFixed(2);
  const t = m.gauge === 'level' ? spoken(m.truth) : m.truth.toFixed(2);
  return `<li><span class="t">${clock(m.at)}</span> ${who} said <b>${f}</b> at the ${m.gauge === 'level' ? 'staff' : 'weir'}. It was ${t}. <span class="soft">${esc(CAUSE[m.cause] ?? '')}.</span>${m.caught ? ' <span class="caught">You caught it.</span>' : ''}</li>`;
}

function dawn() {
  if (!s) return;
  cancelAnimationFrame(raf);
  const d = s.dawns.at(-1) as Dawn;
  const next = PLANS[d.night] ?? null;
  const caught = d.misses.filter((m) => m.caught).length;
  app.innerHTML = `<div class="page dawn">
    ${markLink}
    <h2>${PLANS[d.night - 1]?.title ?? ''}, first light</h2>
    <p>${esc(fateWords(d))}</p>
    <canvas id="chart" class="chart" aria-label="The night's true level against his figures"></canvas>
    <p class="soft legend"><span class="key red"></span> what the water did <span class="key dot"></span> what ${planOf(s).keepers.length > 1 ? 'they' : 'he'} told you</p>
    <div class="houses"><span class="soft">Mill Lane</span>${houseRow(4, d.mill)}<span class="soft">square</span>${houseRow(6, d.square)}</div>
    ${d.misses.length ? `<h3>Where the board was wrong</h3><ul class="misses">${d.misses.slice(0, 6).map(missLine).join('')}</ul><p class="soft">${caught ? `You caught ${count(caught)} of ${count(d.misses.length)}.` : 'You caught none of them.'}</p>` : '<p>Every figure tonight was near enough the truth.</p>'}
    ${d.dozes.map((z) => `<p class="soft">${NAMES[z.who]} slept by the stove, ${clock(z.from)} to ${clock(z.to)}.</p>`).join('')}
    ${d.strain.map((id) => `<p class="soft">${NAMES[id]} hurt his shoulder on the wheel. He didn’t say.</p>`).join('')}
    ${d.lines
      .map(
        (l) =>
          `<div class="keeperline"><b>${NAMES[l.id]}</b>${l.line ? `<p class="hand">${esc(l.line)}</p>` : ''}<p class="hand">${esc(l.aboutYou)}</p></div>`,
      )
      .join('')}
    <div class="actions">
      ${s.phase === 'dawn' && next ? `<button class="primary" id="next">${esc(next.title)} night</button>` : ''}
      ${s.phase === 'end' ? '<button class="primary" id="end">The week</button>' : ''}
      <button id="export">Export this run (playtest)</button>
      <button id="menu">Title page</button>
    </div>
    ${footer()}
  </div>`;
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
  document.getElementById('menu')?.addEventListener('click', title);
  window.scrollTo(0, 0);
}

// ---------- the week ----------

function ending() {
  if (!s) return;
  cancelAnimationFrame(raf);
  const ds = s.dawns;
  const held = ds.every((d) => !d.overtopped);
  const flooded = ds.filter((d) => d.mill === 'flooded').length;
  const misses = ds.reduce((a, d) => a + d.misses.length, 0);
  const caught = ds.reduce((a, d) => a + d.misses.filter((m) => m.caught).length, 0);
  const verdict = !held
    ? 'The dam went over on your watch. There will be an inquiry, and they will read the log.'
    : ds.length === NIGHTS && flooded === 0
      ? 'Five nights, and the lane never flooded unwarned. You read the men, not the gauges.'
      : `The dam held all week. Mill Lane flooded ${flooded === 1 ? 'once' : `${flooded} times`} without warning.`;
  app.innerHTML = `<div class="page dawn">
    ${markLink}
    <h2>The week</h2>
    <p>${esc(verdict)}</p>
    <ul class="week">${ds
      .map(
        (d) =>
          `<li><b>${PLANS[d.night - 1]?.title}</b> ${d.overtopped ? 'overtopped' : d.spilled ? 'spilled' : 'held'} · Mill Lane ${d.mill} · caught ${d.misses.filter((m) => m.caught).length} of ${d.misses.length}</li>`,
      )
      .join('')}</ul>
    <p class="soft">${misses ? `You caught ${caught} of ${misses} wrong figures before they cost you.` : ''}</p>
    ${(ds.at(-1)?.lines ?? []).map((l) => `<div class="keeperline"><b>${NAMES[l.id]}</b><p class="hand">${esc(l.aboutYou)}</p></div>`).join('')}
    <div class="actions">
      <button class="primary" id="again">Another week</button>
      <button id="export">Export this run (playtest)</button>
      <button id="back">Back to the last dawn</button>
    </div>
    ${footer()}
  </div>`;
  document.getElementById('again')?.addEventListener('click', () => {
    clearSave();
    s = newGame((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    enter();
  });
  document.getElementById('export')?.addEventListener('click', download);
  document.getElementById('back')?.addEventListener('click', dawn);
  window.scrollTo(0, 0);
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
    if (s) enter();
  },
  get state() {
    return s;
  },
  KEEPERS,
};
