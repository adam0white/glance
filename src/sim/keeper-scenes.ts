/** Chosen finite fiction, never an employer/family consent adapter. HF owns participation.
 * No new state or HF calls occur until a new action is recorded. Old watches continue exactly.
 */
import { type Affordance, begin, decide, finish, type Person, readDoze } from '@adam0white/human-framework';
import type { GameState } from './dam.ts';

export type KeeperSceneAction =
  | 'dai-proposal'
  | 'callum-proposal'
  | 'dai-fictional-response'
  | 'callum-fictional-responses'
  | 'daughter-voicemail'
  | 'daughter-invitation'
  | 'daughter-visit'
  | 'daughter-return'
  | 'stop-family';
type Task = Exclude<KeeperSceneAction, 'daughter-invitation' | 'stop-family'>;
interface Attempt {
  action: Task;
  from: number;
  until: number;
  night: number;
  participants: ('dai' | 'callum')[];
  attended: number;
  arrivedAt?: number;
  stoppedAt?: number;
  reason?: string;
  returnedAt?: number;
  completedAt?: number;
}
interface Proposal {
  startedAt: number;
  at: number;
  text: string;
  status: 'proposal-awaiting-response';
  costs: {
    writingMinutes: 20;
    coverMinutes?: 40;
    retirementDate?: null;
    requestedHomeRestMinutes?: 120;
    possibleLostShiftMinutes?: 120;
  };
  responses: { agency: 'unsupplied'; partner?: 'unsupplied' };
}
export interface KeeperScenes {
  attempts: Attempt[];
  active?: number;
  away?: number;
  retryAfter: number;
  daiProposal?: Proposal;
  callumProposal?: Proposal;
  voicemail?: { at: number; text: string };
  invitation?: { at: number; night: number; until: number; text: string };
  fictionalResponses?: Partial<
    Record<
      'dai' | 'callum',
      {
        edition: 'fictional-response-1';
        from: number;
        at: number;
        proposalAt: number;
        text: string;
      }
    >
  >;
  decisions: { at: number; action: Task; result: 'refused' | 'begin-failed' | 'began' }[];
}
const actions: string[] = [
  'dai-proposal',
  'callum-proposal',
  'dai-fictional-response',
  'callum-fictional-responses',
  'daughter-voicemail',
  'daughter-invitation',
  'daughter-visit',
  'daughter-return',
  'stop-family',
];
export const isKeeperScene = (task: string): task is KeeperSceneAction => actions.includes(task);
const record = (s: GameState) => s.outcomes?.keeperScenes;
const person = (s: GameState, id: string) => s.people.find((p) => p.id === id) as Person;
const keeper = (s: GameState, id: string) => s.keepers.find((k) => k.id === id)!;
const say = (s: GameState, text: string) =>
  s.said.push({ at: s.minute, who: 'narrator', kind: 'answer', text });
export const daiAway = (s: GameState) => record(s)?.away !== undefined;
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
function oldRest(s: GameState) {
  const c = s.outcomes?.correction;
  return c?.restFrom !== undefined && c.restedAt === undefined && c.restStoppedAt === undefined;
}
export function keeperSceneAvailable(s: GameState, action: KeeperSceneAction) {
  const f = record(s);
  if (!s.outcomes || s.phase !== 'watch') return false;
  if (action === 'stop-family') return f?.active !== undefined;
  if (s.radioOut || s.pauseRequested || s.chapterPaused || s.outcomes.active || oldRest(s)) return false;
  if (action === 'daughter-return')
    return (
      f?.away !== undefined &&
      f.active === undefined &&
      (!person(s, 'dai').activity || ['stove', 'doze'].includes(person(s, 'dai').activity!.affordanceId)) &&
      !readDoze(person(s, 'dai'))?.asleep
    );
  if (f?.active !== undefined || f?.away !== undefined) return false;
  if (action === 'daughter-invitation')
    return !!f?.voicemail && (f.invitation?.night !== s.night || s.minute > f.invitation.until);
  if (s.minute < (f?.retryAfter ?? 0)) return false;
  if (!free(s, 'dai') || !free(s, 'callum') || !(s.minute % 1440 >= 1320 || s.minute % 1440 < 280))
    return false;
  if (action === 'dai-fictional-response') return !!f?.daiProposal && !f.fictionalResponses?.dai;
  if (action === 'callum-fictional-responses') return !!f?.callumProposal && !f.fictionalResponses?.callum;
  if (action === 'dai-proposal') return !!s.discoveries.dai && !f?.daiProposal;
  if (action === 'callum-proposal') return !!s.discoveries.callum && !f?.callumProposal;
  if (action === 'daughter-voicemail') return !!s.discoveries.dai && !f?.voicemail;
  return (
    f?.invitation?.night === s.night &&
    s.minute + 40 <= f.invitation.until &&
    !f.attempts.some((a) => a.action === 'daughter-visit' && a.completedAt !== undefined)
  );
}
const offer = (id: string, label: string, duration: number): Affordance => ({
  id,
  action: id,
  label,
  duration,
  effort: 0.03,
  advertises: { belonging: 0.25 },
});
function stop(p: Person, at: number, status: 'interrupted' | 'completed') {
  if (p.activity) finish(p, { affordanceId: p.activity.affordanceId, action: p.activity.action, at, status });
}
export function requestKeeperScene(s: GameState, action: KeeperSceneAction) {
  if (!keeperSceneAvailable(s, action)) return;
  if (action === 'stop-family') {
    cancelKeeperScene(s, 'The player stopped the scene.');
    return;
  }
  s.outcomes!.keeperScenes ??= { attempts: [], retryAfter: 0, decisions: [] };
  const f = s.outcomes!.keeperScenes;
  if (action === 'daughter-invitation') {
    f.invitation = {
      at: s.minute,
      night: s.night,
      until: s.minute + 100,
      text: 'For this chosen fictional scene, Dai’s daughter offers a short visit nearby tonight. This is a supplied story invitation, not a real reply or a new foreground person. She has not forgiven the missed visits or agreed to any future plan.',
    };
    say(s, f.invitation.text);
    return;
  }
  const duration =
    action === 'daughter-visit'
      ? 40
      : action === 'daughter-return'
        ? 10
        : ['daughter-voicemail', 'dai-fictional-response', 'callum-fictional-responses'].includes(action)
          ? 5
          : 20;
  const ids: ('dai' | 'callum')[] =
    action === 'daughter-return' || action === 'daughter-voicemail' ? ['dai'] : ['dai', 'callum'];
  const selections = ids.map((id) => {
    const p = person(s, id);
    const proposed = offer(
      id === 'callum' && action === 'daughter-visit' ? 'family-cover' : `family-${action}`,
      id === 'callum' && action === 'daughter-visit'
        ? 'remain available for dam duty while Dai visits his daughter'
        : action.replaceAll('-', ' '),
      duration,
    );
    const rec = decide(
      p,
      [
        proposed,
        {
          ...offer('stove', 'keep the time for duty and rest', 20),
          advertises: { rest: 0.25, water: 0.15, food: 0.05 },
        },
      ],
      { suggestion: { voiceId: 'engineer', affordanceId: proposed.id, strength: 0.6 } },
    );
    return {
      p,
      proposed,
      rec,
      willing: rec.chosenAffordanceId === proposed.id && rec.suggestion?.verdict === 'assented',
    };
  });
  f.retryAfter = s.minute + 10;
  if (selections.some((c) => !c.willing)) {
    f.decisions.push({ at: s.minute, action, result: 'refused' });
    say(
      s,
      'The invited keepers do not all choose this now. No scene, cover or completed result is recorded.',
    );
    return;
  }
  for (const c of selections) {
    stop(c.p, s.minute, 'interrupted');
    keeper(s, c.p.id).job = null;
    if (!begin(c.p, c.proposed, c.rec)) {
      for (const other of selections)
        if (other.p.activity?.affordanceId.startsWith('family-')) stop(other.p, s.minute, 'interrupted');
      f.decisions.push({ at: s.minute, action, result: 'begin-failed' });
      return;
    }
  }
  const a: Attempt = {
    action,
    from: s.minute,
    until: s.minute + duration,
    night: s.night,
    participants: ids,
    attended: 0,
  };
  f.active = f.attempts.push(a) - 1;
  if (action === 'daughter-visit') f.away = f.active;
  f.decisions.push({ at: s.minute, action, result: 'began' });
  say(
    s,
    action === 'daughter-visit'
      ? 'Dai leaves work for the chosen visit. He has ten minutes to walk there, twenty to attend and ten to return. Callum chooses to remain available for dam duty. This cover is not a safety guarantee.'
      : action === 'daughter-return'
        ? 'Dai chooses the ten-minute walk back. He cannot do dam work until he arrives.'
        : 'The keepers choose to make time for this scene. Duty can interrupt it; no completed result is recorded yet.',
  );
}
export function keeperSceneOccupies(s: GameState, id: string) {
  const f = record(s);
  if (!f) return false;
  if (id === 'dai' && f.away !== undefined) return true;
  const a = f.active === undefined ? undefined : f.attempts[f.active];
  return !!a?.participants.includes(id as 'dai' | 'callum');
}
export function cancelKeeperScene(s: GameState, reason: string) {
  const f = record(s);
  if (!f || f.active === undefined) return;
  const a = f.attempts[f.active]!;
  a.stoppedAt = s.minute;
  a.reason = reason;
  for (const id of a.participants)
    if (person(s, id).activity?.affordanceId.startsWith('family-'))
      stop(person(s, id), s.minute, 'interrupted');
  delete f.active;
  say(
    s,
    `${reason} The scene stopped without completion.${f.away !== undefined ? ' Dai is still away. A separate chosen return takes ten minutes; he cannot work the dam from there.' : ''}`,
  );
}
/** Public duty cannot teleport the absent keeper to a gauge or wheel. */
export function recallDai(s: GameState) {
  if (!daiAway(s)) return false;
  cancelKeeperScene(s, 'The desk called Dai back for duty.');
  requestKeeperScene(s, 'daughter-return');
  say(
    s,
    'Dai is away from the dam. No dam job has been queued for him. Wait for his actual return, or call the keeper who is on site.',
  );
  return true;
}
export function advanceKeeperScenes(s: GameState) {
  const f = record(s);
  if (!f) return;
  if (f.away !== undefined && f.attempts[f.away]!.night !== s.night) {
    delete f.away;
    say(
      s,
      'The next watch’s ordinary home and arrival routine has brought Dai back to duty. The interrupted visit remains incomplete; no return or family outcome is added to it.',
    );
  }
  if (f.active === undefined) return;
  const a = f.attempts[f.active]!;
  if (
    a.night !== s.night ||
    s.radioOut ||
    a.participants.some(
      (id) =>
        !keeper(s, id).on ||
        keeper(s, id).pending ||
        keeper(s, id).deferred ||
        keeper(s, id).job ||
        readDoze(person(s, id))?.asleep ||
        person(s, id).activity?.dozedAt !== undefined ||
        person(s, id).activity?.affordanceId !==
          (id === 'callum' && a.action === 'daughter-visit' ? 'family-cover' : `family-${a.action}`),
    )
  ) {
    cancelKeeperScene(s, 'Duty, radio loss or lost participation interrupts the arrangement.');
    return;
  }
  if (a.action === 'daughter-visit') {
    if (s.minute === a.from + 10) {
      a.arrivedAt = s.minute;
      say(
        s,
        'Dai arrives for the fictional visit. His daughter has put two mugs on the table. He says, “I kept your message. I was trying to decide what you meant instead of answering it.” She says, “You are here now. I did not ask for a weather report.” Attendance begins now. Her feelings and any future agreement remain unknown.',
      );
    }
    if (s.minute > a.from + 10 && s.minute <= a.from + 30) a.attended++;
    if (s.minute === a.from + 30)
      say(
        s,
        'The twenty-minute visit has ended. Dai starts the ten-minute walk back. No reconciliation or future family agreement is awarded.',
      );
  }
  if (s.minute < a.until) return;
  for (const id of a.participants) stop(person(s, id), s.minute, 'completed');
  delete f.active;
  a.completedAt = s.minute;
  if (a.action === 'daughter-return') {
    const trip = f.away === undefined ? undefined : f.attempts[f.away];
    if (trip) trip.returnedAt = s.minute;
    delete f.away;
    say(
      s,
      'Dai has completed the ten-minute return and is back at the hut. The interrupted visit remains incomplete.',
    );
  } else if (a.action === 'daughter-visit') {
    a.returnedAt = s.minute;
    delete f.away;
    say(
      s,
      'Dai is back at work after the actual walk, twenty-minute attended visit and return. His daughter’s feelings remain unresolved. The visit gives no retirement approval or guarantee of another visit.',
    );
  } else if (a.action === 'daughter-voicemail') {
    f.voicemail = {
      at: s.minute,
      text: 'Dai plays the voicemail he kept: “Please stop apologising for an absence you have already chosen.” He has not replied because he cannot tell whether his daughter is angry or has stopped asking. Playing it is not a new reply or an attended visit.',
    };
    say(s, f.voicemail.text);
  } else if (a.action === 'dai-fictional-response' || a.action === 'callum-fictional-responses') {
    // Scope: chosen finite fictional answers, not an employer/partner consent process.
    // A refusal resolves the reading only; actual duty, pay, travel and rest costs remain.
    const dai = a.action === 'dai-fictional-response';
    const proposal = dai ? f.daiProposal! : f.callumProposal!;
    f.fictionalResponses ??= {};
    const response = {
      edition: 'fictional-response-1' as const,
      from: a.from,
      at: s.minute,
      proposalAt: proposal.at,
      text: dai
        ? 'Chosen authored fiction, fictional-response-1. Agency: “No longer leave or retirement is approved. We have not supplied a qualified replacement, retirement date or pay terms. Keep the proposal open for a staffed rota discussion.” The keepers read this refusal. Dai remains responsible for his actual dam duty and any separately arranged visit, cover, travel and return. No residency or retirement is awarded. Nothing was sent outside this game.'
        : 'Chosen authored fiction, fictional-response-1. Agency: “We cannot remove those two future shift hours without staffed cover. No rota or pay change is approved.” Partner: “I cannot agree to that two-hour slot. The baby still needs care then. We need a different plan.” The keepers read these refusals. The earlier round record and its correction remain separate from these replies. The proposal remains open; no shared care, completed home rest, paid relief or clinical improvement is awarded. Nothing was sent outside this game.',
    };
    f.fictionalResponses[dai ? 'dai' : 'callum'] = response;
    say(s, response.text);
  } else {
    const dai = a.action === 'dai-proposal';
    const proposal: Proposal = {
      startedAt: a.from,
      at: s.minute,
      status: 'proposal-awaiting-response',
      costs: dai
        ? { writingMinutes: 20, coverMinutes: 40, retirementDate: null }
        : { writingMinutes: 20, requestedHomeRestMinutes: 120, possibleLostShiftMinutes: 120 },
      responses: dai ? { agency: 'unsupplied' } : { agency: 'unsupplied', partner: 'unsupplied' },
      text: dai
        ? 'Dai proposes a forty-minute covered family visit, followed by a separate discussion of leave or retirement. Callum would reserve forty minutes for duty instead of possible rest. The agency must supply a staffed rota before any longer absence or residency. No retirement date, replacement, pay or approval is established. This draft does not release Dai from duty.'
        : 'Callum proposes reporting the sleep loss, keeping the signed correction open and asking the agency to remove the last two hours of a future shift if staffed cover can be supplied. That could cost two paid hours; the rate and replacement remain unknown. He asks his partner to discuss a protected two-hour home-rest period, with baby care shared only if they agree. No partner agreement, agency reply, home rest or medical improvement is recorded. If cover is absent, he must escalate the limitation rather than silently leave duty.',
    };
    if (dai) f.daiProposal = proposal;
    else f.callumProposal = proposal;
    say(s, proposal.text);
    say(
      s,
      'This costed proposal awaits the stated responses. It has not been approved or put into effect. Nothing is sent outside this game.',
    );
  }
}
