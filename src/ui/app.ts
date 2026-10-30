import {
  feedbackPersonaControl,
  feedbackSharePlay,
  setTelemetryOff,
  telemetryNotice,
  telemetryOn,
} from '@adam0white/lab-kit';
import { required } from '../required.ts';
import { displayOwner } from '../sim/display.ts';
import { callumAway, daiAway, type KeeperSceneAction, keeperSceneAvailable } from '../sim/keeper-scenes.ts';
import { type RotaAction, rotaAvailable, rotaAway, rotaStatus, rotaTerms } from '../sim/rota.ts';
import { liveWords } from './live-readings.ts';
import { catchWords, durationWords } from './watch-copy.ts';

/**
 * The Glance UI: DOM for the board, the radio log and the sheets; one canvas for the dam. The UI reads state and
 * queues inputs; it never changes the sim directly. Real time drives sim minutes, continuously, slowing while a
 * sheet is open. Game menus and notebook dialogs hold time.
 */

import {
  FEEDBACK_LABELS,
  type FeedbackLabel,
  personaChannel,
  sendFeedbackLabel,
  watchPersonaCheckpoint,
} from '@adam0white/lab-client';
import { Continuity, fileEntry, LOCAL_KEY, watchShelfPreference } from '../continuity.ts';
import {
  ALLOCATION,
  CAST,
  type CastId,
  discoveriesFor,
  rememberedConversation,
  VISIT_UNTIL,
} from '../sim/cast.ts';
import {
  clock,
  cloneState,
  EXTENDED_PLANS,
  exportRun,
  GAME_VERSION,
  type GameState,
  type Gauge,
  type Hint,
  hint,
  type Job,
  keeperAsleep,
  keeperOf,
  type NewInput,
  nightsOf,
  PLANS,
  personOf,
  planOf,
  type Report,
  reportWords,
  restoreState,
  type Said,
  step,
  type WatchRules,
  walkFor,
  watchFrom,
  weatherOutlook,
} from '../sim/dam.ts';
import { FRAMEWORK_VERSION } from '../sim/hf4.ts';
import { KEEPERS, type KeeperId, NAMES } from '../sim/keepers.ts';
import { type OutcomeTask, outcomeAvailable } from '../sim/outcomes.ts';
import {
  type Corner,
  cornerSky,
  PRIVATE_PREMISE,
  type PrivateAction,
  privateAvailable,
} from '../sim/private-scenes.ts';
import {
  type ViewingAction,
  viewingAvailable,
  viewingInnUnavailable,
  viewingStatus,
} from '../sim/viewing.ts';
import { CREST, LIP, TURNS } from '../sim/water.ts';
import { CandidateValidation } from '../validation.ts';
import { concernLines, thresholdWords } from './concern.ts';
import { drawDawn } from './dawn.ts';
import { lab } from './lab.ts';
import { SAMPLE_DAWN } from './opener.ts';
import { eventStamp, playback } from './playback.ts';
import { receivedReadings } from './readings.ts';
import { reportBody } from './report.ts';
import { drawScene, type SceneFx, sceneHit } from './scene.ts';
import { watchStage } from './stage.ts';
import { tallyBody } from './tally.ts';
import { readingTime } from './time.ts';

const SAVE = LOCAL_KEY;
const entryMode = fileEntry(location.search, location.pathname);
const fileMode = entryMode !== 'native';
const continuity = new Continuity(
  lab,
  fileMode ? undefined : personaChannel(),
  () => {
    if (s && !fileMode) writeSave();
  },
  fileMode,
);
continuity.inspectionChanged = () => {
  if (s) drawSheet();
};
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
let stage: ReturnType<typeof watchStage> | undefined;
let sceneBounds: { width: number; height: number } | undefined;
function destroyStage() {
  stage?.destroy();
  stage = undefined;
  sceneBounds = undefined;
}
let raf = 0;
let last = 0;
let carry = 0;
let seenFlashes = 0;
const fx: SceneFx = { flashAt: -1e9 };
let wake: { release(): Promise<void> } | null = null;
const seen = { hold: false };

let openingAttempt = 0;
let tracked = false;
function trackRun() {
  if (tracked) return;
  tracked = true;
  lab.trackRun(
    () => (s ? (fileMode ? continuity.exportSession(s) : exportRun(s, FRAMEWORK_VERSION)) : null),
    {
      runKey: () => s?.seed ?? 'title',
      getLogs: () => s?.said.slice(-40).map((line) => line.text) ?? [],
    },
  );
}
if (!fileMode) trackRun();

// The worker owns every current actor and physical source step. The held page
// remains the last accepted inspection while a candidate operation is pending.
let mutating = 0;
async function mutateNow(state: GameState, request: { input?: NewInput; minutes?: number }) {
  const owner = displayOwner(state);
  if (!owner) throw Error('The watch could not be opened.');
  // Admission preferences can change without replacing this owning Run.
  const runId = continuity.runId;
  const current = () => state === s && displayOwner(state) === owner && continuity.runId === runId;
  mutating++;
  try {
    await owner.mutate(request);
    if (!current()) return;
    drawAll();
    writeSave();
    return true;
  } catch (error) {
    if (!current()) return;
    cancelAnimationFrame(raf);
    const d = dialog(
      'watch-work',
      'Keep this watch',
      `<p>The watch could not advance. The last accepted watch is unchanged. Download the complete current run before closing.</p><details><summary>Debug</summary><pre>${esc(String(error))}</pre></details><button id="capacity-download">Download this run</button>`,
    );
    d.querySelector('#capacity-download')?.addEventListener('click', download);
    return false;
  } finally {
    mutating--;
  }
}
function inputNow(state: GameState, input: NewInput) {
  return mutateNow(state, { input });
}
function stepNow(state: GameState) {
  return mutateNow(state, { minutes: 1 });
}

// ---------- save ----------

function readSave(): Save | null {
  if (fileMode) return null;
  try {
    const raw = localStorage.getItem(SAVE);
    return raw ? (JSON.parse(raw) as Save) : null;
  } catch {
    return null;
  }
}
function saveNow() {
  if (fileMode) throw new Error('File sessions stay in memory.');
  if (!s) throw new Error('No run to save');
  const text = continuity.localSave(s);
  localStorage.setItem(SAVE, text);
  lab.captureSave(exportRun(s, FRAMEWORK_VERSION));
}
function writeSave() {
  if (!s) return;
  if (fileMode) {
    lab.captureSave(continuity.exportSession(s));
    return;
  }
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
  if (fileMode) return;
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
  if (fileMode) {
    const notice = telemetryNotice(undefined, { preservation: 'preserve' });
    if (notice) document.body.append(notice);
    if (lab.preservationStatus !== 'existing-local') {
      lab.dispose();
      app.innerHTML =
        '<p>File play cannot start with this browser’s recording profile. No native save was opened. Use a compatible existing lab profile or return to the Glance page at glance.adamwhite.work.</p>';
      return;
    }
  }
  if (entryMode === 'invalid') {
    app.innerHTML = '<p>This file address is invalid. Use /file/ to choose a saved file.</p>';
    return;
  }
  if (fileMode) {
    fileChooser();
    return;
  }
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
  if (fileMode) {
    fileChooser();
    return;
  }
  openingAttempt++;
  destroyStage();
  continuity.invalidate();
  cancelAnimationFrame(raf);
  screen = 'title';
  sheet = null;
  skipUntil = 0;
  lab.screen('title');
  const save = readSave();
  const incompatible =
    !!save?.run &&
    (save.run.framework !== FRAMEWORK_VERSION ||
      save.run.game !== GAME_VERSION ||
      save.run.state?.version !== GAME_VERSION);
  app.innerHTML = `<div class="page screen title-screen">${topbar('', true)}
    <div class="page-body"><h1>The Glance</h1><p class="subtitle">You work at a night desk above a valley town.</p>
    <button class="sample-morning" id="sample" aria-label="Read a sample morning"><canvas id="sample-chart" aria-label="A good morning: the water fell and the town stayed dry"></canvas><span>A good morning: the gate opened early, the level fell, the river rose later, and the town stayed dry.</span></button>
    <p id="goal">Keep the water below the top of the dam. Keep the town dry, or warn people before it floods. ${durationWords(true)}</p>
    <label for="dam-choice">Dam for a new game</label><select id="dam-choice"><option value="valley">Valley dam</option><option value="upper">Upper dam — harder: longer paths, slower river response</option></select><details><summary>Life during the watch</summary><p>Water keeps flowing between nights. Keepers can consider standing requests. Bilal may cover gauge rounds after his own work and a briefing.</p><p>The keepers may choose joint handover, record correction and covered rest. Dai’s visit and retirement and home-rest proposals take time; proposals await responses. A visit needs chosen cover, attendance and return. Nerys can take her telescope out, Bilal can perform a shadow play and write a post, and Wren can write an appendix to her field report when their duties allow. Each person chooses; attended scenes take time. No sighting, reply or habitat finding is promised.</p></details>
    <div id="prepared-openings" role="status"></div>${debugFooter()}</div>
    <div class="actionbar title-actions">${save ? `${incompatible ? '<p>This watch was saved by an older version. Start a new game.</p>' : '<button class="primary" id="cont">Resume</button><p class="save-time">Saved watch</p>'}<p id="resume-status" role="status"></p><button id="cancel-resume" hidden>Cancel opening</button><button id="new">New game</button><div id="restart-confirm" hidden><p>Start a new game? This replaces your saved watch after the new game is ready.</p><button id="confirm-new">Yes, start again</button><button id="cancel-new">No</button></div>` : '<button class="primary" id="new">Start game</button>'}
    </div></div>`;
  bindTopbar();
  drawDawn(document.getElementById('sample-chart') as HTMLCanvasElement, SAMPLE_DAWN);
  document.getElementById('sample')?.addEventListener('click', () => {
    const d = dialog('sample-page', 'A sample morning', reportBody(SAMPLE_DAWN, false, true));
    drawDawn(d.querySelector('#chart') as HTMLCanvasElement, SAMPLE_DAWN);
  });
  const titleGeneration = continuity.generation;
  void continuity
    .pendingPreparations(() => localStorage.getItem(SAVE))
    .then((records) => {
      if (screen !== 'title' || continuity.generation !== titleGeneration) return;
      const pending = records;
      const host = document.getElementById('prepared-openings');
      if (!host || !pending.length) return;
      host.innerHTML = '<p>A saved game is ready to check. Your saved watch stays available.</p>';
      for (const record of pending) {
        const button = document.createElement('button');
        button.textContent = 'Check prepared opening';
        button.addEventListener('click', async () => {
          const attempt = ++openingAttempt;
          continuity.invalidate();
          cancelAnimationFrame(raf);
          button.disabled = true;
          try {
            const state = await continuity.recoverPrepared(record.id, () => localStorage.getItem(SAVE));
            if (attempt !== openingAttempt) return;
            s = state;
            enter();
          } catch (error) {
            if (attempt !== openingAttempt || !host.isConnected) return;
            const message = document.createElement('p');
            message.textContent = 'Could not open the saved game. Your saved watch is unchanged.';
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = 'Debug';
            const diagnostic = document.createElement('pre');
            diagnostic.textContent = String(error);
            details.append(summary, diagnostic);
            message.append(details);
            host.append(message);
          } finally {
            if (button.isConnected) button.disabled = false;
          }
        });
        host.append(button);
      }
    })
    .catch(() => {});
  document.getElementById('cancel-resume')?.addEventListener('click', () => {
    openingAttempt++;
    continuity.invalidate();
    const status = document.getElementById('resume-status');
    if (status) status.textContent = 'Opening cancelled. Your saved watch is unchanged.';
    document.getElementById('cancel-resume')?.setAttribute('hidden', '');
  });
  document.getElementById('cont')?.addEventListener('click', async () => {
    const attempt = ++openingAttempt;
    document.getElementById('cancel-resume')?.removeAttribute('hidden');
    const status = document.getElementById('resume-status');
    if (status) status.textContent = 'Opening your saved watch…';
    try {
      const loaded = await continuity.loadLocal(JSON.stringify(save));
      if (attempt !== openingAttempt) return;
      s = loaded;
      const generation = continuity.generation;
      await continuity.recording();
      if (generation !== continuity.generation || s !== loaded) return;
      readUntil = performance.now() + 6000;
      enter();
    } catch (error) {
      if (attempt === openingAttempt)
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
  document.getElementById('debug-download')?.addEventListener('click', download);
}

function fileChooser() {
  continuity.beginFileSelection();
  destroyStage();
  cancelAnimationFrame(raf);
  screen = 'title';
  sheet = null;
  app.innerHTML = `<div class="page"><div class="page-body"><h1>Play a saved file</h1>
    <p>Progress stays in memory. Download this run before closing the page. Reload this page to choose a file again.</p>
    <button id="choose-file">${s ? 'Choose another file' : 'Choose a saved file'}</button>
    <input type="file" id="file" accept="application/json" hidden>
    <p id="file-result" role="status"></p><button id="file-cancel" hidden>Cancel checking</button>
    ${s ? '<button id="file-download">Download this run</button><button id="file-resume">Resume current file</button>' : ''}${recordSwitch('record-file')}<p>Recording links new play across games on this device. Your browser’s privacy signal keeps recording off unless you choose to turn it on.</p></div></div>`;
  bindRecord(app, 'record-file');
  const file = required(document.querySelector<HTMLInputElement>('#file'));
  document.getElementById('choose-file')?.addEventListener('click', () => file.click());
  document.getElementById('file-download')?.addEventListener('click', download);
  document.getElementById('file-resume')?.addEventListener('click', () => {
    continuity.beginFileSelection();
    enter();
  });
  document.getElementById('file-cancel')?.addEventListener('click', () => {
    continuity.beginFileSelection();
    const status = document.getElementById('file-result');
    if (status) status.textContent = 'Checking cancelled. The current watch is unchanged.';
    document.getElementById('file-cancel')?.setAttribute('hidden', '');
  });
  file.addEventListener('change', async () => {
    const selection = continuity.beginFileSelection();
    const selected = file.files?.[0];
    if (!selected) return;
    const result = document.getElementById('file-result');
    if (result) result.textContent = 'Checking the complete saved watch…';
    document.getElementById('file-cancel')?.removeAttribute('hidden');
    try {
      if (selected.size > 16 * 1024 * 1024) throw new Error('File exceeds complete import capacity.');
      const loaded = await continuity.importSelected(await selected.arrayBuffer(), selection);
      if (!continuity.isFileSelection(selection)) return;
      s = loaded;
      await continuity.recording();
      if (!continuity.isFileSelection(selection)) return;
      trackRun();
      enter();
    } catch {
      if (continuity.isFileSelection(selection) && result?.isConnected)
        result.textContent =
          'That saved file could not be loaded. Your current game is unchanged. Choose another file, or start a new game from the Glance page at glance.adamwhite.work.';
    }
    if (continuity.isFileSelection(selection)) {
      file.value = '';
      document.getElementById('file-cancel')?.setAttribute('hidden', '');
    }
  });
}

function debugFooter() {
  return `<div class="debug-footer"><a href="${PRIVACY}" target="_blank" rel="noopener">Lab privacy</a><details id="debug"><summary>Debug</summary>${s ? '<button id="debug-download">Download this run</button>' : ''}<a href="/file/">Play a saved file without replacing the local week</a><small>HF ${FRAMEWORK_VERSION}</small></details></div>`;
}

async function beginWeek(localOnly = false, chosen?: WatchRules) {
  if (fileMode) return;
  const attempt = ++openingAttempt;
  const rules: WatchRules = chosen ?? {
    edition: 'extended-2',
    outcomes: 'private-scenes-1',
    dam:
      (document.getElementById('dam-choice') as HTMLSelectElement | null)?.value === 'upper'
        ? 'upper'
        : 'valley',
  };
  continuity.invalidate();
  cancelAnimationFrame(raf);
  const previous = s;
  try {
    const pending = document.getElementById('resume-status');
    if (pending)
      pending.textContent =
        'Checking saved people and preparing the opening… Your current watch stays saved.';
    const prepared = await continuity.fresh(Date.now() >>> 0, localOnly === true, rules);
    if (attempt !== openingAttempt) return;
    s = prepared;
    const generation = continuity.generation;
    clearSave();
    await continuity.recording();
    if (attempt !== openingAttempt || generation !== continuity.generation || s !== prepared) return;
    enter();
    window.scrollTo(0, 0);
  } catch (error) {
    if (attempt !== openingAttempt) return;
    s = previous;
    if (s?.phase === 'watch') {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    startError(error, () => void beginWeek(localOnly, rules));
  }
}

function startError(error: unknown, retry: () => void, action = 'start') {
  console.error('Glance chapter failed', error);
  const permanent =
    action === 'load' &&
    /This (saved watch uses an older or unsupported version|file does not replay the same way)/.test(
      String(error),
    );
  const message = permanent
    ? 'This saved watch could not be replayed. Start a new game. Your saved watch is unchanged.'
    : `We could not ${action === 'load' ? 'resume' : 'start'} the watch. Your saved watch is unchanged. You can try again or send Feedback.`;
  const d = dialog(
    'start-error',
    action === 'load' ? 'Could not resume' : 'Could not start',
    `<p>${message}</p><details><summary>Debug</summary><pre>${esc(String(error))}</pre></details>`,
    `${permanent ? '' : '<button id="retry-start">Try again</button>'}<button id="error-feedback">Feedback</button><button id="dialog-back">Back</button>`,
  );
  d.querySelector('#retry-start')?.addEventListener('click', retry);
  d.querySelector('#error-feedback')?.addEventListener('click', sendWord);
  const recover = document.createElement('button');
  recover.textContent = 'Review saved preparations';
  recover.addEventListener('click', () => {
    closeDialogs();
    title();
  });
  d.querySelector('.dialog-actions')?.append(recover);
}

function showAbout() {
  document.getElementById('about')?.remove();
  const about = document.createElement('div');
  about.setAttribute('popover', 'auto');
  about.id = 'about';
  const extended = screen === 'title' || !!s?.rules;
  let heading = 'The night desk';
  let words = `You work at the river authority's night desk. One old dam stands above a town. A keeper reads the gauges with a flashlight and reports the readings by radio. Every reading on your board is what he saw. Tap a gauge to choose a job. Tap the job to ask him. Hold the job button to insist. ${durationWords(extended)}`;
  if (screen === 'watch') {
    heading = 'Reading the desk';
    words = `The level is the height of water behind the dam. The spillway lip is where water starts to overflow into the spillway. The crest is the top of the dam. The dial marks both heights. More gate turns lower the water behind the dam. The river through town rises about forty minutes later. “Read” is the time he wrote down. “Reported” is when the report reached you. Each job shows his answer and roughly how long it takes. ${s?.outcomes ? 'Time continues slowly while an inspection is open.' : 'Time stops while an inspection is open.'} Let him rest between jobs.`;
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
      'The red line is what the water did. The dots are what you were told, at the time they were really read. ' +
      catchWords(s?.rules?.edition);
  } else if (screen === 'end') {
    heading = 'The tally';
    words =
      'The tally adds the nights the dam held, the nights Mill Lane stayed dry or was warned in time, and the wrong readings you caught. It counts the desk’s results. It does not rate the people.';
  }
  if (screen === 'watch') words += ` ${durationWords(extended)} ${catchWords(s?.rules?.edition)}`;
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
function paceSetting() {
  return `<fieldset class="pace-setting"><legend>The night’s pace</legend>${['Automatic', 'Slow', 'Steady', 'Fast'].map((name) => `<button data-pace="${name}" aria-pressed="${paceChoice === name}">${name}</button>`).join('')}</fieldset>`;
}
function bindPace(d: HTMLElement) {
  d.querySelectorAll<HTMLButtonElement>('[data-pace]').forEach((b) => {
    b.addEventListener('click', () => {
      paceChoice = required(b.dataset.pace);
      selectedRate = ({ Slow: 0.8, Steady: 1.4, Fast: 2.4 } as Record<string, number>)[paceChoice] ?? 1.4;
      d.querySelectorAll('[data-pace]').forEach((x) => {
        x.setAttribute('aria-pressed', String(x === b));
      });
    });
  });
}
/** Saved individual refusals stay visible after native reload; this notice grants no write permission. */
function carryNotice() {
  const blocked = s?.chapter?.blocked ?? [];
  if (!blocked.length) return '';
  const names = blocked.map(
    (b) => ALLOCATION.find((c) => c.castId === b.castId)?.name ?? 'someone from another game',
  );
  const diagnostics =
    new URLSearchParams(location.search).get('lab') === '1'
      ? `<ul>${blocked.map((b) => `<li>${esc(b.reason)}</li>`).join('')}</ul>`
      : '';
  return `<details class="continuity-notice" role="status"><summary>Saved histories could not carry over: ${esc(names.join(', '))}.</summary><p>They start this game new, without their past from other games. Their saved past stays on this device.</p>${diagnostics}</details>`;
}

function gameMenu() {
  if (fileMode) {
    writeSave();
    const d = dialog(
      'file-menu',
      'Game menu',
      `<p>Progress stays in memory. Download this run before closing the page.</p>${paceSetting()}<button id="file-download">Download this run</button><button id="choose-another">Choose another file</button><button id="file-departure">Pause chapter for departure</button>${recordSwitch('record-file-menu')}<p>Recording links new play across games on this device. Your browser’s privacy signal keeps recording off unless you choose to turn it on.</p>`,
      '<button class="primary" id="dialog-back">Resume current file</button>',
    );
    bindRecord(d, 'record-file-menu');
    bindPace(d);
    d.querySelector('#file-download')?.addEventListener('click', download);
    d.querySelector('#choose-another')?.addEventListener('click', () => {
      d.remove();
      fileChooser();
    });
    d.querySelector('#file-departure')?.addEventListener('click', () => {
      if (s) inputNow(s, { kind: s.chapterPaused ? 'resume' : 'pause' });
      writeSave();
    });
    d.querySelector('#dialog-back')?.addEventListener('click', () => {
      if (s?.chapterPaused) inputNow(s, { kind: 'resume' });
      writeSave();
    });
    return;
  }
  writeSave();
  const d = dialog(
    'game-menu',
    `Game menu${s ? ` · ${planOf(s).title} ${clock(s.minute)}` : ''}`,
    `<p>Time stops while this menu is open.</p>${carryNotice()}
    ${paceSetting()}<button class="reading-row" id="to-title">To the title page</button>
    <button class="reading-row" id="send-word">Feedback</button><button class="reading-row" id="fullscreen">Full screen</button><a class="reading-row" href="${GAMES}" target="_top">All games</a>${recordSwitch('record-menu')}<button id="menu-new">New game</button><div id="menu-confirm" hidden><p>Start a new game? This replaces your saved watch after the new game is ready.</p><button id="menu-confirm-new">Yes, start again</button><button id="menu-cancel-new">Cancel</button></div>${debugFooter()}`,
    '<button class="primary" id="dialog-back">Resume</button>',
  );
  d.querySelector('#debug-download')?.addEventListener('click', download);
  d.querySelector('#menu-new')?.addEventListener('click', () => {
    required(d.querySelector<HTMLElement>('#menu-confirm')).hidden = false;
  });
  d.querySelector('#menu-cancel-new')?.addEventListener('click', () => {
    required(d.querySelector<HTMLElement>('#menu-confirm')).hidden = true;
  });
  d.querySelector('#menu-confirm-new')?.addEventListener('click', () => void beginWeek());
  d.querySelector('#dialog-back')?.addEventListener('click', () => {
    if (s?.chapterPaused) {
      inputNow(s, { kind: 'resume' });
      writeSave();
    }
  });
  bindRecord(d, 'record-menu');
  bindPace(d);
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
          `<button class="reading-row" data-morning="${dawn.night}">${EXTENDED_PLANS[dawn.night - 1]?.title} · first light ▸</button>`,
      )
      .join(''),
  );
  d.querySelectorAll<HTMLButtonElement>('[data-morning]').forEach((b) => {
    b.addEventListener('click', () => {
      const morning = s?.dawns.find((x) => x.night === Number(b.dataset.morning));
      if (!morning) return;
      const page = dialog(
        'past-morning',
        `${EXTENDED_PLANS[morning.night - 1]?.title} · first light`,
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
  let feedbackLabel: FeedbackLabel | undefined;
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
    <div class="verdicts" role="group" aria-label="What is happening?">${Object.entries(FEEDBACK_LABELS)
      .map(
        ([label, words]) =>
          `<button data-feedback-label="${label}" aria-pressed="false">${esc(words)}</button>`,
      )
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
  d.querySelectorAll<HTMLButtonElement>('[data-feedback-label]').forEach((button) => {
    button.addEventListener('click', () => {
      if (sent || send.disabled) return;
      const label = button.dataset.feedbackLabel as FeedbackLabel;
      feedbackLabel = feedbackLabel === label ? undefined : label;
      d.querySelectorAll<HTMLButtonElement>('[data-feedback-label]').forEach((other) => {
        other.setAttribute('aria-pressed', String(other.dataset.feedbackLabel === feedbackLabel));
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
      const text = `${verdict ? `[${verdict}] ` : ''}${note}`;
      const message = feedbackLabel
        ? [FEEDBACK_LABELS[feedbackLabel], text].filter(Boolean).join('\n\n')
        : text;
      const sharePlay = feedbackSharePlay(personaChoice);
      const options = { name: who, run: feedbackRun(), sharePlay };
      const receipt =
        feedbackLabel && !text
          ? await sendFeedbackLabel(lab, feedbackLabel, options)
          : await lab.sendFeedback(message, options);
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
  destroyStage();
  if (!s) return;
  lab.screen(`night ${s.night}: watch`);
  sheet = null;
  sheetKey = '';
  requestWake();
  writeSave();
  readUntil = performance.now() + 6000;
  screen = 'watch';
  skipUntil = 0;
  app.innerHTML = `<div class="watch lk-stage">${topbar('<span id="night"></span> · <span class="clock" id="clock"></span>')}
    <div class="state-strip"><div id="concern" class="attention keeper-chips lk-strip" aria-live="polite"></div><div id="clock-rate" role="status"></div></div>
    <div class="desk-reminder">${carryNotice()}<p id="desk-goal">Until ${s.rules ? 'the second Friday' : 'Friday'}'s first light: keep the dam below its crest and the town dry, or warned in time.</p><button id="compare-observations">Compare observations</button></div>
    <div class="desk-main"><div class="desk-picture"><div class="scene-zone"><canvas id="scene" class="scene lk-scene" aria-label="The dam, as reported"></canvas><div id="latest-radio" class="latest-radio hand"></div></div><div class="board" id="board"></div></div>
    <div class="desk-context"><div class="sheet lk-sheet" id="sheet"></div>${s.dawns.length ? '<button id="mornings" class="reading-row">This week’s mornings</button>' : ''}<div class="actionbar" id="skip-bar"><button id="skip" aria-label="Skip to the next event">Skip ⏩</button><span id="skip-caption" class="soft"></span></div></div></div></div>`;
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
  stage = watchStage(required(app.querySelector<HTMLElement>('.watch')), (rect) => {
    sceneBounds = rect;
    if (s) drawScene(canvas, s, fx, performance.now(), rect);
  });
  stage.sheet(null);
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

async function frame(t: number) {
  if (!s) return;
  const elapsed = Math.max(0, t - last);
  const dt = Math.min(0.25, elapsed / 1000);
  const state = s;
  const owner = displayOwner(state);
  const runId = continuity.runId;
  const current = () =>
    s === state && displayOwner(state) === owner && continuity.runId === runId && screen === 'watch';
  const held = () => !!document.querySelector('dialog[open], .hflab-veil, #about:popover-open');
  const paused = held();
  if (paused) {
    skipUntil = 0;
    carry = 0;
  }
  if (paused && readUntil > last) readUntil += elapsed;
  last = t;
  if (s.phase === 'watch' && !paused && !mutating) {
    const { rate } = playback(sheet !== null, t < readUntil, selectedRate, skipUntil > 0, !!s.outcomes);
    if (rate === 0) carry = 0;
    carry += dt * rate;
    const permitted = () =>
      current() &&
      !document.hidden &&
      !held() &&
      !mutating &&
      state.phase === 'watch' &&
      playback(sheet !== null, t < readUntil, selectedRate, skipUntil > 0, !!state.outcomes).rate === rate;
    let stepped = false;
    while (carry >= 1 && state.phase === 'watch') {
      if (!permitted()) {
        carry = 0;
        break;
      }
      carry -= 1;
      const before = eventStamp(s);
      const concernBefore = concernLines(s).join('|');
      const advanced = await stepNow(state);
      if (!current()) {
        carry = 0;
        return;
      }
      if (!advanced || !permitted()) {
        carry = 0;
        break;
      }
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
    if (canvas) drawScene(canvas, s, fx, t, sceneBounds);
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
  if (canvas && s) drawScene(canvas, s, fx, performance.now(), sceneBounds);
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
      !!s.outcomes,
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
  const others = receivedReadings(s, g).filter((x) => x.who !== r.who);
  if (others.length)
    return others
      .map(
        (prev) =>
          `<span class="was soft other-reader">${prev.who === 'nerys' ? 'Nerys' : NAMES[prev.who]}: ${printed(prev, g)}, ${readingTime(prev)}</span>`,
      )
      .join('');
  const prev = s.reports
    .filter((x) => x.gauge === g && x !== r && !s?.held.includes(x) && x.at <= r.at)
    .at(-1);
  if (!prev) return empty;
  const fig = g === 'level' ? prev.value.toFixed(1) : printed(prev, g).replace(' m', '');
  return `<span class="was soft same-reader">was ${fig}, ${readingTime(prev)}</span>`;
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
  // The optional-chapter premise stays in the log as a collapsed note, not above the gauges.
  const newest = lines.findLast((x) => x.text !== PRIVATE_PREMISE);
  if (latest && !newest) setHtml(latest, '');
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
  const noteOpen = el.querySelector<HTMLDetailsElement>('details.chapter-note')?.open ?? false;
  el.innerHTML = lines
    .map((x) => {
      if (x.text === PRIVATE_PREMISE)
        return `<div class="line n"><span class="t">${clock(x.at)}</span><details class="chapter-note"${noteOpen ? ' open' : ''}><summary>Optional chapter: Nerys, Bilal and Wren. Read the arrangements.</summary><span>${esc(x.text)}</span></details></div>`;
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
  stage?.sheet(
    sh
      ? sh.kind === 'gauge'
        ? `gauge-${sh.gauge}-${sh.who}`
        : sh.kind === 'keeper'
          ? `keeper-${sh.who}`
          : 'inn'
      : null,
  );
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
function telescopeReturning(state: GameState): boolean {
  const active = state.privateScenes?.active;
  return active?.action === 'telescope' && active.returningFrom !== undefined;
}
function drawConcern() {
  if (!s) return;
  const el = document.getElementById('concern');
  if (!el) return;
  const lines = concernLines(s).map((line) =>
    rotaAway(s as GameState, 'dai') && line.startsWith('Dai:')
      ? `Dai: ${rotaStatus(s as GameState, 'dai')}`
      : rotaAway(s as GameState, 'callum') && line.startsWith('Callum:')
        ? `Callum: ${rotaStatus(s as GameState, 'callum')}`
        : callumAway(s as GameState) && line.startsWith('Callum:')
          ? 'Callum: He is away. Dam work waits for his actual return.'
          : daiAway(s as GameState) && line.startsWith('Dai:')
            ? 'Dai: He is away. Dam work waits for his return.'
            : line,
  );
  const ids = planOf(s).keepers;
  const body = `${s.rules ? `<button class="keeper-chip" data-watch-arrangements="1">Watch arrangements</button>` : ''}${s.radioOut ? '<span class="radio-chip">The radio has static.</span>' : ''}${ids.map((id) => `<button class="keeper-chip ${lines.find((l) => l.startsWith(`${NAMES[id]}:`))?.includes('not answering') ? 'not-answering' : ''}" data-k="${id}" title="${esc(lines.find((l) => l.startsWith(`${NAMES[id]}:`)) ?? '')}"><b>${NAMES[id]}</b> · ${esc(shortConcern(lines.find((l) => l.startsWith(`${NAMES[id]}:`)) ?? ''))}</button>`).join('')}${planOf(s).inn ? `<button class="keeper-chip" data-inn="1"><b>Nerys</b> · ${esc(viewingInnUnavailable(s) ? (s.viewing?.stage === 'watching' ? 'Watching the sky.' : s.viewing?.stage === 'returning' ? 'Walking back.' : 'Unavailable at the inn.') : telescopeReturning(s) ? 'She is returning from the telescope and cannot witness the river steps yet.' : shortConcern(lines.find((l) => l.startsWith('Nerys:')) ?? 'Nerys: She is available.'))}</button>` : ''}`;
  if (!setHtml(el, body)) return;
  el.querySelectorAll<HTMLElement>('[data-k]').forEach((b) => {
    b.addEventListener('click', () => openSheet({ kind: 'keeper', who: b.dataset.k as KeeperId }));
  });
  el.querySelector('[data-inn]')?.addEventListener('click', () => openSheet({ kind: 'inn' }));
  el.querySelector('[data-watch-arrangements]')?.addEventListener('click', watchArrangements);
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
    const html = `<div class="who"><b>Bridge Inn</b><span class="soft">${esc(s.viewing ? viewingStatus(s) : 'Nerys, by the river stairs')}</span><button class="x" id="x" aria-label="Close inspection">×</button></div>
      <div class="verbs two">
        <button id="ring" ${ringing ? 'disabled' : ''}><span>Call Nerys</span><span class="h">${viewingInnUnavailable(s) ? 'She cannot answer while away or asleep. A call stops attendance; return remains a separate choice.' : ringing ? 'She has gone to look.' : 'Ask how high the river is.'}</span></button>
        <button id="warn" ${warned ? 'disabled' : ''}><span class="fill"></span><span>Warn Mill Lane</span><span class="h">${warned ? `The warning was sent at ${clock(s.warnedAt ?? 0)}.` : 'Hold to send the warden to warn people.'}</span></button>
      </div>${readingNote(s, s.board.bridge)}${castConversations(['nerys', 'bilal', 'wren'])}`;
    if (!patchSheet(el, html, previousKey === structureKey)) return;
    bindConversations(el);
    bindReadingNote(el);
    document.getElementById('x')?.addEventListener('click', () => openSheet(null));
    document.getElementById('ring')?.addEventListener('click', () => {
      if (!s) return;
      inputNow(s, { kind: 'ring' });
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
        inputNow(s, { kind: 'warn' });
        writeSave();
        openSheet(null);
      });
    return;
  }
  const who =
    sheet.kind === 'gauge' && sheet.gauge === 'gate' && sheet.who === 'bilal'
      ? (planOf(s).keepers.find((id) => id !== 'bilal') ?? 'dai')
      : sheet.who;
  const crew = planOf(s).keepers.length > 1;
  const crewRow = crew
    ? `<div class="crew small segmented" role="group" aria-label="Who goes"><span class="segment-label">Who goes</span>${planOf(
        s,
      )
        .keepers.filter((id) => !(sheet?.kind === 'gauge' && sheet.gauge === 'gate' && id === 'bilal'))
        .map(
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
    const firstAsk = s.night === 1 && !s.inputs.some((input) => input.kind === 'ask');
    body = `<details class="fore" ${firstAsk ? 'hidden' : ''}><summary>How ${NAMES[who]} expects to feel after this job</summary><span class="hand">${next.forecast ? `“${esc(next.forecast)}”` : 'He has not said how he expects to feel.'}</span></details>
      <div class="verbs turns">${hs
        .map(
          (h) =>
            `<button data-job="gate" data-t="${h.target}"><span class="fill"></span><span>${h.target === 0 ? 'Shut' : `${h.target} ${h.target === 1 ? 'turn' : 'turns'}`}</span><span class="h ${h.verdict === 'refused' ? 'no' : ''}">${esc(h.short)}${h.minutes ? ` · ~${h.minutes}m` : ''}</span></button>`,
        )
        .join(
          '',
        )}</div><p class="hint">The gate opens from 0 to ${TURNS} turns. More turns lower the water behind the dam. The river through town rises later.${riverFrom(s)} ${seen.hold || firstAsk ? '' : 'Hold a button to insist.'}</p>`;
  } else if (sheet.kind === 'gauge') {
    const job: Job = sheet.gauge === 'weir' ? 'weir' : 'level';
    const h = deskHint(s, who, job);
    const hi = deskHint(s, who, job, undefined, true);
    head = `<b>${job === 'level' ? 'Level' : 'Weir'}</b><span class="soft">${job === 'level' ? 'This gauge shows the water level behind the dam.' : 'The weir is a low barrier upstream. Its gauge shows incoming water.'}</span>`;
    const firstReading = s.night === 1 && !s.inputs.some((input) => input.kind === 'ask');
    body = `${verbButtons([{ h, label: job === 'level' ? `Ask ${NAMES[who]} to read it` : `Send ${NAMES[who]} to the weir`, insist: hi }])}
      ${job === 'level' ? observation(s) : ''}
      ${job === 'level' ? gateAfterLevel(s) : ''}
      <p class="fore" ${firstReading ? 'hidden' : ''}><span class="soft">How ${NAMES[who]} expects to feel after this job:</span> <span class="hand">${h.forecast ? `“${esc(h.forecast)}”` : 'He has not said how he expects to feel.'}</span></p>
      <div class="previous-reading">${wasLine(s.board[sheet.gauge], sheet.gauge)}</div><p id="threshold" class="soft">${sheet.gauge === 'level' ? esc(thresholdWords(s)) : ''}</p><p class="hint">${firstReading ? 'Every reading is what a keeper saw. It may be wrong.' : lastWords(s, sheet.gauge)}</p>`;
  } else {
    head = `<b>${NAMES[who]}</b><span class="soft">${esc(rotaAway(s, who) || (who === 'callum' && callumAway(s)) ? whereWords(who) : (concernLines(s).find((line) => line.startsWith(`${NAMES[who]}:`)) ?? whereWords(who)))}</span>`;
    const jobs: { job: Job; label: string }[] = [
      { job: 'level', label: 'Read the level' },
      { job: 'stove', label: 'Sit by the stove' },
      { job: 'nap', label: 'Take a nap' },
    ];
    if (planOf(s).weir) jobs.splice(1, 0, { job: 'weir', label: 'Go to the weir' });
    if (who !== 'bilal' && s.treeKnown && s.water.blocked)
      jobs.push({ job: 'clear', label: 'Clear the debris screen' });
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
  if (sheet.kind === 'keeper') {
    body += `<details class="current-readings"><summary>Current condition</summary><p class="soft">These are the game’s current readings of this person. Feelings are private; they are not radio reports or a measure of reading accuracy.</p>${liveWords(
      personOf(s, who),
    )
      .map((line) => `<p>${esc(line)}</p>`)
      .join('')}</details>`;
    body += castConversations([who]);
  }
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
  return `<div class="reading-note"><button id="reading-note" data-report="${st.reports.indexOf(report)}" aria-pressed="${report.doubted === true}">${report.doubted ? (st.rules ? 'Remove this doubt mark' : 'Remove the check mark') : st.rules ? 'Doubt this reading' : 'Mark this reading for another check'}</button><p class="hint">${st.rules ? `This records your doubt about this report. At dawn, compare it with the known outcome. The mark does not reveal whether it is wrong.` : report.doubted ? 'You marked this reading for another check. Ask for a new reading when you are ready.' : 'This adds your own note. It does not say whether the reading is right.'}</p>${st.rules ? `<details class="catch-rule"><summary>What counts as caught?</summary><p class="hint">${catchWords(st.rules.edition)}</p></details>` : ''}</div>`;
}
function bindReadingNote(el: HTMLElement) {
  const button = el.querySelector<HTMLButtonElement>('#reading-note');
  button?.addEventListener('click', () => {
    if (!s || !button) return;
    inputNow(s, {
      kind: 'doubt',
      report: Number(button.dataset.report),
      marked: button.getAttribute('aria-pressed') !== 'true',
    });
    writeSave();
    openSheet(null);
  });
}

/** Compare only evidence the player has already received, never the live water state. */
/** A gate report newer than the level reading: the reading cannot show what the gate has done since. */
function gateAfterLevel(st: GameState): string {
  const level = st.board.level;
  const gate = st.board.gate;
  if (!level || !gate || gate.at <= level.at) return '';
  return `<p class="soft gate-after">${NAMES[gate.who as KeeperId] ?? 'The keeper'} reported the gate at ${clock(gate.at)}, after this level reading. The reading cannot show what the gate has done since. Ask for a new reading.</p>`;
}
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
  return `<details class="fore"><summary>People on this shift</summary>${ids.map((id) => `<p><b>${CAST[id].name}, ${CAST[id].age}</b>. ${esc(CAST[id].role)}</p>${s?.discoveries[id] ? `<p class="hand">${esc(rememberedConversation(s as GameState, id) ?? '')}</p>` : `<button data-talk="${id}" ${available.includes(id) ? '' : 'disabled'}>${s?.conversations[id] === undefined ? 'Ask if there is time to talk' : 'Ask to continue the conversation'} · ${CAST[id].name}</button>`}`).join('')}<p class="soft">A private conversation can wait. ${s?.outcomes ? 'The shift continues slowly while this inspection is open.' : 'Close this inspection to let the shift continue.'} Dam requests still go to the keepers.</p>${rotaRecord(ids)}${outcomeRecord(ids)}${keeperFamilyRecord(ids)}${privateRecord(ids)}</details>`;
}
function rotaRecord(ids: CastId[]): string {
  if (!s?.outcomes) return '';
  const st = s,
    r = st.outcomes?.rota;
  const button = (action: RotaAction, label: string) => {
    const reason = rotaAvailable(st, action);
    return `<button data-outcome="${action}" ${reason ? 'disabled' : ''}>${label}</button>${reason ? `<p class="hint">${esc(reason)}</p>` : ''}`;
  };
  return ids
    .filter(
      (id): id is 'dai' | 'callum' =>
        (id === 'dai' || id === 'callum') &&
        !!st.discoveries[id] &&
        !!(id === 'dai' ? st.outcomes?.keeperScenes?.daiProposal : st.outcomes?.keeperScenes?.callumProposal),
    )
    .map((id) => {
      const o = r?.offers.findLast((o) => o.person === id && o.night === st.night);
      const t = r?.trips.findLast((t) => t.person === id);
      const status = rotaStatus(st, id);
      return `<section aria-label="Received keeper rota"><h3>Received keeper rota</h3><p>${esc(rotaTerms(id))}</p>
      ${o ? `<p>Received ${clock(o.offeredAt)}. Earliest departure ${clock(o.notBefore)}; departure deadline ${clock(o.departBy)}, offer expires ${clock(o.expiresAt)}. ${o.readAt !== undefined ? 'Both keepers completed the five-minute reading. No acceptance is inferred.' : o.stoppedAt !== undefined ? `Reading declined or stopped: ${esc(o.reason ?? '')}` : 'Reading together; no agreement or departure yet.'}</p>` : button(id === 'dai' ? 'rota-dai-read' : 'rota-callum-read', 'Read the new rota together · five minutes')}
      ${o?.readAt !== undefined && !t ? button(id === 'dai' ? 'rota-dai-leave' : 'rota-callum-home', id === 'dai' ? 'Invite Dai’s bounded leave with Callum covering · two hours plus travel' : 'Invite Callum’s agreed home block with Dai covering · two hours plus travel') : ''}
      ${t ? `<p>Departed ${clock(t.departedAt)}. Actual attendance ${t.attended} minutes; cover ${t.coveredMinutes} minutes, ending by ${clock(t.coverUntil)}. ${t.intervalFinishedAt !== undefined ? 'The 120-minute interval is complete; physical return is separate.' : 'No completed interval is recorded.'} ${t.reason ? esc(t.reason) : ''} ${t.returnedAt !== undefined ? `Actually returned ${clock(t.returnedAt)}.` : ''}</p>` : ''}
      ${status ? `<p>${esc(status)}</p>${button('rota-return', 'Invite the separate return · ten minutes')}` : ''}
      ${r?.reading !== undefined || (status && t?.interruptedAt === undefined) ? button('rota-stop', 'Stop the rota activity') : ''}
    </section>`;
    })
    .join('');
}
function outcomeRecord(ids: CastId[]): string {
  if (!s?.outcomes || !ids.some((id) => id === 'dai' || id === 'callum')) return '';
  const o = s.outcomes;
  const button = (task: OutcomeTask, label: string) =>
    `<button data-outcome="${task}" ${outcomeAvailable(s as GameState, task) ? '' : 'disabled'}>${label}</button>`;
  return `<section aria-label="Joint shift records"><h3>Joint shift records</h3>
    <p>The joint tasks need both keepers on duty and free in the hut. Each chooses whether to join. Callum’s later test needs only Callum free, with Dai still on duty. Time continues slowly while this inspection is open. Allow about twenty minutes for each joint task. Dam work and the weather continue.</p>
    ${s.discoveries.dai ? `<p><b>Dai’s retained original list:</b> ${esc(o.handover.original)}</p><p><b>Current list:</b> ${esc(o.handover.list)}</p>${o.handover.transferredAt !== undefined ? `<p>Both keepers completed the joint transfer at ${clock(o.handover.transferredAt)}. The sensor instruction remains unverified.</p>${o.handover.completedAt !== undefined ? `<p>Callum completed the separate procedural test at ${clock(o.handover.completedAt)}.</p><p>${esc(o.handover.test?.question ?? '')}</p><p>${esc(o.handover.test?.answer ?? '')}</p>` : o.active?.task === 'handover-test' ? `<p>Callum is testing the transferred list alone. No tested result is recorded yet.</p><p>${esc(o.handover.test?.question ?? '')}</p>` : `<p>${o.handover.test?.stoppedAt !== undefined ? 'Callum’s test was interrupted. The joint transfer remains recorded; it is still untested.' : 'The joint transfer awaits Callum’s separate test.'}</p>${button('handover-test', 'Invite Callum to use the transferred list alone · about ten minutes')}`}` : button('handover', 'Invite both keepers to correct and transfer Dai’s handover list')}` : '<p>Dai has not shared his handover list.</p>'}
    ${s.discoveries.callum ? (o.correction.writtenAt !== undefined ? `<p><b>Retained account:</b> ${esc(o.correction.originalAccount ?? '')}</p><p><b>Callum’s signed correction, written ${clock(o.correction.writtenAt)}:</b> ${esc(o.correction.text ?? '')}</p><p>${o.correction.restedAt !== undefined ? `Callum completed thirty minutes of hut rest at ${clock(o.correction.restedAt)} while Dai remained on duty.` : o.correction.restStoppedAt !== undefined ? 'The rest was interrupted. It is not recorded as completed.' : o.correction.restFrom !== undefined ? 'Callum is resting in the hut. Dai remains on duty; a loss of cover stops the rest.' : 'They did not both choose the proposed rest arrangement. Rest remains unarranged.'} The signed correction is filed in the fictional agency correction register and awaits review. Nothing is sent outside this game. No employer response or approval is recorded.</p>` : button('correction', 'Invite Callum’s written correction and a covered rest arrangement')) : '<p>Callum has not shared the signed-round account.</p>'}
    ${o.active && o.active.task !== 'handover-test' ? '<p>The keepers are working together. No completed joint result is recorded yet.</p>' : ''}</section>`;
}
function keeperFamilyRecord(ids: CastId[]): string {
  if (!s?.outcomes || !ids.some((id) => id === 'dai' || id === 'callum')) return '';
  const f = s.outcomes.keeperScenes;
  const button = (action: KeeperSceneAction, label: string) =>
    `<button data-outcome="${action}" ${keeperSceneAvailable(s as GameState, action) ? '' : 'disabled'}>${label}</button>`;
  const proposal = (p: NonNullable<typeof f>['daiProposal']) =>
    p
      ? `<p>${esc(p.text)}</p><p>Written ${clock(p.at)} after twenty minutes together. This proposal awaits responses. No approval or change of duty is recorded.</p>`
      : '';
  const trip =
    f?.attempts.find((a) => a.action === 'daughter-visit' && a.completedAt !== undefined) ??
    f?.attempts.filter((a) => a.action === 'daughter-visit').at(-1);
  const home = f?.homeRequests?.at(-1);
  const current = f?.active === undefined ? undefined : f.attempts[f.active];
  return `<section aria-label="Keeper family records"><h3>Time away from work</h3>
  <p>These optional fictional scenes take real shift time. Both keepers must be free to draft a plan. Each chooses whether to join. No employer or family agreement follows from a biography or a good shift.</p>
  ${proposal(f?.daiProposal)}${!f?.daiProposal ? button('dai-proposal', 'Draft Dai’s cover and retirement proposal · about twenty minutes') : ''}
  ${proposal(f?.callumProposal)}${!f?.callumProposal ? button('callum-proposal', 'Draft Callum’s rota and home-rest proposal · about twenty minutes') : ''}
  <p>Separate choices below supply authored fictional refusals to the proposals. No real agency or partner is contacted. Both keepers must choose five minutes to read each response. Actual duty, travel, cover, lost work and rest costs remain theirs.</p>
  ${f?.daiProposal ? (f.fictionalResponses?.dai ? `<p>${esc(f.fictionalResponses.dai.text)}</p><p>Read at ${clock(f.fictionalResponses.dai.at)} after five attended minutes. Original proposal retained.</p>` : button('dai-fictional-response', 'Choose the fictional agency refusal and read with Dai · five minutes')) : ''}
  ${f?.callumProposal ? (f.fictionalResponses?.callum ? `<p>${esc(f.fictionalResponses.callum.text)}</p><p>Read at ${clock(f.fictionalResponses.callum.at)} after five attended minutes. Original proposal retained.</p>` : button('callum-fictional-responses', 'Choose the fictional agency and partner refusals and read with Callum · five minutes')) : ''}
  ${f?.callumProposal ? `<h4>Callum’s home-rest window</h4><p>A different care window is available tonight after the completed proposal. The earlier proposal and refusal remain unchanged. Allow ten minutes home, 120 minutes resting there and a separately chosen ten-minute return before dawn. Dai must choose and maintain dam cover throughout, for up to150 minutes including ten minutes to choose the return. He gives up his own rest and work flexibility. Pay and any lost pay are unknown. Duty, sleep, radio loss, pause or lost participation can interrupt it. No clinical benefit or safety guarantee follows.</p>${button('callum-home-rest', 'Invite Callum’s home rest with Dai covering · two hours plus travel')}` : ''}
  ${home ? `<p>Home-rest request ${clock(home.requestedAt)}: ${esc(home.events.at(-1)?.status ?? 'pending')}. ${home.departedAt !== undefined ? `Departed ${clock(home.departedAt)}.` : 'No departure recorded.'} ${home.arrivedAt !== undefined ? `Arrived home ${clock(home.arrivedAt)}.` : ''} Actual home rest: ${home.homeMinutes} minutes. Actual uninterrupted cover: ${home.coveredMinutes} minutes. ${home.restCompletedAt !== undefined ? 'The rest time is finished; the return is separate.' : ''} ${home.interruptedAt !== undefined ? `Interrupted ${clock(home.interruptedAt)}. ${esc(home.reason ?? '')}` : ''} ${home.returnFrom !== undefined && home.returnedAt === undefined ? `Returning since ${clock(home.returnFrom)}; Callum is still away.` : ''} ${home.returnedAt !== undefined ? `Returned ${clock(home.returnedAt)}.` : ''} ${home.completedAt !== undefined ? 'The home-rest interval is complete.' : 'No completed interval is recorded.'}</p>` : ''}
  ${callumAway(s) ? `<p>Callum is away and cannot do dam work. Return still costs ten actual minutes.</p>${button('callum-home-return', 'Invite Callum’s return · ten minutes')}${button('stop-family', 'Interrupt the home-rest arrangement')}` : ''}
  ${f?.voicemail ? `<p>${esc(f.voicemail.text)}</p>` : button('daughter-voicemail', 'Invite Dai to play his retained voicemail · about five minutes')}
  ${f?.voicemail ? button('daughter-invitation', 'Choose the fictional visit invitation for tonight') : ''}
  ${f?.invitation ? `<p>${esc(f.invitation.text)} The offered time ends at ${clock(f.invitation.until)} tonight.</p>` : ''}
  <p>The visit costs ten minutes out, twenty minutes attending and ten minutes back. Callum reserves forty minutes for duty instead of possible rest. Duty, lost cover or radio loss can interrupt it. Dai cannot read gauges or turn the wheel while away.</p>
  ${button('daughter-visit', 'Invite the covered visit · about forty minutes')}
  ${current ? `<p>A chosen scene is in progress. No completed result is recorded yet.</p>${button('stop-family', 'Stop the scene')}` : ''}
  ${trip ? `<p>Dai left work at ${clock(trip.from)}.${trip.arrivedAt !== undefined ? ` He arrived at ${clock(trip.arrivedAt)}.` : ' Arrival is not recorded.'} Visit attendance: ${trip.attended} minutes. ${trip.completedAt !== undefined ? `Dai completed the visit and returned to work at ${clock(trip.returnedAt!)}.` : trip.stoppedAt !== undefined ? 'The visit was interrupted and remains incomplete.' : 'The visit has not finished.'} ${trip.returnedAt !== undefined && trip.completedAt === undefined ? `Dai returned at ${clock(trip.returnedAt)}.` : ''}</p>` : ''}
  ${daiAway(s) ? `<p>Dai is still away. He cannot do dam work from there.</p>${button('daughter-return', 'Invite Dai’s return · about ten minutes')}` : ''}
  </section>`;
}
function viewingRecord(ids: CastId[]): string {
  if (!s?.privateScenes || !ids.includes('nerys') || !s.discoveries.nerys) return '';
  const v = s.viewing;
  const button = (action: 'invite' | 'return', label: string) => {
    const reason = viewingAvailable(s as GameState, action);
    return `<button data-viewing="${action}" ${reason ? 'disabled' : ''}>${label}</button>${reason ? `<p class="hint">${esc(reason)}</p>` : ''}`;
  };
  return `<section aria-label="Watch the sky"><h3>Watch the sky</h3><p>${esc(viewingStatus(s))}</p><p>Local sky at the inn now: ${cornerSky(s.seed, s.night, s.minute)}. Clear skies are not a service Nerys can promise. Inn cover ends at midnight. Five minutes carrying the telescope to the back wall, twenty watching, then a separately chosen five-minute walk back cost her inn work and river reports. A river call stops attendance; it cannot bring her back. Her notebook stays private.</p>${!v ? button('invite', 'Invite Nerys to watch the sky · thirty minutes plus time to choose the return') : v.away && v.stage !== 'returning' ? button('return', 'Invite Nerys to return to the inn · five minutes') : ''}${v?.away && ['walking', 'watching', 'returning'].includes(v.stage) ? '<button data-viewing="stop">Stop attending</button>' : ''}${v ? `<p>${esc(v.result ?? v.reason ?? 'No completed viewing is recorded.')}</p>${v.known.map((o) => `<p>${clock(o.at)}: ${esc(o.text)}</p>`).join('')}${v.returnedAt !== undefined ? `<p>Back at the inn at ${clock(v.returnedAt)}.</p>` : ''}` : ''}</section>`;
}
function privateRecord(ids: CastId[]): string {
  if (!s?.privateScenes || !ids.some((id) => ['nerys', 'bilal', 'wren'].includes(id))) return '';
  const o = s.privateScenes;
  const returning = telescopeReturning(s);
  const attempt = o.active ? o.attempts[o.active.index] : undefined;
  const availabilityReason = (reason: string | null) =>
    returning && reason === 'Finish or stop the attended scene first.'
      ? 'Nerys is returning from the telescope. Wait for her to return.'
      : reason;
  const button = (
    action: 'telescope' | 'lamp' | 'post-shape' | 'read-fictional-reply' | 'appendix' | 'file-appendix',
    label: string,
  ) => {
    const reason = availabilityReason(privateAvailable(s as GameState, action));
    return `<button data-private="${action}" ${reason ? 'disabled' : ''}>${label}</button>${reason ? `<p class="hint">${esc(reason)}</p>` : ''}`;
  };
  const telescope =
    ids.includes('nerys') && s.discoveries.nerys
      ? `<h3>Nerys’s telescope</h3><p>For this chapter, Nerys has inn cover from 22:00 to midnight. The trip takes five minutes to set up, ten to view and five to return. She cannot witness the river steps while away. A river call stops viewing and needs return time. Local sky at the inn now: ${cornerSky(s.seed, s.night, s.minute)}. This fictional local sky does not describe catchment rain.</p>${(
          ['riverbank', 'yard', 'back-wall'] as Corner[]
        )
          .map((corner) => {
            const reason = availabilityReason(privateAvailable(s as GameState, 'telescope', corner));
            return `<button data-private="telescope" data-corner="${corner}" ${reason ? 'disabled' : ''}>Ask for the ${corner} corner · twenty minutes</button>${reason ? `<p class="hint">${esc(reason)}</p>` : ''}`;
          })
          .join(
            '',
          )}<p>${esc(o.telescope.notebook ?? 'No completed attempt is recorded. A cloudy attempt cannot establish a sighting.')}</p>`
      : '';
  const lamp =
    ids.includes('bilal') && s.discoveries.bilal
      ? `<h3>Bilal’s shadow play</h3><p>His existing heron is an old story. Hold and adjust his own lamp and choose a new practice shape during ten attended minutes. Relief work and its travel cannot overlap. Posting the retained drawing takes a separate chosen five minutes. Nothing leaves the game. Posting supplies no reply. A separate public choice supplies an authored fictional stepchild improvement, read only if Bilal chooses five minutes for it. No outside sender or family consent is implied.</p>${button('lamp', 'Ask to hold the lamp · ten minutes')}${o.active?.action === 'lamp' ? '<label>New shape<select id="private-shape"><option value="boat">Boat</option><option value="rabbit">Rabbit</option></select></label><label>Lamp position<select id="private-lamp"><option value="low">Low</option><option value="high">High</option></select></label><button data-private="adjust-lamp">Adjust the lamp and try this new shape</button>' : ''}<p>${esc(o.lamp.drawing ?? 'No completed new drawing retained.')}</p>${o.lamp.postedAt !== undefined ? `<p>Posted in the in-game outgoing post at ${clock(o.lamp.postedAt)}: ${esc(o.lamp.postedDrawing ?? '')}</p>` : button('post-shape', 'Ask to post the retained drawing · five minutes')}${o.lamp.fictionalReply ? `<p>${esc(o.lamp.fictionalReply.text)}</p><p>Read after five attended minutes, at ${clock(o.lamp.fictionalReply.at)}. Original posted drawing: ${esc(o.lamp.fictionalReply.postedDrawing)}</p>` : button('read-fictional-reply', 'Choose the fictional stepchild reply and ask Bilal to read · five minutes')}`
      : '';
  const appendix =
    ids.includes('wren') && s.discoveries.wren
      ? `<h3>Wren’s appendix</h3><p>The omitted observation was ambiguous. The retained source page has no supplied identifier or observation detail here. Drafting takes twenty attended minutes. Filing takes a separate chosen five minutes. Filing does not establish approval or a habitat finding.</p>${button('appendix', 'Ask Wren to prepare the appendix · twenty minutes')}<p>${esc(o.appendix.text ?? 'No signed draft yet.')}</p>${o.appendix.filedAt !== undefined ? `<p>Filed in the in-game survey register at ${clock(o.appendix.filedAt)}. Awaiting review.</p><p>The desk may close tonight’s optional dam-owned riverbank corner pending review. This costs Nerys that corner until next night. Her two other corners, emergency access and Wren’s licensed survey duties remain available. This is a precaution, not a habitat finding.</p>${o.access.some((a) => a.night === s?.night) ? `<p>${o.access.find((a) => a.night === s?.night)?.closed ? 'Riverbank corner closed tonight.' : 'Existing optional access left unchanged tonight.'}</p>` : '<button data-private="close-access">Close optional riverbank access tonight pending review</button><button data-private="keep-access">Leave optional access unchanged tonight</button>'}` : button('file-appendix', 'Ask Wren to file the signed draft · five minutes')}`
      : '';
  return `<section aria-label="Private scenes"><p>${esc(o.premise)}</p>${viewingRecord(ids)}${telescope}${lamp}${appendix}${o.active ? `${o.active.action === 'telescope' && !returning && o.active.reason ? '<p>Nerys remains away at the telescope. River reports are unavailable until she chooses and completes a return.</p><button data-private="telescope-return">Ask for the separate return · five minutes</button>' : ''}${returning ? `<p>Nerys is returning from the telescope. She cannot witness the river steps until she returns. Viewing has stopped. ${attempt?.attended ?? 0} minutes attended. ${attempt?.observations?.length ?? 0} observations retained in the partial record. This attempt is not complete.</p>` : `<p>Attending ${esc(o.active.action)}. ${attempt?.attended ?? 0} minutes attended. No completed result yet.</p>`}${attempt?.stoppedAt === undefined ? '<button data-private="stop">Stop attending</button>' : ''}` : ''}${o.attempts
    .filter((a) => a.stoppedAt !== undefined)
    .map(
      (a) =>
        `<p>${esc(a.person)}: ${esc(a.action)} stopped at ${clock(a.stoppedAt as number)} after ${a.attended} minutes. ${esc(a.reason ?? '')}</p>`,
    )
    .join('')}</section>`;
}
function bindConversations(el: HTMLElement) {
  // Delegate these changing scene controls: a minute can replace a nested record node.
  el.onclick = (event) => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-private], [data-viewing], [data-outcome^="rota-"]')
        : null;
    if (!s || !target || !el.contains(target) || target.disabled) return;
    if (target.dataset.outcome?.startsWith('rota-')) {
      inputNow(s, { kind: 'outcome', task: target.dataset.outcome as OutcomeTask });
      writeSave();
      openSheet(null);
      return;
    }
    if (target.dataset.viewing) {
      inputNow(s, { kind: 'viewing', action: target.dataset.viewing as ViewingAction });
      writeSave();
      return;
    }
    const action = target.dataset.private as PrivateAction;
    inputNow(s, {
      kind: 'private',
      action,
      ...(target.dataset.corner ? { corner: target.dataset.corner as Corner } : {}),
      ...(action === 'adjust-lamp'
        ? {
            shape: (el.querySelector<HTMLSelectElement>('#private-shape')?.value ?? 'boat') as
              | 'boat'
              | 'rabbit',
            lamp: (el.querySelector<HTMLSelectElement>('#private-lamp')?.value ?? 'low') as 'low' | 'high',
          }
        : {}),
    });
    writeSave();
  };
  el.querySelectorAll<HTMLButtonElement>('[data-outcome]').forEach((button) => {
    if (button.dataset.outcome?.startsWith('rota-')) return;
    button.addEventListener('click', () => {
      if (!s) return;
      inputNow(s, { kind: 'outcome', task: button.dataset.outcome as OutcomeTask });
      writeSave();
      openSheet(null);
    });
  });
  el.querySelectorAll<HTMLButtonElement>('[data-talk]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!s) return;
      inputNow(s, { kind: 'talk', person: button.dataset.talk as CastId });
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
  if (rotaAway(st, who))
    return st.radioOut
      ? { ...h, short: 'The radio is out. The call cannot get through.', minutes: 0, forecast: '' }
      : h;
  const activity = personOf(st, who).activity?.affordanceId;
  if (who === 'callum' && callumAway(st))
    return st.radioOut
      ? { ...h, short: 'The radio is out. The call cannot get through.', minutes: 0, forecast: '' }
      : h;
  if (who === 'dai' && daiAway(st))
    return {
      ...h,
      short: 'He is away. Call him back; dam work waits for his return.',
      minutes: 0,
      forecast: '',
    };
  if (st.radioOut) return { ...h, short: 'The radio is out.', minutes: 0, forecast: '' };
  if (activity === 'doze' || activity === 'nap' || (st.rules && keeperAsleep(st, who)))
    return { ...h, short: 'Call and wait for his answer.', minutes: 0, forecast: '' };
  // A new call to the same keeper replaces any job he has not finished or started.
  const k = keeperOf(st, who);
  const unfinished =
    k.pending !== undefined && k.pending !== null
      ? k.pending.job !== job || k.pending.target !== target
      : !!k.job &&
        k.job.job !== 'stove' &&
        k.job.job !== 'nap' &&
        (k.job.job !== job || k.job.target !== target);
  return unfinished ? { ...h, short: `${h.short} This call replaces his unfinished job.` } : h;
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
  const rota = rotaStatus(s, id);
  if (rota) return rota;
  if (id === 'callum' && callumAway(s)) {
    const f = s.outcomes?.keeperScenes;
    const h = f?.homeAway === undefined ? undefined : f.homeRequests?.[f.homeAway];
    if (h?.returnFrom !== undefined) return 'He is returning to the dam. He has not arrived.';
    if (h?.arrivedAt !== undefined && h.interruptedAt === undefined)
      return keeperAsleep(s, id)
        ? 'He is asleep at home, away from the dam. A separate ten-minute return is needed.'
        : 'He is away at home. A separate ten-minute return is needed.';
    return 'He is away from the dam. His exact location is not recorded. A separate ten-minute return is needed.';
  }
  if (id === 'dai' && daiAway(s))
    return 'He is away from the dam for the family scene. Dam work waits for his actual return.';
  const k = keeperOf(s, id);
  const a = personOf(s, id).activity?.affordanceId;
  if (a === 'doze' || a === 'nap' || (s.rules && keeperAsleep(s, id)))
    return a === 'nap' ? 'He is asleep, as you asked.' : 'He is not answering.';
  const j = k.job;
  if (j) {
    const reading = j.job === 'level' || j.job === 'weir';
    const walking =
      s.minute < j.startedAt + (reading ? walkFor(s, j.from, j.job === 'level' ? 'staff' : 'weir') : j.walk);
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

/** Night 1 has no river gauge; say when the authored plan first adds the weir and the Bridge Inn's river reports. */
function riverFrom(st: GameState): string {
  const plans = st.rules ? EXTENDED_PLANS : PLANS;
  const first = plans.findIndex((plan) => plan.inn);
  return first > st.night - 1
    ? ` Tonight the board shows only the dam. The Bridge Inn’s river reports begin on ${plans[first]?.title}.`
    : '';
}

function ask(who: KeeperId, job: Job, target: number | undefined, insist: boolean) {
  if (!s) return;
  const inp =
    target === undefined
      ? { kind: 'ask' as const, keeper: who, job, insist }
      : { kind: 'ask' as const, keeper: who, job, target, insist };
  inputNow(s, inp);
  writeSave();
  openSheet(null);
}

// ---------- dawn ----------

function dawn() {
  destroyStage();
  if (!s) return;
  cancelAnimationFrame(raf);
  const d = s.dawns.at(-1);
  if (!d) return;
  const next = (s.rules ? EXTENDED_PLANS : PLANS)[d.night] ?? null;
  lab.screen(`night ${d.night}: dawn`);
  lab.milestone(`night ${d.night} done`);
  screen = 'dawn';
  app.innerHTML = `<div class="page screen dawn">${topbar(`${planOf(s).title} · first light`)}<div class="page-body">
    ${s.phase === 'end' ? `<p class="week-end" role="status">${d.daytimeLoss ? 'The watch ends here. The dam went over during the following day.' : d.overtopped ? (s.rules ? 'The watch ends here. Water came over the top of the dam.' : 'The week ends here. Water came over the top of the dam.') : s.rules ? 'It is first light after the second Friday night. Your watch is done.' : 'It is first light after Friday night. Your watch is done.'}</p>` : ''}
    ${reportBody(d, planOf(s).keepers.length > 1)}
    </div><div class="actionbar">
      ${fileMode ? '' : '<button id="practice">Try this night again for practice</button>'}
      ${s.phase === 'dawn' && next ? `<button class="primary" id="next">${esc(next.title)} night</button>` : ''}
      ${s.phase === 'end' ? '<button class="primary" id="end">Read the watch’s outcome</button>' : ''}
    </div>
  </div>`;
  bindTopbar();
  const chart = document.getElementById('chart') as HTMLCanvasElement;
  drawDawn(chart, d);
  document.getElementById('next')?.addEventListener('click', async () => {
    if (!s) return;
    const current = s;
    const owner = displayOwner(current);
    const runId = continuity.runId;
    if (!(await inputNow(current, { kind: 'next' }))) return;
    if (s !== current || displayOwner(current) !== owner || continuity.runId !== runId) return;
    if (current.phase === 'watch') watch();
    else dawn();
  });
  document.getElementById('practice')?.addEventListener('click', practiceDialog);
  document.getElementById('end')?.addEventListener('click', ending);
  document.getElementById('export')?.addEventListener('click', download);
  document.getElementById('send')?.addEventListener('click', sendWord);

  window.scrollTo(0, 0);
}

function practiceDialog() {
  if (fileMode) return;
  if (!s || s.phase === 'watch') return;
  const actual = s;
  const d = dialog(
    'practice',
    'Try a different opening request',
    '<p>Your watch stays in the logbook. Practice starts with the same people and weather as that night. You can ask for a different gate setting at the start. The keeper may refuse. Practice does not change your saved watch.</p><label for="practice-turns">Opening gate request</label><select id="practice-turns">' +
      Array.from({ length: 7 }, (_, n) => `<option value="${n}">${n} turns</option>`).join('') +
      '</select><button id="run-practice">Try this request</button><div id="practice-result"></div>',
  );
  const job = new CandidateValidation();
  let attempt = 0;
  const cancel = () => {
    attempt++;
    job.clear();
  };
  d.addEventListener('close', cancel);
  for (const button of d.querySelectorAll('.x,#dialog-back')) button.addEventListener('click', cancel);
  d.addEventListener('click', (event) => {
    if (event.target === d) cancel();
  });
  d.querySelector('#run-practice')?.addEventListener('click', async () => {
    const current = ++attempt;
    const button = d.querySelector<HTMLButtonElement>('#run-practice')!;
    const result = d.querySelector<HTMLElement>('#practice-result')!;
    button.disabled = true;
    result.innerHTML =
      '<p>Trying this request in a separate practice watch…</p><button id="practice-cancel">Cancel</button>';
    result.querySelector('#practice-cancel')?.addEventListener('click', () => {
      cancel();
      result.textContent = 'Practice cancelled. Your saved watch is unchanged.';
      button.disabled = false;
    });
    try {
      const branch = await job.load(exportRun(actual, FRAMEWORK_VERSION));
      const owner = displayOwner(branch);
      if (!owner) throw Error('Practice could not be opened.');
      const outcome = await owner.practice(
        Number(d.querySelector<HTMLSelectElement>('#practice-turns')!.value),
      );
      if (current !== attempt || !result.isConnected) return;
      if (!outcome.dawn) throw Error('No practice morning was reached.');
      result.innerHTML =
        '<p><b>Practice result. Your saved watch has not changed.</b></p>' +
        reportBody(outcome.dawn, outcome.crew);
      drawDawn(result.querySelector('canvas')!, outcome.dawn);
    } catch (error) {
      if (current === attempt && result.isConnected)
        result.innerHTML = `<p>Practice could not be completed. Your saved watch is unchanged.</p><details><summary>Debug</summary><pre>${esc(String(error))}</pre></details>`;
    } finally {
      job.clear();
      if (current === attempt) button.disabled = false;
    }
  });
}
function watchArrangements() {
  if (!s?.rules) return;
  const current = s;
  const owner = displayOwner(current);
  const runId = continuity.runId;
  const d = dialog(
    'watch-arrangements',
    'Watch arrangements',
    `<p>${esc(weatherOutlook(current))}</p><p>${current.rules?.dam === 'upper' ? 'Upper dam has a wider basin and longer paths. Releases take longer to reach town.' : 'Valley dam has the familiar basin and paths.'}</p><p>Choose a keeper, a level and a gate setting, then press Save this request. The choices below are only a starting point. No request exists until you save it.</p><p>The request is saved when you press the button. The keeper acts only after the watch continues and he reads the level again.</p><p>Once saved, a request waits for a new local level reading. After reading the level again, the keeper decides whether to do the gate work you requested. He can do this while the radio is out. Repeating an old reading does not start the gate work.</p><label for="standing-keeper">Keeper</label><select id="standing-keeper">${planOf(
      current,
    )
      .keepers.filter((id) => id !== 'bilal')
      .map((id) => `<option value="${id}">${NAMES[id]}</option>`)
      .join(
        '',
      )}</select><label for="standing-threshold">When the keeper reads at least</label><select id="standing-threshold"><option value="4.5">4.5 m</option><option value="5">5.0 m</option><option value="5.5">5.5 m</option></select><label for="standing-target">Consider setting the gate to</label><select id="standing-target">${Array.from({ length: 7 }, (_, n) => `<option value="${n}">${n} turns</option>`).join('')}</select><button id="set-standing">Save this request</button><button id="clear-standing">Cancel this keeper’s request</button><p>These are requests, not promises. Keep checking the reports.</p>${Object.entries(
      current.arrangements ?? {},
    )
      .map(
        ([id, a]) =>
          `<p>${NAMES[id as KeeperId]} has a request for ${a?.target} turns after a reading of ${a?.threshold.toFixed(1)} m.</p>`,
      )
      .join(
        '',
      )}<p>Bilal may cover gauge rounds during his five-day visit, after his repairs, travel and a briefing. He has no gate authority. His body and other duties can prevent cover.</p>${current.night >= 2 && current.minute < VISIT_UNTIL && !current.keepers.some((k) => k.id === 'bilal' && k.on) ? '<button id="invite-relief">Invite Bilal for tonight’s gauge rounds</button>' : ''}<p id="arrangement-result" role="status"></p>`,
  );
  const enqueue = async (input: NewInput) => {
    if (s !== current || displayOwner(current) !== owner || continuity.runId !== runId || !d.isConnected)
      return;
    if (!(await inputNow(current, input))) return;
    if (s !== current || displayOwner(current) !== owner || continuity.runId !== runId || !d.isConnected)
      return;
    (d.querySelector('#arrangement-result') as HTMLElement).textContent =
      'The request is ready to send. Close this page to let the watch continue and hear the answer.';
  };
  d.querySelector('#set-standing')?.addEventListener('click', () =>
    enqueue({
      kind: 'standing',
      keeper: (d.querySelector('#standing-keeper') as HTMLSelectElement).value as KeeperId,
      threshold: Number((d.querySelector('#standing-threshold') as HTMLSelectElement).value),
      target: Number((d.querySelector('#standing-target') as HTMLSelectElement).value),
    }),
  );
  d.querySelector('#clear-standing')?.addEventListener('click', () =>
    enqueue({
      kind: 'cancel-standing',
      keeper: (d.querySelector('#standing-keeper') as HTMLSelectElement).value as KeeperId,
    }),
  );
  d.querySelector('#invite-relief')?.addEventListener('click', () => enqueue({ kind: 'recruit' }));
}

// ---------- the week ----------

// Run the supported publication once per finished state; no fixture or synthetic ownership.
const endingPublications = new WeakMap<GameState, Promise<{ published: number; refused: number }>>();
function publishEnding(state: GameState) {
  if (fileMode) return;
  const generation = continuity.generation,
    runId = continuity.runId;
  const current = () =>
    s === state && screen === 'end' && generation === continuity.generation && runId === continuity.runId;
  let pending = endingPublications.get(state);
  if (!pending) {
    pending = continuity.checkpointAll();
    endingPublications.set(state, pending);
  }
  void pending
    .then(({ published, refused }) => {
      if (!current()) return;
      const result = document.getElementById('continuity-result');
      if (result)
        result.textContent = `${published} histories saved to the browser shelf. ${refused ? `${refused} could not be saved. Their duties, condition or the shelf may prevent travel. Download this run to keep every source.` : 'The shelf can show which receiving games accept each history.'}`;
    })
    .catch(() => {
      if (!current()) return;
      const result = document.getElementById('continuity-result');
      if (result)
        result.textContent =
          'The browser shelf could not be reached. Download this run; no successful transfer is claimed.';
    });
}
function ending() {
  destroyStage();
  if (!s) return;
  cancelAnimationFrame(raf);
  lab.screen('ending');
  lab.milestone('ending reached');
  const ds = s.dawns;
  const held = ds.every((d) => !d.overtopped && !d.daytimeLoss);
  const flooded = ds.filter((d) => d.overtopped || d.mill === 'flooded').length;
  const misses = ds.reduce((a, d) => a + d.misses.length, 0);
  const caught = ds.reduce((a, d) => a + d.misses.filter((m) => m.caught).length, 0);
  const verdict = ds.some((d) => d.daytimeLoss)
    ? 'The day keeper reported water over the top of the dam after your last night. There will be no next watch.'
    : !held
      ? 'Water came over the top of the dam on your watch. There will be an inquiry, and they will read the log.'
      : ds.length === nightsOf(s) && flooded === 0
        ? 'You completed every watch, and the lane never flooded without warning. You checked the keepers’ readings carefully.'
        : `The dam held ${s.rules ? 'through all twelve nights' : 'all week'}. Mill Lane flooded ${flooded === 1 ? 'once' : `${flooded} times`} without warning.`;
  screen = 'end';
  app.innerHTML = `<div class="page screen dawn ending">${topbar(s.rules ? 'The longer watch is over' : 'The week is over')}<div class="page-body">
    <h2>${s.rules ? 'The longer watch is over' : 'The week is over'}</h2>
    <p>${esc(verdict)}</p>
    <ul class="week">${ds
      .map(
        (d) =>
          `<li><b>${EXTENDED_PLANS[d.night - 1]?.title}</b> ${d.daytimeLoss ? 'The dam held through this night, then went over during the following day.' : d.overtopped ? 'Water came over the dam.' : d.spilled ? 'Water flowed into the spillway.' : 'The dam held.'} Mill Lane ${d.overtopped || d.mill === 'flooded' ? 'flooded without warning' : d.mill === 'saved' ? 'flooded after a warning' : 'stayed dry'}. You caught ${d.misses.filter((m) => m.caught).length} of ${d.misses.length} wrong readings.</li>`,
      )
      .join('')}</ul>
    <p class="soft">${misses ? `You caught ${caught} of ${misses} wrong readings during ${s.rules ? 'the longer watch' : 'the week'}.` : ''}</p>
    ${(ds.at(-1)?.lines ?? []).map((l) => `<div class="keeperline"><b>${NAMES[l.id]}</b><p class="hand">${esc(l.aboutYou)}</p></div>`).join('')}
    ${fileMode ? '' : '<p id="continuity-result" role="status">Checking the browser shelf. No transfer is confirmed yet.</p>'}<div id="closing-tally"></div><button class="reading-row" id="back">${EXTENDED_PLANS[(ds.at(-1)?.night ?? 1) - 1]?.title}'s morning again ▸</button></div>
    <div class="actionbar ending-actions"><div><button id="send">Feedback</button><button id="export">Download this run</button><a href="https://human.adamwhite.work/lab/people/" target="_blank" rel="noopener">People across games</a></div><button class="primary" id="again">${fileMode ? 'Choose another file' : 'New game'}</button></div></div>`;
  bindTopbar();
  publishEnding(s);
  updateTally();
  document.getElementById('again')?.addEventListener('click', () => {
    if (fileMode) {
      fileChooser();
      return;
    }
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
  const ex = fileMode ? continuity.exportSession(s) : continuity.export(s);
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
if (!fileMode) watchShelfPreference(() => continuity.invalidate());
const terminalAttempts = new Set<string>();
function closeOwnedDeaths() {
  if (fileMode || !s || !continuity.shelf.enabled) return;
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
        if (!/stale|parent|conflict/i.test(String(error))) terminalAttempts.delete(key);
      });
    }
  }
}
if (!fileMode)
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
  step: async (n: number) => {
    for (let i = 0; i < n && s && s.phase === 'watch'; i++) await stepNow(s);
    if (s) s.phase === 'watch' ? drawAll() : dawn();
  },
  get state() {
    return s;
  },
  KEEPERS,
};
