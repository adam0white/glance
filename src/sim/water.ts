/**
 * The water: world truth, pure and deterministic. Nothing here knows about people.
 *
 * Rain falls on the catchment, which drains into the reservoir through a linear store (about an hour's lag); the
 * wetter the ground, the more of the rain runs off, and the ground stays wet from one night to the next. The
 * reservoir releases through the gate (by its opening and the head of water above the sill) and, above the
 * overflow lip, over the fixed spillway, which nobody controls. Above the crest the dam overtops. Downstream,
 * the river at the town bridge rises with the release (routed through a second store, about forty minutes) and
 * with the town's own runoff.
 *
 * Units are engineering stand-ins tuned by `scripts/measure.ts`, not hydrology: levels in metres on the staff
 * gauge, flows in cumecs, the bridge in steps of the inn's river stairs.
 */
import { dexp } from './exp.ts';
import { DRAW, hashUnit } from './rng.ts';

export const SILL = 2.0;
export const LIP = 5.0;
export const CREST = 6.0;
export const TURNS = 6;
/** Bridge steps at which Mill Lane, then the square, take water. */
export const MILL_LANE = 4.5;
export const SQUARE = 5.4;

const BASE_FLOW = 1.2;
const CATCH = 2.6;
const TAU = 70;
const K = 0.00085;
const GATE_C = 2.3;
const SPILL_C = 14;
const COMP = 0.4;
const BRIDGE_T = 35;
const TOWN_T = 25;

export interface Water {
  /** Reservoir level on the staff gauge (m). */
  level: number;
  /** Catchment store (cumec-minutes, scaled). */
  store: number;
  /** Ground wetness 0..1, carried across nights. */
  wet: number;
  /** Release routed toward the bridge (cumecs). */
  routed: number;
  /** Town runoff store. */
  town: number;
  /** Gate opening in turns, 0..TURNS (true position). */
  gate: number;
  /** A tree on the trash screen chokes the gate. */
  blocked: boolean;
  overtopped: boolean;
}

export interface Storm {
  /** Minutes after 22:00 of the main peak. */
  peakAt: number;
  /** Peak rain (mm/h). */
  peak: number;
  /** Width of the main burst (minutes, Gaussian sd). */
  width: number;
  /** Background rain (mm/h). */
  base: number;
  /** An optional second peak. */
  second?: { at: number; peak: number; width: number };
}

export function newWater(): Water {
  return { level: 4.1, store: 0, wet: 0.25, routed: 3, town: 0, gate: 0, blocked: false, overtopped: false };
}

/** Rain at the dam (mm/h) in minute `m` after 22:00: the night's storm shape times a keyed burst per 10 minutes. */
export function rainAt(seed: number, night: number, m: number, st: Storm): number {
  const g = (at: number, w: number) => dexp(-(((m - at) / w) ** 2) / 2);
  let r = st.base + st.peak * g(st.peakAt, st.width);
  if (st.second) r += st.second.peak * g(st.second.at, st.second.width);
  const block = Math.floor(m / 10);
  const burst = 0.6 + 0.9 * hashUnit(seed, DRAW.rain, night, block);
  return Math.max(0, r * burst);
}

export const inflowOf = (w: Water) => BASE_FLOW + w.store / TAU;

export function gateFlow(w: Water): number {
  const head = Math.max(0, w.level - SILL);
  return GATE_C * w.gate * Math.sqrt(head) * (w.blocked ? 0.45 : 1);
}

export const spillFlow = (w: Water) => (w.level > LIP ? SPILL_C * (w.level - LIP) ** 1.5 : 0);
export const releaseOf = (w: Water) => COMP + gateFlow(w) + spillFlow(w);

/** River at the bridge, in steps of the inn's stairs. */
export const bridgeOf = (w: Water) => 0.5 + 0.17 * w.routed + w.town;

/** Weir head (m) for an inflow: what a keeper reads on the weir board upstream. */
export const weirOf = (q: number) => Math.round((q / 9) ** (2 / 3) * 1000) / 1000;

/** One minute of water. */
export function stepWater(w: Water, rain: number): void {
  const rc = 0.3 + 0.55 * w.wet;
  w.store += rc * rain * CATCH - w.store / TAU;
  w.wet = Math.min(1, w.wet + rain * 0.00012);
  const qin = inflowOf(w);
  const qout = releaseOf(w);
  w.level += (qin - qout) * K;
  if (w.level < SILL) w.level = SILL;
  if (w.level >= CREST) w.overtopped = true;
  w.routed += (qout - w.routed) / BRIDGE_T;
  w.town += (rain * 0.035 - w.town) / TOWN_T;
}

/**
 * The day between nights, handed over by the day keeper: the ground drains a little, the catchment empties toward
 * base flow, the river settles, and he leaves the reservoir as high as the wet ground let him (fuller each night
 * of a wet week) with the gate on one turn.
 */
export function dayWater(w: Water, dryHours: number): void {
  w.wet = Math.max(0.15, w.wet - 0.012 * dryHours);
  w.store *= dexp((-dryHours * 60) / TAU);
  w.level = Math.max(SILL, Math.min(w.level, 3.9 + 0.7 * w.wet));
  w.gate = 1;
  w.blocked = false;
  w.routed = releaseOf(w);
  w.town = 0;
}
