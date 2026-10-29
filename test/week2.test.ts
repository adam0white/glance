import { expect, it } from 'vitest';
import { EXTENDED_PLANS, FOLLOWUP_PLANS } from '../src/sim/dam.ts';
import { required } from './required.ts';

// The narrative revision must not ease the storm or change staff, routes or event timings.
it('adds a received-information beat to each later watch while keeping the previous physical plans', () => {
  expect(FOLLOWUP_PLANS).toHaveLength(12);
  for (let night = 6; night <= 12; night++) {
    const old = required(EXTENDED_PLANS[night - 1]);
    const next = required(FOLLOWUP_PLANS[night - 1]);
    expect(old?.beats).toEqual([]);
    expect(next?.beats.length).toBeGreaterThan(0);
    const { beats: _oldBeats, intro: _oldIntro, ...oldWorld } = old;
    const { beats: _newBeats, intro: _newIntro, ...newWorld } = next;
    expect(newWorld).toEqual(oldWorld);
    expect(next?.beats.every((b) => b.at > 0 && b.at < 480)).toBe(true);
  }
});
