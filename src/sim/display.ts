/** SCOPE: read-only inspections from the worker that owns the Run. These are
 * display evidence, never people that can act or passports that can publish. */

import type { Affordance, BodyReadout, Person, Suggestion, SuggestionResolution } from './actor-view.ts';
import type { Export, GameState, NewInput } from './dam.ts';
export type ForecastKind = 'decision' | 'body';
export type InspectionPacket = {
  full: Export;
  host: Omit<GameState, 'people'>;
  people: Person[];
  bodies: BodyReadout[];
};
export type DisplayOwner = {
  preview: (person: string, kind: ForecastKind, payload: unknown) => unknown;
  mutate: (request: { input?: NewInput; minutes?: number }) => Promise<void>;
  practice: (turns: number) => Promise<any>;
  dispose: () => void;
};
const states = new WeakMap<GameState, { packet: InspectionPacket; owner: DisplayOwner }>();
const actors = new WeakMap<Person, { packet: InspectionPacket; owner: DisplayOwner; index: number }>();
export function freezeInspection<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeInspection(child);
    Object.freeze(value);
  }
  return value;
}
export function displayState(packet: InspectionPacket, owner: DisplayOwner, held?: GameState): GameState {
  const state = held ?? ({} as GameState);
  for (const key of Object.keys(state))
    if (!(key in packet.host) && key !== 'people') Reflect.deleteProperty(state, key);
  freezeInspection(packet.bodies);
  freezeInspection(packet.host);
  Object.assign(state, packet.host, {
    people: packet.people.map((p, index) => {
      const actor = freezeInspection(p);
      actors.set(actor, { packet, owner, index });
      return actor;
    }),
  });
  states.set(state, { packet, owner });
  return state;
}
export const displayArchive = (state: GameState) => states.get(state)?.packet.full.state;
export const displayOwner = (state: GameState) => states.get(state)?.owner;
export const displayBody = (person: Person) => {
  const d = actors.get(person);
  return d?.packet.bodies[d.index];
};
export function displayForecast(
  person: Person,
  kind: ForecastKind,
  payload: unknown,
): { remote: true; value: unknown } | undefined {
  const d = actors.get(person);
  return d ? { remote: true, value: d.owner.preview(person.id, kind, payload) } : undefined;
}
