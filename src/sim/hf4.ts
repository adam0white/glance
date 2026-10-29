/** SCOPE: one public HF4 Run owns all five people. Views are immutable inspections;
 * the host owns physical jobs and supplies real request-stage receipts. */
import {
  type ActionResolution,
  createPerson,
  createRun,
  DEFAULT_NORMS,
  type DeepReadonly,
  exportRun,
  exportRunJournal,
  type Input,
  inspect,
  type Offer,
  type PersonAuthoring,
  type PersonView,
  preview,
  type Result,
  type Run,
  type RunArchive,
  type RunSpec,
  replay,
  restoreRun,
  type StepResult,
  step,
} from '@adam0white/human-framework';
import framework from '@adam0white/human-framework/package.json' with { type: 'json' };
import { canonicalCast } from '@adam0white/lab-client';
import type {
  Activity,
  Affordance,
  BodyReadout,
  DecisionRecord,
  Outcome,
  Percept,
  Person,
  Suggestion,
  SuggestionResolution,
} from './actor-view.ts';
import { displayBody, displayForecast } from './display.ts';
import { authoredPerson } from './hf4-authoring.ts';

export type {
  Activity,
  Affordance,
  DecisionRecord,
  Outcome,
  Percept,
  Person,
  PersonSpec,
  Suggestion,
  SuggestionResolution,
} from './actor-view.ts';
export const FRAMEWORK_VERSION = framework.version,
  MINUTE = 60000;
const HOST = { type: 'host' as const, id: 'glance' };
const ids = ['dai', 'callum', 'nerys', 'bilal', 'wren'] as const;
const castIds = [
  'hf.cast.dai.glance',
  'hf.cast.callum.glance',
  'hf.cast.nerys.glance',
  'hf.cast.bilal.rope',
  'hf.cast.wren.rope',
];
const actions = [
  'level',
  'weir',
  'gate',
  'stove',
  'nap',
  'clear',
  'sleep',
  'rest',
  'wait',
  'eat',
  'drink',
  'meal',
  'walk',
  'watch',
  'talk',
  'visit',
  'write',
  'listen',
  'read',
  'view',
  'cover',
  'handover',
  'correction',
  'shift',
  'family',
  'private',
  'rota',
  'telescope',
  'post',
  'relief',
  'work',
  'sky-walk',
  'sky-watch',
  'sky-return',
];
const need = <T>(r: Result<T>): T => {
  if (!r.ok) throw Error(`${r.error.code} ${r.error.path}: ${r.error.message}`);
  return r.value;
};
const immutable = <T>(v: T): T => {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) immutable(x);
    Object.freeze(v);
  }
  return v;
};
type SuggestionData = Extract<
  Extract<Input, { kind: 'suggestion.received' }>['payload']['received'],
  { kind: 'ordinary' }
>['suggestion'];
type HostPart = Extract<PersonView, { kind: 'host' }>['parts'][number];
type Work = { id: string; person: string; offer: Offer; at: number; decision?: DecisionRecord };
export type WatchArchive = {
  format: 'glance-hf4/1';
  run: DeepReadonly<RunArchive>;
  sequence: number;
  revision: number;
  offers: [string, Offer[]][];
  offerRevisions: [string, number][];
  requestedAdvice: [string, SuggestionData][];
  active: Work[];
  decisions: [string, DecisionRecord][];
  outcomes: [string, Outcome][];
  delivered: [string, { activity: Work; outcome: Outcome }][];
  pending?: DeepReadonly<StepResult>;
  target: number;
  reviewLines: [string, string][];
};
const links = new WeakMap<Person, Watch>();
export class Watch {
  run: Run;
  at: number;
  target: number;
  sequence = 0;
  revision = 0;
  people: Person[] = [];
  offers = new Map<string, Offer[]>();
  offerRevisions = new Map<string, number>();
  requestedAdvice = new Map<string, SuggestionData>();
  active: Work[] = [];
  reviewLines = new Map<string, string>();
  decisions = new Map<string, DecisionRecord>();
  outcomes = new Map<string, Outcome>();
  delivered = new Map<string, { activity: Work; outcome: Outcome }>();
  pending?: DeepReadonly<StepResult>;
  starting = new Map<string, { offer: string; assent: boolean }>();
  deciding = new Set<string>();
  constructor(seed: number, start = 900 * MINUTE, facts: RunSpec['world']['facts'] = []) {
    const spec: RunSpec = {
      id: `glance:${seed}`,
      seed,
      start,
      host: { id: 'glance', edition: 'glance-hf414-1', schema: 'glance-run/1' },
      definitions: {
        actions: actions.map((id) => ({
          id,
          label: id,
          demands: { effort: 0, focus: 0, mode: 'awake', requires: {} },
          tags: [],
          norms: [],
        })),
        norms: DEFAULT_NORMS,
        marriageCustoms: [],
        skills: [
          { id: 'gate', label: 'gate work', domain: 'motor' },
          { id: 'gauges', label: 'gauge reading', domain: 'knowledge' },
        ],
        skillTransfers: [],
        methods: [],
        routines: [],
        sources: [
          HOST,
          { type: 'voice', id: 'engineer' },
          ...ids.map((id) => ({ type: 'person' as const, id })),
        ],
        lexicon: {
          names: Object.fromEntries(ids.map((id, i) => [id, canonicalCast(castIds[i]!).name])),
          roles: { engineer: 'the desk' },
          prefer: 'name',
          wordings: {
            'suggestion.resolved': ['{verdict}{reason}'],
            'verdict.assented': ['Yes, I’ll do that.', 'I’ll do that.'],
            'verdict.complied': ['I’ll do it if you say so.'],
            'verdict.cannot': ['I can’t do that yet.'],
            'verdict.refused': ['No, I won’t do that.'],
            'verdict.deferred': ['I’ll do {alternative} first.'],
            'verdict.deferred.later': ['I’ll leave that until later.'],
            'verdict.modified': ['I’ll do {alternative} instead.'],
            'verdict.commanded': ['I’ll follow the order.'],
            'reason.capacity': ['I cannot manage it physically.'],
            'reason.busy': ['I’m doing something else right now.'],
            'reason.distrust': ['I don’t trust that advice.'],
            'reason.commanded': ['That is an order.'],
            'reason.command': ['That is an order.'],
            'reason.need:sleep': ['I need sleep.'],
            'reason.need:rest': ['I need rest.'],
            'reason.need:food': ['I need food.'],
            'reason.need:water': ['I need water.'],
          },
          voices: {
            callum: {
              'verdict.assented': ['I’ll do it, sir.', 'I’ll go now, sir.'],
              'verdict.complied': ['I’ll do it if you say so, sir.'],
              'verdict.cannot': ['I can’t do that yet, sir.'],
              'verdict.refused': ['No, I won’t do that, sir.'],
              'verdict.deferred': ['I’ll do {alternative} first, sir.'],
              'verdict.deferred.later': ['I’ll leave that until later, sir.'],
              'verdict.modified': ['I’ll do {alternative} instead, sir.'],
              'verdict.commanded': ['I’ll follow the order, sir.'],
            },
            bilal: {
              'verdict.assented': ['I can do that.'],
              'verdict.complied': ['I’ll do as you ask.'],
              'verdict.cannot': ['I cannot do that yet.'],
            },
          },
          actions: Object.fromEntries(
            Object.entries({
              level: ['read the level', 'read the level', 'reading the level'],
              weir: ['read the weir board', 'read the weir board', 'reading the weir board'],
              gate: ['work the gate wheel', 'worked the gate wheel', 'working the gate wheel'],
              stove: ['sit by the stove', 'sat by the stove', 'sitting by the stove'],
              clear: ['clear the debris screen', 'cleared the debris screen', 'clearing the debris screen'],
              sleep: ['sleep', 'slept', 'sleeping'],
              nap: ['take a nap', 'took a nap', 'taking a nap'],
              meal: ['have a meal', 'had a meal', 'having a meal'],
              walk: ['walk', 'walked', 'walking'],
              wait: ['keep this time free', 'kept this time free', 'keeping this time free'],
              rest: ['rest', 'rested', 'resting'],
              work: ['travel for the briefing', 'travelled for the briefing', 'travelling for the briefing'],
              shift: ['attend the joint work', 'attended the joint work', 'attending the joint work'],
              family: [
                'attend to this family matter',
                'attended to this family matter',
                'attending to this family matter',
              ],
              private: [
                'take part in this activity',
                'took part in this activity',
                'taking part in this activity',
              ],
              rota: ['follow the agreed rota', 'followed the agreed rota', 'following the agreed rota'],
              read: ['read', 'read', 'reading'],
              watch: [
                'remain available for duty',
                'remained available for duty',
                'remaining available for duty',
              ],
              view: ['watch the sky', 'watched the sky', 'watching the sky'],
              'sky-walk': [
                'carry the telescope to the back wall',
                'carried the telescope to the back wall',
                'carrying the telescope to the back wall',
              ],
              'sky-watch': [
                'watch the sky at the back wall',
                'watched the sky at the back wall',
                'watching the sky at the back wall',
              ],
              'sky-return': [
                'carry the telescope back to the inn',
                'carried the telescope back to the inn',
                'carrying the telescope back to the inn',
              ],
              talk: ['talk', 'talked', 'talking'],
              visit: ['attend the visit', 'attended the visit', 'attending the visit'],
              write: ['write', 'wrote', 'writing'],
              listen: ['listen', 'listened', 'listening'],
              post: ['prepare the post', 'prepared the post', 'preparing the post'],
              relief: ['cover the gauge rounds', 'covered the gauge rounds', 'covering the gauge rounds'],
              eat: ['eat', 'ate', 'eating'],
              drink: ['drink', 'drank', 'drinking'],
            }).map(([id, [base, past, gerund]]) => [id, { base, past, gerund }]),
          ),
        },
        calendar: {
          id: 'glance-calendar',
          epoch: { id: 'glance-local', simulationAt: 0, dayIndex: 0, msOfDay: 0 },
          dayMs: 86400000,
          days: Array.from({ length: 14 }, (_, dayIndex) => ({
            dayIndex,
            start: dayIndex * 86400000,
            windows: [],
          })),
        },
      },
      lifecycle: { kinPremises: [], kinScopes: [] },
      world: { revision: 0, facts, hostState: { active: [] } },
    };
    this.run = need(createRun(spec));
    this.at = start;
    this.target = start;
  }
  input<K extends Input['kind']>(
    kind: K,
    payload: Extract<Input, { kind: K }>['payload'],
    at = this.at + 1,
  ): Input {
    return {
      id: `glance:${String(++this.sequence).padStart(12, '0')}`,
      at,
      source: HOST,
      kind,
      payload: structuredClone(payload),
    } as Input;
  }
  part<K extends HostPart['select']>(id: string, key: K): { [P in HostPart as P['select']]: P['value'] }[K] {
    const r = need(inspect(this.run, { perspective: { kind: 'host' }, people: [id], select: [key] }));
    const person = r.people[0];
    if (person?.kind !== 'host') throw Error('Missing actor inspection');
    const v = person.parts.find((x) => x.select === key);
    if (!v) throw Error('Missing actor part');
    return immutable(structuredClone(v.value)) as { [P in HostPart as P['select']]: P['value'] }[K];
  }
  view(id: string): Person {
    const c = this;
    const p = Object.freeze({
      id,
      get name() {
        return c.part(id, 'summary').name;
      },
      get readings() {
        return immutable({
          condition: c.part(id, 'condition'),
          affect: c.part(id, 'affect'),
          expectations: c.part(id, 'expectations'),
          needs: c.part(id, 'needs'),
        });
      },
      engine: FRAMEWORK_VERSION,
      schema: 'hf-run/7',
      get now() {
        return c.at / MINUTE;
      },
      get life() {
        const a = c.authored(id);
        return immutable({ bornAt: a.identity.birthAt / MINUTE });
      },
      get body() {
        return c.part(id, 'body').state;
      },
      get traits() {
        return c.part(id, 'traits');
      },
      get skills() {
        return immutable(
          Object.fromEntries(c.part(id, 'skills').map((x) => [x.id, { level: x.competence }])),
        );
      },
      get agenda() {
        const a = structuredClone(c.part(id, 'agenda'));
        for (const x of a.commitments) {
          x.from /= MINUTE;
          x.until /= MINUTE;
        }
        return immutable(a);
      },
      get will() {
        return immutable({ voices: c.part(id, 'relationships').voices });
      },
      get review() {
        return c.part(id, 'review');
      },
      get activity() {
        const delivered = c.delivered.get(id);
        const w =
          c.active.find((a) => a.person === id) ??
          (delivered?.outcome.status === 'completed' ? delivered.activity : undefined);
        if (!w) return null;
        return immutable({
          id: w.id,
          affordanceId: w.offer.id,
          action: w.offer.actionId,
          ...(w.offer.target ? { targetId: w.offer.target } : {}),
          startedAt: w.at / MINUTE,
          endsAt: (w.at + w.offer.durationMs) / MINUTE,
          reviewAt: (w.at + w.offer.durationMs) / MINUTE,
          effort: w.offer.demands.effort,
          mode: w.offer.demands.mode,
          protest: w.decision?.suggestion?.verdict === 'complied',
          ...(c.part(id, 'body').state.doze?.since !== undefined
            ? { dozedAt: c.part(id, 'body').state.doze!.since! / MINUTE }
            : {}),
        });
      },
      get trace() {
        return immutable([...c.decisions.values()].filter((x) => x === c.decisions.get(id)));
      },
    }) as unknown as Person;
    links.set(p, this);
    return p;
  }
  authors: PersonAuthoring[] = [];
  authored(id: string) {
    const p = this.authors.find((p) => p.id === id);
    if (!p) throw Error('Unknown authored actor');
    return p;
  }
  serve(until: number, inputs: Input[] = []) {
    this.target = Math.max(this.target, until);
    let result: DeepReadonly<StepResult> = inputs.length
      ? need(step(this.run, { until: Math.max(until, this.at), inputs }))
      : (this.pending ?? need(step(this.run, { until: Math.max(until, this.at), inputs: [] })));
    const events: DeepReadonly<StepResult>['events'][number][] = [];
    for (let n = 0; n < 10000; n++) {
      this.at = result.at;
      events.push(...result.events);
      for (const e of result.events)
        if (e.person && e.data.kind === 'review')
          this.reviewLines.set(e.person, e.narration.map((x) => x.text).join(' '));
      for (const e of result.events)
        if (e.person && e.data.kind === 'decision')
          this.decisions.set(e.person, {
            ...e.data.decision,
            at: e.at / MINUTE,
            narration: e.narration.map((x) => x.text).join(' '),
            ...(e.data.decision.suggestion
              ? {
                  suggestion: {
                    ...e.data.decision.suggestion,
                    says: e.narration.map((x) => x.text).join(' '),
                  },
                }
              : {}),
          } as DecisionRecord);
      for (const e of result.events)
        if (e.person && e.data.kind === 'suggestion-resolved') {
          const decision = this.decisions.get(e.person);
          if (decision?.suggestion && decision.id === e.data.decisionId)
            decision.suggestion.says = e.narration.map((x) => x.text).join(' ');
        }
      if (result.boundary.type === 'until') {
        this.pending = undefined;
        return { ...result, events };
      }
      this.pending = { ...result, events: [] };
      // Accepting a local physical start schedules its host-duration boundary.
      // At that reached boundary supply the actual completed/interrupt receipt.
      // Keep start requests pending until the host commits conditional attendance.
      // Delivered receipts remain visible until the owning host scene consumes them.
      const ready = result.boundary.requests.filter(
        (r) =>
          r.kind === 'communication' ||
          (r.stage === 'start' ? !this.deciding.has(r.person) || this.starting.has(r.person) : true),
      );
      if (!ready.length) return { ...result, events };
      let rev = this.revision;
      const work = [...this.active],
        done = new Map(this.delivered);
      const receipt = ready.map((r) => {
        if (r.kind === 'communication')
          return this.input(
            'communication.resolved',
            {
              requestId: r.id,
              requestHash: r.requestHash,
              worldRevision: rev,
              speaker: r.speaker,
              emittedItemIds: r.items.map((x) => x.id),
              received: [],
            },
            r.boundaryAt,
          );
        const base = {
          requestId: r.id,
          requestHash: r.requestHash,
          person: r.person,
          activityId: r.activityId,
          stage: r.stage,
          worldRevision: rev,
        };
        let v: ActionResolution;
        if (
          r.stage === 'start' &&
          (this.starting.get(r.person)?.offer !== r.offerId ||
            (this.starting.get(r.person)?.assent &&
              this.decisions.get(r.person)?.suggestion?.verdict !== 'assented'))
        ) {
          return this.input(
            'action.resolved',
            { ...base, disposition: 'rejected', observations: [] },
            r.boundaryAt,
          );
        }
        if (r.stage === 'start') {
          const o = this.offers.get(r.person)?.find((o) => o.id === r.offerId);
          if (!o) throw Error('Unknown requested physical offer');
          work.push({
            id: r.activityId,
            person: r.person,
            offer: o,
            at: r.boundaryAt,
            decision: this.decisions.get(r.person),
          });
          done.delete(r.person);
          v = { ...base, disposition: 'accepted', observations: [] };
        } else {
          const i = work.findIndex((a) => a.id === r.activityId),
            a = work[i];
          if (!a) throw Error('Unknown physical activity');
          work.splice(i, 1);
          const out = this.outcomes.get(a.id) ?? {
            action: a.offer.actionId,
            at: r.boundaryAt / MINUTE,
            status: r.stage === 'finish' ? ('completed' as const) : ('interrupted' as const),
            // Only these real supplied resources belong to the local physical
            // routine. Advertised psychological benefit is never a receipt.
            ...(['meal', 'stove'].includes(a.offer.id)
              ? { needs: a.offer.id === 'meal' ? { food: 0.6, water: 0.6 } : { food: 0.05, water: 0.15 } }
              : {}),
          };
          const status =
            r.stage === 'interrupt' ? 'interrupted' : out.status === 'failed' ? 'failed' : 'completed';
          done.set(a.person, { activity: a, outcome: { ...out, status } });
          v = {
            ...base,
            disposition: status,
            observations: [],
            outcome: {
              activityId: a.id,
              offerId: a.offer.id,
              actionId: a.offer.actionId,
              start: a.at,
              end: r.boundaryAt,
              status,
              evidenceId: `physical:${r.id}`,
              summary: out.summary ?? `${a.offer.label}: ${status}`,
              actual: {
                exposures: [],
                observedProgress: [],
                ...(status === 'completed' && a.offer.id === 'relief-briefing'
                  ? { material: a.offer.expected.material ?? 0 }
                  : {}),
                ...(status === 'completed' && out.needs
                  ? { consumed: { food: out.needs.food ?? 0, water: out.needs.water ?? 0 } }
                  : {}),
              },
              fulfills: status === 'completed' ? a.offer.fulfills : [],
              advances: [],
            },
          };
        }
        v.worldChange = {
          expectedRevision: rev,
          revision: ++rev,
          put: [],
          remove: [],
          hostState: {
            active: work.map((a) => ({ id: a.id, person: a.person, offer: a.offer.id, at: a.at })),
            delivered: [...done].map(([person, x]) => ({
              person,
              id: x.activity.id,
              status: x.outcome.status,
            })),
          },
        };
        return this.input('action.resolved', v, r.boundaryAt);
      });
      const accepted = need(step(this.run, { until: Math.max(until, this.at), inputs: receipt }));
      this.active = work;
      this.delivered = done;
      this.revision = rev;
      result = accepted;
    }
    throw Error('The person engine did not make progress; the current watch is retained.');
  }
}
export function watchOpenings() {
  return ids.map((id, i) => {
    const cast = canonicalCast(castIds[i]!);
    const a = authoredPerson(
      id,
      cast.name,
      id === 'dai' || id === 'callum' || id === 'bilal' ? 'male' : 'female',
    );
    a.identity.castId = cast.castId;
    a.biography = [
      {
        id: 'e0',
        at: 900 * MINUTE,
        kind: 'opening-context',
        valence: 0,
        salience: 0.5,
        summary: `${cast.work} ${cast.introduction}`,
        tags: ['opening'],
        basis: { kind: 'authored', author: 'glance' },
        provenance: [cast.castId, cast.revision],
      },
    ];
    a.identity.birthAt = 900 * MINUTE - cast.age * 365 * 86400000;
    a.state.traits = structuredClone(cast.traits);
    a.state.values = structuredClone(cast.values);
    a.state.voices = [{ voiceId: 'engineer', trust: id === 'dai' ? 0.45 : id === 'callum' ? 0.75 : 0.5 }];
    a.state.review.atMsOfDay = 7 * 60 * MINUTE;
    a.state.review.style = id === 'callum' ? 'ruminating' : 'accounting';
    if (id === 'dai')
      a.state.habits = [
        { cue: { placeId: 'dam' }, action: 'level', strength: 0.55, repetitions: 9000, lastAt: 900 * MINUTE },
      ];
    if (id === 'dai' || id === 'callum') {
      a.state.body.sleepDebtHours = id === 'dai' ? 8 : 4;
      a.state.body.fitness = id === 'dai' ? 0.55 : 0.75;
      a.state.skills = [
        { id: 'gate', level: id === 'dai' ? 0.9 : 0.4, practicedMs: 0, lastPracticed: 900 * MINUTE },
        { id: 'gauges', level: id === 'dai' ? 0.9 : 0.5, practicedMs: 0, lastPracticed: 900 * MINUTE },
      ] as PersonAuthoring['state']['skills'];
      a.state.agenda.commitments = [
        {
          id: `watch:${id}`,
          kind: 'abstain',
          toId: 'engineer',
          label: 'my watch',
          actions: [],
          violatedBy: ['sleep'],
          from: 1320 * MINUTE,
          until: 1770 * MINUTE,
          importance: 0.5,
          recurEveryMs: 86400000,
        },
      ];
    }
    return a;
  });
}
export function openWatch(seed: number, initial: Record<string, PersonAuthoring> = {}) {
  // The engineer is the existing external voice and watch counterparty, not an actor.
  // Incoming duties can name that same identity; ordinary fresh runs keep their exact world.
  const facts: RunSpec['world']['facts'] = Object.keys(initial).length
    ? [
        {
          id: 'glance:engineer-role',
          subject: 'engineer',
          predicate: 'role',
          value: 'night-desk-engineer',
          at: 900 * MINUTE,
          provenance: { source: 'glance', evidenceId: 'author:engineer' },
        },
      ]
    : [];
  const c = new Watch(seed, 900 * MINUTE, facts);
  for (const fresh of watchOpenings()) {
    const a = initial[fresh.id] ?? fresh;
    need(createPerson(c.run, a));
    c.authors.push(structuredClone(a));
    c.people.push(c.view(a.id));
  }
  return c;
}
export function watch(p: Person) {
  const c = links.get(p);
  if (!c) throw Error('Detached person inspection');
  return c;
}
export function archiveWatch(p: Person): WatchArchive {
  const c = watch(p);
  return {
    format: 'glance-hf4/1',
    run: exportRun(c.run),
    sequence: c.sequence,
    revision: c.revision,
    offers: structuredClone([...c.offers]),
    offerRevisions: [...c.offerRevisions],
    requestedAdvice: structuredClone([...c.requestedAdvice]),
    active: structuredClone(c.active),
    decisions: structuredClone([...c.decisions]),
    outcomes: structuredClone([...c.outcomes]),
    delivered: structuredClone([...c.delivered]),
    ...(c.pending ? { pending: structuredClone(c.pending) } : {}),
    target: c.target,
    reviewLines: [...c.reviewLines],
  };
}
/** Export the complete accepted journal for an atomic local save. */
export function journalWatch(p: Person) {
  const { opening, chunk, head } = need(exportRunJournal(watch(p).run));
  if (!opening) throw Error('Missing journal opening.');
  return { opening, chunks: chunk ? [chunk] : [], head };
}
export function restoreWatch(a: WatchArchive) {
  if (
    a.format !== 'glance-hf4/1' ||
    a.run?.engine.package !== `@adam0white/human-framework@${FRAMEWORK_VERSION}`
  )
    throw Error('This saved watch uses the older person engine. Keep the file; start a new watch.');
  const c = Object.create(Watch.prototype) as Watch;
  c.run = need(restoreRun(a.run));
  c.at = a.run.current.at;
  c.authors = structuredClone(a.run.initial.people) as PersonAuthoring[];
  c.sequence = a.sequence;
  c.revision = a.revision;
  c.offers = new Map(structuredClone(a.offers));
  c.offerRevisions = new Map(structuredClone(a.offerRevisions));
  c.requestedAdvice = new Map(structuredClone(a.requestedAdvice));
  c.active = structuredClone(a.active);
  c.decisions = new Map(structuredClone(a.decisions));
  c.reviewLines = new Map(structuredClone(a.reviewLines));
  c.outcomes = new Map(structuredClone(a.outcomes));
  c.delivered = new Map(structuredClone(a.delivered));
  c.pending = structuredClone(a.pending);
  c.target = a.target;
  c.starting = new Map();
  c.deciding = new Set();
  c.people = ids.map((id) => c.view(id));
  return c;
}
export function verifyWatch(p: Person) {
  return need(replay(archiveWatch(p).run));
}
export function readPerson(p: Person): { body: BodyReadout } {
  const detached = displayBody(p);
  if (detached) return { body: detached };
  return { body: watch(p).part(p.id, 'body').readout };
}
export function readDoze(p: Person) {
  // Intentional sleep is not involuntary doze. The public body inspection
  // retains its own doze boundary; scene sleep has separate physical semantics.
  return p.body.asleep && p.body.doze?.since !== undefined ? { asleep: true } : null;
}
export function tick(p: Person, minute: number) {
  const c = watch(p);
  const at = Math.max(c.at, Math.round(minute * MINUTE));
  if (at > c.at) c.serve(at);
}
function inputsFor(
  c: Watch,
  p: Person,
  aa: readonly Affordance[],
  suggestion: Suggestion | undefined,
  at: number,
): Input[] {
  const offers: Offer[] = aa.map((a) => ({
    id: a.id,
    actionId: actions.includes(a.action)
      ? a.action
      : a.action.startsWith('rota-')
        ? 'rota'
        : a.action.startsWith('family-')
          ? 'family'
          : a.action.startsWith('shift-')
            ? 'shift'
            : a.action.startsWith('private-')
              ? 'private'
              : a.action,
    label: a.label,
    person: p.id,
    durationMs: Math.round(a.duration * MINUTE),
    ...(a.targetId ? { target: a.targetId } : {}),
    ...((a.placeId ?? (['level', 'weir', 'gate', 'clear', 'stove', 'nap'].includes(a.id) ? 'dam' : undefined))
      ? { place: a.placeId ?? 'dam' }
      : {}),
    participants: a.with ?? [],
    alongside: [],
    demands: {
      effort: a.effort ?? 0,
      focus: a.focus ?? 0,
      mode: a.mode ?? 'awake',
      requires: a.requires ?? {},
      ...(a.skill
        ? {
            skill: {
              ...a.skill,
              domain: a.skill.id === 'gate' ? ('motor' as const) : ('knowledge' as const),
            },
          }
        : {}),
    },
    tags: a.tags ?? [],
    norms: a.norms ?? [],
    expected: {
      needs: a.advertises ?? {},
      ...(a.material !== undefined ? { material: a.material } : {}),
      followedBy: (a.followedBy ?? []).map((x) => ({
        label: x.label,
        durationMs: Math.round(x.duration * MINUTE),
        effort: x.effort,
      })),
      ...(a.forecastAt ? { forecastAt: a.forecastAt } : {}),
      provenance: ['glance:authored-offer'],
    },
    fulfills: [],
    advances: [],
    diminishes: [],
  }));
  c.offers.set(p.id, offers);
  const revision = ++c.sequence;
  c.offerRevisions.set(p.id, revision);
  const result = [c.input('offers.received', { person: p.id, revision, offers }, at)];
  if (!suggestion) c.requestedAdvice.delete(p.id);
  if (suggestion) {
    const received: SuggestionData = {
      ...suggestion,
      action:
        offers.find((a) => a.id === suggestion.affordanceId)?.actionId ??
        offers.find((a) => a.actionId === suggestion.action)?.actionId ??
        offers[0]!.actionId,
      adviceId: `advice:${revision}`,
    };
    c.requestedAdvice.set(p.id, received);
    result.push(
      c.input(
        'suggestion.received',
        { person: p.id, received: { kind: 'ordinary', suggestion: received } },
        at,
      ),
    );
    if (suggestion.insist)
      result.push(
        c.input(
          'coercion.received',
          {
            person: p.id,
            voiceId: suggestion.voiceId,
            orderId: `order:${revision}`,
            offerId: suggestion.affordanceId ?? aa[0]!.id,
            repeat: true,
          },
          at,
        ),
      );
  }
  result.push(
    c.input(
      'decision.requested',
      {
        person: p.id,
        reason: 'The keeper considers the actual public request.',
        treatment: 'ordinary',
        offerRevision: revision,
      },
      at,
    ),
  );
  return result;
}
export function decideTogether(
  choices: readonly {
    person: Person;
    affordances: readonly Affordance[];
    options?: { suggestion?: Suggestion };
  }[],
) {
  const c = watch(choices[0]!.person);
  const previous = choices.map((x) => c.decisions.get(x.person.id)?.id);
  const at = c.at + 1;
  const batch = choices.flatMap((x) => inputsFor(c, x.person, x.affordances, x.options?.suggestion, at));
  for (const x of choices) c.deciding.add(x.person.id);
  try {
    c.serve(at, batch);
  } finally {
    c.deciding.clear();
  }
  return choices.map((x, i) => {
    const d = c.decisions.get(x.person.id);
    if (!d || d.id === previous[i])
      throw Error('No new HF decision: a physical world request is still pending.');
    return d;
  });
}
export function decide(
  p: Person,
  a: readonly Affordance[],
  o: { now?: number; suggestion?: Suggestion } = {},
) {
  return decideTogether([{ person: p, affordances: a, options: o }])[0]!;
}
/** SCOPE: switching from active work requires HF's interrupt receipt, then a
 * second real decision. The original public assent is retained in the input log;
 * a later contrary choice is rejected as a conditional start, never overwritten. */
export function beginTogether(pp: readonly Person[]) {
  if (!pp.length) return;
  const c = watch(pp[0]!);
  for (const p of pp) {
    const selected = c.decisions.get(p.id)?.chosenAffordanceId;
    if (selected)
      c.starting.set(p.id, {
        offer: selected,
        assent: c.decisions.get(p.id)?.suggestion?.verdict === 'assented',
      });
  }
  try {
    const at = c.at + 1;
    const requests = pp
      .filter(
        (p) =>
          !c.active.some((a) => a.person === p.id) &&
          !(
            c.pending?.boundary.type === 'world-required' &&
            c.pending.boundary.requests.some(
              (r) => r.kind === 'action' && r.person === p.id && r.stage === 'start',
            )
          ),
      )
      .flatMap((p) => {
        const suggestion = c.requestedAdvice.get(p.id);
        // The desk's existing request is still current after the old work stops.
        // Re-deliver that exact request; HF must choose and assent again. No
        // authored verdict, coerced participation or host trust/skill reward.
        return [
          ...(suggestion
            ? [
                c.input(
                  'suggestion.received',
                  { person: p.id, received: { kind: 'ordinary', suggestion } },
                  at,
                ),
              ]
            : []),
          c.input(
            'decision.requested',
            {
              person: p.id,
              reason: 'Consider the current request after the prior work actually stopped.',
              treatment: 'ordinary',
              offerRevision: c.offerRevisions.get(p.id)!,
            },
            at,
          ),
        ];
      });
    c.serve(requests.length ? at : c.at, requests);
  } finally {
    c.starting.clear();
  }
}
export function begin(p: Person, a: Affordance, r: DecisionRecord) {
  if (r.chosenAffordanceId !== a.id || watch(p).decisions.get(p.id)?.chosenAffordanceId !== a.id) return null;
  beginTogether([p]);
  return p.activity?.affordanceId === a.id ? p.activity : null;
}
export function finish(p: Person, o: Outcome) {
  const c = watch(p);
  const done = c.delivered.get(p.id);
  if (done) {
    c.delivered.delete(p.id);
    c.outcomes.delete(done.activity.id);
    return done.outcome;
  }
  const a = c.active.find((a) => a.person === p.id);
  if (!a) return undefined;
  c.outcomes.set(a.id, o);
  if (o.status === 'interrupted')
    c.serve(c.at + 1, [
      c.input('activity.interrupted', {
        person: p.id,
        activityId: a.id,
        reason: o.summary ?? 'Actual host interruption',
      }),
    ]);
  else {
    const end = a.at + a.offer.durationMs;
    // A source minute contains the serialized millisecond boundary. An early
    // request cannot complete work in a later source minute.
    if (Math.floor(end / MINUTE) > o.at) return undefined;
    c.serve(Math.max(c.at, end, Math.round(o.at * MINUTE)));
  }
  const receipt = c.delivered.get(p.id);
  if (!receipt) return undefined;
  c.delivered.delete(p.id);
  c.outcomes.delete(a.id);
  return receipt.outcome;
}
export function interrupt(p: Person, at: number, _source: string) {
  return finish(p, {
    action: p.activity?.action ?? 'wait',
    at,
    status: 'interrupted',
    summary: 'The actual desk call interrupted the activity.',
  });
}
export function reviewed(p: Person) {
  const c = watch(p);
  c.serve(c.at + 1, [
    c.input('review.requested', { person: p.id, reason: 'The keeper reviews the completed work.' }),
  ]);
}
export function reviewLine(p: Person, _opts?: unknown) {
  return watch(p).reviewLines.get(p.id) ?? '';
}
export function perceive(p: Person, percepts: readonly Percept[]) {
  const c = watch(p),
    at = c.at + 1;
  const r = c.serve(at, [
    c.input(
      'observation.received',
      {
        person: p.id,
        evidenceId: `observation:${c.sequence + 1}`,
        percepts: percepts.map((x, i) => ({
          id: `percept:${c.sequence}:${i}`,
          occurredAt: Math.min(at, Math.round(x.at * MINUTE)),
          channel: x.channel,
          kind: x.kind,
          salience: x.salience,
          summary: x.summary,
          ...(x.targetId ? { targetId: x.targetId } : {}),
          ...(x.near !== undefined ? { near: x.near } : {}),
          claims: x.claims ?? [],
          norms: x.norms ?? [],
          advice: x.advice ?? [],
          consequences: [],
          withdrawConsequences: [],
          witnesses: [],
          reports: [],
          provenance: [],
        })),
      },
      at,
    ),
  ]);
  return percepts.filter((x) =>
    r.events.some((e) => e.data.kind === 'observation-attended' && e.data.summary === x.summary),
  );
}
export function setDozeContext(
  p: Person,
  context: { posture: 'upright' | 'seated' | 'reclined'; stimulation: number },
) {
  const c = watch(p);
  c.serve(c.at + 1, [
    c.input('ambient.received', {
      person: p.id,
      evidenceId: `environment:${c.sequence + 1}`,
      environment: {
        contextId: `place:${p.id}`,
        readings: {},
        dozeContext: context,
        basis: { kind: 'received', evidenceId: `host-environment:${c.sequence}`, at: c.at + 1 },
      },
    }),
  ]);
}
export function estimateQuantity(p: Person, x: { truth: number; difficulty: number }) {
  const c = watch(p);
  const r = c.serve(c.at + 1, [
    c.input('quantity.observed', {
      person: p.id,
      evidenceId: `quantity:${c.sequence + 1}`,
      truth: x.truth,
      difficulty: x.difficulty,
    }),
  ]);
  const e = r.events.find((e) => e.data.kind === 'quantity-estimated');
  if (e?.data.kind !== 'quantity-estimated')
    throw Error(
      'No quantity observation: ' +
        JSON.stringify({
          at: c.at,
          pending: c.pending?.boundary,
          asleep: p.body.asleep,
          events: r.events.map((e) => e.data.kind),
        }),
    );
  return { value: e.data.value, confidence: e.data.confidence };
}
export function injure(p: Person, injury: { part: string; severity: number; healRatePerDay: number }) {
  const c = watch(p);
  c.serve(c.at + 1, [
    c.input('body.received', {
      person: p.id,
      evidenceId: `incident:${c.sequence + 1}`,
      receipt: { type: 'injured', injury },
    }),
  ]);
}
export function predict(p: Person, affordances: readonly Affordance[], suggestion?: Suggestion) {
  // Public person-perspective preview does not admit hypothetical host coercion.
  // Do not replace it with an omniscient host preview or a made-up answer.
  // The real held request still delivers coercion through ordinary decide().
  if (suggestion?.insist) return undefined;
  const detached = displayForecast(p, 'decision', { affordances, suggestion });
  if (detached) return detached.value as SuggestionResolution | undefined;
  const c = watch(p);
  const savedSequence = c.sequence,
    savedOffers = c.offers,
    savedRevisions = c.offerRevisions,
    savedAdvice = c.requestedAdvice;
  const offers = new Map(c.offers);
  c.offers = offers;
  c.offerRevisions = new Map(c.offerRevisions);
  c.requestedAdvice = new Map(c.requestedAdvice);
  let inputs: Input[];
  try {
    inputs = inputsFor(c, p, affordances, suggestion, c.at + 1);
  } finally {
    c.sequence = savedSequence;
    c.offers = savedOffers;
    c.offerRevisions = savedRevisions;
    c.requestedAdvice = savedAdvice;
  }
  const r = need(
    preview(c.run, {
      perspective: { kind: 'person', observer: p.id },
      person: p.id,
      until: c.at + 1,
      inputs,
    }),
  );
  const d = r.possibilities.find((e) => e.data.kind === 'decision');
  if (d?.data.kind !== 'decision') throw Error('No hypothetical decision');
  const rec = d.data.decision as DecisionRecord;
  const reply = r.possibilities.find((e) => e.data.kind === 'suggestion-resolved');
  return {
    ...rec.suggestion,
    says: (reply ?? d).narration.map((n) => n.text).join(' '),
    verdict: rec.suggestion?.verdict ?? 'refused',
  } as NonNullable<DecisionRecord['suggestion']>;
}
export function forecastThresholds(a: Affordance) {
  return a.forecastAt ?? { comfortAt: 0.8, spentAt: 0.97 };
}
export function bodyForecast(p: Person, a: Affordance) {
  const detached = displayForecast(p, 'body', a);
  if (detached)
    return (
      (detached.value as
        | NonNullable<import('@adam0white/human-framework').PreviewResult['bodyForecast']>
        | undefined) ?? { spans: [] }
    );
  const c = watch(p);
  return (
    need(
      preview(c.run, {
        perspective: { kind: 'person', observer: p.id },
        person: p.id,
        until: c.at,
        inputs: [],
        bodyForecast: [
          {
            label: a.label,
            durationMs: Math.round(a.duration * MINUTE),
            load: { effort: a.effort ?? 0, focus: a.focus ?? 0, mode: a.mode ?? 'awake' },
          },
        ],
      }),
    ).bodyForecast ?? { spans: [] }
  );
}
