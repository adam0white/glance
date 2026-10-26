/**
 * The Glance: the dam host. Pure and deterministic: state is plain JSON, world draws come from `rng.ts` keyed by
 * night and minute, and every player input is stamped with the sim minute it applies at. Replaying the same seed
 * and input log rebuilds the same state (`replay`).
 *
 * Covers: the storm and the water (`water.ts`), the keepers' jobs (walk, read, turn the gate, rest, sleep) decided
 * through HF (decide/begin/finish; predict and bodyForecast for the telegraph), readings whose error comes from
 * the keeper's true state and whose words come from his felt state (`reading.ts`), noticing through HF `perceive`,
 * edition-pinned dozing (HF in the extended watch) and skipped walks from true sleepiness, the inn by the bridge, the town warning, lightning,
 * radio drop-outs, the tree on the screen, and the hours between nights lived through HF (home, review, sleep).
 * The extended watch adds conditional requests, an authored second basin, relief gauge cover and a second week.
 * Does not cover: the town as people, automatic engineering authority or certain weather forecasts.
 */
import {
  type Activity,
  type Affordance,
  begin,
  bodyForecast,
  type DecisionRecord,
  decide,
  enableDoze,
  finish,
  forecastThresholds,
  injure,
  interrupt,
  type Outcome,
  type Person,
  perceive,
  predict,
  readDoze,
  readPerson,
  restore,
  reviewed,
  reviewLine,
  type Suggestion,
  type SuggestionResolution,
  seedVoice,
  setDozeContext,
  snapshot,
  tick,
} from '@adam0white/human-framework';
import { canonicalPersona } from '@adam0white/lab-client';
import { required } from '../required.ts';
import { ALLOCATION, type CastId, lifeReady, makeVisitor, talk, VISIT_FROM, VISIT_UNTIL } from './cast.ts';
import { ENGINEER, KEEPERS, type KeeperId, makeKeeper, NAMES, WATCH_FROM, WATCH_MINUTES } from './keepers.ts';
import {
  advanceOutcomes,
  cancelOutcome,
  newOutcomes,
  type OutcomeTask,
  outcomeOccupies,
  requestOutcome,
  type ShiftOutcomes,
} from './outcomes.ts';
import { admitResident, type Chapter, checkChapter, lifeAdmission } from './passport.ts';
import {
  advancePrivate,
  cancelPrivate,
  newPrivateScenes,
  PRIVATE_PREMISE,
  type PrivateInput,
  type PrivateScenes,
  requestPrivate,
  returnForRiver,
} from './private-scenes.ts';
import {
  biasOf,
  type Clarity,
  clarityOf,
  confidenceOf,
  errorSd,
  estimateRead,
  hedge,
  spoken,
  spokenFine,
} from './reading.ts';
import { DRAW, hashNormal, hashUnit } from './rng.ts';
import {
  bridgeOf,
  CREST,
  DAM_MAPS,
  dayWater,
  inflowOf,
  LIP,
  MILL_LANE,
  newWater,
  rainAt,
  SQUARE,
  type Storm,
  stepWater,
  TURNS,
  type Water,
  weirOf,
} from './water.ts';

export const GAME_VERSION = 'glance@4-deterministic-water';
export const NIGHTS = 5;
export interface WatchRules {
  edition: 'extended-1' | 'extended-2';
  dam: 'valley' | 'upper';
  outcomes?: 'handover-1' | 'private-scenes-1';
}
export function checkRules(rules: WatchRules | undefined): void {
  if (
    rules !== undefined &&
    (!['extended-1', 'extended-2'].includes(rules.edition) ||
      !['valley', 'upper'].includes(rules.dam) ||
      (rules.outcomes !== undefined &&
        (!['handover-1', 'private-scenes-1'].includes(rules.outcomes) || rules.edition !== 'extended-2')) ||
      Object.keys(rules).sort().join(',') !==
        (rules.outcomes !== undefined ? 'dam,edition,outcomes' : 'dam,edition'))
  )
    throw new Error('These watch rules are unknown. Start a new game.');
}
export const nightsOf = (s: GameState) => (s.rules ? 12 : NIGHTS);

export type Gauge = 'level' | 'weir' | 'gate' | 'bridge';
export type Place = 'hut' | 'gate' | 'staff' | 'weir';
export type Job = 'level' | 'weir' | 'gate' | 'stove' | 'nap' | 'clear';

export type Input =
  | { at: number; kind: 'ask'; keeper: KeeperId; job: Job; target?: number; insist?: boolean }
  | { at: number; kind: 'talk'; person: CastId }
  | { at: number; kind: 'outcome'; task: OutcomeTask }
  | ({ at: number; kind: 'private' } & PrivateInput)
  | { at: number; kind: 'standing'; keeper: KeeperId; threshold: number; target: number }
  | { at: number; kind: 'cancel-standing'; keeper: KeeperId }
  | { at: number; kind: 'recruit' }
  | { at: number; kind: 'doubt'; report: number; marked: boolean }
  | { at: number; kind: 'pause' | 'resume' }
  | { at: number; kind: 'ring' }
  | { at: number; kind: 'warn' }
  | { at: number; kind: 'next' };

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewInput = DistOmit<Input, 'at'>;

export interface Report {
  at: number;
  /** The time he wrote in the log (a tired man can slip half an hour). */
  wrote: number;
  who: KeeperId | 'nerys';
  gauge: Gauge;
  value: number;
  truth: number;
  conf: number;
  /** True clarity when read, 0..1 (handwriting looseness is 1 - this). */
  clarity: number;
  cause: Clarity['cause'] | 'skipped' | 'gossip';
  skipped: boolean;
  /** Held back by a dead radio, delivered late. */
  late?: boolean;
  /** A player note, never a claim that the reading is wrong. */
  doubted?: boolean;
}

export interface Said {
  at: number;
  who: CastId | 'narrator' | 'radio';
  text: string;
  kind: 'answer' | 'report' | 'journal' | 'radio';
}

export interface JobState {
  job: Job;
  from: Place;
  to: Place;
  walk: number;
  startedAt: number;
  target?: number;
  /** Turning progress toward the next turn, 0..1. */
  progress: number;
  skip: boolean;
}

export interface KeeperState {
  id: KeeperId;
  on: boolean;
  place: Place;
  job: JobState | null;
  pending: { s: Suggestion; job: Job; target?: number } | null;
  deferred: { s: Suggestion; job: Job; target?: number; until: number } | null;
  idleUntil: number;
  /** Unanswered calls while dozing. */
  unanswered: number;
  orderedNap?: boolean;
  watchReview?: NonNullable<Person['review']>['last'];
  watchReviewLine?: string;
  night: { asked: number; insisted: number; refused: number; complied: number; naps: number; turns: number };
  dozes: { from: number; to: number }[];
  trustAtOpen: number;
  strained: boolean;
}

export interface Flash {
  at: number;
  level: number;
}

export interface Miss {
  at: number;
  who: KeeperId;
  gauge: Gauge;
  said: number;
  truth: number;
  cause: Report['cause'];
  caught: boolean;
}

export interface Dawn {
  daytimeLoss?: { at: number };
  extended?: true;
  edition?: 'extended-2';
  doubts?: { at: number; who: Report['who']; gauge: Gauge; value: number; truth: number; wrong: boolean }[];
  night: number;
  series: { m: number; level: number; bridge: number; gate: number; rain: number }[];
  reports: Report[];
  flashes: Flash[];
  mill: 'dry' | 'saved' | 'flooded';
  square: 'dry' | 'saved' | 'flooded';
  warnedAt: number | null;
  falseAlarm: boolean;
  overtopped: boolean;
  spilled: boolean;
  maxLevel: number;
  maxBridge: number;
  misses: Miss[];
  dozes: { who: KeeperId; from: number; to: number }[];
  strain: KeeperId[];
  lines: { id: KeeperId; line: string; aboutYou: string }[];
}

export interface GameState {
  outcomes?: ShiftOutcomes;
  privateScenes?: PrivateScenes;
  rules?: WatchRules;
  arrangements?: Partial<Record<KeeperId, { threshold: number; target: number; after: number }>>;
  relief?: { until: number; night: number };
  version: string;
  seed: number;
  chapter: Chapter | null;
  chapterPaused: boolean;
  pauseRequested: boolean;
  life: Partial<Record<CastId, ReturnType<typeof lifeAdmission>>>;
  night: number;
  phase: 'watch' | 'dawn' | 'end';
  minute: number;
  people: Person[];
  discoveries: Partial<Record<CastId, boolean>>;
  conversations: Partial<Record<CastId, number>>;
  keepers: KeeperState[];
  water: Water;
  board: Record<Gauge, Report | null>;
  reports: Report[];
  held: Report[];
  flashes: Flash[];
  series: Dawn['series'];
  nerys: { goodwill: number; ringing: number | null; calls: number };
  warnedAt: number | null;
  falseAlarms: number;
  firstMillAt: number | null;
  firstSquareAt: number | null;
  treeKnown: boolean;
  treeAt: number | null;
  radioOut: boolean;
  said: Said[];
  dawns: Dawn[];
  inputs: Input[];
  applied: number;
}

// ---------- the nights ----------

export interface NightPlan {
  title: string;
  keepers: KeeperId[];
  storm: Storm;
  intro: string[];
  weir: boolean;
  inn: boolean;
  /** Minutes after 22:00 of a forced first flash. */
  firstFlash?: number;
  /** Radio drop-outs: [from, to] minutes after 22:00. */
  radio?: [number, number][];
  /** Minutes after 22:00 a tree comes down on the screen. */
  tree?: number;
  /** Scripted lines: minutes after 22:00. */
  beats: { at: number; who: Said['who']; text: string | ((s: GameState) => string); if?: KeeperId }[];
}

export const PLANS: NightPlan[] = [
  {
    title: 'Monday',
    keepers: ['dai'],
    storm: { peakAt: 300, peak: 9, width: 70, base: 2.5 },
    intro: [
      'This is my first week on the night desk. There is one dam in my valley, and one keeper works there. Rain is coming.',
      'Every reading on this board is what Dai saw. Tap a gauge to choose a job, then ask him to read it.',
    ],
    weir: false,
    inn: false,
    firstFlash: 34,
    beats: [
      { at: 95, who: 'dai', text: 'The kettle is heating. Call me if you need me.' },
      { at: 140, who: 'dai', text: 'The rain is heavier up here now.' },
      {
        at: 190,
        who: 'dai',
        text: 'You’re the new person, then. Where has Morgan gone? He worked at that desk for twelve years.',
      },
      { at: 250, who: 'radio', text: 'The weather service expects heavy rain over the hills until dawn.' },
    ],
  },
  {
    title: 'Tuesday',
    keepers: ['dai'],
    storm: { peakAt: 240, peak: 11, width: 80, base: 2.5, second: { at: 420, peak: 5, width: 40 } },
    intro: [
      'Someone wrote a note in pencil in the log’s margin years ago: “Dai’s readings are too low after three in the morning. —M.”',
      'Tonight the board also shows readings from the weir, a low barrier across the water upstream. The Bridge Inn has a phone.',
    ],
    weir: true,
    inn: true,
    beats: [
      {
        at: 8,
        who: 'nerys',
        text: 'This is the Bridge Inn. Are you the new person at the authority? Call if you need me to look at the river.',
      },
      {
        at: 120,
        who: 'dai',
        text: 'Morgan used to call at one in the morning for the level, whether I’d reported it or not. It was his habit.',
      },
      { at: 200, who: 'dai', text: 'The ground is full of water. Any more rain runs straight down.' },
      {
        at: 285,
        who: 'nerys',
        text: 'This is the Bridge Inn again. Water is seeping into the cellar. That happens when the river is high. I thought you should know.',
      },
    ],
  },
  {
    title: 'Wednesday',
    keepers: ['dai', 'callum'],
    storm: { peakAt: 330, peak: 10, width: 80, base: 2.5 },
    intro: [
      'The agency has sent a second keeper. Callum is twenty-four, and this is his second week. Dai has not said anything about him.',
      'Two men share one gate wheel. You decide who walks and who sleeps.',
    ],
    weir: true,
    inn: true,
    beats: [
      { at: 3, who: 'callum', text: 'This is Callum, sir. I’m ready for anything.' },
      { at: 6, who: 'dai', text: 'He’ll learn.' },
      {
        at: 90,
        who: 'dai',
        text: 'Callum has mixed up which way to turn the wheel. I won’t say anything.',
      },
      { at: 150, who: 'callum', text: 'I’m sorry, sir. The baby is teething. I’m fine.', if: 'callum' },
      { at: 260, who: 'callum', text: 'Is it always like this, sir? Mr Pugh doesn’t say much.' },
    ],
  },
  {
    title: 'Thursday',
    keepers: ['dai', 'callum'],
    storm: { peakAt: 200, peak: 10, width: 60, base: 3, second: { at: 400, peak: 8, width: 45 } },
    intro: [
      'There are gales and rain tonight. The radio mast on the ridge loses its signal in strong gusts.',
      'When the radio loses its signal, they work from what they last heard from you.',
    ],
    weir: true,
    inn: true,
    radio: [
      [130, 152],
      [262, 280],
      [395, 410],
    ],
    tree: 175,
    beats: [
      { at: 125, who: 'radio', text: 'The wind is getting stronger on the ridge. The radio crackles.' },
      { at: 300, who: 'dai', text: 'The radio is back. Did you hear any of that? Never mind.' },
    ],
  },
  {
    title: 'Friday',
    keepers: ['dai', 'callum'],
    storm: { peakAt: 280, peak: 12, width: 90, base: 3 },
    intro: [
      'This is the wettest night of the week. The ground is wetter than on any earlier night this week. A painted mark high on the dam wall reads “’79”, meaning 1979.',
      'Keep the dam and the town safe until morning.',
    ],
    weir: true,
    inn: true,
    beats: [
      {
        at: 60,
        who: 'dai',
        text: 'The water reached that mark in 1979. I was sixteen. My dad turned this wheel then.',
      },
      { at: 150, who: 'nerys', text: 'The river is loud tonight. I’ve moved the chairs upstairs.' },
      { at: 240, who: 'callum', text: 'Sir, my partner called. She says our lane is full of water.' },
    ],
  },
];

/** Host-authored later watches. The weekend remains on the same calendar; nobody is reset. */
export const EXTENDED_PLANS: NightPlan[] = [
  ...PLANS,
  {
    title: 'Saturday',
    keepers: ['callum'],
    storm: { peakAt: 150, peak: 4, width: 65, base: 1 },
    intro: ['Dai has the weekend off. Callum covers tonight. The wet ground still drains into the dam.'],
    weir: true,
    inn: true,
    beats: [],
  },
  {
    title: 'Sunday',
    keepers: ['dai'],
    storm: { peakAt: 340, peak: 5, width: 90, base: 1.4 },
    intro: ['Callum is at home tonight. Dai takes the handover. Water is still arriving from the hills.'],
    weir: true,
    inn: true,
    beats: [],
  },
  {
    title: 'Second Monday',
    keepers: ['dai', 'callum'],
    storm: { peakAt: 190, peak: 8, width: 60, base: 2 },
    intro: ['A second week begins. The same people return with the sleep and strain they actually had.'],
    weir: true,
    inn: true,
    radio: [[210, 245]],
    beats: [],
  },
  {
    title: 'Second Tuesday',
    keepers: ['callum'],
    storm: { peakAt: 360, peak: 10, width: 80, base: 2 },
    intro: ['Dai has a day away. Callum takes the night watch.'],
    weir: true,
    inn: true,
    tree: 280,
    beats: [],
  },
  {
    title: 'Second Wednesday',
    keepers: ['dai', 'callum'],
    storm: { peakAt: 270, peak: 12, width: 55, base: 1.5 },
    intro: ['The wind has turned. The keepers bring yesterday’s unfinished worries back to the hut.'],
    weir: true,
    inn: true,
    radio: [
      [110, 160],
      [300, 340],
    ],
    beats: [],
  },
  {
    title: 'Second Thursday',
    keepers: ['dai', 'callum'],
    storm: { peakAt: 320, peak: 9, width: 85, base: 2, second: { at: 90, peak: 5, width: 35 } },
    intro: ['Rain arrives in two bands. There is no fresh start in the reservoir.'],
    weir: true,
    inn: true,
    tree: 160,
    beats: [],
  },
  {
    title: 'Second Friday',
    keepers: ['dai', 'callum'],
    storm: { peakAt: 280, peak: 13, width: 75, base: 2.5 },
    intro: ['This is the last watch of the second week. The town is still below you.'],
    weir: true,
    inn: true,
    radio: [[230, 290]],
    beats: [],
  },
];

/** Edition 2 adds desk observations of received reports and the already revealed morning pages.
 * These lines never inspect hidden water, held reports or a person's private state.
 * They change the recorded radio log, so edition 1 keeps its original plans.
 */
const SECOND_WEEK_BEATS: NightPlan['beats'][] = [
  [
    {
      at: 8,
      who: 'narrator',
      text: (s) => {
        const last = s.dawns.at(-1);
        return `Friday’s morning page ${last?.misses.some((m) => m.who === 'callum') ? 'shows a wrong reading from Callum' : last?.reports.some((r) => r.who === 'callum' && (r.gauge === 'level' || r.gauge === 'weir')) ? 'shows no large error in Callum’s readings' : 'has no level or weir reading from Callum to check'}. Tonight he works alone. Another reading will still be his; Nerys can give you a separate view from the bridge.`;
      },
    },
  ],
  [
    {
      at: 8,
      who: 'narrator',
      text: (s) => {
        const last = s.dawns.at(-1);
        return `Saturday’s morning page says Mill Lane ${last?.mill === 'dry' ? 'stayed dry' : last?.mill === 'saved' ? 'flooded after a warning' : 'flooded without warning'}. Dai returns tonight, but the water did not stop while he was away.`;
      },
    },
  ],
  [
    {
      at: 100,
      who: 'narrator',
      text: (s) => {
        const readings = ['dai', 'callum'].map((who) =>
          s.reports.findLast((r) => r.who === who && r.gauge === 'level' && !s.held.includes(r)),
        );
        const [dai, callum] = readings;
        return dai && callum
          ? `Dai’s latest level report says ${spoken(dai.value)}; Callum’s says ${spoken(callum.value)}. They were written at ${clock(dai.wrote)} and ${clock(callum.wrote)}. A difference can come from the reader or from water moving between readings.`
          : 'Both keepers are on duty, but the desk has not received a level reading from each of them tonight. One keeper’s figure does not check the other’s.';
      },
    },
  ],
  [
    {
      at: 300,
      who: 'narrator',
      text: (s) =>
        s.treeKnown
          ? 'Callum has reported a tree on the screen. He is the only keeper tonight. Clearing it takes him away from reading gauges and turning the wheel.'
          : 'The desk has had no report of a tree on the screen tonight. That does not tell you whether anyone has looked. Callum is alone; checking the screen takes him away from the gauges.',
    },
  ],
  [
    {
      at: 112,
      who: 'narrator',
      text: (s) => {
        const r = s.board.level;
        return `The radio has gone silent. ${r ? `The last level report on the desk was written at ${clock(r.wrote)}.` : 'The desk has no level report tonight.'} A standing request can use a new reading up at the dam, but you will not hear the answer until the signal returns.`;
      },
    },
  ],
  [
    {
      at: 180,
      who: 'narrator',
      text: (s) => {
        const r = s.board.gate;
        return `${s.treeKnown ? 'A tree has been reported on the screen.' : 'No report of a tree has reached the desk tonight.'} ${r ? `The last gate report says ${turnWords(r.value)}, written at ${clock(r.wrote)}.` : 'No gate report has reached the desk tonight.'} A gate report tells you where the wheel was set; it does not tell you whether the screen is clear.`;
      },
    },
  ],
  [
    {
      at: 90,
      who: 'narrator',
      text: (s) => {
        const r = s.board.bridge;
        return r
          ? `Nerys’s latest river report was written at ${clock(r.wrote)}. It is a view from the town, not a reading of the reservoir. A gate change takes time to reach her steps.`
          : 'Nerys has not given the desk a river reading tonight. The last morning page cannot tell you what is at her steps now. The final watch still needs a view from the town.';
      },
    },
  ],
];
export const FOLLOWUP_PLANS: NightPlan[] = EXTENDED_PLANS.map((plan, index) => ({
  ...plan,
  intro: index === 7 ? ['A second week begins. The same keepers return after the day at home.'] : plan.intro,
  beats: index >= 5 ? (SECOND_WEEK_BEATS[index - 5] as NightPlan['beats']) : plan.beats,
}));
const plansOf = (s: GameState) =>
  s.rules?.edition === 'extended-2' ? FOLLOWUP_PLANS : s.rules ? EXTENDED_PLANS : PLANS;

const nightStart = (night: number) => (night - 1) * 1440;
export const watchFrom = (night: number) => nightStart(night) + WATCH_FROM;
export const watchTo = (night: number) => watchFrom(night) + WATCH_MINUTES;
export const planOf = (s: GameState): NightPlan => {
  const plan = plansOf(s)[s.night - 1] as NightPlan;
  if (!s.rules || !s.keepers.some((k) => k.id === 'bilal' && k.on)) return plan;
  return { ...plan, keepers: [...plan.keepers, 'bilal'] };
};
export const nightTitle = (night: number) => (EXTENDED_PLANS[night - 1] as NightPlan)?.title ?? '';
/** A qualitative weather-service outlook, not the keyed future rain samples. */
export function weatherOutlook(s: GameState): string {
  return s.night === 6 || s.night === 7
    ? 'The weather service expects scattered showers. A heavier band may still reach the hills. Times and amounts are uncertain.'
    : 'The weather service expects rain over the hills, with heavier spells overnight. The heaviest band may miss this valley. Times and amounts are uncertain.';
}

/** A keeper's scripted line is heard only when he is on, awake and the radio carries; the narrator, radio and inn always speak. */
function beatHeard(s: GameState, beat: NightPlan['beats'][number]): boolean {
  if (beat.if && !keeperOf(s, beat.if).on) return false;
  if (beat.who !== 'dai' && beat.who !== 'callum') return true;
  if (!keeperOf(s, beat.who).on || s.radioOut) return false;
  const a = personOf(s, beat.who).activity?.affordanceId;
  return a !== 'doze' && a !== 'nap' && a !== 'sleep';
}

const WALK: Record<string, number> = {
  'hut-gate': 3,
  'hut-staff': 6,
  'gate-staff': 4,
  'hut-weir': 14,
  'gate-weir': 13,
  'staff-weir': 15,
};
export function walkMinutes(a: Place, b: Place): number {
  if (a === b) return 0;
  return WALK[`${a}-${b}`] ?? WALK[`${b}-${a}`] ?? 10;
}
/** Upper-dam footpath is longer; no person or planner is invented by this map. */
export function walkFor(s: GameState, a: Place, b: Place): number {
  const map = DAM_MAPS[s.rules?.dam ?? 'valley'];
  return walkMinutes(a, b) + (a !== b ? (a === 'weir' || b === 'weir' ? map.weirExtra : map.pathExtra) : 0);
}

/** Invite the existing technician for gauge rounds, never engineering or gate authority.
 * The briefing and walk occupy his actual HF activity; no extra person or skill certificate is created.
 */
function recruitRelief(s: GameState) {
  if (
    !s.rules ||
    s.phase !== 'watch' ||
    s.radioOut ||
    s.night < 2 ||
    s.relief ||
    s.keepers.some((k) => k.id === 'bilal' && k.on) ||
    !lifeReady(s, 'bilal')
  )
    return;
  const p = s.people.find((p) => p.id === 'bilal') as Person;
  if (p.activity) return;
  tick(p, s.minute);
  seedVoice(p, ENGINEER, 0.5);
  const cover = offer('relief-briefing', {
    action: 'work',
    label: 'travel to the hut and take the gauge-round briefing',
    duration: 48,
    effort: 0.4,
    focus: 0.5,
    material: 5,
    advertises: { competence: 0.3, esteem: 0.1 },
    forecastAt: NIGHT_FORECAST,
  });
  const rec = decide(
    p,
    [cover, offer('wait', { label: 'keep the evening free', advertises: { rest: 0.2 } })],
    { suggestion: { voiceId: ENGINEER, affordanceId: cover.id, strength: 0.6 } },
  );
  if (rec.chosenAffordanceId !== cover.id || !begin(p, cover, rec)) {
    say(s, 'bilal', 'I cannot cover a round tonight. My own work and rest come first.', 'answer');
    return;
  }
  s.relief = { until: (p.activity as unknown as Activity).endsAt, night: s.night };
  say(
    s,
    'bilal',
    'I can come after my lamp repairs. Give me about fifty minutes for the walk and briefing. I can report gauges. I will not operate the gate.',
    'answer',
  );
}
function reliefMinute(s: GameState) {
  if (
    !s.relief ||
    s.relief.night !== s.night ||
    s.minute < s.relief.until ||
    s.keepers.some((k) => k.id === 'bilal' && k.on)
  )
    return;
  const p = s.people.find((p) => p.id === 'bilal') as Person;
  if (!p.activity || p.activity.affordanceId !== 'relief-briefing' || p.activity.dozedAt !== undefined)
    return;
  endActivity(p, 'completed', p.activity.endsAt);
  enableDoze(p, { posture: 'upright', stimulation: 1 });
  s.keepers = s.keepers.filter((k) => k.id !== 'bilal');
  s.keepers.push({
    id: 'bilal',
    on: true,
    place: 'hut',
    job: null,
    pending: null,
    deferred: null,
    idleUntil: s.minute,
    unanswered: 0,
    night: blankNight(),
    dozes: [],
    trustAtOpen: trustOf(p),
    strained: false,
  });
  say(
    s,
    'bilal',
    'I have arrived and finished the briefing. I can cover the staff gauge and weir rounds. Dai and Callum keep responsibility for the gate.',
    'answer',
  );
}
const DEST: Record<Job, Place> = {
  level: 'staff',
  weir: 'weir',
  gate: 'gate',
  stove: 'hut',
  nap: 'hut',
  clear: 'gate',
};

// ---------- setup ----------

export function newGame(seed: number, chapter?: Chapter, rules?: WatchRules): GameState {
  checkRules(rules);
  const now = VISIT_FROM;
  const s: GameState = {
    version: GAME_VERSION,
    chapter: chapter ? structuredClone(chapter) : null,
    chapterPaused: false,
    pauseRequested: false,
    life: {},
    seed,
    night: 1,
    phase: 'watch',
    minute: now,
    people: [
      ...KEEPERS.map((id) => makeKeeper(id, seed, now)),
      ...(['nerys', 'bilal', 'wren'] as const).map((id) => makeVisitor(id, seed, now)),
    ],
    discoveries: {},
    conversations: {},
    keepers: KEEPERS.map((id) => ({
      id,
      on: false,
      place: 'hut',
      job: null,
      pending: null,
      deferred: null,
      idleUntil: 0,
      unanswered: 0,
      night: blankNight(),
      dozes: [],
      trustAtOpen: 0,
      strained: false,
    })),
    water: newWater(),
    board: { level: null, weir: null, gate: null, bridge: null },
    reports: [],
    held: [],
    flashes: [],
    series: [],
    nerys: { goodwill: 0.8, ringing: null, calls: 0 },
    warnedAt: null,
    falseAlarms: 0,
    firstMillAt: null,
    firstSquareAt: null,
    treeKnown: false,
    treeAt: null,
    radioOut: false,
    said: [],
    dawns: [],
    inputs: [],
    applied: 0,
  };
  if (rules?.outcomes) s.outcomes = newOutcomes();
  if (rules?.outcomes === 'private-scenes-1') s.privateScenes = newPrivateScenes();
  if (rules) {
    s.rules = structuredClone(rules);
    s.arrangements = {};
    s.water.basin = rules.dam;
  }
  dayHours(s, 1);
  startNight(s, 1);
  if (s.privateScenes) say(s, 'narrator', PRIVATE_PREMISE, 'journal');
  if (rules) for (const k of s.keepers) enableDoze(personOf(s, k.id), { posture: 'upright', stimulation: 1 });
  if (chapter) {
    checkChapter(chapter);
    s.people = s.people.map((p) => {
      const c = required(ALLOCATION.find((c) => c.id === p.id));
      const input = chapter.inputs.find((i) => i.parent.castId === c.castId);
      const expected = input ? admitResident(input, p) : p;
      if (canonicalPersona(chapter.initial[c.castId]) !== canonicalPersona(expected))
        throw new Error('The saved character differs from the character admitted from the source.');
      if (input) {
        const facts = lifeAdmission(input, 'glance');
        s.life[c.id] = facts;
        say(s, 'narrator', `${c.name}: ${facts.line}`, 'journal');
        const keeper = s.keepers.find((k) => k.id === c.id);
        if (keeper) {
          keeper.place = facts.startsAtHome ? 'hut' : facts.life.place === 'public-garden' ? 'staff' : 'gate';
          keeper.idleUntil = s.minute + (facts.availableForExtraWork ? 0 : 30);
        }
      }
      return restore(structuredClone(expected));
    });
  }
  return s;
}

const blankNight = () => ({ asked: 0, insisted: 0, refused: 0, complied: 0, naps: 0, turns: 0 });

export const personOf = (s: GameState, id: KeeperId): Person => s.people.find((p) => p.id === id) as Person;
export const keeperOf = (s: GameState, id: KeeperId): KeeperState =>
  s.keepers.find((k) => k.id === id) as KeeperState;
/** Physical sleep, including HF doze after its stopped activity has been resolved. */
export function keeperAsleep(s: GameState, id: KeeperId): boolean {
  const p = personOf(s, id);
  const activity = p.activity?.affordanceId;
  return activity === 'doze' || activity === 'nap' || readDoze(p)?.asleep === true;
}
export const trustOf = (p: Person) => p.will.voices.find((v) => v.voiceId === ENGINEER)?.trust ?? 0.5;

function offer(id: string, over: Partial<Affordance> = {}): Affordance {
  return { id, action: id, label: id, duration: 20, effort: 0.05, advertises: {}, ...over };
}

/** The day before a watch: afternoon, meals, arriving at 21:50. */
function dayHours(s: GameState, night: number) {
  const d = nightStart(night);
  for (const p of s.people) {
    if (p.activity) endActivity(p, 'interrupted', Math.max(p.now, p.activity.startedAt));
    hostAct(p, offer('meal', { duration: 30, advertises: { food: 0.6, water: 0.6 } }), d + 16 * 60);
    hostAct(p, offer('meal', { duration: 30, advertises: { food: 0.6, water: 0.6 } }), d + 20 * 60);
    hostAct(p, offer('wait', { duration: 20 }), d + 21 * 60 + 30);
  }
}

/** After a watch: home, breakfast, the morning review, day sleep (Callum's broken by the baby). */
function morningHours(s: GameState, night: number) {
  const d = nightStart(night) + 1440;
  for (const p of s.people) {
    if (p.activity) endActivity(p, 'interrupted', Math.max(p.now, p.activity.startedAt));
    hostAct(
      p,
      offer('meal', { duration: 30, advertises: { food: 0.6, water: 0.6 } }),
      Math.max(p.now, d + 6 * 60 + 30),
    );
    tick(p, Math.max(p.now, d + 7 * 60 + 15));
    const hours = p.id === 'callum' ? 4.5 : 6;
    hostAct(
      p,
      offer('sleep', { mode: 'sleep', duration: hours * 60, effort: 0, advertises: { sleep: 1, rest: 0.5 } }),
      Math.max(p.now, d + 8 * 60),
    );
    if (p.id === 'callum')
      hostAct(
        p,
        offer('sleep', { mode: 'sleep', duration: 90, effort: 0, advertises: { sleep: 1, rest: 0.5 } }),
        Math.max(p.now, d + 14 * 60),
      );
  }
}

function startNight(s: GameState, night: number) {
  const plan = plansOf(s)[night - 1] as NightPlan;
  s.night = night;
  s.phase = 'watch';
  s.minute = watchFrom(night);
  if (night > 1 && !s.rules) dayWater(s.water, 14);
  s.board = { level: null, weir: null, gate: null, bridge: null };
  s.reports = [];
  s.held = [];
  s.flashes = [];
  s.series = [];
  s.warnedAt = null;
  s.firstMillAt = null;
  s.firstSquareAt = null;
  s.treeKnown = false;
  s.treeAt = null;
  s.radioOut = false;
  s.nerys.ringing = null;
  s.nerys.calls = 0;
  // A day's sleep softens her, a little.
  s.nerys.goodwill = Math.min(0.8, s.nerys.goodwill + 0.2);
  for (const k of s.keepers) {
    const p = personOf(s, k.id);
    k.on = plan.keepers.includes(k.id);
    k.place = 'hut';
    k.job = null;
    k.pending = null;
    k.deferred = null;
    k.idleUntil = s.minute;
    k.unanswered = 0;
    k.night = blankNight();
    if (s.rules) {
      delete k.orderedNap;
      delete k.watchReview;
      delete k.watchReviewLine;
    }
    k.dozes = [];
    k.trustAtOpen = trustOf(p);
    if (p.activity) endActivity(p, 'interrupted', Math.max(p.now, p.activity.startedAt));
    tick(p, Math.max(p.now, s.minute));
  }
  if (s.rules) {
    s.arrangements = {};
    delete s.relief;
    say(s, 'radio', weatherOutlook(s), 'radio');
    if (s.minute >= VISIT_UNTIL && watchFrom(night - 1) < VISIT_UNTIL)
      say(
        s,
        'narrator',
        'Bilal and Wren’s five-day visits have ended. They are no longer available for work or conversations here.',
        'journal',
      );
    if (night > 1)
      say(
        s,
        'narrator',
        s.rules.edition === 'extended-2'
          ? 'The day keeper covered the dam with the gate on one turn. Water kept flowing through the day. The night keepers have come back from their time at home.'
          : 'The day keeper covered the dam with the gate on one turn. Water kept flowing through the day. The night keepers return after their actual rest.',
        'journal',
      );
  }
  for (const line of plan.intro) say(s, 'narrator', line, 'journal');
  // The handover: the day man's figures, written at ten, read fresh.
  const w = s.water;
  const lead = plan.keepers[0] as KeeperId;
  const gateR = handover(s, lead, 'gate', w.gate);
  const levelR = handover(s, lead, 'level', w.level);
  s.board.gate = gateR;
  say(
    s,
    lead,
    `Good evening. The level is ${spoken(levelR.value)}, and the gate is ${turnWords(w.gate)}. ${night === 1 ? 'It is raining up here.' : 'It is still raining.'}`,
    'report',
  );
  s.board.level = levelR;
  recordSeries(s);
}

/** The opening figures of a watch: his own first read of the level, the gate as he found it. */
function handover(s: GameState, who: KeeperId, gauge: Gauge, truth: number): Report {
  if (gauge === 'gate') {
    const r: Report = {
      at: s.minute,
      wrote: s.minute,
      who,
      gauge,
      value: truth,
      truth,
      conf: 1,
      clarity: 1,
      cause: 'fresh',
      skipped: false,
    };
    s.reports.push(r);
    return r;
  }
  return readGauge(s, who, gauge, false);
}

// ---------- offers ----------

const turnWords = (n: number) =>
  n === 0 ? 'shut' : n === 1 ? 'open by one turn' : `open by ${spoken(n).split(' point ')[0]} turns`;

/**
 * Where a night keeper's forecast starts to bite (HF 2.8.0 `forecastAt`): sleepiness in the small hours sits at
 * 0.6 to 0.85, near HF's day default comfortAt 0.8. Engineering assumption, tuned headlessly over six seeds:
 * at 0.78 the measured policies fare as at the default; at 0.74 and below the keepers turn the wheel down through
 * the trough and every policy but the oracle loses the dam (a cliff, not a slope; docs/hf-requests.md).
 */
export const NIGHT_FORECAST = { comfortAt: 0.78, spentAt: 0.97 };

function rest(_s: GameState) {
  return [{ label: 'the next round', duration: 60, effort: 0.35 }];
}

/** The keeper's offers right now. `target` sets the gate offer (default one turn more open). */
export function offersFor(s: GameState, id: KeeperId, target?: number): Affordance[] {
  const k = keeperOf(s, id);
  const p = personOf(s, id);
  const plan = planOf(s);
  const list: Affordance[] = [];
  const work = (job: Job, over: Partial<Affordance>) =>
    offer(job, {
      tags: ['work'],
      material: 4,
      placeId: 'dam',
      advertises: { competence: 0.12 + 0.2 * (p.skills.gauges?.level ?? 0.4), esteem: 0.1 },
      followedBy: rest(s),
      forecastAt: NIGHT_FORECAST,
      ...over,
    });
  list.push(
    work('level', {
      label: 'read the level',
      duration: walkFor(s, k.place, 'staff') + 3,
      effort: 0.4,
      focus: 0.6,
      skill: { id: 'gauges', difficulty: 0.3 },
    }),
  );
  if (plan.weir)
    list.push(
      work('weir', {
        label: 'walk up to the weir',
        duration: walkFor(s, k.place, 'weir') + 3,
        effort: 0.45,
        focus: 0.6,
        skill: { id: 'gauges', difficulty: 0.3 },
      }),
    );
  // The wheel is offered only when the desk asks for a setting: a standing "open the gate" option made every
  // other ask come back as "rather check the gate" (Priya's playtest, 2026-10-19).
  const gate = s.water.gate;
  const t = Math.max(0, Math.min(TURNS, target ?? Math.min(TURNS, gate + 1)));
  const turns = Math.abs(t - Math.round(gate));
  if (target !== undefined && id !== 'bilal')
    list.push(
      work('gate', {
        label: t > gate ? 'open the gate' : t < gate ? 'close the gate' : 'check the gate',
        duration: walkFor(s, k.place, 'gate') + Math.max(2, Math.ceil(turns / turnRate(s, k, p, false))),
        effort: turns === 0 ? 0.2 : t > gate ? 0.78 : 0.65,
        skill: { id: 'gate', difficulty: 0.5 },
      }),
    );
  if (s.treeKnown && s.water.blocked && id !== 'bilal')
    list.push(
      work('clear', {
        label: 'clear the debris screen',
        duration: walkFor(s, k.place, 'gate') + 22,
        effort: 0.9,
        skill: { id: 'gate', difficulty: 0.6 },
      }),
    );
  list.push(
    offer('stove', {
      label: 'sit by the stove',
      duration: walkFor(s, k.place, 'hut') + 20,
      effort: 0.03,
      advertises: { rest: 0.25, food: 0.05, water: 0.15 },
    }),
  );
  if (k.pending?.job === 'nap' || k.deferred?.job === 'nap')
    list.push(
      offer('nap', {
        action: 'sleep',
        label: 'take a nap',
        mode: 'sleep',
        duration: walkFor(s, k.place, 'hut') + 30,
        effort: 0,
        advertises: { sleep: 0.6, rest: 0.4 },
      }),
    );
  return list;
}

const suggestion = (job: Job, insist = false): Suggestion => ({
  voiceId: ENGINEER,
  affordanceId: job,
  strength: insist ? 0.85 : 0.6,
  insist,
});

// ---------- the telegraph ----------

export interface Hint {
  job: Job;
  target?: number;
  verdict: SuggestionResolution['verdict'];
  says: string;
  short: string;
  /** His own forecast for the work, in his words; '' when nothing follows. */
  forecast: string;
  /** About how long the job takes him, walk included, rounded to five minutes (0 when not offered). */
  minutes: number;
}

/** How he would likely answer, right now. Pure: no state change, no randomness. */
export function hint(s: GameState, id: KeeperId, job: Job, target?: number, insist = false): Hint {
  const p = personOf(s, id);
  const k = keeperOf(s, id);
  const saved = k.pending;
  if (job === 'nap') k.pending = { s: suggestion('nap'), job: 'nap' };
  const offers = offersFor(s, id, target);
  k.pending = saved;
  const r = predict(p, offers, suggestion(job, insist));
  const aff = offers.find((o) => o.id === job);
  const out: Hint = {
    job,
    verdict: r.verdict,
    says: r.says,
    short: shortOf(r),
    forecast: '',
    minutes: aff ? Math.max(5, Math.round(aff.duration / 5) * 5) : 0,
  };
  if (target !== undefined) out.target = target;
  // A sleeping man forecasts nothing.
  const asleep = keeperAsleep(s, id);
  if (aff?.followedBy && !asleep) out.forecast = forecastWords(p, aff);
  return out;
}

/**
 * His forecast in words, from HF's spans (`bodyForecast`): his own simulation of his body as he feels it, judged
 * against the offer's thresholds (`forecastThresholds`, set by `NIGHT_FORECAST`).
 */
export function forecastWords(p: Person, aff: Affordance): string {
  const spans = bodyForecast(p, aff).spans.slice(1);
  if (spans.length === 0) return '';
  const worst = Math.max(...spans.map((x) => x.worst));
  const at = forecastThresholds(aff);
  const dai = p.id === 'dai';
  if (worst < at.comfortAt)
    return dai
      ? 'That is easy. I’ll have plenty of energy for the next round of checks.'
      : 'I can do that, sir.';
  if (worst < (at.comfortAt + at.spentAt) / 2)
    return dai
      ? 'I can do it, but the next round of checks will be slow.'
      : 'I can do it, sir. The next round of checks might be slow.';
  return dai
    ? 'I’ll do it. Don’t ask me to do much afterwards.'
    : 'I’ll do it, sir. I’ll be exhausted afterwards.';
}

function shortOf(r: SuggestionResolution): string {
  switch (r.verdict) {
    case 'assented':
      return 'He agrees.';
    case 'complied':
      return 'He agrees reluctantly.';
    case 'deferred':
      // The stove is where he already is: "after I sit by the stove" read as a loop.
      if (/sit by the stove/.test(r.counterOffer?.label ?? '')) return 'He wants to warm up first.';
      return r.counterOffer?.label
        ? `He says, “I can do it after I ${r.counterOffer.label.replace(/^after I /, '')}.”`
        : 'He wants to wait.';
    case 'modified':
      return r.counterOffer?.label
        ? `He would rather ${r.counterOffer.label.replace(/^after I /, '')}.`
        : 'He wants another job.';
    case 'refused':
      return r.kind === 'cannot' ? 'He cannot do it.' : 'He refuses.';
    default:
      return '';
  }
}

// ---------- inputs ----------

export function queueInput(s: GameState, input: NewInput): void {
  s.inputs.push({ ...input, at: s.minute } as Input);
  if (s.phase !== 'watch' || s.chapterPaused) applyPending(s);
}

function applyPending(s: GameState) {
  while (s.applied < s.inputs.length) {
    const inp = s.inputs[s.applied] as Input;
    if (inp.at > s.minute) break;
    s.applied += 1;
    apply(s, inp);
  }
}

function apply(s: GameState, inp: Input) {
  if (s.chapterPaused && inp.kind !== 'resume') return;
  switch (inp.kind) {
    case 'cancel-standing': {
      if (s.rules && s.arrangements && !s.radioOut) delete s.arrangements[inp.keeper];
      return;
    }
    case 'standing': {
      const k = s.keepers.find((k) => k.id === inp.keeper);
      if (
        !s.rules ||
        s.phase !== 'watch' ||
        s.radioOut ||
        !k?.on ||
        k.id === 'bilal' ||
        !Number.isFinite(inp.threshold) ||
        inp.threshold < 2 ||
        inp.threshold > CREST ||
        !Number.isInteger(inp.target) ||
        inp.target < 0 ||
        inp.target > TURNS
      )
        return;
      s.arrangements ??= {};
      s.arrangements[inp.keeper] = { threshold: inp.threshold, target: inp.target, after: s.minute };
      say(
        s,
        'narrator',
        `You leave a standing request for ${NAMES[k.id]}: after a new local level reading at or above ${inp.threshold.toFixed(1)}, consider setting the gate to ${inp.target} turns. He still decides whether he can do the work.`,
        'journal',
      );
      return;
    }
    case 'recruit': {
      recruitRelief(s);
      return;
    }
    case 'doubt': {
      const report = Number.isInteger(inp.report) ? s.reports[inp.report] : undefined;
      if (report && Object.values(s.board).includes(report) && typeof inp.marked === 'boolean')
        report.doubted = inp.marked;
      return;
    }
    case 'pause': {
      s.pauseRequested = true;
      if (s.privateScenes) cancelPrivate(s, 'The player asked to pause.');
      s.chapterPaused = s.people.every((p) => !p.activity) && !s.privateScenes?.active;
      say(
        s,
        'narrator',
        'You have asked to leave. Everyone must finish their current work. Nerys’s partner will run the inn during this chapter’s pause. She must answer any river call already in progress first. The dam keepers and contractors still have their duties until the week ends.',
        'journal',
      );
      return;
    }
    case 'resume': {
      s.pauseRequested = false;
      s.chapterPaused = false;
      return;
    }
    case 'ask': {
      if (s.phase !== 'watch') return;
      const k = keeperOf(s, inp.keeper);
      if (!k?.on || (k.id === 'bilal' && (inp.job === 'gate' || inp.job === 'clear'))) return;
      if (s.radioOut) {
        say(s, 'radio', `The radio has only static. ${NAMES[k.id]} can’t hear you.`, 'radio');
        return;
      }
      if (s.life[inp.keeper] && !s.life[inp.keeper]?.availableForExtraWork && s.minute < watchFrom(1) + 30) {
        say(
          s,
          inp.keeper,
          'I am finishing my own routine. Give me half an hour before extra work.',
          'answer',
        );
        return;
      }
      const p = personOf(s, inp.keeper);
      if (s.rules && readDoze(p)?.asleep) {
        tick(p, s.minute);
        perceive(p, [
          {
            kind: 'radio-alarm',
            at: p.now,
            channel: 'heard',
            salience: 1,
            near: true,
            targetId: p.id,
            summary: 'The desk calls urgently on the radio.',
          },
        ]);
        const doze = k.dozes.at(-1);
        if (doze) doze.to = s.minute;
        if (p.activity?.dozedAt !== undefined) endActivity(p, 'interrupted', p.activity.dozedAt);
        k.job = null;
      }
      if (p.activity?.affordanceId === 'doze' || p.activity?.affordanceId === 'nap') {
        const dozing = p.activity.affordanceId === 'doze';
        k.unanswered += 1;
        if (k.unanswered < 2 && dozing) {
          say(s, 'radio', `${NAMES[k.id]} does not answer.`, 'radio');
          return;
        }
        k.unanswered = 0;
        say(
          s,
          k.id,
          k.id === 'dai' ? 'Yes. Yes, I’m here.' : 'I’m sorry, sir! I’m sorry. I’m here.',
          'answer',
        );
      }
      if (outcomeOccupies(s, k)) cancelOutcome(s, 'A dam duty call takes priority.');
      k.night.asked += 1;
      if (inp.insist) k.night.insisted += 1;
      const pend: KeeperState['pending'] = { s: suggestion(inp.job, inp.insist), job: inp.job };
      if (inp.target !== undefined) pend.target = inp.target;
      k.pending = pend;
      k.deferred = null;
      if (p.activity) interrupt(p, s.minute, 'voice:engineer');
      return;
    }
    case 'private': {
      requestPrivate(s, inp);
      return;
    }
    case 'outcome': {
      requestOutcome(s, inp.task);
      return;
    }
    case 'talk': {
      talk(s, inp.person);
      return;
    }
    case 'ring': {
      if (s.phase !== 'watch' || !planOf(s).inn || s.nerys.ringing !== null) return;
      if (s.privateScenes?.active?.action === 'telescope') returnForRiver(s);
      ringInn(s);
      if (s.privateScenes?.active?.returningFrom !== undefined && s.nerys.ringing !== null)
        s.nerys.ringing = Math.max(s.nerys.ringing, s.privateScenes.active.until + 1);
      return;
    }
    case 'warn': {
      if (s.phase !== 'watch' || !planOf(s).inn || s.warnedAt !== null) return;
      s.warnedAt = s.minute;
      const late = s.falseAlarms > 0;
      say(
        s,
        'narrator',
        late
          ? 'I called the warden about Mill Lane again. He said they’d heard that warning before, but he would knock on their doors.'
          : 'I called the warden. He is knocking on doors in Mill Lane, telling people to get their things upstairs.',
        'journal',
      );
      return;
    }
    case 'next': {
      if (s.phase !== 'dawn') return;
      if (s.rules) {
        // Background day keeper covers the wheel; same physical water store through all 16 hours.
        s.water.gate = 1;
        s.water.blocked = false;
        for (let at = watchTo(s.night); at < watchFrom(s.night + 1); at++) {
          stepWater(s.water, 0.35);
          if (s.water.overtopped) {
            const dawn = s.dawns.at(-1);
            if (dawn) dawn.daytimeLoss = { at };
            s.minute = at;
            s.phase = 'end';
            say(
              s,
              'narrator',
              `The day keeper reports water over the top of the dam at ${clock(at)}. There will be no next watch.`,
              'journal',
            );
            return;
          }
        }
      }
      dayHours(s, s.night + 1);
      startNight(s, s.night + 1);
      return;
    }
  }
}

function ringInn(s: GameState) {
  if (!lifeReady(s, 'nerys')) {
    say(
      s,
      'nerys',
      'I am finishing my own routine away from the river steps. Call after half past the hour. My partner is looking after the inn.',
      'answer',
    );
    return;
  }
  const m = s.minute - watchFrom(s.night);
  const late = m > 90;
  s.nerys.calls += 1;
  if (s.nerys.goodwill < 0.2 || (late && s.nerys.goodwill < 0.35)) {
    const why =
      s.falseAlarms > 0 && s.nerys.calls <= 2
        ? 'Nobody answers the phone at the Bridge Inn. After the warning that proved unnecessary, she has taken the phone off the hook.'
        : s.nerys.calls <= 2
          ? 'Nobody answers the phone at the Bridge Inn. The lights over the bar are off.'
          : 'Nobody answers the phone at the Bridge Inn.';
    say(s, 'radio', why, 'radio');
    return;
  }
  if (late) s.nerys.goodwill -= 0.08;
  if (s.nerys.calls > 3) s.nerys.goodwill -= 0.06 * (s.nerys.calls - 3);
  s.nerys.ringing = s.minute + (late ? 6 : 3);
  say(
    s,
    'nerys',
    late
      ? ([
          'Mm? What time is it… Wait a moment. I’ll look.',
          'You’re calling again. Wait a moment.',
          'I was just falling asleep. Wait a moment.',
          'All right. I’ll put my coat on.',
        ][Math.min(3, s.nerys.calls - 1)] ?? 'Wait a moment.')
      : s.nerys.calls > 1
        ? 'Are you calling again? All right, I’ll look.'
        : 'Wait a moment. I’ll go and look.',
    'answer',
  );
}

function innAnswers(s: GameState) {
  const b = bridgeOf(s.water);
  const step = Math.max(0, Math.round(b + 0.45 * hashNormal(s.seed, DRAW.nerys, s.night, s.minute)));
  const r: Report = {
    at: s.minute,
    wrote: s.minute,
    who: 'nerys',
    gauge: 'bridge',
    value: step,
    truth: b,
    conf: 0.5,
    clarity: 0.6,
    cause: 'gossip',
    skipped: false,
  };
  s.reports.push(r);
  s.board.bridge = r;
  const words =
    step <= 1
      ? 'The river is at the bottom step. There is nothing to worry about.'
      : step === 2
        ? 'It’s at the second step. The water is a bit brown.'
        : step === 3
          ? 'It’s at the third step. The water is moving.'
          : step === 4
            ? 'It’s at the fourth step. That’s high. Mill Lane floods at the fifth step.'
            : step === 5
              ? 'The river is at the top step! The water is in the lane!'
              : 'The river is above the steps. The water is in the square.';
  say(s, 'nerys', words, 'report');
  s.nerys.ringing = null;
}

// ---------- the minute ----------

/** Advance one sim minute of the watch. */
export function step(s: GameState): void {
  if (s.phase !== 'watch' || s.chapterPaused) return;
  applyPending(s);
  if (s.chapterPaused) return;
  const plan = planOf(s);
  const m = s.minute - watchFrom(s.night);
  // World.
  const rain = rainAt(s.seed, s.night, m, plan.storm);
  if (plan.tree !== undefined && m === plan.tree) {
    s.water.blocked = true;
    s.treeAt = s.minute;
  }
  stepWater(s.water, rain);
  const b = bridgeOf(s.water);
  if (b > MILL_LANE && s.firstMillAt === null) s.firstMillAt = s.minute;
  if (b > SQUARE && s.firstSquareAt === null) s.firstSquareAt = s.minute;
  if (isFlash(s, m, rain)) {
    s.flashes.push({ at: s.minute, level: s.water.level });
    if (s.flashes.length === 1 && s.night === 1)
      say(
        s,
        'narrator',
        'Lightning flashed over the valley. For a moment the camera on the dam showed the wall.',
        'journal',
      );
  }
  const out = (plan.radio ?? []).some(([a, z]) => m >= a && m < z);
  if (out !== s.radioOut) {
    s.radioOut = out;
    say(s, 'radio', out ? 'The radio has only static.' : 'The radio signal returns.', 'radio');
    if (!out) deliverHeld(s);
  }
  for (const beat of plan.beats)
    if (beat.at === m && beatHeard(s, beat))
      say(
        s,
        beat.who,
        typeof beat.text === 'function' ? beat.text(s) : beat.text,
        beat.who === 'radio' ? 'radio' : 'answer',
      );
  if (
    s.nerys.ringing !== null &&
    s.minute >= s.nerys.ringing &&
    s.privateScenes?.active?.action !== 'telescope'
  )
    innAnswers(s);
  // Supporting people have their own HF bodies, not dam operating skills.
  for (const p of s.people) if (!s.keepers.some((k) => k.id === p.id)) tick(p, s.minute);
  if (s.rules) reliefMinute(s);
  // People.
  for (const k of s.keepers) if (k.on) keeperMinute(s, k, rain);
  if (s.outcomes) advanceOutcomes(s);
  if (s.privateScenes) advancePrivate(s);
  if (m % 5 === 0) recordSeries(s, rain);
  s.minute += 1;
  if (s.pauseRequested && s.people.every((p) => !p.activity) && !s.privateScenes?.active)
    s.chapterPaused = true;
  if (s.water.overtopped) {
    say(s, 'narrator', 'Water came over the top of the dam.', 'journal');
    closeNight(s, true);
    return;
  }
  if (s.minute >= watchTo(s.night)) closeNight(s, false);
}

function isFlash(s: GameState, m: number, rain: number): boolean {
  const plan = planOf(s);
  if (plan.firstFlash !== undefined && m === plan.firstFlash) return true;
  if (rain < 7) return false;
  const block = Math.floor(m / 10);
  if (hashUnit(s.seed, DRAW.lightning, s.night, block) >= 0.16) return false;
  return m % 10 === Math.floor(hashUnit(s.seed, DRAW.lightning, s.night, block, 9) * 10);
}

function recordSeries(s: GameState, rain = 0) {
  s.series.push({
    m: s.minute,
    level: round3(s.water.level),
    bridge: round3(bridgeOf(s.water)),
    gate: s.water.gate,
    rain: round3(rain),
  });
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

function weatherAt(s: GameState): number {
  const m = s.minute - watchFrom(s.night);
  const r = rainAt(s.seed, s.night, m, planOf(s).storm);
  return Math.min(1, r / 14 + (planOf(s).radio ? 0.2 : 0));
}

function keeperMinute(s: GameState, k: KeeperState, rain: number) {
  const p = personOf(s, k.id);
  if (s.rules) {
    const sitting = k.place === 'hut' && k.job?.job === 'stove' && s.minute >= k.job.startedAt + k.job.walk;
    setDozeContext(p, { posture: sitting ? 'seated' : 'upright', stimulation: sitting ? 0.1 : 1 });
  }
  tick(p, s.minute);
  if (s.rules) retainWatchReview(s, k, p);
  if (outcomeOccupies(s, k)) return;
  if (s.rules && readDoze(p)?.asleep) {
    if (p.activity?.dozedAt !== undefined) {
      const from = p.activity.dozedAt;
      endActivity(p, 'interrupted', from);
      k.job = null;
      k.dozes.push({ from, to: s.minute });
    }
    const doze = k.dozes.at(-1);
    if (doze) doze.to = s.minute;
    return;
  }
  let a = p.activity;
  if (a && k.job) workMinute(s, k, p, a);
  a = p.activity;
  if (a && s.minute >= a.endsAt) {
    completeJob(s, k, p);
    a = null;
  }
  if (a && (a.affordanceId === 'doze' || a.affordanceId === 'nap') && s.minute >= a.endsAt) a = null;
  // Dozing off by the stove: a host roll from true sleepiness (he does not choose it).
  const walking = k.job !== null && s.minute < k.job.startedAt + k.job.walk;
  if (!s.rules && a && a.affordanceId === 'stove' && !k.pending && !walking) {
    const sl = readPerson(p).body.sleepiness;
    const q = Math.floor(s.minute / 15);
    if (sl > 0.84 && hashUnit(s.seed, DRAW.doze, s.night, q, KEEPERS.indexOf(k.id)) < (sl - 0.84) * 2.2) {
      if (!k.dozes.some((d) => d.to >= s.minute - 30)) {
        endActivity(p, 'interrupted', s.minute);
        const len = 15 + Math.floor(hashUnit(s.seed, DRAW.doze, s.night, q, 7) * 25);
        const doze = offer('doze', {
          action: 'sleep',
          mode: 'sleep',
          duration: len,
          effort: 0,
          advertises: { sleep: 1 },
        });
        const rec = decide(p, [doze], {});
        if (begin(p, doze, rec)) {
          // He sleeps where he sat down: the hut.
          if (k.job) k.place = k.job.to;
          k.job = null;
          k.dozes.push({ from: s.minute, to: s.minute + len });
          return;
        }
      }
    }
  }
  const due = k.pending !== null || (a ? s.minute >= a.reviewAt : s.minute >= k.idleUntil);
  if (!due) return;
  if (a && (a.affordanceId === 'doze' || a.affordanceId === 'nap') && !k.pending) {
    reviewed(p);
    return;
  }
  if (s.pauseRequested && !a && !k.pending) return;
  const offers = idleOffers(s, k).filter((o) => !a || o.id !== a.affordanceId || k.pending);
  const voice = k.pending ?? (!a && k.deferred && s.minute <= k.deferred.until ? k.deferred : null);
  const voiceOffers = voice ? offersFor(s, k.id, voice.target) : offers;
  const rec: DecisionRecord = decide(p, voiceOffers, voice ? { suggestion: voice.s } : {});
  let target: number | undefined;
  if (voice) {
    const wasDeferred = voice === k.deferred;
    k.pending = null;
    k.deferred = null;
    const r = rec.suggestion;
    if (r) {
      if (r.verdict === 'refused') k.night.refused += 1;
      if (r.verdict === 'complied') k.night.complied += 1;
      if (!wasDeferred || r.verdict !== 'deferred') say(s, k.id, flavour(s, k.id, r), 'answer');
      if (r.verdict === 'deferred' && !wasDeferred) {
        const d: KeeperState['deferred'] = { s: voice.s, job: voice.job, until: s.minute + 30 };
        if (voice.target !== undefined) d.target = voice.target;
        k.deferred = d;
      }
      if (rec.chosenAffordanceId === voice.job) target = voice.target;
    }
  }
  if (a && rec.chosenAffordanceId === a.affordanceId && !voice) {
    reviewed(p);
    return;
  }
  const aff = voiceOffers.find((o) => o.id === rec.chosenAffordanceId);
  if (!aff) {
    if (a) reviewed(p);
    else k.idleUntil = s.minute + 4;
    return;
  }
  if (a) endActivity(p, 'interrupted', s.minute);
  startJob(s, k, p, aff, rec, target, rain);
}

/** What he weighs when nobody is asking: the stove, and (Dai's habit) a look at the level now and then. */
function idleOffers(s: GameState, k: KeeperState): Affordance[] {
  const all = offersFor(s, k.id);
  const lastLevel = [...s.reports].reverse().find((r) => r.who === k.id && r.gauge === 'level');
  const stale = !lastLevel || s.minute - lastLevel.at > 50;
  return all.filter((o) => o.id === 'stove' || (o.id === 'level' && stale));
}

/** HF's answer, in his voice where HF's words are generic. The pick is keyed by seed and minute, so replay holds. */
const LINES: Record<KeeperId, Record<'assented' | 'complied' | 'cannot', string[]>> = {
  dai: {
    assented: [
      'Yes, I’ll do that.',
      'I’ll do that.',
      'I’m going now.',
      'Yes, I’ll look.',
      'I’m on my way.',
      'That is reasonable.',
    ],
    complied: [
      'I’ll do it if you say so.',
      'You’re in charge at the desk.',
      'Yes. I’ll do it if that’s what you want.',
      'You decide.',
    ],
    cannot: [
      'I can’t. I’m exhausted. Give me twenty minutes.',
      'I can’t do it yet. I have no energy left. Give me twenty minutes.',
    ],
  },
  bilal: {
    assented: ['I can cover a round of gauge readings.'],
    complied: ['I will check, but I need rest afterwards.'],
    cannot: ['I cannot cover that safely yet.'],
  },
  callum: {
    assented: ['I’ll do it, sir.', 'I’m going, sir.', 'I’ll do it now.', 'Yes! I’ll do it.', 'I’ll go now.'],
    complied: ['Yes, I’ll do it, sir.', 'I’ll do it if you think so, sir.', 'OK. OK, I’m going.'],
    cannot: ['I… I can’t, sir. I’m sorry. I need a minute.', 'I’m exhausted, sir. Give me a little time.'],
  },
};
function flavour(s: GameState, id: KeeperId, r: SuggestionResolution): string {
  const pick = (xs: string[]) =>
    xs[Math.floor(hashUnit(s.seed, DRAW.words, s.night, s.minute, KEEPERS.indexOf(id)) * xs.length)] ??
    xs[0] ??
    '';
  if (r.verdict === 'assented') return pick(LINES[id].assented);
  if (r.verdict === 'complied') return pick(LINES[id].complied);
  if (r.verdict === 'refused' && r.kind === 'cannot') return pick(LINES[id].cannot);
  // "After I sit by the stove" from a man already by the stove reads as a loop: say what he means.
  if (r.verdict === 'deferred' && /sit by the stove/.test(r.counterOffer?.label ?? ''))
    return id === 'dai'
      ? pick([
          'I can’t do it yet. Let me warm my hands first.',
          'Give me a minute by the stove first.',
          'I’ll do it in a little while. The kettle is nearly boiling.',
        ])
      : pick(['Can I just warm up a minute, sir?', 'Give me two minutes, sir. I’m very cold.']);
  return r.says;
}

function startJob(
  s: GameState,
  k: KeeperState,
  p: Person,
  aff: Affordance,
  rec: DecisionRecord,
  target: number | undefined,
  _rain: number,
) {
  const job = aff.id as Job;
  let skip = false;
  if (job === 'level' || job === 'weir') {
    // A long walk in the rain, very sleepy: some nights he reads it from the hut and gives the last figure.
    const prior = s.board[job === 'level' ? 'level' : 'weir'];
    const sl = readPerson(p).body.sleepiness;
    const far = job === 'weir' ? 1 : 0.45;
    const lazy = 1 - p.traits.conscientiousness * 0.6 - p.traits.emotionality * 0.5;
    if (
      prior &&
      s.minute - prior.at < 90 &&
      sl > 0.72 &&
      hashUnit(s.seed, DRAW.skip, s.night, s.minute, KEEPERS.indexOf(k.id)) <
        (sl - 0.68) * 2.5 * far * Math.max(0, lazy)
    )
      skip = true;
  }
  const to = skip ? k.place : DEST[job];
  const walk = walkFor(s, k.place, to);
  const a2 = skip ? { ...aff, duration: 4 } : aff;
  if (!begin(p, a2, rec)) {
    k.idleUntil = s.minute + 4;
    return;
  }
  const js: JobState = { job, from: k.place, to, walk, startedAt: s.minute, progress: 0, skip };
  if (job === 'gate') js.target = target ?? Math.round(s.water.gate);
  k.job = js;
  if (job === 'nap') {
    k.night.naps += 1;
    if (s.rules && rec.suggestion && ['assented', 'complied'].includes(rec.suggestion.verdict))
      k.orderedNap = true;
  }
}

/** Turns per minute at the wheel: skill, true capacity, protest; the first turn of a cold gate is stiff. */
export function turnRate(s: GameState, k: KeeperState, p: Person, protest: boolean): number {
  const skill = p.skills.gate?.level ?? 0.4;
  const cap = readPerson(p).body.capacity;
  const stiff = k.night.turns === 0 && s.night <= 2 ? 0.75 : 1;
  return ((0.6 + 0.4 * skill) * (0.4 + 0.6 * cap) * (protest ? 0.7 : 1) * stiff) / 3.5;
}

/** Turning the wheel: progress by skill, true capacity and protest; the first turn of a cold gate is stiff. */
function workMinute(s: GameState, k: KeeperState, p: Person, a: Activity) {
  const j = k.job as JobState;
  if (j.job !== 'gate' || j.target === undefined) return;
  if (s.minute < j.startedAt + j.walk) return;
  const w = s.water;
  if (w.gate === j.target) return;
  j.progress += turnRate(s, k, p, Boolean(a.protest));
  if (j.progress >= 1) {
    j.progress -= 1;
    w.gate += j.target > w.gate ? 1 : -1;
    k.night.turns += 1;
    if (w.gate === j.target) {
      // Done early: bring the activity's end forward.
      a.endsAt = Math.min(a.endsAt, s.minute + 1);
    }
  }
}

function completeJob(s: GameState, k: KeeperState, p: Person) {
  const j = k.job;
  const a = p.activity as Activity;
  endActivity(p, 'completed', s.minute);
  k.job = null;
  if (!j) return;
  k.place = j.to;
  if (j.job === 'level' || j.job === 'weir') {
    const r = readGauge(s, k.id, j.job, j.skip);
    deliver(s, r, k.id);
    if (!j.skip) notice(s, k, p);
  } else if (j.job === 'gate') {
    const g = s.water.gate;
    const r: Report = {
      at: s.minute,
      wrote: s.minute,
      who: k.id,
      gauge: 'gate',
      value: g,
      truth: g,
      conf: 1,
      clarity: 1,
      cause: 'fresh',
      skipped: false,
    };
    s.reports.push(r);
    const short = j.target !== undefined && g !== j.target;
    const words = short
      ? k.id === 'dai'
        ? `The gate stuck. I got it ${turnWords(g)}.`
        : `I’m sorry, sir. The gate will not go further. It is ${turnWords(g)}.`
      : k.id === 'dai'
        ? `The gate is ${turnWords(g)}.`
        : `I have finished, sir. The gate is ${turnWords(g)}.`;
    if (s.radioOut) s.held.push(r);
    else {
      s.board.gate = r;
      say(s, k.id, words, 'report');
    }
    strain(s, k, p, a);
    notice(s, k, p);
  } else if (j.job === 'clear') {
    s.water.blocked = false;
    say(
      s,
      k.id,
      k.id === 'dai'
        ? 'The debris screen is clear. I scraped the skin off my hands.'
        : 'I got the tree off, sir! The debris screen is clear.',
      'report',
    );
    strain(s, k, p, a);
  }
}

/** Callum will turn the wheel past what his shoulder can take, and not say so. */
function strain(s: GameState, k: KeeperState, p: Person, _a: Activity) {
  if (k.id !== 'callum' || k.strained) return;
  const dep = p.body.depletion ?? 0;
  if (dep < 0.1) return;
  if (hashUnit(s.seed, DRAW.strain, s.night, s.minute) < (dep - 0.08) * 3) {
    injure(p, { part: 'shoulder', severity: 0.35, healRatePerDay: 0.08 });
    k.strained = true;
    s.said.push({ at: s.minute, who: 'callum', text: 'I’m fine, sir.', kind: 'answer' });
  }
}

/** What he notices at the dam, through HF attention: he mentions only what got through. */
function notice(s: GameState, k: KeeperState, p: Person) {
  if (!s.water.blocked || s.treeKnown) return;
  if (k.place !== 'gate' && k.place !== 'staff') return;
  const at = s.minute;
  const wx = weatherAt(s);
  const seen = perceive(p, [
    { at, channel: 'felt', kind: 'rain', salience: 0.3 + 0.4 * wx, summary: 'rain on my face' },
    { at, channel: 'heard', kind: 'wind', salience: 0.25 + 0.4 * wx, summary: 'the wind in the wires' },
    { at, channel: 'heard', kind: 'spill', salience: 0.35, summary: 'the water through the gate' },
    { at, channel: 'saw', kind: 'torch', salience: 0.2, summary: 'my torch flickering' },
    {
      at,
      channel: 'saw',
      kind: 'debris',
      salience: k.place === 'gate' ? 0.5 : 0.3,
      placeId: 'dam',
      summary: 'a tree across the trash screen',
      valence: -0.4,
    },
  ]);
  if (seen.some((x) => x.kind === 'debris')) {
    s.treeKnown = true;
    const text =
      k.id === 'dai'
        ? 'There’s a tree on the debris screen. It is blocking the water.'
        : 'Sir, there’s a whole tree on the debris screen!';
    if (s.radioOut) s.said.push({ at, who: k.id, text, kind: 'report' });
    else say(s, k.id, text, 'report');
  }
}

/** A reading: the truth, plus his error. Words from how he feels. */
function readGauge(s: GameState, who: KeeperId, gauge: Gauge, skipped: boolean): Report {
  const p = personOf(s, who);
  const c = clarityOf(p, weatherAt(s));
  const w = s.water;
  const truth = gauge === 'level' ? w.level : weirOf(inflowOf(w));
  const scale = gauge === 'level' ? 1 : 0.35;
  const z = hashNormal(
    s.seed,
    DRAW.readError,
    s.night,
    s.minute,
    KEEPERS.indexOf(who),
    gauge === 'level' ? 0 : 1,
  );
  const estimate = s.rules && !skipped ? estimateRead(p, who, truth, weatherAt(s), scale) : null;
  let value = estimate ? estimate.value : truth + scale * (biasOf(who, c) + errorSd(c) * z);
  const prior = s.board[gauge];
  if (skipped && prior) value = prior.value;
  value = gauge === 'level' ? Math.round(value * 10) / 10 : Math.round(value * 100) / 100;
  // Dai rounds the way he wants it: down, once he is tired.
  if (who === 'dai' && gauge === 'level' && c.true < 0.5 && !skipped)
    value = Math.floor((value + 0.0001) * 10) / 10;
  value = Math.max(0, value);
  let wrote = s.minute;
  // A tired man writes the wrong time: a tell on the board, never before the shift began.
  if (c.true < 0.38 && hashUnit(s.seed, DRAW.timeSlip, s.night, s.minute) < 0.4)
    wrote = Math.max(watchFrom(s.night), s.minute - 30);
  const conf = estimate ? estimate.confidence : confidenceOf(p, c);
  const r: Report = {
    at: s.minute,
    wrote,
    who,
    gauge,
    value,
    truth: round3(truth),
    conf: round3(conf),
    clarity: round3(c.true),
    cause: skipped ? 'skipped' : c.cause,
    skipped,
  };
  s.reports.push(r);
  const order = s.arrangements?.[who];
  if (s.rules && !skipped && gauge === 'level' && order && r.at > order.after && r.value >= order.threshold) {
    const k = keeperOf(s, who);
    if (!k.pending && !k.deferred && who !== 'bilal') {
      k.pending = { s: suggestion('gate'), job: 'gate', target: order.target };
      delete s.arrangements?.[who];
      if (!s.radioOut)
        say(
          s,
          who,
          'My new reading meets your standing request. I will consider the gate work now.',
          'answer',
        );
    }
  }
  return r;
}

function deliver(s: GameState, r: Report, who: KeeperId) {
  if (s.radioOut) {
    s.held.push(r);
    return;
  }
  s.board[r.gauge] = r;
  say(s, who, reportWords(s, r), 'report');
}

function deliverHeld(s: GameState) {
  for (const r of s.held) {
    r.late = true;
    if (r.at >= (s.board[r.gauge]?.at ?? -1)) s.board[r.gauge] = r;
    const who = r.who as KeeperId;
    const t = clock(r.wrote);
    if (r.gauge === 'gate')
      say(s, who, `The radio is back. The gate has been ${turnWords(r.value)} since ${t}.`, 'report');
    else
      say(
        s,
        who,
        `The radio is back. This ${r.gauge === 'level' ? 'level' : 'weir'} reading was written at ${t}. ${reportWords(s, r)}`,
        'report',
      );
  }
  s.held = [];
  for (const x of s.said)
    if (x.kind === 'report' && x.text.includes('tree') && x.at < s.minute) x.at = s.minute;
}

export function reportWords(_s: GameState, r: Report): string {
  const who = r.who as KeeperId;
  const fig = r.gauge === 'level' ? spoken(r.value) : spokenFine(r.value);
  const k = r.at + KEEPERS.indexOf(who) * 7;
  const lead =
    r.gauge === 'weir' ? (who === 'dai' ? 'This is the weir reading. ' : 'I read the weir board. ') : '';
  const yawn = r.clarity < 0.35 && k % 3 === 0 ? (who === 'dai' ? '(a long yawn) ' : '') : '';
  return `${yawn}${lead}${hedge(who, r.conf, fig, k)}`;
}

export const clock = (m: number) => {
  const h = Math.floor((m % 1440) / 60);
  const mm = Math.floor(m % 60);
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

function endActivity(p: Person, status: Outcome['status'], at: number) {
  const a = p.activity as Activity;
  const out: Outcome = { affordanceId: a.affordanceId, action: a.action, status, at };
  if (a.affordanceId === 'relief-briefing' && status === 'completed')
    out.material = a.affordance.material ?? 0;
  if (a.affordanceId === 'stove') out.needs = { water: 0.15, food: 0.05 };
  finish(p, out);
}

/** The host does `aff` at `at` (no choice offered). */
function hostAct(p: Person, aff: Affordance, at: number) {
  const rec = decide(p, [aff], { now: Math.max(p.now, at) });
  if (rec.chosenAffordanceId !== aff.id) return;
  if (!begin(p, aff, rec)) return;
  const a = p.activity as Activity;
  tick(p, a.endsAt);
  const out: Outcome = { affordanceId: aff.id, action: aff.action, status: 'completed', at: a.endsAt };
  if (aff.id === 'meal') out.needs = { food: 0.6, water: 0.6 };
  finish(p, out);
}

function say(s: GameState, who: Said['who'], text: string, kind: Said['kind']) {
  s.said.push({ at: s.minute, who, text, kind });
  if (s.said.length > 240) s.said.splice(0, s.said.length - 240);
}

// ---------- dawn ----------

function aboutYou(s: GameState, k: KeeperState, overtopped: boolean): string {
  if (overtopped)
    return k.id === 'dai'
      ? 'Water came over the dam. I have worked here for thirty years, and water came over the dam.'
      : 'I’m sorry, sir. I didn’t expect the water to come over the dam. Nobody told me.';
  const p = personOf(s, k.id);
  const dt = trustOf(p) - k.trustAtOpen;
  const n = k.night;
  const dai = k.id === 'dai';
  if (n.complied >= 2)
    return dai
      ? `You insisted ${n.complied} times. I don’t forget that.`
      : 'I did everything you said, sir. I did everything.';
  if (n.complied === 1)
    return dai
      ? 'You insisted once. Once is enough.'
      : 'You had to ask me twice for one job. I’m sorry, sir.';
  // Drawing her down before the storm is the whole job, and a keeper says so.
  const from = watchFrom(s.night);
  const early = s.series.some((x) => x.m >= from && x.m - from < planOf(s).storm.peakAt - 120 && x.gate >= 2);
  if (early && n.turns > 0)
    return dai
      ? 'You lowered the water level at the dam before the rainwater arrived. That’s the job. Morgan did that.'
      : 'Mr Pugh said opening early was right, sir. He said it to me, not to you.';
  if (n.naps > 0 && dai) return 'You sent me to sleep on watch. Nobody did that in thirty years.';
  if (n.naps > 0) return 'Thank you for the sleep, sir. I didn’t say, but I needed it.';
  if (n.asked === 0)
    return dai
      ? 'You were quiet on the radio tonight. Were you even there?'
      : 'You didn’t need me tonight, sir?';
  if (n.asked > 14)
    return dai
      ? 'You had me walk up and down those steps all night.'
      : 'I did a lot of walking tonight, sir. It’s fine. It’s fine.';
  if (dt > 0.01)
    return dai
      ? 'You asked me properly. Not many people do.'
      : 'You listen, sir. The people at my last workplace didn’t listen.';
  if (n.refused >= 1)
    return dai ? 'I said no once. You accepted it. That was good.' : 'I’m sorry I couldn’t do it earlier.';
  const pick = (xs: string[]) => xs[(s.night + KEEPERS.indexOf(k.id)) % xs.length] as string;
  return dai
    ? pick(['It was a long night. You were there for it.', 'The old dam held. It usually does.'])
    : pick([
        'I wish you a good night, sir. I mean, a good morning.',
        'I think I’m learning how to use the wheel.',
      ]);
}

/**
 * HF's review line in his own words. The review itself (did he keep his promise to stay awake) is HF's; the
 * wording of a broken watch varies by night, because the same sentence every dawn read as a template.
 */
function ownWatchLine(s: GameState, id: KeeperId, line: string): string {
  if (!/didn't keep my watch/i.test(line)) return line.replace(/^Today/, 'Tonight');
  const dai = [
    'I fell asleep by the stove. I know I did.',
    'I shut my eyes for a minute. It was longer than a minute.',
    'I never slept on watch in thirty years. Now look at me.',
    'I fell asleep. Don’t write that in the log.',
    'I slept in the chair. My dad would have scolded me.',
  ];
  const callum = [
    'I fell asleep, sir. I’m sorry. It won’t happen again.',
    'I only sat down for a second.',
    'I fell asleep at once. The baby kept me awake all day.',
  ];
  const xs = id === 'dai' ? dai : callum;
  return xs[(s.night + s.seed) % xs.length] ?? line;
}

/** Retain the actual HF review of this watch before a later morning review replaces it.
 * Cause changes narration only. The recorded missed/kept/resolved entries stay as HF wrote them.
 */
function retainWatchReview(s: GameState, k: KeeperState, p: Person) {
  const review = p.review?.last;
  if (
    !review ||
    review.day < Math.floor(watchFrom(s.night) / 1440) ||
    (!review.missed.includes('my watch') && !review.kept.includes('my watch'))
  )
    return;
  if (k.watchReview?.missed.includes('my watch') && !review.missed.includes('my watch')) return;
  k.watchReview = structuredClone(review);
  k.watchReviewLine = (
    reviewLine(p, {
      variety: true,
      ...(k.orderedNap && review.missed.length === 1 && review.missed[0] === 'my watch'
        ? { cause: 'ordered' as const }
        : {}),
    }) ?? ''
  ).replace(/^Today/, 'Tonight');
}

function houseFate(firstAt: number | null, warnedAt: number | null): 'dry' | 'saved' | 'flooded' {
  if (firstAt === null) return 'dry';
  return warnedAt !== null && warnedAt <= firstAt - 25 ? 'saved' : 'flooded';
}

function closeNight(s: GameState, overtopped: boolean) {
  if (s.privateScenes) cancelPrivate(s, 'The watch has ended.');
  if (s.outcomes) cancelOutcome(s, 'The watch has ended.');
  const night = s.night;
  for (const k of s.keepers) {
    const p = personOf(s, k.id);
    if (k.on && p.activity) endActivity(p, 'completed', s.minute);
    k.job = null;
  }
  deliverHeld(s);
  const series = s.series;
  const maxLevel = Math.max(...series.map((x) => x.level), s.water.level);
  const maxBridge = Math.max(...series.map((x) => x.bridge));
  const mill = houseFate(s.firstMillAt, s.warnedAt);
  const square = houseFate(s.firstSquareAt, s.warnedAt);
  const falseAlarm = s.warnedAt !== null && maxBridge < MILL_LANE - 0.5;
  if (falseAlarm) {
    s.falseAlarms += 1;
    s.nerys.goodwill = Math.max(0, s.nerys.goodwill - 0.3);
  }
  const misses: Miss[] = [];
  const kept = s.reports.filter((r) => r.who !== 'nerys' && (r.gauge === 'level' || r.gauge === 'weir'));
  for (const r of kept) {
    const off = r.value - r.truth;
    const big = r.gauge === 'level' ? Math.abs(off) >= 0.2 : Math.abs(off) >= 0.06;
    if (!big || r.at === watchFrom(night)) continue;
    // Caught: you asked for that gauge again within twenty minutes, or lightning showed you the wall.
    const again = s.inputs.some(
      (i) => i.kind === 'ask' && i.job === r.gauge && i.at > r.at && i.at <= r.at + 20,
    );
    const flash = r.gauge === 'level' && s.flashes.some((f) => f.at > r.at && f.at <= r.at + 20);
    misses.push({
      at: r.at,
      who: r.who as KeeperId,
      gauge: r.gauge,
      said: r.value,
      truth: r.truth,
      cause: r.cause,
      caught:
        s.rules?.edition === 'extended-1'
          ? r.doubted === true
          : again || flash || (s.rules?.edition === 'extended-2' && r.doubted === true),
    });
  }
  if (s.rules)
    for (const k of s.keepers) {
      const p = personOf(s, k.id);
      if (readDoze(p)?.asleep) {
        tick(p, s.minute);
        perceive(p, [
          {
            kind: 'handover-alarm',
            at: p.now,
            channel: 'heard',
            salience: 1,
            near: true,
            targetId: p.id,
            summary: 'The day keeper calls at the hut for the handover.',
          },
        ]);
        const span = k.dozes.at(-1);
        if (span) span.to = Math.min(s.minute, p.now);
      }
    }
  // Morning: home, review, sleep.
  s.minute = watchTo(night);
  morningHours(s, night);
  if (s.rules) for (const k of s.keepers) if (k.on) retainWatchReview(s, k, personOf(s, k.id));
  const dawn: Dawn = {
    ...(s.rules
      ? {
          extended: true as const,
          ...(s.rules.edition === 'extended-2' ? { edition: 'extended-2' as const } : {}),
          doubts: s.reports
            .filter((r) => r.doubted)
            .map((r) => ({
              at: r.at,
              who: r.who,
              gauge: r.gauge,
              value: r.value,
              truth: r.truth,
              wrong: Math.abs(r.value - r.truth) >= (r.gauge === 'weir' ? 0.06 : 0.2),
            })),
        }
      : {}),
    night,
    series,
    reports: s.reports,
    flashes: s.flashes,
    mill,
    square,
    warnedAt: s.warnedAt,
    falseAlarm,
    overtopped,
    spilled: maxLevel > LIP,
    maxLevel: round3(maxLevel),
    maxBridge: round3(maxBridge),
    misses,
    dozes: s.keepers.flatMap((k) => k.dozes.map((d) => ({ who: k.id, from: d.from, to: d.to }))),
    strain: s.keepers.filter((k) => k.strained && k.on).map((k) => k.id),
    lines: s.keepers
      .filter((k) => k.on)
      .map((k) => ({
        id: k.id,
        line: s.rules
          ? k.dozes.some((d) => d.to > d.from && d.from < watchTo(night) && d.to > watchFrom(night)) &&
            k.watchReview?.kept.includes('my watch')
            ? ''
            : (k.watchReviewLine ?? '')
          : ownWatchLine(s, k.id, reviewLine(personOf(s, k.id)) ?? ''),
        aboutYou: aboutYou(s, k, overtopped),
      })),
  };
  s.dawns.push(dawn);
  s.phase = overtopped || night >= nightsOf(s) ? 'end' : 'dawn';
}

export const levelCrest = CREST;

// ---------- save, export, replay ----------

export interface Export {
  game: string;
  framework: string;
  seed: number;
  inputs: Input[];
  state: GameState;
}

export function exportRun(s: GameState, framework: string): Export {
  return { game: GAME_VERSION, framework, seed: s.seed, inputs: s.inputs, state: cloneState(s) };
}

export function cloneState(s: GameState): GameState {
  return { ...structuredClone({ ...s, people: [] }), people: s.people.map((p) => snapshot(p)) };
}

export function restoreState(json: GameState): GameState {
  return { ...structuredClone({ ...json, people: [] }), people: json.people.map((p) => restore(p)) };
}

/** Rebuild a run from its seed and input log, stepping watch minutes until `until` (or the last input). */
export function replay(
  seed: number,
  inputs: readonly Input[],
  until?: number,
  chapter?: Chapter,
  rules?: WatchRules,
): GameState {
  const s = newGame(seed, chapter, rules);
  for (const inp of inputs) {
    while (s.phase === 'watch' && !s.chapterPaused && s.minute < inp.at) step(s);
    s.inputs.push(inp);
    if (s.phase !== 'watch' || s.chapterPaused) applyPending(s);
  }
  if (until !== undefined) while (s.phase === 'watch' && !s.chapterPaused && s.minute < until) step(s);
  return s;
}

/** A compact fingerprint of everything that matters, for replay checks. */
export function fingerprint(s: GameState): string {
  return JSON.stringify({
    night: s.night,
    phase: s.phase,
    minute: s.minute,
    water: [round3(s.water.level), s.water.gate, round3(s.water.wet)],
    reports: s.reports.map((r) => [r.at, r.who, r.gauge, r.value]),
    dawns: s.dawns.map((d) => [d.night, d.mill, d.square, d.maxLevel, d.misses.length, d.lines]),
    people: s.people.map((p) => [p.id, p.trace.length, p.now, trustOf(p)]),
    discoveries: s.discoveries,
    conversations: s.conversations,
    ...(s.outcomes ? { outcomes: s.outcomes } : {}),
  });
}
