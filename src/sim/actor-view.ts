/** Immutable public inspection shapes, in display minutes. These are not mutable HF people. */
import type {
  ObservedOutcome,
  Offer,
  PerceptData,
  PersonAuthoring,
  PersonView,
  RunArchive,
} from '@adam0white/human-framework';

type Actor = RunArchive['current']['people'][string];
type Decision = Extract<RunArchive['current']['events'][number]['data'], { kind: 'decision' }>['decision'];
export type DecisionRecord = Decision & {
  narration: string;
  suggestion?: NonNullable<Decision['suggestion']> & { says: string };
};
export type Suggestion = {
  voiceId: string;
  action?: string;
  affordanceId?: string;
  strength: number;
  insist?: boolean;
};
export type SuggestionResolution = NonNullable<DecisionRecord['suggestion']>;
export type Affordance = {
  id: string;
  action: string;
  label: string;
  duration: number;
  effort?: number;
  focus?: number;
  mode?: 'awake' | 'sleep';
  requires?: Offer['demands']['requires'];
  advertises?: Offer['expected']['needs'];
  material?: number;
  targetId?: string;
  placeId?: string;
  with?: string[];
  tags?: string[];
  norms?: Offer['norms'];
  forecastAt?: Offer['expected']['forecastAt'];
  skill?: { id: string; difficulty: number };
  difficulty?: number;
  followedBy?: { label: string; duration: number; effort: number }[];
};
export type Activity = Readonly<{
  id: string;
  affordanceId: string;
  action: string;
  targetId?: string;
  startedAt: number;
  endsAt: number;
  reviewAt: number;
  effort: number;
  mode: 'awake' | 'sleep';
  protest: boolean;
  dozedAt?: number;
}>;
export type BodyReadout = Extract<
  Extract<PersonView, { kind: 'host' }>['parts'][number],
  { select: 'body' }
>['value']['readout'];
type HostPart = Extract<PersonView, { kind: 'host' }>['parts'][number];
type ReadingParts = { [P in HostPart as P['select']]: P['value'] };
export type Person = Readonly<{
  id: string;
  name: string;
  readings: Readonly<Pick<ReadingParts, 'condition' | 'affect' | 'expectations' | 'needs'>>;
  engine: string;
  schema: string;
  now: number;
  life: Readonly<{ bornAt: number }>;
  body: Readonly<Actor['body']>;
  traits: Readonly<Actor['traits']>;
  skills: Readonly<Actor['skills']>;
  agenda: Readonly<Actor['agenda']>;
  will: Readonly<Actor['will']>;
  review: Readonly<Actor['review']>;
  activity: Activity | null;
  trace: readonly DecisionRecord[];
}>;
export type PersonSpec = {
  id: string;
  name: string;
  seed: number;
  now?: number;
  bornAt?: number;
  sex?: 'female' | 'male';
  traits?: Partial<PersonAuthoring['state']['traits']>;
  values?: Partial<PersonAuthoring['state']['values']>;
  body?: { sleepDebt?: number; fitness?: number };
  voices?: PersonAuthoring['state']['voices'];
  skills?: Record<string, number>;
};
export type Outcome = {
  affordanceId?: string;
  action: string;
  targetId?: string;
  at: number;
  status: ObservedOutcome['status'];
  summary?: string;
  quality?: number;
  actual?: Record<string, number>;
  needs?: Offer['expected']['needs'];
  material?: number;
};
export type Percept = Partial<Omit<PerceptData, 'occurredAt'>> & {
  at: number;
  channel: PerceptData['channel'];
  kind: string;
  salience: number;
  summary: string;
};
