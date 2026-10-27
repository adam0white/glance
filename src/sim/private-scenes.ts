/** Finite fictional scenes, only for private-scenes-1. HF owns choice and bodily attendance. */
import {
  type Affordance,
  begin,
  decide,
  finish,
  type Person,
  readDoze,
  reviewed,
  seedVoice,
  tick,
} from '@adam0white/human-framework';
import { lifeReady, rememberedConversation } from './cast.ts';
import type { GameState } from './dam.ts';
import { hashUnit } from './rng.ts';

export type Corner = 'riverbank' | 'yard' | 'back-wall';
export type PrivateAction =
  | 'telescope'
  | 'lamp'
  | 'adjust-lamp'
  | 'post-shape'
  | 'read-fictional-reply'
  | 'appendix'
  | 'file-appendix'
  | 'close-access'
  | 'keep-access'
  | 'stop';
type Task = 'telescope' | 'lamp' | 'post-shape' | 'read-fictional-reply' | 'appendix' | 'file-appendix';
type Visitor = 'nerys' | 'bilal' | 'wren';
export interface PrivateInput {
  action: PrivateAction;
  corner?: Corner;
  shape?: 'boat' | 'rabbit';
  lamp?: 'low' | 'high';
}
interface Observation {
  at: number;
  sky: 'clear';
  object: string;
}
interface Attempt {
  action: Task;
  person: Visitor;
  from: number;
  night: number;
  attended: number;
  stoppedAt?: number;
  reason?: string;
  completedAt?: number;
  corner?: Corner;
  observations?: Observation[];
  lamp?: 'low' | 'high';
  shape?: 'boat' | 'rabbit';
  drawing?: string;
  adjustedAt?: number;
}
export interface PrivateScenes {
  premise: string;
  attempts: Attempt[];
  active?: { action: Task; index: number; until: number; returningFrom?: number; reason?: string };
  retryAfter: Partial<Record<Visitor, number>>;
  telescope: {
    startedAt?: number;
    completedAt?: number;
    corner?: Corner;
    observations: Observation[];
    notebook?: string;
  };
  lamp: {
    startedAt?: number;
    completedAt?: number;
    adjustedAt?: number;
    lamp?: 'low' | 'high';
    shape?: 'boat' | 'rabbit';
    drawing?: string;
    postStartedAt?: number;
    postedAt?: number;
    postedDrawing?: string;
    channel?: 'in-game-outgoing-post';
    fictionalReply?: {
      edition: 'fictional-reply-1';
      from: number;
      at: number;
      postedAt: number;
      postedDrawing: string;
      text: string;
    };
  };
  appendix: {
    startedAt?: number;
    draftedAt?: number;
    sourcePage?: string;
    originalAccount?: string;
    text?: string;
    signedBy?: 'Wren';
    filingStartedAt?: number;
    filedAt?: number;
    filedText?: string;
    channel?: 'in-game-survey-register';
    status?: 'awaiting-review';
  };
  access: { night: number; at: number; closed: boolean; appendix: string }[];
  decisions: { at: number; action: Task; person: Visitor; result: 'refused' | 'begin-failed' | 'began' }[];
}
export const PRIVATE_PREMISE =
  'This optional chapter adds these authored arrangements. Nerys has inn cover from 22:00 to midnight each night. Her three dark corners are the yard, back wall and riverbank beside the inn. The riverbank corner uses a small dam-owned access strip. The night desk may close only this optional private-trip access for tonight. Emergency access and Wren’s existing licensed survey permission remain available. The local sky at the inn is fictional and separate from rain over the dam catchment. Bilal can use the in-game outgoing post. Wren can file in the in-game survey register. Neither channel sends anything outside this game.';
export const newPrivateScenes = (): PrivateScenes => ({
  premise: PRIVATE_PREMISE,
  attempts: [],
  retryAfter: {},
  telescope: { observations: [] },
  lamp: {},
  appendix: {},
  access: [],
  decisions: [],
});
/** Local authored sky, not an inference from catchment rain or an astronomical ephemeris. */
export function cornerSky(seed: number, night: number, minute: number): 'rain' | 'cloud' | 'clear' {
  const q = hashUnit(seed, 0x50534b59, night, Math.floor(minute / 10));
  return q < 0.2 ? 'rain' : q < 0.55 ? 'cloud' : 'clear';
}
const whoFor = (task: Task): Visitor =>
  task === 'telescope'
    ? 'nerys'
    : task === 'lamp' || task === 'post-shape' || task === 'read-fictional-reply'
      ? 'bilal'
      : 'wren';
const duration = (task: Task) =>
  task === 'lamp'
    ? 10
    : task === 'post-shape' || task === 'read-fictional-reply' || task === 'file-appendix'
      ? 5
      : 20;
const isTask = (a: string): a is Task =>
  ['telescope', 'lamp', 'post-shape', 'read-fictional-reply', 'appendix', 'file-appendix'].includes(a);
const person = (s: GameState, id: Visitor) => s.people.find((p) => p.id === id) as Person;
function say(s: GameState, who: Visitor | 'narrator', text: string) {
  s.said.push({ at: s.minute, who, kind: 'answer', text });
}
function occupied(s: GameState, id: Visitor): string | null {
  if (!lifeReady(s, id)) return 'Their visit or own routine does not allow this work.';
  const p = person(s, id),
    k = s.keepers.find((k) => k.id === id);
  if (k?.on || (s.relief && id === 'bilal')) return 'Bilal has relief work or its travel and briefing.';
  if (p.activity || readDoze(p)?.asleep) return 'They are busy or asleep.';
  if (id === 'nerys' && s.nerys.ringing !== null) return 'Nerys must finish the pending river call.';
  return null;
}
export function privateAvailable(s: GameState, action: Task, corner: Corner = 'riverbank'): string | null {
  const o = s.privateScenes;
  if (!o) return 'This saved watch does not offer private scenes.';
  if (
    action === 'telescope' &&
    corner === 'riverbank' &&
    o.access.some((a) => a.night === s.night && a.closed)
  )
    return 'The riverbank corner is closed tonight pending review. The other two corners remain available.';
  if (s.phase !== 'watch' || s.pauseRequested || s.chapterPaused || s.radioOut)
    return 'The desk cannot arrange this now.';
  if (o.active) return 'Finish or stop the attended scene first.';
  const id = whoFor(action);
  if (!s.discoveries[id]) return 'Ask about their own interest first.';
  if (s.minute < (o.retryAfter[id] ?? 0)) return 'Give them twenty minutes before asking again.';
  const busy = occupied(s, id);
  if (busy) return busy;
  if (action === 'telescope') {
    const local = s.minute % 1440;
    if (local < 1320 || local + 20 > 1440) return 'The authored inn cover window is 22:00 to midnight.';
    if (cornerSky(s.seed, s.night, s.minute) === 'rain')
      return 'It is raining at the inn corner. Nerys will not take out the telescope.';
    if (o.telescope.completedAt !== undefined && o.telescope.observations.length)
      return 'The attended viewing is already recorded.';
  }
  if (action === 'lamp' && o.lamp.completedAt !== undefined) return 'The new shape is already retained.';
  if (
    action === 'post-shape' &&
    (!o.lamp.drawing || o.lamp.completedAt === undefined || o.lamp.postedAt !== undefined)
  )
    return 'A completed new shape is needed; a posted shape is not posted twice.';
  if (
    action === 'read-fictional-reply' &&
    (o.lamp.postedAt === undefined || !o.lamp.postedDrawing || o.lamp.fictionalReply)
  )
    return 'A completed fictional post is needed. A chosen fictional reply is read only once.';
  if (action === 'appendix' && o.appendix.draftedAt !== undefined)
    return 'Wren’s signed draft is already retained.';
  if (
    action === 'file-appendix' &&
    (!o.appendix.text || o.appendix.draftedAt === undefined || o.appendix.filedAt !== undefined)
  )
    return 'A signed draft is needed; a filed appendix is not filed twice.';
  return null;
}
function offer(task: Task): Affordance {
  const labels: Record<Task, string> = {
    telescope: 'carry, set up, view and return the telescope',
    lamp: 'play with a new shadow shape and the player-held lamp',
    'post-shape': 'prepare and post the retained drawing in the in-game outgoing post',
    'read-fictional-reply':
      'read the explicitly chosen fictional stepchild improvement to the posted drawing',
    appendix: 'prepare the honest appendix from the retained page',
    'file-appendix': 'file the signed appendix in the in-game survey register',
  };
  return {
    id: `private-${task}`,
    action: `private-${task}`,
    label: labels[task],
    duration: duration(task),
    effort: task === 'telescope' ? 0.12 : 0.03,
    advertises:
      task === 'lamp' || task === 'telescope'
        ? { leisure: 0.35, belonging: 0.2 }
        : { esteem: 0.25, belonging: 0.2 },
  };
}
const ordinary: Affordance = {
  id: 'private-keep-time',
  action: 'rest',
  label: 'keep my time for ordinary work and rest',
  duration: 20,
  effort: 0,
  advertises: { rest: 0.25, water: 0.15, food: 0.05 },
};
function stopPerson(p: Person, at: number, status: 'completed' | 'interrupted') {
  if (p.activity?.affordanceId.startsWith('private-'))
    finish(p, {
      affordanceId: p.activity.affordanceId,
      action: p.activity.action,
      at: p.activity.dozedAt ?? at,
      status,
    });
}
export function cancelPrivate(s: GameState, reason: string) {
  const o = s.privateScenes,
    active = o?.active;
  if (!o || !active) return;
  const a = o.attempts[active.index];
  if (!a) return;
  stopPerson(person(s, a.person), s.minute, 'interrupted');
  if (a.stoppedAt !== undefined) return;
  a.stoppedAt = s.minute;
  a.reason = reason;
  if (active.action === 'telescope') returnForRiver(s, reason);
  else delete o.active;
  say(
    s,
    a.person,
    `${reason} I stopped after ${a.attended} attended minutes. Keep the partial record. Do not mark this task complete.`,
  );
}
/** A river call requests a real five-minute early return, retaining the pending call. */
export function returnForRiver(s: GameState, reason = 'The river call interrupted the telescope trip.') {
  const o = s.privateScenes;
  if (o?.active?.action !== 'telescope' || o.active.returningFrom !== undefined) return;
  o.active.returningFrom = s.minute;
  o.active.reason = reason;
  o.active.until = Math.min(o.active.until, s.minute + 5);
  const p = person(s, 'nerys');
  if (p.activity) p.activity.endsAt = o.active.until;
  say(
    s,
    'nerys',
    `${reason} I am packing and returning. Allow five minutes. Any river call remains pending.`,
  );
}
export function requestPrivate(s: GameState, input: PrivateInput) {
  const o = s.privateScenes;
  if (!o) return;
  const { action } = input;
  if (action === 'stop') {
    cancelPrivate(s, 'The player stopped attending.');
    return;
  }
  if (action === 'adjust-lamp') {
    if (
      o.active?.action !== 'lamp' ||
      !['boat', 'rabbit'].includes(input.shape ?? '') ||
      !['low', 'high'].includes(input.lamp ?? '')
    )
      return;
    const a = o.attempts[o.active.index];
    if (!a) return;
    a.shape = input.shape;
    a.lamp = input.lamp;
    a.adjustedAt = s.minute;
    a.drawing =
      input.shape === 'boat'
        ? 'A folded triangle sail above a shallow curved hull.'
        : 'Two long ears above a small round head.';
    say(
      s,
      'bilal',
      `You hold the lamp ${input.lamp} and we try a new ${input.shape} silhouette. The old heron stays a separate story.`,
    );
    return;
  }
  if (action === 'close-access' || action === 'keep-access') {
    if (
      s.phase !== 'watch' ||
      s.pauseRequested ||
      o.appendix.filedAt === undefined ||
      !o.appendix.text ||
      o.access.some((a) => a.night === s.night)
    )
      return;
    const closed = action === 'close-access';
    o.access.push({ night: s.night, at: s.minute, closed, appendix: o.appendix.text });
    say(
      s,
      'narrator',
      closed
        ? 'The desk closes the optional dam-owned riverbank corner for tonight pending review. Nerys cannot start a private trip there tonight. The yard and back wall remain available. This is precaution, not a habitat finding. Emergency and licensed survey access remain unchanged.'
        : 'The desk leaves optional riverbank access unchanged tonight. The appendix remains uncertain and awaits review.',
    );
    if (closed && o.active?.action === 'telescope' && o.attempts[o.active.index]?.corner === 'riverbank')
      returnForRiver(s, 'The desk closed this optional riverbank corner.');
    return;
  }
  if (!isTask(action)) return;
  const corner = input.corner ?? 'riverbank';
  if (!['riverbank', 'yard', 'back-wall'].includes(corner)) return;
  const unavailable = privateAvailable(s, action, corner);
  if (unavailable) {
    say(s, 'narrator', unavailable);
    return;
  }
  const id = whoFor(action),
    p = person(s, id),
    proposed = offer(action);
  tick(p, s.minute);
  seedVoice(p, 'engineer', 0.5);
  const rec = decide(p, [proposed, ordinary], {
    suggestion: { voiceId: 'engineer', affordanceId: proposed.id, strength: 0.6 },
  });
  o.retryAfter[id] = s.minute + 20;
  if (rec.chosenAffordanceId !== proposed.id || rec.suggestion?.verdict !== 'assented') {
    o.decisions.push({ at: s.minute, action, person: id, result: 'refused' });
    say(s, id, 'I am keeping this time for my own work or rest. No private task has begun.');
    return;
  }
  if (!begin(p, proposed, rec)) {
    o.decisions.push({ at: s.minute, action, person: id, result: 'begin-failed' });
    return;
  }
  o.decisions.push({ at: s.minute, action, person: id, result: 'began' });
  const attempt: Attempt = {
    action,
    person: id,
    from: s.minute,
    night: s.night,
    attended: 0,
    ...(action === 'telescope' ? { corner, observations: [] } : {}),
  };
  o.attempts.push(attempt);
  o.active = { action, index: o.attempts.length - 1, until: s.minute + duration(action) };
  if (action === 'telescope') o.telescope = { startedAt: s.minute, corner, observations: [] };
  if (action === 'lamp') o.lamp.startedAt = s.minute;
  if (action === 'post-shape') o.lamp.postStartedAt = s.minute;
  if (action === 'appendix') {
    o.appendix.startedAt = s.minute;
    o.appendix.originalAccount = rememberedConversation(s, 'wren') ?? undefined;
  }
  if (action === 'file-appendix') o.appendix.filingStartedAt = s.minute;
  say(
    s,
    id,
    `I choose to ${proposed.label}. Attend for ${duration(action)} minutes. Work and weather continue. I may stop.`,
  );
}
export function advancePrivate(s: GameState) {
  const o = s.privateScenes,
    active = o?.active;
  if (!o || !active) return;
  const a = o.attempts[active.index];
  if (!a) return;
  const p = person(s, a.person);
  if (active.returningFrom !== undefined) {
    if (s.minute >= active.until) {
      if (a.stoppedAt === undefined) {
        stopPerson(p, s.minute, 'interrupted');
        a.stoppedAt = s.minute;
        a.reason = active.reason;
      }
      delete o.active;
    }
    return;
  }
  if (
    s.phase !== 'watch' ||
    s.night !== a.night ||
    s.pauseRequested ||
    s.radioOut ||
    !lifeReady(s, a.person) ||
    !p.activity ||
    p.activity.affordanceId !== `private-${a.action}` ||
    p.activity.dozedAt !== undefined ||
    readDoze(p)?.asleep ||
    (a.person === 'bilal' && (s.relief || s.keepers.some((k) => k.id === 'bilal' && k.on)))
  ) {
    cancelPrivate(s, 'Attendance or the agreed time is no longer available.');
    return;
  }
  if (a.action === 'telescope' && !active.returningFrom && cornerSky(s.seed, s.night, s.minute) === 'rain') {
    returnForRiver(s, 'Rain at the corner stopped the viewing.');
  }
  if (s.minute >= p.activity.reviewAt && s.minute < active.until) {
    const rec = decide(p, [offer(a.action), ordinary]);
    if (rec.chosenAffordanceId !== p.activity.affordanceId) {
      cancelPrivate(s, 'I choose to stop this activity.');
      return;
    }
    reviewed(p);
  }
  a.attended = s.minute - a.from;
  const elapsed = a.attended;
  if (a.action === 'telescope' && active.returningFrom === undefined && elapsed >= 5 && elapsed < 15) {
    const sky = cornerSky(s.seed, s.night, s.minute);
    if (sky === 'clear') {
      const object = hashUnit(s.seed, 0x4d4f4f4e, s.night) < 0.5 ? 'the visible moon' : 'one bright star';
      const observation: Observation = { at: s.minute, sky, object };
      a.observations?.push(observation);
      o.telescope.observations.push(observation);
      if (o.telescope.observations.length === 1)
        say(
          s,
          'nerys',
          `Through the telescope we can see ${object}. I write that direct sighting in my notebook. It is no measurement or promised meteor.`,
        );
    }
  }
  if (s.minute < active.until) return;
  if (active.reason) {
    cancelPrivate(s, `${active.reason} The five-minute return is over.`);
    return;
  }
  if (a.action === 'lamp' && (!a.drawing || a.adjustedAt === undefined)) {
    cancelPrivate(s, 'The player did not adjust the lamp and choose a new shape.');
    return;
  }
  stopPerson(p, s.minute, 'completed');
  a.completedAt = s.minute;
  delete o.active;
  if (a.action === 'telescope') {
    o.telescope.completedAt = s.minute;
    o.telescope.notebook = o.telescope.observations.length
      ? `Attended setup, viewing and return at the ${a.corner} corner. Saw ${o.telescope.observations[0]?.object} during a clear interval. No measurement recorded.`
      : 'Attended setup, viewing and return. Cloud obscured the sky during viewing. No sighting established; actual viewing remains open.';
    say(s, 'nerys', o.telescope.notebook);
  } else if (a.action === 'lamp') {
    Object.assign(o.lamp, {
      completedAt: s.minute,
      adjustedAt: a.adjustedAt,
      lamp: a.lamp,
      shape: a.shape,
      drawing: a.drawing,
    });
    say(
      s,
      'bilal',
      `We have spent ten minutes making this new shadow shape: ${a.drawing} I keep the drawing. Posting it is a separate choice.`,
    );
  } else if (a.action === 'post-shape') {
    Object.assign(o.lamp, {
      postedAt: s.minute,
      postedDrawing: o.lamp.drawing,
      channel: 'in-game-outgoing-post',
    });
    say(
      s,
      'bilal',
      'After five minutes preparing it, I post that retained drawing through the in-game outgoing post. Nothing leaves this game. There is no receipt or reply.',
    );
  } else if (a.action === 'read-fictional-reply') {
    // Scope: an explicitly recorded story choice supplies this finite fictional reply.
    // HF owns reading time and refusal; no outside sender, cognition or consent is simulated.
    const improvement =
      o.lamp.shape === 'boat'
        ? 'Put a small triangular flag above the sail. Then I can tell which way our boat is going.'
        : 'Bend one long ear sideways. Then the rabbit is listening to something beside it.';
    o.lamp.fictionalReply = {
      edition: 'fictional-reply-1',
      from: a.from,
      at: s.minute,
      postedAt: o.lamp.postedAt!,
      postedDrawing: o.lamp.postedDrawing!,
      text: `Chosen authored fiction, fictional-reply-1: the stepchild’s reply to the retained drawing says, “${improvement}” Bilal reads it and keeps the suggestion beside the original drawing. The drawing is unchanged. This is supplied story content, never a real message, receipt, family consent or reconciliation.`,
    };
    say(s, 'bilal', o.lamp.fictionalReply.text);
  } else if (a.action === 'appendix') {
    Object.assign(o.appendix, {
      draftedAt: s.minute,
      signedBy: 'Wren',
      sourcePage: 'retained page from the early survey; identifier not supplied',
      text: 'Wren: I omitted an observation with an unclear meaning from an early report. I retained the source page. In this record the observation detail, species, date, location and measurement are unknown. The page identifier is not supplied. This appendix records the omission and the limits of this account. It establishes no habitat finding. The original account and retained page remain unchanged.',
    });
    say(s, 'wren', `${o.appendix.text} This signed draft is not filed yet.`);
  } else {
    Object.assign(o.appendix, {
      filedAt: s.minute,
      filedText: o.appendix.text,
      channel: 'in-game-survey-register',
      status: 'awaiting-review',
    });
    say(
      s,
      'wren',
      'I have spent five minutes filing the exact signed appendix in the in-game survey register. It awaits review. No approval or habitat finding follows. The desk can now decide tonight’s optional riverbank access.',
    );
  }
}
