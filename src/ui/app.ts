import {
  feedbackPersonaControl,
  feedbackSharePlay,
  setTelemetryOff,
  telemetryNotice,
  telemetryOn,
} from '@adam0white/lab-kit';
import { required } from '../required.ts';
/**
 * The Glance UI: DOM for the board, the radio log and the sheets; one canvas for the dam. The UI reads state and
 * queues inputs; it never changes the sim directly. Real time drives sim minutes, continuously, slowing while a
 * sheet is open. Game menus and notebook dialogs hold time.
 */

import { FRAMEWORK_VERSION } from '@adam0white/human-framework';
import { personaChannel, watchPersonaCheckpoint } from '@adam0white/lab-client';
import { Continuity, LOCAL_KEY, watchShelfPreference } from '../continuity.ts';
import { ALLOCATION, CAST, type CastId, discoveriesFor, rememberedConversation } from '../sim/cast.ts';
import {
  clock,
  exportRun,
  type GameState,
  type Gauge,
  type Hint,
  hint,
  type Job,
  keeperOf,
  NIGHTS,
  PLANS,
  personOf,
  planOf,
  queueInput,
  type Report,
  reportWords,
  type Said,
  step,
  walkMinutes,
  watchFrom,
} from '../sim/dam.ts';
import { KEEPERS, type KeeperId, NAMES } from '../sim/keepers.ts';
import { importCurrent } from '../sim/run.ts';
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

const labMode = () => new URLSearchParams(location.search).get('lab') === '1';

const SAVE = LOCAL_KEY;
const continuity = new Continuity(lab, personaChannel(), () => {
  if (s) writeSave();
  const status = document.getElementById('continuity-status');
  if (status) status.textContent = continuity.status;
});
let selectedRate = 1.4;
let paceChoice = 'Automatic';
let skipUntil = 0;
let screen = 'title';
let saveFailed = false;

interface Save {
  run: ReturnType<typeof exportRun>;
  runId: string;
  heads: unknown[];
  fileOrigin: boolean;
  sources: unknown[];
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

lab.trackRun(() => (s ? exportRun(s, FRAMEWORK_VERSION) : null), {
  runKey: () => s?.seed ?? 'title',
  getLogs: () => s?.said.slice(-40).map((line) => line.text) ?? [],
});

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
  const text = continuity.localSave(s);
  localStorage.setItem(SAVE, text);
  lab.captureSave(exportRun(s, FRAMEWORK_VERSION));
}
function writeSave() {
  if (!s) return;
  closeOwnedDeaths();
  try {
    saveNow();
    saveFailed = false;
  } catch {
    saveFailed = true;
  }
  const host = app.querySelector('.desk-context, .page-body');
  let warning = document.getElementById('save-warning');
  if (saveFailed && host && !warning) {
    warning = document.createElement('p');
    warning.id = 'save-warning';
    warning.className = 'save-warning';
    warning.setAttribute('role', 'status');
    warning.textContent =
      'This browser could not save your progress. Keep this page open. The game will try saving again as you play.';
    host.prepend(warning);
  } else if (!saveFailed) warning?.remove();
}
function clearSave() {
  try {
    localStorage.removeItem(SAVE);
  } catch {}
}

// ---------- helpers ----------

const esc = (x: string) =>
  x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const GAMES = 'https://human.adamwhite.work/games/';
const PRIVACY = 'https://human.adamwhite.work/lab/privacy/';
function topbar(label: string, home = false) {
  return `<header class="topbar"><div class="topbar-label">${home ? `<a href="${GAMES}" target="_top">All games</a>` : label}</div><div class="topbar-actions"><button id="help" class="info" aria-label="Information" popovertarget="about">i</button><button id="menu" aria-label="Game menu" aria-haspopup="dialog">≡</button></div></header>`;
}
function bindTopbar() {
  showAbout();
  document.getElementById('menu')?.addEventListener('click', gameMenu);
}
function closeDialogs() {
  app.querySelectorAll('dialog').forEach((d) => {
    d.remove();
  });
  carry = 0;
  last = performance.now();
}
function dialog(
  id: string,
  heading: string,
  body: string,
  actions = '<button class="primary" id="dialog-back">Back</button>',
) {
  skipUntil = 0;
  closeDialogs();
  const d = document.createElement('dialog');
  d.id = id;
  d.className = 'game-dialog';
  d.innerHTML = `<div class="dialog-head"><h2>${heading}</h2><button class="x" aria-label="Close">×</button></div><div class="dialog-body">${body}</div><div class="dialog-actions">${actions}</div>`;
  app.append(d);
  d.querySelector('.x')?.addEventListener('click', closeDialogs);
  d.querySelector('#dialog-back')?.addEventListener('click', closeDialogs);
  d.addEventListener('click', (e) => {
    if (e.target === d) closeDialogs();
  });
  d.showModal();
  return d;
}

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
  if (
    !import.meta.env.DEV &&
    'serviceWorker' in navigator &&
    !['localhost', '127.0.0.1'].includes(location.hostname)
  )
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  title();
  const notice = telemetryNotice();
  if (notice) {
    const footer = document.getElementById('lab-notice') ?? document.createElement('footer');
    footer.id = 'lab-notice';
    footer.append(notice);
    document.body.append(footer);
  }
}

function title() {
  continuity.invalidate();
  cancelAnimationFrame(raf);
  screen = 'title';
  sheet = null;
  skipUntil = 0;
  lab.screen('title');
  const save = readSave();
  let restored: GameState | null = null;
  try {
    if (save) restored = importCurrent(save.run);
  } catch {
    /* Explicit fresh play remains available. */
  }
  app.innerHTML = `<div class="page screen title-screen">${topbar('', true)}
    <div class="page-body"><h1>The Glance</h1><p class="subtitle">You work at a night desk above a valley town.</p>
    <button class="sample-morning" id="sample" aria-label="Read a sample morning"><canvas id="sample-chart" aria-label="A good morning: the water fell and the town stayed dry"></canvas><span>A good morning: the gate opened early, the level fell, the river rose later, and the town stayed dry.</span></button>
    <p id="goal">Keep the water below the top of the dam. Keep the town dry, or warn people before it floods. You work five nights, Monday to Friday. The week ends at Friday's first light, or when water comes over the top of the dam.</p>
    ${labMode() ? '<button class="reading-row" id="other">Lab tools <span>▸</span></button>' : ''}</div>
    <div class="actionbar title-actions">${save ? `<button class="primary" id="cont">Resume</button><p class="save-time">${restored ? `${planOf(restored).title} night · ${clock(restored.minute)}` : ''}</p><button id="new">New game</button><div id="restart-confirm" hidden><p>Start a new week? This replaces your saved week after the new week is ready.</p><button id="confirm-new">Yes, start again</button><button id="cancel-new">No</button></div>` : '<button class="primary" id="new">Start game</button>'}
    ${labMode() ? `<p class="credit">People by the Human Framework ${FRAMEWORK_VERSION}</p>` : ''}</div></div>`;
  bindTopbar();
  drawDawn(document.getElementById('sample-chart') as HTMLCanvasElement, SAMPLE_DAWN);
  document.getElementById('sample')?.addEventListener('click', () => {
    const d = dialog('sample-page', 'A sample morning', reportBody(SAMPLE_DAWN, false, true));
    drawDawn(d.querySelector('#chart') as HTMLCanvasElement, SAMPLE_DAWN);
  });
  document.getElementById('cont')?.addEventListener('click', async () => {
    if (!restored) {
      startError(
        new Error('The saved run could not be read.'),
        () => document.getElementById('cont')?.click(),
        'load',
      );
      return;
    }
    try {
      const loaded = await continuity.loadLocal(JSON.stringify(save));
      s = loaded;
      const generation = continuity.generation;
      await continuity.recording();
      if (generation !== continuity.generation || s !== loaded) return;
      readUntil = performance.now() + 6000;
      enter();
    } catch (error) {
      startError(error, () => document.getElementById('cont')?.click(), 'load');
    }
  });
  document.getElementById('new')?.addEventListener('click', () => {
    if (!save) beginWeek();
    else {
      required(document.getElementById('restart-confirm')).hidden = false;
      required(document.getElementById('new')).hidden = true;
    }
  });
  document.getElementById('confirm-new')?.addEventListener('click', () => {
    void beginWeek();
  });
  document.getElementById('cancel-new')?.addEventListener('click', () => {
    required(document.getElementById('restart-confirm')).hidden = true;
    required(document.getElementById('new')).hidden = false;
  });
  document.getElementById('other')?.addEventListener('click', otherWays);
}

function otherWays() {
  if (!labMode()) return;
  const d = dialog(
    'other-ways',
    'Other ways in',
    '<button id="browser-people">Browser people and continuity</button><button id="load">Load a playtest run</button><input type="file" id="file" accept="application/json" hidden><p id="load-result" role="status"></p>',
  );
  const file = d.querySelector('#file') as HTMLInputElement;
  d.querySelector('#browser-people')?.addEventListener('click', continuityMenu);
  d.querySelector('#load')?.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    const result = d.querySelector('#load-result') as HTMLElement;
    try {
      const loaded = await continuity.importFile(await f.text());
      s = loaded;
      const generation = continuity.generation;
      await continuity.recording();
      if (generation !== continuity.generation || s !== loaded) return;
      writeSave();
      result.textContent = 'The replay matches the exported run. Recording follows your menu choice.';
      const resume = d.querySelector('#dialog-back') as HTMLButtonElement;
      resume.textContent = 'Back to the desk';
      resume.addEventListener('click', enter);
    } catch {
      result.textContent = 'That file is not a saved game from this edition of The Glance. Start a new game.';
    }
  });
}

async function beginWeek(localOnly = false) {
  continuity.invalidate();
  cancelAnimationFrame(raf);
  const previous = s;
  try {
    const prepared = await continuity.fresh(Date.now() >>> 0, localOnly === true);
    s = prepared;
    const generation = continuity.generation;
    clearSave();
    await continuity.recording();
    if (generation !== continuity.generation || s !== prepared) return;
    enter();
    window.scrollTo(0, 0);
  } catch (error) {
    s = previous;
    if (s?.phase === 'watch') {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    startError(error, () => void beginWeek(localOnly));
  }
}

function startError(error: unknown, retry: () => void, action = 'start') {
  console.error('Glance chapter failed', error);
  const d = dialog(
    'start-error',
    action === 'load' ? 'Could not resume' : 'Could not start',
    `<p>We could not ${action === 'load' ? 'resume' : 'start'} the week. Your saved week is unchanged. You can try again or send Feedback.</p>${labMode() ? `<pre>${esc(String(error))}</pre>` : ''}`,
    '<button id="retry-start">Try again</button><button id="error-feedback">Feedback</button><button id="dialog-back">Back</button>',
  );
  d.querySelector('#retry-start')?.addEventListener('click', retry);
  d.querySelector('#error-feedback')?.addEventListener('click', sendWord);
}

function continuityMenu() {
  if (!labMode()) return;
  const d = dialog(
    'continuity',
    'People between chapters',
    `<p id="continuity-status" role="status">${esc(continuity.status)}</p><p>The game checks the saved histories of all five people together before a new chapter starts. A loaded game keeps the people it started with. You choose separately whether to carry people between games, record play or allow character analysis.</p><label><input type="checkbox" id="continuity-enabled" ${continuity.shelf.enabled ? 'checked' : ''}>Continue people between games</label><button id="fresh-local">Start fresh locally without browser histories</button>${s ? `<button id="departure">${s.chapterPaused ? 'Resume chapter' : 'Pause chapter for departure'}</button><p>Finish the storm week before people leave their duties. They must finish their current work before you can pause the chapter. Their health or other duties may still prevent travel.</p><details><summary>Save a person to browser continuity</summary>${ALLOCATION.map((c) => `<p>${c.name}<button data-checkpoint="${c.castId}">Save ${c.name}</button><button data-fork="${c.castId}">Save a separate history for ${c.name}</button></p>`).join('')}</details><p>Recorded play links across games on this device. Switch recording off in the game menu.</p><button id="continuity-export">Download run and source archive</button>` : ''}<a href="https://human.adamwhite.work/lab/people/" target="_blank" rel="noopener">Inspect or export browser people</a>`,
    '<button id="dialog-back">Back</button>',
  );
  const attempt = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      continuity.status = String(error);
    }
    const status = document.getElementById('continuity-status');
    if (status) status.textContent = continuity.status;
    writeSave();
  };
  d.querySelector('#continuity-enabled')?.addEventListener('change', (e) => {
    void attempt(() => continuity.setEnabled((e.target as HTMLInputElement).checked));
  });
  d.querySelector('#fresh-local')?.addEventListener('click', () => {
    void beginWeek(true);
  });
  d.querySelector('#departure')?.addEventListener('click', () => {
    if (!s) return;
    queueInput(s, { kind: s.chapterPaused ? 'resume' : 'pause' });
    writeSave();
    closeDialogs();
  });
  d.querySelectorAll<HTMLButtonElement>('[data-checkpoint]').forEach((b) => {
    b.addEventListener('click', () => {
      void attempt(() => continuity.checkpoint(b.dataset.checkpoint ?? ''));
    });
  });
  d.querySelectorAll<HTMLButtonElement>('[data-fork]').forEach((b) => {
    b.addEventListener('click', () => {
      void attempt(() => continuity.checkpoint(b.dataset.fork ?? '', true));
    });
  });
  d.querySelector('#continuity-export')?.addEventListener('click', download);
}

function showAbout() {
  document.getElementById('about')?.remove();
  const about = document.createElement('div');
  about.setAttribute('popover', 'auto');
  about.id = 'about';
  let heading = 'The night desk';
  let words =
    "You work at the river authority's night desk. One old dam stands above a town. A keeper reads the gauges with a flashlight and reports the readings by radio. Every reading on your board is what he saw. Tap a gauge to choose a job. Tap the job to ask him. Hold the job button to insist. You work five nights. The week ends at Friday's first light, or when water comes over the top of the dam.";
  if (screen === 'watch') {
    heading = 'Reading the desk';
    words =
      'The level is the height of water behind the dam. The spillway lip is where water starts to overflow into the spillway. The crest is the top of the dam. The dial marks both heights. More gate turns lower the water behind the dam. The river through town rises about forty minutes later. “Read” is the time he wrote down. “Reported” is when the report reached you. Each job shows his answer and roughly how long it takes. Time stops while an inspection is open. Let him rest between jobs.';
    if (s && s.night >= 2)
      words +=
        ' The weir is a low barrier upstream. Its gauge shows how much water is coming in. It is a long walk away. Call Nerys at the Bridge Inn to ask about the river. Hold Warn Mill Lane to send the warden to knock on doors. A false warning makes Nerys less willing to help you.';
    if (s && s.night >= 3)
      words +=
        ' Choose who does the job in each inspection. The other keeper can rest. Two men can read the same gauge differently.';
    if (s && s.night >= 4)
      words +=
        ' When the radio is out, no request or report gets through. You cannot send requests or receive reports until the radio returns.';
  } else if (screen === 'dawn') {
    heading = 'The morning page';
    words =
      'The red line is what the water did. The dots are what you were told, at the time they were really read. A wrong reading counts as caught if you had it read again within twenty minutes, or lightning showed the wall.';
  } else if (screen === 'end') {
    heading = 'The tally';
    words =
      'The tally adds the nights the dam held, the nights Mill Lane stayed dry or was warned in time, and the wrong readings you caught. It counts the desk’s results. It does not rate the people.';
  }
  about.innerHTML = `<div class="dialog-head"><h2>${heading}</h2><button id="close-about" class="x" aria-label="Close information" popovertarget="about" popovertargetaction="hide">×</button></div><p>${esc(words)}</p>`;
  app.append(about);
  about.addEventListener('toggle', () => {
    skipUntil = 0;
    carry = 0;
    last = performance.now();
  });
}

function enter() {
  if (!s) return;
  seenFlashes = s.flashes.length;
  if (s.phase === 'watch') watch();
  else if (s.phase === 'dawn') dawn();
  else ending();
}

function recordSwitch(id: string) {
  return `<label class="record-switch"><input type="checkbox" id="${id}" ${telemetryOn(lab) ? 'checked' : ''}>Record play for the lab</label>`;
}
function bindRecord(d: HTMLElement, id: string, changed?: () => void) {
  d.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    setTelemetryOff(lab, !input.checked);
    input.checked = telemetryOn(lab);
    changed?.();
  });
}
function gameMenu() {
  writeSave();
  const d = dialog(
    'game-menu',
    `Game menu${s ? ` · ${planOf(s).title} ${clock(s.minute)}` : ''}`,
    `<p>Time stops while this menu is open.</p>
    ${labMode() ? `<fieldset class="pace-setting"><legend>The night’s pace</legend>${['Automatic', 'Slow', 'Steady', 'Fast'].map((name) => `<button data-pace="${name}" aria-pressed="${paceChoice === name}">${name}</button>`).join('')}</fieldset><button class="reading-row" id="browser-people">People between chapters</button><button class="reading-row" id="to-title">To the title page</button>` : ''}
    <button class="reading-row" id="send-word">Feedback</button><button class="reading-row" id="fullscreen">Full screen</button><a class="reading-row" href="${GAMES}" target="_top">All games</a>${recordSwitch('record-menu')}<button id="menu-new">New game</button><div id="menu-confirm" hidden><p>Start a new week? This replaces your saved week after the new week is ready.</p><button id="menu-confirm-new">Yes, start again</button><button id="menu-cancel-new">Cancel</button></div>`,
    '<button class="primary" id="dialog-back">Resume</button>',
  );
  d.querySelector('#menu-new')?.addEventListener('click', () => {
    required(d.querySelector<HTMLElement>('#menu-confirm')).hidden = false;
  });
  d.querySelector('#menu-cancel-new')?.addEventListener('click', () => {
    required(d.querySelector<HTMLElement>('#menu-confirm')).hidden = true;
  });
  d.querySelector('#menu-confirm-new')?.addEventListener('click', () => void beginWeek());
  d.querySelector('#dialog-back')?.addEventListener('click', () => {
    if (s?.chapterPaused) {
      queueInput(s, { kind: 'resume' });
      writeSave();
    }
  });
  bindRecord(d, 'record-menu');
  d.querySelectorAll<HTMLButtonElement>('[data-pace]').forEach((b) => {
    b.addEventListener('click', () => {
      paceChoice = required(b.dataset.pace);
      selectedRate = ({ Slow: 0.8, Steady: 1.4, Fast: 2.4 } as Record<string, number>)[paceChoice] ?? 1.4;
      d.querySelectorAll('[data-pace]').forEach((x) => {
        x.setAttribute('aria-pressed', String(x === b));
      });
    });
  });
  d.querySelector('#browser-people')?.addEventListener('click', continuityMenu);
  d.querySelector('#to-title')?.addEventListener('click', title);
  d.querySelector('#send-word')?.addEventListener('click', sendWord);
  d.querySelector('#fullscreen')?.addEventListener('click', () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  });
  d.querySelector('#mornings')?.addEventListener('click', mornings);
}
function mornings() {
  if (!s) return;
  const d = dialog(
    'mornings',
    'This week’s mornings',
    [...s.dawns]
      .reverse()
      .map(
        (dawn) =>
          `<button class="reading-row" data-morning="${dawn.night}">${PLANS[dawn.night - 1]?.title} · first light ▸</button>`,
      )
      .join(''),
  );
  d.querySelectorAll<HTMLButtonElement>('[data-morning]').forEach((b) => {
    b.addEventListener('click', () => {
      const morning = s?.dawns.find((x) => x.night === Number(b.dataset.morning));
      if (!morning) return;
      const page = dialog(
        'past-morning',
        `${PLANS[morning.night - 1]?.title} · first light`,
        reportBody(morning, morning.night >= 3),
      );
      drawDawn(page.querySelector('#chart') as HTMLCanvasElement, morning);
      page.querySelector('#dialog-back')?.addEventListener('click', mornings);
    });
  });
  d.querySelector('#dialog-back')?.addEventListener('click', () => openSheet(null));
}
function feedbackName() {
  try {
    return localStorage.getItem('hf-lab-feedback-name') ?? '';
  } catch {
    return '';
  }
}
function sendWord() {
  let sent = false;
  const d = dialog(
    'feedback',
    'Feedback',
    `<p>Send a note about this game. Recorded play links across games on this device. You can switch recording off in the menu.</p>
    <div class="verdicts" role="group" aria-label="Your verdict">${[
      ['keep', "I'd keep playing"],
      ['mixed', 'Not sure'],
      ['quit', "I'd stop here"],
    ]
      .map(([id, label]) => `<button data-verdict="${id}" aria-pressed="false">${label}</button>`)
      .join('')}</div>
    <label class="feedback-note">What happened? What did you want to do? What got in the way?<textarea id="feedback-note" rows="4"></textarea></label>
    <label>Your name (optional)<input id="feedback-name" type="text" maxlength="60" value="${esc(feedbackName())}" autocomplete="name"></label><p class="soft">A name links this device’s past and future play history. Leave it empty to avoid linking a name to your play history.</p>
    <p class="soft">We send your note, verdict and optional name. With recording off, we send no run or linked history unless you choose to share it below. <a href="${PRIVACY}" target="_blank" rel="noopener">Lab privacy</a></p><p id="feedback-result" role="status"></p>`,
    '<button id="feedback-back">← Back</button><button class="primary" id="feedback-send">Submit</button>',
  );
  const back = d.querySelector('#feedback-back');
  if (back) d.querySelector('.dialog-head')?.prepend(back);
  const feedbackRun = () => {
    try {
      return s ? exportRun(s, FRAMEWORK_VERSION) : {};
    } catch {
      return undefined;
    }
  };
  const personaChoice = feedbackPersonaControl(lab);
  if (personaChoice) d.querySelector('textarea')?.closest('label')?.after(personaChoice);

  let verdict = '';
  const send = d.querySelector('#feedback-send') as HTMLButtonElement;
  const update = () => {
    send.disabled = false;
  };
  update();
  d.querySelector('#feedback-back')?.addEventListener('click', gameMenu);
  d.querySelector('#keep-copy')?.addEventListener('click', download);
  d.querySelectorAll<HTMLButtonElement>('[data-verdict]').forEach((b) => {
    b.addEventListener('click', () => {
      verdict = verdict === b.dataset.verdict ? '' : required(b.dataset.verdict);
      d.querySelectorAll<HTMLButtonElement>('[data-verdict]').forEach((x) => {
        x.setAttribute('aria-pressed', String(x.dataset.verdict === verdict));
      });
    });
  });
  send.addEventListener('click', async () => {
    if (sent) {
      closeDialogs();
      return;
    }
    send.disabled = true;
    const note = (d.querySelector('#feedback-note') as HTMLTextAreaElement).value;
    const who = (d.querySelector('#feedback-name') as HTMLInputElement).value.trim().slice(0, 60);
    try {
      const message = `${verdict ? `[${verdict}] ` : ''}${note}`;
      const sharePlay = feedbackSharePlay(personaChoice);
      const receipt = await lab.sendFeedback(message, {
        name: who,
        run: feedbackRun(),
        sharePlay,
      });
      const sentMessage = `Sent. Your note is stored. Reference ${receipt}.`;
      try {
        localStorage.setItem('hf-lab-feedback-name', who);
      } catch {
        /* The note was stored even when this device cannot remember its name. */
      }
      sent = true;
      required(d.querySelector('#feedback-result')).textContent = sentMessage;
      send.textContent = 'Back to the desk';
      send.disabled = false;
    } catch {
      required(d.querySelector('#feedback-result')).textContent =
        'We could not send your feedback. Please try again.';
      update();
    }
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
  screen = 'watch';
  skipUntil = 0;
  app.innerHTML = `<div class="watch">${topbar('<span id="night"></span> · <span class="clock" id="clock"></span>')}
    <div class="state-strip"><div id="concern" class="attention keeper-chips" aria-live="polite"></div><div id="clock-rate" role="status"></div></div>
    <div class="desk-reminder"><p id="desk-goal">Until Friday's first light: keep the dam below its crest and the town dry, or warned in time.</p><button id="compare-observations">Compare observations</button></div>
    <div class="desk-main"><div class="desk-picture"><div class="scene-zone"><canvas id="scene" class="scene" aria-label="The dam, as reported"></canvas><div id="latest-radio" class="latest-radio hand"></div></div><div class="board" id="board"></div></div>
    <div class="desk-context"><div class="sheet" id="sheet"></div>${s.dawns.length ? '<button id="mornings" class="reading-row">This week’s mornings</button>' : ''}<div class="actionbar" id="skip-bar"><button id="skip" aria-label="Skip to the next event">Skip ⏩</button><span id="skip-caption" class="soft"></span></div></div></div></div>`;
  bindTopbar();
  document.getElementById('compare-observations')?.addEventListener('click', () => {
    if (s) openSheet({ kind: 'gauge', gauge: 'level', who: freeKeeper(s) });
  });
  document.getElementById('mornings')?.addEventListener('click', mornings);
  document.getElementById('skip')?.addEventListener('click', () => {
    if (!s) return;
    skipUntil = skipUntil ? 0 : s.minute + 60;
    if (!skipUntil) readUntil = performance.now() + 6000;
    carry = 0;
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
  if (paused) skipUntil = 0;
  if (paused && readUntil > last) readUntil += elapsed;
  last = t;
  if (s.phase === 'watch' && !paused) {
    const { rate } = playback(sheet !== null, t < readUntil, selectedRate, skipUntil > 0);
    if (rate === 0) carry = 0;
    carry += dt * rate;
    let stepped = false;
    while (carry >= 1 && s.phase === 'watch') {
      carry -= 1;
      const before = eventStamp(s);
      const concernBefore = concernLines(s).join('|');
      step(s);
      stepped = true;
      if (
        eventStamp(s) !== before ||
        (skipUntil > 0 && (concernLines(s).join('|') !== concernBefore || s.minute >= skipUntil))
      ) {
        skipUntil = 0;
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
    drawTop();
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
  const rate = document.getElementById('clock-rate');
  if (rate)
    rate.textContent = playback(
      sheet !== null,
      performance.now() < readUntil,
      selectedRate,
      skipUntil > 0,
    ).reason;
  const skip = document.getElementById('skip') as HTMLButtonElement | null;
  const caption = document.getElementById('skip-caption');
  if (skip) {
    const pending = hasPending(s);
    skip.disabled = !skipUntil && (!pending || s.radioOut);
    skip.textContent = skipUntil ? 'Stop' : 'Skip ⏩';
    if (caption)
      caption.textContent = s.radioOut ? 'The radio is out.' : pending ? '' : 'No report is on its way.';
  }
  const bar = document.getElementById('skip-bar');
  if (bar) bar.hidden = sheet !== null;
}

function hasPending(st: GameState) {
  return (
    st.nerys.ringing !== null ||
    st.inputs.slice(st.applied).some((i) => i.kind === 'ask' || i.kind === 'ring') ||
    planOf(st).keepers.some((id) => {
      const k = keeperOf(st, id);
      return !!k.job || !!k.pending || !!k.deferred || personOf(st, id).activity?.affordanceId === 'nap';
    })
  );
}

function drawBoard() {
  if (!s) return;
  const el = document.getElementById('board');
  if (!el) return;
  const plan = planOf(s);
  const html = GAUGES.filter((g) => (g.id === 'weir' ? plan.weir : g.id === 'bridge' ? plan.inn : true))
    .map((g) => {
      const firstLevel = g.id === 'level' && s?.night === 1 && !s.inputs.some((i) => i.kind === 'ask');
      const r = firstLevel ? null : (s?.board[g.id] ?? null);
      const age = r && s ? s.minute - r.at : 0;
      const fade = r ? Math.max(0.35, 1 - age / 150) : 0.35;
      const who = r ? (r.who === 'nerys' ? 'Nerys' : NAMES[r.who as KeeperId]) : '';
      const doubt = r ? Math.max(0, 1 - r.conf) : 0;
      const ang = needleAngle(r, g.id);
      return `<button class="gauge ${!r ? 'unread' : ''}" aria-pressed="${(sheet?.kind === 'gauge' && sheet.gauge === g.id) || (sheet?.kind === 'inn' && g.id === 'bridge')}" data-g="${g.id}" style="--fade:${fade.toFixed(2)};--tremble:${(doubt * 5).toFixed(1)}deg">
        <svg viewBox="0 0 60 34" aria-hidden="true"><path d="M5 31 A25 25 0 0 1 55 31" fill="none" stroke="currentColor" stroke-width="1.5"/>
        <g class="needle" style="transform-origin:30px 31px;transform:rotate(${ang.toFixed(1)}deg)"><line x1="30" y1="31" x2="30" y2="9" stroke="var(--rope)" stroke-width="2" stroke-linecap="round"/></g>
        ${g.id === 'level' ? dialTicks() : ''}<circle cx="30" cy="31" r="2" fill="currentColor"/></svg>
        <span class="lab">${g.label}</span>
        <span class="num">${printed(r, g.id)}</span>
        <span class="by hand">${r ? `${hand(`${who} · read ${clock(r.wrote)}`, r.who === 'nerys' ? 0 : 1 - r.clarity, r.at)}<span class="as-written"> (as written)</span>` : 'not read'}</span>
        ${wasLine(r, g.id)}${r?.doubted ? '<span class="soft">Marked for another check</span>' : ''}
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
  return `<span class="was soft ${prev.who === r.who ? 'same-reader' : 'other-reader'}">${lead} ${fig}, ${readingTime(prev)}</span>`;
}

function sayClass(x: Said): string {
  if (x.who === 'narrator') return 'n';
  if (x.who === 'radio') return 'r';
  return 'p';
}

function drawLog() {
  if (!s) return;
  const lines = s.said.filter((x) => x.at >= watchFrom(s?.night ?? 1) - 1);
  const latest = document.getElementById('latest-radio');
  const newest = lines.at(-1);
  if (latest && newest) {
    const who =
      newest.who === 'nerys'
        ? 'Nerys'
        : newest.who === 'dai' || newest.who === 'callum'
          ? NAMES[newest.who]
          : '';
    const report = s.reports.findLast((r) => r.who === newest.who && r.at <= newest.at);
    setHtml(
      latest,
      `${who ? `<b>${who}:</b> ` : ''}${hand(newest.text, report ? 1 - report.clarity : 0, newest.at)}`,
    );
  }
  const el = document.getElementById('log');
  if (!el) return;
  const key = lines.map((x) => `${x.at}${x.text}`).join('|');
  if (el.dataset.k === key) return;
  el.dataset.k = key;
  el.innerHTML = lines
    .map((x) => {
      const who =
        x.who === 'narrator' || x.who === 'radio' ? '' : x.who === 'nerys' ? 'Nerys' : CAST[x.who].name;
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
  const logSheet = el.closest<HTMLElement>('.sheet');
  if (logSheet && !logSheet.querySelector('.first-call')) logSheet.scrollTop = logSheet.scrollHeight;
}

// ---------- sheets ----------

function openSheet(sh: Sheet) {
  const same = JSON.stringify(sheet) === JSON.stringify(sh);
  if (!same) document.querySelector<HTMLDetailsElement>('.sheet details')?.removeAttribute('open');
  sheet = sh;
  skipUntil = 0;
  document.querySelector('.watch')?.classList.toggle('sheet-open', sheet !== null);
  document
    .querySelector('.watch')
    ?.classList.toggle('gate-open', sheet?.kind === 'gauge' && sheet.gauge === 'gate');
  drawConcern();
  sheetKey = '';
  carry = 0;
  drawSheet();
  if (!same && sh) {
    const panel = document.getElementById('sheet');
    if (panel) panel.scrollTop = 0;
  }
  drawBoard();
  drawTop();
}

function shortConcern(line: string) {
  return line.replace(/^[^:]+: /, '');
}
function drawConcern() {
  if (!s) return;
  const el = document.getElementById('concern');
  if (!el) return;
  const lines = concernLines(s);
  const ids = planOf(s).keepers;
  const body = `${s.radioOut ? '<span class="radio-chip">The radio has static.</span>' : ''}${ids.map((id) => `<button class="keeper-chip ${lines.find((l) => l.startsWith(`${NAMES[id]}:`))?.includes('not answering') ? 'not-answering' : ''}" data-k="${id}" title="${esc(lines.find((l) => l.startsWith(`${NAMES[id]}:`)) ?? '')}"><b>${NAMES[id]}</b> · ${esc(shortConcern(lines.find((l) => l.startsWith(`${NAMES[id]}:`)) ?? ''))}</button>`).join('')}${planOf(s).inn ? `<button class="keeper-chip" data-inn="1"><b>Nerys</b> · ${esc(shortConcern(lines.find((l) => l.startsWith('Nerys:')) ?? 'Nerys: She is available.'))}</button>` : ''}`;
  if (!setHtml(el, body)) return;
  el.querySelectorAll<HTMLElement>('[data-k]').forEach((b) => {
    b.addEventListener('click', () => openSheet({ kind: 'keeper', who: b.dataset.k as KeeperId }));
  });
  el.querySelector('[data-inn]')?.addEventListener('click', () => openSheet({ kind: 'inn' }));
}

function drawSheet() {
  if (!s) return;
  drawConcern();
  const el = document.getElementById('sheet');
  if (!el || el.querySelector('.holding')) return;
  if (!sheet) {
    const first = s.night === 1 && !s.inputs.some((i) => i.kind === 'ask');
    const key = `log|${first}`;
    if (sheetKey !== key) {
      sheetKey = key;
      el.innerHTML = `${first ? `<div class="first-call"><p>Nobody has read the level tonight.</p>${verbButtons([{ h: deskHint(s, 'dai', 'level'), label: 'Ask Dai to read the level', insist: deskHint(s, 'dai', 'level', undefined, true) }])}</div>` : ''}<div class="log" id="log" aria-live="polite"></div>`;
      const firstButton = el.querySelector<HTMLButtonElement>('[data-job]');
      if (firstButton) bindHold(firstButton, (insist) => ask('dai', 'level', undefined, insist));
    }
    drawLog();
    return;
  }
  const k = JSON.stringify(sheet);
  // A minute changes reads, not controls. Patch the existing DOM when the structure is unchanged.
  const structureKey = `${k}|${planOf(s).keepers.join(',')}|${sheet.kind === 'keeper' && s.treeKnown && s.water.blocked}|${sheet.kind === 'gauge' && sheet.gauge === 'gate' ? s.board.gate?.value : ''}`;
  const previousKey = sheetKey;
  sheetKey = structureKey;
  if (sheet.kind === 'inn') {
    const ringing = s.nerys.ringing !== null;
    const warned = s.warnedAt !== null;
    const html = `<div class="who"><b>Bridge Inn</b><span class="soft">Nerys, by the river stairs</span><button class="x" id="x" aria-label="Close inspection">×</button></div>
      <div class="verbs two">
        <button id="ring" ${ringing ? 'disabled' : ''}><span>Call Nerys</span><span class="h">${ringing ? 'She has gone to look.' : 'Ask how high the river is.'}</span></button>
        <button id="warn" ${warned ? 'disabled' : ''}><span class="fill"></span><span>Warn Mill Lane</span><span class="h">${warned ? `The warning was sent at ${clock(s.warnedAt ?? 0)}.` : 'Hold to send the warden to warn people.'}</span></button>
      </div>${readingNote(s, s.board.bridge)}${castConversations(['nerys', 'bilal', 'wren'])}`;
    if (!patchSheet(el, html, previousKey === structureKey)) return;
    bindConversations(el);
    bindReadingNote(el);
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
          if (h) h.textContent = 'Hold this button to send the warden to warn people.';
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
    ? `<div class="crew small segmented" role="group" aria-label="Who goes"><span class="segment-label">Who goes</span>${planOf(
        s,
      )
        .keepers.map(
          (id) =>
            `<button data-k="${id}" aria-pressed="${id === who}" class="${id === who ? 'on' : ''}"><b>${NAMES[id]}</b><span class="soft">${whereWords(id)}</span></button>`,
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
    const hs = opts.map((t) => deskHint(s as GameState, who, 'gate', t));
    const next = deskHint(s, who, 'gate', Math.min(TURNS, (reported ?? 0) + 1));
    head = `<b>Gate</b><span class="soft">${report ? `The last gate reading was ${reported}/${TURNS}, ${readingTime(report)}.` : 'Nobody has read the gate setting.'}</span>`;
    body = `<details class="fore"><summary>How ${NAMES[who]} expects to feel after this job</summary><span class="hand">${next.forecast ? `“${esc(next.forecast)}”` : 'He has not said how he expects to feel.'}</span></details>
      <div class="verbs turns">${hs
        .map(
          (h) =>
            `<button data-job="gate" data-t="${h.target}"><span class="fill"></span><span>${h.target === 0 ? 'Shut' : `${h.target} ${h.target === 1 ? 'turn' : 'turns'}`}</span><span class="h ${h.verdict === 'refused' ? 'no' : ''}">${esc(h.short)}${h.minutes ? ` · ~${h.minutes}m` : ''}</span></button>`,
        )
        .join(
          '',
        )}</div><p class="hint">The gate opens from 0 to ${TURNS} turns. More turns lower the water behind the dam. The river through town rises later. ${seen.hold ? '' : 'Hold a button to insist.'}</p>`;
  } else if (sheet.kind === 'gauge') {
    const job: Job = sheet.gauge === 'weir' ? 'weir' : 'level';
    const h = deskHint(s, who, job);
    const hi = deskHint(s, who, job, undefined, true);
    head = `<b>${job === 'level' ? 'Level' : 'Weir'}</b><span class="soft">${job === 'level' ? 'This gauge shows the water level behind the dam.' : 'The weir is a low barrier upstream. Its gauge shows incoming water.'}</span>`;
    const firstReading = s.night === 1 && !s.inputs.some((input) => input.kind === 'ask');
    body = `${verbButtons([{ h, label: job === 'level' ? `Ask ${NAMES[who]} to read it` : `Send ${NAMES[who]} to the weir`, insist: hi }])}
      ${job === 'level' ? observation(s) : ''}
      <p class="fore" ${firstReading ? 'hidden' : ''}><span class="soft">How ${NAMES[who]} expects to feel after this job:</span> <span class="hand">${h.forecast ? `“${esc(h.forecast)}”` : 'He has not said how he expects to feel.'}</span></p>
      <div class="previous-reading">${wasLine(s.board[sheet.gauge], sheet.gauge)}</div><p id="threshold" class="soft">${sheet.gauge === 'level' ? esc(thresholdWords(s)) : ''}</p><p class="hint">${firstReading ? 'Every reading is what a keeper saw. It may be wrong.' : lastWords(s, sheet.gauge)}</p>`;
  } else {
    head = `<b>${NAMES[who]}</b><span class="soft">${esc(concernLines(s).find((line) => line.startsWith(`${NAMES[who]}:`)) ?? whereWords(who))}</span>`;
    const jobs: { job: Job; label: string }[] = [
      { job: 'level', label: 'Read the level' },
      { job: 'stove', label: 'Sit by the stove' },
      { job: 'nap', label: 'Take a nap' },
    ];
    if (planOf(s).weir) jobs.splice(1, 0, { job: 'weir', label: 'Go to the weir' });
    if (s.treeKnown && s.water.blocked) jobs.push({ job: 'clear', label: 'Clear the debris screen' });
    body = verbButtons(
      jobs.map((j) => ({
        h: deskHint(s as GameState, who, j.job),
        label: j.label,
        insist: undefined,
      })),
      true,
    );
  }
  const activity = personOf(s, who).activity?.affordanceId;
  const callAdvice = s.radioOut
    ? 'Requests cannot get through. Call again when the radio clears.'
    : activity === 'doze' || activity === 'nap'
      ? 'Wait for his answer. If he does not answer, call again.'
      : '';
  if (sheet.kind === 'keeper') body += castConversations([who]);
  if (sheet.kind === 'gauge') body += readingNote(s, s.board[sheet.gauge]);
  body += `<p class="hint call-advice" ${callAdvice ? '' : 'hidden'}>${callAdvice}</p>`;
  const forecastOpen = el.querySelector<HTMLDetailsElement>('details.fore')?.open ?? false;
  if (
    !patchSheet(
      el,
      `<div class="who">${head}<button class="x" id="x" aria-label="Close inspection">×</button></div>${sheet.kind === 'gauge' ? crewRow : ''}${body}`,
      previousKey === structureKey,
    )
  )
    return;
  bindConversations(el);
  bindReadingNote(el);
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

/** A personal desk note. It does not tell the keeper or reveal whether a report is right. */
function readingNote(st: GameState, report: GameState['board'][Gauge]): string {
  if (!report) return '';
  return `<div class="reading-note"><button id="reading-note" data-report="${st.reports.indexOf(report)}" aria-pressed="${report.doubted === true}">${report.doubted ? 'Remove the check mark' : 'Mark this reading for another check'}</button><p class="hint">${report.doubted ? 'You marked this reading for another check. Ask for a new reading when you are ready.' : 'This adds your own note. It does not say whether the reading is right.'}</p></div>`;
}
function bindReadingNote(el: HTMLElement) {
  const button = el.querySelector<HTMLButtonElement>('#reading-note');
  button?.addEventListener('click', () => {
    if (!s || !button) return;
    queueInput(s, {
      kind: 'doubt',
      report: Number(button.dataset.report),
      marked: button.getAttribute('aria-pressed') !== 'true',
    });
    writeSave();
    openSheet(null);
  });
}

/** Compare only evidence the player has already received, never the live water state. */
function observation(st: GameState): string {
  const flash = st.flashes.at(-1);
  if (!flash)
    return '<section id="observation"><p>The next lightning flash will leave a saved image here. Compare its water line with the keeper’s reading.</p></section>';
  const report = st.board.level;
  // This is a visual estimate on the same wall, with no extra numerical readout.
  const y = (level: number) => Math.max(12, Math.min(148, 148 - (level - 2) * 30));
  return `<section id="observation" aria-label="Saved lightning observation">
    <p>Lightning at ${clock(flash.at)}: a saved image of the water against the dam wall.</p>
    <svg viewBox="0 0 300 170" role="img" aria-label="The saved lightning water line${report ? ' beside the latest reported water line' : ''}">
      <path d="M240 155V28H270L290 155" fill="none" stroke="currentColor"/>
      <path d="M10 28H240" stroke="currentColor" stroke-dasharray="2 5"/><text x="12" y="22">Dam crest</text>
      <path d="M10 ${y(flash.level)}H240" stroke="var(--rope)" stroke-width="3" stroke-dasharray="6 4"/>
      ${report ? `<path d="M10 ${y(report.value)}H240" stroke="var(--sky)" stroke-width="2"/>` : ''}
    </svg>
    <p>The dashed line is the saved image. ${report ? `The solid line is ${NAMES[report.who as KeeperId] ?? 'the keeper'}’s latest reading, ${readingTime(report)}.` : 'There is no keeper reading to compare yet.'}</p>
    <p class="hint">These observations may be from different times. The water can change between them. This image does not show the water now.</p>
  </section>`;
}

function castConversations(ids: CastId[]): string {
  if (!s) return '';
  const available = discoveriesFor(s);
  return `<details class="fore"><summary>People on this shift</summary>${ids.map((id) => `<p><b>${CAST[id].name}, ${CAST[id].age}</b>. ${esc(CAST[id].role)}</p>${s?.discoveries[id] ? `<p class="hand">${esc(rememberedConversation(s as GameState, id) ?? '')}</p>` : `<button data-talk="${id}" ${available.includes(id) ? '' : 'disabled'}>${s?.conversations[id] === undefined ? 'Ask if there is time to talk' : 'Ask to continue the conversation'} · ${CAST[id].name}</button>`}`).join('')}<p class="soft">A private conversation can wait. Close this inspection to let the shift continue. Dam requests still go to the keepers.</p></details>`;
}
function bindConversations(el: HTMLElement) {
  el.querySelectorAll<HTMLButtonElement>('[data-talk]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!s) return;
      queueInput(s, { kind: 'talk', person: button.dataset.talk as CastId });
      writeSave();
      openSheet(null);
    });
  });
}

function patchSheet(el: HTMLElement, html: string, stable: boolean) {
  if (!stable) {
    el.innerHTML = html;
    return true;
  }
  const template = document.createElement('div');
  template.innerHTML = html;
  function patch(old: Node, fresh: Node) {
    if (old.nodeType === Node.TEXT_NODE && fresh.nodeType === Node.TEXT_NODE) {
      if (old.textContent !== fresh.textContent) old.textContent = fresh.textContent;
      return;
    }
    if (!(old instanceof HTMLElement) || !(fresh instanceof HTMLElement)) return;
    if (old.tagName !== fresh.tagName) return;
    for (const attr of Array.from(fresh.attributes))
      if (attr.name !== 'open' && old.getAttribute(attr.name) !== attr.value)
        old.setAttribute(attr.name, attr.value);
    for (const attr of Array.from(old.attributes))
      if (!fresh.hasAttribute(attr.name) && attr.name !== 'open') old.removeAttribute(attr.name);
    if (old.childNodes.length !== fresh.childNodes.length) {
      // Changing hints may add text spans; the control itself remains the same node.
      old.innerHTML = fresh.innerHTML;
    } else
      Array.from(old.childNodes).forEach((child, i) => {
        const freshChild = fresh.childNodes[i];
        if (freshChild) patch(child, freshChild);
      });
  }
  Array.from(el.childNodes).forEach((child, i) => {
    const freshChild = template.childNodes[i];
    if (freshChild) patch(child, freshChild);
  });
  return false;
}

/** Describe the call before commitment; sleeping and radio silence do not promise queued work. */
function deskHint(st: GameState, who: KeeperId, job: Job, target?: number, insist = false): Hint {
  const h = hint(st, who, job, target, insist);
  const activity = personOf(st, who).activity?.affordanceId;
  if (st.radioOut) return { ...h, short: 'The radio is out.', minutes: 0, forecast: '' };
  if (activity === 'doze' || activity === 'nap')
    return { ...h, short: 'Call and wait for his answer.', minutes: 0, forecast: '' };
  return h;
}

function verbButtons(items: { h: Hint; label: string; insist: Hint | undefined }[], grid = false): string {
  return `<div class="verbs ${grid ? 'grid' : 'one'}">${items
    .map(
      ({ h, label, insist }) =>
        `<button data-job="${h.job}"><span class="fill"></span><span>${esc(label)}</span><span class="h ${h.verdict === 'refused' ? 'no' : ''}">${esc(h.short)}${h.minutes && h.job !== 'stove' && h.job !== 'nap' ? ` · ~${h.minutes} min` : ''}${insist && insist.verdict !== h.verdict ? ` · If you hold: ${esc(insist.short)}` : ''}</span></button>`,
    )
    .join('')}</div>`;
}

function lastWords(st: GameState, g: Gauge): string {
  const r = st.board[g];
  if (!r) return 'Nobody has read it yet tonight.';
  const who = r.who === 'nerys' ? 'Nerys' : NAMES[r.who as KeeperId];
  return `${who} last reported this, ${readingTime(r)}: “${esc(reportWords(st, r))}”`;
}

function whereWords(id: KeeperId): string {
  if (!s) return '';
  const k = keeperOf(s, id);
  const a = personOf(s, id).activity?.affordanceId;
  if (a === 'doze' || a === 'nap')
    return a === 'nap' ? 'He is asleep, as you asked.' : 'He is not answering.';
  const j = k.job;
  if (j) {
    const reading = j.job === 'level' || j.job === 'weir';
    const walking =
      s.minute < j.startedAt + (reading ? walkMinutes(j.from, j.job === 'level' ? 'staff' : 'weir') : j.walk);
    const where = {
      level: 'the level gauge',
      weir: 'the weir',
      gate: 'the wheel',
      stove: 'the hut',
      nap: 'the hut',
      clear: 'the debris screen',
    }[j.job];
    return walking
      ? `He is walking to ${where}.`
      : j.job === 'stove'
        ? 'He is by the stove.'
        : `He is at ${where}.`;
  }
  return {
    hut: 'He is in the hut.',
    gate: 'He is at the wheel.',
    staff: 'He is on the dam face.',
    weir: 'He is at the weir.',
  }[k.place];
}

function bindHold(b: HTMLButtonElement, go: (insist: boolean) => void) {
  let timer = 0;
  let fired = false;
  b.addEventListener('click', (e) => {
    if (e.detail === 0) go(false);
  });
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
  screen = 'dawn';
  app.innerHTML = `<div class="page screen dawn">${topbar(`${planOf(s).title} · first light`)}<div class="page-body">
    ${s.phase === 'end' ? `<p class="week-end" role="status">${d.overtopped ? 'The week ends here. Water came over the top of the dam.' : 'It is first light after Friday night. The week is over. Your watch is done.'}</p>` : ''}
    ${reportBody(d, planOf(s).keepers.length > 1)}
    </div><div class="actionbar">
      ${s.phase === 'dawn' && next ? `<button class="primary" id="next">${esc(next.title)} night</button>` : ''}
      ${s.phase === 'end' ? '<button class="primary" id="end">Read the week’s outcome</button>' : ''}
    </div>
  </div>`;
  bindTopbar();
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
  document.getElementById('send')?.addEventListener('click', sendWord);

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
    ? 'Water came over the top of the dam on your watch. There will be an inquiry, and they will read the log.'
    : ds.length === NIGHTS && flooded === 0
      ? 'You worked five nights, and the lane never flooded without warning. You checked the keepers’ readings carefully.'
      : `The dam held all week. Mill Lane flooded ${flooded === 1 ? 'once' : `${flooded} times`} without warning.`;
  screen = 'end';
  app.innerHTML = `<div class="page screen dawn ending">${topbar('The week is over')}<div class="page-body">
    <h2>The week is over</h2>
    <p>${esc(verdict)}</p>
    <ul class="week">${ds
      .map(
        (d) =>
          `<li><b>${PLANS[d.night - 1]?.title}</b> ${d.overtopped ? 'Water came over the dam.' : d.spilled ? 'Water flowed into the spillway.' : 'The dam held.'} Mill Lane ${d.overtopped || d.mill === 'flooded' ? 'flooded without warning' : d.mill === 'saved' ? 'flooded after a warning' : 'stayed dry'}. You caught ${d.misses.filter((m) => m.caught).length} of ${d.misses.length} wrong readings.</li>`,
      )
      .join('')}</ul>
    <p class="soft">${misses ? `You caught ${caught} of ${misses} wrong readings during the week.` : ''}</p>
    ${(ds.at(-1)?.lines ?? []).map((l) => `<div class="keeperline"><b>${NAMES[l.id]}</b><p class="hand">${esc(l.aboutYou)}</p></div>`).join('')}
    <div id="closing-tally"></div><button class="reading-row" id="back">${PLANS[(ds.at(-1)?.night ?? 1) - 1]?.title}'s morning again ▸</button></div>
    <div class="actionbar ending-actions"><div><button id="send">Feedback</button>${labMode() ? '<button id="export">Download this run</button>' : ''}</div><button class="primary" id="again">New game</button></div></div>`;
  bindTopbar();
  updateTally();
  document.getElementById('again')?.addEventListener('click', () => {
    gameMenu();
    document.getElementById('menu-new')?.click();
  });
  document.getElementById('export')?.addEventListener('click', download);
  document.getElementById('send')?.addEventListener('click', sendWord);
  document.getElementById('back')?.addEventListener('click', dawn);
  window.scrollTo(0, 0);
}

function download() {
  if (!s) return;
  const ex = continuity.export(s);
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
      wakeLock?: {
        request(t: 'screen'): Promise<{ release(): Promise<void> }>;
      };
    };
    if (nav.wakeLock && !wake) wake = await nav.wakeLock.request('screen');
  } catch {}
}
function releaseWake() {
  wake?.release().catch(() => {});
  wake = null;
}
watchShelfPreference(() => continuity.invalidate());
const terminalAttempts = new Set<string>();
function closeOwnedDeaths() {
  if (!s || !continuity.shelf.enabled) return;
  for (const person of s.people) {
    const cast = ALLOCATION.find((c) => c.id === person.id);
    const key = `${continuity.runId}/${continuity.generation}/${cast?.castId}`;
    if (
      cast &&
      !person.body.alive &&
      continuity.heads.some((h) => h.castId === cast.castId && !h.terminal) &&
      !terminalAttempts.has(key)
    ) {
      terminalAttempts.add(key);
      void continuity.checkpoint(cast.castId).catch((error) => {
        continuity.status = String(error);
        if (!/stale|parent|conflict/i.test(String(error))) terminalAttempts.delete(key);
      });
    }
  }
}
watchPersonaCheckpoint(() => {
  if (s?.chapterPaused || s?.phase === 'end') void continuity.checkpointAll().catch(() => {});
});
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
    if (s) s.phase === 'watch' ? drawAll() : dawn();
  },
  get state() {
    return s;
  },
  KEEPERS,
};
