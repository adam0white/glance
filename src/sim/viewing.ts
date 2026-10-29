/** Scope: one optional public sky viewing, never an astronomy service or new faculty.
 * Source: registry28 and the actually retained telescope disclosure in cast.ts. Three
 * corners, repaired stand and private notebook are source content; no coordinates exist.
 * Design assumptions: the existing back wall has a viewing place five minutes from
 * the inn phone; existing 22:00–midnight cover permits this trip. The keyed possible
 * streak below is prospective game sky, not an ephemeris, measurement or forecast.
 * HF owns decisions, attendance, body time and perception. The host owns this geometry,
 * the actual local weather, river danger and sky event. No host rewards or Person edits.
 */

import { required } from '../required.ts';
import { lifeReady, rememberedConversation } from './cast.ts';
import type { GameState } from './dam.ts';
import { type Affordance, begin, decide, finish, perceive, readDoze, reviewed, tick } from './hf4.ts';
import { cornerSky } from './private-scenes.ts';
import { hashUnit } from './rng.ts';
import { bridgeOf, MILL_LANE } from './water.ts';

export type ViewingAction = 'invite' | 'return' | 'stop';
export interface Viewing {
  source: string;
  requestedAt: number;
  inputIndex: number;
  night: number;
  away: boolean;
  stage: 'refused' | 'walking' | 'watching' | 'waiting' | 'returning' | 'returned';
  decisions: { at: number; action: string; result: 'refused' | 'began' | 'begin-failed' }[];
  departedAt?: number;
  arrivedAt?: number;
  attendedFrom?: number;
  attended: number;
  finishedAt?: number;
  stoppedAt?: number;
  reason?: string;
  returnFrom?: number;
  returnedAt?: number;
  known: { at: number; kind: 'streak'; text: string }[];
  result?: string;
}
export const viewingAway = (s: GameState) => s.viewing?.away === true;
const person = (s: GameState) => required(s.people.find((p) => p.id === 'nerys'));
const asleep = (s: GameState) =>
  person(s).body.asleep || person(s).activity?.mode === 'sleep' || readDoze(person(s))?.asleep === true;
export const viewingInnUnavailable = (s: GameState) => !!s.viewing && (viewingAway(s) || asleep(s));
/** World-only keyed occurrence. Calling it, or changing actor decision order, consumes no RNG. */
export function skyStreak(seed: number, night: number, at: number): boolean {
  const from = (night - 1) * 1440 + 1355 + Math.floor(hashUnit(seed, 0x534b5954, night) * 5);
  return hashUnit(seed, 0x534b5945, night) < 0.65 && at >= from && at < from + 3;
}
function say(s: GameState, text: string) {
  s.said.push({ at: s.minute, who: 'narrator', kind: 'answer', text });
}
function offer(action: 'walk' | 'watch' | 'return'): Affordance {
  return {
    id: `sky-${action}`,
    action: `sky-${action}`,
    label:
      action === 'walk'
        ? 'carry the telescope to the back wall'
        : action === 'watch'
          ? 'watch the sky at the back wall'
          : 'carry the telescope back to the inn',
    duration: action === 'watch' ? 20 : 5,
    effort: action === 'watch' ? 0.03 : 0.12,
    advertises: action === 'return' ? { rest: 0.25, belonging: 0.2 } : { leisure: 0.35, belonging: 0.2 },
  };
}
function choose(s: GameState, action: 'walk' | 'watch' | 'return') {
  const p = person(s),
    a = offer(action);
  tick(p, s.minute);
  const rec = decide(
    p,
    [
      a,
      {
        id: 'sky-keep-time',
        action: 'rest',
        label: 'keep my own time',
        duration: 20,
        effort: 0,
        advertises: { rest: 0.25, water: 0.15, food: 0.05 },
      },
    ],
    { suggestion: { voiceId: 'engineer', affordanceId: a.id, strength: 0.6 } },
  );
  const alternative = {
    id: 'sky-keep-time',
    action: 'rest',
    label: 'keep my own time',
    duration: 20,
    effort: 0,
    advertises: { rest: 0.25, water: 0.15, food: 0.05 },
  };
  if (rec.chosenAffordanceId === alternative.id) begin(p, alternative, rec);
  const willing = rec.chosenAffordanceId === a.id && rec.suggestion?.verdict === 'assented';
  const began = willing && begin(p, a, rec);
  required(s.viewing).decisions.push({
    at: s.minute,
    action,
    result: began ? 'began' : willing ? 'begin-failed' : 'refused',
  });
  return began;
}
function finishOwn(s: GameState, status: 'completed' | 'interrupted') {
  const p = person(s),
    a = p.activity;
  if (a?.affordanceId.startsWith('sky-') && a.affordanceId !== 'sky-keep-time')
    finish(p, { affordanceId: a.affordanceId, action: a.action, at: a.dozedAt ?? s.minute, status });
}
export function viewingAvailable(s: GameState, action: 'invite' | 'return'): string | null {
  if (!s.privateScenes || !s.discoveries.nerys || !rememberedConversation(s, 'nerys'))
    return 'Ask about the folded telescope stand first.';
  if (s.phase !== 'watch' || s.pauseRequested || s.chapterPaused || s.radioOut)
    return 'The desk cannot arrange this now.';
  if (action === 'invite' && s.viewing) return 'This invitation and its outcome are already retained.';
  if (action === 'return' && (!viewingAway(s) || s.viewing?.stage === 'returning'))
    return 'No separate return is waiting to begin.';
  if (!lifeReady(s, 'nerys') || asleep(s) || person(s).activity)
    return 'Nerys is busy or asleep. No trip or return is promised.';
  if (action === 'return') return null;
  if (s.privateScenes.active || s.nerys.ringing !== null)
    return 'Finish the current activity or river call first.';
  const local = s.minute % 1440;
  if (local < 1320 || local + 40 > 1440)
    return 'Inn cover ends at midnight. Allow five minutes out, twenty watching, five back and time to choose the return.';
  if (s.nerys.goodwill < 0.35) return 'The inn is not available for this invitation.';
  if (bridgeOf(s.water) >= MILL_LANE) return 'The river is too high for this optional trip.';
  if (cornerSky(s.seed, s.night, s.minute) === 'rain')
    return 'Rain at the inn prevents taking out the telescope.';
  return null;
}
export function viewingStatus(s: GameState): string {
  const v = s.viewing;
  if (!v)
    return 'At the back wall, the inn sign is out of the way. A short streak might cross the sky tonight; cloud may hide everything.';
  if (v.away)
    return v.stage === 'returning'
      ? 'Nerys is carrying the telescope back. She cannot answer the inn phone yet.'
      : v.stage === 'watching'
        ? 'Nerys is at the back wall watching the sky. She cannot work at the inn or witness the river steps.'
        : 'Nerys is away from the inn phone. A separately chosen five-minute return is still needed; calling does not bring her back.';
  if (asleep(s)) return 'Nerys is asleep. No river report or work forecast is available.';
  return v.stage === 'refused'
    ? 'Nerys kept this time for herself. No trip began.'
    : 'Nerys has physically returned to the inn.';
}
export function stopViewing(s: GameState, reason: string) {
  const v = s.viewing;
  if (!v?.away || v.stage === 'waiting') return;
  finishOwn(s, 'interrupted');
  v.stoppedAt ??= s.minute;
  v.reason = reason;
  v.stage = 'waiting';
  say(
    s,
    v.finishedAt !== undefined
      ? `${reason} The return was interrupted. Nerys remains away until she chooses and completes a separate return. Her completed viewing remains recorded, along with any sighting.`
      : `${reason} Viewing stopped. Nerys remains away until she chooses and completes a separate return. Any sighting already recorded remains; no completed viewing is awarded.`,
  );
}
export function requestViewing(s: GameState, action: ViewingAction) {
  if (action === 'stop') {
    stopViewing(s, 'Attendance was stopped.');
    return;
  }
  if (action !== 'invite' && action !== 'return') return;
  const blocked = viewingAvailable(s, action);
  if (blocked) {
    say(s, blocked);
    return;
  }
  if (action === 'invite') {
    s.viewing = {
      source: required(rememberedConversation(s, 'nerys')),
      requestedAt: s.minute,
      inputIndex: s.applied - 1,
      night: s.night,
      away: false,
      stage: 'refused',
      decisions: [],
      attended: 0,
      known: [],
    };
    if (!choose(s, 'walk')) {
      say(s, 'Nerys does not choose the trip. She keeps the time for herself.');
      return;
    }
    const v = s.viewing;
    v.away = true;
    v.stage = 'walking';
    v.departedAt = s.minute;
    say(
      s,
      'Nerys chooses to carry her telescope to the back wall. The walk takes five minutes. Twenty minutes watching and a separate five-minute return will cost inn work and river reports. Clear skies are not promised.',
    );
  } else if (choose(s, 'return')) {
    required(s.viewing).stage = 'returning';
    required(s.viewing).returnFrom = s.minute;
    say(
      s,
      'Nerys chooses the five-minute walk back with her telescope. She cannot answer the inn phone until she arrives.',
    );
  } else say(s, 'Nerys does not choose to return now. She is still away.');
}
export function advanceViewing(s: GameState) {
  const v = s.viewing;
  const rest = person(s).activity;
  if (rest?.affordanceId === 'sky-keep-time' && Math.floor(rest.endsAt) <= s.minute)
    finish(person(s), { action: 'rest', at: s.minute, status: 'completed' });
  if (!v?.away || v.stage === 'waiting') return;
  const p = person(s),
    a = p.activity;
  const expected = v.stage === 'walking' ? 'sky-walk' : v.stage === 'watching' ? 'sky-watch' : 'sky-return';
  if (!a || a.affordanceId !== expected || a.dozedAt !== undefined || asleep(s)) {
    stopViewing(s, 'Nerys can no longer attend.');
    return;
  }
  if (v.stage === 'returning') {
    if (s.minute >= Math.floor(a.endsAt)) {
      finishOwn(s, 'completed');
      v.returnedAt = s.minute;
      v.away = false;
      v.stage = 'returned';
      say(
        s,
        'Nerys has arrived back at the inn with the telescope. The river has continued while she was away.',
      );
    }
    return;
  }
  if (
    s.night !== v.night ||
    s.minute >= (v.night - 1) * 1440 + 1440 ||
    s.phase !== 'watch' ||
    s.pauseRequested ||
    s.radioOut ||
    !lifeReady(s, 'nerys') ||
    bridgeOf(s.water) >= MILL_LANE ||
    cornerSky(s.seed, s.night, s.minute) === 'rain'
  ) {
    stopViewing(s, 'Weather, river conditions or the available time ended the trip.');
    return;
  }
  if (s.minute >= a.reviewAt && s.minute < Math.floor(a.endsAt)) {
    const rec = decide(p, [
      offer(v.stage === 'walking' ? 'walk' : 'watch'),
      {
        id: 'sky-stop',
        action: 'rest',
        label: 'stop attending',
        duration: 20,
        effort: 0,
        advertises: { rest: 0.25 },
      },
    ]);
    if (rec.chosenAffordanceId !== a.affordanceId) {
      stopViewing(s, 'Nerys chooses to stop.');
      return;
    }
    reviewed(p);
  }
  if (v.stage === 'walking' && s.minute >= Math.floor(a.endsAt)) {
    finishOwn(s, 'completed');
    v.arrivedAt = s.minute;
    if (choose(s, 'watch')) {
      v.stage = 'watching';
      v.attendedFrom = s.minute;
      say(
        s,
        'At the back wall, Nerys chooses twenty minutes watching. The old telescope is set up. Nothing has been sighted yet.',
      );
    } else stopViewing(s, 'Nerys does not choose to watch after arriving.');
    return;
  }
  if (v.stage !== 'watching') return;
  v.attended = s.minute - required(v.attendedFrom);
  if (
    skyStreak(s.seed, s.night, s.minute) &&
    cornerSky(s.seed, s.night, s.minute) === 'clear' &&
    !v.known.length
  ) {
    const text = 'A brief bright streak crosses the clear patch above the inn.';
    const seen = perceive(p, [
      {
        at: s.minute,
        channel: 'saw',
        kind: 'sky-streak',
        salience: 0.8,
        placeId: 'inn-back-wall',
        summary: text,
      },
    ]);
    if (seen.some((x) => x.kind === 'sky-streak')) {
      v.known.push({ at: s.minute, kind: 'streak', text });
      say(
        s,
        `${text} Nerys saw it while watching at the back wall. That sighting is retained; her notebook remains private.`,
      );
    }
  }
  if (s.minute >= Math.floor(a.endsAt)) {
    finishOwn(s, 'completed');
    v.finishedAt = s.minute;
    v.stage = 'waiting';
    v.result = v.known.length
      ? 'Twenty attended minutes. A brief bright streak was seen.'
      : 'Twenty attended minutes. No bright streak was seen. Cloud or timing may have hidden one; none is claimed.';
    say(s, `${v.result} Nerys is still at the back wall. Returning to the inn is a separate choice.`);
  }
}
