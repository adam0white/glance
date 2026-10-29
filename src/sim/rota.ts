/** SCOPE: one authored present rota, not an agency/partner faculty. Original proposals,
 * refusals and correction stay exact. The new offer/route/care terms are design assumptions;
 * only HF chooses people, updates bodies and records their participation. No input: no state.
 */

import type { GameState } from './dam.ts';
import {
  type Affordance,
  begin,
  beginTogether,
  type DecisionRecord,
  decide,
  decideTogether,
  finish,
  type Person,
  perceive,
  readDoze,
} from './hf4.ts';
import { bridgeOf, MILL_LANE } from './water.ts';

type Operator = 'dai' | 'callum';
export type RotaAction =
  | 'rota-dai-read'
  | 'rota-callum-read'
  | 'rota-dai-leave'
  | 'rota-callum-home'
  | 'rota-return'
  | 'rota-stop';
export interface RotaOffer {
  person: Operator;
  source: 'authored-received-rota-1';
  proposalAt: number;
  correctionAt?: number;
  offeredAt: number;
  notBefore: number;
  departBy: number;
  expiresAt: number;
  night: number;
  terms: string;
  readFrom?: number;
  readAt?: number;
  stoppedAt?: number;
  reason?: string;
}
export interface RotaTrip {
  person: Operator;
  cover: Operator;
  offer: number;
  requestedAt: number;
  departedAt: number;
  night: number;
  coverUntil: number;
  coveredMinutes: number;
  attended: number;
  arrivedAt?: number;
  intervalFinishedAt?: number;
  interruptedAt?: number;
  reason?: string;
  returnFrom?: number;
  returnNight?: number;
  returnedAt?: number;
}
export interface ReceivedRota {
  offers: RotaOffer[];
  trips: RotaTrip[];
  decisions: { at: number; person: Operator; stage: string; result: 'refused' | 'began' | 'begin-failed' }[];
  reading?: number;
  away?: number;
}
const actions: string[] = [
  'rota-dai-read',
  'rota-callum-read',
  'rota-dai-leave',
  'rota-callum-home',
  'rota-return',
  'rota-stop',
];
export const isRota = (action: string): action is RotaAction => actions.includes(action);
const record = (s: GameState) => s.outcomes?.rota;
const trip = (s: GameState) => {
  const r = record(s);
  return r?.away === undefined ? undefined : r.trips[r.away];
};
const person = (s: GameState, id: Operator) => s.people.find((p) => p.id === id) as Person;
const keeper = (s: GameState, id: Operator) => s.keepers.find((k) => k.id === id)!;
const other = (id: Operator): Operator => (id === 'dai' ? 'callum' : 'dai');
const say = (s: GameState, text: string) =>
  s.said.push({ at: s.minute, who: 'narrator', kind: 'answer', text });
export const rotaAway = (s: GameState, id: string) => trip(s)?.person === id;
export const rotaBusy = (s: GameState) => record(s)?.reading !== undefined || record(s)?.away !== undefined;
export const rotaOccupies = (s: GameState, id: string) =>
  (record(s)?.reading !== undefined && (id === 'dai' || id === 'callum')) ||
  rotaAway(s, id) ||
  (trip(s)?.interruptedAt === undefined && trip(s)?.cover === id);
function free(s: GameState, id: Operator) {
  const k = keeper(s, id),
    p = person(s, id);
  return (
    k.on &&
    k.place === 'hut' &&
    (!k.job || k.job.job === 'stove') &&
    !k.pending &&
    !k.deferred &&
    (!p.activity || p.activity.affordanceId === 'stove') &&
    !readDoze(p)?.asleep
  );
}
function route(s: GameState) {
  // This ordinary walk does not require a clear sky. Existing river flooding closes it.
  return s.water.overtopped || bridgeOf(s.water) >= MILL_LANE
    ? 'The flooded river route is unavailable. Wait; no arrival or return is awarded.'
    : null;
}
function prerequisites(s: GameState, id: Operator) {
  const o = s.outcomes,
    f = o?.keeperScenes;
  if (!s.discoveries[id] || !(id === 'dai' ? f?.daiProposal : f?.callumProposal))
    return 'First retain the disclosure and complete this keeper’s proposal.';
  if (id === 'dai' && o?.handover.completedAt === undefined)
    return 'First complete the joint handover and Callum’s separate test; uncertainty remains.';
  if (id === 'callum' && o?.correction.filedAt === undefined)
    return 'First actually sign and file Callum’s correction. Its review remains separate.';
  return null;
}
const lastOffer = (s: GameState, id: Operator) =>
  record(s)?.offers.findLast((o) => o.person === id && o.night === s.night);
export function rotaAvailable(s: GameState, action: RotaAction): string | null {
  const r = record(s),
    t = trip(s);
  if (!s.outcomes || s.phase !== 'watch' || s.chapterPaused || s.pauseRequested)
    return 'The watch is not available.';
  if (action === 'rota-stop')
    return r?.reading !== undefined || (t && (t.interruptedAt === undefined || t.returnFrom !== undefined))
      ? null
      : 'No attended rota activity is running.';
  if (s.radioOut) return 'The radio is out; no new arrangement or return can be chosen.';
  if (action === 'rota-return') {
    if (!t || t.returnFrom !== undefined) return 'No separate return is available.';
    if (person(s, t.person).activity || readDoze(person(s, t.person))?.asleep)
      return 'The absent keeper must finish or stop his current activity and be awake to choose the return.';
    return route(s);
  }
  if (rotaBusy(s)) return 'Finish or stop the current rota activity; an absent keeper must actually return.';
  const f = s.outcomes.keeperScenes,
    c = s.outcomes.correction;
  if (
    s.outcomes.active ||
    f?.active !== undefined ||
    f?.away !== undefined ||
    f?.homeAway !== undefined ||
    (c.restFrom !== undefined && c.restedAt === undefined && c.restStoppedAt === undefined)
  )
    return 'Finish the other shift arrangement and any physical return first.';
  const id: Operator = action.includes('dai') ? 'dai' : 'callum';
  const needed = prerequisites(s, id);
  if (needed) return needed;
  if (!free(s, 'dai') || !free(s, 'callum'))
    return 'Both scheduled keepers must be on site, awake and free; no off-duty replacement is supplied.';
  if (action.endsWith('-read')) {
    if (lastOffer(s, id))
      return 'This watch’s offer has already been received; its reading or expiry stays recorded.';
    const until = Math.floor((s.minute + 120) / 1440) * 1440 + 360;
    return s.minute + 155 <= until
      ? null
      : 'There is not time for five minutes reading, travel,120 minutes away and the return margin before dawn.';
  }
  const offer = lastOffer(s, id);
  if (
    !offer?.readAt ||
    offer.stoppedAt !== undefined ||
    s.minute < offer.notBefore ||
    s.minute > offer.departBy
  )
    return 'A completed current reading and an unexpired departure window are required.';
  if (r?.trips.some((t) => t.offer === r.offers.indexOf(offer))) return 'This offer has already been used.';
  return route(s);
}
export function rotaStatus(s: GameState, id: string): string | null {
  const t = trip(s);
  if (!t || t.person !== id) return null;
  const name = id === 'dai' ? 'Dai' : 'Callum';
  if (t.returnFrom !== undefined)
    return `${name} is returning, still away from the dam. Arrival needs ten actual walking minutes.`;
  if (t.interruptedAt !== undefined)
    return `${name} remains away after interruption; his exact location is not recorded. ${t.attended} attended minutes remain. Choose a separate ten-minute return.`;
  if (t.arrivedAt === undefined)
    return `${name} is walking away from the dam; arrival is not yet recorded. A separate ten-minute return is required.`;
  if (t.intervalFinishedAt !== undefined)
    return `${name} finished 120 actual ${id === 'dai' ? 'leave' : 'home-rest'} minutes and remains away. Choose a separate ten-minute return.`;
  return `${name} is ${id === 'dai' ? 'on bounded leave in the Bridge Inn public yard' : person(s, 'callum').activity?.mode === 'sleep' ? 'asleep at home' : 'resting at home'}, away from the dam. ${t.attended} minutes attended; return is separate.`;
}
export function rotaTerms(id: Operator) {
  return `A new received rota offers ${id === 'dai' ? 'Dai 120 minutes of bounded leave in the Bridge Inn public yard, with Callum covering' : 'Callum a revised 120-minute protected home-rest block, with Dai covering. A new note from his partner offers baby care for this specific block; Callum must still choose whether to accept'}. Both keepers must choose. Allow five attended minutes to read, ten minutes out,120 minutes away and a separately chosen ten-minute return. The cover keeper gives up his own rest and work flexibility for at most150 minutes after departure. Depart within thirty minutes after reading and before the posted deadline. Flooding, duty, sleep, radio loss, pause or lost participation can interrupt the arrangement. An interrupted keeper remains away until an actual return. Rain alone does not close this ordinary walk. The new terms do not settle the earlier final-two-hours request or the correction review. No inn service, pay, health, safety, retirement or residency is promised.`;
}
function offer(stage: 'read' | 'out' | 'interval' | 'cover' | 'return', id: Operator): Affordance {
  return {
    id: `rota-${stage}`,
    action:
      stage === 'interval' && id === 'callum'
        ? 'sleep'
        : stage === 'out' || stage === 'return'
          ? 'walk'
          : 'wait',
    label:
      stage === 'interval'
        ? id === 'dai'
          ? 'take the agreed bounded leave in the public yard'
          : 'rest at home under the new shared plan'
        : stage === 'cover'
          ? 'reserve actual dam cover under this finite rota'
          : stage === 'read'
            ? 'read the received rota together'
            : 'walk on the agreed route',
    duration: stage === 'read' ? 5 : stage === 'cover' ? 150 : stage === 'interval' ? 120 : 10,
    effort: stage === 'out' || stage === 'return' ? 0.15 : stage === 'interval' ? 0 : 0.03,
    mode: stage === 'interval' && id === 'callum' ? 'sleep' : 'awake',
    advertises:
      stage === 'interval'
        ? id === 'callum'
          ? { sleep: 0.6, rest: 0.4 }
          : { rest: 0.4, belonging: 0.25 }
        : { belonging: 0.25 },
  };
}
function choice(s: GameState, id: Operator, stage: Parameters<typeof offer>[0], supplied?: DecisionRecord) {
  const p = person(s, id),
    proposed = offer(stage, id);
  const rec =
    supplied ??
    decide(
      p,
      [
        proposed,
        {
          id: 'stove',
          action: 'stove',
          label: 'keep time for ordinary duty and rest',
          duration: 20,
          effort: 0.03,
          advertises: { rest: 0.25, water: 0.15, food: 0.05 },
        },
      ],
      { now: s.minute, suggestion: { voiceId: 'engineer', affordanceId: proposed.id, strength: 0.6 } },
    );
  if (rec.chosenAffordanceId !== proposed.id || rec.suggestion?.verdict !== 'assented') {
    record(s)!.decisions.push({ at: s.minute, person: id, stage, result: 'refused' });
    return null;
  }
  return { p, proposed, rec, id, stage };
}
/** Both real decisions precede either conditional physical start. */
function joint(s: GameState, pairs: readonly [Operator, Parameters<typeof offer>[0]][]) {
  const records = decideTogether(
    pairs.map(([id, stage]) => {
      const proposed = offer(stage, id);
      return {
        person: person(s, id),
        affordances: [
          proposed,
          {
            id: 'stove',
            action: 'stove',
            label: 'keep time for ordinary duty and rest',
            duration: 20,
            effort: 0.03,
            advertises: { rest: 0.25, water: 0.15, food: 0.05 },
          },
        ],
        options: { suggestion: { voiceId: 'engineer', affordanceId: proposed.id, strength: 0.6 } },
      };
    }),
  );
  return pairs.map(([id, stage], i) => choice(s, id, stage, records[i]));
}
function startJoint(s: GameState, choices: NonNullable<ReturnType<typeof choice>>[]) {
  for (const c of choices) {
    if (c.p.activity) finishOwn(c.p, s.minute, 'interrupted');
    keeper(s, c.id).job = null;
  }
  beginTogether(choices.map((c) => c.p));
  return choices.every((c) => {
    const began = c.p.activity?.affordanceId === c.proposed.id;
    record(s)!.decisions.push({
      at: s.minute,
      person: c.id,
      stage: c.stage,
      result: began ? 'began' : 'begin-failed',
    });
    return began;
  });
}
function finishOwn(p: Person, at: number, status: 'interrupted' | 'completed') {
  if (p.activity) finish(p, { affordanceId: p.activity.affordanceId, action: p.activity.action, at, status });
}
function start(s: GameState, c: NonNullable<ReturnType<typeof choice>>) {
  if (c.p.activity) finishOwn(c.p, s.minute, 'interrupted');
  keeper(s, c.id).job = null;
  const began = begin(c.p, c.proposed, c.rec);
  record(s)!.decisions.push({
    at: s.minute,
    person: c.id,
    stage: c.stage,
    result: began ? 'began' : 'begin-failed',
  });
  return !!began;
}
function stopOwn(s: GameState, status: 'interrupted' | 'completed') {
  for (const id of ['dai', 'callum'] as const) {
    const p = person(s, id);
    if (p.activity?.affordanceId.startsWith('rota-')) finishOwn(p, s.minute, status);
  }
}
export function stopRota(s: GameState, reason: string) {
  const r = record(s);
  if (!r) return;
  if (r.reading !== undefined) {
    const o = r.offers[r.reading]!;
    o.stoppedAt = s.minute;
    o.reason = reason;
    delete r.reading;
    say(s, `${reason} The reading is incomplete; no agreement or departure is recorded.`);
  }
  const t = trip(s);
  if (t && (t.interruptedAt === undefined || t.returnFrom !== undefined)) {
    t.interruptedAt ??= s.minute;
    t.reason = reason;
    delete t.returnFrom;
    delete t.returnNight;
    say(
      s,
      `${reason} ${t.intervalFinishedAt !== undefined ? 'The completed 120-minute interval remains recorded.' : 'The interval remains incomplete.'} The keeper stays away; choose a separate ten-minute return.`,
    );
  }
  stopOwn(s, 'interrupted');
}
export function recallRota(s: GameState, id: string) {
  if (!rotaAway(s, id)) return false;
  stopRota(s, 'The desk called the absent keeper.');
  say(s, 'No dam job was queued. The keeper is away; invite his return separately.');
  return true;
}
export function requestRota(s: GameState, action: RotaAction) {
  const reason = rotaAvailable(s, action);
  if (reason) {
    say(s, reason);
    return;
  }
  if (action === 'rota-stop') {
    stopRota(s, 'The player stopped the rota activity.');
    return;
  }
  s.outcomes!.rota ??= { offers: [], trips: [], decisions: [] };
  const r = s.outcomes!.rota;
  if (action === 'rota-return') {
    const t = trip(s)!;
    const c = choice(s, t.person, 'return');
    if (c && start(s, c)) {
      t.returnFrom = s.minute;
      t.returnNight = s.night;
      say(s, 'The keeper chooses ten minutes walking back. He is not at the dam yet.');
    }
    return;
  }
  const id: Operator = action.includes('dai') ? 'dai' : 'callum';
  if (action.endsWith('-read')) {
    const f = s.outcomes!.keeperScenes!;
    const until = Math.floor((s.minute + 120) / 1440) * 1440 + 360;
    const o: RotaOffer = {
      person: id,
      source: 'authored-received-rota-1',
      proposalAt: (id === 'dai' ? f.daiProposal : f.callumProposal)!.at,
      ...(id === 'callum' ? { correctionAt: s.outcomes!.correction.filedAt } : {}),
      offeredAt: s.minute,
      notBefore: s.minute + 5,
      departBy: Math.min(s.minute + 35, until - 150),
      expiresAt: until,
      night: s.night,
      terms: rotaTerms(id),
    };
    r.offers.push(o);
    say(s, o.terms);
    const choices = joint(s, [
      ['dai', 'read'],
      ['callum', 'read'],
    ]);
    if (choices.some((c) => !c)) {
      o.stoppedAt = s.minute;
      o.reason = 'The keepers did not both choose the reading.';
      say(s, o.reason);
      return;
    }
    if (
      !startJoint(
        s,
        choices.filter((c) => c !== null),
      )
    ) {
      o.stoppedAt = s.minute;
      o.reason = 'The reading could not begin.';
      stopOwn(s, 'interrupted');
      return;
    }
    o.readFrom = s.minute;
    r.reading = r.offers.length - 1;
    return;
  }
  const o = lastOffer(s, id)!;
  const choices = joint(s, [
    [id, 'out'],
    [other(id), 'cover'],
  ]);
  if (choices.some((c) => !c)) {
    say(s, 'The keepers did not both accept this conditional rota. No departure or cover began.');
    return;
  }
  if (
    !startJoint(
      s,
      choices.filter((c) => c !== null),
    )
  ) {
    stopOwn(s, 'interrupted');
    return;
  }
  r.trips.push({
    person: id,
    cover: other(id),
    offer: r.offers.indexOf(o),
    requestedAt: s.minute,
    departedAt: s.minute,
    night: s.night,
    coverUntil: s.minute + 150,
    coveredMinutes: 0,
    attended: 0,
  });
  r.away = r.trips.length - 1;
  say(
    s,
    `${id === 'dai' ? 'Dai' : 'Callum'} accepts the new conditional block and leaves for ten minutes walking. ${id === 'dai' ? 'Callum' : 'Dai'} chooses actual on-site cover; no leave or rest minutes have elapsed yet.`,
  );
}
export function advanceRota(s: GameState) {
  const r = record(s);
  if (!r) return;
  if (r.reading !== undefined) {
    const o = r.offers[r.reading]!;
    if (
      s.night !== o.night ||
      s.radioOut ||
      s.pauseRequested ||
      (['dai', 'callum'] as const).some(
        (id) =>
          !keeper(s, id).on ||
          keeper(s, id).place !== 'hut' ||
          person(s, id).activity?.affordanceId !== 'rota-read' ||
          readDoze(person(s, id))?.asleep,
      )
    ) {
      stopRota(s, 'Attendance or radio contact was lost.');
      return;
    }
    if (s.minute >= o.readFrom! + 5) {
      o.readAt = s.minute;
      delete r.reading;
      stopOwn(s, 'completed');
      for (const id of ['dai', 'callum'] as const) {
        const p = person(s, id);
        perceive(p, [
          { kind: 'received-rota', at: p.now, channel: 'saw', salience: 0.5, near: true, summary: o.terms },
        ]);
      }
      say(
        s,
        'Both keepers spent five minutes reading the new received terms. Reading is not acceptance. Departure and cover are separate choices.',
      );
    }
    return;
  }
  const t = trip(s);
  if (!t) return;
  const p = person(s, t.person),
    cover = keeper(s, t.cover),
    cp = person(s, t.cover);
  if (t.interruptedAt === undefined) {
    if (
      s.night !== t.night ||
      s.minute > t.coverUntil ||
      !cover.on ||
      cover.place !== 'hut' ||
      cover.job ||
      cover.pending ||
      cover.deferred ||
      cp.activity?.affordanceId !== 'rota-cover' ||
      readDoze(cp)?.asleep
    ) {
      stopRota(s, 'Actual cover ended or became unavailable.');
      return;
    }
    t.coveredMinutes = s.minute - t.departedAt;
  }
  if (t.returnFrom !== undefined) {
    if (
      s.night !== t.returnNight ||
      s.radioOut ||
      s.pauseRequested ||
      route(s) ||
      p.activity?.affordanceId !== 'rota-return' ||
      readDoze(p)?.asleep
    ) {
      stopRota(s, 'The return lost participation or the route closed.');
      return;
    }
    if (s.minute >= t.returnFrom + 10) {
      t.returnedAt = s.minute;
      delete r.away;
      stopOwn(s, 'completed');
      say(
        s,
        'Ten actual return minutes are complete. The keeper is back at the dam; his retained interval and interruption history are unchanged.',
      );
    }
    return;
  }
  if (t.interruptedAt !== undefined) return;
  if (
    s.night !== t.night ||
    s.radioOut ||
    s.pauseRequested ||
    route(s) ||
    s.minute > t.coverUntil ||
    !cover.on ||
    cover.place !== 'hut' ||
    cover.job ||
    cover.pending ||
    cover.deferred ||
    cp.activity?.affordanceId !== 'rota-cover' ||
    readDoze(cp)?.asleep ||
    (t.intervalFinishedAt === undefined &&
      (p.activity?.affordanceId !== (t.arrivedAt === undefined ? 'rota-out' : 'rota-interval') ||
        readDoze(p)?.asleep))
  ) {
    stopRota(s, 'Duty, flooding, expiry or lost voluntary cover/participation interrupts the rota.');
    return;
  }
  t.coveredMinutes = s.minute - t.departedAt;
  if (t.arrivedAt === undefined && s.minute >= t.departedAt + 10) {
    finishOwn(p, s.minute, 'completed');
    t.arrivedAt = s.minute;
    const c = choice(s, t.person, 'interval');
    if (!c || !start(s, c)) stopRota(s, 'The keeper did not choose the activity on arrival.');
    else
      say(
        s,
        'Arrival is recorded. The keeper independently chooses the 120-minute interval; it has not elapsed yet.',
      );
    return;
  }
  if (t.arrivedAt !== undefined && t.intervalFinishedAt === undefined) {
    t.attended++;
    if (t.attended === 120) {
      finishOwn(p, s.minute, 'completed');
      t.intervalFinishedAt = s.minute;
      say(
        s,
        '120 actual attended minutes are complete. The keeper remains away. Choose a separate ten-minute return before cover expires.',
      );
    }
  }
}
