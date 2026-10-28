/** Optional finite host scenes. HF chooses participation and rest; this module owns only
 * the authored list, fictional correction and elapsed attendance. It supplies no sensor
 * measurement, institutional response, new competence or safety guarantee.
 */
import { type Affordance, begin, decide, finish, type Person, readDoze } from '@adam0white/human-framework';
import { rememberedConversation } from './cast.ts';
import type { GameState, KeeperState } from './dam.ts';

import {
  advanceKeeperScenes,
  callumAway,
  cancelKeeperScene,
  isKeeperScene,
  type KeeperSceneAction,
  type KeeperScenes,
  keeperSceneAvailable,
  keeperSceneOccupies,
  requestKeeperScene,
} from './keeper-scenes.ts';

type JointTask = 'handover' | 'handover-test' | 'correction';
export type OutcomeTask = JointTask | KeeperSceneAction;
export interface ShiftOutcomes {
  keeperScenes?: KeeperScenes;
  handover: {
    original: string;
    list: string;
    sensor: 'unverified' | 'marked-unverified';
    startedAt?: number;
    transferredAt?: number;
    completedAt?: number;
    attendees?: string[];
    test?: {
      question: string;
      instruction: string;
      startedAt: number;
      attendees: ['callum'];
      stoppedAt?: number;
      at?: number;
      answer?: string;
      action?: 'withhold-unverified-workaround';
      passed?: boolean;
    };
  };
  correction: {
    startedAt?: number;
    writtenAt?: number;
    originalAccount?: string;
    signedBy?: 'Callum';
    filedAt?: number;
    channel?: 'fictional-agency-correction-register';
    status?: 'awaiting-review';
    text?: string;
    cover?: 'dai';
    restFrom?: number;
    restedAt?: number;
    restStoppedAt?: number;
  };
  active?: { task: JointTask; from: number; until: number; night: number };
  retryAfter?: number;
}
const original =
  'Check the written time before using a report. Use the workaround for the replaced sensor. Ask the outgoing keeper which instructions remain uncertain.';
export const newOutcomes = (): ShiftOutcomes => ({
  handover: { original, list: original, sensor: 'unverified' },
  correction: {},
});
const person = (s: GameState, id: string) => s.people.find((p) => p.id === id) as Person;
const keeper = (s: GameState, id: string) => s.keepers.find((k) => k.id === id) as KeeperState;
function say(s: GameState, who: 'dai' | 'callum' | 'narrator', text: string) {
  s.said.push({ at: s.minute, who, kind: 'answer', text });
}
function free(s: GameState, id: 'dai' | 'callum') {
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
export function outcomeAvailable(s: GameState, task: OutcomeTask) {
  if (isKeeperScene(task)) return keeperSceneAvailable(s, task);
  if (!['handover', 'handover-test', 'correction'].includes(task)) return false;
  if (callumAway(s)) return false;
  if (s.outcomes?.keeperScenes?.active !== undefined || s.outcomes?.keeperScenes?.away !== undefined)
    return false;
  const o = s.outcomes;
  if (
    !o ||
    s.phase !== 'watch' ||
    s.radioOut ||
    s.pauseRequested ||
    o.active ||
    s.minute < (o.retryAfter ?? 0) ||
    !(s.minute % 1440 >= 1320 || s.minute % 1440 < 300)
  )
    return false;
  if (task === 'handover-test')
    return (
      o.handover.transferredAt !== undefined &&
      o.handover.completedAt === undefined &&
      free(s, 'callum') &&
      keeper(s, 'dai').on
    );
  return (
    s.discoveries[task === 'handover' ? 'dai' : 'callum'] === true &&
    !(task === 'handover' ? o.handover.transferredAt : o.correction.writtenAt) &&
    !o.correction.restFrom &&
    free(s, 'dai') &&
    free(s, 'callum')
  );
}
function aff(
  id: string,
  label: string,
  duration: number,
  advertises: Affordance['advertises'] = {},
): Affordance {
  return { id, action: id, label, duration, effort: 0.03, advertises };
}
function stop(p: Person, at: number, status: 'completed' | 'interrupted') {
  if (p.activity) finish(p, { affordanceId: p.activity.affordanceId, action: p.activity.action, at, status });
}
function choose(s: GameState, id: 'dai' | 'callum', proposed: Affordance) {
  const p = person(s, id);
  const rec = decide(
    p,
    [
      proposed,
      aff('stove', 'keep the time for ordinary duty and rest', 20, { rest: 0.25, water: 0.15, food: 0.05 }),
    ],
    { suggestion: { voiceId: 'engineer', affordanceId: proposed.id, strength: 0.6 } },
  );
  return {
    p,
    rec,
    willing: rec.chosenAffordanceId === proposed.id && rec.suggestion?.verdict === 'assented',
  };
}
export function requestOutcome(s: GameState, task: OutcomeTask) {
  if (isKeeperScene(task)) {
    requestKeeperScene(s, task);
    return;
  }
  if (!outcomeAvailable(s, task)) return;
  const o = s.outcomes as ShiftOutcomes;
  if (task === 'handover-test') {
    const proposed = aff('shift-handover-test', 'use the transferred list without Dai prompting', 10, {
      belonging: 0.25,
    });
    const c = choose(s, 'callum', proposed);
    o.retryAfter = s.minute + 20;
    if (!c.willing) {
      say(s, 'callum', 'I am not choosing to test the transferred list now. Leave it untested.');
      return;
    }
    stop(c.p, s.minute, 'interrupted');
    keeper(s, 'callum').job = null;
    if (!begin(c.p, proposed, c.rec)) return;
    o.handover.test = {
      question:
        'Using the transferred list without Dai prompting: may you use the workaround for the replaced sensor, and what must happen before you rely on it?',
      instruction: o.handover.list,
      startedAt: s.minute,
      attendees: ['callum'],
    };
    o.active = { task, from: s.minute, until: s.minute + 10, night: s.night };
    say(
      s,
      'callum',
      'I choose to work through that question alone using the transferred list. Give me about ten minutes. Dai is not taking this test with me.',
    );
    say(s, 'narrator', o.handover.test.question);
    return;
  }
  const proposed = aff(
    `shift-${task}`,
    task === 'handover'
      ? 'check the handover list together'
      : 'write the correction together before arranging rest',
    20,
    { belonging: 0.25 },
  );
  const dai = choose(s, 'dai', proposed),
    callum = choose(s, 'callum', proposed);
  o.retryAfter = s.minute + 20;
  if (!dai.willing || !callum.willing) {
    say(
      s,
      'narrator',
      'The two keepers do not both choose to make time for this now. No attendance or completed result is recorded.',
    );
    return;
  }
  for (const c of [dai, callum]) {
    stop(c.p, s.minute, 'interrupted');
    keeper(s, c.p.id).job = null;
    if (!begin(c.p, proposed, c.rec)) {
      cancelOutcome(s, 'The joint activity could not begin.');
      for (const other of [dai, callum])
        if (other.p.activity?.affordanceId === proposed.id) stop(other.p, s.minute, 'interrupted');
      return;
    }
  }
  o.active = { task, from: s.minute, until: s.minute + 20, night: s.night };
  o[task].startedAt = s.minute;
  if (task === 'correction') o.correction.originalAccount = rememberedConversation(s, 'callum') ?? undefined;
  say(
    s,
    'dai',
    task === 'handover'
      ? 'I choose to go through my retained list with Callum here in the hut. The old sensor instruction needs checking, not blind obedience.'
      : 'I can attend while Callum writes his correction. Afterwards we can each decide whether I cover duty while he rests here.',
  );
  say(
    s,
    'callum',
    task === 'handover'
      ? 'I choose to work through it with Dai. Then I will try using the corrected list without his prompting.'
      : 'I choose to write what I signed and what I left unchecked. This is a correction in the fictional shift record, not a message sent outside this game.',
  );
}
export function cancelOutcome(s: GameState, reason: string) {
  cancelKeeperScene(s, reason);
  const o = s.outcomes;
  if (!o) return;
  if (o.active) {
    const testing = o.active.task === 'handover-test';
    for (const id of testing ? ['callum'] : ['dai', 'callum']) {
      const p = person(s, id);
      if (p.activity?.affordanceId.startsWith('shift-')) stop(p, s.minute, 'interrupted');
    }
    if (testing && o.handover.test) o.handover.test.stoppedAt = s.minute;
    delete o.active;
    say(
      s,
      'narrator',
      testing
        ? `${reason} Callum’s test stopped. The joint transfer remains recorded, but no tested result is awarded.`
        : `${reason} The joint work stopped. It has no completed result.`,
    );
  }
  if (
    o.correction.restFrom !== undefined &&
    o.correction.restedAt === undefined &&
    o.correction.restStoppedAt === undefined
  ) {
    const p = person(s, 'callum');
    if (p.activity?.affordanceId === 'shift-rest') stop(p, s.minute, 'interrupted');
    o.correction.restStoppedAt = s.minute;
    say(
      s,
      'narrator',
      `${reason} Callum’s rest stopped. The written correction remains; a completed rest is not recorded.`,
    );
  }
}
/** Keep an actually attended scene/rest from being treated as a dam job. Body time still advances. */
export function outcomeOccupies(s: GameState, k: KeeperState): boolean {
  if (keeperSceneOccupies(s, k.id)) return true;
  const o = s.outcomes;
  if (!o) return false;
  if (o.active && (k.id === 'callum' || (k.id === 'dai' && o.active.task !== 'handover-test'))) return true;
  return (
    k.id === 'callum' &&
    o.correction.restFrom !== undefined &&
    o.correction.restedAt === undefined &&
    o.correction.restStoppedAt === undefined
  );
}
export function advanceOutcomes(s: GameState) {
  advanceKeeperScenes(s);
  const o = s.outcomes;
  if (!o) return;
  if (o.active) {
    const a = o.active;
    const attendees = a.task === 'handover-test' ? ['callum'] : ['dai', 'callum'];
    if (
      a.night !== s.night ||
      (a.task === 'handover-test' && (s.radioOut || !keeper(s, 'dai').on)) ||
      attendees.some(
        (id) =>
          !keeper(s, id).on ||
          keeper(s, id).place !== 'hut' ||
          person(s, id).activity?.affordanceId !== `shift-${a.task}` ||
          person(s, id).activity?.dozedAt !== undefined ||
          readDoze(person(s, id))?.asleep,
      )
    ) {
      cancelOutcome(s, 'A keeper is no longer able to attend.');
      return;
    }
    if (a.task === 'handover' && s.minute >= a.from + 10 && o.handover.sensor === 'unverified') {
      o.handover.list = o.handover.list.replace(
        'Use the workaround for the replaced sensor.',
        'Do not use the workaround for the replaced sensor. Its applicability is UNVERIFIED; get current instructions before relying on it.',
      );
      o.handover.sensor = 'marked-unverified';
      say(
        s,
        'dai',
        'We have crossed out the old instruction and kept it visible. Neither of us can establish whether that workaround applies to the replacement sensor.',
      );
    }
    if (s.minute < a.until) return;
    for (const id of attendees) stop(person(s, id), s.minute, 'completed');
    delete o.active;
    if (a.task === 'handover') {
      o.handover.transferredAt = s.minute;
      o.handover.attendees = ['dai', 'callum'];
      say(
        s,
        'narrator',
        'Both keepers completed the joint correction and transfer. Callum has not yet tested using the list alone. The handover awaits that separate test.',
      );
    } else if (a.task === 'handover-test') {
      const h = o.handover,
        test = h.test;
      if (test && test.startedAt === a.from && test.stoppedAt === undefined && test.instruction === h.list) {
        test.at = s.minute;
        test.answer =
          'I cannot use that old workaround as an instruction. I must get current instructions; this list does not verify the sensor.';
        test.action = 'withhold-unverified-workaround';
        test.passed = true;
        h.completedAt = s.minute;
        say(s, 'callum', test.answer);
        say(
          s,
          'narrator',
          'Callum completed the separate procedural test using the transferred list. He withheld the unverified instruction. This records that exercise, not sensor calibration, competence or dam safety.',
        );
      }
    } else {
      const c = o.correction;
      c.writtenAt = s.minute;
      c.signedBy = 'Callum';
      c.filedAt = s.minute;
      c.channel = 'fictional-agency-correction-register';
      c.status = 'awaiting-review';
      c.text =
        'Callum: Before this week I signed the record of a round after I checked only part of it. The signature must not be treated as evidence that I completed every check. I cannot now identify every unchecked item reliably. Nothing happened that I know of; that does not establish that nothing happened. I add this signed correction to my retained account of that round. The original round date and unchecked items are not established here. Extra checks this week do not cancel the mistake. Baby-related sleep loss also needs a separate rest arrangement.';
      say(s, 'callum', c.text);
      say(
        s,
        'narrator',
        'Callum signs and files his correction in the fictional agency correction register, linked to his retained account of the original signature. It awaits review. Nothing is sent outside this game. No employer reply or approval is recorded.',
      );
      const cover = aff('shift-cover', 'remain on duty while Callum rests in the hut', 30, {
        belonging: 0.25,
      });
      const rest = {
        ...aff('shift-rest', 'rest in the hut while Dai remains on duty', 30, { sleep: 0.6, rest: 0.4 }),
        mode: 'sleep' as const,
        action: 'sleep',
        effort: 0,
      };
      const d = choose(s, 'dai', cover),
        r = choose(s, 'callum', rest);
      if (d.willing && r.willing && begin(d.p, cover, d.rec) && begin(r.p, rest, r.rec)) {
        c.cover = 'dai';
        c.restFrom = s.minute;
        say(
          s,
          'dai',
          'I choose to remain on duty for these thirty minutes. Callum can rest in the hut. Call me for dam work; if I cannot cover, his rest must stop. This does not make the storm safe.',
        );
        say(
          s,
          'callum',
          'I choose that rest arrangement. Do not mark it complete unless I actually get the time.',
        );
      } else
        say(
          s,
          'narrator',
          'They have not both chosen the proposed rest rota. The correction is written; rest remains unarranged.',
        );
    }
  }
  const c = o.correction;
  if (c.restFrom !== undefined && c.restedAt === undefined && c.restStoppedAt === undefined) {
    const p = person(s, 'callum'),
      cover = keeper(s, 'dai');
    if (
      !cover.on ||
      readDoze(person(s, 'dai'))?.asleep ||
      person(s, 'dai').activity?.mode === 'sleep' ||
      p.activity?.affordanceId !== 'shift-rest'
    ) {
      cancelOutcome(s, 'The agreed cover or rest is no longer available.');
    } else if (s.minute >= c.restFrom + 30) {
      stop(p, s.minute, 'completed');
      c.restedAt = s.minute;
      say(
        s,
        'callum',
        'I have had the agreed thirty minutes in the hut while Dai remained on duty. That does not certify my next round or settle the correction with the agency.',
      );
    }
  }
}
